# AI Handoff · falow

## Estado atual
Última tag: "HANDOFF-falow-20260923-170000-claude"
Status: concluído
Resumo: em produção (wrangler, versão 287e70c9, 23/09) com ef293f6; falta usuário apagar 3 itens de teste e teste real comentário -> botão -> workflow.

---

## [HANDOFF · falow · 2026-09-23T17:00:00-03:00 · claude]
Status: concluído
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
Status: concluído
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
Status: concluído
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
