# ⚡ Falow

**Auto-resposta para DMs e comentários do Instagram, como serviço por assinatura.**

O Falow roda hospedado em **https://falow.app.br**. A pessoa assina, conecta a conta profissional do Instagram, cria regras do tipo *"se receber **preço** → responda com o link da tabela"* e o Falow responde sozinho, 24h por dia, com delay humanizado de 2–5s. Painel com métricas e logs de cada mensagem.

Quando uma resposta só não basta, as **Sequências** entram: um canvas visual (estilo n8n/ManyChat) onde se conectam blocos de mensagens, botões, respostas rápidas, atrasos e esperas para montar fluxos de conversa inteiros.

Este repositório é o código do serviço. Uma instalação só atende todos os clientes: mesmo código, mesmo Supabase, mesmo app Meta (aprovado no App Review). Os dados de cada conta ficam separados por regras de acesso (RLS) no banco.

> **Botão de escrever com IA (opcional).** Cada usuário pode cadastrar a
> própria chave da OpenRouter ou da OpenAI na tela Contas; aí os campos de
> texto do painel dele ganham um botão de escrever com IA, e o que ele digita
> nesse botão vai para o provedor da chave dele. A chave da instalação
> (`OPENROUTER_API_KEY` ou `OPENAI_API_KEY`) vale só para o dono e os admins.
> Nenhuma mensagem de seguidor é enviada para a IA. Sem chave, o botão nem
> aparece.

> **Sobre o guia antigo:** `docs/guia-configuracao-falow.pdf` e `docs/guia-configuracao.html` descrevem a época em que o Falow era instalado por cada usuário no próprio Supabase e no próprio app Meta. Ficam no repositório só como histórico e **não valem mais** para o serviço. O passo a passo atual de operação está em [docs/operacao-saas.md](docs/operacao-saas.md).

---

## Como o serviço funciona

| Assunto | Como é |
|---|---|
| **Assinatura** | Plano único, mensal, cobrado pela **Stripe**. O preço é definido no Stripe (o produto em `STRIPE_PRICE_ID`), nunca no código |
| **Cadastro** | Não existe cadastro público. O cliente paga no checkout (botão "Assinar o Falow" na landing, que faz `POST /api/billing/checkout`) e o webhook da Stripe cria a conta e manda um **e-mail de convite** com o link para definir a senha |
| **Limite** | 1 conta de Instagram por assinatura; um mesmo @ ativo pertence a um login só |
| **Cancelamento** | O cliente cancela em **Minha assinatura** (portal da Stripe). Sem acesso, as automações param na hora |
| **Exclusão** | 30 dias depois que a assinatura termina, o cron `/api/cron/purge` apaga o usuário e todos os dados (contatos, conversas, tokens, arquivos). Reativar dentro dos 30 dias restaura a conta |
| **Dono** | A conta em `FALOW_OWNER_USER_ID` é um usuário comum marcado: sempre com acesso, sem limite de @, sem assinatura e nunca apagada. Usa a chave de IA da instalação (clientes usam a própria, cadastrada em Contas) |

**Painel `/admin`:** o dono e os UUIDs de `FALOW_ADMIN_USER_IDS` veem os clientes, dão cortesia, bloqueiam e reenviam acesso (sem ler conversas e sem mexer na Stripe); para os demais a rota dá 404. Detalhes e MFA em `docs/operacao-saas.md` (seção 11).

Status de assinatura que dão acesso: `active`, `trialing` e `past_due`. Qualquer outro (ou ausência de assinatura) não dá.

## Deploy e operação

O serviço roda como **Cloudflare Worker** (OpenNext), em `falow.app.br`. Não há mais Vercel.

```bash
npm run check:schema      # confere se o banco tem as colunas que o código usa
npm run deploy:cloudflare # build do OpenNext + wrangler deploy
```

