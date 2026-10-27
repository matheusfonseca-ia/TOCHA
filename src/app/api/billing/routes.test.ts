// Rotas de cobrança: "Assinar"/"Reativar" (checkout) e "Minha assinatura" (portal).
// Supabase e Stripe mockados; a decisão pura do checkout está em src/lib/billing/checkout.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, checkoutCreate, portalCreate, selects } = vi.hoisted(() => ({
  state: {
    user: null as { id: string; email?: string } | null,
    row: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
  },
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
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
                    data: state.user && col === "user_id" && val === state.user.id ? state.row : null,
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
  }),
}));

import { POST as checkoutPOST } from "@/app/api/billing/checkout/route";
import { POST as portalPOST } from "@/app/api/billing/portal/route";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://falow.app.br/sistema");
  vi.stubEnv("STRIPE_PRICE_ID", "price_123");
  state.user = null;
  state.row = null;
  state.error = null;
  selects.length = 0;
  checkoutCreate.mockReset();
  portalCreate.mockReset();
  checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
  portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/p/session/bps_1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/billing/checkout", () => {
  it("visitante: sessao nova sem customer nem customer_email, volta para a landing", async () => {
    const res = await checkoutPOST();
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
    await checkoutPOST();
    const params = checkoutCreate.mock.calls[0][0];
    expect(params.customer_email).toBe("c1@x.com");
    expect("customer" in params).toBe(false);
    expect(params.cancel_url).toBe("https://falow.app.br/sistema/assinatura");
    expect(selects).toEqual(["subscriptions:status, stripe_customer_id"]);
  });

  it("cancelado: reaproveita o customer e nao manda customer_email", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { status: "canceled", stripe_customer_id: "cus_9" };
    await checkoutPOST();
    const params = checkoutCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_9");
    expect("customer_email" in params).toBe(false);
  });

  it("com acesso: 303 para /dashboard, sem tocar na Stripe", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { status: "past_due", stripe_customer_id: "cus_9" };
    const res = await checkoutPOST();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/dashboard");
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("dono: 303 para /dashboard, sem tocar na Stripe", async () => {
    state.user = { id: "user-1", email: "dono@x.com" };
    const res = await checkoutPOST();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/dashboard");
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("falha ao ler a assinatura: volta para /assinatura, sem abrir 2o Checkout, e registra o erro", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = { id: "c1", email: "c1@x.com" };
    state.error = { message: "boom" };
    const res = await checkoutPOST();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(checkoutCreate).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[billing] falha ao ler a assinatura:", "boom");
  });

  it("sem erro de leitura nao registra nada no console.error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.user = { id: "c1", email: "c1@x.com" };
    await checkoutPOST();
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/portal", () => {
  it("sem login: 303 para /login", async () => {
    const res = await portalPOST();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/login");
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("logado sem assinatura: 303 para /assinatura", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    const res = await portalPOST();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("com assinatura: abre o portal do customer e volta para o painel", async () => {
    state.user = { id: "c1", email: "c1@x.com" };
    state.row = { stripe_customer_id: "cus_9" };
    const res = await portalPOST();
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
    const res = await portalPOST();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://falow.app.br/sistema/assinatura");
    expect(portalCreate).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[billing] falha ao ler a assinatura:", "boom");
  });
});
