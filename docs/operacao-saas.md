# Falow SaaS — runbook de operação e virada

Este documento é para quem vai fazer a virada do Falow (instalação única na Vercel) para o SaaS por assinatura na Cloudflare, e para a operação do dia a dia depois dela. Os passos da virada são únicos, vêm em ordem e alguns não têm volta: leia a seção inteira antes de começar e **não pule etapas**.

Convenções:

- Comandos `npm run ...` e `npx ...` rodam num terminal normal (PowerShell ou Git Bash), aberto na pasta do projeto (`projetos/falow`), na branch `multiusuario`. Os que precisam de login na Cloudflare estão marcados com **(você)**: faça `npx wrangler login` uma vez antes.
- Valores secretos nunca entram neste arquivo nem no git. Onde aparece `<...>`, troque pelo seu valor.
- "SQL Editor" é Supabase → SQL Editor → New query. Cole o bloco, clique em Run e leia o resultado antes de seguir.
- Nomes de menu da Stripe, da Meta, do Supabase, do Resend e da Cloudflare mudam de tempos em tempos. Os caminhos abaixo são os de quando o runbook foi escrito; se um nome não aparecer, procure pelo termo em inglês em negrito.

Fatos que valem para tudo (vêm da spec `docs/superpowers/specs/2026-10-15-falow-multiusuario-design.md`):

- Uma instalação só: mesmo repositório, mesmo Supabase, mesmo app Meta aprovado. Plano único, assinatura mensal (`STRIPE_PRICE_ID`).
- Têm acesso: `active`, `trialing` e `past_due`. Qualquer outro status, ou a ausência de linha em `subscriptions`, não tem.
- O dono é o usuário em `FALOW_OWNER_USER_ID`: sempre com acesso, sem limite de @, único com o botão de IA e nunca apagado pelo purge.
- Cada cliente tem 1 conta de Instagram ativa; um mesmo @ ativo pertence a um login só.
- Exclusão: `purge_after = canceled_at + 30 dias`, só para `canceled`.
- Domínio `https://falow.app.br`; e-mail de saída `nao-responda@falow.app.br`.

## Índice

1. Ordem da virada
2. Stripe
3. E-mail e Supabase Auth
4. Secrets do Worker
5. Meta (app aprovado)
6. Compra de teste
7. Isolamento do storage e funções SQL
8. Compra repetida ou duplicada
9. Primeiro deploy: checagens
10. Pedidos de exclusão e reembolso

---

## 1. Ordem da virada

Faça nesta ordem. Cada passo diz o que conferir e o que fazer se der errado. Os passos que **não têm volta fácil** estão marcados com [SEM VOLTA FÁCIL].

Antes de começar, anote (num lugar seguro, fora do git) os valores atuais que você vai precisar desfazer em caso de rollback: a URL de redirect do OAuth e a URL do webhook que estão hoje no app Meta, e o domínio atual da produção na Vercel.

### Passo 1 — Conferir se existe @ ativo duplicado

A migration 0016 cria um índice único de @ ativo. Se houver duplicata, ela falha. No SQL Editor:

```sql
select ig_user_id, count(*) from public.ig_accounts where status = 'active' group by 1 having count(*) > 1;
```

Tem que voltar **vazio**. Se voltar linha: dois logins têm o mesmo @ ativo. Decida qual fica e desconecte o outro (`update public.ig_accounts set status = 'disconnected' where id = '<id da linha que sai>';`), rode a consulta de novo até voltar vazio.

### Passo 2 — Aplicar `0016_subscriptions.sql` [SEM VOLTA FÁCIL]

1. Abra o arquivo `supabase/migrations/0016_subscriptions.sql`, copie **tudo**.
2. SQL Editor → New query → cole → Run. Tem que terminar com "Success".

O que ela faz: cria `subscriptions` e `stripe_events` (com RLS), troca o índice comum de `ig_accounts.ig_user_id` pelo índice único de @ ativo (`ig_accounts_active_ig_user_id_key`) e cria a função `falow_user_id_by_email` (só `service_role` executa). Ela é aditiva: o código antigo da Vercel continua funcionando com ela aplicada.

**Se algo der errado:**

- Erro no `create unique index`: ainda há duplicata. Volte ao passo 1, resolva e rode o arquivo inteiro de novo (ele usa `if not exists` / `or replace` / `drop ... if exists`, então pode ser repetido).
- Para desfazer de verdade (só se ainda não houve nenhuma compra; depois disso você perde as assinaturas gravadas):

```sql
drop function if exists public.falow_user_id_by_email(text);
drop table if exists public.stripe_events;
drop table if exists public.subscriptions;
drop index if exists public.ig_accounts_active_ig_user_id_key;
create index if not exists ig_accounts_ig_user_id_idx on public.ig_accounts (ig_user_id) where status = 'active';
```

Depois de aplicar, rode `npm run check:schema` (seção 9). Ele só passa **depois** da 0016.

### Passo 3 — Conferir as policies do storage

Rode o SQL da seção 7 (policies de `storage.objects`). Nenhuma policy `select` pode estar aberta para `anon`/`public` no bucket `crm-uploads`. Se houver, remova (instruções na seção 7).

### Passo 4 — Stripe, parte 1 (produto, ajustes e portal), em modo teste

Faça tudo da seção 2 **menos o webhook** (o webhook só é criado depois do primeiro deploy, no passo 9). Comece em **modo teste** da Stripe; o modo live vem no fim (seção 6).

### Passo 5 — Resend e Supabase Auth

Tudo da seção 3: domínio no Resend, SMTP no Supabase, cadastro público desligado, política de senha, URLs e os dois templates de e-mail.

### Passo 6 — Secrets do Worker e checagens antes do deploy

1. Seção 4: coloque todos os secrets (usando as chaves **de teste** da Stripe por enquanto; `STRIPE_WEBHOOK_SECRET` provisório, ver seção 4).
2. Seção 9, bloco "Antes do deploy": zona na Cloudflare, `npm run check:schema`, build e `--dry-run`.

### Passo 7 — Deploy **(você)**

```bash
npm run deploy:cloudflare
```

Isso faz `opennextjs-cloudflare build` e depois `wrangler deploy`. O `custom_domain = true` do `wrangler.toml` cria o domínio `falow.app.br` apontando para o Worker e emite o certificado sozinho.

