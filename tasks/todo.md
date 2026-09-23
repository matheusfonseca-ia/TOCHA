# Falow: Duplicar automação + Automação dentro do Workflow

Planejado em 2026-09-23 com 3 agentes (Opus: arquitetura rules↔sequences; Sonnet: duplicação; Sonnet: auditoria UX do editor).
Status: **Fases 0 a 3 commitadas (e5cff59), migration 0002 aplicada.** Falta: push/deploy, teste visual logado e teste com webhook real.

## Diagnóstico (por que está "bostinha")

- Não existe duplicar em lugar nenhum (nem rule, nem sequence).
- Workflow (sequences) só aceita gatilho de **DM**. Automação de comentário vive isolada em `rules`, sem como virar fluxo.
- Sequência só inicia se **nenhuma** regra casou, inclusive quando a regra cai em `duplicate_skip` (`src/lib/meta/process.ts:197`).
- Editor: bloco novo sempre entra "à direita, na altura do gatilho", sem conectar ao selecionado; sem undo; Delete apaga sem confirmar; sai sem salvar sem aviso; erro de validação só num toast genérico; execuções/erros (`sequence_runs.last_error`) não aparecem em tela nenhuma.
- Bugs de base achados:
  - **B1** postback não atualiza `conversations.last_inbound_at` (só a DM faz, `process.ts:156`) → fluxo iniciado por comentário morreria como `window_expired`.
  - **B2** payload `falow:seq:<runId>:<handle>` não carrega o nó; toque em botão antigo encerra o run em silêncio.
  - **B3** `welcome_text` aceita 1000, mas o template de botão corta em 640 sem aviso.
  - **B4** `last_inbound_at` grava `now()` e não o timestamp do evento.
  - **B5** travessão na copy de UI (`sequence-inspector.tsx:76,138,173,469`, `sequences-manager.tsx:100`, `graph.ts` resumo do gatilho).
  - **B6** run de sequência DM é inserido antes do envio; se o envio falha, a pessoa nunca mais entra.

## Decisão de arquitetura (definida pelo usuário em 2026-09-23)

**Nó "Automação" no workflow: seleciona uma automação (rule) já existente, por referência (não cópia).**
O Opus tinha recomendado um gatilho de comentário nativo; o usuário quer reaproveitar automações existentes num nó. Adaptação à restrição da Meta (1 resposta privada por comentário, só no momento do comentário):

- **Rule de DM:** o nó pode ficar em qualquer ponto do fluxo. O runtime envia a resposta atual da rule (texto/imagem/botões). Editar a rule muda o fluxo.
- **Rule de comentário:** só pode ser o nó de entrada (ligado direto ao Trigger, que passa a mostrar "Quando a automação X disparar"). A rule dispara como hoje (private reply + botão); quando o link é entregue no postback, o workflow inicia a partir da saída do nó.
- Rule excluída ou pausada: nó mostra estado "removida/pausada"; excluir rule usada avisa "usada em N workflows".

## Fases

### Fase 0: Correções de base (pré-requisito) · Sonnet A
- [x] B1: upsert de `conversations` nos dois handlers de postback (`process.ts`)
- [x] B4: usar timestamp do evento no upsert
- [x] B2: payload v2 `falow:seq:<runId>:<nodeId>:<handle>`; parser aceita v1 e v2; `claimRunForSender` filtra `current_node_id`
- [x] B3: constante `WELCOME_TEXT_MAX = 640` no zod de rules + validação de sequence
- [x] B6: apagar run se o 1º envio falhar
- [x] B5: remover travessões da copy de UI

### Fase 1: Duplicar · Sonnet A
- [x] `cloneGraphWithFreshIds(graph)` em `src/lib/sequences/graph.ts` (remapeia `node.id`, `edge.source/target`; `sourceHandle` não muda)
- [x] `duplicateRule(id)` em `rules/actions.ts`: copia tudo, `is_active=false`, nome "Cópia de X" (máx 80), `ActionResult` ganha `id?` e `warning?`
- [x] `duplicateSequence(id)` em `rules/sequencias/actions.ts`: não copia `sequence_runs`, nasce pausada
- [x] Item "Duplicar" (ícone `Copy`) no dropdown de `rules-manager.tsx` e `sequences-manager.tsx` (stopPropagation na linha clicável); sequence redireciona para o editor da cópia
- [x] Aviso de conflito não bloqueante ao ativar (mesma keyword/mídia ativa na conta) em `saveRule`/`toggleRule`/`toggleSequence`
- [x] Sem migration (não há UNIQUE que quebre; RLS já cobre)