- `npm run check:schema` precisa de `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente.
- **Migrations antes do código.** Aplique no Supabase os arquivos novos de `supabase/migrations/` (na ordem numérica) antes de publicar o código que os usa. A `0022` só entra depois do deploy do código que a antecede; o roteiro está no runbook.
- **Secrets** ficam no Worker (`wrangler secret put NOME`), nunca no repositório. As variáveis estão na tabela abaixo.
- **Crons** vêm do [wrangler.toml](wrangler.toml), executados pelo `scheduled()` de [worker.ts](worker.ts): a cada minuto retoma as Sequências (`/api/cron/sequences`) e às 06:00 UTC roda a exclusão (`/api/cron/purge`). Ambos exigem `CRON_SECRET`.
- Plano **Workers Paid** da Cloudflare (os limites do gratuito não comportam o app).
- O app mora em `https://falow.app.br/sistema` (o Worker só atende `/sistema` e `/sistema/*`; a raiz é a landing). Toda URL do app leva o `/sistema`.
- Webhooks: `https://falow.app.br/sistema/api/webhooks/meta` (Meta) e `https://falow.app.br/sistema/api/webhooks/stripe` (Stripe). Sem o `/sistema` a entrega cai na landing (404) e a Meta/Stripe desativam o endpoint.
- Configuração da Stripe, do app Meta, do e-mail (Resend como SMTP do Supabase Auth, remetente `nao-responda@falow.app.br`) e checagens do primeiro deploy: [docs/operacao-saas.md](docs/operacao-saas.md).

### Rodando localmente

```bash
git clone <url-do-repositorio> falow
cd falow
cp .env.example .env.local   # preencha os valores
npm install
npm run dev                  # http://localhost:3000/sistema
```

Para o Meta e a Stripe alcançarem seu computador em desenvolvimento, abra um túnel (`ngrok http 3000`) e use a URL gerada **com `/sistema`** em `NEXT_PUBLIC_APP_URL`, no OAuth Redirect URI e nos webhooks. Testes: `npm test` (nenhum fala com a rede; Stripe e Supabase são sempre mockados) e `npm run typecheck`.

## Variáveis de ambiente