**Se algo der errado:**

- Falha por já existir registro DNS em `falow.app.br`: apague o registro antigo em Cloudflare → o domínio → DNS → Records e rode o deploy de novo. A zona `falow.app.br` precisa existir na sua conta Cloudflare (seção 9).
- Falha de build: o terminal mostra o motivo. Nada foi publicado.
- Deploy publicou mas o site está quebrado: `npx wrangler rollback` **(você)** volta o Worker para a versão anterior (não desfaz o banco).

### Passo 8 — DNS `falow.app.br` no Worker

O deploy do passo 7 já cria o domínio. Confira: Cloudflare → Workers & Pages → `falow` → Settings → **Domains & Routes** deve listar `falow.app.br` como Custom domain; abra `https://falow.app.br` e a landing tem que carregar (pode levar alguns minutos para o certificado).

**Se algo der errado:** para tirar o domínio do Worker, apague a entrada em Domains & Routes (não mexe em banco nem em Stripe).

### Passo 9 — Smoke test das rotas e só então o webhook da Stripe [SEM VOLTA FÁCIL]

Siga o bloco "Logo depois do primeiro deploy" da seção 9 (rotas de checkout e do webhook olhando os logs). Passando, crie o endpoint do webhook na Stripe (seção 2, passo "Webhook"), copie o Signing secret e troque o `STRIPE_WEBHOOK_SECRET` provisório pelo real.

**Se algo der errado:** na Stripe, Developers → Webhooks → o endpoint → desative ou apague. Os eventos que falharam ficam em "Event deliveries" e podem ser reenviados (Resend) depois que o problema for corrigido; a Stripe também reenvia sozinha por alguns dias. O webhook é idempotente (`stripe_events`).

### Passo 10 — Meta

Seção 5: App Domains, OAuth redirect, webhook e as três URLs legais para `falow.app.br`.

**Se algo der errado:** volte os campos para os valores antigos que você anotou no começo. Mantenha a URL antiga do OAuth na lista (adicione a nova ao lado) até o passo 14; a URL do webhook da Meta é uma só, então trocá-la move o bot para o domínio novo na hora.

### Passo 11 — Reconectar o @ do dono

Entre em `https://falow.app.br/login` com a conta do dono → Contas → **Conectar Instagram** → autorize. Isso valida o OAuth ponta a ponta no domínio novo (callback `https://falow.app.br/api/auth/meta/callback`). Mande uma DM de teste para o @ e confira que o bot responde.

**Se algo der errado:** erro `exchange_failed` ou `oauth_denied` na tela de Contas: confira `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `NEXT_PUBLIC_APP_URL` e o redirect cadastrado na Meta (seção 5). Veja o log do Worker (`npx wrangler tail falow --format pretty` **(você)**).

### Passo 12 — Aplicar `0017_ig_accounts_select_only.sql` [SEM VOLTA FÁCIL]

**Só agora, com o código novo no ar e funcionando (passos 7 a 11 ok).** O código antigo escrevia em `ig_accounts` com o client do usuário e deixaria de conectar e de desconectar contas com a 0017 aplicada. O código novo escreve com a service role.

1. Copie `supabase/migrations/0017_ig_accounts_select_only.sql` inteiro → SQL Editor → Run.
2. Confira:

```sql
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'ig_accounts';
```

Tem que sobrar **uma** linha: `own accounts select | SELECT`.

3. No painel novo, desconecte e reconecte o @ de teste ou do dono para provar que conectar/desconectar seguem funcionando.

**Se algo der errado / rollback:** se um dia precisar voltar o **código** para a versão antiga, reverta a 0017 **junto**, recriando a policy `for all`. Com o código antigo e a 0017 aplicada, desconectar e sincronizar perfil falham **em silêncio**.

```sql
drop policy if exists "own accounts select" on public.ig_accounts;
drop policy if exists "own accounts" on public.ig_accounts;
create policy "own accounts" on public.ig_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

### Passo 13 — Tirar o deploy antigo da Vercel

Depois que a 0017 entrou, o deploy antigo (que escreve em `ig_accounts` direto) não pode mais ficar recebendo tráfego. Na Vercel: remova o domínio do projeto antigo (Settings → Domains) e, se quiser, apague o projeto depois de alguns dias de operação estável. **Não promova esta branch (`multiusuario`) no projeto da Vercel**: sem o `vercel.json` ela perde o cron diário das sequências e a produção nova é o Worker.

**Se algo der errado:** para voltar ao antigo, reverta a 0017 (SQL acima), recoloque o domínio na Vercel e devolva as URLs antigas da Meta (webhook e OAuth).

### Passo 14 — Limpar os tokens legados [SEM VOLTA FÁCIL]

No SQL Editor, **já com o código novo no ar**. Contas desconectadas ou expiradas antes desta versão ainda guardam o token no banco; o código novo já não os usa, a limpeza é defesa em profundidade.

Veja o que vai ser limpo:

```sql
select id, ig_username, status from public.ig_accounts where status <> 'active';
```

Limpe:

```sql
update public.ig_accounts set access_token_enc = '', token_expires_at = null where status <> 'active';
```

**Se algo der errado:** não há como recuperar os tokens apagados, e não precisa: essas contas estão desconectadas ou expiradas; quem quiser voltar reconecta pelo OAuth e ganha um token novo. Contas `active` não são tocadas.

Se você já removeu a URL antiga do OAuth na Meta, este é o momento (a nova, `https://falow.app.br/api/auth/meta/callback`, fica).

### Passo 15 — Teste de isolamento contra o banco real

Crie dois usuários de teste e rode o script (instruções logo abaixo). O resultado precisa ter `ok` em todas as linhas, em especial nas duas de `ig_accounts` ("insert direto recusado" e "update direto recusado") e em "cadastro público fechado".

**Se algo der errado:** uma linha `FAIL` é problema de segurança: pare, não abra a venda, e corrija a causa (0017 não aplicada, cadastro público ainda ligado, policy faltando) antes de seguir.

#### Como rodar o teste de isolamento

