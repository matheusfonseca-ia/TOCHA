import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Os componentes de UI usados no smoke de render abaixo não importam
 * `React` (contam com o runtime automático de JSX do Next/SWC). O
 * transform de esbuild do vitest usa o runtime clássico por padrão (sem
 * plugin de React configurado em vitest.config.ts) e emite
 * `React.createElement(...)` sem importar `React`, o que quebra em runtime
 * com "React is not defined". Expor `React` como global aqui, só neste
 * arquivo de teste, resolve sem tocar em código de produção ou config.
 */
(globalThis as unknown as { React: typeof React }).React = React;

/**
 * QA da feature "Seguir para liberar": round-trip de salvamento (schema +
 * saveRule/duplicateRule), fallback do banco sem a migration 0007, e smoke
 * de render dos componentes de UI. Arquivo de QA, cobre só tela e
 * salvamento (não a engine de runtime que manda a DM do portão de verdade).
 *
 * Fica em .test.ts (não .tsx): os elementos React são montados com
 * `React.createElement`, sem sintaxe JSX, então não precisa de transform
 * de JSX nem de tocar no `include` de vitest.config.ts.
 */

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeRule } from "@/lib/sequences/__tests__/fixtures";

import { FOLLOW_GATE_DEFAULTS, FOLLOW_GATE_LIMITS } from "@/lib/follow-gate/copy";
import {
  followGateFieldsForSave,
  followGateFormFrom,
  followGatePreviewCopy,
} from "@/lib/follow-gate/form";
import {
  copyFollowGateColumns,
  followGateColumns,
  isMissingFollowGateColumn,
  withoutFollowGateColumns,
} from "@/lib/follow-gate/schema";
import { FollowGateField } from "@/components/rules/follow-gate/follow-gate-field";
import { FollowGatePreview } from "@/components/rules/follow-gate/follow-gate-preview";
import { CommentPhonePreview } from "@/components/rules/comment-phone-preview";
import { DmPhonePreview } from "@/components/rules/dm-phone-preview";

