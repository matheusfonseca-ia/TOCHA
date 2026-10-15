# Falow multiusuário (SaaS com Stripe) — design

**Data:** 2026-10-15
**Status:** aprovado no brainstorming, aguardando plano de implementação

## Objetivo

Transformar a instalação atual do Falow (repo `matheusfonseca-ia/TOCHA`) em SaaS
vendido por assinatura. Uma instalação só, no mesmo repo, mesmo Supabase e mesmo
app Meta (App Review aprovado). A conta do Matheus vira um usuário comum marcado
como dono; os dados dele não mudam.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Instalações | Uma só. Sem fork, sem versão pessoal separada |
| Cobrança | Stripe, assinatura recorrente, plano único (`STRIPE_PRICE_ID`) |
| Entrada | Paga primeiro; a conta é criada pelo webhook da Stripe |
| Logins | Um login por assinatura (sem equipe) |
| Limite | 1 conta de Instagram por assinatura; dono sem limite |
| IA nos campos | Só o dono |
| Cancelamento | Bot pausa na hora; dados apagados 30 dias depois; reativar no prazo recupera tudo |
| Integração | Webhook da Stripe numa rota do próprio app (sem n8n, sem Sync Engine) |
| Hospedagem | Cloudflare Workers (OpenNext), plano Workers Paid |
| Domínio | `falow.app.br` (app e remetente de e-mail) |
| E-mail | Resend como SMTP do Supabase Auth, remetente `@falow.app.br` |

## 1. Compra, conta e acesso

### Compra
1. Landing (`/`) tem o botão **Assinar** → `POST /api/billing/checkout` cria uma
   Checkout Session da Stripe (modo `subscription`, `STRIPE_PRICE_ID`),
   `success_url` = `/assinatura/obrigado`, `cancel_url` = `/`.
2. `/assinatura/obrigado` (pública): "confira seu e-mail pra definir sua senha".
3. Stripe chama `POST /api/webhooks/stripe`:
   - lê o corpo cru (`request.text()`) e valida com
     `stripe.webhooks.constructEventAsync(..., Stripe.createSubtleCryptoProvider())`
     (o `constructEvent` síncrono não roda no Workers); cliente Stripe criado com
     `httpClient: Stripe.createFetchHttpClient()`; assinatura inválida → 400;
   - idempotência pelo `event.id` (tabela `stripe_events`, igual a `processed_events`);
   - `checkout.session.completed`: pega o e-mail da sessão; se não existe usuário no
     Supabase Auth, cria com `auth.admin.inviteUserByEmail` (redirect para
     `/definir-senha`); se existe, reaproveita. Busca a assinatura com
     `stripe.subscriptions.retrieve(session.subscription)` (o evento de checkout não
     traz `status` nem `current_period_end`) e faz upsert em `subscriptions`.

### Login
- Remover aba "Criar conta", a action `signUp` e `src/lib/config.ts` (`isSignupOpen`).
- Adicionar "Esqueci minha senha" (`resetPasswordForEmail`) e a página
  `/definir-senha`, que atende o link de convite e o de recuperação. Os templates de
  e-mail do Supabase (convite e recuperação) passam a apontar para
  `https://falow.app.br/definir-senha?token_hash={{ .TokenHash }}&type=invite`
  (ou `type=recovery`); a página chama `verifyOtp({ type, token_hash })` e depois
  `updateUser({ password })`. Não usar troca de código PKCE: o link de convite não
  traz `code` e o de recuperação PKCE só funciona no mesmo navegador.
- Desligar "Allow new users to sign up" no Supabase Auth. Convite via admin continua
  funcionando. Fecha o furo atual de chamar `auth.signUp` direto com a chave anon.
- `/assinatura/obrigado` e `/definir-senha` entram em `PUBLIC_PATHS` do middleware.

### Portal
- Botão **Minha assinatura** no painel → `POST /api/billing/portal` cria sessão do
  Customer Portal da Stripe (cartão, notas, cancelamento).