O script `scripts/check-tenant-isolation.mjs` usa o `NEXT_PUBLIC_SUPABASE_URL` e a `NEXT_PUBLIC_SUPABASE_ANON_KEY` do seu `.env.local`, ou seja, **fala com o banco de produção**. Rode só depois dos passos 5 (cadastro desligado) e 12 (0017): antes disso ele escreveria de verdade em `ig_accounts` e, com o cadastro aberto, criaria um usuário e dispararia um e-mail de confirmação.

1. Supabase → Authentication → Users → **Add user → Create new user**, duas vezes (`teste-a@seudominio.com` e `teste-b@seudominio.com`, senha qualquer com 8+ caracteres), marcando **Auto Confirm User**. Não crie assinatura para eles.
2. Copie o UID do usuário A e crie uma linha de conta para ele (SQL Editor):

```sql
insert into public.ig_accounts (user_id, ig_user_id, ig_username, access_token_enc, status)
values ('<UID do usuário A>', '00000000000001', 'teste_isolamento_a', '', 'disconnected');
```

3. No terminal, na pasta do projeto.

PowerShell:

```powershell
$env:TENANT_A_EMAIL="teste-a@seudominio.com"; $env:TENANT_A_PASSWORD="<senha A>"
$env:TENANT_B_EMAIL="teste-b@seudominio.com"; $env:TENANT_B_PASSWORD="<senha B>"
node scripts/check-tenant-isolation.mjs
```

Git Bash:

```bash
TENANT_A_EMAIL=teste-a@seudominio.com TENANT_A_PASSWORD='<senha A>' TENANT_B_EMAIL=teste-b@seudominio.com TENANT_B_PASSWORD='<senha B>' node scripts/check-tenant-isolation.mjs
```

4. Saída esperada: uma linha `ok   <tabela>` para cada tabela, depois `ok   ig_accounts: insert direto recusado`, `ok   ig_accounts: update direto recusado` e `ok   cadastro público fechado`; código de saída 0. Qualquer `FAIL` dá código 1.
5. Limpeza: apague os dois usuários em Authentication → Users (a conta de teste do A some em cascata). Se o script chegou a criar um usuário `teste+<número>@falow.app.br` (só acontece com o cadastro aberto, e aí já saiu um `FAIL`), apague-o também.

### Passo 16 — Compra de teste e virada para o modo live

Seção 6. Só depois dela passar com as chaves de teste você troca para as chaves live e abre a venda.

---

## 2. Stripe

Faça primeiro em **modo teste** (chave "Test mode" no canto do painel). Quase tudo é separado por modo: produto/preço, chave de API, webhook e configuração do portal precisam ser feitos **de novo** no modo live (seção 6).

### 2.1 Produto e preço

1. Product catalog → **Add product**. Nome: `Falow`.
2. Preço: **Recurring**, mensal, em BRL, o valor do plano.
3. Salvar. Abra o preço e copie o **Price ID** (`price_...`). Ele vira o secret `STRIPE_PRICE_ID`. O checkout usa exatamente esse preço, com quantidade 1.

### 2.2 Chave de API

Developers → **API keys** → copie a **Secret key** (`sk_test_...` no modo teste). Ela vira `STRIPE_SECRET_KEY`. O app não usa a chave publicável.

### 2.3 Métodos de pagamento: só cartão

Settings → **Payment methods**: deixe ligado **só Cartão**. Desligue boleto, Pix e qualquer outro. Métodos de pagamento atrasados (como boleto) deixariam a assinatura `incomplete` e quebram a premissa de acesso imediato depois do checkout. O botão **Reativar** da página `/assinatura` também assume cartão. (O checkout do app não fixa `payment_method_types`; é esta configuração que decide o que a Stripe oferece.)

### 2.4 Cobranças que falham: cancelar no fim das tentativas (obrigatório)

Settings → **Billing → Subscriptions and emails** (ou "Revenue recovery"): em **Retries / Manage failed payments**, deixe as tentativas automáticas ligadas e, em "se todas as tentativas falharem", escolha **Cancel the subscription** (cancelar a assinatura).

Por quê: é o cancelamento que gera o evento `customer.subscription.deleted` e inicia os 30 dias de exclusão. Se ficar em "marcar como não paga" (`unpaid`) ou "deixar vencida", a conta perde o acesso mas **nunca é apagada** (só o status `canceled` agenda a exclusão). Os Termos do app prometem "se as tentativas se esgotarem, a assinatura é cancelada".

### 2.5 Customer Portal (obrigatório)

Settings → **Billing → Customer portal** (ative; é o que o botão "Minha assinatura" abre):

- **Customers can**: atualizar forma de pagamento (trocar cartão) **ligado**; ver histórico de faturas/baixar comprovantes **ligado**; **Cancel subscriptions** **ligado**, com cancelamento **no fim do período de cobrança** (*at end of billing period*).
- Deixe desligado trocar de plano (o plano é único).
- Em informações do negócio do portal, preencha Terms of service `https://falow.app.br/termos-de-servico` e Privacy policy `https://falow.app.br/privacidade`.
- Salvar.

Esses itens são os que os Termos assumem. Lembrete: no modo live o portal é configurado separado do modo teste.

### 2.6 Webhook (só no passo 9 da virada, depois do smoke test)

Developers → **Webhooks → Add endpoint**:

- Endpoint URL: `https://falow.app.br/api/webhooks/stripe`
- Eventos (exatamente estes quatro; o código ignora qualquer outro):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Depois de criar, abra o endpoint e copie o **Signing secret** (`whsec_...`). Ele vira `STRIPE_WEBHOOK_SECRET`:

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

(**você**; cole o valor no prompt). O secret vale na hora, sem novo deploy.

O que cada evento faz (`src/lib/billing/stripe-events.ts`):

| Evento | Efeito |
|---|---|
| `checkout.session.completed` | Acha o usuário pelo cliente da Stripe (reativação) ou pelo e-mail; se não existe, convida por e-mail; grava a assinatura em `subscriptions`. Compra repetida de quem já tem acesso é ignorada e vai para o log (seção 8). |
| `customer.subscription.created` / `updated` | Pergunta o estado atual à Stripe e atualiza `status` e `current_period_end`. Status com acesso zera `canceled_at`/`purge_after`. |
| `customer.subscription.deleted` | `status = canceled`, `canceled_at = agora`, `purge_after = agora + 30 dias`. |

