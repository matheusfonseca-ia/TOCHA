import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({
  auth: { verifyOtp: vi.fn(), updateUser: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { setPassword } from "@/app/definir-senha/actions";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("setPassword", () => {
  beforeEach(() => {
    auth.verifyOtp = vi.fn(async () => ({ error: null }));
    auth.updateUser = vi.fn(async () => ({ error: null }));
  });

  it("valida o token só no envio e define a senha", async () => {
    await expect(
      setPassword(form({ token_hash: "abc", type: "invite", password: "segredo123", confirm: "segredo123" }))
    ).rejects.toThrow("REDIRECT:/dashboard");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "invite", token_hash: "abc" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "segredo123" });
  });

  it("recusa senhas diferentes sem gastar o token", async () => {
    const r = await setPassword(form({ token_hash: "abc", type: "invite", password: "segredo123", confirm: "outra1234" }));
    expect(r.error).toBeTruthy();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("recusa tipo de link desconhecido", async () => {
    const r = await setPassword(form({ token_hash: "abc", type: "magiclink", password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toBeTruthy();
  });

  it("link vencido vira mensagem clara", async () => {
    auth.verifyOtp = vi.fn(async () => ({ error: { message: "Token has expired or is invalid" } }));
    const r = await setPassword(form({ token_hash: "abc", type: "recovery", password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toMatch(/expirou/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
