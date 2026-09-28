# Falow como servidor MCP — desenho

Data: 2026-09-28
Status: **spec aprovada, implementação engatilhada** — não executar agora.
Gatilho de execução: quando o Falow for preparado para multi-tenant (ver seção 13).

---

## 1. O que é e por que existe

O Falow passa a expor um **servidor MCP** (Model Context Protocol): quem instala pluga a própria instalação do Falow no Claude, no ChatGPT ou no Claude Code e passa a operar o produto conversando — "cria uma automação que responde *preço* com o link da tabela", "como foi a semana", "quantos contatos entraram ontem".

A razão de ser não é técnica, é de produto e de custo:

- **É o único jeito de colocar IA no Falow sem custo variável por usuário.** Num MCP o cérebro é a assinatura de IA *do cliente*. Os tokens são consumidos na conta dele; o Falow só recebe pedidos e devolve JSON. O caminho oposto — IA do lado do servidor, o Falow escrevendo respostas sozinho — transformaria o Matheus em revendedor de token, com custo por usuário variável e imprevisível. Ver seção 11.
- **É feature vendável.** "Pluga o Falow no seu Claude" é diferencial de plano, não custo a ratear.

## 2. De onde veio a decisão

O MCP foi recortado na rodada 1 das ideias novas (ver `tasks/ai-handoff.md`, handoff de 2026-09-27) com a definição "o Falow virar servidor MCP", e ficou para a rodada 2 com spec própria. Esta é a spec.

Decisões tomadas no brainstorming de 2026-09-28, todas do Matheus:

| # | Decisão | Escolha |
|---|---|---|
| D1 | O que o MCP resolve | Tudo: construir automação conversando, perguntar sobre desempenho, operar o dia a dia, e servir de diferencial de produto |
| D2 | Clientes MCP alvo | Conector do claude.ai, ChatGPT/outros, e Claude Code |
| D3 | Segurança da escrita | **Ativa direto, sem cerimônia.** Sem rascunho, sem flag "criado por IA", sem confirmação. O MCP escreve igual o dono escreveria clicando |
| D4 | Escopo desta rodada | **Só automações e números.** Workflow do canvas fica inteiro de fora — nem leitura |
| D5 | Abordagem | Servidor remoto em `/api/mcp` com autenticação dupla (Bearer + OAuth 2.1) |
| D6 | Multi-tenant | Autenticação **desenhada pronta para multi-tenant desde o dia um**, mesmo com o produto ainda single-tenant |
| D7 | Execução | Só a spec e o plano agora. Código quando a plataforma for para multi-tenant |

## 3. Escopo

**Dentro:** automações (regras de resposta), métricas, logs de interação, contatos (leitura), contas conectadas, e a camada de autenticação do MCP.

**Fora, e de propósito:**

- **Workflow do canvas** (`sequences`) — nenhuma tool, nem de leitura. É a parte mais cara de expor (a IA teria que montar um grafo válido de nós e arestas) e o Matheus tirou do escopo. Rodada futura.
- **Exportar contatos em CSV** — o `src/lib/contacts/csv.ts` existe para download no navegador. Por MCP viraria um paredão de texto sem uso.
- **Derrubar a trava de cadastro único** (`src/lib/config.ts`) — isso é o projeto de multi-tenant, que é maior que o MCP e tem spec própria. Esta spec só garante que o MCP não atrapalhe quando ele chegar.

## 4. Arquitetura

### 4.1 Uma rota, stateless

`src/app/api/mcp/route.ts` — um POST, **Streamable HTTP em modo stateless**: sem SSE, sem sessão mantida entre requisições.

Isso é imposição do ambiente, não preferência. O Falow roda em **dois lugares serverless** (Vercel e Cloudflare Workers). Em serverless, requisições consecutivas caem em instâncias diferentes; um transporte com sessão em memória funcionaria em desenvolvimento e quebraria em produção de forma intermitente e difícil de diagnosticar. O modo stateless é request/response puro.

O `src/middleware.ts` já libera `/api/*` sem login ("Rotas de API cuidam da própria autenticação"), então nenhuma mudança é necessária lá.

### 4.2 Camadas

```
src/app/api/mcp/route.ts        handler HTTP: recebe JSON-RPC, autentica, despacha
src/lib/mcp/auth.ts             token -> user_id -> client Supabase daquele usuário
src/lib/mcp/server.ts           registro das tools, roteamento de tools/call
src/lib/mcp/tools/rules.ts      tools de automação (leitura e escrita)
src/lib/mcp/tools/metrics.ts    métricas e logs
src/lib/mcp/tools/contacts.ts   contatos e contas conectadas
src/lib/mcp/audit.ts            registro de chamada e rate limit
```

