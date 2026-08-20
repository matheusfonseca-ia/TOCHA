# App Review da Meta — registro da submissão

**Enviado em:** 19/08/2026
**Status:** aguardando decisão (a Meta costuma responder em até uma semana)
**App ID:** 1910160143015797
**Caso de uso:** Gerenciar mensagens e conteúdo no Instagram (único selecionado)

---

## Permissões pedidas (Acesso Avançado)

| Permissão | O que sustenta no produto |
|---|---|
| `instagram_business_basic` | Identifica a conta conectada e mantém o token válido. Também declarada como **permissão dependente** das outras duas |
| `instagram_business_manage_messages` | Recebe as DMs e envia as respostas das regras e sequências |
| `instagram_business_manage_comments` | Lê comentários e responde publicamente e/ou por DM privada |

**Removidas da submissão de propósito:**

- `public_profile` — entrou sozinha colada ao caso de uso. É do Login do Facebook, já vem com
  acesso avançado por padrão, e o Falow nem a solicita ([oauth.ts](../src/lib/meta/oauth.ts)).
  Deixar reduziria a superfície testada sem ganho nenhum.
- `instagram_business_content_publish` — o Falow não publica nada. Pedir permissão que não se
  demonstra em screencast é motivo de reprovação.

---

## O que foi declarado

**Controlador dos dados:** PATRICIA POLETINI FONSECA, CNPJ 15.030.598/0001-39, Itatiba/SP,
Brasil. É o mesmo nome do portfólio empresarial verificado — o analista cruza os dois.

**Operadores de dados** (categoria *IT solutions and services, including cloud storage and
processing* nos dois):

- **Supabase, Inc.** — banco Postgres e autenticação. Guarda tokens (AES-256-GCM), id e
  usuário da conta, texto de mensagens e comentários, ids de remetente e logs
- **Vercel, Inc.** — hospedagem. Os dados passam por lá em trânsito ao processar o webhook

Cloudflare e AWS **não** foram listados: são subprocessadores da Supabase e da Vercel, não
contratados diretos.

**Sem Login do Facebook.** Declarado explicitamente que o app não usa Facebook Login nem pede
`public_profile`, `email`, `user_friends`, `user_gender` ou `user_birthday`, e não exige Página
do Facebook. A autenticação é só Business Login for Instagram
(`instagram.com/oauth/authorize` → `graph.instagram.com/v25.0`).

**Credenciais de teste:** conta principal do painel (`matheusfonseca5019@gmail.com`) em
`https://falow.automatorsclub.tech/login`. A senha não fica registrada aqui — veja as
pendências abaixo.

---

## Páginas públicas cadastradas

Todas sem login, servidas do mesmo domínio do app (exigência da Meta):

| Campo no painel | URL |
|---|---|
| — (home) | `https://falow.automatorsclub.tech` |
| Privacy Policy URL | `https://falow.automatorsclub.tech/privacidade` |
| User Data Deletion | `https://falow.automatorsclub.tech/exclusao-de-dados` |
| Terms of Service URL | `https://falow.automatorsclub.tech/termos-de-servico` |

Commits que as prepararam, no repo `matheusfonseca-ia/TOCHA`:

- `05c4d36` — reorganiza as páginas legais em `(legal)`, cria `/termos-de-servico`, troca o
  redirect da raiz por uma landing, libera `/` no middleware
- `9871bb4` — nomeia o controlador na privacidade e nos termos, foro em Itatiba, e faz o
  e-mail de contato ter padrão no código (antes sumia se `NEXT_PUBLIC_CONTACT_EMAIL` faltasse
  no build, deixando as páginas sem canal de contato)

---

## Riscos conhecidos

**1. Acesso Padrão vs. conta do analista.** O analista vai tentar conectar o Instagram dele.
Com Acesso Padrão, só quem tem papel no app consegue autorizar. Se ele travar aí, reprova por
"não consegui testar". Mitigação já incluída no texto da submissão: pedimos que ele responda
com o @ para adicioná-lo como Instagram Tester.

**Se acontecer:** adicionar em [App Roles → Roles](https://developers.facebook.com/apps/1910160143015797/roles/roles/)
e reenviar. Reenvio não tem limite nem penalidade.

**2. Descrição vaga ou screencast incompleto** é a causa nº 1 de reprovação. Cada permissão foi
enviada com texto próprio (sem repetir entre elas) e vídeo próprio.

---

## Pendências

- [ ] **Trocar a senha do painel depois da aprovação** — foi entregue ao analista, e essa conta
      dá acesso ao painel inteiro, aos logs de conversa e à conta de Instagram conectada
- [ ] **Campo "Site" do portfólio empresarial** — estava em `tech-care-tales.lovable.app`,
      sobra de outro projeto. Precisa apontar pra `falow.automatorsclub.tech`
- [ ] **Conferir `NEXT_PUBLIC_APP_URL` na Vercel** — se ficou em `tocha-six.vercel.app`, o
      redirect do OAuth aponta pro domínio velho e a conexão quebra sem erro visível
- [ ] **Apagar o post de teste** (se um post descartável foi usado na demo de comentários)
- [ ] `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` no `.env.local` — só afeta rodar local

---

## Se reprovar

A Meta manda o motivo específico. Corrige e reenvia — sem limite de tentativas. Os motivos mais
comuns, na ordem: analista não conseguiu conectar (ver risco 1), screencast sem a tela de
autorização OAuth completa, dado da permissão não aparecendo renderizado na interface, e
descrição que não explica por que um escopo menor não resolveria.

Enquanto não aprova, o fluxo atual continua funcionando normalmente para contas cadastradas
como Instagram Tester.
