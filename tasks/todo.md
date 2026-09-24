# Falow: rodada 2 de features (4 agentes em paralelo)

Planejado em 2026-09-23. Rodada anterior (duplicar + nó Automação + UX do editor) está concluída e commitada (ef293f6); ver histórico do git e `tasks/ai-handoff.md`.

## Como o time trabalha

- 4 agentes, cada um numa **worktree/branch própria** (`feat/temporarias`, `feat/fluxos-complexos`, `feat/variantes-resposta`, `feat/manychat-extras`). O Claude principal faz o merge na `main`, resolve conflitos, roda typecheck/test/build e faz o E2E logado.
- Migrations numeradas por agente para não colidir: **0003** temporárias, **0004** fluxos complexos, **0005** variantes, **0006** extras ManyChat. Todas idempotentes (`if not exists`), aplicadas pelo usuário no SQL Editor antes do deploy.
- Nó novo no canvas = pasta própria `src/components/sequences/<feature>/` (padrão já usado em `automation/`) + lógica em `src/lib/sequences/<feature>.ts`. Nos 7 pontos de registro compartilhados (`types/sequence.ts`, `lib/sequences/graph.ts`, `lib/sequences/runtime.ts`, `find-invalid-node.ts`, `sequence-editor.tsx`, `sequence-inspector.tsx`, `sequence-nodes.tsx`) só entram `case`/entradas novas, nunca refatoração do que existe.
- Regras globais valem: `modular-arch`, zero travessão em copy, testes vitest para toda função pura nova, `npx tsc --noEmit` + `npm test` + `npm run build` limpos antes de reportar.
- Deploy do Falow é manual (`npm run build:cloudflare && npx wrangler deploy`, token DEPLOY) e só com ok do usuário.

## Agente Opus A: automações temporárias (expiram e se apagam)

- [ ] Migration 0003: `expires_at timestamptz` + `expire_action text check in ('delete','pause')` em `rules` e `sequences`; índice parcial `where expires_at is not null`
- [ ] `src/lib/expiry/`: `expireAutomations(admin, now)` (apaga ou pausa o que venceu, loga no console) + função pura `expiryLabel(expires_at, now)` ("expira em 2 dias", "expirada") com vitest
- [ ] Rodar o sweep no `/api/cron/sequences` e no tick oportunista do webhook (`process.ts`, junto de `processDueRunsSafe`)
- [ ] Defesa no matching: queries de rules em `process.ts` e de sequences em `runtime.ts` ignoram `expires_at <= now()` mesmo antes do sweep rodar
- [ ] Zod/`saveRule` e `saveSequence` aceitam `expires_at` (null = permanente) e `expire_action`
- [ ] UI: bloco "Automação temporária" (switch + presets 24h / 3 dias / 7 dias / data e hora) nos builders de DM e comentário e no diálogo de criar/editar workflow (`sequences-manager.tsx`, não no editor)
- [ ] Listas (`rules-manager.tsx`, `sequences-manager.tsx`): badge "Expira em X" / "Expirada"; ação "Estender" no dropdown
- [ ] Duplicar (`duplicateRule`/`duplicateSequence`) não copia expiração

## Agente Opus B: fluxos grandes e complexos (coleta de dados, variáveis, condições)

- [ ] Migration 0004: tabela `contacts` (`account_id`, `ig_sender_id`, `username`, `fields jsonb`, `tags text[]`, timestamps, unique por conta+sender, RLS select/update do dono) + `sequence_runs.variables jsonb`
- [ ] Nó **Coletar dado** (`collectInput`): pergunta + tipo (texto / e-mail / telefone / número / data) + nome do campo + validação com mensagem de erro e nova tentativa (máx N) + saída "inválido" opcional. Runtime: run fica em `waiting_reply` no nó; `handleSequenceReply` valida, grava em `contacts.fields` e em `run.variables`, segue
- [ ] Nó **Condição** (`condition`): campo/tag + operador (igual, contém, existe, maior/menor) + valor; saídas `yes`/`no`
- [ ] Nó **Definir campo / tag** (`setField`): grava valor fixo ou tag no contato
- [ ] Variáveis nas mensagens: `{{nome_do_campo}}`, `{{username}}` substituídos em todo texto enviado (mensagem, botões, respostas rápidas, coletar dado), função pura `renderTemplate` com vitest
- [ ] Editor: 3 blocos na paleta, formulários em `src/components/sequences/data/`, cards com resumo, validação em `graph.ts` (campo obrigatório, condição precisa das duas saídas ligadas ou avisa)
- [ ] Página **Contatos** (`src/app/(dashboard)/contatos/`): tabela com campos coletados e tags, busca, export CSV; item no sidebar
- [ ] Testes de integração no estilo de `runtime.test.ts` (coleta válida, inválida com retry, condição verdadeira/falsa, template)

