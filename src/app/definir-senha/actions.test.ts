import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, jar } = vi.hoisted(() => ({
  auth: { verifyOtp: vi.fn(), updateUser: vi.fn(), getUser: vi.fn(), signOut: vi.fn() },
  /** Cookies do navegador entre uma chamada e outra (a marca da retentativa mora aqui). */
  jar: new Map<string, { value: string; maxAge?: number }>(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth }) }));
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, opts: { maxAge?: number }) => {
      if (opts?.maxAge === 0) jar.delete(name);
      else jar.set(name, { value, maxAge: opts?.maxAge });
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { setPassword } from "@/app/definir-senha/actions";

const MSG_WEAK = "Essa senha é fraca demais para esta conta. Escolha uma mais longa e difícil de adivinhar.";
const MSG_SAME = "Escolha uma senha diferente da que você já tinha.";
const MSG_GENERIC = "Não foi possível salvar a senha. Tente de novo.";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** O que `getUser()` enxerga nos cookies: um usuário logado ou ninguém. */
function withSession(user: { id: string } | null) {
  auth.getUser = vi.fn(async () => ({ data: { user } }));
}

function expectSupabaseUntouched() {
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  expect(auth.getUser).not.toHaveBeenCalled();
  expect(auth.updateUser).not.toHaveBeenCalled();
}

/** Primeira tentativa com o link gasto e a senha recusada: deixa a marca da retentativa para `uid`. */
async function failFirstAttempt(uid: string) {
  auth.verifyOtp = vi.fn(async () => ({ data: { user: { id: uid } }, error: null }));
  auth.updateUser = vi.fn(async () => ({ error: { code: "weak_password", message: "weak" } }));
  const r = await setPassword(form({ token_hash: "abc", type: "recovery", password: "segredo123", confirm: "segredo123" }));
  expect(r.sessionReady).toBe(true);
  auth.verifyOtp = vi.fn(async () => ({ error: null }));
  auth.updateUser = vi.fn(async () => ({ error: null }));
}

describe("setPassword", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "c".repeat(64));
    jar.clear();
    auth.verifyOtp = vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null }));
    auth.updateUser = vi.fn(async () => ({ error: null }));
    auth.signOut = vi.fn(async () => ({ error: null }));
    withSession(null);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("valida o token só no envio e define a senha", async () => {
    await expect(
      setPassword(form({ token_hash: "abc", type: "invite", password: "segredo123", confirm: "segredo123" }))
    ).rejects.toThrow("REDIRECT:/dashboard");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "invite", token_hash: "abc" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "segredo123" });
    // Senha trocada derruba as outras sessões do usuário.
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("recusa senhas diferentes sem gastar o token", async () => {
    const r = await setPassword(form({ token_hash: "abc", type: "invite", password: "segredo123", confirm: "outra1234" }));
    expect(r.error).toBeTruthy();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("recusa tipo de link desconhecido", async () => {
    const r = await setPassword(form({ token_hash: "abc", type: "magiclink", password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toBeTruthy();
    expectSupabaseUntouched();
  });

  it("link vencido vira mensagem clara", async () => {
    auth.verifyOtp = vi.fn(async () => ({ error: { message: "Token has expired or is invalid" } }));
    const r = await setPassword(form({ token_hash: "abc", type: "recovery", password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toMatch(/expirou/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("link vencido não cai na sessão de quem já está logado no navegador", async () => {
    withSession({ id: "outra-pessoa" });
    auth.verifyOtp = vi.fn(async () => ({ error: { message: "Token has expired or is invalid" } }));
    const r = await setPassword(form({ token_hash: "abc", type: "recovery", password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toMatch(/expirou/);
    // O token não foi gasto: a tela continua mandando o token na próxima tentativa.
    expect(r.sessionReady).toBeUndefined();
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "same_password",
      error: { code: "same_password", message: "New password should be different from the old password." },
      expected: MSG_SAME,
    },
    {
      label: "weak_password",
      error: { code: "weak_password", message: "Password is known to be weak and easy to guess" },
      expected: MSG_WEAK,
    },
    { label: "erro sem code", error: { message: "boom" }, expected: MSG_GENERIC },
    {
      label: "outro code",
      error: { code: "over_request_rate_limit", message: "Request rate limit reached" },
      expected: MSG_GENERIC,
    },
  ])("senha recusada com $label: mensagem em português e a tela avisa que a sessão já está aberta", async ({ error, expected }) => {
    auth.updateUser = vi.fn(async () => ({ error }));
    // O mock de redirect lança: se tivesse redirecionado, este await rejeitaria.
    const r = await setPassword(form({ token_hash: "abc", type: "recovery", password: "segredo123", confirm: "segredo123" }));
    expect(r).toEqual({ error: expected, sessionReady: true });
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it("retentativa sem token usa a sessão que a tentativa anterior abriu", async () => {
    await failFirstAttempt("u1");
    withSession({ id: "u1" });
    await expect(setPassword(form({ password: "segredo123", confirm: "segredo123" }))).rejects.toThrow(
      "REDIRECT:/dashboard"
    );
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "segredo123" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    // A marca é de uso único: depois de salvar, a sessão sozinha não troca mais a senha.
    expect(jar.size).toBe(0);
  });

  it("sessão aberta sem a marca da retentativa não troca a senha (N-01)", async () => {
    withSession({ id: "u1" });
    const r = await setPassword(form({ password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toMatch(/sessão expirou/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("marca de outro usuário não vale para a sessão atual", async () => {
    await failFirstAttempt("u1");
    withSession({ id: "outra-pessoa" });
    const r = await setPassword(form({ password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toMatch(/sessão expirou/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("marca vencida não vale", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-29T12:00:00Z") });
    try {
      await failFirstAttempt("u1");
      vi.setSystemTime(new Date("2026-10-29T12:11:00Z"));
      withSession({ id: "u1" });
      const r = await setPassword(form({ password: "segredo123", confirm: "segredo123" }));
      expect(r.error).toMatch(/sessão expirou/);
      expect(auth.updateUser).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marca adulterada não vale", async () => {
    withSession({ id: "u1" });
    jar.set("falow_pwd_retry", { value: "a.b.c" });
    const r = await setPassword(form({ password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toMatch(/sessão expirou/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("retentativa sem token recusada de novo continua pronta para outra tentativa", async () => {
    await failFirstAttempt("u1");
    withSession({ id: "u1" });
    auth.updateUser = vi.fn(async () => ({ error: { code: "weak_password", message: "weak" } }));
    const r = await setPassword(form({ password: "segredo123", confirm: "segredo123" }));
    expect(r).toEqual({ error: MSG_WEAK, sessionReady: true });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("retentativa sem token e sem sessão pede um link novo", async () => {
    withSession(null);
    const r = await setPassword(form({ password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toMatch(/sessão expirou/);
    expect(r.sessionReady).toBeUndefined();
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("recusa senha curta sem chamar o Supabase", async () => {
    const r = await setPassword(form({ token_hash: "abc", type: "invite", password: "1234567", confirm: "1234567" }));
    expect(r.error).toMatch(/8 caracteres/);
    expectSupabaseUntouched();
  });

  it("token sem tipo é link inválido e não chama o Supabase", async () => {
    const r = await setPassword(form({ token_hash: "abc", password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toMatch(/Link inválido/);
    expectSupabaseUntouched();
  });

  it("tela aberta sem token (campos vazios) é link inválido, não retentativa com sessão", async () => {
    withSession({ id: "u1" }); // mesmo com alguém logado no navegador
    const r = await setPassword(form({ token_hash: "", type: "", password: "segredo123", confirm: "segredo123" }));
    expect(r.error).toMatch(/Link inválido/);
    expectSupabaseUntouched();
  });
});
