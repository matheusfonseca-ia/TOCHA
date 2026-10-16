import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const { state } = vi.hoisted(() => ({
  state: { admin: null as unknown, ownedIds: [] as string[] },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (state.admin as FakeSupabase).client,
}));
vi.mock("@/lib/supabase/server", () => ({
  // client do usuário: o RLS de select só devolve as contas dele (não tem .update)
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => ({ data: state.ownedIds.includes(id) ? { id } : null, error: null }),
        }),
      }),
    }),
  }),
}));

import { disconnectAccount } from "@/app/(dashboard)/accounts/actions";

describe("disconnectAccount", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    db = createFakeAdmin();
    state.admin = db;
    db.tables.ig_accounts.push({ id: "acc-minha", user_id: "c1", ig_user_id: "1", status: "active" });
    db.tables.ig_accounts.push({ id: "acc-alheia", user_id: "c2", ig_user_id: "2", status: "active" });
    state.ownedIds = ["acc-minha"];
  });

  it("desconecta a conta do próprio usuário", async () => {
    expect(await disconnectAccount("acc-minha")).toEqual({});
    expect(db.tables.ig_accounts.find((a) => a.id === "acc-minha")!.status).toBe("disconnected");
  });

  it("recusa conta de outro usuário e não escreve nada", async () => {
    const result = await disconnectAccount("acc-alheia");
    expect(result.error).toBeTruthy();
    expect(db.tables.ig_accounts.find((a) => a.id === "acc-alheia")!.status).toBe("active");
  });
});