Eventos de assinatura de um cliente que ainda não existe respondem 500 de propósito, para a Stripe reenviar depois (a ordem de entrega não é garantida). Isso é normal no log por alguns segundos após uma compra.

**Se algo der errado:** veja o passo 9 da seção 1. Na Stripe, a aba **Event deliveries** do endpoint mostra a resposta de cada tentativa e permite reenviar.

---

## 3. E-mail e Supabase Auth

O convite do cliente novo e a recuperação de senha saem pelo Supabase Auth. Sem SMTP próprio o Supabase limita muito o envio e o remetente é genérico.

### 3.1 Resend

1. Resend → **Domains → Add Domain**: `falow.app.br`.
2. O Resend mostra os registros (SPF e DKIM, e possivelmente MX/DMARC). Crie cada um em Cloudflare → o domínio `falow.app.br` → **DNS → Records**, com a nuvem **cinza** (*DNS only*), copiando tipo, nome e valor exatamente como o Resend mostra.
3. Volte ao Resend e clique em **Verify**. Espere o domínio ficar **Verified**.
4. Resend → **API Keys → Create API Key**, permissão *Sending access*, restrita ao domínio `falow.app.br`. Guarde a chave (ela é a senha do SMTP).

A chave do Resend vive **no Supabase**, não no Worker: o app não tem variável do Resend.

### 3.2 SMTP no Supabase

Supabase → Authentication → **Emails → SMTP Settings** (em painéis antigos: Authentication → Settings → SMTP). Ligue **Enable custom SMTP** e preencha:

| Campo | Valor |
|---|---|
| Sender email | `nao-responda@falow.app.br` |
| Sender name | `Falow` |
| Host | `smtp.resend.com` |
| Port | `465` (ou `587`) |
| Username | `resend` |
| Password | a API key do Resend |

Salvar. Opcional: em Authentication → **Rate Limits**, confira o limite de e-mails por hora (com SMTP próprio o padrão é baixo; se você espera muitas compras por hora, aumente).

### 3.3 Desligar o cadastro público (obrigatório)

Authentication → **Sign In / Providers** (ou "Sign In / Up") → **desligue "Allow new users to sign up"**. Convites feitos pelo servidor (admin) continuam funcionando; é isso que a compra usa. Sem desligar, qualquer um criaria conta chamando `auth.signUp` com a chave anon, sem pagar. O teste de isolamento confere essa chave.

### 3.4 Política de senha

Authentication → Sign In / Providers → **Email → Password**: **tamanho mínimo 8**, **sem exigência de tipos de caractere** (nenhuma exigência de maiúscula/número/símbolo). É igual ao formulário `/definir-senha` (mínimo de 8). Uma política mais rígida faria o `updateUser` recusar senhas que o app aceita, e o cliente veria a mensagem de "senha fraca" sem entender.

### 3.5 URLs

Authentication → **URL Configuration**:

- **Site URL**: `https://falow.app.br` (sem barra no final; os templates abaixo usam `{{ .SiteURL }}`).
- **Redirect URLs**: `https://falow.app.br/**`. O código passa `redirectTo = https://falow.app.br/definir-senha` no convite (`src/lib/billing/stripe-deps.ts`) e na recuperação (`src/app/login/actions.ts`); ele precisa estar nessa lista, mesmo que os templates montem o link por conta própria.

### 3.6 Templates de e-mail (em português)

Authentication → **Emails → Templates** (em painéis antigos: Email Templates). Os links abaixo são exatamente os que a página `/definir-senha` entende (`token_hash` e `type`, validados só no envio do formulário; `type` só pode ser `invite` ou `recovery`).

**Invite user**

- Assunto: `Sua assinatura do Falow está ativa`
- Corpo:

```html
<h2>Bem-vindo ao Falow</h2>
<p>Sua assinatura está ativa. Falta só definir a sua senha para entrar no painel.</p>
<p><a href="{{ .SiteURL }}/definir-senha?token_hash={{ .TokenHash }}&type=invite">Definir minha senha</a></p>
<p>O link vale por tempo limitado e só pode ser usado uma vez. Se ele expirar, abra https://falow.app.br/login e use "Esqueci minha senha" com este e-mail.</p>
```

**Reset password**

- Assunto: `Redefinir sua senha do Falow`
- Corpo:

```html
<h2>Redefinir senha</h2>
<p>Recebemos um pedido para redefinir a senha da sua conta no Falow.</p>
<p><a href="{{ .SiteURL }}/definir-senha?token_hash={{ .TokenHash }}&type=recovery">Escolher uma nova senha</a></p>
<p>Se não foi você, ignore este e-mail: nada muda na sua conta.</p>
```

Os demais templates (confirmação de cadastro, magic link, troca de e-mail) não são usados: o cadastro público está desligado e o app não oferece essas telas.

Teste rápido: na tela de login do app, "Esqueci minha senha" com o e-mail de um usuário de teste; o e-mail tem que chegar do remetente `nao-responda@falow.app.br` e o link abrir `/definir-senha`.

**Se algo der errado:** e-mail não chega: veja Resend → Emails (status e motivo), confira o domínio Verified e a senha do SMTP no Supabase (Authentication → Logs). Link abre "Link inválido" ou "expirou": o template está sem `token_hash`/`type`, ou o link já foi aberto e gasto.

---

## 4. Secrets do Worker

Cada valor entra com `npx wrangler secret put NOME` **(você)**, na pasta do projeto. O comando pede o valor no terminal: digite ou cole **no prompt**. Não use `echo valor | ...`: o `echo` acrescenta quebra de linha ao valor. Confira o resultado com `npx wrangler secret list` (mostra só os nomes). Se o Worker `falow` ainda não existir, o wrangler pergunta se pode criá-lo para guardar o secret: responda sim.

A conta Cloudflare precisa estar no plano **Workers Paid** (os limites do gratuito não comportam o app).

A lista abaixo foi conferida contra o código (`src`, `scripts`, `worker.ts`, `wrangler.toml`): são os únicos nomes lidos.

### 4.1 Obrigatórios

