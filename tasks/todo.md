# Falow: CRM de conversas (Inbox estilo WhatsApp + Funil Kanban)

Planejado em 2026-09-28. Status: **aprovado em 28/09 (D1 a D4 como propostas); Fase 0 em andamento**.
Validação: 8 agentes Sonnet em paralelo, um por feature, só pesquisa (doc oficial da
Meta e da Supabase + leitura do código).

## Pedido

CRM dentro do Falow, no estilo Kommo: ver as DMs em duas visões, (1) painel de conversa
estilo WhatsApp e (2) kanban de leads por etapa. Com tags, excluir mensagens, editar, etc.
Arquitetura `modular-arch`.

## Ponto de partida (o que existe hoje)

- **Nenhuma mensagem é guardada.** `conversations` só controla a janela de 24h
  (`last_inbound_at`) e a pausa (`automation_paused_until`); `interactions` loga só as
  mensagens recebidas que passaram pelas automações. Envios não são gravados e os ecos
  (`is_echo`) são descartados em `src/lib/meta/process.ts:187`.
- `contacts` existe (`fields jsonb`, `tags text[]`), mas só ganha linha quando um workflow
  coleta dado ou define tag.
- Um usuário por conta (`ig_accounts.user_id`), sem equipe: "responsável pelo lead" fica
  fora deste plano.
- Não há client do Supabase para o navegador (`src/lib/supabase` só tem `server.ts` e `admin.ts`).
- `handleSequenceReply` (passo 4a) roda antes da checagem de `automation_paused_until`
  (passo 4a-bis) em `processMessagingEvent`. Hoje é intencional (quem está no meio do fluxo
  continua), mas para "Assumir conversa" o bot engoliria a resposta do lead: o takeover do
  CRM precisa de checagem própria antes do 4a.

## Matriz de viabilidade (resultado dos agentes)

| Feature | Veredito | Base |
|---|---|---|
| Guardar mensagens recebidas (texto, mídia, story, reel) | Viável | webhook `messages` já assinado |
| Guardar mensagens enviadas (automação, workflow, painel) | Viável | envio devolve `message_id`; eco (`is_echo`) chega para tudo que a conta envia |
| Mensagens enviadas pelo app do Instagram no celular | Viável com limitação | chegam como eco; separar app de API pelo payload não é documentado no Instagram Login (Fase 0) |
| Histórico anterior ao CRM | Viável com limitação | Conversations API: só as 20 mensagens mais recentes por conversa |
| Mídia recebida | Viável com limitação | URL da CDN expira; copiar para Storage próprio já reprovou app no App Review (caso público do Chatwoot): guardar só a URL |
| Responder pelo painel (texto, imagem, áudio, vídeo, PDF, ❤️) | Viável | janela de 24h, anexo por URL pública |
| Responder até 7 dias (tag `HUMAN_AGENT`) | **Inviável sem App Review** | Fase 0: 403 "must be reviewed and approved by Facebook" |
| Tags com cor, filtro, aplicar e remover | Viável | catálogo novo + `contacts.tags` atual, zero mudança no runtime do workflow |
| Excluir mensagem: "Apagar para mim" (só no Falow) | Viável | soft delete local |
| Desfazer envio no Instagram / apagar conversa | **Inviável** | a API não tem endpoint |
| Lead apagou uma mensagem | Viável | evento `messages` com `is_deleted: true` |
| Editar mensagem enviada | **Inviável** | a API não tem endpoint |
| Lead editou uma mensagem | Viável (Fase 0) | `message_edit: {mid, text, num_edit}` chega no Instagram Login |
| Alternativas de "editar" | Viável | rascunho, respostas rápidas, notas internas e dados do contato, todos editáveis |
| Reação do lead | Viável | assinar `message_reactions` |
| Reagir pela conta | **Inviável hoje** | Fase 0: "wow" = 400, "love"/"😂" = 500 em 5 tentativas |
| Lead respondeu citando | Viável | `message.reply_to.mid` |
| Responder citando pela conta | Viável (Fase 0) | `reply_to: {mid}` no topo da requisição; eco confirma a citação |
| "Visto" pelo lead | Viável | assinar `messaging_seen` |
| Marcar como lida / digitando | Viável (Fase 0) | `mark_seen`, `typing_on/off` = 200 |
| Kanban com arrastar | Viável | `@dnd-kit/core` + `sortable` (teclado, toque, scroll entre colunas) |
| Atualização ao vivo | Viável | Supabase Realtime: WebSocket do navegador direto na Supabase, não passa pelo Worker |
| Responsável / equipe | Fora do escopo | schema é 1 usuário por conta |

## Decisões para aprovar (default proposto)

- [x] **D1 Navegação**: item novo "CRM" na sidebar com duas abas, **Conversas** e **Funil**.
      A página Contatos continua como está (pode migrar para dentro do CRM depois).
- [x] **D2 Entrada no funil**: quem manda a 1ª DM entra sozinho no funil padrão, etapa
      "Novos". Desligável por funil (`auto_enroll`). Funil padrão: Novos, Em conversa,
      Negociando, Ganho, Perdido (tudo editável).
- [x] **D3 Humano x bot**: responder pelo painel **assume a conversa**: automações e
      workflows param para aquela pessoa (inclusive fluxo esperando resposta e atraso
      agendado) até clicar em "Devolver ao bot". Botão "Assumir" também existe sem responder.
- [x] **D4 Mídia**: guardar só o link da Meta, sem copiar o arquivo (política da Meta).
      Mídia expirada aparece como "Mídia indisponível, abrir no Instagram".

Restrições da API que viram UX (não são decisões): "Apagar para mim" com aviso de que o
contato continua vendo; não existe "Editar mensagem enviada", reação enviada pela conta nem
resposta fora das 24h (esta exige App Review do `HUMAN_AGENT`).

## Arquitetura (modular-arch)

Tudo que é do CRM mora em `src/modules/crm/`, cada sub-feature numa vertical própria
(UI + hooks + dados + tipos). Rotas em `src/app` só montam a página e chamam o módulo pela
API pública (`src/modules/crm/index.ts`). Fora do módulo entram só peças agnósticas:
`src/lib/supabase/client.ts` (client do navegador), primitivos shadcn novos em
`src/components/ui/` (popover, scroll-area, avatar, command) e funções de envio novas em
`src/lib/meta/graph.ts` (camada da Graph API, sem regra de CRM).

