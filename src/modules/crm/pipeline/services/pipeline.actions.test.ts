import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const { state } = vi.hoisted(() => ({
  state: { admin: null as unknown, owned: {} as Record<string, string[]> },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-access", () => ({ activeUserId: async () => "user-1" }));
vi.mock("@/lib/sequences/runtime", () => ({ startStageEnterSequence: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (state.admin as FakeSupabase).client,
}));
vi.mock("@/lib/supabase/server", () => ({
  // client do usuário: o RLS de select só devolve o que é dele, tabela por tabela
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => ({
            data: (state.owned[table] ?? []).includes(id) ? { id, stage_type: "open" } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { updateStageAction } from "@/modules/crm/pipeline/services/pipeline.actions";

describe("updateStageAction: workflow de entrada", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    db = createFakeAdmin();
    state.admin = db;
    db.tables.pipeline_stages.push({ id: "etapa-minha", pipeline_id: "p1", name: "Nova", on_enter_sequence_id: null });
    state.owned = { pipeline_stages: ["etapa-minha"], sequences: ["wf-meu"] };
  });

  it("grava o workflow da própria conta", async () => {
    expect(await updateStageAction("etapa-minha", { onEnterSequenceId: "wf-meu" })).toEqual({});
    expect(db.tables.pipeline_stages[0].on_enter_sequence_id).toBe("wf-meu");
  });

  it("recusa workflow de outro cliente e não grava a referência", async () => {
    const result = await updateStageAction("etapa-minha", { onEnterSequenceId: "wf-alheio" });
    expect(result.error).toBe("Workflow não encontrado.");
    expect(db.tables.pipeline_stages[0].on_enter_sequence_id).toBeNull();
  });

  it("limpar o workflow (null) continua permitido", async () => {
    db.tables.pipeline_stages[0].on_enter_sequence_id = "wf-meu";
    expect(await updateStageAction("etapa-minha", { onEnterSequenceId: null })).toEqual({});
    expect(db.tables.pipeline_stages[0].on_enter_sequence_id).toBeNull();
  });
});