| Nome | De onde vem / valor | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | **Também no build** (ver 4.4) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon key | **Também no build** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role | Acesso total ao banco. Nunca expor |
| `INSTAGRAM_APP_ID` | Painel Meta → Instagram → Business login settings | |
| `INSTAGRAM_APP_SECRET` | idem | Também usado para validar a assinatura do webhook |
| `META_APP_SECRET` | Painel Meta → App settings → Basic → App Secret | O webhook aceita a assinatura gerada com este **ou** com o `INSTAGRAM_APP_SECRET` (`src/lib/meta/verify.ts`); configure os dois como hoje |
| `META_VERIFY_TOKEN` | O mesmo valor que está hoje no painel Meta | Precisa ser idêntico ao digitado no webhook |
| `NEXT_PUBLIC_APP_URL` | `https://falow.app.br` | **Também no build**. Sem barra no final. Também lido pelo `worker.ts` nos crons |
| `TOKEN_ENCRYPTION_KEY` | **O mesmo valor de hoje** | Se for outro, os tokens do Instagram já gravados não abrem mais e todo @ precisa reconectar. Nunca gere um novo |
| `CRON_SECRET` | Valor inventado (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) | Sem ele, os dois crons respondem 503 e falham a cada execução |
| `STRIPE_SECRET_KEY` | Seção 2.2 | `sk_test_...` agora; `sk_live_...` na virada final |
| `STRIPE_WEBHOOK_SECRET` | Seção 2.6 | Ver 4.3 |
| `STRIPE_PRICE_ID` | Seção 2.1 | `price_...` do modo correspondente |
| `FALOW_OWNER_USER_ID` | Supabase → Authentication → Users → seu usuário → **User UID** | Sem ele o purge se recusa a rodar e ninguém é reconhecido como dono |

### 4.2 Opcionais

| Nome | Efeito se faltar |
|---|---|
| `META_GRAPH_VERSION` | Usa `v25.0`. Se hoje você usa outra versão, coloque o mesmo valor |
| `OPENROUTER_API_KEY` | Sem ela o botão de escrever com IA não aparece (só o dono o vê de qualquer forma) |
| `OPENROUTER_MODEL` | Usa `anthropic/claude-sonnet-4.5` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Usa o e-mail padrão de `src/components/legal/legal-chrome.tsx`. Esse e-mail aparece na landing e nas páginas legais e é para onde chegam pedidos de reembolso e de exclusão: **defina o seu**. **Também no build** |

Não existem (não crie): variável do Resend (a chave fica no Supabase), chave publicável da Stripe, `NODE_ENV` (a plataforma define).

### 4.3 `STRIPE_WEBHOOK_SECRET` no primeiro deploy

O Signing secret real só existe depois que o endpoint for criado (passo 9 da seção 1), e o endpoint só deve ser criado depois do smoke test. Então, no passo 6, coloque um valor **provisório** qualquer (por exemplo `whsec_provisorio`). Isso mantém a rota carregando e permite o smoke test; no passo 9 você troca pelo valor real com o mesmo `wrangler secret put`.

### 4.4 Variáveis `NEXT_PUBLIC_*` também no build

As `NEXT_PUBLIC_*` são embutidas no código **na hora do build**, não lidas no Worker. Portanto `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` e `NEXT_PUBLIC_CONTACT_EMAIL` precisam existir no ambiente de quem roda `npm run deploy:cloudflare`. Como o deploy sai do seu computador, quem cobre isso é o `.env.local` da pasta do projeto.

Antes de cada deploy de produção confira que o `.env.local` tem `NEXT_PUBLIC_APP_URL=https://falow.app.br` (e **não** `http://localhost:3000`, que ficaria gravado no site publicado: links de convite, redirects e URL de webhook errados).

### 4.5 Crons

Definidos em `wrangler.toml` (`[triggers] crons`), executados pelo `scheduled()` de `worker.ts`, que chama o próprio app sem sair pela rede, com `Authorization: Bearer <CRON_SECRET>`:

| Expressão | Rota | O que faz |
|---|---|---|
| `* * * * *` (a cada minuto) | `/api/cron/sequences` | Expira automações/workflows temporários vencidos e retoma execuções paradas em nó de atraso cujo horário venceu. Pula contas sem assinatura com acesso |
| `0 6 * * *` (06:00 UTC = 03:00 de Brasília) | `/api/cron/purge` | Apaga quem está `canceled` com `purge_after` vencido: primeiro os arquivos em `crm-uploads/<account_id>/`, depois o usuário no Auth (cascata leva contas, contatos, conversas, tokens). Nunca toca o dono e se recusa a rodar sem `FALOW_OWNER_USER_ID` |

Conferir que existem: Cloudflare → Workers & Pages → `falow` → Settings → **Trigger Events** (Cron Triggers) deve listar as duas expressões. Falhas aparecem no log como `[cron] /api/cron/... -> 503 ...`.

### 4.6 Logs

Para procurar mensagens depois (seção 8), os logs precisam estar ligados: Cloudflare → Workers & Pages → `falow` → **Observability** (ou Settings → Observability) → ligar **Workers Logs**. O `wrangler.toml` não tem bloco `[observability]`: se, depois de um deploy, a opção voltar a ficar desligada, acrescente `[observability]` com `enabled = true` ao `wrangler.toml` (uma mudança de duas linhas no repositório) e faça o deploy de novo. Para acompanhar ao vivo sem nada disso: `npx wrangler tail falow --format pretty` **(você)**.

---

## 5. Meta (app aprovado)

No painel de desenvolvedores da Meta (developers.facebook.com → seu app). **Anote os valores antigos antes de trocar.**

1. **Settings → Basic → App Domains**: acrescente `falow.app.br`.
2. **Settings → Basic**: Privacy Policy URL `https://falow.app.br/privacidade`; Terms of Service URL `https://falow.app.br/termos-de-servico`; User data deletion → *Data deletion instructions URL* `https://falow.app.br/exclusao-de-dados`.
3. **Instagram → API setup with Instagram business login → Business login settings → OAuth redirect URIs**: adicione exatamente `https://falow.app.br/api/auth/meta/callback` (é o `NEXT_PUBLIC_APP_URL` + `/api/auth/meta/callback` montado em `src/lib/meta/oauth.ts`). Mantenha a antiga ao lado até o passo 14 da seção 1.
4. **Instagram → API setup → Configure webhooks**: *Callback URL* `https://falow.app.br/api/webhooks/meta`; *Verify token*: o **mesmo** valor do secret `META_VERIFY_TOKEN`. Ao salvar, a Meta faz um GET com `hub.verify_token` e o app devolve o desafio; só funciona com o Worker já publicado e o secret certo. Os campos assinados (mensagens, comentários) continuam os mesmos de hoje. A tela **Contas** do painel mostra a mesma URL do webhook.
5. **Portfólio empresarial** (business.facebook.com → Business settings → Business info): campo **Site** = `https://falow.app.br`. É um campo manual e fica fora do painel do app.
6. Reconecte o @ do dono (passo 11 da seção 1).

