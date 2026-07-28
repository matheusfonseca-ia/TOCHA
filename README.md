# ⚡ Falow

**Seu robô de auto-resposta para DMs do Instagram — instalado por você, controlado por você.**

Você conecta sua conta do Instagram, cria regras do tipo *"se receber **preço** → responda com o link da tabela"* e o Falow responde sozinho, 24h por dia, com delay humanizado de 2–5s. Painel completo com métricas e logs de cada mensagem.

E quando uma resposta só não basta, as **Sequências** entram em cena: um canvas visual (estilo n8n/ManyChat) onde você conecta blocos — mensagens, botões, respostas rápidas, atrasos, esperas — e monta fluxos de conversa inteiros que rodam sozinhos na DM.

Cada instalação é **sua**: seu banco (Supabase, grátis), seu app Meta, sua hospedagem. Nenhum dado passa por servidores de terceiros — e, por usar o **Login do Instagram** no seu próprio app Meta, funciona com a sua conta **sem App Review** e sem precisar de Página do Facebook.

> 📕 **Siga o guia ilustrado:** [docs/guia-configuracao-falow.pdf](docs/guia-configuracao-falow.pdf) — o passo a passo completo, com links e telas de onde tirar cada credencial.

---

## Instalação em 5 passos (resumo)

| # | Passo | Onde |
|---|---|---|
| 1 | Criar projeto no **Supabase** e rodar `supabase/migrations/0001_init.sql` (arquivo único) no SQL Editor | [supabase.com/dashboard](https://supabase.com/dashboard) |
| 2 | Criar **app Meta** (tipo Business), adicionar o produto **Instagram** (Login do Instagram para empresas), configurar o webhook, cadastrar sua conta como testadora e colocar o app em modo **Live** | [developers.facebook.com/apps](https://developers.facebook.com/apps) |
| 3 | Preencher as **variáveis de ambiente** (`.env.local` ou painel da Vercel) | veja tabela abaixo |
| 4 | **Rodar** — local (`npm run dev` + ngrok) ou deploy na Vercel | — |
| 5 | Criar sua conta no painel (o cadastro se tranca sozinho depois), conectar o Instagram e criar a primeira regra | — |

### Deploy com um clique (Vercel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSEU-USUARIO%2Ffalow&project-name=falow&repository-name=falow&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,INSTAGRAM_APP_ID,INSTAGRAM_APP_SECRET,META_APP_SECRET,META_VERIFY_TOKEN,META_GRAPH_VERSION,NEXT_PUBLIC_APP_URL,TOKEN_ENCRYPTION_KEY,CRON_SECRET&envDescription=Credenciais%20do%20Supabase%20e%20do%20app%20Meta%20—%20veja%20o%20guia%20em%20docs%2F)

O botão clona o repositório para a sua conta do GitHub e já pede as variáveis de ambiente na tela.
*(Mantenedor: troque `SEU-USUARIO` pela URL real do repositório.)*

### Rodando localmente

```bash
git clone https://github.com/SEU-USUARIO/falow.git
cd falow
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
| `INSTAGRAM_APP_ID` | Instagram App ID | App Meta → produto Instagram → Business login settings |
| `INSTAGRAM_APP_SECRET` | Instagram App Secret ⚠️ segredo | App Meta → produto Instagram → Business login settings |
| `META_APP_SECRET` | Segredo geral do app (assina os webhooks) ⚠️ segredo | App Meta → Settings → Basic |
| `META_VERIFY_TOKEN` | Senha do webhook (você inventa) | O mesmo valor nos dois lados |
| `META_GRAPH_VERSION` | Versão da Graph API | `v25.0` |
| `NEXT_PUBLIC_APP_URL` | URL pública da sua instalação | Domínio da Vercel ou ngrok |
| `TOKEN_ENCRYPTION_KEY` | Criptografa tokens no banco | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | Senha do tick das Sequências (você inventa) | Veja "Sequências" abaixo |

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

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui · Supabase (Auth + Postgres com RLS) · API do Instagram com Login do Instagram (graph.instagram.com) · React Flow (canvas das Sequências). Tokens são criptografados no banco (AES-256-GCM) e renovados automaticamente antes de expirar.

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

**Atrasos longos (minutos/horas):** o fluxo é retomado pelo endpoint `/api/cron/sequences`, protegido por `CRON_SECRET`. Três formas de acioná-lo, da mais simples à mais precisa:

1. **Automática** — a cada mensagem/comentário que chega, o Falow também retoma atrasos vencidos (tick oportunista). Para contas com movimento, resolve.
2. **Cron da Vercel** — já configurado em `vercel.json` (1x/dia, limite do plano Hobby).
3. **Agendador externo grátis** (recomendado p/ precisão de minutos) — crie um monitor no [cron-job.org](https://cron-job.org) chamando `https://SEU-APP.vercel.app/api/cron/sequences?secret=SEU_CRON_SECRET` a cada 1–5 minutos.

## Estrutura do código

```
src/
  app/
    (dashboard)/        # dashboard, rules, accounts, logs
    api/auth/meta/      # OAuth: início + callback
    api/webhooks/meta/  # verificação GET + eventos POST
    api/cron/sequences/ # tick que retoma atrasos das sequências
    login/              # autenticação (Supabase)
  components/           # ui/ (shadcn), layout/, dashboard/, rules/, sequences/ ...
  lib/
    meta/               # graph.ts, oauth.ts, verify.ts, process.ts (pipeline)
    rules/engine.ts     # matching normalizado + prioridade
    sequences/          # graph.ts (validação/travessia) + runtime.ts (executor)
    supabase/           # client com RLS + client admin (service role)
    config.ts           # trava de cadastro automática (1ª conta bloqueia as demais)
    crypto.ts           # AES-256-GCM para tokens
supabase/migrations/    # 0001_init.sql — schema completo + RLS (rodar uma vez no SQL Editor)
docs/                   # 📕 guia de configuração em PDF
```

## Problemas comuns

O guia PDF tem uma página inteira de solução de problemas. Os três campeões:

- **Webhook não verifica** → `META_VERIFY_TOKEN` diferente entre `.env` e painel Meta, ou túnel/deploy fora do ar;
- **Conta não conecta** → Instagram não é Profissional (Comercial/Criador), ou a conta não aceitou o convite de testadora do app;
- **DM não gera log** → campo `messages` não assinado no webhook, app Meta fora do modo **Live**, ou "Permitir acesso a mensagens" desativado no Instagram (Configurações → Mensagens → Ferramentas conectadas).