| Variável | O que é | Onde conseguir |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública do Supabase | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave administrativa ⚠️ segredo | Supabase → Settings → API |
| `INSTAGRAM_APP_ID` | Instagram App ID | App Meta → produto Instagram → Business login settings |
| `INSTAGRAM_APP_SECRET` | Instagram App Secret ⚠️ segredo | App Meta → produto Instagram → Business login settings |
| `META_APP_SECRET` | Segredo geral do app (assina os webhooks) ⚠️ segredo | App Meta → Settings → Basic |
| `META_VERIFY_TOKEN` | Senha do webhook (você inventa) | O mesmo valor nos dois lados |
| `META_GRAPH_VERSION` | Versão da Graph API | `v25.0` |
| `NEXT_PUBLIC_APP_URL` | URL pública do app, **com o `/sistema`** e sem barra no fim (convites, redirects da Stripe e do OAuth, crons) | `https://falow.app.br/sistema` em produção; `http://localhost:3000/sistema` ou URL do ngrok + `/sistema` em dev |
| `TOKEN_ENCRYPTION_KEY` | Criptografa tokens no banco | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | Senha dos crons (`/api/cron/sequences` e `/api/cron/purge`) ⚠️ segredo | Você inventa; o `scheduled()` do Worker envia como `Authorization: Bearer` |
| `STRIPE_SECRET_KEY` | Chave secreta da API da Stripe ⚠️ segredo | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Segredo de assinatura do webhook da Stripe ⚠️ segredo | Stripe → Developers → Webhooks → endpoint `https://falow.app.br/sistema/api/webhooks/stripe` → Signing secret |
| `STRIPE_PRICE_ID` | Preço mensal do plano único | Stripe → Products → Falow → preço → API ID (`price_...`) |
| `FALOW_OWNER_USER_ID` | UUID do usuário dono (sem assinatura, sem limite de @, com a chave de IA da instalação, nunca apagado) | Supabase → Authentication → Users |
| `FALOW_ADMIN_USER_IDS` | UUIDs de admins além do dono, separados por vírgula (opcional). Dão acesso ao painel `/admin` | Supabase → Authentication → Users |
| `FALOW_ADMIN_REQUIRE_MFA` | `true` exige MFA (AAL2) para entrar no `/admin` (opcional; padrão desligado) | Você define |
| `NEXT_PUBLIC_CONTACT_EMAIL` | E-mail de contato das páginas públicas (opcional) | Veja "Páginas públicas" abaixo |
| `OPENROUTER_API_KEY` | Chave padrão do botão de IA, **só para o dono e os admins** (opcional; cada usuário pode cadastrar a sua em Contas) ⚠️ segredo | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENROUTER_MODEL` | Modelo usado por esse botão com a OpenRouter (opcional; também vale para a chave própria da OpenRouter sem modelo escolhido) | Padrão: `anthropic/claude-sonnet-4.5` |
| `OPENAI_API_KEY` | Alternativa direta à OpenRouter para a chave padrão (opcional, só dono e admins). Prioridade: chave do usuário, depois `OPENROUTER_API_KEY`, depois esta ⚠️ segredo | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | Modelo usado por esse botão com a OpenAI (opcional) | Padrão: `gpt-6-luna` |

## Páginas públicas

Quatro rotas abrem sem login (o [middleware](src/middleware.ts) libera todas) e são as páginas que a análise da Meta lê:

| Rota | Para que serve |
|---|---|
| `/` | Landing: o que o produto faz, como funciona a assinatura (botão "Assinar o Falow") e quais permissões ele usa |
| `/privacidade` | Política de Privacidade — campo **Privacy Policy URL** no painel da Meta |
| `/exclusao-de-dados` | Passo a passo de exclusão — campo **User Data Deletion** |
| `/termos-de-servico` | Termos de Serviço — campo **Terms of Service URL** |

As três páginas legais compartilham cabeçalho, rodapé e componentes em
[src/components/legal/](src/components/legal/), então data de vigência e contato
nunca divergem entre elas. `NEXT_PUBLIC_CONTACT_EMAIL` sobrescreve o e-mail de
contato mostrado nas páginas; sem ela vale o padrão de
[legal-chrome.tsx](src/components/legal/legal-chrome.tsx). O controlador dos dados
continua sendo o que está na Política de Privacidade e nos Termos, e esse e-mail
também recebe os pedidos de reembolso (arrependimento de 7 dias).

## Como funciona por dentro

```
DM chega → Meta dispara webhook → /api/webhooks/meta
   1. valida assinatura HMAC (X-Hub-Signature-256)
   2. idempotência por mid (retries do Meta não duplicam resposta)
   3. localiza a conta conectada
   4. atualiza a conversa (janela 24h + métricas)
   5. matching de regras (ignora acentos e maiúsculas)
   6. anti-duplicidade: mesma regra nunca 2x p/ mesma pessoa
   7. janela de 24h: mensagem atrasada não é respondida
   8. delay 2–5s → envia resposta via Graph API
   9. registra log da interação