**Se algo der errado:** "URL de callback ou token inválido" ao salvar o webhook: o Worker não está no ar, o `META_VERIFY_TOKEN` difere do digitado, ou a rota respondeu 403. Conferir com:

```bash
curl -i "https://falow.app.br/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=<META_VERIFY_TOKEN>&hub.challenge=123"
```

Tem que responder `200` com corpo `123`. Qualquer outro valor de token responde `403`.

---

## 6. Compra de teste

Use as **chaves de teste** da Stripe (seção 2 em modo teste, secrets de teste no Worker, webhook de teste criado) e um e-mail seu que você acesse (um alias como `voce+teste1@gmail.com` serve).

1. Abra `https://falow.app.br` (sem estar logado) e clique em **Assinar**. Vai para o checkout da Stripe em modo teste.
2. Pague com o cartão `4242 4242 4242 4242`, validade futura qualquer, CVC qualquer, e o e-mail de teste.
3. Volta para `/assinatura/obrigado` ("confira seu e-mail"). O e-mail de convite chega pelo Resend, remetente `nao-responda@falow.app.br`.
4. Clique em **Definir minha senha** → `/definir-senha` → escolha uma senha de 8+ caracteres → o painel abre em `/dashboard`.
5. Confira no Supabase (SQL Editor): `select * from public.subscriptions order by updated_at desc limit 1;` mostra `status = active`, `canceled_at` e `purge_after` vazios.
6. Em **Contas**, conecte um @ de teste (precisa ser **diferente** do @ do dono, senão a tela mostra `account_taken`). Crie uma regra simples e mande uma DM de outro perfil: o bot responde.
7. Em **Minha assinatura** (portal da Stripe), cancele: com o portal configurado "no fim do período" a assinatura continua `active` e o acesso segue até lá (conferir que nada quebra). Para testar a perda de acesso, cancele **na hora** pelo painel da Stripe: Customers → o cliente → a assinatura → **Cancel subscription → Cancel immediately**.
8. O webhook `customer.subscription.deleted` chega; o painel passa a redirecionar para `/assinatura`, que mostra "Cancelada" e a data de exclusão (30 dias à frente). Confira `status = canceled` e `purge_after` preenchido na tabela.
9. Mande outra DM para o @ de teste: o bot **não** responde (o log do Worker mostra `[meta] @<usuario> sem assinatura ativa: evento ignorado`; não vira linha em Logs do painel).
10. Em `/assinatura`, clique **Reativar assinatura**, pague de novo com o cartão de teste. Volta `status = active`, `canceled_at` e `purge_after` vazios, o painel abre e o bot volta a responder, com as regras como estavam.

Limpeza: apague o usuário de teste em Supabase → Authentication → Users (em cascata some a conta e os dados dele; veja o aviso do funil na seção 9).

### Virar para o modo live

Só depois de todo o roteiro acima passar:

1. Stripe em modo **live**: repita 2.1 (produto e preço), 2.3 (só cartão), 2.4 (cancelar no fim das tentativas), 2.5 (portal) e 2.6 (webhook com os mesmos quatro eventos).
2. Troque os três secrets, um a um, **(você)**:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_PRICE_ID
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

   Com os valores **live** (`sk_live_...`, o `price_...` do live, o `whsec_...` do endpoint live). Eles valem na hora, sem novo deploy.
3. Recomendado: uma compra real com o seu cartão, conferir que tudo chegou (convite, painel, linha em `subscriptions`) e reembolsar em seguida (seção 10c).

**Se algo der errado:** convite não chega: seção 3. Compra feita e nada na tabela: veja os eventos entregues no endpoint da Stripe (resposta 500/400 e o motivo) e o log do Worker; 400 "Assinatura inválida" é `STRIPE_WEBHOOK_SECRET` de outro modo/endpoint. Bot não responde com assinatura ativa: confira o status da linha e o log (`[meta] @... sem assinatura ativa: evento ignorado` indica que o status da linha não dá acesso).

---

## 7. Isolamento do storage e funções SQL

O que a revisão da Task 9 achou, lendo as migrations (sem acesso à produção):

- **Nenhuma migration cria policy de `select` para `anon` em `storage.objects`.** A 0011 só cria o bucket **público** `crm-uploads` (a Meta baixa o anexo pela URL pública, por isso ele é público). Policies criadas à mão no painel não aparecem nas migrations, por isso a conferência abaixo.
- A única função `security definer` é `falow_user_id_by_email` (0016), com execução concedida **só ao `service_role`**.
- Os anexos ficam em `crm-uploads/<account_id>/<uuid>-<arquivo>`.

### 7.1 Conferir no painel do Supabase

**Policies de storage.** No SQL Editor:

```sql
select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
```

Procure linhas com `cmd` = `SELECT` (ou `ALL`) e `roles` contendo `anon` ou `public` cuja condição (`qual`) fale de `crm-uploads` ou não restrinja o bucket. **Não pode haver nenhuma**: uma policy dessas permitiria listar os arquivos de todos os clientes. Se achar, remova em Storage → Policies (ou `drop policy "<nome>" on storage.objects;`). Arquivo isolado continua abrindo pela URL pública sem policy, que é o que a Meta precisa.

**Funções.**

```sql
select p.proname,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_executa,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_executa,
       pg_get_function_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
```

Esperado: `crm_tag_rename`, `crm_tag_remove` e `falow_user_id_by_email` com `anon_executa = false` e `authenticated_executa = false` (as migrations 0012 e 0016 fazem o `revoke`); `crm_on_message_insert` é função de gatilho (`returns trigger`), que não é chamável como RPC. **Nenhuma função que receba `account_id` (ou mexa em dados de conta) pode estar executável por `anon` ou `authenticated`.** Para fechar uma que apareça aberta:

