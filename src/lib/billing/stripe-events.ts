import type Stripe from "stripe";

import { isAccessStatus, type QueryClient } from "@/lib/billing/access";

/**
 * Tradução dos eventos da Stripe para a tabela `subscriptions`. Puro: Stripe
 * e Supabase Auth entram por `deps`, então o teste roda sem rede.
 *
 * A Stripe não garante ordem de entrega: evento de assinatura de cliente
 * ainda desconhecido devolve "retry" (a rota responde 500 e a Stripe reenvia).
 *
 * O payload do evento é congelado quando ele nasce e a reentrega reaproveita o
 * mesmo corpo. Por isso `created`/`updated` não gravam o status do payload:
 * perguntam o estado atual à Stripe, como o checkout já faz.
 */

export const PURGE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Evento de assinatura de cliente desconhecido só pede reenvio enquanto é
 * recente (o checkout pode chegar depois). Passado isto, é cliente criado fora
 * do Checkout ou apagado pelo purge: 200 "ignored" com log, em vez de 500 por
 * 3 dias.
 */
export const UNKNOWN_CUSTOMER_RETRY_MS = 6 * 60 * 60 * 1000;

/** Status em que a assinatura antiga não volta mais: religar a linha não deixa nada vivo para trás. */
const FINAL_STATUSES = ["canceled", "incomplete_expired"];

/** Metadado gravado pela rota de checkout com o usuário logado. */
export const CHECKOUT_USER_METADATA = "falow_user_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StripeEventDeps {
  admin: QueryClient;
  retrieveSubscription(id: string): Promise<Stripe.Subscription>;
  findUserIdByEmail(email: string): Promise<string | null>;
  inviteUser(email: string): Promise<string>;
  now?: () => Date;
}

export type StripeEventResult =
  | { status: "processed" | "ignored" }
  | { status: "retry"; reason: string };

type Ref = string | { id: string } | null | undefined;

function idOf(ref: Ref): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/** Na API 2025-03+ o período mora nos itens; versões antigas tinham no topo. */
export function periodEndOf(sub: Stripe.Subscription): string | null {
  const raw =
    (sub as unknown as { items?: { data?: { current_period_end?: number }[] } }).items?.data?.[0]
      ?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000).toISOString() : null;
}

/**
 * O webhook só reconhece assinaturas do plano do Falow: algum item com o preço
 * `STRIPE_PRICE_ID`. Outro produto recorrente na mesma conta Stripe não cria
 * usuário nem mexe em `subscriptions`. Sem a env (testes, dev) não há filtro.
 */
export function isFalowSubscription(sub: Stripe.Subscription): boolean {
  const priceId = process.env.STRIPE_PRICE_ID?.trim();
  if (!priceId) return true;
  const items = (sub as unknown as { items?: { data?: { price?: Ref }[] } }).items?.data ?? [];
  return items.some((item) => idOf(item.price) === priceId);
}

/**
 * Campos de exclusão (`canceled_at`/`purge_after`) que um status manda gravar.
 * Regra única: o checkout e os eventos de assinatura usam esta mesma função.
 * - com acesso: zera a exclusão;
 * - canceled: agenda a exclusão em PURGE_AFTER_DAYS. Se a linha já estava
 *   cancelada com `purge_after` (reentrega), os dois valores ficam como estão,
 *   para a reentrega não empurrar o prazo;
 * - qualquer outro (incomplete, incomplete_expired, unpaid, paused): não toca.
 *   Só `canceled` agenda exclusão, e uma exclusão já agendada continua valendo.
 * Devolve só as chaves a gravar: chave ausente deixa a coluna como está, tanto
 * no update quanto no upsert.
 */
function lifecyclePatch(
  status: string,
  previous: { status?: string | null; purge_after?: string | null } | null,
  now: Date
): { canceled_at?: string | null; purge_after?: string | null } {
  if (isAccessStatus(status)) return { canceled_at: null, purge_after: null };
  if (status !== "canceled") return {};
  if (previous?.status === "canceled" && previous.purge_after) return {};
  return {
    canceled_at: now.toISOString(),
    purge_after: new Date(now.getTime() + PURGE_AFTER_DAYS * DAY_MS).toISOString(),
  };
}

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: StripeEventDeps
): Promise<StripeEventResult> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckout(event.data.object as Stripe.Checkout.Session, deps);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return handleSubscription(
        event.data.object as Stripe.Subscription,
        event.type === "customer.subscription.deleted",
        deps,
        typeof event.created === "number" ? event.created : null
      );
    default:
      return { status: "ignored" };
  }
}