```
src/modules/crm/
├── index.ts                     # API pública do módulo (única porta de entrada)
├── shared/
│   ├── types/                   # Conversation, Message, Lead, Stage, Tag
│   └── utils/                   # messaging-window.ts (24h / 7d), message-preview.ts
├── capture/                     # sem UI: webhook e envios gravam por aqui
│   ├── server/capture-event.ts  # entrada única chamada por process.ts (best effort)
│   ├── server/record-inbound.ts # mensagem do lead + contato + lead no funil
│   ├── server/record-outbound.ts# upsert por mid (envio e eco convergem)
│   ├── server/apply-signals.ts  # is_deleted, reação, visto, edição
│   ├── utils/parse-event.ts     # payload da Meta -> rascunho de mensagem (função pura)
│   └── __tests__/
├── inbox/
│   ├── components/              # inbox-shell, conversation-list(-item), conversation-filters,
│   │                            # thread, message-bubble, message-actions-menu, composer,
│   │                            # window-indicator, handoff-toggle, contact-panel, notes-panel
│   ├── hooks/                   # use-inbox-realtime, use-thread, use-composer-draft
│   └── services/                # inbox.queries.ts (server) e inbox.actions.ts ("use server")
├── handoff/
│   ├── server/takeover.ts       # assumir / devolver; lido pelo webhook e pelo runtime
│   └── __tests__/
├── tags/
│   ├── components/              # tag-badge, tag-picker, tag-manager-dialog, tag-filter
│   ├── services/                # tags.queries.ts, tags.actions.ts
│   └── utils/normalize-tag.ts   # mesma normalização da Condição do workflow
├── pipeline/
│   ├── components/              # board, board-column, lead-card, lead-drawer,
│   │                            # pipeline-switcher, stage-settings-dialog
│   ├── components/workflow/     # move-to-stage-node + form (registrados no editor)
│   ├── hooks/use-board-dnd.ts
│   ├── services/                # pipeline.queries.ts, pipeline.actions.ts
│   ├── server/                  # enroll-lead.ts, move-lead.ts (painel e runtime usam o mesmo)
│   └── utils/fractional-index.ts
├── quick-replies/               # respostas rápidas ("/" no composer)
└── history-import/              # Conversations API (últimas 20 por conversa)
```

Rotas (finas):

```
src/app/(dashboard)/crm/layout.tsx           # abas Conversas | Funil
src/app/(dashboard)/crm/page.tsx             # redireciona para /crm/conversas
src/app/(dashboard)/crm/conversas/page.tsx   # ?c=<conversa>&conta=&tag=&filtro=
src/app/(dashboard)/crm/funil/page.tsx       # ?funil=<id>
```

Tela cheia igual ao editor do Workflow (`sequence-editor.tsx:898`,
`fixed inset-y-0 md:left-60`). No celular, lista, conversa e ficha viram telas separadas.

Pontos de contato com código existente (só chamadas novas, sem refatorar):

- `src/lib/meta/process.ts`: 1 chamada `captureMessagingEvent(...)` no topo de
  `processMessagingEvent` (antes do `return` do eco), em try/catch. **Falha no CRM nunca
  derruba automação.** Checagem de takeover antes do passo 4a.
- `src/lib/meta/graph.ts`: `subscribed_fields` + `message_reactions,messaging_seen`
  + `message_edit` (confirmados na Fase 0); envio de anexo, ❤️, `mark_seen`, `reply_to` e
  `messaging_type`/`tag`.
- `src/lib/sequences/runtime.ts` e `processDueRuns`: respeitar takeover; nó `moveToStage`.
- Pontos de envio (process.ts, runtime de sequências, follow-gate): gravar a mensagem
  enviada com a origem certa.
- `src/components/layout/sidebar.tsx`: item CRM + badge de não lidas.

## Modelo de dados

`0009_crm_inbox.sql` (idempotente, padrão das anteriores):

```sql
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.ig_accounts (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  ig_sender_id    text not null,          -- sempre o lead (o outro lado da conversa)
  direction       text not null check (direction in ('inbound', 'outbound')),
  source          text not null check (source in
                  ('contact', 'automation', 'workflow', 'agent', 'instagram_app', 'import')),
  mid             text,                   -- id da Meta (nulo só em envio que falhou)
  kind            text not null default 'text',  -- text, image, video, audio, file, sticker,
                                          -- share, story_reply, story_mention, reel, postback
  text            text,
  attachments     jsonb,                  -- [{type, url}]: só a URL da CDN (D4)
  meta            jsonb,                  -- quick_reply, postback, botões enviados
  reply_to_mid    text,                   -- citação (do lead ou da conta)
  reaction_emoji  text,                   -- reação do lead (campo `emoji`)
  sent_by         uuid references auth.users (id),
  status          text not null default 'sent' check (status in ('sent', 'failed')),
  error_detail    text,
  deleted_by_contact_at timestamptz,      -- lead apagou (is_deleted)
  edited_at       timestamptz,            -- lead editou (message_edit)
  edit_count      int not null default 0,
  original_text   text,                   -- texto antes da 1ª edição
  hidden_at       timestamptz,            -- "Apagar para mim"
  created_at      timestamptz not null    -- horário do evento na Meta
);
-- unique (account_id, mid) where mid is not null · index (conversation_id, created_at desc)

alter table public.conversations
  add column if not exists contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_text text,  -- a tela monta a prévia pelo kind
  add column if not exists last_message_kind text,
  add column if not exists last_message_direction text,
  add column if not exists unread_count int not null default 0,
  add column if not exists contact_seen_at timestamptz,   -- messaging_seen
  add column if not exists human_takeover_at timestamptz, -- D3
  add column if not exists status text not null default 'open';  -- open | done
```

- Trigger `after insert` em `messages` atualiza `last_message_*` e soma `unread_count` nas
  recebidas (lista ordenada e contagem sem query pesada).
- RLS: `messages` select do dono (update só via server action); `conversations` ganha
  policy de update do dono.
- `alter publication supabase_realtime add table public.messages, public.conversations;`
- `message_signals_pending`: reação / edição / apagado que chegam antes da mensagem
  (Fase 0 provou que acontece).
- `crm_notes` (notas internas por contato) e `quick_replies` (atalho + texto).

`0010_crm_tags.sql`: `crm_tags (account_id, name, color)` +
`create unique index ... on crm_tags (account_id, lower(name))` + índice GIN em
`contacts.tags`. `contacts.tags text[]` continua sendo a fonte da verdade (runtime do
workflow e testes intactos).

`0011_crm_pipeline.sql`: `pipelines` (account_id, name, is_default, auto_enroll),
`pipeline_stages` (position numeric, color, stage_type open/won/lost,
on_enter_sequence_id), `leads` (contact_id, stage_id, value, position numeric,
entered_stage_at, closed_at; 1 lead aberto por funil e contato via índice único parcial),
`lead_stage_events` (from, to, source manual/automation/system). RLS no padrão
`account_id in (select id from ig_accounts where user_id = auth.uid())`. `leads` na
publicação do Realtime.

## Fases

Cada fase fecha com `npx tsc --noEmit`, `npm test` e `npm run build` limpos, migration
aplicada e teste manual logado antes da próxima. Deploy manual ao fim de cada fase entregue.

### Fase 0: spike com conta real (antes de codar a captura)

O usuário faz as ações no celular com a conta de teste; o Claude lê os eventos via
`wrangler tail` (log temporário do payload bruto, removido no fim).

- [x] Mensagem enviada pela API e pelo app do Instagram: o eco traz algo que separe os dois
      (`app_id`?) e o `mid` do eco é igual ao `message_id` devolvido no envio?
- [x] Assinar `message_reactions`, `messaging_seen` e `message_edit` na conta de teste; o lead
      reage, visualiza, edita e apaga uma mensagem. Registrar o que chega e o formato.
- [x] Reação com emoji diferente de ❤️, `mark_seen` e 1 envio com `HUMAN_AGENT` fora das 24h.
- [x] Resultado anotado aqui; ajusta os itens "conforme Fase 0" das fases seguintes.
- [x] Limpeza: secret `WEBHOOK_DEBUG_IG_IDS` apagado (log parou), 0 sessões de tail
      abertas, payloads capturados apagados do scratchpad. O `console.log` temporário em
      `route.ts` sai no commit da Fase 1.

