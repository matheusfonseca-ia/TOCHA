import {
  loadContact,
  loadConversationUsername,
  saveContact,
  type ContactSnapshot,
} from "@/lib/contacts/repository";
import { evaluateCondition } from "@/lib/sequences/condition";
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

export class FlowData {
  private contact: ContactSnapshot | null = null;
  private conversationUsername: string | null | undefined;
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
    this.contact ??= await loadContact(
      this.admin,
      this.accountId,
      this.run.ig_sender_id
    );
    return this.contact;
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

  async evaluate(condition: ConditionNodeData): Promise<boolean> {
    const contact = await this.getContact();
    return evaluateCondition(condition, {
      fields: await this.values(),
      tags: contact.tags,
    });
  }

  /** Grava o campo no contato e nas variáveis do run. */
  async setField(key: string, rawValue: string): Promise<void> {
    const value = rawValue.slice(0, STORED_FIELD_VALUE_MAX);
    const contact = await this.getContact();
    const username = await this.getUsername();
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
    const contact = await this.getContact();
    const username = await this.getUsername();
    const normalized = tag.trim();
    const others = contact.tags.filter(
      (t) => t.toLowerCase() !== normalized.toLowerCase()
    );
    this.contact = {
      ig_username: username,
      fields: contact.fields,
      tags: action === "add" ? [...others, normalized] : others,
    };
    await saveContact(this.admin, this.accountId, this.run.ig_sender_id, this.contact);
  }

  attemptsAt(nodeId: string): number {
    return this.variables.__attempts?.[nodeId] ?? 0;
  }

  /** Grava o contador de respostas inválidas do nó (null zera). */
  async setAttempts(nodeId: string, attempts: number | null): Promise<void> {
    const current = { ...(this.variables.__attempts ?? {}) };
    if (attempts === null) {
      if (!(nodeId in current)) return;
      delete current[nodeId];
    } else {
      current[nodeId] = attempts;
    }
    this.variables.__attempts = current;
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
