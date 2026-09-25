# AI Handoff · falow

## Estado atual
Última tag: "HANDOFF-falow-20260925-191000-claude"
Status: concluído
Resumo: portão "Seguir para liberar" em produção e ativo (wrangler 92d6f684, main com migration 0007 aplicada e verificada em 25/09). vitest 342/342. Falta só o E2E com webhook real (conta que não segue comenta, toca, segue, "Já segui"). Push para `tocha` o usuário roda com `!`. ATENÇÃO: o TOCHA também publica na Vercel com OUTRO projeto Supabase (commit cbfb979 do dono do repo, mergeado em c4a4449); o build da Vercel roda scripts/check-db-schema.mjs. A 0007 NÃO está no script de propósito (o código funciona sem ela); o banco da Vercel precisa da 0007 para o portão ligar lá.

---

## [HANDOFF · falow · 2026-09-25T19:10:00-03:00 · claude]
Status: concluído
Objetivo: aplicar a migration 0007 em produção.
Feito:
- Aplicada pelo SQL Editor do Supabase (Chrome logado, a pedido do usuário); conteúdo idêntico ao arquivo; "Success"
- Verificado: interactions_status_check com awaiting_follow e validado (633 linhas), 6 colunas follow_gate_*, 8 automações intactas
- E2E da tela: automação com portão ligado salva com selo "Só seguidores", colunas certas no banco, apagada depois
Próximo passo:
- E2E real com webhook (comentário e DM de uma conta que não segue)
- Push: git -C "D:/Projetos-vibeocding/eu/falow-instalacaonamaquina" push tocha main:main
Arquivos tocados: tasks/todo.md, tasks/ai-handoff.md
Decisões/contexto: nenhuma nova.
Tag: "HANDOFF-falow-20260925-191000-claude"