### Fase 2: Nó "Automação" dentro do Workflow · Opus
- [x] Tipo de nó `automation` com `data: { ruleId }` (`src/types/sequence.ts`); `TriggerNodeData.source?: "dm" | "automation"` (default `"dm"` para grafos legados)
- [x] Validação em `graph.ts`: rule de comentário só como 1º nó após o Trigger (e aí Trigger vira `source: "automation"`); no máximo 1 nó de entrada por automação; ruleId precisa existir e ser da mesma conta
- [x] Migration `0002_sequence_automation_node.sql` (idempotente): coluna `sequences.entry_rule_id` (FK `rules`, `on delete set null`, índice parcial where is_active) para o webhook achar rápido "qual workflow continua após a rule X"; `sequence_runs.entry_rule_id`
- [x] Runtime nó `automation` (rule DM no meio): reutilizar `sendRuleReply` com a rule atual; rule sumiu → run `error` com `last_error` claro
- [x] Handoff rule → workflow em `process.ts`: após `applyRule` (DM) enviar, ou após o link do `falow:comment_link` ser entregue no postback, iniciar o workflow ativo com `entry_rule_id = rule.id` a partir da saída do nó
- [x] Anti-duplicidade: unique `(sequence_id, ig_sender_id)` continua; rule em `duplicate_skip` não bloqueia workflow de DM (decisão do usuário)
- [x] UI: bloco "Automação" na paleta, Select agrupado DM/Comentário (sem busca por texto ainda); card mostra nome, tipo (DM/comentário) e badge Ativa/Pausada; inspector com Select + preview reaproveitado (`DmPhonePreview`/`CommentPhonePreview`)
- [x] `deleteRule`: avisar se usada em workflows; nó mostra "Automação removida"
- [ ] Mover `MediaPicker`/previews para módulo compartilhado (v1 importa de rules, não moveu)

### Fase 3: Editor de workflow, UX P0 · Sonnet B
- [x] Guarda de alterações não salvas (beforeunload + "Voltar")
- [x] Inserção de bloco conectada à saída selecionada, posicionada abaixo/ao lado dela
- [x] Undo/Redo (Ctrl+Z / Ctrl+Y) e confirmação ao apagar nó com conexões
- [x] Erro de validação destaca o nó (borda vermelha + zoom até ele)
- [x] Painel de execuções: lista de `sequence_runs` com status, nó atual e `last_error`
- [x] Trocar `window.confirm` por `Dialog` no sequences-manager
- [x] Handles maiores para toque (hoje 12px) + MiniMap (oculto abaixo de `sm`)

### Fase 4: P1 (depois)
- [ ] "Converter automação em workflow" (`ruleToSequenceGraph`)
- [ ] Duplicar nó / copiar e colar no canvas
- [ ] Templates prontos ao criar workflow
- [ ] Contador de pessoas por nó, simulação do fluxo, auto layout
- [ ] Duplicar para outra conta IG (só DM e sequence; comment exige reselecionar mídia)

## Divisão na execução (sem conflito de arquivo)

| Agente | Fases | Arquivos donos |
|---|---|---|
| Opus | 2 (backend + trigger-form) | `process.ts`, `runtime.ts`, `comment-trigger.ts`, `engine.ts`, migration 0002, `types/sequence.ts`, `trigger-form/` |
| Sonnet A | 0 e 1 | `rules/actions.ts`, `sequencias/actions.ts`, `graph.ts`, `rules-manager.tsx`, `sequences-manager.tsx` |
| Sonnet B | 3 | `sequence-editor.tsx`, `sequence-nodes.tsx`, `sequence-inspector.tsx` (exceto TriggerForm), `sequence-runs-panel.tsx` |

Ordem: Fase 0 primeiro (B1/B2 são pré-requisito da Fase 2). Depois 1, 2 e 3 em paralelo. Pontos de contato (`graph.ts`, `process.ts`) serializados por dono.

## Verificação
- [ ] `npm run typecheck`, `npm run build` e build Cloudflare
- [ ] Adicionar vitest para funções puras: `validateSequenceGraph`, `cloneGraphWithFreshIds`, `commentTargetMatches`, `specificityTier`, precedência, `parseSequencePayload` v1/v2
- [ ] Webhooks assinados via curl: comentário → private reply → toque → fluxo ramifica; regra × sequência nos níveis de especificidade; reentrega; toque duplo; botão antigo; >7 dias
- [x] Migration 0002 aplicada no Supabase de produção via SQL Editor (23/09), colunas e índices conferidos
- [ ] Visual 375 / 768 / 1440; zero travessão (`grep "—" src`)

## Decisões do usuário (2026-09-23)
1. Integração = nó "Automação" que seleciona automação existente (não gatilho de comentário nativo).
2. DM: rule em `duplicate_skip` não bloqueia o workflow.
3. Ciclos: permitir e avisar; bloquear só ciclo sem nenhum nó de espera (waitReply/botões/quick replies/delay).
4. Duplicar para outra conta IG: Fase 4.

5. Rule usada como gatilho do workflow continua disparando normalmente (ela É o gatilho): segue o próprio `is_active`, responde como sempre, e o workflow ativo continua a partir dela. Workflow pausado = rule responde sozinha, sem continuação.

## Review (2026-09-23)
- Execução: Opus (runtime + nó Automação), Sonnet A (duplicar + vitest), Sonnet B (editor). Integração final feita pelo Claude principal: paleta, inspector, card do nó, validação com contexto de rules, `entry_rule_id` no save/duplicar, aviso "usada em N workflows" ao excluir automação.
- Verificado: `npx tsc --noEmit` limpo, `npm test` 31/31, `npm run build` ok, zero travessão novo em copy.
- NÃO verificado: tela logada (375/768/1440), webhook real da Meta, migration no banco.
- **Ordem de deploy obrigatória:** aplicar `supabase/migrations/0002_sequence_automation_node.sql` ANTES do deploy (o save grava `entry_rule_id`; sem a coluna, salvar workflow falha).
- Decisões do Opus a confirmar: automação pausada usada NO MEIO do fluxo continua enviando (pausar desliga só o gatilho dela); dois workflows ativos com a mesma automação de entrada: só o mais antigo roda (save avisa).
- Sem script `lint` no package.json.