async function handleCheckout(
  session: Stripe.Checkout.Session,
  deps: StripeEventDeps
): Promise<StripeEventResult> {
  if (session.mode !== "subscription") return { status: "ignored" };

  const customerId = idOf(session.customer as Ref);
  const subscriptionId = idOf(session.subscription as Ref);
  if (!customerId || !subscriptionId) {
    return { status: "retry", reason: "sessão sem cliente ou assinatura" };
  }

  // A sessão não traz os itens: o preço vem da assinatura. Recuperada antes de
  // achar ou convidar o usuário, senão a compra de outro produto da mesma conta
  // Stripe convidaria alguém para o Falow.
  const sub = await deps.retrieveSubscription(subscriptionId);
  if (!isFalowSubscription(sub)) {
    console.warn(`[stripe] checkout da assinatura ${subscriptionId} (cliente ${customerId}) ignorado: não é do preço do Falow (STRIPE_PRICE_ID).`);
    return { status: "ignored" };
  }

  // Reativação: o cliente da Stripe já tem linha. Compra nova: pelo e-mail.
  const { data: byCustomer, error: byCustomerError } = await deps.admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  // Falha de leitura não pode virar "cliente novo": cairia no caminho do e-mail
  // e poderia convidar um usuário duplicado.
  if (byCustomerError) {
    return { status: "retry", reason: `consulta por cliente falhou: ${byCustomerError.message}` };
  }
  let userId = (byCustomer as { user_id?: string } | null)?.user_id ?? null;

  // Compra feita logada: a rota de checkout grava o user_id no metadata da
  // sessão (só o servidor, com a chave secreta, cria sessão com metadata). Vale
  // mais que o e-mail digitado no Checkout, que a Stripe não verifica.
  if (!userId) {
    const fromMetadata = session.metadata?.[CHECKOUT_USER_METADATA];
    if (fromMetadata && UUID_RE.test(fromMetadata)) userId = fromMetadata;
  }

  // Sem login: pelo e-mail (não verificado). `byEmail` marca que a conta foi
  // achada só por ele, para não religar a linha de outra pessoa abaixo.
  let byEmail = false;
  if (!userId) {
    const email = session.customer_details?.email ?? session.customer_email ?? null;
    if (!email) return { status: "retry", reason: "sessão sem e-mail" };
    const existing = await deps.findUserIdByEmail(email);
    byEmail = Boolean(existing);
    userId = existing ?? (await deps.inviteUser(email));
  }

  const { data: previous, error: previousError } = await deps.admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status, purge_after")
    .eq("user_id", userId)
    .maybeSingle();
  if (previousError) {
    return { status: "retry", reason: `consulta do usuário falhou: ${previousError.message}` };
  }
  const prev = previous as {
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
    status?: string | null;
    purge_after?: string | null;
  } | null;

  // O e-mail do checkout não é verificado. Quem já tem uma assinatura com
  // acesso não troca de assinatura por outra compra: nem a compra em dobro do
  // próprio cliente, nem a de um terceiro que sabe o e-mail dele (religar a
  // linha deixaria a assinatura paga órfã e a conta cancelada quando o
  // terceiro parasse de pagar). A linha fica como está; a duplicada vai para o
  // log, para ser cancelada/reembolsada na mão. A mesma assinatura de novo
  // (reentrega do checkout) segue para o upsert, que é idempotente.
  if (prev && isAccessStatus(prev.status) && prev.stripe_subscription_id !== subscriptionId) {
    console.error(
      `[stripe] compra repetida ignorada: o usuário ${userId} já tem a assinatura ${prev.stripe_subscription_id} (cliente ${prev.stripe_customer_id}) com acesso e o checkout trouxe a assinatura ${subscriptionId} (cliente ${customerId}). A linha não foi alterada: cancelar/reembolsar ${subscriptionId} na Stripe.`
    );
    return { status: "processed" };
  }

  // Conta achada só pelo e-mail digitado e com uma assinatura ainda viva
  // (incomplete, unpaid, paused) em outro cliente da Stripe: religar trocaria o
  // cliente/assinatura dela pelos de quem pagou agora, deixando a dela órfã.
  // Só religa sobre assinatura encerrada (canceled/incomplete_expired) ou sem linha.
  if (byEmail && prev && prev.stripe_customer_id !== customerId && !FINAL_STATUSES.includes(prev.status ?? "")) {
    console.error(
      `[stripe] checkout sem login para o e-mail do usuário ${userId}, que tem a assinatura ${prev.stripe_subscription_id} (cliente ${prev.stripe_customer_id}) com status ${prev.status}: a linha não foi religada ao cliente ${customerId} / assinatura ${subscriptionId}. Conferir na Stripe e tratar à mão.`
    );
    return { status: "processed" };
  }

  const now = (deps.now ?? (() => new Date()))();
  const { error } = await deps.admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: periodEndOf(sub),
      updated_at: now.toISOString(),
      ...lifecyclePatch(sub.status, prev, now),
    },
    { onConflict: "user_id" }
  );
  if (error) return { status: "retry", reason: `upsert falhou: ${error.message}` };
  return { status: "processed" };
}

