// Rotas de cobrança: "Assinar"/"Reativar" (checkout) e "Minha assinatura" (portal).
// Supabase e Stripe mockados; a decisão pura do checkout está em src/lib/billing/checkout.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, checkoutCreate, portalCreate, subsList, selects } = vi.hoisted(() => ({
  state: {
    user: null as { id: string; email?: string } | null,
    row: null as Record<string, unknown> | null,
    grant: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
  },
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
  subsList: vi.fn(),
  selects: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: (cols: string) => {
        selects.push(`${table}:${cols}`);
        return {
          eq: (col: string, val: string) => ({
            maybeSingle: async () =>
              state.error
                ? { data: null, error: state.error }
                : {
                    data:
                      state.user && col === "user_id" && val === state.user.id
                        ? table === "access_grants"
                          ? state.grant
                          : state.row
                        : null,
                    error: null,
                  },
          }),
        };
      },
    }),
  }),
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: checkoutCreate } },
    billingPortal: { sessions: { create: portalCreate } },
    subscriptions: { list: subsList },
  }),
}));

import { POST as checkoutPOST } from "@/app/api/billing/checkout/route";
import { POST as portalPOST } from "@/app/api/billing/portal/route";

/** POST de formulário do próprio app (Origin igual ao do NEXT_PUBLIC_APP_URL). */
function post(path: string, headers: Record<string, string> = { origin: "https://falow.app.br" }) {
  return new Request(`https://falow.app.br/sistema${path}`, { method: "POST", headers });
}
const checkoutReq = (h?: Record<string, string>) => checkoutPOST(post("/api/billing/checkout", h));
const portalReq = (h?: Record<string, string>) => portalPOST(post("/api/billing/portal", h));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://falow.app.br/sistema");
  vi.stubEnv("STRIPE_PRICE_ID", "price_123");
  state.user = null;
  state.row = null;
  state.grant = null;
  state.error = null;
  selects.length = 0;
  checkoutCreate.mockReset();
  portalCreate.mockReset();
  subsList.mockReset();
  subsList.mockResolvedValue({ data: [{ status: "canceled" }] });
  checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
  portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/p/session/bps_1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/billing/checkout", () => {
  it("visitante: sessao nova sem customer nem customer_email, volta para a landing", async () => {
    const res = await checkoutReq();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
    const params = checkoutCreate.mock.calls[0][0];
    expect(params).toEqual({
      mode: "subscription",
      line_items: [{ price: "price_123", quantity: 1 }],
      success_url: "https://falow.app.br/sistema/assinatura/obrigado",
      cancel_url: "https://falow.app.br/sistema/",
      locale: "pt-BR",
      allow_promotion_codes: true,
    });
    expect("customer" in params).toBe(false);
    expect("customer_email" in params).toBe(false);
    expect(selects).toEqual([]);
  });

  it("logado sem linha: customer_email, cancel volta para /assinatura", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    await checkoutReq();
    const params = checkoutCreate.mock.calls[0][0];
    expect(params.customer_email).toBe("c1@x.com");
    expect("customer" in params).toBe(false);
    expect(params.cancel_url).toBe("https://falow.app.br/sistema/assinatura");
    expect(selects[0]).toBe("subscriptions:status, stripe_customer_id");
    expect(selects[1]).toMatch(/^access_grants:/);
    expect(params.client_reference_id).toBe("c1");
    expect(params.metadata).toEqual({ falow_user_id: "c1" });
    expect(params.subscription_data).toEqual({ metadata: { falow_user_id: "c1" } });
  });

  it("cancelado: reaproveita o customer e nao manda customer_email", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { status: "canceled", stripe_customer_id: "cus_9" };
    await checkoutReq();
    const params = checkoutCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_9");
    expect("customer_email" in params).toBe(false);
  });

  it("com acesso: 303 para /dashboard, sem tocar na Stripe", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { status: "past_due", stripe_customer_id: "cus_9" };
    const res = await checkoutReq();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/dashboard");
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("dono: 303 para /dashboard, sem tocar na Stripe", async () => {
    state.user = { id: "user-1", email: "dono@x.com" };
    const res = await checkoutReq();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/dashboard");
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("falha ao ler a assinatura: volta para /assinatura, sem abrir 2o Checkout, e registra o erro", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = { id: "c1", email: "c1@x.com" };
    state.error = { message: "boom" };
    const res = await checkoutReq();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(checkoutCreate).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[billing] falha ao ler a assinatura:", "boom");
  });

  it("sem erro de leitura nao registra nada no console.error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = { id: "c1", email: "c1@x.com" };
    await checkoutReq();
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/checkout: abuso e casos de borda", () => {
  it("origem de outro site: 403 sem tocar na Stripe", async () => {
    const res = await checkoutReq({ origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("sem Origin nem Sec-Fetch-Site nem Referer: 403", async () => {
    expect((await checkoutReq({})).status).toBe(403);
  });

  it("sem Origin mas com Sec-Fetch-Site same-origin: aceita", async () => {
    const res = await checkoutReq({ "sec-fetch-site": "same-origin" });
    expect(res.status).toBe(303);
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it("bloqueado: volta para /assinatura sem abrir Checkout", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { status: "canceled", stripe_customer_id: "cus_9" };
    state.grant = { kind: "block" };
    const res = await checkoutReq();
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("cliente com assinatura incomplete na Stripe vai ao portal, não a um 2o Checkout", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { status: "incomplete", stripe_customer_id: "cus_9" };
    subsList.mockResolvedValue({ data: [{ status: "incomplete" }] });
    const res = await checkoutReq();
    expect(subsList).toHaveBeenCalledWith({ customer: "cus_9", status: "all", limit: 20 });
    expect(res.headers.get("location")).toBe("https://billing.stripe.com/p/session/bps_1");
    expect(portalCreate).toHaveBeenCalledWith({ customer: "cus_9", return_url: "https://falow.app.br/sistema/assinatura" });
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("falha ao listar as assinaturas do cliente: /assinatura, sem Checkout", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { status: "canceled", stripe_customer_id: "cus_9" };
    subsList.mockRejectedValue(new Error("stripe fora"));
    const res = await checkoutReq();
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(checkoutCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/portal: origem", () => {
  it("origem de outro site: 403", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { stripe_customer_id: "cus_9" };
    const res = await portalReq({ origin: "https://falow.app.br.evil.example" });
    expect(res.status).toBe(403);
    expect(portalCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/portal", () => {
  it("sem login: 303 para /login", async () => {
    const res = await portalReq();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/login");
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("logado sem assinatura: 303 para /assinatura", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    const res = await portalReq();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("com assinatura: abre o portal do customer e volta para o painel", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { stripe_customer_id: "cus_9" };
    const res = await portalReq();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://billing.stripe.com/p/session/bps_1");
    expect(portalCreate).toHaveBeenCalledWith({
      customer: "cus_9",
      return_url: "https://falow.app.br/sistema/dashboard",
    });
  });

  it("falha ao ler a assinatura: volta para /assinatura, sem abrir o portal, e registra o erro", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { stripe_customer_id: "cus_9" };
    state.error = { message: "boom" };
    const res = await portalReq();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(portalCreate).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[billing] falha ao ler a assinatura:", "boom");
  });
});
