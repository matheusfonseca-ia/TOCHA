import { beforeEach, describe, expect, it } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount, makeOpenConversation, row } from "@/lib/sequences/__tests__/fixtures";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { IgAccount } from "@/types/database";

import { ensureDefaultPipeline, firstOpenStage } from "../ensure-default-pipeline";
import { enrollExistingConversations, enrollLeadFromCapture } from "../enroll-lead";
import { moveLead } from "../move-lead";

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

    const enrolled = await enrollExistingConversations(admin, account.id);

    expect(enrolled).toBe(1);
    expect(fake.tables.leads).toHaveLength(2);
    expect(fake.tables.leads.some((l) => l.conversation_id === pending.id)).toBe(true);
  });
});
