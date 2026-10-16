import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase, type TableName } from "@/lib/sequences/__tests__/fake-supabase";
import { accountHasAccess, hasActiveAccess, isAccessStatus, isOwner } from "@/lib/billing/access";

describe("regra de acesso", () => {
  let db: FakeSupabase;
  beforeEach(() => {
    db = createFakeAdmin();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("dono vem do FALOW_OWNER_USER_ID", () => {
    expect(isOwner("user-1")).toBe(true);
    expect(isOwner("cliente-1")).toBe(false);
    expect(isOwner(null)).toBe(false);
  });

  it("env do dono com espaço ou quebra de linha nas pontas ainda identifica o dono", () => {
    vi.stubEnv("FALOW_OWNER_USER_ID", "user-1 ");
    expect(isOwner("user-1")).toBe(true);
    vi.stubEnv("FALOW_OWNER_USER_ID", "user-1\n");
    expect(isOwner("user-1")).toBe(true);
    expect(isOwner("cliente-1")).toBe(false);
  });

  it("env do dono vazio ou só espaços: ninguém é dono", () => {
    for (const value of ["", "   ", "\n"]) {
      vi.stubEnv("FALOW_OWNER_USER_ID", value);
      expect(isOwner("user-1")).toBe(false);
      expect(isOwner("")).toBe(false);
      expect(isOwner(value)).toBe(false);
    }
  });

  it("só active, trialing e past_due dão acesso", () => {
    for (const s of ["active", "trialing", "past_due"]) expect(isAccessStatus(s)).toBe(true);
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "", null, undefined]) {
      expect(isAccessStatus(s)).toBe(false);
    }
  });

  it("cliente sem linha em subscriptions não tem acesso", async () => {
    expect(await hasActiveAccess(db.client, "cliente-1")).toBe(false);
  });

  it("cliente com assinatura ativa tem acesso; cancelada não", async () => {
    db.tables.subscriptions.push({ user_id: "cliente-1", stripe_customer_id: "cus_1", status: "active" });
    db.tables.subscriptions.push({ user_id: "cliente-2", stripe_customer_id: "cus_2", status: "canceled" });
    expect(await hasActiveAccess(db.client, "cliente-1")).toBe(true);
    expect(await hasActiveAccess(db.client, "cliente-2")).toBe(false);
  });

  it("dono tem acesso sem assinatura", async () => {
    expect(await hasActiveAccess(db.client, "user-1")).toBe(true);
  });

  it("accountHasAccess resolve o dono da conta do Instagram", async () => {
    db.tables.ig_accounts.push({ id: "acc-1", user_id: "cliente-1", ig_user_id: "1", status: "active" });
    db.tables.ig_accounts.push({ id: "acc-2", user_id: "cliente-2", ig_user_id: "2", status: "active" });
    db.tables.subscriptions.push({ user_id: "cliente-1", stripe_customer_id: "cus_1", status: "past_due" });
    expect(await accountHasAccess(db.client, "acc-1")).toBe(true);
    expect(await accountHasAccess(db.client, "acc-2")).toBe(false);
    expect(await accountHasAccess(db.client, "nao-existe")).toBe(false);
  });

  describe("erro de leitura", () => {
    // Client cuja consulta falha nas tabelas indicadas (as outras usam o fake normal).
    function failingClient(failing: TableName[]) {
      return {
        from: (table: TableName) => {
          if (!failing.includes(table)) return db.client.from(table);
          const chain = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({ data: null, error: { message: "boom" } }),
          };
          return chain;
        },
      };
    }

    it("hasActiveAccess: erro em subscriptions → false e console.error com a tabela e o id", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await hasActiveAccess(failingClient(["subscriptions"]), "cliente-1")).toBe(false);
      expect(consoleError).toHaveBeenCalledTimes(1);
      const [msg, detail] = consoleError.mock.calls[0];
      expect(msg).toContain("[access]");
      expect(msg).toContain("subscriptions");
      expect(msg).toContain("cliente-1");
      expect(detail).toBe("boom");
    });

    it("accountHasAccess: erro em ig_accounts → false e console.error com a tabela e o id", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await accountHasAccess(failingClient(["ig_accounts"]), "acc-1")).toBe(false);
      expect(consoleError).toHaveBeenCalledTimes(1);
      const [msg, detail] = consoleError.mock.calls[0];
      expect(msg).toContain("[access]");
      expect(msg).toContain("ig_accounts");
      expect(msg).toContain("acc-1");
      expect(detail).toBe("boom");
    });

    it("accountHasAccess: conta lida, erro em subscriptions → false e console.error", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      db.tables.ig_accounts.push({ id: "acc-1", user_id: "cliente-1", ig_user_id: "1", status: "active" });
      expect(await accountHasAccess(failingClient(["subscriptions"]), "acc-1")).toBe(false);
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError.mock.calls[0][0]).toContain("subscriptions");
    });

    it("sem erro e sem linha: false sem console.error (nas duas funções)", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await hasActiveAccess(db.client, "cliente-1")).toBe(false);
      expect(await accountHasAccess(db.client, "nao-existe")).toBe(false);
      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});