## [HANDOFF · falow · 2026-09-25T14:20:00-03:00 · claude]
Status: concluído
Objetivo: QA em paralelo do portão "Seguir para liberar" e deploy.
Feito:
- 3 agentes de QA (backend, tela/salvamento, banco); achados corrigidos: trava de entrega devolvida em falha de envio, 190 na consulta, nó Automação com portão (espera "Já segui" no próprio run), pausa no "Já segui", corrida de DM, política de privacidade, NOT VALID na migration
- Teste logado em produção: aviso da migration com portão ligado, salvar com portão desligado, prévias; achou e corrigiu conflito falso ao criar automação ativa e "__name is not defined" (keep_names = false)
- Automações "TESTE CLAUDE" criadas no teste já apagadas
Próximo passo:
- Usuário: aplicar 0007 no SQL Editor; conferir com leitura REST (follow_gate_enabled em rules)
- E2E real: conta que não segue comenta, toca, recebe o portão, segue, "Já segui", recebe o link
- Push: git -C "D:/Projetos-vibeocding/eu/falow-instalacaonamaquina" push tocha main:main
Arquivos tocados: src/lib/follow-gate/*, src/lib/meta/process.ts, src/lib/sequences/runtime.ts, src/app/(dashboard)/rules/actions.ts, src/app/(legal)/privacidade/page.tsx, src/components/legal/legal-chrome.tsx, src/components/rules/follow-gate/follow-gate-field.tsx, supabase/migrations/0007_follow_gate.sql, wrangler.toml, testes QA
Decisões/contexto: keep_names = false no wrangler (next-themes serializa função em script inline). Portão no nó Automação usa handle "follow-check" no payload de sequência.
Tag: "HANDOFF-falow-20260925-142000-claude"

## [HANDOFF · falow · 2026-09-25T13:04:13-03:00 · claude]
Status: em andamento
Objetivo: planejar o portão "Seguir para liberar": quem não segue a conta recebe na DM um botão para seguir antes de receber o conteúdo da automação.
Feito:
- Plano completo no topo de tasks/todo.md (Fases 0 a 4, decisões D1 a D4, riscos)
- Verificado na doc da Meta: campo `is_user_follow_business` na User Profile API; consentimento documentado só para DM/icebreaker/menu
Próximo passo:
- Usuário aprova D1 a D4
- Fase 0 (spike com conta real): confirmar se o toque no postback da resposta privada libera a User Profile API; se não, Plano B (resposta rápida) descrito no todo
Arquivos tocados: tasks/todo.md, tasks/ai-handoff.md
Decisões/contexto: checagem do comentário só pode acontecer no toque do botão (resposta privada é 1 por comentário). Entrega pós-toque vai ser extraída para `deliverRuleAfterTap` em process.ts e reaproveitada pelo "Já segui".
Tag: "HANDOFF-falow-20260925-130413-claude"

## [HANDOFF · falow · 2026-09-24T11:30:00-03:00 · claude]
Status: concluído
Objetivo: menu de blocos no canvas do workflow.
Feito:
- src/components/sequences/block-menu/ (menu com busca) + sequence-editor.tsx (onConnectEnd, onPaneContextMenu, addNode aceita posição e seta de origem); commit 20d6f56, merge 7842e96
- Testado logado em produção: botão direito cria bloco solto no ponto do clique; seta solta no vazio abre "Conectar novo bloco" e o bloco nasce conectado; busca + Enter ok
- Incidente: build dentro da worktree (node_modules em junction) esvaziou o node_modules real 2x; junctions removidas, npm ci na pasta principal, lição em tasks/lessons.md
Próximo passo:
- Webhook real (comentário, story, ig.me?ref); remover as worktrees em .claude/worktrees (já sem junction) quando quiser
Arquivos tocados: src/components/sequences/block-menu/*, src/components/sequences/sequence-editor.tsx
Decisões/contexto: build/deploy só na pasta principal. Observado no teste: workflow novo não abre com o gatilho selecionado (pendência já listada).
Tag: "HANDOFF-falow-20260924-113000-claude"

## [HANDOFF · falow · 2026-09-24T08:30:00-03:00 · claude]
Status: concluído
Objetivo: publicar a rodada 2.
Feito:
- Migrations 0003 a 0006 aplicadas pelo SQL Editor (bloco atômico) e verificadas: 20 colunas com tipos/defaults, checks de expire_action, 3 índices, RLS + 2 policies em contacts, grants com service_role, dados existentes intactos (6 rules, 21 conversas, 2 sequences pausadas)
- Deploy: npm run build:cloudflare && npx wrangler deploy (Token DEPLOY), versão ab81b357; smoke: páginas públicas 200, rotas logadas 307 para login, /exclusao-de-dados com contacts, webhook 403 com token errado
Próximo passo:
- E2E logado em 375/768/1440 e webhook real (comentário -> botão -> workflow; resposta a story; link ig.me?ref)
- Usuário: apagar os 2 workflows de teste pausados da rodada anterior
- Pendências de baixo impacto em tasks/todo.md; worktrees .claude/worktrees/* podem ser removidas
Arquivos tocados: nenhum código novo desde 67dede6
Decisões/contexto: messaging_referral já estava assinado no app Meta; a inscrição da conta só inclui o campo novo depois de reconectar a conta (se referral não chegar, reconectar).
Tag: "HANDOFF-falow-20260924-083000-claude"

## [HANDOFF · falow · 2026-09-24T08:15:00-03:00 · claude]
Status: em andamento
Objetivo: fechar a rodada 2 (4 features) e publicar.
Feito:
- 2º lote de correções (gatilhos de story/link, retomadas sem texto, pausa em comentário, Ir para workflow, rule 2x) em 0f35fba, mergeado na main (67dede6)
- Revisões multi-agente encerradas (interrompidas às 07:53, não relançadas a pedido do usuário por custo de tokens); achados colhidos dos journals
Próximo passo:
- Usuário: aplicar supabase/migrations 0003, 0004, 0005, 0006 (nessa ordem) no SQL Editor; no app Meta, Webhooks do Instagram, assinar o campo messaging_referral; reconectar a conta no painel (a inscrição da conta roda no OAuth)
- E2E logado (npm run dev -- -p 3007) e deploy manual com ok: npm run build:cloudflare && npx wrangler deploy (Token DEPLOY)
- Pendências de baixo impacto listadas em tasks/todo.md
Arquivos tocados: git log main 8bf744f..67dede6; tasks/*.md não commitados
Decisões/contexto: usuário quer economia de tokens (memória feedback_token_budget). Worktrees .claude/worktrees/agent-* e fix-review-r2 já mergeadas, podem ser removidas.
Tag: "HANDOFF-falow-20260924-081500-claude"

## [HANDOFF · falow · 2026-09-24T07:45:00-03:00 · claude]
Status: em andamento
Objetivo: fechar a rodada 2 com revisão completa, correções, migrations e E2E.
Feito:
- 10 achados confirmados da 1ª revisão, deduplicados em R1 a R8, corrigidos com testes na branch fix/review-r2 (d2b05cb) e mergeados na main (1b9a07d). Detalhe em tasks/todo.md, seção "Revisão adversarial"
- Migration 0003 ganhou a coluna paused_by_expiry (ainda não aplicada em lugar nenhum, então foi editada no próprio arquivo)
- {{username}} agora busca o @ na User Profile API (graph.instagram.com/<IGSID>?fields=username,name, permissão instagram_business_basic) e grava em conversations
Próximo passo:
- Esperar as duas revisões (notificação automática); itens "refutados" das dimensões que falharam por crédito não valem até a nova rodada
- Corrigir achados novos; então pedir ao usuário para aplicar 0003, 0004, 0005, 0006 (nessa ordem) no SQL Editor
- E2E logado (localhost:3007) em 375/768/1440; deploy manual só com ok
Arquivos tocados: ver git log main (8bf744f..1b9a07d); tasks/*.md não commitados
Decisões/contexto: sweep de expiração continua no fim do webhook (as retomadas checam expiração sozinhas, então não precisa adicionar latência antes da 1ª resposta). Worktrees: .claude/worktrees/agent-* (4 agentes, já mergeados) e .claude/worktrees/fix-review-r2 (mergeado); podem ser removidas no fechamento. git commit -F - não funciona no PowerShell 5.1: usar -F <arquivo>.
Tag: "HANDOFF-falow-20260924-074500-claude"

## [HANDOFF · falow · 2026-09-24T04:52:00-03:00 · claude]
Status: em andamento
Objetivo: fechar a rodada 2 (4 features) com revisão, correções e E2E.
Feito:
- Merge do Sonnet D (8bf744f) com 10 conflitos resolvidos à mão (types/sequence.ts, graph.ts, runtime.ts, process.ts, sequencias/actions.ts, find-invalid-node.ts, sequence-editor/inspector/nodes/runs-panel); data-nodes.test.ts adaptado à nova assinatura de maybeStartSequence (evento classificado)
- tsc limpo, vitest 198/198 (17 arquivos), next build ok
- Inventário ManyChat em tasks/manychat-features.md
Próximo passo:
- Ler resultados das duas revisões (journals em ~/.claude/projects/.../subagents/workflows/<runId>/journal.jsonl), corrigir os achados confirmados com testes
- Pendências conhecidas: {{username}} vazio (webhook não grava ig_sender_username); mensagem de ciclo não cita "Coletar dado"; 32 linhas novas com travessão são todas comentários/describes de teste (nenhuma em copy de UI), conferir de novo após correções
- Usuário aplica migrations 0003, 0004, 0005, 0006 (nessa ordem) no SQL Editor; E2E logado 375/768/1440; deploy manual só com ok
Arquivos tocados: merges 8245be2 e 8bf744f na main; tasks/todo.md, tasks/lessons.md, tasks/ai-handoff.md (não commitados)
Decisões/contexto: resolução do merge: handleSequenceReply recebe (payload, classified.text); rules só casam em kind "dm" e com withoutExpired; startSequenceFromRule = withoutExpired(candidatos)[0] + rule no gatilho ou formato legado. Worktrees dos 4 agentes ainda existem em .claude/worktrees (branches worktree-agent-*), podem ser removidas depois do fechamento.
Tag: "HANDOFF-falow-20260924-045200-claude"

## [HANDOFF · falow · 2026-09-23T23:55:00-03:00 · claude]
Status: em andamento
Objetivo: integrar as 4 features da rodada 2 e revisar antes de migrations/E2E/deploy.
Feito:
- Merges na main: variantes (Sonnet C), temporárias (Opus A), fluxos complexos (Opus B); sem conflitos; tsc, vitest 140/140 e next build ok
- Sonnet D caiu por limite de uso da API antes de commitar; worktree preservada com 17 arquivos modificados + 10 novos (src/lib/meta/triggers.ts, src/lib/sequences/{randomizer,automation-pause}.ts, src/components/sequences/extras/, automation/rule-select.tsx, migration 0006, tasks/manychat-features.md); agente retomado para verificar, commitar e reportar
- Revisão adversarial multi-agente (8 dimensões x 3 céticos) rodando sobre o diff 793eafc..HEAD
Próximo passo:
- Merge da branch worktree-agent-a7efc998494774b88 na main (conflitos esperados nos 7 arquivos de registro de nó e em process.ts/runtime.ts)
- Aplicar os achados confirmados da revisão; segunda revisão focada em gatilho <-> automações existentes
- Usuário aplica migrations 0003 a 0006; E2E logado; deploy só com ok
Arquivos tocados: ver git log main (merges 8245be2 e anteriores), tasks/todo.md
Decisões/contexto: pendências conhecidas do Opus B: {{username}} sai vazio (webhook não grava ig_sender_username), mensagem de ciclo não cita "Coletar dado". Se a worktree do D for perdida, o trabalho dele precisa ser refeito a partir da seção "Agente Sonnet D" + adendo em tasks/todo.md.
Tag: "HANDOFF-falow-20260923-235500-claude"

## [HANDOFF · falow · 2026-09-23T21:15:00-03:00 · claude]
Status: em andamento
Objetivo: rodada 2 de features (4 agentes em paralelo), plano em tasks/todo.md.
Feito:
- Plano escrito e 4 decisões de formato confirmadas com o usuário (ver "Decisões do usuário" em todo.md)
- Disparados: Opus A (temporárias, migration 0003), Opus B (coleta de dados/condição/variáveis/Contatos, 0004), Sonnet C (variantes comentário, 0005), Sonnet D (gatilhos story/menção/ref + randomizer/goToSequence/stopAutomation, 0006), cada um em worktree/branch própria
Próximo passo:
- Receber relatórios, merge das branches na main na ordem A, C, D, B, resolver conflitos nos 7 arquivos de registro de nó
- tsc + vitest + build; usuário aplica migrations 0003 a 0006 no Supabase; E2E logado; deploy só com ok
Arquivos tocados: tasks/todo.md, tasks/ai-handoff.md (as branches dos agentes ainda não estão na main)
Decisões/contexto: expiração com escolha excluir/pausar por item e vale para rules e sequences; variantes só em comentário (pública + boas-vindas); dados coletados em tabela contacts com página Contatos + CSV. Deploy do Falow continua manual via wrangler.
Tag: "HANDOFF-falow-20260923-211500-claude"

## [HANDOFF · falow · 2026-09-23T17:00:00-03:00 · claude]
Status: em andamento
Objetivo: validar e corrigir as features de duplicar + nó Automação.
Feito:
- Revisão adversarial (Opus): 0 crítico, 8 médios corrigidos (handoff sem rollback, ciclo com atraso < 1h bloqueado, deadline da invocação, aviso de conflito no editor e por termo, undo/redo)
- Testes de integração de process.ts/runtime.ts com fakes (44/44), build ok, push em main
Próximo passo:
- Usuário logar no Falow em localhost:3007 (npm run dev -- -p 3007) para teste E2E no navegador (itens "TESTE CLAUDE" pausados, apagar no fim)
- Deploy manual: npm run build:cloudflare && npx wrangler deploy (Token DEPLOY), só com ok do usuário
Arquivos tocados: ver commit 8b83fb7
Decisões/contexto: deploy do Falow não é automático por push (último via wrangler em 16/09). Achados baixos não corrigidos: "—" como placeholder em logs/page.tsx e travessões nas páginas legais (fora do escopo).
Tag: "HANDOFF-falow-20260923-170000-claude"

## [HANDOFF · falow · 2026-09-23T15:30:00-03:00 · claude]
Status: em andamento
Objetivo: duplicar automação/workflow + nó "Automação" no workflow + melhorias do editor.
Feito:
- Fases 0, 1, 2, 3 de tasks/todo.md implementadas (3 agentes + integração)
- tsc limpo, vitest 31/31, next build ok
Próximo passo:
- Aplicar supabase/migrations/0002_sequence_automation_node.sql no Supabase ANTES do deploy
- Teste visual logado em 375/768/1440 e teste com webhook real (comentário -> botão -> workflow continua)
- Commit/deploy só com aprovação do usuário
Arquivos tocados: ver `git status` (src/lib/meta/process.ts, src/lib/sequences/*, src/components/sequences/**, src/components/rules/rules-manager.tsx, src/app/(dashboard)/rules/**, src/types/*, supabase/migrations/0002_*, package.json, vitest.config.ts)
Decisões/contexto: automação usada como gatilho continua disparando pelo próprio is_active; workflow continua depois dela. Payload de botão agora v2 (falow:seq:run:node:handle), v1 ainda aceito.
Tag: "HANDOFF-falow-20260923-153000-claude"

## [HANDOFF · falow · 2026-09-23T14:52:04-03:00 · claude]
Status: em andamento
Objetivo: planejar duplicação de automações/workflows e uso de automação (comentário) dentro do workflow de sequências.
Feito:
- Pesquisa com 3 agentes (Opus arquitetura, Sonnet duplicação, Sonnet UX editor)
- Plano em 5 fases em tasks/todo.md, com bugs de base B1 a B6 confirmados
Próximo passo:
- Usuário responder as 4 decisões pendentes no fim de tasks/todo.md
- Executar Fase 0, depois Fases 1, 2 e 3 em paralelo (divisão por agente no todo.md)
Arquivos tocados: tasks/todo.md, tasks/ai-handoff.md
Decisões/contexto: modelo escolhido = gatilho de comentário nativo no nó Trigger (não "nó Executar automação", inviável pela regra da Meta de 1 private reply por comentário). B1 (postback não atualiza conversations) é bloqueante para a Fase 2.
Tag: "HANDOFF-falow-20260923-145204-claude"
