# AI Handoff · falow

## Estado atual
Última tag: "HANDOFF-falow-20260928-151041-claude"
Status: em andamento
Resumo: CRM (Inbox + Funil) aprovado (D1 a D4) e Fase 0 (spike com conta real) CONCLUÍDA: formatos reais de eco, reação, edição, apagado, visto, citação e mídia registrados em `tasks/todo.md`; citar pela API funciona (reply_to no topo), HUMAN_AGENT exige App Review, reagir pela conta falha. Próximo: Fase 1 (captura). Rascunho `supabase/migrations/0009_crm_inbox.sql` existe no disco, NÃO commitado nem aplicado. Pendências anteriores: aplicar migration 0008 e confirmar visualmente o Workflow.

---

## [HANDOFF · falow · 2026-09-28T15:10:41-03:00 · claude]
Status: em andamento
Objetivo: Fase 0 do CRM: medir com conta real o que o webhook e a API do Instagram entregam antes de escrever a captura.
Feito:
- Log temporário do payload bruto no webhook (commit a99af2c, deploy e9cd0546), ligado só pelo secret `WEBHOOK_DEBUG_IG_IDS`; secret já APAGADO no fim (log parou). O `console.log` continua no `route.ts` até o commit da Fase 1.
- @euheliomonteiro reassinada com `messages,messaging_postbacks,messaging_referral,comments,message_reactions,messaging_seen,message_edit` (estava sem `messaging_referral`: gatilho "Link de referência" provavelmente não funcionava para essa conta).
- Testes pela API e pelo celular com o lead de teste @ion_comunnity (IGSID 4181139912021434). Resultados completos em `tasks/todo.md` > Fase 0 > Resultados.
- Plano atualizado: matriz, Fase 1 (observador de envio por AsyncLocalStorage, fila `message_signals_pending`), Fase 3 (responder citando, sem HUMAN_AGENT), Fase 7 ("Editada" confirmada, sem reação pela conta).
- Rascunho da migration 0009 no disco (messages, colunas em conversations, trigger, RLS, realtime, message_signals_pending).
Próximo passo:
- Fase 1: captura (parse-event puro + testes, capture-event no process.ts em best effort, observador de envio em graph.ts, fila de sinais, reassinatura das contas, remover o console.log temporário), aplicar 0009, deploy.
Arquivos tocados: src/app/api/webhooks/meta/route.ts (log temporário), tasks/todo.md, tasks/ai-handoff.md, tasks/lessons.md, supabase/migrations/0009_crm_inbox.sql (rascunho, não commitado)
Decisões/contexto: `wrangler tail` foi encerrado 2x pelo Claude Code por falta de RAM (0,9 a 1,6 GB livres); a captura que funcionou foi um script node leve no WebSocket de tail da Cloudflare (filtro no POST de criação, `{debug:false}` no open, ping a cada 10s), em `scratchpad/crm-spike/tail-lite.mjs`. No Windows o TaskStop não dispara o SIGTERM do script: apagar a sessão de tail pela API depois. Scripts do spike usam `createRequire` do projeto (vite-node não resolve imports absolutos). Payloads capturados já apagados (tinham DM real de lead).
Tag: "HANDOFF-falow-20260928-151041-claude"

---

