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
