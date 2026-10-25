import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAdmin, type FakeSupabase, type TableName } from "@/lib/sequences/__tests__/fake-supabase";
import { accountHasAccess, hasActiveAccess, isAccessStatus, isAdmin, isOwner } from "@/lib/billing/access";

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

const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";

describe("isAdmin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("dono é sempre admin", () => {
    expect(isAdmin("user-1")).toBe(true);
  });
  it("lê a lista com espaços, quebra de linha e itens vazios", () => {
    vi.stubEnv("FALOW_ADMIN_USER_IDS", ` ${A1} ,
${A2}
,, `);
    expect(isAdmin(A1)).toBe(true);
    expect(isAdmin(A2)).toBe(true);
    expect(isAdmin("33333333-3333-4333-8333-333333333333")).toBe(false);
  });
  it("descarta item que não é UUID (ex.: e-mail) e registra", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FALOW_ADMIN_USER_IDS", `matheus@exemplo.com,${A1}`);
    expect(isAdmin("matheus@exemplo.com")).toBe(false);
    expect(isAdmin(A1)).toBe(true);
    expect(spy).toHaveBeenCalled();
  });
  it("variável vazia = só o dono", () => {
    vi.stubEnv("FALOW_ADMIN_USER_IDS", "");
    expect(isAdmin(A1)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
  it("avisa uma vez sobre UUID inválido e relê a lista quando a variável muda", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FALOW_ADMIN_USER_IDS", `invalido-uma-vez,${A1}`);
    for (let i = 0; i < 5; i++) {
      expect(isAdmin(A1)).toBe(true);
      expect(isAdmin(A2)).toBe(false);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    vi.stubEnv("FALOW_ADMIN_USER_IDS", A2);
    expect(isAdmin(A1)).toBe(false);
    expect(isAdmin(A2)).toBe(true);
  });
});

describe("hasActiveAccess com access_grants", () => {
  const NOW = new Date("2026-10-16T12:00:00Z");
  let db: FakeSupabase;
  beforeEach(() => {
    db = createFakeAdmin();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("admin da lista tem acesso sem assinatura", async () => {
    vi.stubEnv("FALOW_ADMIN_USER_IDS", A1);
    expect(await hasActiveAccess(db.client, A1, NOW)).toBe(true);
  });
  it("bloqueio vence a assinatura ativa", async () => {
    db.tables.subscriptions.push({ user_id: "c1", stripe_customer_id: "cus_1", status: "active" });
    db.tables.access_grants.push({ user_id: "c1", kind: "block", expires_at: null, reason: "abuso", granted_by: "user-1" });
    expect(await hasActiveAccess(db.client, "c1", NOW)).toBe(false);
  });
  it("bloqueio não vale contra admin", async () => {
    db.tables.access_grants.push({ user_id: "user-1", kind: "block", expires_at: null, reason: "x", granted_by: "user-1" });
    expect(await hasActiveAccess(db.client, "user-1", NOW)).toBe(true);
  });
  it("cortesia válida dá acesso sem assinatura", async () => {
    db.tables.access_grants.push({ user_id: "c2", kind: "courtesy", expires_at: "2026-11-16T00:00:00Z", reason: "parceiro", granted_by: "user-1" });
    expect(await hasActiveAccess(db.client, "c2", NOW)).toBe(true);
  });
  it("cortesia vencida não dá acesso; cai para a assinatura", async () => {
    db.tables.access_grants.push({ user_id: "c3", kind: "courtesy", expires_at: "2026-10-01T00:00:00Z", reason: "x", granted_by: "user-1" });
    expect(await hasActiveAccess(db.client, "c3", NOW)).toBe(false);
    db.tables.subscriptions.push({ user_id: "c3", stripe_customer_id: "cus_3", status: "active" });
    expect(await hasActiveAccess(db.client, "c3", NOW)).toBe(true);
  });
  it("erro ao ler access_grants = sem acesso + log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = {
      from: (table: string) =>
        table === "access_grants"
          ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }) }) }
          : db.client.from(table as never),
    };
    db.tables.subscriptions.push({ user_id: "c4", stripe_customer_id: "cus_4", status: "active" });
    expect(await hasActiveAccess(failing, "c4", NOW)).toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("access_grants"), "boom");
  });
  it("accountHasAccess respeita o bloqueio (bot e cron param)", async () => {
    db.tables.ig_accounts.push({ id: "acc-c5", user_id: "c5", ig_user_id: "5", status: "active" });
    db.tables.subscriptions.push({ user_id: "c5", stripe_customer_id: "cus_5", status: "active" });
    db.tables.access_grants.push({ user_id: "c5", kind: "block", expires_at: null, reason: "x", granted_by: "user-1" });
    expect(await accountHasAccess(db.client, "acc-c5")).toBe(false);
  });
});
