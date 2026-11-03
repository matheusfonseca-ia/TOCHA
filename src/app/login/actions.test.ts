import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, allow } = vi.hoisted(() => ({
  auth: { signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn() },
  allow: vi.fn(async () => true),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth }) }));
vi.mock("@/lib/auth/rate-limit", () => ({ allowAuthAttempt: allow }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { requestPasswordReset, signIn } from "@/app/login/actions";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  allow.mockResolvedValue(true);
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("signIn com limite por e-mail", () => {
  it("dentro do limite: segue para o Supabase", async () => {
    await expect(signIn(form({ email: "a@b.com", password: "123456" }))).rejects.toThrow("REDIRECT:/dashboard");
    expect(allow).toHaveBeenCalledWith("login", "a@b.com");
    expect(auth.signInWithPassword).toHaveBeenCalled();
  });

  it("estourou: recusa sem chamar o Supabase", async () => {
    allow.mockResolvedValue(false);
    const result = await signIn(form({ email: "a@b.com", password: "123456" }));
    expect(result.error).toMatch(/Muitas tentativas/);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("formulário inválido não gasta tentativa", async () => {
    await signIn(form({ email: "nao-e-email", password: "123456" }));
    expect(allow).not.toHaveBeenCalled();
  });
});

describe("requestPasswordReset com limite por e-mail", () => {
  it("estourou: não envia e responde igual", async () => {
    const ok = await requestPasswordReset(form({ email: "a@b.com" }));
    allow.mockResolvedValue(false);
    const blocked = await requestPasswordReset(form({ email: "a@b.com" }));
    expect(blocked).toEqual(ok);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(allow).toHaveBeenLastCalledWith("reset", "a@b.com");
  });
});