```sql
revoke all on function public.<nome>(<tipos dos argumentos>) from public, anon, authenticated;
grant execute on function public.<nome>(<tipos dos argumentos>) to service_role;
```

**Tabelas sem RLS** (deve voltar vazio):

```sql
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
```

---

## 8. Compra repetida ou duplicada

Quem já tem assinatura com acesso e compra de novo (ou alguém que sabe o e-mail dele) **não** troca de assinatura: o webhook ignora a segunda e deixa a linha como estava. A cobrança da segunda, porém, existe na Stripe e precisa ser tratada à mão.

1. **Achar o aviso.** Procure `[stripe] compra repetida ignorada` nos logs do Worker (Cloudflare → Workers & Pages → `falow` → Observability → Logs, com os Workers Logs ligados; seção 4.6). A mensagem traz o usuário, o id e o cliente da assinatura **antiga** e o id e o cliente da **nova**. Alternativa na Stripe: Customers com o mesmo e-mail e duas assinaturas.
2. **Decidir qual fica**, olhando o status da assinatura ANTIGA na Stripe:
   - Antiga **saudável** (`active`): cancele/reembolse a **NOVA** (Payments → o pagamento → Refund; Subscriptions → a nova → Cancel subscription → Cancel immediately). A linha em `subscriptions` já está certa, não mexa.
   - Antiga **`past_due`** ou com **cancelamento agendado**: a **NOVA** é a que deve ficar. Primeiro atualize a linha do usuário com os dados da nova (SQL Editor):

```sql
update public.subscriptions
   set stripe_customer_id     = '<cus_ da nova>',
       stripe_subscription_id = '<sub_ da nova>',
       status                 = '<status da nova, em geral active>',
       current_period_end     = '<fim do período da nova, ex.: 2026-11-30T00:00:00Z>',
       canceled_at            = null,
       purge_after            = null,
       updated_at             = now()
 where user_id = '<user_id do aviso>';
```

     e só depois cancele/reembolse a antiga na Stripe.
3. **Ruído esperado:** o evento `customer.subscription.deleted` da assinatura cancelada chega com um cliente que não está mais na linha; o webhook responde 500 ("cliente ainda desconhecido") e a Stripe reenvia por alguns dias. É inofensivo (nada é gravado) e some sozinho. Se for o mesmo cliente da Stripe nas duas assinaturas, o evento é ignorado.
4. Responda ao cliente avisando do reembolso.

---

## 9. Primeiro deploy: checagens

Aprendidas nas revisões. A seção 1 diz em que momento cada bloco entra.

### Antes do deploy