**Regra de dependência:** as tools não conhecem o transporte. Elas recebem um client Supabase já autenticado e um objeto de argumentos validado, e devolvem dados. Isso é o que torna o risco do SDK (4.3) contornável sem retrabalho.

### 4.3 Risco: o SDK pode não rodar no Cloudflare Workers

O `@modelcontextprotocol/sdk` traz transporte HTTP construído em cima do `req`/`res` do Node. O Cloudflare Workers não tem esses objetos — tem `Request`/`Response` da Web API. Pode não encaixar.

**Mitigação, já embutida no desenho:** como as tools ignoram o transporte, o plano de implementação abre com um spike curto. Se o SDK não colar, o substituto é um handler JSON-RPC escrito à mão. No modo stateless a superfície do protocolo é pequena — `initialize`, `tools/list`, `tools/call` — e nenhuma tool muda uma linha.

**O spike é o primeiro item do plano.** Construir as tools antes de saber a resposta seria construir em cima de uma incógnita.

## 5. Autenticação — duas portas, uma identidade

Esta é a seção central. É ela que carrega a decisão D6.

### 5.1 O princípio

**Duas portas de entrada, uma única função de verificação, e o isolamento é a RLS.**

A verificação devolve um `user_id`. A partir dele, o request usa um client do Supabase **agindo como aquele usuário** — nunca `createAdminClient()` (service role). Consequência direta: o isolamento entre clientes passa a ser a **Row Level Security que já existe e já protege o painel**.

As políticas de `supabase/migrations/0001_init.sql` são todas da forma:

```sql
create policy "own rules" on public.rules
  for all using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) ...
```

Ou seja: elas dependem de `auth.uid()`, que vem do JWT da requisição.

**Por que isso importa mais do que parece.** Nenhuma tool filtra tenant na mão. Se um dia alguém esquecer um filtro numa tool nova, a RLS ainda segura. É a diferença entre "o desenvolvedor não pode errar" e "errar não basta para vazar". Em SaaS, vazamento entre tenants é o erro que mata o produto — e o custo de projetar assim agora é de algumas linhas, contra reescrever a camada de autenticação inteira e auditar tool por tool depois.

### 5.2 Porta 1 — Bearer token

Para Claude Code, n8n, Cursor e qualquer cliente que aceite header.

```
Authorization: Bearer falow_<prefixo>_<segredo>
```

Tabela nova `mcp_tokens`:

| coluna | tipo | papel |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk `auth.users` | dono do token — é o que a RLS vai usar |
| `name` | text | nome dado pelo dono ("meu Claude Code") |
| `token_hash` | text | **SHA-256 do token.** O segredo nunca é guardado |
| `prefix` | text | primeiros caracteres, para exibir na lista sem revelar |
| `expires_at` | timestamptz | padrão 90 dias |
| `revoked_at` | timestamptz null | revogação |
| `last_used_at` | timestamptz null | para o dono ver o que está vivo |
| `created_at` | timestamptz | |

RLS por `user_id`, igual ao resto do schema.

O token aparece **uma única vez** na tela, na criação. Depois, só o prefixo.

### 5.3 Porta 2 — OAuth 2.1

Para o conector do claude.ai e do ChatGPT, que esperam o fluxo OAuth e não aceitam header avulso.

| rota | papel |
|---|---|
| `/.well-known/oauth-protected-resource` | metadata do recurso protegido |
| `/.well-known/oauth-authorization-server` | metadata do servidor de autorização |
| `/api/mcp/register` | Dynamic Client Registration |
| `/api/mcp/authorize` | tela de autorização — **exige a sessão Supabase que já existe** |
| `/api/mcp/token` | troca `code` por access token |

PKCE obrigatório. A tela do `authorize` é uma página do painel: quem autoriza é quem está logado, e o `user_id` da sessão é o que vai para o token.

**O ponto que barateia tudo:** o `authorize` emite exatamente o mesmo registro em `mcp_tokens` que a porta 1. As duas portas convergem numa linha de tabela e numa função de verificação. As tools nunca sabem por onde o pedido entrou.

Tabelas auxiliares: `mcp_oauth_clients` (clientes registrados dinamicamente) e `mcp_oauth_codes` (códigos de autorização, TTL curto e uso único).

### 5.4 O ponto não resolvido: client com a identidade do usuário sem cookie

Para a RLS funcionar, o client do Supabase precisa carregar um JWT cujo `sub` seja o `user_id` do token. Sem cookie de sessão, isso não sai de graça.

**Isto é uma pergunta em aberto, não um detalhe de implementação.** Caminhos possíveis, em ordem de preferência a investigar:

1. Assinar um JWT na hora com o segredo JWT do projeto Supabase, com `sub` = `user_id`, `role` = `authenticated` e validade curta, e passá-lo ao client como `Authorization`. Não exige armazenar credencial de usuário.
2. Guardar um refresh token por sessão MCP e renovar via `auth.refreshSession`. Funciona, mas cria material de credencial persistente — pior.
3. Client service role com filtro explícito por `user_id` em toda query. **Rejeitado**: joga fora exatamente a garantia que motivou D6.

O plano trata isso como investigação própria, com resultado verificado antes de qualquer tool ser escrita. Se nenhum caminho seguro existir, a spec volta para revisão — não improvisar para o caminho 3.

### 5.5 Validade, revogação e rastro

- Validade padrão de 90 dias, configurável na criação.
- Tela de revogação em Configurações, listando nome, prefixo, criação e `last_used_at`.
- `last_used_at` atualizado a cada chamada (escrita barata, sem bloquear a resposta).

**Nota de risco, registrada de propósito e não como trava:** por D3 o token dá escrita total e imediata nas automações do dono. Em self-hosted, um token vazado é problema de quem vazou. Em SaaS, um token vazado deixa um terceiro escrever nas DMs do Instagram de um cliente. D3 continua valendo e o desenho está feito como o Matheus escolheu — mas **revisitar D3 antes de abrir o SaaS para terceiros é item explícito**, para a decisão não passar batido por esquecimento. Ver seção 12.

## 6. Superfície de tools

Contratos em português — o público é brasileiro e os modelos leem bem.

Toda tool devolve **JSON estruturado e um resumo em texto**. Toda tool de escrita devolve também o link pronto do painel (`${NEXT_PUBLIC_APP_URL}/rules/<id>/editar`), como conveniência, não como trava.

### 6.1 Leitura

| tool | argumentos | devolve |
|---|---|---|
| `listar_automacoes` | `ativa?`, `tipo_gatilho?` (`dm`\|`comment`), `pasta?` | id, nome, gatilho, palavra-chave, tipo de resposta, ativa, prioridade |
| `ver_automacao` | `id` | a regra completa, incluindo variantes, portão de seguidor e expiração |
| `metricas` | `dias?` (padrão 30) | recebidas, respondidas, taxa de acerto, contatos, série por dia |
| `logs` | `status?`, `dias?`, `automacao_id?`, `limite?`, `cursor?` | linhas de `interactions` paginadas |
| `listar_contatos` | `limite?`, `cursor?` | username, campos coletados (`fields`), tags, atualizado em |
| `buscar_contato` | `username` ou `ig_sender_id` | o contato e o que foi coletado dele |
| `contas_conectadas` | — | username, status, expiração do token |

`metricas` reproduz o que `src/app/(dashboard)/dashboard/page.tsx` já calcula a partir de `interactions` (recebidas = total; respondidas = status `replied`; taxa = respondidas/recebidas) e de `conversations` (contatos).

`logs` lê `interactions`, que tem `status` em `replied | no_match | duplicate_skip | window_expired | error`, além de `message_text`, `matched_keyword`, `latency_ms` e `error_detail` — o suficiente para a IA diagnosticar "por que essa automação não respondeu".

### 6.2 Escrita

| tool | argumentos | efeito |
|---|---|---|
| `criar_automacao` | mesmo shape do `ruleSchema` | cria e **já fica ativa** (D3) |
| `editar_automacao` | `id` + campos | atualiza |
| `ligar_desligar_automacao` | `id`, `ativa` | liga/desliga |
| `apagar_automacao` | `id` | apaga |
| `duplicar_automacao` | `id` | duplica |

Todas passam pela **mesma validação do painel** (seção 7), incluindo o aviso não bloqueante de colisão de palavra-chave, que vira texto no retorno para o modelo repassar ao usuário.

## 7. O refactor que vem junto

Hoje `src/app/(dashboard)/rules/actions.ts` (475 linhas) faz validação, detecção de colisão e persistência no mesmo arquivo, e o `saveRule` obtém o client sozinho via `createClient()` — que lê cookie e **não funciona dentro de uma rota de API**.

**Extrair para `src/lib/rules/save.ts`:** `ruleSchema`, `validateRule`, `findConflictingRuleName`, a montagem da linha e a escrita. A função nova **recebe o client Supabase como argumento** em vez de buscá-lo.

Depois disso:

- o server action encolhe para poucas linhas (pega o client por cookie, chama a função, revalida o path);
- a tool do MCP chama a mesma função com o client do token.

**Por que isso não é capricho:** sem o refactor, ou o MCP duplica a validação — e as duas cópias divergem no primeiro ajuste de regra de negócio — ou pula a validação e escreve automação quebrada no banco. Como efeito colateral, um arquivo grande demais deixa de acumular três responsabilidades.