**Resultados (28/09, conta @euheliomonteiro + lead de teste @ion_comunnity, IGSID
4181139912021434).** Log temporário em produção (commit a99af2c, secret
`WEBHOOK_DEBUG_IG_IDS`), lido pelo `wrangler tail`; scripts em scratchpad `crm-spike/`.

- Assinatura por conta aceitou `message_reactions`, `messaging_seen` e `message_edit`
  (200). A conta estava sem `messaging_referral` (conectada antes desse campo entrar no
  OAuth): reassinado junto. **Contas conectadas antes de 23/09 podem estar sem o gatilho
  "Link de referência" funcionando**; o script de reassinatura da Fase 1 resolve.
- Eco: `mid` do eco == `message_id` devolvido pelo envio (confirmado). O payload do eco
  é só `{mid, text, is_echo}`: **nada separa API de app**. Decisão: a origem é gravada no
  envio; eco sem registro vira `instagram_app`.
- Eco chegou ~7s depois do envio: o envio grava antes na maioria dos casos, mas o upsert
  precisa funcionar nas duas ordens.
- `messaging_seen` chega (`read: {mid}`), e o `mid` pode ser o da própria mensagem do lead:
  "Visto" deve ser calculado por horário (`contact_seen_at`), não por mid.
- Resposta a story chega com `reply_to.story {id, url}` e `url` em `lookaside.fbsbx.com`.
- `typing_on`, `typing_off` e `mark_seen`: 200.
- **`HUMAN_AGENT`: 403, exige App Review** ("must be reviewed and approved by Facebook").
  Fora do MVP; indicador de janela mostra só "aberta" / "fechada".
- **Reagir pela conta: não funciona.** "wow" = 400 "Reação inválida"; "love" e "😂" = 500
  transitório em 5 tentativas. Fora do MVP.
- Eco de mensagem enviada pelo **app do Instagram**: `{mid, text, is_echo}`, idêntico ao eco
  da API (confirma a regra "eco sem registro = `instagram_app`").
- **Reação do lead chega**: `reaction: {mid, action: "react", reaction: "like", emoji: "👍"}`.
  Guardar o `emoji` (a categoria `reaction` é genérica).
- **Edição do lead chega** (`message_edit` funciona no Instagram Login, ao contrário do que
  a doc sugeria): `message_edit: {mid, text, num_edit}`. "Editada" no balão entra no MVP.
- **Desfazer envio do lead**: `message: {mid, is_deleted: true}`, sem texto.
- **Citação do lead**: `message.reply_to: {mid, is_self_reply}`. Eco de citação feita pelo
  app da conta também traz `reply_to`.
- **Citar pela API FUNCIONA** com `reply_to: {mid}` no TOPO da requisição (junto de
  `recipient`), não dentro de `message` (esse dá 400 "Invalid keys"). Confirmado pelo eco
  com `reply_to`. "Responder citando" entra no composer.
- Foto e áudio: `attachments: [{type: "image" | "audio", payload: {url}}]`, sem texto, URL
  em `lookaside.fbsbx.com/ig_messaging_cdn`.
- **Eventos chegam fora de ordem**: a reação e a edição chegaram ANTES da mensagem a que
  se referem. A captura precisa de fila de sinais pendentes (ver Fase 1).
- Conversations API funciona no Instagram Login; mensagens com botões (template) voltam
  com `message: ""` no histórico, então a importação não recupera o conteúdo delas.

### Fase 1: captura de mensagens (fundação, sem UI)

Desenho da captura (a partir da Fase 0):
- Enviadas: `graph.ts` ganha um observador opcional por contexto assíncrono
  (`AsyncLocalStorage`, suportado no Worker com `nodejs_compat` e já usado pelo OpenNext).
  `graph.ts` continua sem saber de CRM: só avisa "mensagem enviada" a quem estiver
  observando. O módulo CRM expõe `observeOutbound(accountId, source, fn)`; `process.ts`
  envolve regras (`automation`) e o runtime envolve workflows (`workflow`). Nenhum
  ponto de envio muda de assinatura.
- Envio grava com upsert que corrige a origem; eco faz insert que ignora duplicado.
- Sinais (reação, edição, apagado, visto) que chegam antes da mensagem vão para
  `message_signals_pending (account_id, mid, type, payload, created_at)`; ao gravar uma
  mensagem, a captura aplica e remove os pendentes daquele `mid`. Pendentes com mais de
  7 dias são descartados quando um sinal novo entra na fila.
- Resposta privada a comentário cria conversa sem mensagem do lead: `last_inbound_at`
  passa a aceitar nulo (janela fechada) e `touchConversation` precisa tratar nulo no
  `.lt(...)` (hoje `null < at` não atualiza). `runtime.ts:1184` já trata ausência como
  janela fechada.

- [x] Migration 0009 escrita (`supabase/migrations/0009_crm_inbox.sql`); **falta aplicar**
- [x] `capture/utils/parse-event.ts` (pura) + testes: texto, quick reply, postback, anexos,
      story reply, story mention, eco, `is_deleted`, reação, visto, `reply_to`
- [x] `captureMessagingEvent` em `process.ts` (best effort, em paralelo com a automação).
      Mudança: NÃO cria linha em `contacts` para todo lead (inundaria a página Contatos, D1);
      `conversations.contact_id` fica para a Fase 2/5 decidir
- [x] Enviadas: envio e eco convergem por upsert em `(account_id, mid)`. O envio grava a
      origem (automation / workflow / agent); eco sem registro vira `instagram_app`
      (Fase 0: o eco não traz nada que separe app de API)
- [x] Toque em botão (postback) gravado como mensagem do lead com o título do botão
- [x] `subscribed_fields` novos em `WEBHOOK_FIELDS` (graph.ts) para contas novas; a única
      conta conectada já foi reassinada na Fase 0, então o script de reassinatura não foi necessário
- [x] Testes de integração em `process.test.ts`: automação responde igual com e sem CRM;
      erro ao gravar em `messages` não muda a resposta; eco repetido não duplica

- [x] Verificação: `tsc` limpo, vitest 400/400 (45 novos: parse-event 18, parse-sent 8,
      capture 16, process 3), `npm run build` ok, zero travessão em `src/modules`
- [x] `scripts/check-db-schema.mjs` exige a 0009 (bloqueia o build da Vercel sem ela)
- [x] 0009 aplicada no Supabase de produção (Cloudflare) em 28/09 pelo SQL Editor, antes do
      deploy. Conferido no catálogo: `last_inbound_at` nullable e sem default, trigger,
      unique, realtime (conversations, messages), policy; 58 conversas intactas
- [ ] Aplicar 0009 também no Supabase da Vercel antes do próximo push para o `tocha`
- [x] Deploy (Worker 760d67ac, 28/09). 1ª captura real: resposta pelo app da conta a um lead,
      citando, gravada como `outbound/instagram_app` com `reply_to_mid`
- [ ] E2E com o lead de teste: DM, resposta de automação (origem `automation`), reação e
      edição conferidas no banco

### Fase 2: Inbox (leitura, ao vivo)