### Dono
- Env `FALOW_OWNER_USER_ID`. `isOwner(userId)` em `src/lib/billing/access.ts`.
- Dono: ignora checagem de assinatura, sem limite de @, único com IA.
- Sem tabela de papéis nem painel de admin.

## 2. Dados e controle de acesso

### Migration nova (`0016_subscriptions.sql`)
```
subscriptions (
  user_id                uuid primary key references auth.users on delete cascade,
  stripe_customer_id     text unique not null,
  stripe_subscription_id text unique,
  status                 text not null,   -- espelha o status da Stripe
  current_period_end     timestamptz,
  canceled_at            timestamptz,
  purge_after            timestamptz,
  updated_at             timestamptz not null default now()
)
stripe_events (id text primary key, received_at timestamptz default now())
```
- RLS: `subscriptions` só `select` da própria linha; `stripe_events` sem policy
  (só service role).
- Índice único parcial `ig_accounts (ig_user_id) where status = 'active'`. Já existe
  `ig_accounts_ig_user_id_idx` com essa expressão, mas **não único** (0001): dropar
  e criar o único com nome novo (`ig_accounts_active_ig_user_id_key`), senão o
  `if not exists` não faz nada. Antes, conferir que não há duplicata ativa.

### Regra de acesso
`hasActiveAccess(userId)`: dono **ou** `status in ('active','trialing','past_due')`.
`past_due` mantém acesso durante as tentativas de cobrança da Stripe; `unpaid` e
`canceled` cortam.

### Eventos da Stripe
| Evento | Efeito |
|---|---|
| `checkout.session.completed` | cria/reaproveita usuário, upsert da assinatura, zera `canceled_at`/`purge_after` |
| `customer.subscription.updated` | atualiza `status`, `current_period_end` |
| `customer.subscription.deleted` | `status = canceled`, `canceled_at = now()`, `purge_after = now() + 30 dias` |

O usuário é achado por `stripe_customer_id`; no primeiro checkout, pelo e-mail.
A Stripe não garante ordem: `customer.subscription.created/updated` pode chegar
antes do `checkout.session.completed`. Evento de assinatura com cliente ainda
desconhecido → responder 500 (sem gravar em `stripe_events`) para a Stripe
reenviar depois. `customer.subscription.created` é tratado igual ao `updated`.

### As 4 portas
1. **Painel** — middleware: logado sem acesso → redirect para `/assinatura` (mostra
   status, data de exclusão e botão **Reativar**, que cria Checkout Session com o
   mesmo `customer`). `/assinatura` exige login mas é isenta da checagem de acesso
   (senão vira loop), assim como `/login`, `/definir-senha` e as rotas
   `/api/billing/*`. Server actions passam pelo middleware.
2. **Webhook da Meta** (`src/lib/meta/process.ts`) — após localizar a conta, se o
   usuário a quem ela pertence (`ig_accounts.user_id`) não tem acesso → log
   `subscription_inactive`, sem resposta.
3. **Cron das sequências** (`processDueRuns`) — pula execuções de contas sem acesso
   (não avança, não apaga).
4. **IA** — `isAiEnabled` e a action de gerar exigem chave **e** `isOwner`.

### Limite de 1 @
No callback do OAuth (`src/app/api/auth/meta/callback/route.ts`):
- cliente com outra conta ativa → erro `account_limit` na tela de contas;
- @ já ativo em outro usuário → erro `account_taken`;
- reconectar o mesmo @ (renovar token) continua liberado; dono sem limite.

## 3. Isolamento entre clientes

1. **Helpers de posse** em `src/lib/auth/ownership.ts`:
   `requireOwnedAccount(accountId)` e `requireOwnedConversation(id)` — conferem com
   o client do usuário (RLS) e devolvem a linha ou lançam. Toda server action que
   usa `createAdminClient` passa a chamar um deles antes de gravar. Regra
   verificável: `grep` de actions com admin sem helper = zero.
2. **Caminhos internos** (webhook, cron, captura, import, perfil): revisar que todo
   filtro carrega `account_id`. `src/app/(dashboard)/crm/funil/page.tsx` (admin numa
   página) entra na revisão.
