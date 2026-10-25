import { describe, expect, it } from "vitest";

import { connectBlockReason } from "@/lib/meta/connect-guard";

const base = { userId: "c1", igUserId: "111", owner: false };

describe("connectBlockReason", () => {
  it("primeira conta conecta", () => {
    expect(connectBlockReason({ ...base, activeAccounts: [] })).toBeNull();
  });
  it("reconectar o mesmo @ (renovar token) é liberado", () => {
    expect(connectBlockReason({ ...base, activeAccounts: [{ user_id: "c1", ig_user_id: "111" }] })).toBeNull();
  });
  it("segundo @ do cliente esbarra no limite", () => {
    expect(connectBlockReason({ ...base, activeAccounts: [{ user_id: "c1", ig_user_id: "999" }] })).toBe("account_limit");
  });
  it("@ já ligado em outro login é recusado", () => {
    expect(connectBlockReason({ ...base, activeAccounts: [{ user_id: "outro", ig_user_id: "111" }] })).toBe("account_taken");
  });
  it("dono não tem limite, mas também não pega @ de outro", () => {
    const owner = { userId: "user-1", igUserId: "111", owner: true };
    expect(connectBlockReason({ ...owner, activeAccounts: [{ user_id: "user-1", ig_user_id: "999" }] })).toBeNull();
    expect(connectBlockReason({ ...owner, activeAccounts: [{ user_id: "outro", ig_user_id: "111" }] })).toBe("account_taken");
  });
});
