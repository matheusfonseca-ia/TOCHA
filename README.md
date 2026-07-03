# ⚡ InstaReply

**Seu robô de auto-resposta para DMs do Instagram — instalado por você, controlado por você.**

Você conecta sua conta do Instagram, cria regras do tipo *"se receber **preço** → responda com o link da tabela"* e o InstaReply responde sozinho, 24h por dia, com delay humanizado de 2–5s. Painel completo com métricas e logs de cada mensagem.

Cada instalação é **sua**: seu banco (Supabase, grátis), seu app Meta, sua hospedagem. Nenhum dado passa por servidores de terceiros — e, por usar o **seu próprio app Meta em modo desenvolvimento**, funciona com a sua conta sem precisar do App Review.

> 📕 **Siga o guia ilustrado:** [docs/guia-configuracao-instareply.pdf](docs/guia-configuracao-instareply.pdf) — os 5 passos completos, com links e telas de onde tirar cada credencial.

---

## Instalação em 5 passos (resumo)

| # | Passo | Onde |
|---|---|---|
| 1 | Criar projeto no **Supabase** e rodar `supabase/migrations/0001_init.sql` no SQL Editor | [supabase.com/dashboard](https://supabase.com/dashboard) |
| 2 | Criar **app Meta** (tipo Business), configurar Facebook Login + Webhook Instagram | [developers.facebook.com/apps](https://developers.facebook.com/apps) |
| 3 | Preencher as **variáveis de ambiente** (`.env.local` ou painel da Vercel) | veja tabela abaixo |
| 4 | **Rodar** — local (`npm run dev` + ngrok) ou deploy na Vercel | — |
| 5 | Criar sua conta no painel (o cadastro se tranca sozinho depois), conectar o Instagram e criar a primeira regra | — |

### Deploy com um clique (Vercel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSEU-USUARIO%2Finstareply&project-name=instareply&repository-name=instareply&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,META_APP_ID,META_APP_SECRET,META_VERIFY_TOKEN,META_GRAPH_VERSION,NEXT_PUBLIC_APP_URL,TOKEN_ENCRYPTION_KEY&envDescription=Credenciais%20do%20Supabase%20e%20do%20app%20Meta%20—%20veja%20o%20guia%20em%20docs%2F)

O botão clona o repositório para a sua conta do GitHub e já pede as variáveis de ambiente na tela.
*(Mantenedor: troque `SEU-USUARIO` pela URL real do repositório.)*

### Rodando localmente

```bash
git clone https://github.com/SEU-USUARIO/instareply.git
cd instareply
cp .env.example .env.local   # preencha os valores (passos 1 e 2 do guia)
npm install
npm run dev                  # http://localhost:3000
```

Para o Meta alcançar seu computador em desenvolvimento, abra um túnel:

```bash
ngrok http 3000
```

e use a URL gerada em `NEXT_PUBLIC_APP_URL`, no OAuth Redirect URI e no webhook do painel Meta.

## Variáveis de ambiente

| Variável | O que é | Onde conseguir |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do seu projeto Supabase | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública do Supabase | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave administrativa ⚠️ segredo | Supabase → Settings → API |
| `META_APP_ID` | ID do seu app Meta | App Meta → Settings → Basic |
| `META_APP_SECRET` | Segredo do app ⚠️ segredo | App Meta → Settings → Basic |
| `META_VERIFY_TOKEN` | Senha do webhook (você inventa) | O mesmo valor nos dois lados |
| `META_GRAPH_VERSION` | Versão da Graph API | `v21.0` |
| `NEXT_PUBLIC_APP_URL` | URL pública da sua instalação | Domínio da Vercel ou ngrok |
| `TOKEN_ENCRYPTION_KEY` | Criptografa tokens no banco | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

## 🔒 A instalação é sua e de mais ninguém

Não existe variável de ambiente para travar o cadastro — o próprio sistema faz isso sozinho. Assim que a primeira conta é criada no painel (a sua), a aba "Criar conta" some da tela de login e o servidor passa a recusar qualquer novo cadastro, para sempre. Nenhum passo manual, nenhum redeploy.

Implementação: [src/lib/config.ts](src/lib/config.ts) consulta o Supabase Auth a cada carregamento da tela de login — se já existe pelo menos um usuário, o cadastro fica bloqueado (inclusive no servidor, em [src/app/login/actions.ts](src/app/login/actions.ts), então não dá para contornar chamando a action diretamente).

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

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui · Supabase (Auth + Postgres com RLS) · Meta Graph API. Tokens do Instagram são criptografados no banco (AES-256-GCM).

## Estrutura do código

```
src/
  app/
    (dashboard)/        # dashboard, rules, accounts, logs
    api/auth/meta/      # OAuth: início + callback
    api/webhooks/meta/  # verificação GET + eventos POST
    login/              # autenticação (Supabase)
  components/           # ui/ (shadcn), layout/, dashboard/, rules/, auth/ ...
  lib/
    meta/               # graph.ts, oauth.ts, verify.ts, process.ts (pipeline)
    rules/engine.ts     # matching normalizado + prioridade
    supabase/           # client com RLS + client admin (service role)
    config.ts           # trava de cadastro automática (1ª conta bloqueia as demais)
    crypto.ts           # AES-256-GCM para tokens
supabase/migrations/    # schema completo + RLS (rodar no SQL Editor)
docs/                   # 📕 guia de configuração em PDF
```

## Problemas comuns

O guia PDF tem uma página inteira de solução de problemas. Os três campeões:

- **Webhook não verifica** → `META_VERIFY_TOKEN` diferente entre `.env` e painel Meta, ou túnel/deploy fora do ar;
- **Conta não conecta (`no_ig_account`)** → Instagram não é Profissional ou não está vinculado a uma Página do Facebook;
- **DM não gera log** → campo `messages` não assinado no webhook, ou o remetente não é testador do app Meta (modo desenvolvimento).