- [ ] Carregar `design-taste-frontend` antes da UI (seguindo a identidade atual do app, dark/light)
- [ ] `src/lib/supabase/client.ts` (createBrowserClient)
- [ ] Sidebar com "CRM" + badge de não lidas; `crm/layout.tsx` com as abas
- [ ] Lista: foto, @, prévia, horário, não lidas; filtros (conta, não lidas, abertas /
      concluídas, tag); busca por @, nome e texto
- [ ] Conversa: balão por tipo (texto, imagem, vídeo, áudio com player, story com miniatura,
      reel ou post compartilhado, botões e respostas rápidas enviadas, toque em botão),
      separador por dia, origem da enviada (Automação, Workflow, Você, App do Instagram),
      "Visto", "Mensagem apagada pelo contato", citação, reação
- [ ] Ficha lateral: perfil, campos coletados (`contacts.fields`, editáveis), tags, etapa do
      funil, workflows em andamento, link "Abrir no Instagram"
- [ ] Realtime (postgres_changes) em `conversations` e `messages`; refetch ao voltar o foco
      da aba como rede de segurança
- [ ] Abrir a conversa zera `unread_count`
- [ ] Conferir 375 / 768 / 1440

### Fase 3: responder e passar para o humano

- [ ] `graph.ts`: envio de anexo (imagem, áudio, vídeo, arquivo), ❤️, `mark_seen`,
      `messaging_type` + `tag`
- [ ] Composer: texto (limite de 1000 com contador), imagem e arquivo (upload para o bucket
      `crm-uploads` do Supabase Storage com URL pública; é arquivo do usuário, não da Meta),
      Enter envia e Shift+Enter quebra linha, rascunho por conversa, envio otimista com
      "Falhou, tentar de novo"
- [ ] Responder citando: "Responder" no menu da mensagem mostra a citação no composer e
      envia `reply_to: {mid}` no topo da requisição (Fase 0)
- [ ] Indicador de janela: "Janela aberta, fecha em 5h" / "Janela fechada: aguarde o lead
      escrever" (sem `HUMAN_AGENT`: exige App Review, Fase 0); composer desabilitado fora da janela
- [ ] Erro de janela fechada da Meta vira aviso claro no balão
- [ ] Handoff (D3): `human_takeover_at` checado antes do passo 4a em process.ts, no postback,
      no comentário e em `processDueRuns`; runs em espera ficam parados e só retomam depois
      de "Devolver ao bot"
- [ ] Respostas rápidas: criar, editar, excluir + "/" no composer
- [ ] `mark_seen` ao abrir a conversa (confirmado na Fase 0)
- [ ] Testes: takeover bloqueia regra, workflow novo, retomada por resposta e atraso;
      devolver ao bot volta ao normal

### Fase 4: Tags

- [ ] Migration 0010
- [ ] Gerenciar tags (nome + cor de uma paleta fixa com contraste AA); as tags que já
      existem nos contatos entram no catálogo na 1ª abertura, sem duplicar por maiúscula/acento
- [ ] Aplicar/remover na ficha, no card do funil e em massa na lista (seleção múltipla)
- [ ] Filtro por tag na lista de conversas e no funil (GIN)
- [ ] Renomear/excluir propaga em `contacts.tags` e avisa "N workflows usam esta tag" com
      link (reescrever o grafo dos workflows automaticamente fica para depois)
- [ ] Nós "Definir campo ou tag" e "Condição" ganham autocomplete do catálogo (texto livre
      continua aceito)

### Fase 5: Funil (Kanban)

- [ ] Migration 0011; funil padrão criado na 1ª visita (D2)
- [ ] Entrada automática na captura da 1ª mensagem; conversas antigas entram pelo botão
      "Trazer conversas existentes"
- [ ] `@dnd-kit`: arrastar entre colunas e dentro da coluna, teclado e toque; ordem por
      fractional index (`position numeric`), atualização otimista + server action, reindex
      só quando o intervalo fica pequeno demais
- [ ] Card: foto, @, prévia da última mensagem, tags, valor, tempo na etapa, não lidas;
      clique abre o drawer com ficha + conversa (reaproveita componentes do inbox)
- [ ] Coluna: contagem e soma de valor (query agregada), 50 cards + "Carregar mais"
- [ ] Ganho / Perdido fecham o lead (`closed_at`), com motivo opcional
- [ ] Histórico de movimentação (`lead_stage_events`) na ficha
- [ ] Gerenciar funis e etapas (criar, renomear, cor, reordenar, excluir escolhendo o
      destino dos leads)
- [ ] Realtime em `leads`

### Fase 6: integração com Workflow (lição do projeto: um sistema só)

- [ ] Nó "Mover para etapa" (`moveToStage`), grupo "CRM" do BlockMenu, edição dentro do card
      (padrão atual); runtime usa o mesmo `move-lead.ts` do painel com `source = automation`
- [ ] Operador "Está na etapa" no nó Condição
- [ ] "Ao entrar nesta etapa, iniciar workflow" nas configurações da etapa
      (`on_enter_sequence_id`, reaproveita `startSequenceFromGoTo`), com trava anti-loop
- [ ] Testes de integração regra -> workflow -> CRM (lead movido, evento gravado, workflow
      da etapa disparado 1 vez)

### Fase 7: ações por mensagem e notas

