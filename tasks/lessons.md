# Lessons

## 2026-09-28 · agentes em worktree e código de agente
- Erro evitado por sorte: as worktrees dos agentes nasceram num commit 47 atrás da main (sem o CRM). Os agentes perceberam e fizeram ff sozinhos, mas poderiam ter codado em cima do nada.
- Regra: no prompt de agente em worktree, mandar conferir a base na 1ª ação (`git merge-base --is-ancestor <commit-da-main> HEAD`) e fazer `git merge --ff-only main` se precisar.
- Regra: código de agente sempre passa por revisão dirigida antes do deploy, olhando os pontos de integração (fila, captura, limites do framework). Nesta rodada a revisão pegou 3 bugs que os testes dos próprios agentes não pegavam: fila de atrasos travada, lead devolvido para a 1ª etapa a cada DM e upload barrado pelo limite de 1MB das server actions.

## 2026-09-28 · build com pouca RAM
- Erro: `build:cloudflare` em background foi morto pelo Claude Code por falta de memória enquanto a sessão esperava.
- Regra: com pouca RAM, fazer o build em 2 etapas em primeiro plano: `NEXT_PRIVATE_STANDALONE=true NEXT_PRIVATE_OUTPUT_TRACE_ROOT=<raiz> npm run build` e depois `npx opennextjs-cloudflare build --skipNextBuild` (o `npm run build` comum não gera o standalone e o skip falha).

## 2026-09-28 · instrução de teste manual ambígua
- Erro: pedi "rodada 2" (reagir, editar, apagar...) sem dizer ONDE fazer. O usuário entendeu que era no Falow e cobrou deploy de telas que ainda não existem.
- Regra: todo pedido de ação manual diz explicitamente o lugar (app do Instagram no celular, painel do Falow, SQL Editor...) e o que já está no ar para aquilo funcionar. Se nada precisa de deploy, dizer isso na mesma mensagem.

## 2026-09-23 · "usar automação no workflow"
- Erro: tratei "usar automação no workflow" como problema de arquitetura e deixei o agente escolher o modelo (gatilho nativo). O usuário queria algo literal: um nó onde se seleciona uma automação existente.
- Regra: quando o pedido descreve uma interação de UI ("usar X dentro de Y"), confirmar o formato literal com o usuário ANTES de mandar agentes compararem modelos. Restrições técnicas (ex.: Meta 1 private reply por comentário) adaptam o formato pedido, não o substituem.

## 2026-09-24 · build dentro de worktree com node_modules em junction
- Erro: worktrees usavam `node_modules` como junction para o do projeto principal. Rodar `next build` / `build:cloudflare` dentro delas esvaziou o `node_modules` REAL duas vezes (o build do OpenNext chegou a escrever fora da worktree, em `.claude/worktrees/node_modules`). Custou 2 `npm ci` de 13 min.
- Regra: junction de node_modules em worktree só para `tsc`/`vitest`. Build de produção e deploy SEMPRE na pasta principal, depois do merge. Ao terminar com uma worktree, desfazer a junction com `cmd /c rmdir <junction>` (remove só o link) antes de qualquer limpeza.

## 2026-09-24 · revisão multi-agente que "passou" sem rodar
- Erro evitado por pouco: a 2ª revisão devolveu `confirmed: []` e a 1ª listou achados de timing/migrations como "refutados", mas os agentes tinham falhado por falta de crédito do modelo (o workflow fixa o modelo no lançamento). Voto ausente virava refutação.
- Regra: ao receber resultado de workflow, sempre conferir `<failures>`/journal antes de ler o resultado. Resultado vazio ou refutação sem voto válido não é "código limpo"; relançar com resume depois de trocar de modelo ou do reset do limite.

## 2026-09-23 · gatilho do workflow
- O usuário espera que workflow e automações sejam um sistema só: gatilho nunca é default (o usuário define), e "usar automação existente" é opção de primeira classe no próprio gatilho, não um passo extra. Ao planejar qualquer feature de sequences, incluir a integração com rules e testes de integração (rules -> sequences) como item obrigatório, não como "verificação depois".
