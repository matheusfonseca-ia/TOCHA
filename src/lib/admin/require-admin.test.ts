import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    user: null as null | { id: string },
    aal: { currentLevel: "aal1", nextLevel: "aal1" } as { currentLevel: string; nextLevel: string },
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal, error: null }) },
    },
  }),
}));

import { AdminMfaRequiredError, AdminRequiredError, requireAdmin } from "@/lib/admin/require-admin";

describe("requireAdmin", () => {
  beforeEach(() => {
    state.user = null;
    state.aal = { currentLevel: "aal1", nextLevel: "aal1" };
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sem sessão lança", async () => {
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

  describe("segundo fator", () => {
    it("admin com fator cadastrado e sessão aal1: recusado (exceto na tela do código)", async () => {
      state.user = { id: "user-1" };
      state.aal = { currentLevel: "aal1", nextLevel: "aal2" };
      await expect(requireAdmin()).rejects.toBeInstanceOf(AdminMfaRequiredError);
      await expect(requireAdmin({ allowAal1: true })).resolves.toEqual({ adminId: "user-1" });
    });
    it("FALOW_ADMIN_REQUIRE_MFA=true: sem aal2 recusa; com aal2 passa", async () => {
      vi.stubEnv("FALOW_ADMIN_REQUIRE_MFA", "true");
      state.user = { id: "user-1" };
      await expect(requireAdmin()).rejects.toBeInstanceOf(AdminMfaRequiredError);
      state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
      await expect(requireAdmin()).resolves.toEqual({ adminId: "user-1" });
    });
    it("cliente comum continua recusado mesmo na tela do código", async () => {
      state.user = { id: "cliente-1" };
      await expect(requireAdmin({ allowAal1: true })).rejects.toBeInstanceOf(AdminRequiredError);
    });
  });
});