async function handleSubscription(
  sub: Stripe.Subscription,
  deleted: boolean,
  deps: StripeEventDeps,
  eventCreated: number | null = null
): Promise<StripeEventResult> {
  // Assinatura de outro produto: nem consulta (sem isso cada evento dela daria
  // "cliente ainda desconhecido" e 500 por dias).
  if (!isFalowSubscription(sub)) {
    console.warn(`[stripe] evento da assinatura ${sub.id} ignorado: não é do preço do Falow (STRIPE_PRICE_ID).`);
    return { status: "ignored" };
  }

  const customerId = idOf(sub.customer as Ref);
  const { data, error: lookupError } = await deps.admin
    .from("subscriptions")
    .select("user_id, stripe_subscription_id, status, purge_after")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (lookupError) {
    return { status: "retry", reason: `consulta da assinatura falhou: ${lookupError.message}` };
  }
  const row = data as {
    user_id: string;
    stripe_subscription_id: string | null;
    status: string | null;
    purge_after: string | null;
  } | null;
  const now = (deps.now ?? (() => new Date()))();
  if (!row) {
    // Cancelamento de quem não tem linha (purgado, ou nunca entrou): nada a cancelar.
    if (deleted) {
      console.warn(`[stripe] deleted da assinatura ${sub.id} de cliente desconhecido (${customerId}) ignorado.`);
      return { status: "ignored" };
    }
    const ageMs = eventCreated === null ? 0 : now.getTime() - eventCreated * 1000;
    if (ageMs > UNKNOWN_CUSTOMER_RETRY_MS) {
      console.error(
        `[stripe] assinatura ${sub.id} do cliente ${customerId}, desconhecido há mais de ${UNKNOWN_CUSTOMER_RETRY_MS / 3_600_000}h: ignorada. Se foi criada no dashboard da Stripe, vincular o cliente ao usuário à mão.`
      );
      return { status: "ignored" };
    }
    return { status: "retry", reason: "cliente ainda desconhecido" };
  }

  // O payload de created/updated é o retrato de quando o evento nasceu e pode
  // chegar velho: a verdade é o estado atual na Stripe. O payload do deleted já
  // é final, então não precisa de consulta.
  let current: Stripe.Subscription | null = deleted ? sub : null;

  if (row.stripe_subscription_id && row.stripe_subscription_id !== sub.id) {
    // Outra assinatura do mesmo cliente. Quem tem acesso não troca (evento de
    // assinatura antiga/duplicada não derruba a vigente); deleted de outra nunca
    // mexe. Sem acesso, aceita a nova se ela dá acesso de verdade: é a
    // assinatura criada no dashboard da Stripe para um cliente cancelado.
    if (deleted || isAccessStatus(row.status)) return { status: "ignored" };
    current = await deps.retrieveSubscription(sub.id);
    if (!isAccessStatus(current.status)) return { status: "ignored" };
  } else if (!deleted && row.status === "canceled" && row.stripe_subscription_id === sub.id) {
    // Cancelada é final para um id de assinatura (reativar sempre traz um id
    // novo). Só o próprio `deleted`, reentregue, volta a mexer na linha; um
    // updated/created atrasado não pode reabrir o acesso nem sumir com o purge.
    return { status: "ignored" };
  }

  current ??= await deps.retrieveSubscription(sub.id);
  const status = deleted ? "canceled" : current.status;
  const patch = {
    stripe_subscription_id: sub.id,
    status,
    current_period_end: periodEndOf(current),
    updated_at: now.toISOString(),
    ...lifecyclePatch(status, row, now),
  };

  const { error } = await deps.admin.from("subscriptions").update(patch).eq("user_id", row.user_id);
  if (error) return { status: "retry", reason: `update falhou: ${error.message}` };
  return { status: "processed" };
}
