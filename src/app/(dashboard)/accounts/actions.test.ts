import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.TOKEN_ENCRYPTION_KEY ??= "a".repeat(64);

import { createFakeAdmin, type FakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const { state, unsubscribe } = vi.hoisted(() => ({
  state: { admin: null as unknown, ownedIds: [] as string[] },
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/meta/oauth", () => ({ unsubscribeAccountFromWebhooks: (...a: unknown[]) => unsubscribe(...a) }));

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
import { encryptToken } from "@/lib/crypto";

describe("disconnectAccount", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    db = createFakeAdmin();
    state.admin = db;
    db.tables.ig_accounts.push({ id: "acc-minha", user_id: "c1", ig_user_id: "1", status: "active", access_token_enc: encryptToken("tok-minha"), token_expires_at: "2026-12-01T00:00:00.000Z" });
    db.tables.ig_accounts.push({ id: "acc-alheia", user_id: "c2", ig_user_id: "2", status: "active", access_token_enc: "tok-alheia", token_expires_at: "2026-12-01T00:00:00.000Z" });
    state.ownedIds = ["acc-minha"];
    unsubscribe.mockReset().mockResolvedValue(undefined);
  });

  it("desconecta a conta do próprio usuário e apaga o token guardado", async () => {
    expect(await disconnectAccount("acc-minha")).toEqual({});
    const row = db.tables.ig_accounts.find((a) => a.id === "acc-minha")!;
    expect(row.status).toBe("disconnected");
    expect(row.access_token_enc).toBe("");
    expect(row.token_expires_at).toBeNull();
    expect(unsubscribe).toHaveBeenCalledWith("tok-minha");
  });

  it("falha ao desfazer a inscrição na Meta não impede desconectar", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    unsubscribe.mockRejectedValue(new Error("Meta fora"));
    expect(await disconnectAccount("acc-minha")).toEqual({});
    expect(db.tables.ig_accounts.find((a) => a.id === "acc-minha")!.status).toBe("disconnected");
  });

  it("recusa conta de outro usuário e não escreve nada", async () => {
    const result = await disconnectAccount("acc-alheia");
    expect(result.error).toBeTruthy();
    const row = db.tables.ig_accounts.find((a) => a.id === "acc-alheia")!;
    expect(row.status).toBe("active");
    expect(row.access_token_enc).toBe("tok-alheia");
    expect(row.token_expires_at).toBe("2026-12-01T00:00:00.000Z");
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