3. **Teste A×B**: dois usuários falsos; B tenta ler/alterar conversa, tag, nota,
   lead, regra e sequência de A pelas actions e pelo RLS. Tudo falha. Fica na suíte.
4. **`crm-uploads`**: continua público (a Meta baixa pela URL); caminho
   `account_id/<uuid>.ext`; conferir que não há policy de listagem para anon.
5. **Logs/métricas/dashboard**: confirmar que leem só pelo client do usuário.

## 4. Cancelamento, operação e testes

### Exclusão
- `GET /api/cron/purge` (protegido por `CRON_SECRET`), 1x/dia: para cada
  `subscriptions` com `purge_after < now()` e sem acesso, apaga os arquivos do
  usuário no `crm-uploads` e depois o usuário no Auth (cascade leva `ig_accounts` e
  tudo pendurado). Nunca toca o dono.

### Cloudflare
- `wrangler.toml`: rota `falow.app.br` (custom domain), no lugar de
  `falow.methodgrowthhub.com.br`.
- Entrada própria do Worker (ex.: `worker.ts`), apontada no `main` do
  `wrangler.toml`: `export * from "./.open-next/worker.js"` (reexporta as classes de
  Durable Object do OpenNext) + default com o `fetch` do OpenNext e um `scheduled()`
  que chama o handler direto, sem ir pela rede:
  `handler.fetch(new Request("https://falow.app.br/api/cron/..."), env, ctx)` com
  `Authorization: Bearer <CRON_SECRET>`.
  - `* * * * *` → `/api/cron/sequences`
  - `0 6 * * *` → `/api/cron/purge`
  `[triggers] crons` no `wrangler.toml`.
- Remover `vercel.json` e o script `build:vercel`. `check-db-schema.mjs` passa a
  encadear no `build:cloudflare` (precisa de `NEXT_PUBLIC_SUPABASE_URL` e
  `SUPABASE_SERVICE_ROLE_KEY` no ambiente do build, que não são os secrets do
  Worker), ganha `subscriptions` e `stripe_events` em `requiredColumns` e perde a
  menção à Vercel na mensagem de erro.
- Plano Workers Paid (limites de CPU e tamanho do gratuito não comportam o app).
- Deploy: migrations primeiro, depois `wrangler deploy` (manual ou GitHub Action).
- Secrets no Worker (`wrangler secret put`), não no repo.

### Domínio e Meta
- `NEXT_PUBLIC_APP_URL=https://falow.app.br`.
- No app Meta aprovado: App Domains, redirect do OAuth, URL do webhook e as três
  URLs legais para `falow.app.br`. Reconectar o @ do dono depois.
- Pendência manual: campo "Site" do portfólio empresarial.

### E-mail
- Resend como SMTP customizado do Supabase Auth, remetente
  `nao-responda@falow.app.br`, SPF/DKIM no DNS da Cloudflare.
- Templates de convite e recuperação em português.

### Variáveis novas
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`,
`FALOW_OWNER_USER_ID`. `.env.example` e README atualizados.

### Textos
- Termos: assinatura, cancelamento pelo portal, exclusão em 30 dias, arrependimento
  de 7 dias (CDC art. 49) com reembolso integral.
- Privacidade: Stripe como operadora, prazo de 30 dias. Controlador continua
  PATRICIA POLETINI FONSECA, CNPJ 15.030.598/0001-39.
- Landing: tira "self-hosted / instalação sua", entra texto de venda + Assinar.
- README: descreve o SaaS.

### Testes (vitest, Stripe mockada)
- webhook Stripe: cada evento, conta criada vs. reaproveitada, assinatura inválida
  recusada, evento repetido ignorado;
- `hasActiveAccess` por status e para o dono;
- callback OAuth: `account_limit`, `account_taken`, reconexão permitida;
- webhook Meta calado e cron pulando conta sem acesso;
- purge apaga só quem venceu e nunca o dono;
- teste A×B de isolamento.

## Fora de escopo
Equipe/vários logins, múltiplos planos, painel de admin, teste grátis, e-mails
transacionais além de convite e recuperação, várias assinaturas no mesmo login.
