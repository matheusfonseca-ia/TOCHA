import { describe, expect, it, vi } from "vitest";

import { createFakeAdmin } from "@/lib/sequences/__tests__/fake-supabase";
import { makeAccount } from "@/lib/sequences/__tests__/fixtures";
import { findServedAccount } from "@/lib/meta/served-account";

describe("findServedAccount", () => {
  it("devolve a conta ativa do dono", async () => {
    const db = createFakeAdmin();
    db.tables.ig_accounts.push(makeAccount({ ig_user_id: "111" }));
    expect((await findServedAccount(db.client as never, "111"))?.ig_user_id).toBe("111");
  });

  it("conta de cliente sem assinatura não é atendida", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const db = createFakeAdmin();
    db.tables.ig_accounts.push(makeAccount({ ig_user_id: "222", user_id: "cliente-1" }));
    expect(await findServedAccount(db.client as never, "222")).toBeNull();
  });

  it("conta de cliente com assinatura ativa é atendida", async () => {
    const db = createFakeAdmin();
    db.tables.ig_accounts.push(makeAccount({ ig_user_id: "333", user_id: "cliente-2" }));
    db.tables.subscriptions.push({ user_id: "cliente-2", stripe_customer_id: "cus_2", status: "active" });
    expect(await findServedAccount(db.client as never, "333")).not.toBeNull();
  });

  it("conta desconectada não é atendida", async () => {
    const db = createFakeAdmin();
    db.tables.ig_accounts.push(makeAccount({ ig_user_id: "444", status: "disconnected" }));
    expect(await findServedAccount(db.client as never, "444")).toBeNull();
  });
});