O mesmo vale, em menor escala, para `toggleRule`, `deleteRule` e `duplicateRule`.

## 8. Migrations

Uma migration nova, `0011_mcp.sql`, idempotente e segura com a versão anterior do app no ar (o padrão do repositório):

- `mcp_tokens` (5.2) + RLS por `user_id`
- `mcp_oauth_clients`, `mcp_oauth_codes` (5.3)
- `mcp_calls` — auditoria: token, tool, quando, sucesso, duração

`src/lib/db/missing.ts` já existe exatamente para isto: sem a migration aplicada, as telas e o MCP respondem "recurso indisponível nesta instalação" em vez de estourar. O MCP deve usá-lo.

## 9. Erro, limite e auditoria

- **Erro de validação volta em português que o modelo consegue corrigir sozinho** — "a palavra-chave não pode ficar vazia", nunca `PGRST204`. Isto é requisito funcional: um erro opaco faz o modelo repetir o mesmo erro.
- **Rate limit por token.** O MCP é a superfície mais fácil de martelar. Contador por token por minuto, em `mcp_calls`.
- **Toda chamada vira linha em `mcp_calls`.** Em SaaS é o que responde "quem apagou a automação do cliente".

## 10. Testes

`src/lib/sequences/__tests__/fake-supabase.ts` já dá a base para testar tool sem banco real.

Cobertura mínima:

1. **Autenticação** — token válido, expirado, revogado, malformado, ausente.
2. **Isolamento** — token do usuário A não enxerga nem escreve dado do usuário B. **Este é o teste que prova D6 e não pode faltar.**
3. **Contrato JSON-RPC** — `initialize`, `tools/list`, `tools/call`, incluindo erro de tool inexistente e de argumento inválido.
4. **Tools** — cada uma com caso feliz e caso de erro de validação.
5. **Refactor sem regressão** — os testes existentes de regra continuam passando após a extração.

## 11. Custo

Estimativa levantada no brainstorming, com preços conhecidos em 2026-09 (vale reconferir, mudam):

| | fixo | acréscimo do MCP por usuário/mês |
|---|---|---|
| Vercel Pro | ~US$ 20 | ~US$ 0,005 |
| Supabase Pro | ~US$ 25 | ~US$ 0,001 |
| Cloudflare Workers | ~US$ 5 | menos ainda |

Assumindo um usuário **pesado**, ~500 chamadas de tool por mês. Dá **menos de um centavo de dólar por usuário por mês**; as cotas inclusas (1M de invocações) só apertam por volta de 2.000 usuários ativos.

**Conclusão: o MCP não precisa ser repassado ao cliente.** Não há o que recuperar. Ele é feature que justifica plano mais caro, não custo a ratear.

**O que custa de verdade em escala, e não é o MCP:** o webhook (`/api/webhooks/meta`, um hit por DM e por comentário — facilmente 10× a 100× o tráfego do MCP), o armazenamento que só cresce (`interactions`, `conversations`, `contacts`, `processed_events`, versões de workflow — **não há política de retenção hoje**) e o suporte humano. Retenção merece decisão própria, fora desta spec.

## 12. Riscos e pontos em aberto

| # | Ponto | Tratamento |
|---|---|---|
| R1 | SDK MCP pode não rodar no Cloudflare Workers | Spike é o primeiro item do plano; fallback é handler JSON-RPC próprio (4.3) |
| R2 | Como obter client com identidade do usuário sem cookie | Investigação dedicada antes de escrever tool; caminho service-role está **rejeitado** (5.4) |
| R3 | Token dá escrita total e imediata (D3) | Mantido como decidido. **Revisitar antes de abrir o SaaS a terceiros** (5.5) |
| R4 | Produto ainda é single-tenant | Esta spec não derruba a trava; só garante que o MCP não precise ser reescrito quando ela cair |
| R5 | Sem política de retenção de dados | Fora do escopo, registrado para decisão futura (11) |

## 13. Quando construir

**Não agora.** Decisão D7: a implementação é engatilhada por *o Falow ser preparado para multi-tenant*. Até lá, esta spec e o plano ficam prontos e parados.

Dependência real: o valor de D6 (autenticação pronta para multi-tenant) só se realiza quando existir mais de um tenant. Construir antes entrega um servidor MCP que funciona, mas cuja principal decisão de desenho fica sem exercício — e sem o segundo usuário, o teste de isolamento (10.2) testa uma hipótese em vez de um caso real.

Registro da tarefa: `tasks/todo.md` deste repositório e `tarefas.md` da raiz do workspace.

Plano de implementação: `docs/superpowers/plans/2026-09-28-falow-mcp-plan.md`.
