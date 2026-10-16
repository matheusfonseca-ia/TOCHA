import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount } from "@/lib/sequences/__tests__/fixtures";

const { state, graph } = vi.hoisted(() => ({
  state: { admin: null as unknown },
  graph: { listConversationsPage: vi.fn(), getConversationMessages: vi.fn() },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (state.admin as FakeSupabase).client,
}));
vi.mock("@/lib/supabase/server", () => ({
  // O RLS de select ainda devolve a conta desconectada: ela segue sendo "do usuário".
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: { id } }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/meta/graph", () => graph);

import { importHistoryStep } from "../services/history-import.actions";

describe("importHistoryStep com conta desconectada", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    graph.listConversationsPage.mockReset();
    graph.getConversationMessages.mockReset();
    db = createFakeAdmin();
    state.admin = db;
  });

  it("devolve erro claro e não chama a Graph API", async () => {
    db.tables.ig_accounts.push(makeAccount({ id: "acc-1", status: "disconnected" }));

    const result = await importHistoryStep("acc-1", null);

    expect(result.error).toBe("Conta desconectada. Reconecte o Instagram para importar o histórico.");
    expect(graph.listConversationsPage).not.toHaveBeenCalled();
    expect(graph.getConversationMessages).not.toHaveBeenCalled();
    expect(db.tables.conversations ?? []).toHaveLength(0);
  });
});