## [HANDOFF · falow · 2026-09-28T12:00:21-03:00 · claude]
Status: em andamento
Objetivo: planejar um CRM dentro do Falow estilo Kommo: inbox estilo WhatsApp + kanban de leads, com tags, excluir, editar etc., seguindo modular-arch (`src/modules/crm/`).
Feito:
- Plano completo no topo de `tasks/todo.md`: matriz de viabilidade, decisões D1 a D4, árvore do módulo `src/modules/crm/` (capture, inbox, handoff, tags, pipeline, quick-replies, history-import), migrations 0009 (messages + colunas em conversations), 0010 (crm_tags), 0011 (pipelines/stages/leads/lead_stage_events) e Fases 0 a 9.
- Validação por 8 agentes Sonnet (só pesquisa, sem editar arquivos), um por feature: inbox/histórico, envio manual, excluir, editar, reações/citação/visto, tags, kanban, realtime.
Próximo passo:
- Usuário aprova ou ajusta D1 (item CRM na sidebar), D2 (entrada automática no funil), D3 (responder pelo painel assume a conversa), D4 (mídia só por link da Meta).
- Fase 0 (spike com conta real via `wrangler tail`) antes de codar a captura: eco app x API, mid do eco == message_id do envio, message_edit/reações/visto chegam no Instagram Login, reação além de ❤️, mark_seen, HUMAN_AGENT.
Arquivos tocados: tasks/todo.md, tasks/ai-handoff.md
Decisões/contexto: achados da API que definem o escopo: NÃO existe editar nem desfazer envio de mensagem enviada, nem responder citando (só "Apagar para mim" local, e editar vira rascunho/respostas rápidas/notas); lead apagar chega como `is_deleted: true` no campo `messages`; Conversations API só devolve as 20 últimas mensagens por conversa; copiar mídia da CDN da Meta para Storage próprio já reprovou app no App Review (caso Chatwoot #8583), por isso D4. `handleSequenceReply` roda antes do check de `automation_paused_until` em process.ts: o takeover humano precisa de checagem própria antes do passo 4a e em processDueRuns. Não existe client Supabase de navegador ainda (só server.ts/admin.ts). Kanban: @dnd-kit (hello-pangea em manutenção). Realtime: postgres_changes no MVP, Broadcast se escalar.
Tag: "HANDOFF-falow-20260928-120021-claude"

---

## [HANDOFF · falow · 2026-09-27T15:24:16-03:00 · claude]
Status: em andamento
Objetivo: editar bloco do Workflow direto no card do canvas (estilo ManyChat, sem janela lateral) + histórico de versões com salvamento sempre manual.
Feito:
- Removida a `<aside>`/`SequenceInspector`: todo formulário de edição (Gatilho, Mensagem, Botões, Respostas rápidas, Atraso, Automação, Coletar dado, Condição, Definir campo, Aleatório, Ir para workflow, Pausar automações) agora renderiza dentro do próprio card quando `selected` (React Flow já dava esse booleano de graça). Botões/Respostas rápidas/Aleatório precisaram de tratamento especial: cada opção tem handle de saída na própria linha, então virou edição "linha combinada" (input + handle no mesmo lugar) em vez de trocar o corpo inteiro por um formulário à parte — senão a conexão sumiria ao entrar em modo edição.
- `NodeFrame` (sequence-nodes.tsx): largura 240px→320px ao selecionar, corpo ganha `nodrag nopan nowheel max-h-[70vh] overflow-y-auto` só quando selecionado (nenhum nó tinha input antes, então nada tinha essas classes — precisou adicionar do zero pra não perder clique/scroll pro canvas). Cabeçalho continua sendo a alça de arrasto.
- Contexto novo `node-data-context.tsx` (`NodeDataProvider`/`useNodeDataChange`) pra qualquer nó chamar `handleDataChange` sem prop-drilling. `AutomationRulesProvider` e `GoToSequenceProvider` ganharam campos novos (`rules`/`account`/`entryNodeId`/`triggerSource`/`onTriggerSourceChange` no primeiro; `options` cru no segundo) porque os formulários (antes só na inspector) agora rodam dentro do nó e precisam do que antes só vinha por prop do editor. `DataFieldsProvider` passou a envolver o canvas também (antes só a aside).
- Nenhum autosave introduzido: edição inline só muda estado local (`setNodes`), o POST (`saveSequence`) continua só no clique em "Salvar" — confirmado que isso já era assim antes (não existe autosave em lugar nenhum do projeto).
- Histórico de versões: migration `0008_sequence_versions.sql` (tabela nova, RLS igual `sequences`), `saveSequence` grava uma versão a cada save bem-sucedido (não bloqueia o save se falhar) e poda pra manter as 30 mais recentes por sequência, `versions-actions.ts` (`getSequenceVersions`), `[id]/page.tsx` busca e passa `versions`, `SequenceVersionsPanel` novo (mesmo padrão do `SequenceRunsPanel`: botão "Histórico" na barra superior → Dialog com lista → "Restaurar" confirma com `SequenceConfirmDialog` e só troca o canvas local (empilha no undo), nunca salva sozinho.
- Texto de ajuda que vivia na aside vazia virou um botão "?" (DropdownMenu) na barra superior.
- `npx tsc --noEmit`, `npm run build` e `npm test` (355/355) limpos.
Próximo passo:
- Usuário testar de verdade no navegador (localhost, dev server ficou rodando na porta 3002 ao fim da sessão) — clicar em cada tipo de bloco, conferir que edita dentro do card, que arrastar pelo cabeçalho ainda move o nó, que digitar num campo não arrasta nem rola o canvas, e que Aleatório/Botões/Respostas rápidas mantêm a conexão ao entrar/sair do modo edição.
- Aplicar a migration 0008 no Supabase antes/durante o deploy (senão o painel Histórico fica vazio, mas não quebra nada — a query cai em array vazio).
- Deploy (`npm run build:cloudflare && npx wrangler deploy`) só depois do usuário confirmar visualmente, dado que não deu pra testar ao vivo nesta sessão.
Arquivos tocados: sequence-editor.tsx, sequence-nodes.tsx, node-data-context.tsx (novo), sequence-versions-panel.tsx (novo), sequence-inspector.tsx (removido), automation/automation-node.tsx, automation/automation-node-form.tsx, automation/automation-rules-context.tsx, automation/index.ts, data/collect-input-node.tsx, data/condition-node.tsx, data/set-field-node.tsx, data/index.ts, extras/go-to-sequence-context.tsx, extras/go-to-sequence-node.tsx, extras/index.ts, extras/randomizer-form.tsx (removido, virou edição inline em sequence-nodes.tsx), extras/ref-link-fields.tsx (comentário), types/sequence.ts (`SequenceVersion`), supabase/migrations/0008_sequence_versions.sql (novo), rules/sequencias/actions.ts, rules/sequencias/versions-actions.ts (novo), rules/sequencias/[id]/page.tsx.
Decisões/contexto: tentei validar ao vivo criando uma sessão descartável (mesma técnica de uma sessão anterior: `admin.generateLink` + `verifyOtp` via `@supabase/ssr` real pra pegar os cookies certos) — o classificador do auto mode bloqueou com "Credential Materialization" desta vez (não tentei contornar, script temporário já apagado). Fica registrado caso o usuário queira liberar essa permissão explicitamente no futuro; até lá, testes desse tipo de mudança de UI dependem do usuário testar manualmente.
Tag: "HANDOFF-falow-20260927-152416-claude"

---

## [HANDOFF · falow · 2026-09-27T14:39:14-03:00 · claude]
Status: em andamento
Objetivo: transformar "Automação" numa categoria (Automações + Workflow) com editor em tela cheia estilo ManyChat, e aplicar a skill design-taste-frontend (agora principal, substituindo ui-ux-pro-max) dentro do app.
Feito:
- Sub-nav de /rules: "Automações" (regras) e "Workflow" (canvas, ex-Sequências); editor do Workflow em layout full-bleed (menu do app visível, canvas ocupa o resto, sem container centralizado), breadcrumb no topo, paleta de blocos agrupada por categoria (commit 7fdfe8b)
- GSAP instalado; count-up no MetricCard do dashboard, indicador deslizante na sidebar, entrada em scale+fade no BlockMenu do editor; linha da tabela de Automações abre o editor ao clicar; travessão removido de toda copy voltada ao usuário (landing, 3 páginas legais, título raiz, placeholders de tabela) sem alterar sentido jurídico (commit 7fdfe8b)
- Deploy do commit 7fdfe8b quebrou /dashboard em produção com "Application error" (digest 2276862654). 1ª tentativa (import estático do gsap → dinâmico, commit ad3e8fe) não era a causa raiz.
- Causa raiz real, achada reproduzindo o erro com uma sessão de verdade (script descartável: admin.generateLink + verifyOtp pra pegar access/refresh token sem tocar senha, cookie sb-*-auth-token montado com @supabase/ssr, fetch local e em produção): MetricCard virou "use client" (pro gsap) mas dashboard/page.tsx continuava passando `icon={MessageSquare}` (referência de função, não atravessa fronteira servidor/cliente). Corrigido passando o ícone já renderizado (commit 9ca6cc2). Verificado local e em produção com a mesma sessão real, e pushado pro tocha (9a6ad01..9ca6cc2).
Próximo passo:
- Usuário confirma visualmente que o dashboard voltou ao normal
- Conferir se o deploy automático na Vercel (dispara com o push pro tocha, outro projeto Supabase) também subiu sem esse erro
Arquivos tocados: src/components/rules/automation-section-nav.tsx, src/app/(dashboard)/rules/layout.tsx, src/app/(dashboard)/rules/sequencias/page.tsx, src/components/sequences/sequence-editor.tsx, src/components/sequences/block-menu/block-menu.tsx, src/components/sequences/sequences-manager.tsx, src/components/rules/rules-manager.tsx, src/components/dashboard/metric-card.tsx, src/components/layout/sidebar.tsx, src/app/(dashboard)/dashboard/page.tsx, src/app/(dashboard)/logs/page.tsx, src/app/layout.tsx, src/app/page.tsx, src/app/(legal)/layout.tsx, src/app/(legal)/{privacidade,termos-de-servico,exclusao-de-dados}/page.tsx, package.json (gsap)
Decisões/contexto: taste-skill (plugin `design-taste-frontend`) virou a skill principal de design no CLAUDE.md global por pedido explícito do usuário, mesmo se declarando fora de escopo pra dashboard; ui-ux-pro-max foi arquivado em ~/.claude/_archived-skills. Lição pro futuro: sempre que um componente ganhar "use client" novo, checar se algum Server Component pai passa função/componente (não JSX) como prop pra ele.
Tag: "HANDOFF-falow-20260927-143914-claude"

## [HANDOFF · falow · 2026-09-26T12:58:06-03:00 · claude]
Status: em andamento
Objetivo: corrigir o botão "Seguir perfil" que abria um perfil inexistente.
Feito:
- Causa: @ gravado só ao conectar; usuário trocou de @. syncAccountProfile no envio do portão, na página Contas e no editor de workflow (f50d27a), deploy a43954d0; @ da conta corrigido no banco com o valor da API
Próximo passo:
- Usuário refaz o teste real; push para tocha
Arquivos tocados: src/lib/meta/account-profile.ts (+ teste), src/lib/follow-gate/gate.ts, src/lib/sequences/runtime.ts, src/app/(dashboard)/accounts/page.tsx, src/app/(dashboard)/rules/sequencias/nova/page.tsx, src/app/(dashboard)/rules/sequencias/[id]/page.tsx, testes de process e QA
Decisões/contexto: não existe URL de perfil do Instagram por id; o link precisa do @ atual, por isso a busca na hora do envio.
Tag: "HANDOFF-falow-20260926-125806-claude"

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
