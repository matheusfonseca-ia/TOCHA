import {
  loadContact,
  loadConversationUsername,
  saveContact,
  type ContactSnapshot,
} from "@/lib/contacts/repository";
import { evaluateCondition, normalize } from "@/lib/sequences/condition";
import { STORED_FIELD_VALUE_MAX } from "@/lib/sequences/fields";
import { hasTemplate, renderTemplate } from "@/lib/sequences/template";
import type { createAdminClient } from "@/lib/supabase/admin";
import type {
  ConditionNodeData,
  RunVariables,
  SequenceRun,
} from "@/types/sequence";

/**
 * Dados do contato durante uma execução do workflow: variáveis do run +
 * ficha em `contacts`. Carrega o contato só quando algum nó precisa (texto
 * com {{campo}}, condição, gravação), então fluxos sem nós de dados não
 * fazem nenhuma consulta a mais.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

const INTERNAL_PREFIX = "__";
// Retrato do contato mais novo que isto é reaproveitado na gravação.
const CONTACT_FRESH_MS = 1000;

export class FlowData {
  private contact: ContactSnapshot | null = null;
  private contactLoadedAt = 0;
  private conversationUsername: string | null | undefined;
  private stageIds: string[] | null = null;
  private readonly variables: RunVariables;

  constructor(
    private readonly admin: AdminClient,
    private readonly accountId: string,
    private readonly run: Pick<SequenceRun, "id" | "ig_sender_id" | "variables">,
    /** Último recurso para o @ (Graph API); só roda se contato e conversa não têm. */
    private readonly fetchUsername?: () => Promise<string | null>
  ) {
    this.variables = { ...(run.variables ?? {}) };
  }

  private async getContact(): Promise<ContactSnapshot> {
    if (!this.contact) await this.reloadContact();
    return this.contact!;
  }

  private async reloadContact(): Promise<void> {
    this.contact = await loadContact(this.admin, this.accountId, this.run.ig_sender_id);
    this.contactLoadedAt = Date.now();
  }

  private async getUsername(): Promise<string | null> {
    const contact = await this.getContact();
    if (contact.ig_username) return contact.ig_username;
    if (this.conversationUsername === undefined) {
      this.conversationUsername =
        (await loadConversationUsername(this.admin, this.accountId, this.run.ig_sender_id)) ??
        (this.fetchUsername ? await this.fetchUsername() : null);
    }
    return this.conversationUsername;
  }

  /** Campos do contato com as variáveis do run por cima (sem chaves internas). */
  private async values(): Promise<Record<string, unknown>> {
    const contact = await this.getContact();
    const values: Record<string, unknown> = { ...contact.fields };
    for (const [key, value] of Object.entries(this.variables)) {
      if (!key.startsWith(INTERNAL_PREFIX)) values[key] = value;
    }
    return values;
  }

  /** Aplica {{campo}} / {{username}}; texto sem "{{" não consulta nada. */
  async render(text: string): Promise<string> {
    if (!hasTemplate(text)) return text;
    const values = await this.values();
    const username = await this.getUsername();
    return renderTemplate(text, {
      ...values,
      username: username ?? values.username ?? "",
    });
  }

  /** Em sequência (não Promise.all): o 1º render carrega o contato para os demais. */
  async renderAll(texts: readonly string[]): Promise<string[]> {
    const out: string[] = [];
    for (const text of texts) out.push(await this.render(text));
    return out;
  }

  /**
   * Etapa atual do contato em cada funil (só a condição "Está na etapa" usa).
   * Conta lead fechado: "está na etapa Ganho" precisa dar verdadeiro. Por funil
   * vale o lead mais recente, como no moveLead.
   */
  private async getStageIds(): Promise<string[]> {
    if (this.stageIds) return this.stageIds;
    const { data } = await this.admin
      .from("leads")
      .select("stage_id, pipeline_id")
      .eq("account_id", this.accountId)
      .eq("ig_sender_id", this.run.ig_sender_id)
      .order("created_at", { ascending: false });
    const byPipeline = new Map<string, string>();
    for (const r of (data ?? []) as { stage_id: string; pipeline_id: string }[]) {
      if (!byPipeline.has(r.pipeline_id)) byPipeline.set(r.pipeline_id, r.stage_id);
    }
    this.stageIds = Array.from(byPipeline.values());
    return this.stageIds;
  }

  async evaluate(condition: ConditionNodeData): Promise<boolean> {
    const contact = await this.getContact();
    return evaluateCondition(condition, {
      fields: await this.values(),
      tags: contact.tags,
      stageIds: condition.operator === "inStage" ? await this.getStageIds() : undefined,
    });
  }

  /**
   * Ficha relida do banco logo antes de gravar: o retrato carregado no começo
   * da execução pode ter dezenas de segundos (pausas, Graph API) e gravar a
   * partir dele apagaria o que o painel ou outro fluxo mudou nesse meio
   * tempo. Ainda é ler-e-gravar (sem trava no banco), mas a janela de
   * corrida cai para uma ida ao banco.
   */
  private async freshContact(): Promise<ContactSnapshot> {
    if (!this.contact || Date.now() - this.contactLoadedAt > CONTACT_FRESH_MS) {
      await this.reloadContact();
    }
    return this.contact!;
  }

  /** Grava o campo no contato e nas variáveis do run. */
  async setField(key: string, rawValue: string): Promise<void> {
    const value = rawValue.slice(0, STORED_FIELD_VALUE_MAX);
    const username = await this.getUsername();
    const contact = await this.freshContact();
    this.contact = {
      ig_username: username,
      fields: { ...contact.fields, [key]: value },
      tags: contact.tags,
    };
    await saveContact(this.admin, this.accountId, this.run.ig_sender_id, this.contact);
    this.variables[key] = value;
    await this.saveVariables();
  }

  async setTag(tag: string, action: "add" | "remove"): Promise<void> {
    const username = await this.getUsername();
    const contact = await this.freshContact();
    const name = tag.trim();
    // Mesma regra do catálogo e da Condição: "Promoção" e "promocao" são a
    // mesma tag, então remover uma remove a outra e adicionar não duplica.
    const others = contact.tags.filter((t) => normalize(t) !== normalize(name));
    this.contact = {
      ig_username: username,
      fields: contact.fields,
      tags: action === "add" ? [...others, name] : others,
    };
    await saveContact(this.admin, this.accountId, this.run.ig_sender_id, this.contact);
  }

  attemptsAt(nodeId: string): number {
    return this.counterAt("__attempts", nodeId);
  }

  /** Grava o contador de respostas inválidas do nó (null zera). */
  async setAttempts(nodeId: string, attempts: number | null): Promise<void> {
    await this.setCounter("__attempts", nodeId, attempts);
  }

  /** Contador interno por nó (`__attempts`, `__retries`, `__followChecks`...). */
  counterAt(key: `__${string}`, nodeId: string): number {
    const bucket = this.variables[key];
    const value =
      bucket && typeof bucket === "object" ? (bucket as Record<string, unknown>)[nodeId] : undefined;
    return typeof value === "number" ? value : 0;
  }

  /** Grava o contador interno do nó (null zera). */
  async setCounter(key: `__${string}`, nodeId: string, value: number | null): Promise<void> {
    const bucket = this.variables[key];
    const current: Record<string, number> = {
      ...(bucket && typeof bucket === "object" ? (bucket as Record<string, number>) : {}),
    };
    if (value === null) {
      if (!(nodeId in current)) return;
      delete current[nodeId];
    } else {
      current[nodeId] = value;
    }
    this.variables[key] = current;
    await this.saveVariables();
  }

  /** Valor interno do run (chaves "__"), como gravado. */
  internal(key: `__${string}`): unknown {
    return this.variables[key];
  }

  /** Grava (ou apaga, com undefined) um valor interno do run. */
  async setInternal(key: `__${string}`, value: unknown): Promise<void> {
    if (value === undefined) {
      if (!(key in this.variables)) return;
      delete this.variables[key];
    } else {
      this.variables[key] = value;
    }
    await this.saveVariables();
  }

  private async saveVariables(): Promise<void> {
    const { error } = await this.admin
      .from("sequence_runs")
      .update({ variables: { ...this.variables } })
      .eq("id", this.run.id);
    if (error) {
      throw new Error(
        `${error.message} (aplique a migration 0004_contacts_and_flow_data.sql)`
      );
    }
  }
}
