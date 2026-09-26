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