```

| Regra de negócio | Implementação |
|---|---|
| Keyword nunca responde 2x ao mesmo usuário | `rule_triggers` com PK `(rule_id, ig_sender_id)` |
| Janela de 24h do Meta | Eventos atrasados viram `window_expired`, sem resposta |
| Sem regra → não responde | Log `no_match`, nenhuma chamada à API |
| Delay humanizado | 2–5s, configurável por regra |

**Stack:** Next.js 16 (App Router, React 19) · TypeScript · Tailwind + shadcn/ui · Supabase (Auth + Postgres com RLS) · API do Instagram com Login do Instagram (graph.instagram.com) · React Flow (canvas das Sequências). Pagamentos com Stripe (Checkout + portal do cliente). Hospedagem em Cloudflare Workers via OpenNext. Tokens são criptografados no banco (AES-256-GCM) e renovados automaticamente antes de expirar.

## Sequências (fluxos no canvas)

Em **Automação → Sequências** você desenha fluxos de conversa num canvas de blocos conectáveis:

| Bloco | O que faz |
|---|---|
| ⚡ **Gatilho** | Palavras-chave (ou qualquer DM) que colocam a pessoa no fluxo — cada pessoa entra 1x |
| 💬 **Mensagem** | Envia texto ou imagem e segue para o próximo bloco |
| 🖱️ **Botões** | Texto + até 3 botões — de link (abre página) ou de ramificação (cada botão segue um caminho) |
| ✅ **Respostas rápidas** | Pergunta + até 13 opções; cada opção é uma saída, com saída extra para quem digita outra coisa |
| ⏱️ **Atraso** | Espera de 5s a 23h antes de continuar (23h por causa da janela de 24h da Meta) |
| ⏳ **Esperar resposta** | Pausa até a pessoa mandar qualquer mensagem — e a resposta renova a janela de 24h |

Regras que o runtime respeita sozinho: janela de 24h da Meta (fluxo para com `window_expired` se fechar), delay humanizado + indicador "digitando…" antes de cada envio, cada saída entrega no máximo 1x (retries do Meta não duplicam), e quem está no meio de um fluxo não é "sequestrado" pelas regras de palavra-chave.

**Atrasos longos (minutos/horas):** o fluxo é retomado pelo endpoint `/api/cron/sequences`, protegido por `CRON_SECRET`. Em produção quem chama é o cron de 1 minuto do [wrangler.toml](wrangler.toml), executado pelo `scheduled()` do Worker. Além disso, a cada mensagem ou comentário que chega o Falow também retoma atrasos vencidos (tick oportunista). Contas sem assinatura ativa são puladas pelo cron.

## Estrutura do código

```
src/
  app/
    (dashboard)/        # dashboard, rules, accounts, logs
    api/auth/meta/      # OAuth: início + callback
    api/webhooks/meta/  # verificação GET + eventos POST
    api/cron/           # sequences (retoma atrasos) e purge (exclusão 30 dias após cancelar)
    api/billing/        # checkout e portal da Stripe
    api/webhooks/stripe/ # cria/atualiza assinaturas e convida o cliente por e-mail
    assinatura/         # página "Minha assinatura" e agradecimento pós-checkout
    login/              # autenticação (Supabase)
  components/           # ui/ (shadcn), layout/, dashboard/, rules/, sequences/ ...
  lib/
    meta/               # graph.ts, oauth.ts, verify.ts, process.ts (pipeline)
    rules/engine.ts     # matching normalizado + prioridade
    sequences/          # graph.ts (validação/travessia) + runtime.ts (executor)
    supabase/           # client com RLS + client admin (service role)
    billing/            # acesso por status da assinatura, Stripe, purge
    crypto.ts           # AES-256-GCM para tokens
supabase/migrations/    # schema completo + RLS, em ordem numérica
worker.ts               # entrada do Worker: fetch do OpenNext + scheduled() dos crons
wrangler.toml           # domínio falow.app.br e crons
docs/                   # operação do SaaS, App Review da Meta e guia antigo (histórico)
```

## Problemas comuns

- **Webhook da Meta não verifica** → `META_VERIFY_TOKEN` diferente entre o Worker e o painel Meta, ou URL do webhook ainda apontando para outro domínio;
- **Conta não conecta** → Instagram não é Profissional (Comercial/Criador), o redirect do OAuth no app Meta não é `https://falow.app.br/sistema/api/auth/meta/callback`, ou o login já tem uma conta ativa (limite de 1 @ por assinatura);
- **DM não gera log** → campo `messages` não assinado no webhook, "Permitir acesso a mensagens" desativado no Instagram (Configurações → Mensagens → Ferramentas conectadas), ou a assinatura do cliente está sem acesso (a conta fica calada de propósito);
- **Cliente pagou e não recebeu o convite** → confira o endpoint de webhook na Stripe (eventos entregues) e o SMTP do Supabase Auth. O passo a passo está em [docs/operacao-saas.md](docs/operacao-saas.md).
