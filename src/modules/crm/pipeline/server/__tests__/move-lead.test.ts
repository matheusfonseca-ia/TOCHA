import { beforeEach, describe, expect, it, onTestFinished } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount, makeOpenConversation, row } from "@/lib/sequences/__tests__/fixtures";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IgAccount } from "@/types/database";

import { ensureDefaultPipeline, firstOpenStage } from "../ensure-default-pipeline";
import { ENROLL_PAGE, enrollExistingConversations, enrollLeadFromCapture } from "../enroll-lead";
import { closingFields, moveLead } from "../move-lead";

/**
 * Integração do Funil (Fase 5/6): funil padrão, mover/criar lead e a entrada
 * automática de conversas existentes, tudo contra o fake do Supabase.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

let fake: FakeSupabase;
let admin: AdminClient;
let account: IgAccount;

beforeEach(() => {
  fake = createFakeAdmin();
  admin = fake.client as unknown as AdminClient;
  account = makeAccount();
  fake.tables.ig_accounts.push(account);
});

describe("ensureDefaultPipeline", () => {
  it("cria o funil padrão com as 5 etapas na 1ª chamada", async () => {
    const pipeline = await ensureDefaultPipeline(admin, account.id);
    expect(pipeline.is_default).toBe(true);
    expect(pipeline.auto_enroll).toBe(true);

    const stages = fake.tables.pipeline_stages.filter((s) => s.pipeline_id === pipeline.id);
    expect(stages.map((s) => s.name)).toEqual(["Novos", "Em conversa", "Negociando", "Ganho", "Perdido"]);
    expect(stages.map((s) => s.stage_type)).toEqual(["open", "open", "open", "won", "lost"]);
  });

  it("é idempotente: 2ª chamada devolve o mesmo funil, sem duplicar etapas", async () => {
    const first = await ensureDefaultPipeline(admin, account.id);
    const second = await ensureDefaultPipeline(admin, account.id);
    expect(second.id).toBe(first.id);
    expect(fake.tables.pipelines).toHaveLength(1);
    expect(fake.tables.pipeline_stages).toHaveLength(5);
  });

  it("firstOpenStage pega a etapa aberta de menor posição", async () => {
    const pipeline = await ensureDefaultPipeline(admin, account.id);
    const stage = await firstOpenStage(admin, pipeline.id);
    expect(stage?.name).toBe("Novos");
  });
});

describe("moveLead", () => {
  it("cria o lead quando a conversa ainda não está em nenhuma etapa aberta", async () => {
    const pipeline = await ensureDefaultPipeline(admin, account.id);
    const stage = await firstOpenStage(admin, pipeline.id);
    const conversation = makeOpenConversation(account.id, "lead-1");
    fake.tables.conversations.push(conversation);

    const result = await moveLead(admin, {
      accountId: account.id,
      toStageId: stage!.id,
      source: "system",
      conversationId: conversation.id,
      igSenderId: "lead-1",
    });

    expect(result.changed).toBe(true);
    expect(fake.tables.leads).toHaveLength(1);
    expect(fake.tables.leads[0]).toMatchObject({ stage_id: stage!.id, conversation_id: conversation.id });
    expect(fake.tables.lead_stage_events).toHaveLength(1);
    expect(fake.tables.lead_stage_events[0]).toMatchObject({ from_stage_id: null, to_stage_id: stage!.id, source: "system" });
  });

  it("mover para outra etapa grava o histórico e fecha o lead quando é ganho/perdido", async () => {
    const pipeline = await ensureDefaultPipeline(admin, account.id);
    const stages = fake.tables.pipeline_stages.filter((s) => s.pipeline_id === pipeline.id);
    const novos = stages.find((s) => s.name === "Novos")!;
    const ganho = stages.find((s) => s.name === "Ganho")!;
    const conversation = makeOpenConversation(account.id, "lead-2");
    fake.tables.conversations.push(conversation);

    const created = await moveLead(admin, {
      accountId: account.id,
      toStageId: novos.id,
      source: "system",
      conversationId: conversation.id,
      igSenderId: "lead-2",
    });

    const moved = await moveLead(admin, {
      accountId: account.id,
      toStageId: ganho.id,
      source: "manual",
      leadId: created.lead.id,
    });

    expect(moved.changed).toBe(true);
    expect(moved.lead.closed_at).toEqual(expect.any(String));
    expect(fake.tables.lead_stage_events).toHaveLength(2);
    expect(fake.tables.lead_stage_events[1]).toMatchObject({
      from_stage_id: novos.id,
      to_stage_id: ganho.id,
      source: "manual",
    });
  });

  it("já está na etapa: não muda, não grava evento (trava anti-loop)", async () => {
    const pipeline = await ensureDefaultPipeline(admin, account.id);
    const stage = await firstOpenStage(admin, pipeline.id);
    const conversation = makeOpenConversation(account.id, "lead-3");
    fake.tables.conversations.push(conversation);

    await moveLead(admin, {
      accountId: account.id,
      toStageId: stage!.id,
      source: "system",
      conversationId: conversation.id,
      igSenderId: "lead-3",
    });
    const again = await moveLead(admin, {
      accountId: account.id,
      toStageId: stage!.id,
      source: "automation",
      conversationId: conversation.id,
      igSenderId: "lead-3",
    });

    expect(again.changed).toBe(false);
    expect(fake.tables.lead_stage_events).toHaveLength(1);
  });

  it("reordenar dentro da mesma etapa atualiza a posição sem gerar evento", async () => {
    const pipeline = await ensureDefaultPipeline(admin, account.id);
    const stage = await firstOpenStage(admin, pipeline.id);
    const conversation = makeOpenConversation(account.id, "lead-4");
    fake.tables.conversations.push(conversation);
    const created = await moveLead(admin, {
      accountId: account.id,
      toStageId: stage!.id,
      source: "system",
      conversationId: conversation.id,
      igSenderId: "lead-4",
    });

    const reordered = await moveLead(admin, {
      accountId: account.id,
      toStageId: stage!.id,
      source: "manual",
      leadId: created.lead.id,
      position: 42,
    });

    expect(reordered.lead.position).toBe(42);
    expect(fake.tables.lead_stage_events).toHaveLength(1);
  });

  it("corrida na criação (23505) não duplica: devolve o lead que já existe", async () => {
    const pipeline = await ensureDefaultPipeline(admin, account.id);
    const stage = await firstOpenStage(admin, pipeline.id);
    const conversation = makeOpenConversation(account.id, "lead-5");
    fake.tables.conversations.push(conversation);
    // Simula que outra chamada já criou o lead aberto um instante antes.
    fake.tables.leads.push(
      row({
        pipeline_id: pipeline.id,
        account_id: account.id,
        conversation_id: conversation.id,
        ig_sender_id: "lead-5",
        stage_id: stage!.id,
        value: null,
        position: 1,
        entered_stage_at: new Date().toISOString(),
        closed_at: null,
        lost_reason: null,
      })
    );

    const result = await moveLead(admin, {
      accountId: account.id,
      toStageId: stage!.id,
      source: "system",
      conversationId: conversation.id,
      igSenderId: "lead-5",
    });

    expect(result.changed).toBe(false);
    expect(fake.tables.leads).toHaveLength(1);
  });
});

describe("enrollLeadFromCapture", () => {
  it("inscreve a conversa na 1ª etapa aberta do funil padrão", async () => {
    const conversation = makeOpenConversation(account.id, "lead-6");
    fake.tables.conversations.push(conversation);

    await enrollLeadFromCapture(admin, account.id, conversation.id, "lead-6");

    expect(fake.tables.leads).toHaveLength(1);
    const pipeline = fake.tables.pipelines[0];
    const novos = fake.tables.pipeline_stages.find((s) => s.pipeline_id === pipeline.id && s.name === "Novos");
    expect(fake.tables.leads[0].stage_id).toBe(novos!.id);
  });

  it("auto_enroll desligado: não cria lead", async () => {
    const pipeline = await ensureDefaultPipeline(admin, account.id);
    Object.assign(
      fake.tables.pipelines.find((p) => p.id === pipeline.id)!,
      { auto_enroll: false }
    );
    const conversation = makeOpenConversation(account.id, "lead-7");
    fake.tables.conversations.push(conversation);

    await enrollLeadFromCapture(admin, account.id, conversation.id, "lead-7");

    expect(fake.tables.leads).toHaveLength(0);
  });

  it("nunca lança mesmo com o banco fora do ar", async () => {
    const broken = { from: () => { throw new Error("banco fora"); } } as unknown as AdminClient;
    await expect(enrollLeadFromCapture(broken, account.id, "conv-x", "lead-8")).resolves.toBeUndefined();
  });
});

describe("enrollExistingConversations: botão 'Trazer conversas existentes'", () => {
  it("inscreve só as conversas sem lead aberto no funil padrão", async () => {
    const already = makeOpenConversation(account.id, "lead-9");
    const pending = makeOpenConversation(account.id, "lead-10");
    fake.tables.conversations.push(already, pending);

    const pipeline = await ensureDefaultPipeline(admin, account.id);
    const stage = await firstOpenStage(admin, pipeline.id);
    await moveLead(admin, {
      accountId: account.id,
      toStageId: stage!.id,
      source: "manual",
      conversationId: already.id,
      igSenderId: "lead-9",
    });

    const result = await enrollExistingConversations(admin, account.id);

    expect(result).toEqual({ enrolled: 1, nextCursor: null });
    expect(fake.tables.leads).toHaveLength(2);
    expect(fake.tables.leads.some((l) => l.conversation_id === pending.id)).toBe(true);
    // Lead criado em lote também ganha o histórico de entrada.
    const created = fake.tables.leads.find((l) => l.conversation_id === pending.id)!;
    expect(fake.tables.lead_stage_events.some((e) => e.lead_id === created.id && e.from_stage_id === null)).toBe(true);
  });

  it("pagina pelas conversas: devolve o cursor quando a página veio cheia", async () => {
    for (let i = 0; i < ENROLL_PAGE + 3; i++) {
      fake.tables.conversations.push(makeOpenConversation(account.id, `lead-p${String(i).padStart(4, "0")}`));
    }

    const first = await enrollExistingConversations(admin, account.id);
    expect(first.enrolled).toBe(ENROLL_PAGE);
    expect(first.nextCursor).not.toBeNull();

    const second = await enrollExistingConversations(admin, account.id, first.nextCursor);
    expect(second).toEqual({ enrolled: 3, nextCursor: null });
    expect(fake.tables.leads).toHaveLength(ENROLL_PAGE + 3);
    // Posições distintas e crescentes no fim da coluna.
    expect(new Set(fake.tables.leads.map((l) => l.position)).size).toBe(ENROLL_PAGE + 3);
  });
});

describe("lead ganho/perdido continua sendo o lead da conversa", () => {
  async function wonLead(senderId: string) {
    const pipeline = await ensureDefaultPipeline(admin, account.id);
    const stages = fake.tables.pipeline_stages.filter((s) => s.pipeline_id === pipeline.id);
    const conversation = makeOpenConversation(account.id, senderId);
    fake.tables.conversations.push(conversation);
    const created = await moveLead(admin, {
      accountId: account.id,
      toStageId: stages.find((s) => s.name === "Novos")!.id,
      source: "system",
      conversationId: conversation.id,
      igSenderId: senderId,
    });
    await moveLead(admin, {
      accountId: account.id,
      toStageId: stages.find((s) => s.name === "Ganho")!.id,
      source: "manual",
      leadId: created.lead.id,
    });
    return { pipeline, stages, conversation, leadId: created.lead.id };
  }

  it("nova DM de quem já foi ganho não abre outro card em Novos", async () => {
    const { conversation, stages } = await wonLead("lead-20");

    await enrollLeadFromCapture(admin, account.id, conversation.id, "lead-20");

    expect(fake.tables.leads).toHaveLength(1);
    expect(fake.tables.leads[0].stage_id).toBe(stages.find((s) => s.name === "Ganho")!.id);
  });

  it("'Trazer conversas existentes' pula conversa com lead fechado", async () => {
    await wonLead("lead-21");
    expect((await enrollExistingConversations(admin, account.id)).enrolled).toBe(0);
    expect(fake.tables.leads).toHaveLength(1);
  });

  it("workflow movendo para etapa aberta reabre o mesmo card", async () => {
    const { conversation, stages, leadId } = await wonLead("lead-22");

    const result = await moveLead(admin, {
      accountId: account.id,
      toStageId: stages.find((s) => s.name === "Em conversa")!.id,
      source: "automation",
      conversationId: conversation.id,
      igSenderId: "lead-22",
    });

    expect(result.lead.id).toBe(leadId);
    expect(result.lead.closed_at).toBeNull();
    expect(fake.tables.leads).toHaveLength(1);
  });

  it("recusa mover o card para etapa de outro funil", async () => {
    const { leadId } = await wonLead("lead-23");
    const other = row({ account_id: account.id, name: "Outro", is_default: false, auto_enroll: false });
    fake.tables.pipelines.push(other);
    const foreign = row({ pipeline_id: other.id, name: "X", position: 1, color: "#000", stage_type: "open" });
    fake.tables.pipeline_stages.push(foreign);

    await expect(
      moveLead(admin, { accountId: account.id, toStageId: foreign.id, source: "manual", leadId })
    ).rejects.toThrow(/outro funil/);
  });
});

describe("moveLead: reindexa a coluna quando as posições colam", () => {
  it("posição colada na vizinha reespaça a coluna inteira, mantendo a ordem", async () => {
    // O fake não tem `range` (com colunas pequenas só a 1ª página é lida) e
    // guarda só o último `order`; aqui vale o 1º (posição), como no Postgres.
    type Builder = { limit: (n: number) => Builder; order: (c: string, o?: object) => Builder; __ordered?: boolean };
    const proto = Object.getPrototypeOf(fake.from("leads")) as Builder & { range?: unknown };
    const originalOrder = proto.order;
    proto.range = function (this: Builder, from: number, to: number) {
      return this.limit(to - from + 1);
    };
    proto.order = function (this: Builder, column: string, opts?: object) {
      if (this.__ordered) return this;
      this.__ordered = true;
      return originalOrder.call(this, column, opts);
    };
    onTestFinished(() => {
      proto.order = originalOrder;
      delete proto.range;
    });

    const pipeline = await ensureDefaultPipeline(admin, account.id);
    const stage = (await firstOpenStage(admin, pipeline.id))!;
    const ids: string[] = [];
    for (const sender of ["lead-a", "lead-b", "lead-c"]) {
      const conversation = makeOpenConversation(account.id, sender);
      fake.tables.conversations.push(conversation);
      const created = await moveLead(admin, {
        accountId: account.id,
        toStageId: stage.id,
        source: "system",
        conversationId: conversation.id,
        igSenderId: sender,
      });
      ids.push(created.lead.id);
    }
    const a = fake.tables.leads.find((l) => l.id === ids[0])!;
    const b = fake.tables.leads.find((l) => l.id === ids[1])!;
    b.position = a.position + 1e-9;

    // Arrasta o C para entre A e B: a média fica a menos de MIN_GAP delas.
    await moveLead(admin, { accountId: account.id, toStageId: stage.id, source: "manual", leadId: ids[2], position: a.position + 5e-10 });

    const ordered = [...fake.tables.leads].sort((x, y) => x.position - y.position);
    expect(ordered.map((l) => l.id)).toEqual([ids[0], ids[2], ids[1]]);
    expect(ordered.map((l) => l.position)).toEqual([65536, 131072, 196608]);
  });
});

describe("closingFields", () => {
  it("fecha em ganho/perdido, reabre em aberta e preserva a data de quem já estava fechado", () => {
    expect(closingFields("open", "motivo", "2026-01-01")).toEqual({ closed_at: null, lost_reason: null });
    expect(closingFields("won", "motivo", "2026-01-01")).toEqual({ closed_at: "2026-01-01", lost_reason: null });
    expect(closingFields("lost", "caro", "2026-01-01")).toEqual({ closed_at: "2026-01-01", lost_reason: "caro" });
    expect(closingFields("won").closed_at).toEqual(expect.any(String));
  });
});