## Agente Sonnet C: variantes de resposta (comentários)

- [ ] Migration 0005: `public_reply_variants jsonb` e `welcome_text_variants jsonb` em `rules` (arrays de string); `public_reply_text`/`welcome_text` continuam como variante 1 para compatibilidade
- [ ] `src/lib/rules/variants.ts`: `pickVariant(variants, seed?)` (aleatório, ignora vazias, cai no texto legado) com vitest
- [ ] `applyCommentRule` em `process.ts` usa `pickVariant` na resposta pública e na mensagem privada de boas-vindas; `interactions` continua logando normalmente
- [ ] Zod/`saveRule`/`duplicateRule` carregam os arrays (máx 10 variantes, cada uma dentro dos limites atuais: 300 pública, 640 boas-vindas)
- [ ] UI em `responder-comentario-builder.tsx`: lista de variantes com adicionar/remover/reordenar, contador, dica "o Falow sorteia uma a cada disparo"; `comment-phone-preview.tsx` mostra a variante selecionada com botão "ver outra"
- [ ] Sem travessão; sem mexer em builder de DM nem em sequences

## Agente Sonnet D: extras estilo ManyChat (gatilhos e nós utilitários)

- [ ] Pesquisa (WebSearch/WebFetch) das features do ManyChat para Instagram: gatilhos, ações e blocos. Registrar a lista em `tasks/manychat-features.md` com o que já existe no Falow, o que este agente implementa e o que fica para depois
- [ ] Gatilhos novos no nó Trigger (`TriggerSource`): **resposta a story** (`message.reply_to.story`), **menção em story** (`attachments[].type === "story_mention"`), **link de referência** (`referral.ref` de ig.me/m/<user>?ref=...), cada um com palavra-chave opcional. Parser em `src/lib/meta/triggers.ts` com vitest; roteamento em `process.ts`
- [ ] Nó **Aleatório / teste A-B** (`randomizer`): 2 a 5 saídas com porcentagens; runtime sorteia
- [ ] Nó **Ir para workflow** (`goToSequence`): encerra o run atual e inicia outro workflow ativo da conta (sem loop: valida que não aponta para si mesmo)
- [ ] Nó **Pausar automação para este contato** (`stopAutomation`): opcional se couber, marca o contato para não receber regras por X horas (ManyChat "pause automation")
- [ ] Migration 0006 só se precisar (ex.: `conversations.automation_paused_until`)
- [ ] Componentes em `src/components/sequences/extras/`; não tocar em coleta de dados, condição, variáveis, expiração ou variantes (são de outros agentes)

## Integração (Claude principal)

- [ ] Merge das 4 branches na `main` em ordem A, C, D, B (das menos para as mais invasivas nos arquivos compartilhados)
- [ ] `npx tsc --noEmit`, `npm test`, `npm run build`, `grep "—" src` limpo
- [ ] Usuário aplica migrations 0003 a 0006 no Supabase
- [ ] E2E logado em localhost (375 / 768 / 1440), itens "TESTE CLAUDE" apagados no fim
- [ ] Handoff em `tasks/ai-handoff.md`; deploy só com ok

## Decisões pendentes (confirmar com o usuário antes de disparar)

1. Temporária expirada: excluir de vez, só pausar, ou o usuário escolhe em cada automação?
2. Temporária vale para automações (DM e comentário) e também para workflows?
3. Variantes: só na resposta pública do comentário, ou também na mensagem privada de boas-vindas e na resposta de DM?
4. Dados coletados: página "Contatos" com export CSV, ou só usar dentro do fluxo por enquanto?
