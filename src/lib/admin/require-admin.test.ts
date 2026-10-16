import { describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({ state: { user: null as null | { id: string } } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}));

import { AdminRequiredError, requireAdmin } from "@/lib/admin/require-admin";

describe("requireAdmin", () => {
  it("sem sessão lança", async () => {
    state.user = null;
    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminRequiredError);
  });
  it("cliente comum lança", async () => {
    state.user = { id: "cliente-1" };
    await expect(requireAdmin()).rejects.toBeInstanceOf(AdminRequiredError);
  });
  it("dono passa e devolve o id", async () => {
    state.user = { id: "user-1" };
    await expect(requireAdmin()).resolves.toEqual({ adminId: "user-1" });
  });
});