- A zona `falow.app.br` precisa existir na sua conta Cloudflare (`custom_domain = true` falha sem ela).
- `npx wrangler secret put CRON_SECRET` e os demais secrets da seção 4. Sem `CRON_SECRET` o cron falha com 503 uma vez por minuto.
- Rode `npm run check:schema` com as credenciais de produção no ambiente (`NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, que o script lê do `.env.local`) **depois** de aplicar a 0016. O build não chama mais esse gate. Saída esperada: `[schema] Banco compatível com o build.` Se ele listar `tabela: coluna ...`, falta migration (aplique as de `supabase/migrations`, na ordem, **até a 0016**; a 0017 só depois do deploy).
- Rode o build e o empacotamento de teste **(você)**:

```bash
npm run build:cloudflare
npx wrangler deploy --dry-run --outdir .wrangler-dry
```

  Tem que empacotar sem erro. Apague a pasta `.wrangler-dry` depois (não é para o git).

### Logo depois do primeiro deploy, antes de apontar o webhook da Stripe

Smoke test das rotas `/api/billing/checkout` e `/api/webhooks/stripe`, olhando os logs do Worker (`npx wrangler tail falow --format pretty` **(você)**, numa segunda janela):

```bash
curl -i -X POST https://falow.app.br/api/billing/checkout
curl -i -X POST https://falow.app.br/api/webhooks/stripe -H "stripe-signature: t=1,v1=invalido" -d "{}"
```

- Checkout: tem que responder `303` com `Location: https://checkout.stripe.com/...` (cria uma sessão de teste inofensiva).
- Webhook: tem que responder `400 Assinatura inválida` (prova que a rota carrega e o SDK verifica a assinatura). `503 STRIPE_WEBHOOK_SECRET não configurado` significa secret faltando; `500` ou erro de carregamento do módulo significa que o pacote `stripe` não empacotou direito.

O SDK `stripe` vai empacotado pela build Node dentro do OpenNext (usa o cliente fetch e SubtleCrypto, mas só foi checado estaticamente). Se a rota falhar ao carregar, o plano B é acrescentar `serverExternalPackages: ["stripe"]` em `next.config.mjs` para o OpenNext resolver a build worker do pacote (mudança de código: peça a quem mantém o repositório).

Só depois disso crie o endpoint do webhook na Stripe (seção 2.6) e troque o `STRIPE_WEBHOOK_SECRET` provisório. Para provar o fim a fim: no endpoint, **Send test webhook** (ou refaça a compra de teste da seção 6) e confira `200` na aba Event deliveries.

### Prova do cascade de exclusão (uma vez, num usuário de teste)

Rode **um** `deleteUser` real num usuário de teste que tenha leads num funil, para provar a cascata `leads.stage_id → pipeline_stages ON DELETE RESTRICT` (lida e aceita nas revisões, nunca executada).

1. Faça uma compra de teste (seção 6), conecte um @ de teste, abra o CRM e coloque pelo menos um lead num funil.
2. Apague o usuário em Authentication → Users → Delete user. **Ou** teste o caminho real do purge: cancele a assinatura na hora, force o vencimento e dispare a rota:

```sql
update public.subscriptions set purge_after = now() - interval '1 day' where user_id = '<UID do usuário de teste>';
select user_id, status, purge_after from public.subscriptions where status = 'canceled' and purge_after < now();
```

   O `select` tem que listar **só** o usuário de teste (o purge apaga todos os vencidos). Então:

```bash
curl -i https://falow.app.br/api/cron/purge -H "Authorization: Bearer <CRON_SECRET>"
```

   Resposta `200` com o id dele em `purged`.
3. Se falhar com erro de chave estrangeira em `leads`/`pipeline_stages`: o purge registra `[purge] <id> falhou` e não apaga ninguém pela metade. Contorno manual, e avise quem mantém o código:

```sql
delete from public.leads where account_id in (select id from public.ig_accounts where user_id = '<UID>');
```

   e apague o usuário de novo.

### Não promover a branch na Vercel

Não promova esta branch no projeto da Vercel enquanto a produção estiver lá: sem o `vercel.json` ela perde o cron diário das sequências.

### Crons

O cron das sequências agora roda **a cada minuto**; o purge roda 1x/dia às **06:00 UTC (03:00 de Brasília)** (seção 4.5).

---

## 10. Pedidos de exclusão e reembolso

As páginas públicas (`/exclusao-de-dados`, `/termos-de-servico`) prometem que o operador atende estes pedidos, pelo e-mail de contato (`NEXT_PUBLIC_CONTACT_EMAIL`), em até 30 dias corridos. Confirme sempre a identidade: o pedido de conta vem do mesmo e-mail da assinatura.

### (a) Exclusão dos dados de uma pessoa (lead/contato)

Pedido de quem mandou DM ou comentou numa conta de cliente. O `ig_sender_id` aparece na tela de Logs do painel e na URL da conversa. Sempre filtre por **conta + remetente**: o mesmo remetente pode existir em contas de outros clientes e esses dados não podem ser tocados.

1. Ache a conta (a que recebeu a interação):

```sql
select id, ig_username, status from public.ig_accounts where ig_username = '<@ da conta, sem arroba>';
```

2. Opcional: se a conversa tiver anexos enviados pelo painel (arquivos em `crm-uploads`), liste antes de apagar as mensagens:

```sql
select id, attachments from public.messages
 where account_id = '<ID_DA_CONTA>' and ig_sender_id = '<ID_DO_REMETENTE>'
   and attachments::text like '%crm-uploads%';
```

   e apague esses arquivos em Storage → `crm-uploads` → pasta `<ID_DA_CONTA>`. (Mídia recebida do lead guarda só a URL da CDN da Meta, que não é nossa.)

3. Apague tudo do remetente naquela conta:

```sql
do $$
declare
  v_account_id uuid := '<ID_DA_CONTA>';
  v_sender_id  text := '<ID_DO_REMETENTE>';
begin
  -- Sinais pendentes (reação/edição ainda não aplicados) das mensagens dele.
  delete from public.message_signals_pending
   where account_id = v_account_id
     and mid in (
       select m.mid from public.messages m
        where m.account_id = v_account_id and m.ig_sender_id = v_sender_id and m.mid is not null
     );
  delete from public.messages     where account_id = v_account_id and ig_sender_id = v_sender_id;
  delete from public.crm_notes    where account_id = v_account_id and ig_sender_id = v_sender_id;
  -- O histórico do funil não guarda o remetente, só o lead: apaga pelo lead.
  delete from public.lead_stage_events
   where account_id = v_account_id
     and lead_id in (select id from public.leads where account_id = v_account_id and ig_sender_id = v_sender_id);
  delete from public.leads        where account_id = v_account_id and ig_sender_id = v_sender_id;
  delete from public.interactions where account_id = v_account_id and ig_sender_id = v_sender_id;
  -- Apaga a conversa e junto o perfil do Instagram guardado nela (foto, nome, seguidores).
  delete from public.conversations where account_id = v_account_id and ig_sender_id = v_sender_id;
  delete from public.rule_triggers where account_id = v_account_id and ig_sender_id = v_sender_id;
  delete from public.sequence_runs where account_id = v_account_id and ig_sender_id = v_sender_id;
  delete from public.contacts      where account_id = v_account_id and ig_sender_id = v_sender_id;
end $$;
```

4. Responda ao solicitante confirmando a exclusão pelo mesmo canal. As mensagens dentro do Instagram da pessoa e nos servidores da Meta não são nossas e continuam existindo.

### (b) Exclusão antecipada da conta inteira (a pedido do cliente)

Nunca para o dono.

1. Ache as contas e o usuário do cliente e anote os ids (depois de apagado, não dá para consultar):

```sql
select u.id as user_id, a.id as account_id, a.ig_username
  from auth.users u left join public.ig_accounts a on a.user_id = u.id
 where lower(u.email) = lower('<e-mail do cliente>');
```

2. Na Stripe, **cancele a assinatura na hora** (Subscriptions → Cancel subscription → Cancel immediately), senão ela continua cobrando. Espere o webhook chegar e confira `status = canceled` em `subscriptions`. (Se apagar o usuário antes do evento chegar, ele só gera o ruído da seção 8, item 3.)
3. Apague os arquivos do bucket: Storage → `crm-uploads` → pasta `<account_id>` → selecione tudo → Delete (uma pasta por conta).
4. Apague o usuário: Supabase → Authentication → Users → o usuário → **Delete user**. A cascata leva `ig_accounts`, contatos, conversas, tokens e `subscriptions`. Se acusar erro de chave estrangeira em leads, use o contorno da seção 9 (prova do cascade).
5. Responda ao cliente. Ele pode ainda revogar o app no Instagram (Configurações e privacidade → Apps e sites).

### (c) Reembolso dentro dos 7 dias (direito de arrependimento)

1. Stripe → Payments → o pagamento → **Refund** (integral).
2. **Cancele a assinatura na Stripe** (Subscriptions → Cancel subscription → Cancel immediately). Reembolsar não cancela: sem isso ela cobra de novo no mês seguinte.
3. Confira que o webhook chegou e o status virou `canceled`:

```sql
select status, canceled_at, purge_after from public.subscriptions
 where user_id = (select id from auth.users where lower(email) = lower('<e-mail do cliente>'));
```

4. Os dados continuam guardados pelos 30 dias normais, a menos que o cliente também peça a exclusão (item b).

### (d) Configurações da Stripe que os Termos assumem (obrigatórias)

Confira, em modo live, que estão como na seção 2:

- Portal com **cancelamento no fim do período**, **troca de cartão** e **download de comprovantes** ligados (2.5).
- Dunning com "**cancelar a assinatura quando as tentativas acabarem**" (2.4). Se ficar `unpaid`, a conta perde o acesso mas nunca é purgada.
- Só cartão como forma de pagamento (2.3).