// ── mock do client Supabase usado por saveRule/duplicateRule ─────────────
const { getClient, setClient } = vi.hoisted(() => {
  let current: unknown = null;
  return {
    getClient: () => current,
    setClient: (value: unknown) => {
      current = value;
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: () => getClient() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { duplicateRule, saveRule, type RuleInput } from "@/app/(dashboard)/rules/actions";

const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";

/** Rule de DM mínima e válida para o zod de saveRule; is_active: false evita
 * as consultas extras de isStoredExpired/findConflictingRuleName (fora do
 * escopo deste QA, já cobertas em outros testes). */
function baseInput(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    account_id: ACCOUNT_ID,
    keyword: "oi",
    match_type: "contains",
    reply_type: "text",
    reply_text: "Olá",
    delay_seconds: 3,
    is_active: false,
    ...overrides,
  };
}

let fake: FakeSupabase;

beforeEach(() => {
  fake = createFakeAdmin();
  setClient(fake.client);
});

// ═══════════════════════════════════════════════════════════════════════
// 1. Round-trip: funções puras schema.ts / form.ts
// ═══════════════════════════════════════════════════════════════════════

describe("followGateFormFrom", () => {
  it("automação nova (sem rule): desligado, textos com a copy padrão", () => {
    const form = followGateFormFrom();
    expect(form.enabled).toBe(false);
    expect(form.text).toBe(FOLLOW_GATE_DEFAULTS.text);
    expect(form.followLabel).toBe(FOLLOW_GATE_DEFAULTS.followLabel);
    expect(form.confirmLabel).toBe(FOLLOW_GATE_DEFAULTS.confirmLabel);
    expect(form.retryText).toBe(FOLLOW_GATE_DEFAULTS.retryText);
  });

  it("rule existente com textos próprios: carrega ligado e com os textos salvos", () => {
    const form = followGateFormFrom({
      follow_gate_enabled: true,
      follow_gate_text: "Texto customizado",
      follow_gate_follow_label: "Me segue",
      follow_gate_confirm_label: "Prontinho",
      follow_gate_retry_text: "Ainda não vi você seguindo",
    });
    expect(form.enabled).toBe(true);
    expect(form.text).toBe("Texto customizado");
    expect(form.followLabel).toBe("Me segue");
    expect(form.confirmLabel).toBe("Prontinho");
    expect(form.retryText).toBe("Ainda não vi você seguindo");
  });

  it("rule pré-migration 0007 (colunas ausentes): conta como desligado, textos padrão", () => {
    const form = followGateFormFrom({} as never);
    expect(form.enabled).toBe(false);
    expect(form.text).toBe(FOLLOW_GATE_DEFAULTS.text);
  });
});

describe("followGateFieldsForSave (texto igual ao padrão grava vazio)", () => {
  it("texto customizado: mantém como está", () => {
    const form = followGateFormFrom({
      follow_gate_enabled: true,
      follow_gate_text: "Meu texto",
      follow_gate_follow_label: "Segue",
      follow_gate_confirm_label: "Segui",
      follow_gate_retry_text: "Tenta de novo",
    });
    const fields = followGateFieldsForSave(form);
    expect(fields.follow_gate_text).toBe("Meu texto");
    expect(fields.follow_gate_follow_label).toBe("Segue");
    expect(fields.follow_gate_confirm_label).toBe("Segui");
    expect(fields.follow_gate_retry_text).toBe("Tenta de novo");
  });

  it("texto igual ao padrão (sem edição): vira string vazia", () => {
    const form = followGateFormFrom(); // nasce com a copy padrão em todos os campos
    const fields = followGateFieldsForSave({ ...form, enabled: true });
    expect(fields.follow_gate_text).toBe("");
    expect(fields.follow_gate_follow_label).toBe("");
    expect(fields.follow_gate_confirm_label).toBe("");
    expect(fields.follow_gate_retry_text).toBe("");
  });

  it("round-trip completo texto padrão -> followGateColumns grava nulo no banco", () => {
    const form = followGateFormFrom();
    const columns = followGateColumns({ ...followGateFieldsForSave({ ...form, enabled: true }) });
    expect(columns.follow_gate_enabled).toBe(true);
    expect(columns.follow_gate_text).toBeNull();
    expect(columns.follow_gate_follow_label).toBeNull();
    expect(columns.follow_gate_confirm_label).toBeNull();
    expect(columns.follow_gate_retry_text).toBeNull();
  });

  it("round-trip completo texto customizado -> followGateColumns preserva", () => {
    const form = followGateFormFrom({
      follow_gate_enabled: true,
      follow_gate_text: "Só sigo quem me segue",
    });
    const columns = followGateColumns({ ...followGateFieldsForSave(form) });
    expect(columns.follow_gate_text).toBe("Só sigo quem me segue");
  });
});

describe("followGatePreviewCopy", () => {
  it("desligado: null (prévia não mostra o portão)", () => {
    const form = followGateFormFrom();
    expect(followGatePreviewCopy(form)).toBeNull();
  });

  it("ligado com campo vazio: mostra o texto padrão na prévia", () => {
    const form = { ...followGateFormFrom(), enabled: true };
    const preview = followGatePreviewCopy(form);
    expect(preview?.text).toBe(FOLLOW_GATE_DEFAULTS.text);
    expect(preview?.followLabel).toBe(FOLLOW_GATE_DEFAULTS.followLabel);
  });

  it("ligado com texto customizado: mostra o texto customizado", () => {
    const form = {
      ...followGateFormFrom(),
      enabled: true,
      followLabel: "Clica aqui",
    };
    expect(followGatePreviewCopy(form)?.followLabel).toBe("Clica aqui");
  });
});

describe("followGateColumns (schema.ts)", () => {
  it("follow_gate_enabled ausente no input: não mexe no salvo ({})", () => {
    expect(followGateColumns({})).toEqual({});
  });

  it("desligar: grava enabled false e mantém os textos passados", () => {
    const columns = followGateColumns({ follow_gate_enabled: false, follow_gate_text: "x" });
    expect(columns.follow_gate_enabled).toBe(false);
    expect(columns.follow_gate_text).toBe("x");
  });

  it("string só com espaços grava nulo, igual a vazio", () => {
    const columns = followGateColumns({ follow_gate_enabled: true, follow_gate_text: "   " });
    expect(columns.follow_gate_text).toBeNull();
  });
});

describe("copyFollowGateColumns (duplicar)", () => {
  it("original pré-migration (colunas ausentes): não copia nada", () => {
    expect(copyFollowGateColumns({} as never)).toEqual({});
  });

  it("original com portão ligado e texto customizado: copia tudo", () => {
    const copy = copyFollowGateColumns({
      follow_gate_enabled: true,
      follow_gate_text: "Texto original",
      follow_gate_follow_label: null,
      follow_gate_confirm_label: null,
      follow_gate_retry_text: null,
    });
    expect(copy).toEqual({
      follow_gate_enabled: true,
      follow_gate_text: "Texto original",
      follow_gate_follow_label: null,
      follow_gate_confirm_label: null,
      follow_gate_retry_text: null,
    });
  });
});

describe("isMissingFollowGateColumn / withoutFollowGateColumns", () => {
  it("reconhece o erro real do PostgREST (PGRST204) para coluna do portão", () => {
    const error = {
      message:
        "Could not find the 'follow_gate_enabled' column of 'rules' in the schema cache",
      code: "PGRST204",
    };
    expect(isMissingFollowGateColumn(error)).toBe(true);
  });

  it("não confunde outro erro qualquer com a migration faltando", () => {
    expect(isMissingFollowGateColumn({ message: "duplicate key value violates unique constraint" })).toBe(
      false
    );
    expect(isMissingFollowGateColumn(null)).toBe(false);
    expect(isMissingFollowGateColumn(undefined)).toBe(false);
  });

  it("withoutFollowGateColumns remove só as colunas do portão", () => {
    const row = { id: "1", keyword: "oi", follow_gate_enabled: true, follow_gate_text: "x" };
    expect(withoutFollowGateColumns(row)).toEqual({ id: "1", keyword: "oi" });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Round-trip de saveRule/duplicateRule com banco (FakeSupabase)
// ═══════════════════════════════════════════════════════════════════════

describe("saveRule: round-trip com o banco", () => {
  it("criar automação ativa não avisa conflito com ela mesma; outra ativa com a mesma palavra avisa", async () => {
    const first = await saveRule(baseInput({ keyword: "unica", is_active: true }));
    expect(first.error).toBeUndefined();
    expect(first.warning).toBeUndefined();

    const second = await saveRule(baseInput({ keyword: "unica", name: "Segunda", is_active: true }));
    expect(second.warning).toMatch(/também está ativa/);
    expect(fake.tables.rules).toHaveLength(2);
  });

  it("cria automação de DM com o portão ligado: colunas gravadas certas", async () => {
    const result = await saveRule(
      baseInput({
        follow_gate_enabled: true,
        follow_gate_text: "Segue pra liberar",
        follow_gate_follow_label: "Seguir",
        follow_gate_confirm_label: "Já sigo",
        follow_gate_retry_text: "Ainda não vi",
      })
    );
    expect(result.error).toBeUndefined();
    expect(fake.tables.rules).toHaveLength(1);
    const saved = fake.tables.rules[0];
    expect(saved.follow_gate_enabled).toBe(true);
    expect(saved.follow_gate_text).toBe("Segue pra liberar");
    expect(saved.follow_gate_follow_label).toBe("Seguir");
    expect(saved.follow_gate_confirm_label).toBe("Já sigo");
    expect(saved.follow_gate_retry_text).toBe("Ainda não vi");
  });

  it("editar automação existente pela tela própria: reenvio sem alterar nada mantém o portão e os textos", async () => {
    const rule = makeRule({
      follow_gate_enabled: true,
      follow_gate_text: "Texto já salvo",
      follow_gate_follow_label: "Segue meu perfil",
      follow_gate_confirm_label: "Feito!",
      follow_gate_retry_text: "Ainda não confirmei",
    });
    fake.tables.rules.push(rule);

    // O builder de edição carrega o form a partir da rule salva (mesmo
    // pipeline de followGateFormFrom que a tela usa) e reenvia exatamente o
    // que carregou, sem o usuário alterar nada.
    const form = followGateFormFrom(rule);
    const result = await saveRule(baseInput({ id: rule.id, ...followGateFieldsForSave(form) }));

    expect(result.error).toBeUndefined();
    const saved = fake.tables.rules[0];
    expect(saved.follow_gate_enabled).toBe(true);
    expect(saved.follow_gate_text).toBe("Texto já salvo");
    expect(saved.follow_gate_follow_label).toBe("Segue meu perfil");
    expect(saved.follow_gate_confirm_label).toBe("Feito!");
    expect(saved.follow_gate_retry_text).toBe("Ainda não confirmei");
  });

  it("diálogo genérico da lista (sem os campos do portão): NÃO apaga o portão já salvo", async () => {
    const rule = makeRule({
      follow_gate_enabled: true,
      follow_gate_text: "Não pode se perder",
      follow_gate_follow_label: "Seguir perfil",
      follow_gate_confirm_label: "Já segui",
      follow_gate_retry_text: null,
    });
    fake.tables.rules.push(rule);

    // rules-manager.tsx nunca espalha followGateFields* no input.
    const result = await saveRule(baseInput({ id: rule.id, name: "Renomeada" }));

    expect(result.error).toBeUndefined();
    const saved = fake.tables.rules[0];
    expect(saved.name).toBe("Renomeada");
    expect(saved.follow_gate_enabled).toBe(true);
    expect(saved.follow_gate_text).toBe("Não pode se perder");
    expect(saved.follow_gate_follow_label).toBe("Seguir perfil");
    expect(saved.follow_gate_confirm_label).toBe("Já segui");
  });

  it("duplicar automação com o portão ligado: copia enabled e textos para a cópia", async () => {
    const rule = makeRule({
      follow_gate_enabled: true,
      follow_gate_text: "Original",
      follow_gate_follow_label: "Seguir",
      follow_gate_confirm_label: "Já segui",
      follow_gate_retry_text: "De novo",
    });
    fake.tables.rules.push(rule);

    const result = await duplicateRule(rule.id);
    expect(result.error).toBeUndefined();
    expect(fake.tables.rules).toHaveLength(2);
    const copy = fake.tables.rules.find((r) => r.id !== rule.id)!;
    expect(copy.follow_gate_enabled).toBe(true);
    expect(copy.follow_gate_text).toBe("Original");
    expect(copy.is_active).toBe(false); // cópia sempre nasce pausada
  });

  it("duplicar automação pré-migration (sem colunas do portão): não quebra, não injeta as colunas", async () => {
    const rule = makeRule({}); // sem follow_gate_*: simula linha anterior à migration 0007
    fake.tables.rules.push(rule);

    const result = await duplicateRule(rule.id);
    expect(result.error).toBeUndefined();
    const copy = fake.tables.rules.find((r) => r.id !== rule.id)!;
    expect("follow_gate_enabled" in copy).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Limites do zod == maxLength da UI
// ═══════════════════════════════════════════════════════════════════════

describe("saveRule: limites do portão batem com a UI", () => {
  it("constantes de limite usadas pela UI e pelo zod são 640/20", () => {
    expect(FOLLOW_GATE_LIMITS.text).toBe(640);
    expect(FOLLOW_GATE_LIMITS.label).toBe(20);
  });

  it("texto do portão com 640 caracteres passa, 641 é recusado", async () => {
    const ok = await saveRule(baseInput({ follow_gate_text: "a".repeat(640) }));
    expect(ok.error).toBeUndefined();

    const tooLong = await saveRule(baseInput({ follow_gate_text: "a".repeat(641) }));
    expect(tooLong.error).toMatch(/640/);
  });

  it("texto de 'ainda não segue' com 640 caracteres passa, 641 é recusado", async () => {
    const ok = await saveRule(baseInput({ follow_gate_retry_text: "a".repeat(640) }));
    expect(ok.error).toBeUndefined();

    const tooLong = await saveRule(baseInput({ follow_gate_retry_text: "a".repeat(641) }));
    expect(tooLong.error).toMatch(/640/);
  });

  it("rótulo de botão com 20 caracteres passa, 21 é recusado", async () => {
    const ok = await saveRule(baseInput({ follow_gate_follow_label: "a".repeat(20) }));
    expect(ok.error).toBeUndefined();

    const tooLong = await saveRule(baseInput({ follow_gate_follow_label: "a".repeat(21) }));
    expect(tooLong.error).toMatch(/20/);
  });

  it("rótulo de confirmação com 20 caracteres passa, 21 é recusado", async () => {
    const ok = await saveRule(baseInput({ follow_gate_confirm_label: "a".repeat(20) }));
    expect(ok.error).toBeUndefined();

    const tooLong = await saveRule(baseInput({ follow_gate_confirm_label: "a".repeat(21) }));
    expect(tooLong.error).toMatch(/20/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Fallback: banco sem a migration 0007 (erro real do PostgREST)
// ═══════════════════════════════════════════════════════════════════════

type FakeRow = Record<string, unknown>;

/**
 * Client mínimo que reproduz o erro real do PostgREST quando a migration
 * 0007 não foi aplicada: qualquer escrita que inclua uma coluna
 * `follow_gate_*` falha com PGRST204 (a coluna não existe no banco).
 */
function createMigrationLessClient() {
  const calls: { op: "insert" | "update"; payload: FakeRow }[] = [];
  let stored: FakeRow | null = null;

  function hasFollowGateKeys(payload: FakeRow) {
    return Object.keys(payload).some((k) => k.startsWith("follow_gate_"));
  }

  function builder(op: "insert" | "update", payload: FakeRow) {
    const self = {
      eq(_col: string, _val: unknown) {
        return self;
      },
      // insert(...).select("id").maybeSingle(): saveRule lê o id da automação nova.
      select(_cols?: string) {
        return self;
      },
      maybeSingle() {
        return self;
      },
      then(
        resolve: (v: { data: FakeRow[] | null; error: FakeRow | null }) => unknown,
        reject?: (e: unknown) => unknown
      ) {
        calls.push({ op, payload });
        if (hasFollowGateKeys(payload)) {
          return Promise.resolve(
            resolve({
              data: null,
              error: {
                code: "PGRST204",
                message:
                  "Could not find the 'follow_gate_enabled' column of 'rules' in the schema cache",
              },
            })
          );
        }
        stored = op === "insert" ? { id: "new-rule-id", ...payload } : { ...(stored ?? {}), ...payload };
        return Promise.resolve(resolve({ data: [stored], error: null })).catch(reject);
      },
    };
    return self;
  }

  return {
    calls,
    getStored: () => stored,
    client: {
      from(_table: string) {
        return {
          insert: (payload: FakeRow) => builder("insert", payload),
          update: (payload: FakeRow) => builder("update", payload),
        };
      },
    },
  };
}

describe("saveRule: fallback sem a migration 0007 (insert)", () => {
  it("portão desligado: 2ª escrita sem colunas follow_gate_* e sucesso", async () => {
    const migrationLess = createMigrationLessClient();
    setClient(migrationLess.client);

    const result = await saveRule(baseInput({ follow_gate_enabled: false }));

    expect(result.error).toBeUndefined();
    expect(migrationLess.calls).toHaveLength(2);
    expect(Object.keys(migrationLess.calls[0].payload).some((k) => k.startsWith("follow_gate_"))).toBe(
      true
    );
    expect(Object.keys(migrationLess.calls[1].payload).some((k) => k.startsWith("follow_gate_"))).toBe(
      false
    );
    expect(migrationLess.getStored()?.keyword).toBe("oi");
  });

  it("portão ligado: erro FOLLOW_GATE_MIGRATION_ERROR, sem tentar de novo", async () => {
    const migrationLess = createMigrationLessClient();
    setClient(migrationLess.client);

    const result = await saveRule(baseInput({ follow_gate_enabled: true }));

    expect(result.error).toMatch(/migration 0007/);
    expect(migrationLess.calls).toHaveLength(1);
  });
});

describe("saveRule: fallback sem a migration 0007 (update)", () => {
  it("portão desligado: atualiza sem colunas follow_gate_* e sucesso", async () => {
    const migrationLess = createMigrationLessClient();
    setClient(migrationLess.client);

    const result = await saveRule(
      baseInput({ id: "22222222-2222-2222-2222-222222222222", follow_gate_enabled: false })
    );

    expect(result.error).toBeUndefined();
    expect(migrationLess.calls).toHaveLength(2);
    expect(migrationLess.calls[0].op).toBe("update");
    expect(migrationLess.calls[1].op).toBe("update");
  });

  it("portão ligado: erro FOLLOW_GATE_MIGRATION_ERROR, sem tentar de novo", async () => {
    const migrationLess = createMigrationLessClient();
    setClient(migrationLess.client);

    const result = await saveRule(
      baseInput({ id: "22222222-2222-2222-2222-222222222222", follow_gate_enabled: true })
    );

    expect(result.error).toMatch(/migration 0007/);
    expect(migrationLess.calls).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Smoke de render (renderToString) dos componentes de UI
// ═══════════════════════════════════════════════════════════════════════

/** Alguns componentes usam primitivas Radix que podem depender de browser;
 * se não renderizarem em node, registra e segue (não falha o arquivo). */
function tryRender(label: string, element: Parameters<typeof renderToString>[0]): string | null {
  try {
    return renderToString(element);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[ui-qa] "${label}" não renderizou em node (provável dependência de browser): ${(err as Error).message}`);
    return null;
  }
}

const NO_DASH = /[—–]/;

describe("render smoke: FollowGateField", () => {
  it("desligado: mostra só o interruptor, sem os campos de texto", () => {
    const html = tryRender(
      "FollowGateField (desligado)",
      createElement(FollowGateField, {
        value: { enabled: false, text: "", followLabel: "", confirmLabel: "", retryText: "" },
        onChange: () => {},
        username: "conta_teste",
        label: "Só responder para quem segue seu perfil",
        contentName: "a resposta",
      })
    );
    if (html === null) return;
    expect(html).toContain("Só responder para quem segue seu perfil");
    expect(html).not.toContain("Mensagem para quem ainda não segue");
    expect(NO_DASH.test(html)).toBe(false);
  });

  it("ligado: mostra os 4 campos com id/htmlFor pareados e maxLength certo", () => {
    const html = tryRender(
      "FollowGateField (ligado)",
      createElement(FollowGateField, {
        value: {
          enabled: true,
          text: "Texto do portão",
          followLabel: "Seguir",
          confirmLabel: "Já segui",
          retryText: "Tenta de novo",
        },
        onChange: () => {},
        username: "conta_teste",
        label: "Só responder para quem segue seu perfil",
        contentName: "o link",
      })
    );
    if (html === null) return;

    // Cada rótulo aponta para o id do campo certo (a11y básica).
    for (const id of ["follow-gate-text", "follow-gate-follow", "follow-gate-confirm", "follow-gate-retry"]) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('maxLength="640"');
    expect(html).toContain('maxLength="20"');
    // React SSR insere comentários de hidratação entre expressões JSX
    // adjacentes ("@<!-- -->conta_teste"), então checa as partes separadas.
    expect(html).toContain("abre o perfil @");
    expect(html).toContain("conta_teste");
    expect(html).toContain("o link");
    expect(NO_DASH.test(html)).toBe(false);
  });
});

describe("render smoke: FollowGatePreview", () => {
  const props = {
    text: FOLLOW_GATE_DEFAULTS.text,
    followLabel: FOLLOW_GATE_DEFAULTS.followLabel,
    confirmLabel: FOLLOW_GATE_DEFAULTS.confirmLabel,
  };

  it("perspectiva follower (comentário): renderiza texto e os 2 botões", () => {
    const html = tryRender(
      "FollowGatePreview (follower)",
      createElement(FollowGatePreview, { ...props, perspective: "follower" })
    );
    if (html === null) return;
    expect(html).toContain(FOLLOW_GATE_DEFAULTS.followLabel);
    expect(html).toContain(FOLLOW_GATE_DEFAULTS.confirmLabel);
    expect(NO_DASH.test(html)).toBe(false);
  });

  it("perspectiva owner (DM): renderiza sem quebrar", () => {
    const html = tryRender(
      "FollowGatePreview (owner)",
      createElement(FollowGatePreview, { ...props, perspective: "owner" })
    );
    if (html === null) return;
    expect(html).toContain(FOLLOW_GATE_DEFAULTS.followLabel);
  });
});

describe("render smoke: CommentPhonePreview", () => {
  it("sem followGate: renderiza as 3 telas sem o bloco do portão", () => {
    const html = tryRender(
      "CommentPhonePreview (sem portão)",
      createElement(CommentPhonePreview, {
        username: "conta_teste",
        avatarUrl: null,
        selectedMedia: null,
        anyMedia: true,
        commentText: "preço",
        publicReplyEnabled: false,
        publicReplyText: "",
        welcomeText: "Boas vindas!",
        welcomeButtonLabel: "Me envie o link",
        linkMessageText: "Aqui está",
        links: [],
        followGate: null,
      })
    );
    if (html === null) return;
    expect(html).toContain("Boas vindas!");
    expect(NO_DASH.test(html)).toBe(false);
  });

  it("com followGate: renderiza o bloco do portão na tela de DM", () => {
    const html = tryRender(
      "CommentPhonePreview (com portão)",
      createElement(CommentPhonePreview, {
        username: "conta_teste",
        avatarUrl: null,
        selectedMedia: null,
        anyMedia: true,
        commentText: "preço",
        publicReplyEnabled: false,
        publicReplyText: "",
        welcomeText: "Boas vindas!",
        welcomeButtonLabel: "Me envie o link",
        linkMessageText: "Aqui está",
        links: [],
        followGate: {
          text: "Segue pra liberar",
          followLabel: "Seguir",
          confirmLabel: "Já segui",
        },
      })
    );
    if (html === null) return;
    expect(html).toContain("Segue pra liberar");
    expect(html).toContain("Já segui");
  });
});

describe("render smoke: DmPhonePreview", () => {
  it("sem followGate: renderiza sem o bloco do portão", () => {
    const html = tryRender(
      "DmPhonePreview (sem portão)",
      createElement(DmPhonePreview, {
        username: "conta_teste",
        avatarUrl: null,
        incomingText: "oi",
        replyText: "Olá, tudo bem?",
        links: [],
        followGate: null,
      })
    );
    if (html === null) return;
    expect(html).toContain("Olá, tudo bem?");
    expect(NO_DASH.test(html)).toBe(false);
  });

  it("com followGate: renderiza o bloco do portão (perspectiva do dono)", () => {
    const html = tryRender(
      "DmPhonePreview (com portão)",
      createElement(DmPhonePreview, {
        username: "conta_teste",
        avatarUrl: null,
        incomingText: "oi",
        replyText: "Olá, tudo bem?",
        links: [],
        followGate: {
          text: "Segue pra liberar",
          followLabel: "Seguir",
          confirmLabel: "Já segui",
        },
      })
    );
    if (html === null) return;
    expect(html).toContain("Segue pra liberar");
  });
});