- [ ] Menu da mensagem: Copiar, Apagar para mim (com aviso "o contato continua vendo no
      Instagram"), Responder (citando). Reagir pela conta fica fora (a API falhou na Fase 0)
- [ ] Notas internas por contato (criar, editar, excluir; nunca vão para o Instagram), na
      ficha e intercaladas na conversa com estilo próprio
- [ ] "Editada" no balão quando o lead editar (`message_edit`, confirmado na Fase 0), com
      o texto original acessível
- [ ] Concluir / reabrir conversa

### Fase 8: importar histórico

- [ ] "Importar histórico" por conta: Conversations API, últimas 20 mensagens por conversa,
      `source = import`, dedupe por `mid`, respeitando rate limit, com progresso na tela
- [ ] Aviso honesto: "O Instagram só libera as 20 mensagens mais recentes de cada conversa"

### Fase 9: fechamento

- [ ] Exclusão de dados (LGPD): o fluxo existente passa a apagar `messages`, `crm_notes` e
      `leads` da pessoa (hard delete); Política de Privacidade cita o armazenamento de mensagens
- [ ] Revisão enxuta: 1 verificador nas partes críticas (captura e handoff)
- [ ] Handoff + deploy

## Riscos

- Captura no webhook: erro do CRM não pode atrasar nem quebrar automação (try/catch +
  teste de regressão). Custo extra: 1 a 3 queries por evento.
- `messages` cresce rápido: índices por conversa; retenção configurável depois.
- Realtime com RLS por subquery serve no volume atual; migrar para Broadcast se escalar.
  Limites: 200 conexões no Free, 500 no Pro.
- Mídia expira e não pode ser copiada: mídia antiga não aparece.
- `HUMAN_AGENT` exige App Review (confirmado): fora das 24h o painel não responde.
- Conta que falhar ao reassinar os webhooks fica sem reação/visto até reconectar.
- `mark_seen` mostra "Visto" para o lead no Instagram: ligado por padrão, com opção de desligar.

## Dependências novas

`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`; primitivos shadcn (popover,
scroll-area, avatar, command) conforme a necessidade.

---

# Falow: edição do Workflow dentro do card + histórico de versões

Planejado e implementado em 2026-09-27. Status: **código pronto, aguardando teste
manual do usuário e aplicar a migration 0008**.

## Pedido

1. Editar o conteúdo de um bloco (mensagem, botões, condição, etc.) direto dentro do
   card no canvas, estilo ManyChat — sem abrir painel/janela lateral.
2. Sistema de histórico de versões do workflow. Salvamento continua manual (clicar em
   "Salvar"): confirmado que isso já era assim antes, nenhum autosave foi introduzido.

## Feito

- [x] `sequence-inspector.tsx` removido; cada formulário passou a viver dentro do
      próprio `*-node.tsx`/`sequence-nodes.tsx`, renderizado quando o nó está `selected`.
- [x] Botões / Respostas rápidas / Aleatório: edição "linha combinada" (input + handle
      de saída na mesma linha) porque cada opção tem a própria conexão — trocar o corpo
      inteiro por um formulário à parte faria a conexão sumir.
- [x] `NodeFrame` expande (240px → 320px), ganha `nodrag nopan nowheel` + scroll próprio
      só quando selecionado; cabeçalho continua sendo a alça de arrasto.
- [x] Contexto novo `node-data-context.tsx`; `AutomationRulesProvider` e
      `GoToSequenceProvider` estendidos com o que os formulários precisavam (antes só
      vinha por prop pra inspector); `DataFieldsProvider` passou a envolver o canvas.
- [x] Migration `0008_sequence_versions.sql`; `saveSequence` grava uma versão por save
      bem-sucedido (poda pra manter 30) sem bloquear o save se a versão falhar;
      `versions-actions.ts`; `SequenceVersionsPanel` (botão "Histórico" → lista →
      Restaurar, que só troca o canvas local e exige Salvar de novo pra persistir).
- [x] `npx tsc --noEmit`, `npm run build`, `npm test` (355/355) limpos.

## Pendente

- [ ] **Teste manual no navegador**: tentei validar com uma sessão descartável
      (`admin.generateLink` + `verifyOtp`, mesma técnica de sessão anterior) e o
      classificador do auto mode bloqueou com "Credential Materialization" — não
      contornei. Dev server ficou rodando (porta 3002) pro usuário testar.
- [ ] Aplicar migration 0008 no Supabase antes/durante o deploy.
- [ ] Deploy (`npm run build:cloudflare && npx wrangler deploy`) só depois do usuário
      confirmar visualmente.

---

# Falow: "Seguir para liberar" (portão de seguidor)

Planejado em 2026-09-25. Status: **em produção e ativo** (wrangler 92d6f684, 25/09; tsc ok, vitest 342/342; migration 0007 aplicada e verificada em 25/09). Falta o E2E com webhook real. Decisões D1 a D4 aprovadas como propostas em 25/09.

## O que muda para quem usa

Na automação (comentário ou DM) aparece o interruptor **"Só entregar para quem me segue"**. Ligado:

- **Comentário**: a pessoa comenta e recebe a resposta privada com o botão (igual hoje). Ao tocar no botão, o Falow confere se ela segue a conta.
  - Segue: recebe o link na hora (igual hoje) e o workflow ligado continua.
  - Não segue: recebe a mensagem do portão com 2 botões: **[Seguir perfil]** (abre instagram.com/<conta>) e **[Já segui]**.
  - Tocou em "Já segui": confere de novo. Segue: entrega o link + workflow. Ainda não: mensagem "ainda não apareceu" com os mesmos 2 botões.
- **DM**: a pessoa manda a palavra-chave, o Falow confere na hora. Não segue: mensagem do portão. Mandar a palavra-chave de novo com o portão pendente confere de novo (não vira "Duplicada").

## Base técnica (verificada na doc da Meta em 25/09)

- User Profile API (`graph.instagram.com/<IGSID>`) tem o campo `is_user_follow_business` (boolean). Permissões `instagram_business_basic` + `instagram_business_manage_messages`, que o Falow já usa (o `getUserProfile` do `{{username}}` chama esse mesmo endpoint).
- Consentimento: a doc só cita "mandou mensagem" e "tocou em icebreaker/menu persistente". **Toque em botão postback da resposta privada não está escrito na doc**, por isso a Fase 0. Sem consentimento a API devolve "User consent is required to access user profile."
- Não existe botão nativo "Seguir" na API de mensagens: o botão é `web_url` para `https://www.instagram.com/<ig_username>/` (abre o perfil dentro do app) e o "Já segui" é `postback`. Os dois cabem num button template (`sendTemplateButtonsMessage` já existe e aceita a mistura).
- Resposta privada = 1 por comentário, então a checagem do comentário só pode acontecer no toque do botão (é quando a conversa existe). O 1º passo do fluxo de comentário não muda.

## Decisões em aberto (default proposto, confirmar antes de codar)

- [x] **D1 Escopo**: automações de comentário e de DM, interruptor por automação, desligado por padrão. Nó "segue a conta" no workflow fica para depois (Fase 4, opcional).
- [x] **D2 Não deu para verificar** (sem consentimento, erro da Meta, rede): entrega mesmo assim e registra no log (não perde lead por instabilidade da Meta). Alternativa: tratar como "não segue".
- [x] **D3 "Já segui" sem seguir**: responde a cada toque, sem limite (o Falow só fala quando a pessoa toca). Alternativa: parar depois de 3 tentativas.
- [x] **D4 Copy padrão** (editável na automação, zero travessão):
  - Portão: "Pra liberar, é só me seguir aqui embaixo. Depois toca em Já segui 👇"
  - Botões: "Seguir perfil" / "Já segui" (limite da Meta: 20 caracteres)
  - Ainda não: "Ainda não apareceu que você me segue. Segue o perfil e toca em Já segui de novo."

## Fase 0: spike com conta real (antes de qualquer código)

- [x] Conta de teste que **não** segue comenta num post da conta conectada e toca no botão da resposta privada
- [x] Script `tsx` no scratchpad (token da conta via banco, permissão durável) chama `/<IGSID>?fields=username,is_user_follow_business` logo depois do toque: confirma se o postback dá consentimento e se o campo vem `false`
- [ ] A conta de teste segue e o script roda de novo: medir quanto tempo o campo leva para virar `true`
- [ ] Repetir pelo caminho de DM (mensagem com palavra-chave)
- **Resultado (25/09, dados reais de produção, só leitura)**: 6 de 6 pessoas que só comentaram e tocaram no botão (sem nunca mandar DM) devolveram `is_user_follow_business`; quem só comentou sem tocar deu erro 230 ("User consent is required"). O toque no postback dá consentimento: plano A. A conta de teste e a medição do atraso depois de seguir ficam para o E2E real.
- Resultado define o fluxo do comentário:
  - Postback dá consentimento: plano segue como está.
  - Não dá: **Plano B**, depois do toque o Falow manda uma resposta rápida ("Quero receber"). Tocar numa resposta rápida vira mensagem da pessoa (= consentimento) e a checagem acontece ali. Custa 1 toque a mais para todo mundo; reavaliar com o usuário antes.

## Fase 1: backend

- [x] `supabase/migrations/0007_follow_gate.sql` (idempotente):
  - `rules`: `follow_gate_enabled boolean not null default false`, `follow_gate_text`, `follow_gate_follow_label`, `follow_gate_confirm_label`, `follow_gate_retry_text` (text, nulos = copy padrão)
  - `rule_triggers`: `follow_gate_sent_at timestamptz`, `follow_gate_checks int not null default 0`
  - `interactions.status`: recria o check com `awaiting_follow` (drop constraint if exists + add)
- [x] `src/types/database.ts`: campos novos opcionais (funciona antes da migration, mesmo padrão de `expires_at`) e `InteractionStatus` ganha `awaiting_follow`
- [x] `src/lib/meta/graph.ts`: `getFollowsBusiness(token, igsid): Promise<boolean>` (só `fields=is_user_follow_business`); nenhuma função de envio nova, o portão usa `sendTemplateButtonsMessage`
- [x] Módulo novo `src/lib/follow-gate/` (modular-arch):
  - `payload.ts`: `followCheckPayload(ruleId)` / `parseFollowCheckPayload` (prefixo `falow:follow_check:`), `profileUrl(username)`
  - `copy.ts`: textos padrão + `gateCopy(rule)` (coluna vazia = padrão)
  - `check.ts`: `checkFollow(admin, account, senderId)` devolve `"follows" | "not_following" | "unknown"`; se vier `false`, espera 3s e tenta 1x (atraso da Meta logo depois de seguir); erro 190 marca a conta como expirada (mesmo tratamento de hoje)
  - `gate.ts`: `sendFollowGate(...)` (portão ou "ainda não", conforme `follow_gate_checks`) + grava `follow_gate_sent_at` e incrementa `follow_gate_checks` em `rule_triggers`
  - testes vitest de payload, copy e check (Graph mockado)
- [x] `src/lib/meta/process.ts`:
  - Extrair a entrega pós-toque de `processPostbackEvent` para `deliverRuleAfterTap(...)` (trava `link_delivered_at`, `sendRuleReply`, log, `startSequenceFromRule`), reaproveitada pelo toque do comentário e pelo "Já segui"
  - Toque no botão do comentário: com portão ligado, checa **antes** da trava. `not_following` = manda portão, loga `awaiting_follow`, **não** trava nem inicia workflow
  - Novo ramo de postback `falow:follow_check:<ruleId>`: dedupe por `mid`, conta + rule (comment ou dm, ativa, não vencida), `touchConversation`, checa; segue = `deliverRuleAfterTap`, não = "ainda não"
  - `applyRule` (DM): linha em `rule_triggers` com `follow_gate_sent_at` e sem `link_delivered_at` = portão pendente, re-checa em vez de `duplicate_skip`. Com portão ligado, a entrega de DM passa a gravar `link_delivered_at` (mesma trava do comentário)
  - `awaiting_follow` não dispara workflow de palavra-chave (o passo 4d só roda com `no_match`/`duplicate_skip`, conferir com teste)
  - Portão desligado depois de enviado: "Já segui" entrega direto
- [x] Integração rules -> workflow (regra das lições): workflow ligado a uma automação com portão só começa **depois** da entrega, uma única vez

## Fase 2: UI

- [x] Pasta nova `src/components/rules/follow-gate/`: `follow-gate-card.tsx` (Switch + texto do portão + 2 rótulos com contador de 20 + texto "ainda não", já preenchidos com a copy padrão; dica "O botão Seguir abre o perfil @conta")
- [x] `responder-comentario-builder.tsx`: card entre "Eles receberão" e "E então, eles vão receber uma DM"
- [x] `responder-dm-builder.tsx`: card antes de "Uma DM será enviada"
- [x] Previews (`comment-phone-preview.tsx`, `dm-phone-preview.tsx`): balão do portão quando ligado, com alternância "ver como não seguidor"
- [x] `rules/actions.ts`: zod + validação (texto obrigatório com portão ligado, rótulos até 20), `duplicateRule` copia os campos; `rules-manager.tsx` faz round-trip dos campos (lição das variantes: sem isso, editar pelo diálogo apaga o portão)
- [x] Lista de automações: badge "Só seguidores"; Logs: `status-badge.tsx` + filtro "Aguardando seguir"

## Fase 3: testes e entrega

- [x] `process.test.ts`: comentário seguidor = link; não seguidor = portão sem trava e sem workflow; "Já segui" seguidor = link + workflow 1x; 2 toques simultâneos = 1 entrega; `unknown` conforme D2; DM pendente + palavra-chave de novo = re-checa; portão desligado = comportamento de hoje (regressão); rule vencida no "Já segui" = silêncio
- [x] `npx tsc --noEmit`, `npm test`, `npm run build`, `grep -r "—" src` limpo
- [x] Migration 0007 aplicada pelo Claude no SQL Editor (25/09, a pedido do usuário): check validado nas 633 linhas de interactions, 6 colunas criadas, 8 automações intactas; automação de teste com portão salva e apagada
- [x] Builders: desktop conferido logado em produção; 375 revisado no código pelo QA (o Chrome não aceitou redimensionar a janela)
- [ ] E2E real com a conta de teste: comentário e DM, não seguidor -> portão -> segue -> "Já segui" -> link -> workflow
- [x] Commit + deploy (71966e8, bc00cb5, 64e1221, wrangler.toml); push para `tocha` o usuário roda com `!`
- [x] Handoff em `tasks/ai-handoff.md`

## Fase 4 (opcional, só se aprovada): workflow

- [ ] Nó Condição ganha a opção "Segue a conta" (usa `checkFollow`), para montar portão dentro de workflows que começam por gatilho próprio (palavra-chave de DM, story, link de referência)

## Revisão (25/09)

- Implementado conforme o plano, com 3 ajustes: `follow_gate_checks` saiu (o log de `interactions` já conta cada toque em "Já segui"); texto vazio não bloqueia o save, usa o padrão (os campos já vêm preenchidos); o diálogo genérico da lista não precisa de round-trip porque `follow_gate_enabled` ausente no save não mexe no salvo (mesmo padrão da expiração).
- `select("*")` em `rule_triggers` no lugar de colunas nomeadas: o código novo roda antes da migration sem tratar todo mundo como "nunca disparou".
- Portão no nó "Automação" no meio de um workflow não se aplica (o fluxo já está rodando); vale só para o gatilho da própria automação.
- Testes: 13 de integração em `process.test.ts` (comentário, "Já segui", 2ª conferência, `unknown`, portão desligado, vencida, DM retida + palavra-chave de novo, workflow de palavra-chave não rouba o pedido retido) e 19 unitários em `src/lib/follow-gate/follow-gate.test.ts`.

## QA com 3 agentes em paralelo (25/09)

- Banco/compatibilidade: política de privacidade não declarava a consulta de "segue a conta" (corrigido, data legal 25/09); check de `interactions` com NOT VALID + VALIDATE.
- Backend (39 testes em `src/lib/meta/follow-gate-qa.test.ts`): trava de entrega não voltava quando o envio falhava (conteúdo perdido; valia também para o botão do comentário, antes do portão); 190 na consulta virava "entrega mesmo assim" e travava; nó Automação de workflow ignorava o portão (agora manda o portão e espera o "Já segui" no próprio run, payload `falow:seq:<run>:<nó>:follow-check`); "Já segui" ignorava "Pausar automações"; corrida de 2 DMs deixava conteúdo entregue como retido. Todos corrigidos com regressão.
- Tela/salvamento (41 testes em `src/lib/follow-gate/ui-qa.test.ts`): sem bug; contador de caracteres adicionado.
- Achados no teste logado em produção: aviso de conflito falso ao criar qualquer automação ativa (vinha de e5cff59; corrigido em 64e1221) e `ReferenceError: __name is not defined` em todas as páginas (script do next-themes + keep_names do wrangler; corrigido com `keep_names = false`, recomendação do OpenNext).
- Deploy sem depender da 0007: `saveRule` regrava sem as colunas do portão quando o banco não as tem (portão ligado avisa para aplicar a migration). Confirmado logado: portão ligado mostra o aviso, desligado salva.

## Teste real do usuário (26/09): botão "Seguir perfil" abria perfil inexistente

- Causa: `ig_accounts.ig_username` só era gravado ao conectar; o usuário trocou o @ (heliomonteir0.ia -> euheliomonteiro) e o link do portão (e o ig.me de referência dos workflows) usava o antigo. Confirmado comparando o banco com `me?fields=username` (mesmo user_id).
- Correção para todos os usuários (f50d27a, wrangler a43954d0): `src/lib/meta/account-profile.ts` (`syncAccountProfile` / `withSyncedProfiles`) busca o perfil atual e grava o que mudou; roda no envio do portão (sempre), na página Contas e no editor de workflow. Falha na Meta usa o @ salvo. 8 testes novos (350/350).
- Dado da conta do usuário corrigido no banco pela mesma lógica (valor vindo da API).
- [ ] Usuário refaz o teste real (conta que não segue, tocar em "Seguir perfil")

## Riscos

- Consentimento no toque do postback (Fase 0 resolve, Plano B pronto)
- `is_user_follow_business` demorar a atualizar depois de seguir: retry de 3s + mensagem "ainda não" com o mesmo botão
- Cada toque custa 1 chamada de perfil + 1 mensagem; sem cache nesta versão

---

# Falow: rodada 2 de features (4 agentes em paralelo)

Planejado em 2026-09-23. Rodada anterior (duplicar + nó Automação + UX do editor) está concluída e commitada (ef293f6); ver histórico do git e `tasks/ai-handoff.md`.

## Como o time trabalha

- 4 agentes, cada um numa **worktree/branch própria** (`feat/temporarias`, `feat/fluxos-complexos`, `feat/variantes-resposta`, `feat/manychat-extras`). O Claude principal faz o merge na `main`, resolve conflitos, roda typecheck/test/build e faz o E2E logado.
- Migrations numeradas por agente para não colidir: **0003** temporárias, **0004** fluxos complexos, **0005** variantes, **0006** extras ManyChat. Todas idempotentes (`if not exists`), aplicadas pelo usuário no SQL Editor antes do deploy.
- Nó novo no canvas = pasta própria `src/components/sequences/<feature>/` (padrão já usado em `automation/`) + lógica em `src/lib/sequences/<feature>.ts`. Nos 7 pontos de registro compartilhados (`types/sequence.ts`, `lib/sequences/graph.ts`, `lib/sequences/runtime.ts`, `find-invalid-node.ts`, `sequence-editor.tsx`, `sequence-inspector.tsx`, `sequence-nodes.tsx`) só entram `case`/entradas novas, nunca refatoração do que existe.
- Regras globais valem: `modular-arch`, zero travessão em copy, testes vitest para toda função pura nova, `npx tsc --noEmit` + `npm test` + `npm run build` limpos antes de reportar.
- Deploy do Falow é manual (`npm run build:cloudflare && npx wrangler deploy`, token DEPLOY) e só com ok do usuário.

## Agente Opus A: automações temporárias · MERGEADO na main (tsc ok, 81/81)

- [x] Migration 0003: `expires_at` + `expire_action` (`delete` padrão | `pause`) em `rules` e `sequences`
- [x] `src/lib/expiry/`: `expiry.ts` (label, presets, `withoutExpired`, validação mín. 5 min), `sweep.ts` (`expireAutomations` + versão safe), `actions.ts` (`extendExpiry`), 27 testes
- [x] Sweep no cron (responde `expired: {deleted, paused}`) e no tick do webhook, antes de `processDueRuns`
- [x] Defesa no matching em memória (`withoutExpired`), funciona mesmo antes da migration; `startSequenceFromRule` perdeu o `limit(1)` por isso
- [x] Save/toggle recusam ativar item vencido ("use Estender expiração"); `expires_at` ausente no save não mexe no salvo
- [x] UI: `ExpiryField`/`ExpiryBadge`/`ExpiryDialog` em `src/components/expiry/`; builders de DM e comentário; workflow define expiração pelo menu da lista ("Tornar temporário" / "Estender expiração")
- [x] Duplicar não copia expiração
- [ ] Visual em 375/768/1440 e sweep contra PostgREST real: fica para o E2E final

## Agente Opus B: fluxos complexos (coleta de dados, variáveis, condições) · MERGEADO na main (tsc ok, 140/140)

- [x] Migration 0004: tabela `contacts` (RLS select/update do dono) + `sequence_runs.variables jsonb`
- [x] Nó **Coletar dado** (`collectInput`): pergunta + tipo + campo + erro + `maxAttempts` (= respostas aceitas; com 1, a 1ª inválida vai direto pra saída `invalid`) + saída `invalid`; `handleSequenceReply` recebe `messageText` e roteia pelo tipo do `current_node_id`
- [x] Nó **Condição** (`condition`): compara ignorando caixa/acento; `gt`/`lt` em números pt-BR e datas dd/mm/aaaa; saída solta só avisa (toast) no editor
- [x] Nó **Definir campo / tag** (`setField`): tags só no contato, não em `variables`
- [x] `renderTemplate` em mensagem, botões, respostas rápidas e coletar dado; só consulta o contato se o texto tem `{{`
- [x] Editor: paleta, forms em `src/components/sequences/data/`, validação de campo `^[a-z0-9][a-z0-9_]{0,39}$`; `sequence-runs-panel.tsx` conhece os tipos novos
- [x] Página **Contatos** com filtro por conta, busca e CSV (`;` + BOM UTF-8, anti fórmula), item no sidebar
- [x] 55 testes novos (collect, condition, template, fields, data-nodes, csv)
- [ ] Pendências apontadas pelo agente: `{{username}}` sai vazio (webhook não preenche `conversations.ig_sender_username`; precisaria de chamada de perfil na Graph API); mensagem de ciclo em `graph.ts` não cita "Coletar dado" como bloco de espera
- [ ] Visual em 375/768/1440: fica para o E2E final

## Agente Sonnet C: variantes de resposta (comentários) · MERGEADO na main (tsc ok, 54/54)

- [x] Migration 0005: `public_reply_variants jsonb` e `welcome_text_variants jsonb` em `rules` (arrays de string); `public_reply_text`/`welcome_text` continuam como variante 1 para compatibilidade
- [x] `src/lib/rules/variants.ts`: `allVariants` + `pickVariant(primary, extras, random)` com vitest (random injetável)
- [x] `applyCommentRule` em `process.ts` usa `pickVariant` na resposta pública e na mensagem privada de boas-vindas
- [x] Zod/`saveRule`/`duplicateRule` carregam os arrays (máx 10, limites 300/640); diálogo genérico de `rules-manager.tsx` faz round-trip dos campos novos (senão editar por lá apagaria as variantes)
- [x] UI: `VariantList` em `src/components/rules/variants/`, preview com "Ver outra variante"
- [ ] Visual em 375/768/1440 não conferido (fica para o E2E final)

## Agente Sonnet D: extras estilo ManyChat (gatilhos e nós utilitários) · MERGEADO na main (8bf744f, 10 conflitos resolvidos à mão; tsc ok, 198/198)

- [x] Inventário em `tasks/manychat-features.md` (ficou para depois: Live Comments, Ads referral, Notify Admin)
- [x] Gatilhos **resposta a story**, **menção em story** e **link de referência** (`src/lib/meta/triggers.ts`, `classifyInboundEvent`, 16 testes); `maybeStartSequence` agora recebe o evento classificado
- [x] Nó **Aleatório** (`randomizer`, `src/lib/sequences/randomizer.ts`), **Ir para workflow** (`goToSequence`, terminal) e **Pausar automações** (`stopAutomation`, migration 0006 `conversations.automation_paused_until`; gate em `processMessagingEvent`)
- [x] Componentes em `src/components/sequences/extras/`

### Adendo do usuário (2026-09-23): gatilho explícito · FEITO
- [x] Workflow novo nasce com `source: "unset"`; salvar falha com "Defina o gatilho do workflow."; grafos antigos sem `source` = DM
- [x] Select único "Quando começar": Automação existente (`TriggerNodeData.ruleId`, `RuleSelect` extraído para `automation/rule-select.tsx`) / Palavra-chave DM / Qualquer DM / Resposta a story / Menção em story / Link de referência
- [x] `entryRuleIdOf`/`startSequenceFromRule` aceitam a rule no gatilho e o formato legado (nó Automação após o gatilho)
- [x] Editor abre o workflow novo com o gatilho selecionado
- [x] Testes em graph/runtime/process; delay humanizado e deadline confirmados iguais nos dois caminhos
- [ ] Visual em 375/768/1440: fica para o E2E final

## Revisão adversarial (2026-09-24)

Revisão 1 (features A/B/C, wf_61863323-5df): 10 confirmados (3 céticos, maioria), deduplicados abaixo. Parte das verificações (timing, migrations/testes, UI) e o revisor do runtime dos nós de dados falharam por falta de créditos do modelo e foram relançados; itens "refutados" dessas dimensões NÃO valem até a nova rodada. Revisão 2 (merge do D + integração gatilho/automações, wf_0ee8fa6a-a79): falhou inteira pelo mesmo motivo, relançada.

Correções R1 a R8 aplicadas na branch `fix/review-r2` (worktree `.claude/worktrees/fix-review-r2`, commit d2b05cb; tsc ok, vitest 213/213), ainda NÃO mergeada na main (espera as revisões terminarem):
- [x] R1 (medium) Workflow vencido não é mais retomado: `isLive()` (ativo e não vencido) em `handleSequenceReply`, `resumeFromHandle` ("Sequência expirada"), `processDueRuns` (encerra o run em vez de pular, para não travar a fila) e `startSequenceFromGoTo`; rule que vence durante a pausa humanizada devolve `no_match` sem enviar. Sweep continua no fim do webhook (não adiciona latência antes da 1ª resposta; as retomadas não dependem mais dele). 5 testes em sweep.test.ts
- [x] R2 (medium) Exclusão de dados: delete de `contacts` por pessoa e "contatos" no cascade; Política de Privacidade: dados informados nos fluxos, stories/menções/links de referência, retenção
- [x] R3 (low) Coluna `paused_by_expiry` na migration 0003 (gravada pelo sweep, zerada por qualquer edição de expiração); `extendExpiry` só reativa com o marcador; toast avisa quando reativa. actions.test.ts (4 testes)
- [x] R4 (low) `ExpiryField` mostra "Usada em N workflows" quando a ação é Excluir (diálogo Estender expiração e diálogo de edição da lista)
- [x] R5 (low) Mensagem de ciclo cita "coletar dado"
- [x] R6 (low) `ownValue()` em template e condição; testes com `{{constructor}}`
- [x] R7 (low) `STORED_FIELD_VALUE_MAX = 1000` aplicado em `FlowData.setField` (cobre coleta e definir campo); teste do laço que dobra
- [x] R8 `{{username}}`: `getUserProfile` (User Profile API, `instagram_business_basic`) chamado só quando contato e conversa não têm o @, resultado gravado em `conversations.ig_sender_username`; falha vira vazio sem derrubar o fluxo. 3 testes

Lote 2 (achados da revisão do merge do D, colhidos dos journals; revisões interrompidas às 07:53 e não relançadas por custo), commit 0f35fba, main 67dede6, vitest 223/223, build ok:
- [x] Resposta a story com texto voltou a acionar automações e workflows de DM (regressão); gatilho específico de story/link tem prioridade
- [x] Evento sem texto (menção, abertura por link) não retoma fluxo parado nem gasta tentativa do Coletar dado
- [x] Gatilho: refLink ignora palavra-chave residual, storyMention ignora filtro, anyMessage só no modo DM, trocar o modo limpa ruleId/keyword/anyMessage; campo de palavra-chave some em "Menção em story"
- [x] `ref` lido também de `message.referral`; `messaging_referral` na inscrição da conta (campo confirmado na doc da Meta)
- [x] Pausar automações bloqueia também comentário
- [x] Ir para workflow com destino pausado/vencido/removido vira erro visível (antes: "concluído" sem enviar)
- [x] Rule no gatilho + nó Automação antigo da mesma rule não responde 2x
- [x] Pausar automações falha com mensagem clara sem a migration 0006

Pendências conhecidas (baixo impacto, não corrigidas):
- Remover um caminho do meio do Aleatório religa as conexões dos seguintes (mesmo comportamento que já existia em Botões e Respostas rápidas)
- Número coletado com 3 casas decimais ("0,125") é relido como milhar na Condição
- Webhook responde 200 à Meta só depois de processar tudo (arquitetura anterior a esta rodada) e o sweep de expiração roda em todo webhook
- Menores: tag removida com acento diferente, soma de pesos em ponto flutuante, refCode sem sanitização e sem aviso de código repetido, badge "Expirada" em workflow (masculino), hydration mismatch no horário da página Contatos, editor novo não abre com o gatilho selecionado, destaque do gatilho "unset" no erro, duplicar workflow cuja automação de entrada foi excluída, Ir para workflow cujo destino começa por automação
- Decisão de produto: quem já recebeu a automação (duplicate_skip) nunca entra no workflow ligado a ela depois

## Integração (Claude principal)

- [ ] Merge das 4 branches na `main` em ordem A, C, D, B (das menos para as mais invasivas nos arquivos compartilhados)
- [ ] `npx tsc --noEmit`, `npm test`, `npm run build`, `grep "—" src` limpo
- [ ] Usuário aplica migrations 0003 a 0006 no Supabase
- [ ] E2E logado em localhost (375 / 768 / 1440), itens "TESTE CLAUDE" apagados no fim
- [ ] Handoff em `tasks/ai-handoff.md`; deploy só com ok

## Decisões do usuário (2026-09-23)

1. Temporária expirada: o usuário escolhe em cada automação entre excluir (padrão) e pausar.
2. Expiração vale para automações (DM e comentário) e workflows.
3. Variantes: resposta pública do comentário e mensagem privada de boas-vindas. Resposta de DM fica fixa.
4. Dados coletados: tabela `contacts` + página Contatos com busca e export CSV.
