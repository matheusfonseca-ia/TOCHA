# Servidor MCP do Falow — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor o Falow como servidor MCP remoto, com autenticação pronta para multi-tenant, para que o dono da instalação opere automações, métricas, logs e contatos conversando com o Claude, o ChatGPT ou o Claude Code.

**Architecture:** Uma rota `POST /api/mcp` em modo Streamable HTTP **stateless** (imposto pelos dois deploys serverless — Vercel e Cloudflare Workers). Duas portas de autenticação (Bearer token e OAuth 2.1) convergem numa única função de verificação que devolve um `user_id`; a partir dele o request usa um client Supabase agindo como aquele usuário, de modo que **o isolamento entre tenants é a RLS que já existe**. As tools não conhecem o transporte nem a porta de entrada.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS + Auth), Zod, Vitest. Dependência nova possível: `@modelcontextprotocol/sdk` (a decidir na Task 1).

**Spec:** `docs/superpowers/specs/2026-09-28-falow-mcp-design.md`

## Global Constraints

- **Não executar este plano agora.** Gatilho: o Falow ser preparado para multi-tenant (spec §13, decisão D7).
- **Stateless obrigatório.** Nenhum estado em memória entre requisições — o app roda em Vercel e Cloudflare Workers (spec §4.1).
- **Nunca usar `createAdminClient()` (service role) no caminho do MCP.** O isolamento é a RLS via `auth.uid()` (spec §5.1). O caminho service-role está explicitamente rejeitado (spec §5.4, item 3).
- **Segredo de token nunca é persistido.** Só o SHA-256 e o prefixo (spec §5.2).
- **Escrita é ativa e imediata.** Sem rascunho, sem flag "criado por IA", sem confirmação (decisão D3).
- **Zero tool de workflow/`sequences`**, nem de leitura (decisão D4).
- **Mensagens de erro em português, acionáveis pelo modelo.** Nunca vazar código do Postgres como `PGRST204` (spec §9).
- Migration nova é **idempotente e segura com a versão anterior do app no ar** — padrão do repositório.
- Testes: Vitest, arquivo `*.test.ts` ao lado do código, alias `@/`, descrições em português. Rodar um arquivo: `npx vitest run <caminho>`. Rodar tudo: `npm test`.
- Verificação de fechamento de cada task: `npx tsc --noEmit` limpo.

## Review Focus

Classes de entrada que a spec implica mas que nenhuma task exercitaria por padrão. Cada linha tem o teste correspondente embutido na task dona do código.

1. **Modelo manda argumento com o tipo trocado** (`"true"` em vez de `true`, `"30"` em vez de `30`). Modelos fazem isso o tempo todo; o esperado é coerção tolerante ou erro em português que o modelo consiga corrigir — nunca stack trace. → teste na Task 8.
2. **Payload JSON-RPC em lote (array) ou malformado.** Clientes MCP podem enviar batch; o esperado é resposta JSON-RPC de erro bem formada, não 500. → teste na Task 6.
3. **Migration `0011_mcp.sql` não aplicada.** Padrão do repo (`src/lib/db/missing.ts`): o recurso some sozinho com mensagem clara, o app não quebra. → teste na Task 5.
4. **Token válido de um usuário sem nenhuma conta do Instagram conectada.** As tools devem dizer "nenhuma conta conectada" em vez de devolver lista vazia sem explicação ou falhar no `account_id`. → teste na Task 11.
5. **Token expirado na borda e token revogado.** Expiração é comparada contra `now()`; revogado nunca autentica, mesmo dentro da validade. → teste na Task 5.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0011_mcp.sql` | Tabelas `mcp_tokens`, `mcp_oauth_clients`, `mcp_oauth_codes`, `mcp_calls` + RLS |
| `src/lib/mcp/token.ts` | Gerar, formatar e hashear token. Puro, sem I/O |
| `src/lib/mcp/auth.ts` | Token cru → `user_id`. Valida expiração e revogação |
| `src/lib/mcp/identity.ts` | `user_id` → client Supabase agindo como aquele usuário |
| `src/lib/mcp/protocol.ts` | JSON-RPC: `initialize`, `tools/list`, `tools/call` |
| `src/lib/mcp/registry.ts` | Tipo `McpTool` e lista de tools registradas |
| `src/lib/mcp/tools/rules.ts` | Tools de automação (leitura e escrita) |
| `src/lib/mcp/tools/metrics.ts` | `metricas` e `logs` |
| `src/lib/mcp/tools/contacts.ts` | `listar_contatos`, `buscar_contato`, `contas_conectadas` |
| `src/lib/mcp/audit.ts` | Registro em `mcp_calls` e rate limit por token |
| `src/lib/rules/save.ts` | **Extraído** de `rules/actions.ts`: validação + conflito + escrita |
| `src/app/api/mcp/route.ts` | Handler HTTP |
| `src/app/api/mcp/{register,authorize,token}/route.ts` | OAuth 2.1 |
| `src/app/.well-known/*/route.ts` | Metadata OAuth |
| `src/app/(dashboard)/settings/page.tsx` | **Rota nova** — não existe tela de Configurações hoje |
| `src/app/(dashboard)/mcp/autorizar/page.tsx` | Tela de consentimento do OAuth (exige login pelo middleware) |
| `src/components/settings/mcp-tokens.tsx` | Tela de criar/revogar token (**pasta nova**) |
| `src/lib/sequences/__tests__/fake-supabase.ts` | **Estendido** na Task 5: tabelas `mcp_*`, `createFakeSupabase`, `rowsOf`, `failNextWith` |

---

## Task 1: Spike — o SDK do MCP roda no Cloudflare Workers?

**Descartável por natureza.** A saída é uma resposta, não código que fica. Risco R1 da spec.

**Files:**
- Create (temporário): `src/app/api/mcp-spike/route.ts`

- [ ] **Step 1: Instalar o SDK e montar o menor handler possível**

```bash
npm install @modelcontextprotocol/sdk
```

```ts
// src/app/api/mcp-spike/route.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const server = new McpServer({ name: "falow-spike", version: "0" });
  const body = await request.json();
  return Response.json({ ok: true, method: body?.method ?? null });
}
```

- [ ] **Step 2: Provar que compila para os dois alvos**

Run: `npx tsc --noEmit && npm run build && npm run build:cloudflare`
Expected: os três limpos. `build:cloudflare` é o que decide — é o OpenNext gerando bundle de Worker.

- [ ] **Step 3: Tentar o transporte HTTP de verdade**

Trocar o handler pelo `StreamableHTTPServerTransport` do SDK em modo stateless e rodar `npm run build:cloudflare` de novo. Se o transporte exigir `http.IncomingMessage`/`ServerResponse` do Node, o build do Worker quebra ou o bundle puxa polyfill de `node:http`.

- [ ] **Step 4: Registrar a decisão e apagar o spike**

Escrever o resultado em `tasks/lessons.md` numa linha: SDK viável, ou handler JSON-RPC próprio (fallback da spec §4.3).

```bash
rm -rf src/app/api/mcp-spike
git add tasks/lessons.md package.json package-lock.json
git commit -m "spike: decidir transporte MCP (SDK vs handler proprio)"
```

**Se o SDK não servir:** a Task 6 implementa o handler JSON-RPC à mão. Nenhuma outra task muda — as tools não conhecem o transporte.

---

## Task 2: Investigação — client Supabase com identidade do usuário, sem cookie

Risco R2 da spec. **Bloqueia todas as tasks de tool.** A saída é um módulo funcionando, com teste.

**Files:**
- Create: `src/lib/mcp/identity.ts`
- Test: `src/lib/mcp/identity.test.ts`

**Interfaces:**
- Produces: `clientForUser(userId: string): SupabaseClient` — client cujo JWT tem `sub = userId` e `role = "authenticated"`, de modo que `auth.uid()` funcione nas policies.

- [ ] **Step 1: Escrever o teste do formato do JWT**

O que dá para testar sem rede é a montagem do token. A prova de que a RLS aceita é manual (Step 4).

```ts
// src/lib/mcp/identity.test.ts
import { describe, expect, it } from "vitest";

import { buildUserJwt } from "@/lib/mcp/identity";

const SECRET = "segredo-de-teste-com-tamanho-suficiente-aqui";

function payloadOf(jwt: string) {
  return JSON.parse(
    Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")
  );
}

describe("buildUserJwt", () => {
  it("põe o id do usuário no sub, que é o que auth.uid() lê", () => {
    const jwt = buildUserJwt("11111111-1111-1111-1111-111111111111", SECRET);
    expect(payloadOf(jwt).sub).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("marca o papel como authenticated, senão as policies não valem", () => {
    const jwt = buildUserJwt("11111111-1111-1111-1111-111111111111", SECRET);
    expect(payloadOf(jwt).role).toBe("authenticated");
  });

  it("expira em minutos, não em dias", () => {
    const jwt = buildUserJwt("11111111-1111-1111-1111-111111111111", SECRET);
    const { exp, iat } = payloadOf(jwt);
    expect(exp - iat).toBeLessThanOrEqual(600);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/mcp/identity.test.ts`
Expected: FAIL — `buildUserJwt` não existe.

- [ ] **Step 3: Implementar**

HMAC-SHA256 com `node:crypto` (disponível nos dois runtimes via `crypto.subtle`; usar Web Crypto para o Worker não reclamar).

```ts
// src/lib/mcp/identity.ts
import { createHmac } from "node:crypto";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const JWT_TTL_SECONDS = 600;

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** JWT no formato que o Supabase espera: sub = id do usuário, role authenticated. */
export function buildUserJwt(userId: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp: now + JWT_TTL_SECONDS,
    })
  );
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/**
 * Client que age COMO o usuário: a RLS de todas as tabelas depende de
 * auth.uid(), então é isso que isola um tenant do outro. Nunca trocar por
 * service role — ver spec §5.4.
 */
export function clientForUser(userId: string) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("SUPABASE_JWT_SECRET não configurada");

  const jwt = buildUserJwt(userId, secret);
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    }
  );
}
```

- [ ] **Step 4: Verificação manual contra o Supabase real — obrigatória**

Esta é a prova que o teste unitário não dá. Com `SUPABASE_JWT_SECRET` preenchida (Supabase → Settings → API → JWT Secret), rodar um script pontual que faça `clientForUser(<id de um usuário real>).from("rules").select("id")` e conferir que **só** vêm as regras daquele usuário. Depois repetir com um `userId` inventado e conferir que vem **lista vazia**, não erro e não dados de outro.

**Se o Supabase rejeitar o JWT assinado à mão**, parar aqui e voltar à spec §5.4 para avaliar o caminho 2 (refresh token). **Não** cair no caminho 3 (service role) — ele anula a decisão D6.

- [ ] **Step 5: Documentar a variável nova**

Acrescentar `SUPABASE_JWT_SECRET` em `.env.example` e na tabela de variáveis do `README.md`, marcada como segredo.

- [ ] **Step 6: Rodar os testes e commitar**

Run: `npx vitest run src/lib/mcp/identity.test.ts && npx tsc --noEmit`
Expected: PASS e tsc limpo.

```bash
git add src/lib/mcp/identity.ts src/lib/mcp/identity.test.ts .env.example README.md
git commit -m "feat(mcp): client Supabase com identidade do usuario via JWT"
```

---

## Task 3: Migration `0011_mcp.sql`

**Files:**
- Create: `supabase/migrations/0011_mcp.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- ══════════════════════════════════════════════════════════════════════════
-- MCP — tokens, OAuth 2.1 e auditoria.
-- Idempotente: seguro rodar com a versão anterior do app no ar.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  token_hash   text not null unique,      -- SHA-256; o segredo nunca é guardado
  prefix       text not null,             -- exibido na lista, não revela nada
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists mcp_tokens_user_idx
  on public.mcp_tokens (user_id, created_at desc);

create table if not exists public.mcp_oauth_clients (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null unique,
  client_name   text,
  redirect_uris text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create table if not exists public.mcp_oauth_codes (
  code                  text primary key,
  client_id             text not null,
  user_id               uuid not null references auth.users (id) on delete cascade,
  redirect_uri          text not null,
  code_challenge        text not null,
  code_challenge_method text not null default 'S256',
  expires_at            timestamptz not null,
  used_at               timestamptz,
  created_at            timestamptz not null default now()
);

create table if not exists public.mcp_calls (
  id          uuid primary key default gen_random_uuid(),
  token_id    uuid references public.mcp_tokens (id) on delete set null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  tool        text not null,
  ok          boolean not null,
  duration_ms int,
  created_at  timestamptz not null default now()
);

-- Rate limit por token/minuto lê por aqui.
create index if not exists mcp_calls_token_created_idx
  on public.mcp_calls (token_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.mcp_tokens        enable row level security;
alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes   enable row level security;
alter table public.mcp_calls         enable row level security;

drop policy if exists "own mcp tokens" on public.mcp_tokens;
create policy "own mcp tokens" on public.mcp_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own mcp calls" on public.mcp_calls;
create policy "own mcp calls" on public.mcp_calls
  for select using (user_id = auth.uid());

-- mcp_oauth_clients e mcp_oauth_codes: sem policy de propósito.
-- São manipuladas antes de existir identidade de usuário na requisição, só
-- por código de servidor com service role (fluxo OAuth), igual ao
-- processed_events da 0001.
```

- [ ] **Step 2: Aplicar no Supabase e conferir**

Rodar no SQL Editor do projeto. Depois, no mesmo editor:

```sql
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'mcp_%';
```

Expected: quatro linhas.

- [ ] **Step 3: Rodar a migration duas vezes**

Expected: a segunda execução não dá erro (idempotência).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0011_mcp.sql
git commit -m "feat(mcp): migration de tokens, oauth e auditoria"
```

---

## Task 4: Token — gerar, hashear, formatar

Módulo puro, sem I/O. É o que guarda a regra "o segredo nunca é persistido".

**Files:**
- Create: `src/lib/mcp/token.ts`
- Test: `src/lib/mcp/token.test.ts`

**Interfaces:**
- Produces:
  - `generateToken(): { raw: string; hash: string; prefix: string }`
  - `hashToken(raw: string): string`
  - `bearerFrom(header: string | null): string | null`

- [ ] **Step 1: Escrever os testes**

```ts
// src/lib/mcp/token.test.ts
import { describe, expect, it } from "vitest";

import { bearerFrom, generateToken, hashToken } from "@/lib/mcp/token";

describe("generateToken", () => {
  it("nasce com o prefixo do produto", () => {
    expect(generateToken().raw.startsWith("falow_")).toBe(true);
  });

  it("nunca repete", () => {
    const vistos = new Set(
      Array.from({ length: 200 }, () => generateToken().raw)
    );
    expect(vistos.size).toBe(200);
  });

  it("o hash confere com o do token cru", () => {
    const { raw, hash } = generateToken();
    expect(hashToken(raw)).toBe(hash);
  });

  it("o prefixo guardado não contém o segredo", () => {
    const { raw, prefix } = generateToken();
    expect(raw.includes(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(raw.length / 2);
  });
});

describe("bearerFrom", () => {
  it("extrai o token do header", () => {
    expect(bearerFrom("Bearer falow_abc_def")).toBe("falow_abc_def");
  });

  it("aceita Bearer com caixa diferente", () => {
    expect(bearerFrom("bearer falow_abc_def")).toBe("falow_abc_def");
  });

  it("header ausente não vira token", () => {
    expect(bearerFrom(null)).toBeNull();
  });

  it("header sem o esquema Bearer não vira token", () => {
    expect(bearerFrom("falow_abc_def")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/token.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/mcp/token.ts
import { createHash, randomBytes } from "node:crypto";

const SCHEME = "falow_";
const PREFIX_BYTES = 4;
const SECRET_BYTES = 24;

export interface GeneratedToken {
  /** Mostrado uma única vez ao dono. Nunca persistido. */
  raw: string;
  /** SHA-256 do raw. É isto que vai para o banco. */
  hash: string;
  /** Pedaço exibível na lista de tokens. */
  prefix: string;
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateToken(): GeneratedToken {
  const prefix = randomBytes(PREFIX_BYTES).toString("hex");
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const raw = `${SCHEME}${prefix}_${secret}`;
  return { raw, hash: hashToken(raw), prefix: `${SCHEME}${prefix}` };
}

export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/token.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/token.ts src/lib/mcp/token.test.ts
git commit -m "feat(mcp): geracao e hash de token"
```

---

## Task 5: Autenticação — token cru vira `user_id`

Cobre os itens 3 e 5 do Review Focus.

**Files:**
- Create: `src/lib/mcp/auth.ts`
- Test: `src/lib/mcp/auth.test.ts`
- Modify: `src/lib/sequences/__tests__/fake-supabase.ts` (acrescentar as tabelas `mcp_*` à união `TableName`)

**Interfaces:**
- Consumes: `hashToken` (Task 4), `isMissingTable` (`@/lib/db/missing`)
- Produces: `authenticate(db, raw): Promise<AuthResult>` com
  `type AuthResult = { userId: string; tokenId: string } | { error: string; unavailable?: boolean }`
- Produces (para os testes das Tasks 7 a 16): `createFakeSupabase(seed)`, `fake.rowsOf(tabela)`, `fake.failNextWith(erro)`

- [ ] **Step 1: Estender o fake do Supabase — usado por todas as tasks seguintes**

O fake de hoje expõe `createFakeAdmin(): FakeSupabase`, sem semente: os testes existentes populam à mão via `fake.tables.rules.push(...)`. As tasks do MCP precisam de três coisas a mais — as tabelas novas, uma semente declarativa e um jeito de simular tabela ausente. Acrescentar tudo em `src/lib/sequences/__tests__/fake-supabase.ts`, sem alterar nada do que já existe:

```ts
// 1) na união TableName, acrescentar:
  | "mcp_tokens"
  | "mcp_calls"
  | "mcp_oauth_clients"
  | "mcp_oauth_codes"

// 2) no inicializador de `tables` da classe FakeSupabase, acrescentar:
    mcp_tokens: [],
    mcp_calls: [],
    mcp_oauth_clients: [],
    mcp_oauth_codes: [],

// 3) dentro da classe FakeSupabase:
  private proximoErro: FakeError | null = null;

  /** Faz a próxima query falhar — para simular migration não aplicada. */
  failNextWith(erro: FakeError): void {
    this.proximoErro = erro;
  }

  /** Consome o erro armado, se houver. Chamado pelo FakeQueryBuilder. */
  consumirErro(): FakeError | null {
    const erro = this.proximoErro;
    this.proximoErro = null;
    return erro;
  }

  /** Linhas atuais de uma tabela, para assertiva de efeito. */
  rowsOf(table: TableName): Row[] {
    return this.tables[table];
  }

// 4) no FakeQueryBuilder, no ponto onde a query é resolvida (antes de montar
//    o QueryResult), devolver o erro armado se existir:
    const armado = this.db.consumirErro();
    if (armado) return { data: null, error: armado };

// 5) no fim do arquivo, a semente declarativa que as tasks do MCP usam:
export function createFakeSupabase(
  seed: Partial<Record<TableName, Row[]>> = {}
): FakeSupabase & { from: FakeSupabase["from"] } {
  const fake = createFakeAdmin();
  for (const [tabela, linhas] of Object.entries(seed)) {
    fake.tables[tabela as TableName].push(...(linhas ?? []));
  }
  // O código de produção chama `db.from(...)`; o fake já expõe `from`.
  return fake as FakeSupabase & { from: FakeSupabase["from"] };
}
```

Run: `npm test`
Expected: os testes existentes continuam todos passando — a mudança só acrescenta.

- [ ] **Step 2: Escrever os testes**

```ts
// src/lib/mcp/auth.test.ts
import { describe, expect, it } from "vitest";

import { authenticate } from "@/lib/mcp/auth";
import { hashToken } from "@/lib/mcp/token";
import { createFakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const USER = "11111111-1111-1111-1111-111111111111";
const RAW = "falow_abcd_segredo";

function dbCom(overrides: Record<string, unknown> = {}) {
  return createFakeSupabase({
    mcp_tokens: [
      {
        id: "tok-1",
        user_id: USER,
        name: "meu claude",
        token_hash: hashToken(RAW),
        prefix: "falow_abcd",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        revoked_at: null,
        last_used_at: null,
        created_at: new Date().toISOString(),
        ...overrides,
      },
    ],
  });
}

describe("authenticate", () => {
  it("token válido devolve o dono", async () => {
    expect(await authenticate(dbCom(), RAW)).toEqual({
      userId: USER,
      tokenId: "tok-1",
    });
  });

  it("token desconhecido não autentica", async () => {
    const r = await authenticate(dbCom(), "falow_xxxx_outro");
    expect(r).toEqual({ error: expect.any(String) });
  });

  it("token expirado não autentica", async () => {
    const r = await authenticate(
      dbCom({ expires_at: new Date(Date.now() - 1000).toISOString() }),
      RAW
    );
    expect(r).toEqual({ error: expect.any(String) });
  });

  it("token revogado não autentica, mesmo dentro da validade", async () => {
    const r = await authenticate(
      dbCom({ revoked_at: new Date().toISOString() }),
      RAW
    );
    expect(r).toEqual({ error: expect.any(String) });
  });

  it("token vazio não autentica", async () => {
    expect(await authenticate(dbCom(), "")).toEqual({
      error: expect.any(String),
    });
  });

  it("sem a migration 0011, responde indisponível em vez de quebrar", async () => {
    const db = createFakeSupabase({});
    db.failNextWith({ code: "PGRST205", message: "relation does not exist" });
    const r = await authenticate(db, RAW);
    expect(r).toEqual({ error: expect.any(String), unavailable: true });
  });

  it("a mensagem de erro é em português e não vaza código do Postgres", async () => {
    const r = await authenticate(dbCom(), "falow_xxxx_outro");
    expect("error" in r && r.error).not.toMatch(/PGRST|42703|relation/i);
  });
});
```

> `createFakeSupabase` e `failNextWith` vêm do Step 1 desta mesma task.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/auth.test.ts`
Expected: FAIL — `authenticate` não existe.

- [ ] **Step 4: Implementar**

```ts
// src/lib/mcp/auth.ts
import { isMissingColumn, isMissingTable } from "@/lib/db/missing";
import { hashToken } from "@/lib/mcp/token";

export type AuthResult =
  | { userId: string; tokenId: string }
  | { error: string; unavailable?: boolean };

const INVALIDO = "Token do MCP inválido, expirado ou revogado.";
const INDISPONIVEL =
  "O MCP não está disponível nesta instalação: falta aplicar a migration 0011.";

/**
 * Porta única de verificação: tanto o Bearer quanto o OAuth chegam aqui.
 * As tools nunca sabem por onde o pedido entrou (spec §5.1).
 *
 * `db` é um client com service role, porque a linha de mcp_tokens precisa
 * ser lida ANTES de existir identidade. É o único ponto do caminho do MCP
 * que usa service role, e ele não devolve dado de negócio nenhum.
 */
export async function authenticate(db: any, raw: string): Promise<AuthResult> {
  if (!raw) return { error: INVALIDO };

  const { data, error } = await db
    .from("mcp_tokens")
    .select("id, user_id, expires_at, revoked_at")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();

  if (error) {
    if (isMissingTable(error) || isMissingColumn(error)) {
      return { error: INDISPONIVEL, unavailable: true };
    }
    return { error: INVALIDO };
  }
  if (!data) return { error: INVALIDO };
  if (data.revoked_at) return { error: INVALIDO };
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return { error: INVALIDO };
  }

  return { userId: data.user_id, tokenId: data.id };
}
```

> Mesma mensagem para inexistente, expirado e revogado: não entregar ao
> atacante a informação de qual dos três foi.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/auth.test.ts && npx tsc --noEmit`
Expected: PASS (7 testes), tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/auth.ts src/lib/mcp/auth.test.ts src/lib/sequences/__tests__/fake-supabase.ts
git commit -m "feat(mcp): autenticacao de token com expiracao e revogacao"
```

---

## Task 6: Camada JSON-RPC

Cobre o item 2 do Review Focus. Se a Task 1 aprovou o SDK, esta task envolve o SDK; se não, implementa o protocolo à mão. O contrato externo é o mesmo.

**Files:**
- Create: `src/lib/mcp/registry.ts`, `src/lib/mcp/protocol.ts`
- Test: `src/lib/mcp/protocol.test.ts`

**Interfaces:**
- Produces:
  - `interface McpTool { name: string; description: string; inputSchema: z.ZodTypeAny; handler: (args: any, ctx: ToolContext) => Promise<unknown> }`
  - `interface ToolContext { db: any; userId: string }`
  - `handleRpc(body: unknown, ctx: ToolContext, tools: McpTool[]): Promise<object>`

- [ ] **Step 1: Escrever os testes**

```ts
// src/lib/mcp/protocol.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { handleRpc } from "@/lib/mcp/protocol";
import type { McpTool } from "@/lib/mcp/registry";

const ctx = { db: {} as any, userId: "u1" };

const tools: McpTool[] = [
  {
    name: "somar",
    description: "soma dois números",
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    handler: async ({ a, b }) => ({ total: a + b }),
  },
];

describe("handleRpc", () => {
  it("initialize devolve nome e versão do protocolo", async () => {
    const r: any = await handleRpc(
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      ctx,
      tools
    );
    expect(r.result.serverInfo.name).toBe("falow");
    expect(r.result.protocolVersion).toEqual(expect.any(String));
  });

  it("tools/list lista as tools registradas", async () => {
    const r: any = await handleRpc(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ctx,
      tools
    );
    expect(r.result.tools.map((t: any) => t.name)).toEqual(["somar"]);
  });

  it("tools/call executa a tool", async () => {
    const r: any = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "somar", arguments: { a: 2, b: 3 } },
      },
      ctx,
      tools
    );
    expect(r.result.structuredContent).toEqual({ total: 5 });
  });

  it("tool inexistente vira erro JSON-RPC, não exceção", async () => {
    const r: any = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "nao-existe", arguments: {} },
      },
      ctx,
      tools
    );
    expect(r.error.code).toBe(-32601);
  });

  it("argumento inválido volta como erro de tool legível", async () => {
    const r: any = await handleRpc(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "somar", arguments: { a: "dois" } },
      },
      ctx,
      tools
    );
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toEqual(expect.any(String));
  });

  it("método desconhecido vira -32601", async () => {
    const r: any = await handleRpc(
      { jsonrpc: "2.0", id: 6, method: "voar" },
      ctx,
      tools
    );
    expect(r.error.code).toBe(-32601);
  });

  it("corpo que não é objeto vira -32600, não 500", async () => {
    const r: any = await handleRpc("nada disso", ctx, tools);
    expect(r.error.code).toBe(-32600);
  });

  it("lote (array) é respondido item a item", async () => {
    const r: any = await handleRpc(
      [
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ],
      ctx,
      tools
    );
    expect(Array.isArray(r)).toBe(true);
    expect(r).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/protocol.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o registry**

```ts
// src/lib/mcp/registry.ts
import type { z } from "zod";

export interface ToolContext {
  /** Client Supabase agindo como o usuário dono do token. */
  db: any;
  userId: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (args: any, ctx: ToolContext) => Promise<unknown>;
}
```

- [ ] **Step 4: Implementar o protocolo**

```ts
// src/lib/mcp/protocol.ts
import { zodToJsonSchema } from "zod-to-json-schema";

import type { McpTool, ToolContext } from "@/lib/mcp/registry";

const PROTOCOL_VERSION = "2025-06-18";

function ok(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/** Resultado de tool no formato que o MCP espera: texto + dado estruturado. */
function toolOk(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    isError: false,
  };
}

function toolError(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function handleOne(
  body: any,
  ctx: ToolContext,
  tools: McpTool[]
): Promise<object> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(null, -32600, "Requisição JSON-RPC inválida.");
  }

  const { id, method, params } = body;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "falow", version: "1" },
    });
  }

  if (method === "tools/list") {
    return ok(id, {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.inputSchema),
      })),
    });
  }

  if (method === "tools/call") {
    const tool = tools.find((t) => t.name === params?.name);
    if (!tool) {
      return fail(id, -32601, `Não existe a ferramenta "${params?.name}".`);
    }

    const parsed = tool.inputSchema.safeParse(params?.arguments ?? {});
    if (!parsed.success) {
      // Erro de argumento volta como resultado de tool, não como erro de
      // protocolo: assim o modelo lê a mensagem e corrige sozinho.
      return ok(id, toolError(parsed.error.errors[0].message));
    }

    try {
      return ok(id, toolOk(await tool.handler(parsed.data, ctx)));
    } catch (e) {
      return ok(
        id,
        toolError(e instanceof Error ? e.message : "Falha ao executar.")
      );
    }
  }

  return fail(id, -32601, `Método não suportado: ${method}`);
}

export async function handleRpc(
  body: unknown,
  ctx: ToolContext,
  tools: McpTool[]
): Promise<object> {
  if (Array.isArray(body)) {
    return Promise.all(body.map((item) => handleOne(item, ctx, tools))) as any;
  }
  return handleOne(body, ctx, tools);
}
```

- [ ] **Step 5: Instalar a dependência do schema**

```bash
npm install zod-to-json-schema
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/protocol.test.ts && npx tsc --noEmit`
Expected: PASS (8 testes), tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp/registry.ts src/lib/mcp/protocol.ts src/lib/mcp/protocol.test.ts package.json package-lock.json
git commit -m "feat(mcp): camada JSON-RPC com initialize, tools/list e tools/call"
```

---

## Task 7: Extrair a escrita de regra para `src/lib/rules/save.ts`

Refactor da spec §7. **Sem mudança de comportamento** — os testes existentes provam isso.

**Files:**
- Create: `src/lib/rules/save.ts`
- Modify: `src/app/(dashboard)/rules/actions.ts`
- Test: `src/lib/rules/save.test.ts`

**Interfaces:**
- Produces:
  - `ruleSchema` (movido), `type RuleInput = z.input<typeof ruleSchema>`
  - `interface SaveResult { error?: string; id?: string; warning?: string }`
  - `saveRuleWith(db: any, raw: RuleInput): Promise<SaveResult>`

- [ ] **Step 1: Registrar o comportamento atual antes de mexer**

Run: `npm test`
Expected: 417/417 passando. Anotar o número — ele não pode cair.

- [ ] **Step 2: Escrever o teste da função extraída**

```ts
// src/lib/rules/save.test.ts
import { describe, expect, it } from "vitest";

import { saveRuleWith } from "@/lib/rules/save";
import { createFakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const ACCOUNT = "acc-1";

function base() {
  return {
    account_id: ACCOUNT,
    trigger_type: "dm" as const,
    keyword: "preço",
    match_type: "contains" as const,
    reply_type: "text" as const,
    reply_text: "segue o link",
    delay_seconds: 3,
    is_active: true,
  };
}

describe("saveRuleWith", () => {
  it("cria a automação e devolve o id", async () => {
    const db = createFakeSupabase({ ig_accounts: [{ id: ACCOUNT }], rules: [] });
    const r = await saveRuleWith(db, base());
    expect(r.id).toEqual(expect.any(String));
    expect(r.error).toBeUndefined();
  });

  it("recusa entrada inválida com mensagem em português", async () => {
    const db = createFakeSupabase({ ig_accounts: [{ id: ACCOUNT }], rules: [] });
    const r = await saveRuleWith(db, { ...base(), reply_text: "" });
    expect(r.error).toEqual(expect.any(String));
    expect(r.id).toBeUndefined();
  });

  it("avisa da colisão de palavra-chave sem bloquear o salvamento", async () => {
    const db = createFakeSupabase({
      ig_accounts: [{ id: ACCOUNT }],
      rules: [
        {
          id: "r-antiga",
          account_id: ACCOUNT,
          name: "antiga",
          trigger_type: "dm",
          keyword: "preço",
          is_active: true,
        },
      ],
    });
    const r = await saveRuleWith(db, base());
    expect(r.id).toEqual(expect.any(String));
    expect(r.warning).toContain("antiga");
  });

  it("usa o client recebido, não um client próprio", async () => {
    const db = createFakeSupabase({ ig_accounts: [{ id: ACCOUNT }], rules: [] });
    await saveRuleWith(db, base());
    expect(db.rowsOf("rules")).toHaveLength(1);
  });
});
```

> `createFakeSupabase` e `rowsOf` vêm da Task 5, Step 1.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/rules/save.test.ts`
Expected: FAIL — `saveRuleWith` não existe.

- [ ] **Step 4: Mover o código**

Recortar de `src/app/(dashboard)/rules/actions.ts` para `src/lib/rules/save.ts`, **sem alterar a lógica**: `buttonSchema`, `mediaRefSchema`, `ruleSchema`, `RuleInput`, `ConflictTarget`, `shareTerm`, `commentRulesOverlap`, `findConflictingRuleName`, a montagem de `row` e a função `write`.

A única mudança de assinatura:

```ts
// src/lib/rules/save.ts
export async function saveRuleWith(db: any, raw: RuleInput): Promise<SaveResult> {
  // ...corpo idêntico ao saveRule de hoje, trocando
  //    const supabase = createClient();
  // por
  //    const supabase = db;
}
```

- [ ] **Step 5: Encolher o server action**

```ts
// src/app/(dashboard)/rules/actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { saveRuleWith, type RuleInput, type SaveResult } from "@/lib/rules/save";
import { createClient } from "@/lib/supabase/server";

export type { RuleInput } from "@/lib/rules/save";
export type ActionResult = SaveResult;

export async function saveRule(raw: RuleInput): Promise<ActionResult> {
  const result = await saveRuleWith(createClient(), raw);
  if (!result.error) revalidatePath("/rules");
  return result;
}
```

> Reexportar `RuleInput` e `ActionResult` mantém os imports dos componentes
> funcionando sem tocar em nenhum deles.

- [ ] **Step 6: Provar que nada quebrou**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: **o mesmo número de testes de antes, mais os 4 novos**, tsc e build limpos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rules/save.ts src/lib/rules/save.test.ts "src/app/(dashboard)/rules/actions.ts"
git commit -m "refactor(rules): extrair validacao e escrita de regra para lib"
```

---

## Task 8: Tools de leitura de automação

Cobre o item 1 do Review Focus.

**Files:**
- Create: `src/lib/mcp/tools/rules.ts`
- Test: `src/lib/mcp/tools/rules.test.ts`

**Interfaces:**
- Consumes: `McpTool`, `ToolContext` (Task 6)
- Produces: `listarAutomacoes: McpTool`, `verAutomacao: McpTool`

- [ ] **Step 1: Escrever os testes**

```ts
// src/lib/mcp/tools/rules.test.ts
import { describe, expect, it } from "vitest";

import { listarAutomacoes, verAutomacao } from "@/lib/mcp/tools/rules";
import { createFakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const ACCOUNT = "acc-1";

function db() {
  return createFakeSupabase({
    ig_accounts: [{ id: ACCOUNT, ig_username: "matheus" }],
    rules: [
      {
        id: "r1",
        account_id: ACCOUNT,
        name: "preço",
        trigger_type: "dm",
        keyword: "preço",
        reply_type: "text",
        reply_text: "link",
        is_active: true,
        priority: 0,
      },
      {
        id: "r2",
        account_id: ACCOUNT,
        name: "desligada",
        trigger_type: "comment",
        keyword: "eu quero",
        reply_type: "text",
        reply_text: "oi",
        is_active: false,
        priority: 1,
      },
    ],
  });
}

const ctx = (d: any) => ({ db: d, userId: "u1" });

describe("listar_automacoes", () => {
  it("sem filtro, lista todas", async () => {
    const r: any = await listarAutomacoes.handler({}, ctx(db()));
    expect(r.automacoes).toHaveLength(2);
  });

  it("filtra por ativa", async () => {
    const r: any = await listarAutomacoes.handler({ ativa: true }, ctx(db()));
    expect(r.automacoes.map((a: any) => a.id)).toEqual(["r1"]);
  });

  it("filtra por tipo de gatilho", async () => {
    const r: any = await listarAutomacoes.handler(
      { tipo_gatilho: "comment" },
      ctx(db())
    );
    expect(r.automacoes.map((a: any) => a.id)).toEqual(["r2"]);
  });

  it("aceita 'true' em texto, porque é isso que o modelo manda", () => {
    expect(listarAutomacoes.inputSchema.parse({ ativa: "true" })).toEqual({
      ativa: true,
    });
  });

  it("aceita número em texto no limite", () => {
    expect(
      listarAutomacoes.inputSchema.parse({ ativa: "false" })
    ).toEqual({ ativa: false });
  });

  it("valor que não é booleano vira erro legível", () => {
    const r = listarAutomacoes.inputSchema.safeParse({ ativa: "talvez" });
    expect(r.success).toBe(false);
  });
});

describe("ver_automacao", () => {
  it("devolve a automação inteira", async () => {
    const r: any = await verAutomacao.handler({ id: "r1" }, ctx(db()));
    expect(r.automacao.keyword).toBe("preço");
  });

  it("id que não existe vira mensagem clara, não exceção", async () => {
    await expect(
      verAutomacao.handler({ id: "nao-existe" }, ctx(db()))
    ).rejects.toThrow(/não encontrei/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/tools/rules.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar, com coerção tolerante**

```ts
// src/lib/mcp/tools/rules.ts
import { z } from "zod";

import type { McpTool } from "@/lib/mcp/registry";

/**
 * Modelos mandam booleano como texto com frequência. Aceitar "true"/"false"
 * evita um turno inteiro de correção — e "talvez" continua sendo erro.
 */
const boolish = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((v) => v === true || v === "true");

const LISTA = [
  "id",
  "name",
  "trigger_type",
  "keyword",
  "match_type",
  "reply_type",
  "is_active",
  "priority",
].join(", ");

export const listarAutomacoes: McpTool = {
  name: "listar_automacoes",
  description:
    "Lista as automações de resposta da conta. Filtra por ativa e por tipo de gatilho (dm ou comment).",
  inputSchema: z.object({
    ativa: boolish.optional(),
    tipo_gatilho: z.enum(["dm", "comment"]).optional(),
  }),
  handler: async (args, { db }) => {
    let q = db.from("rules").select(LISTA).order("priority");
    if (args.ativa !== undefined) q = q.eq("is_active", args.ativa);
    if (args.tipo_gatilho) q = q.eq("trigger_type", args.tipo_gatilho);

    const { data, error } = await q;
    if (error) throw new Error("Não consegui ler as automações.");
    return { automacoes: data ?? [] };
  },
};

export const verAutomacao: McpTool = {
  name: "ver_automacao",
  description:
    "Mostra uma automação inteira: gatilho, textos, variantes, portão de seguidor e expiração.",
  inputSchema: z.object({ id: z.string().min(1) }),
  handler: async ({ id }, { db }) => {
    const { data, error } = await db
      .from("rules")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error("Não consegui ler a automação.");
    if (!data) throw new Error(`Não encontrei automação com o id ${id}.`);
    return { automacao: data };
  },
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/tools/rules.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tools/rules.ts src/lib/mcp/tools/rules.test.ts
git commit -m "feat(mcp): tools de leitura de automacao"
```

---

## Task 9: Tools de métricas e logs

**Files:**
- Create: `src/lib/mcp/tools/metrics.ts`
- Test: `src/lib/mcp/tools/metrics.test.ts`

**Interfaces:**
- Produces: `metricas: McpTool`, `logs: McpTool`

- [ ] **Step 1: Escrever os testes**

```ts
// src/lib/mcp/tools/metrics.test.ts
import { describe, expect, it } from "vitest";

import { logs, metricas } from "@/lib/mcp/tools/metrics";
import { createFakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const ACCOUNT = "acc-1";
const agora = new Date();
const ontem = new Date(agora.getTime() - 86_400_000).toISOString();

function db() {
  return createFakeSupabase({
    ig_accounts: [{ id: ACCOUNT, ig_username: "matheus" }],
    conversations: [
      { id: "c1", account_id: ACCOUNT, ig_sender_id: "s1" },
      { id: "c2", account_id: ACCOUNT, ig_sender_id: "s2" },
    ],
    interactions: [
      { id: "i1", account_id: ACCOUNT, status: "replied", created_at: ontem },
      { id: "i2", account_id: ACCOUNT, status: "replied", created_at: ontem },
      { id: "i3", account_id: ACCOUNT, status: "no_match", created_at: ontem },
      {
        id: "i4",
        account_id: ACCOUNT,
        status: "error",
        error_detail: "token expirado",
        created_at: ontem,
      },
    ],
  });
}

const ctx = (d: any) => ({ db: d, userId: "u1" });

describe("metricas", () => {
  it("conta recebidas, respondidas e contatos", async () => {
    const r: any = await metricas.handler({}, ctx(db()));
    expect(r.recebidas).toBe(4);
    expect(r.respondidas).toBe(2);
    expect(r.contatos).toBe(2);
  });

  it("calcula a taxa de acerto em porcentagem inteira", async () => {
    const r: any = await metricas.handler({}, ctx(db()));
    expect(r.taxa_de_acerto).toBe(50);
  });

  it("sem interação nenhuma, a taxa é zero e não NaN", async () => {
    const vazio = createFakeSupabase({
      ig_accounts: [{ id: ACCOUNT }],
      interactions: [],
      conversations: [],
    });
    const r: any = await metricas.handler({}, ctx(vazio));
    expect(r.taxa_de_acerto).toBe(0);
  });

  it("aceita dias como texto", () => {
    expect(metricas.inputSchema.parse({ dias: "7" })).toEqual({ dias: 7 });
  });

  it("recusa período absurdo", () => {
    expect(metricas.inputSchema.safeParse({ dias: 9999 }).success).toBe(false);
  });
});

describe("logs", () => {
  it("devolve as interações mais recentes", async () => {
    const r: any = await logs.handler({}, ctx(db()));
    expect(r.logs).toHaveLength(4);
  });

  it("filtra por status", async () => {
    const r: any = await logs.handler({ status: "error" }, ctx(db()));
    expect(r.logs.map((l: any) => l.id)).toEqual(["i4"]);
  });

  it("respeita o limite", async () => {
    const r: any = await logs.handler({ limite: 2 }, ctx(db()));
    expect(r.logs).toHaveLength(2);
  });

  it("limite acima do teto é recusado com mensagem", () => {
    expect(logs.inputSchema.safeParse({ limite: 5000 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/tools/metrics.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/mcp/tools/metrics.ts
import { z } from "zod";

import type { McpTool } from "@/lib/mcp/registry";

const numerish = (min: number, max: number) =>
  z
    .union([z.number(), z.string().regex(/^\d+$/)])
    .transform((v) => (typeof v === "number" ? v : Number(v)))
    .refine((n) => n >= min && n <= max, {
      message: `Informe um número entre ${min} e ${max}.`,
    });

const STATUS = [
  "replied",
  "no_match",
  "duplicate_skip",
  "window_expired",
  "error",
] as const;

function desde(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString();
}

export const metricas: McpTool = {
  name: "metricas",
  description:
    "Números do período: mensagens recebidas, respondidas, taxa de acerto e total de contatos.",
  inputSchema: z.object({ dias: numerish(1, 365).optional() }),
  handler: async (args, { db }) => {
    const dias = args.dias ?? 30;
    const inicio = desde(dias);

    const [recebidasRes, respondidasRes, contatosRes] = await Promise.all([
      db
        .from("interactions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", inicio),
      db
        .from("interactions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", inicio)
        .eq("status", "replied"),
      db.from("conversations").select("*", { count: "exact", head: true }),
    ]);

    const recebidas = recebidasRes.count ?? 0;
    const respondidas = respondidasRes.count ?? 0;

    return {
      periodo_em_dias: dias,
      recebidas,
      respondidas,
      taxa_de_acerto:
        recebidas > 0 ? Math.round((respondidas / recebidas) * 100) : 0,
      contatos: contatosRes.count ?? 0,
    };
  },
};

export const logs: McpTool = {
  name: "logs",
  description:
    "Histórico de mensagens recebidas e o que o Falow fez com cada uma. Serve para descobrir por que uma automação não respondeu.",
  inputSchema: z.object({
    status: z.enum(STATUS).optional(),
    dias: numerish(1, 365).optional(),
    automacao_id: z.string().optional(),
    limite: numerish(1, 200).optional(),
  }),
  handler: async (args, { db }) => {
    let q = db
      .from("interactions")
      .select(
        "id, created_at, status, message_text, matched_rule_id, matched_keyword, reply_type, error_detail, latency_ms"
      )
      .order("created_at", { ascending: false })
      .limit(args.limite ?? 50);

    if (args.status) q = q.eq("status", args.status);
    if (args.automacao_id) q = q.eq("matched_rule_id", args.automacao_id);
    if (args.dias) q = q.gte("created_at", desde(args.dias));

    const { data, error } = await q;
    if (error) throw new Error("Não consegui ler os logs.");
    return { logs: data ?? [] };
  },
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/tools/metrics.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tools/metrics.ts src/lib/mcp/tools/metrics.test.ts
git commit -m "feat(mcp): tools de metricas e logs"
```

---

## Task 10: Tools de contatos e contas conectadas

**Files:**
- Create: `src/lib/mcp/tools/contacts.ts`
- Test: `src/lib/mcp/tools/contacts.test.ts`

**Interfaces:**
- Produces: `listarContatos: McpTool`, `buscarContato: McpTool`, `contasConectadas: McpTool`

- [ ] **Step 1: Escrever os testes**

```ts
// src/lib/mcp/tools/contacts.test.ts
import { describe, expect, it } from "vitest";

import {
  buscarContato,
  contasConectadas,
  listarContatos,
} from "@/lib/mcp/tools/contacts";
import { createFakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const ACCOUNT = "acc-1";

function db() {
  return createFakeSupabase({
    ig_accounts: [
      {
        id: ACCOUNT,
        ig_username: "matheus",
        status: "active",
        token_expires_at: "2027-01-01T00:00:00.000Z",
      },
    ],
    contacts: [
      {
        id: "ct1",
        account_id: ACCOUNT,
        ig_sender_id: "s1",
        ig_username: "joao",
        fields: { email: "joao@ex.com" },
        tags: ["lead"],
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    ],
  });
}

const ctx = (d: any) => ({ db: d, userId: "u1" });

describe("listar_contatos", () => {
  it("devolve os contatos com os campos coletados", async () => {
    const r: any = await listarContatos.handler({}, ctx(db()));
    expect(r.contatos[0].fields).toEqual({ email: "joao@ex.com" });
  });

  it("limite acima do teto é recusado", () => {
    expect(listarContatos.inputSchema.safeParse({ limite: 9999 }).success).toBe(
      false
    );
  });
});

describe("buscar_contato", () => {
  it("acha pelo username", async () => {
    const r: any = await buscarContato.handler({ username: "joao" }, ctx(db()));
    expect(r.contato.ig_username).toBe("joao");
  });

  it("username que não existe vira mensagem clara", async () => {
    await expect(
      buscarContato.handler({ username: "ninguem" }, ctx(db()))
    ).rejects.toThrow(/não encontrei/i);
  });

  it("exige username ou ig_sender_id", () => {
    expect(buscarContato.inputSchema.safeParse({}).success).toBe(false);
  });
});

describe("contas_conectadas", () => {
  it("mostra username, status e validade do token", async () => {
    const r: any = await contasConectadas.handler({}, ctx(db()));
    expect(r.contas[0]).toMatchObject({
      ig_username: "matheus",
      status: "active",
    });
  });

  it("sem conta nenhuma, diz isso em vez de devolver lista vazia sem contexto", async () => {
    const vazio = createFakeSupabase({ ig_accounts: [] });
    const r: any = await contasConectadas.handler({}, ctx(vazio));
    expect(r.contas).toHaveLength(0);
    expect(r.aviso).toMatch(/nenhuma conta/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/tools/contacts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/mcp/tools/contacts.ts
import { z } from "zod";

import type { McpTool } from "@/lib/mcp/registry";

const limite = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .transform((v) => (typeof v === "number" ? v : Number(v)))
  .refine((n) => n >= 1 && n <= 200, {
    message: "Informe um limite entre 1 e 200.",
  });

export const listarContatos: McpTool = {
  name: "listar_contatos",
  description:
    "Lista as pessoas que já conversaram, com os campos coletados e as etiquetas.",
  inputSchema: z.object({ limite: limite.optional() }),
  handler: async (args, { db }) => {
    const { data, error } = await db
      .from("contacts")
      .select("ig_username, ig_sender_id, fields, tags, updated_at")
      .order("updated_at", { ascending: false })
      .limit(args.limite ?? 50);

    if (error) throw new Error("Não consegui ler os contatos.");
    return { contatos: data ?? [] };
  },
};

export const buscarContato: McpTool = {
  name: "buscar_contato",
  description:
    "Acha uma pessoa pelo @ do Instagram ou pelo id do remetente, e mostra o que foi coletado dela.",
  inputSchema: z
    .object({
      username: z.string().min(1).optional(),
      ig_sender_id: z.string().min(1).optional(),
    })
    .refine((v) => v.username || v.ig_sender_id, {
      message: "Informe o username ou o ig_sender_id.",
    }),
  handler: async (args, { db }) => {
    let q = db
      .from("contacts")
      .select("ig_username, ig_sender_id, fields, tags, updated_at");

    q = args.username
      ? q.eq("ig_username", args.username)
      : q.eq("ig_sender_id", args.ig_sender_id);

    const { data, error } = await q.maybeSingle();
    if (error) throw new Error("Não consegui buscar o contato.");
    if (!data) {
      throw new Error(
        `Não encontrei contato com ${args.username ?? args.ig_sender_id}.`
      );
    }
    return { contato: data };
  },
};

export const contasConectadas: McpTool = {
  name: "contas_conectadas",
  description:
    "Mostra as contas do Instagram ligadas ao Falow, o status de cada uma e quando o token expira.",
  inputSchema: z.object({}),
  handler: async (_args, { db }) => {
    const { data, error } = await db
      .from("ig_accounts")
      .select("ig_username, status, token_expires_at, connected_at");

    if (error) throw new Error("Não consegui ler as contas conectadas.");
    const contas = data ?? [];
    if (contas.length === 0) {
      return {
        contas,
        aviso:
          "Nenhuma conta do Instagram conectada. Conecte uma no painel, em Contas, antes de criar automações.",
      };
    }
    return { contas };
  },
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/tools/contacts.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tools/contacts.ts src/lib/mcp/tools/contacts.test.ts
git commit -m "feat(mcp): tools de contatos e contas conectadas"
```

---

## Task 11: Tools de escrita de automação

Cobre o item 4 do Review Focus. Decisão D3: escreve ativa e direto.

**Files:**
- Modify: `src/lib/mcp/tools/rules.ts`
- Modify: `src/lib/mcp/tools/rules.test.ts`

**Interfaces:**
- Consumes: `saveRuleWith`, `ruleSchema` (Task 7)
- Produces: `criarAutomacao`, `editarAutomacao`, `ligarDesligarAutomacao`, `apagarAutomacao`, `duplicarAutomacao` — todas `McpTool`

- [ ] **Step 1: Escrever os testes**

```ts
// acrescentar em src/lib/mcp/tools/rules.test.ts
import {
  apagarAutomacao,
  criarAutomacao,
  ligarDesligarAutomacao,
} from "@/lib/mcp/tools/rules";

const NOVA = {
  account_id: ACCOUNT,
  trigger_type: "dm",
  keyword: "curso",
  match_type: "contains",
  reply_type: "text",
  reply_text: "segue o link do curso",
  delay_seconds: 3,
};

describe("criar_automacao", () => {
  it("cria e devolve o link do painel", async () => {
    const r: any = await criarAutomacao.handler(NOVA, ctx(db()));
    expect(r.id).toEqual(expect.any(String));
    expect(r.link).toContain("/rules/");
  });

  it("nasce ativa, conforme a decisão de produto", async () => {
    const d = db();
    await criarAutomacao.handler(NOVA, ctx(d));
    const criada = d.rowsOf("rules").find((r: any) => r.keyword === "curso");
    expect(criada.is_active).toBe(true);
  });

  it("sem conta conectada, explica o que fazer em vez de falhar no banco", async () => {
    const vazio = createFakeSupabase({ ig_accounts: [], rules: [] });
    await expect(criarAutomacao.handler(NOVA, ctx(vazio))).rejects.toThrow(
      /nenhuma conta/i
    );
  });

  it("repassa o aviso de colisão sem impedir a criação", async () => {
    const r: any = await criarAutomacao.handler(
      { ...NOVA, keyword: "preço" },
      ctx(db())
    );
    expect(r.id).toEqual(expect.any(String));
    expect(r.aviso).toEqual(expect.any(String));
  });
});

describe("ligar_desligar_automacao", () => {
  it("desliga a automação", async () => {
    const d = db();
    await ligarDesligarAutomacao.handler({ id: "r1", ativa: false }, ctx(d));
    expect(d.rowsOf("rules").find((r: any) => r.id === "r1").is_active).toBe(
      false
    );
  });

  it("aceita ativa como texto", () => {
    expect(
      ligarDesligarAutomacao.inputSchema.parse({ id: "r1", ativa: "false" })
    ).toEqual({ id: "r1", ativa: false });
  });
});

describe("apagar_automacao", () => {
  it("apaga de verdade", async () => {
    const d = db();
    await apagarAutomacao.handler({ id: "r1" }, ctx(d));
    expect(d.rowsOf("rules").map((r: any) => r.id)).toEqual(["r2"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/tools/rules.test.ts`
Expected: FAIL nas novas.

- [ ] **Step 3: Implementar**

```ts
// acrescentar em src/lib/mcp/tools/rules.ts
import { ruleSchema, saveRuleWith } from "@/lib/rules/save";

function linkDo(id: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/rules/${id}/editar`;
}

/** Resolve a conta quando o modelo não informa — a instalação tem poucas. */
async function contaPadrao(db: any): Promise<string> {
  const { data } = await db.from("ig_accounts").select("id").limit(1);
  const conta = (data ?? [])[0];
  if (!conta) {
    throw new Error(
      "Nenhuma conta do Instagram conectada. Conecte uma no painel, em Contas, antes de criar automações."
    );
  }
  return conta.id;
}

export const criarAutomacao: McpTool = {
  name: "criar_automacao",
  description:
    "Cria uma automação de resposta. Ela já fica ativa e passa a responder assim que salva.",
  inputSchema: ruleSchema.omit({ id: true, account_id: true }).extend({
    account_id: z.string().optional(),
  }),
  handler: async (args, { db }) => {
    const account_id = args.account_id ?? (await contaPadrao(db));
    const r = await saveRuleWith(db, { ...args, account_id, is_active: true });
    if (r.error) throw new Error(r.error);
    return { id: r.id, link: linkDo(r.id!), aviso: r.warning };
  },
};

export const editarAutomacao: McpTool = {
  name: "editar_automacao",
  description:
    "Edita uma automação que já existe. A mudança vale na hora, para quem mandar mensagem depois.",
  inputSchema: ruleSchema.extend({ id: z.string().min(1) }),
  handler: async (args, { db }) => {
    const r = await saveRuleWith(db, args);
    if (r.error) throw new Error(r.error);
    return { id: r.id, link: linkDo(r.id!), aviso: r.warning };
  },
};

export const ligarDesligarAutomacao: McpTool = {
  name: "ligar_desligar_automacao",
  description: "Liga ou desliga uma automação sem apagar nada.",
  inputSchema: z.object({ id: z.string().min(1), ativa: boolish }),
  handler: async ({ id, ativa }, { db }) => {
    const { error } = await db
      .from("rules")
      .update({ is_active: ativa, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error("Não consegui mudar o estado da automação.");
    return { id, ativa, link: linkDo(id) };
  },
};

export const apagarAutomacao: McpTool = {
  name: "apagar_automacao",
  description: "Apaga uma automação. Não tem desfazer.",
  inputSchema: z.object({ id: z.string().min(1) }),
  handler: async ({ id }, { db }) => {
    const { error } = await db.from("rules").delete().eq("id", id);
    if (error) throw new Error("Não consegui apagar a automação.");
    return { id, apagada: true };
  },
};

export const duplicarAutomacao: McpTool = {
  name: "duplicar_automacao",
  description: "Duplica uma automação existente, com o mesmo conteúdo.",
  inputSchema: z.object({ id: z.string().min(1) }),
  handler: async ({ id }, { db }) => {
    const { data, error } = await db
      .from("rules")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) throw new Error(`Não encontrei automação com o id ${id}.`);

    const { id: _antigo, created_at, updated_at, ...resto } = data;
    const r = await saveRuleWith(db, {
      ...resto,
      name: `${data.name ?? "Automação"} (cópia)`,
    });
    if (r.error) throw new Error(r.error);
    return { id: r.id, link: linkDo(r.id!) };
  },
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/tools/rules.test.ts && npx tsc --noEmit`
Expected: PASS, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tools/rules.ts src/lib/mcp/tools/rules.test.ts
git commit -m "feat(mcp): tools de escrita de automacao"
```

---

## Task 12: Auditoria e rate limit

**Files:**
- Create: `src/lib/mcp/audit.ts`
- Test: `src/lib/mcp/audit.test.ts`

**Interfaces:**
- Produces:
  - `registrarChamada(db, entry): Promise<void>` com `entry = { tokenId, userId, tool, ok, durationMs }`
  - `dentroDoLimite(db, tokenId): Promise<boolean>`
  - `LIMITE_POR_MINUTO = 60`

- [ ] **Step 1: Escrever os testes**

```ts
// src/lib/mcp/audit.test.ts
import { describe, expect, it } from "vitest";

import { LIMITE_POR_MINUTO, dentroDoLimite, registrarChamada } from "@/lib/mcp/audit";
import { createFakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const TOKEN = "tok-1";
const USER = "u1";

describe("registrarChamada", () => {
  it("grava a chamada", async () => {
    const db = createFakeSupabase({ mcp_calls: [] });
    await registrarChamada(db, {
      tokenId: TOKEN,
      userId: USER,
      tool: "metricas",
      ok: true,
      durationMs: 12,
    });
    expect(db.rowsOf("mcp_calls")).toHaveLength(1);
  });

  it("falha ao gravar não derruba a chamada da tool", async () => {
    const db = createFakeSupabase({ mcp_calls: [] });
    db.failNextWith({ code: "PGRST205", message: "sem tabela" });
    await expect(
      registrarChamada(db, {
        tokenId: TOKEN,
        userId: USER,
        tool: "metricas",
        ok: true,
        durationMs: 12,
      })
    ).resolves.toBeUndefined();
  });
});

describe("dentroDoLimite", () => {
  it("passa quando há poucas chamadas", async () => {
    const db = createFakeSupabase({ mcp_calls: [] });
    expect(await dentroDoLimite(db, TOKEN)).toBe(true);
  });

  it("barra quando estoura o teto por minuto", async () => {
    const agora = new Date().toISOString();
    const db = createFakeSupabase({
      mcp_calls: Array.from({ length: LIMITE_POR_MINUTO }, (_, i) => ({
        id: `c${i}`,
        token_id: TOKEN,
        user_id: USER,
        tool: "metricas",
        ok: true,
        created_at: agora,
      })),
    });
    expect(await dentroDoLimite(db, TOKEN)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/audit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/mcp/audit.ts
export const LIMITE_POR_MINUTO = 60;

export interface ChamadaMcp {
  tokenId: string | null;
  userId: string;
  tool: string;
  ok: boolean;
  durationMs: number;
}

/**
 * Auditoria nunca pode derrubar a chamada: se a gravação falhar, engole.
 * Mesmo princípio do histórico de versões de sequência.
 */
export async function registrarChamada(
  db: any,
  entry: ChamadaMcp
): Promise<void> {
  try {
    await db.from("mcp_calls").insert({
      token_id: entry.tokenId,
      user_id: entry.userId,
      tool: entry.tool,
      ok: entry.ok,
      duration_ms: entry.durationMs,
    });
  } catch {
    // silêncio proposital
  }
}

export async function dentroDoLimite(
  db: any,
  tokenId: string
): Promise<boolean> {
  const desde = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await db
    .from("mcp_calls")
    .select("*", { count: "exact", head: true })
    .eq("token_id", tokenId)
    .gte("created_at", desde);

  if (error) return true; // sem a tabela, não bloquear o produto
  return (count ?? 0) < LIMITE_POR_MINUTO;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/audit.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/audit.ts src/lib/mcp/audit.test.ts
git commit -m "feat(mcp): auditoria de chamadas e rate limit por token"
```

---

## Task 13: A rota `/api/mcp`

Junta tudo. É aqui que o teste de isolamento entre usuários vive.

**Files:**
- Create: `src/app/api/mcp/route.ts`, `src/lib/mcp/tools/index.ts`
- Test: `src/lib/mcp/handler.test.ts`
- Create: `src/lib/mcp/handler.ts` (lógica testável, separada do wrapper HTTP)

**Interfaces:**
- Consumes: `authenticate` (5), `clientForUser` (2), `handleRpc` (6), tools (8–11), `audit` (12)
- Produces: `handleMcpRequest(deps, headers, body): Promise<{ status: number; body: unknown }>`

- [ ] **Step 1: Escrever os testes, incluindo o de isolamento**

```ts
// src/lib/mcp/handler.test.ts
import { describe, expect, it } from "vitest";

import { handleMcpRequest } from "@/lib/mcp/handler";
import { hashToken } from "@/lib/mcp/token";
import { createFakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const RAW_A = "falow_aaaa_segredo";
const RAW_B = "falow_bbbb_segredo";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

function tokens() {
  const futuro = new Date(Date.now() + 86_400_000).toISOString();
  return createFakeSupabase({
    mcp_tokens: [
      { id: "t-a", user_id: USER_A, token_hash: hashToken(RAW_A), prefix: "falow_aaaa", expires_at: futuro, revoked_at: null },
      { id: "t-b", user_id: USER_B, token_hash: hashToken(RAW_B), prefix: "falow_bbbb", expires_at: futuro, revoked_at: null },
    ],
    mcp_calls: [],
  });
}

/** Cada usuário só enxerga as próprias regras — é o fake imitando a RLS. */
function dbDoUsuario(userId: string) {
  const porUsuario: Record<string, any[]> = {
    [USER_A]: [{ id: "ra", account_id: "acc-a", name: "do A", trigger_type: "dm", is_active: true, priority: 0 }],
    [USER_B]: [{ id: "rb", account_id: "acc-b", name: "do B", trigger_type: "dm", is_active: true, priority: 0 }],
  };
  return createFakeSupabase({ rules: porUsuario[userId] ?? [] });
}

const deps = { admin: tokens(), clientForUser: dbDoUsuario };

const listar = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "listar_automacoes", arguments: {} },
};

describe("handleMcpRequest", () => {
  it("sem header de autorização devolve 401", async () => {
    const r = await handleMcpRequest(deps, new Headers(), listar);
    expect(r.status).toBe(401);
  });

  it("token inválido devolve 401", async () => {
    const r = await handleMcpRequest(
      deps,
      new Headers({ authorization: "Bearer falow_zzzz_nao" }),
      listar
    );
    expect(r.status).toBe(401);
  });

  it("token válido responde 200", async () => {
    const r = await handleMcpRequest(
      deps,
      new Headers({ authorization: `Bearer ${RAW_A}` }),
      listar
    );
    expect(r.status).toBe(200);
  });

  it("ISOLAMENTO: o token do A só enxerga automação do A", async () => {
    const r: any = await handleMcpRequest(
      deps,
      new Headers({ authorization: `Bearer ${RAW_A}` }),
      listar
    );
    const nomes = r.body.result.structuredContent.automacoes.map(
      (a: any) => a.name
    );
    expect(nomes).toEqual(["do A"]);
    expect(nomes).not.toContain("do B");
  });

  it("ISOLAMENTO: o token do B só enxerga automação do B", async () => {
    const r: any = await handleMcpRequest(
      deps,
      new Headers({ authorization: `Bearer ${RAW_B}` }),
      listar
    );
    expect(
      r.body.result.structuredContent.automacoes.map((a: any) => a.name)
    ).toEqual(["do B"]);
  });

  it("initialize funciona com token válido", async () => {
    const r: any = await handleMcpRequest(
      deps,
      new Headers({ authorization: `Bearer ${RAW_A}` }),
      { jsonrpc: "2.0", id: 9, method: "initialize" }
    );
    expect(r.body.result.serverInfo.name).toBe("falow");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/handler.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o índice de tools**

```ts
// src/lib/mcp/tools/index.ts
import {
  buscarContato,
  contasConectadas,
  listarContatos,
} from "@/lib/mcp/tools/contacts";
import { logs, metricas } from "@/lib/mcp/tools/metrics";
import {
  apagarAutomacao,
  criarAutomacao,
  duplicarAutomacao,
  editarAutomacao,
  ligarDesligarAutomacao,
  listarAutomacoes,
  verAutomacao,
} from "@/lib/mcp/tools/rules";
import type { McpTool } from "@/lib/mcp/registry";

export const TOOLS: McpTool[] = [
  listarAutomacoes,
  verAutomacao,
  criarAutomacao,
  editarAutomacao,
  ligarDesligarAutomacao,
  apagarAutomacao,
  duplicarAutomacao,
  metricas,
  logs,
  listarContatos,
  buscarContato,
  contasConectadas,
];
```

- [ ] **Step 4: Implementar o handler**

```ts
// src/lib/mcp/handler.ts
import { authenticate } from "@/lib/mcp/auth";
import { dentroDoLimite, registrarChamada } from "@/lib/mcp/audit";
import { handleRpc } from "@/lib/mcp/protocol";
import { bearerFrom } from "@/lib/mcp/token";
import { TOOLS } from "@/lib/mcp/tools";

export interface McpDeps {
  /** Client service role: lê mcp_tokens antes de existir identidade. */
  admin: any;
  /** Client agindo como o usuário: é ele que passa pela RLS. */
  clientForUser: (userId: string) => any;
}

export async function handleMcpRequest(
  deps: McpDeps,
  headers: Headers,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const raw = bearerFrom(headers.get("authorization"));
  if (!raw) {
    return { status: 401, body: { error: "Falta o token do MCP." } };
  }

  const auth = await authenticate(deps.admin, raw);
  if ("error" in auth) {
    return { status: auth.unavailable ? 503 : 401, body: { error: auth.error } };
  }

  if (!(await dentroDoLimite(deps.admin, auth.tokenId))) {
    return {
      status: 429,
      body: { error: "Muitas chamadas seguidas. Tente de novo em um minuto." },
    };
  }

  const inicio = Date.now();
  const db = deps.clientForUser(auth.userId);
  const resposta = await handleRpc(body, { db, userId: auth.userId }, TOOLS);

  const nome =
    typeof body === "object" && body && "params" in (body as any)
      ? (body as any).params?.name ?? (body as any).method
      : "desconhecida";

  await registrarChamada(deps.admin, {
    tokenId: auth.tokenId,
    userId: auth.userId,
    tool: String(nome),
    ok: !(resposta as any)?.error,
    durationMs: Date.now() - inicio,
  });

  // last_used_at é conveniência do dono: falhar aqui não pode derrubar nada.
  await deps.admin
    .from("mcp_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", auth.tokenId);

  return { status: 200, body: resposta };
}
```

- [ ] **Step 5: Implementar a rota, fina**

```ts
// src/app/api/mcp/route.ts
import { handleMcpRequest } from "@/lib/mcp/handler";
import { clientForUser } from "@/lib/mcp/identity";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } },
      { status: 400 }
    );
  }

  const { status, body: out } = await handleMcpRequest(
    { admin: createAdminClient(), clientForUser },
    request.headers,
    body
  );

  return Response.json(out, { status });
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/handler.test.ts && npm test && npx tsc --noEmit && npm run build && npm run build:cloudflare`
Expected: tudo limpo, incluindo o build do Worker.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp/handler.ts src/lib/mcp/handler.test.ts src/lib/mcp/tools/index.ts src/app/api/mcp/route.ts
git commit -m "feat(mcp): rota /api/mcp com isolamento por usuario"
```

---

## Task 14: Tela de tokens no painel

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx` — **a rota não existe ainda.** O painel hoje tem só `accounts`, `contatos`, `dashboard`, `logs` e `rules`
- Create: `src/app/(dashboard)/settings/mcp-actions.ts`
- Create: `src/components/settings/mcp-tokens.tsx` — **a pasta `src/components/settings/` também não existe**
- Modify: a navegação em `src/app/(dashboard)/layout.tsx`, para o item "Configurações" aparecer

**Interfaces:**
- Consumes: `generateToken` (Task 4)
- Produces: server actions `criarTokenMcp(nome, dias)`, `revogarTokenMcp(id)`, `listarTokensMcp()`

- [ ] **Step 1: Escrever as actions**

```ts
// src/app/(dashboard)/settings/mcp-actions.ts
"use server";

import { revalidatePath } from "next/cache";

import { generateToken } from "@/lib/mcp/token";
import { createClient } from "@/lib/supabase/server";

const DIAS_PADRAO = 90;

export async function criarTokenMcp(nome: string, dias = DIAS_PADRAO) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Faça login de novo." };
  if (!nome.trim()) return { error: "Dê um nome pro token." };

  const { raw, hash, prefix } = generateToken();
  const expires_at = new Date(Date.now() + dias * 86_400_000).toISOString();

  const { error } = await supabase.from("mcp_tokens").insert({
    user_id: user.id,
    name: nome.trim(),
    token_hash: hash,
    prefix,
    expires_at,
  });
  if (error) return { error: "Não consegui criar o token." };

  revalidatePath("/settings");
  // Única vez que o segredo existe fora do cliente MCP.
  return { token: raw, expires_at };
}

export async function revogarTokenMcp(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Não consegui revogar o token." };
  revalidatePath("/settings");
  return {};
}

export async function listarTokensMcp() {
  const supabase = createClient();
  const { data } = await supabase
    .from("mcp_tokens")
    .select("id, name, prefix, expires_at, revoked_at, last_used_at, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}
```

- [ ] **Step 2: Criar a rota de Configurações**

```tsx
// src/app/(dashboard)/settings/page.tsx
import { McpTokens } from "@/components/settings/mcp-tokens";

import { listarTokensMcp } from "./mcp-actions";

export default async function SettingsPage() {
  const tokens = await listarTokensMcp();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-muted-foreground">
          Conecte o Falow ao seu Claude, ChatGPT ou Claude Code.
        </p>
      </div>
      <McpTokens tokens={tokens} />
    </div>
  );
}
```

Acrescentar "Configurações" à navegação em `src/app/(dashboard)/layout.tsx`, seguindo exatamente o formato dos itens que já estão lá.

- [ ] **Step 3: Montar o componente**

`src/components/settings/mcp-tokens.tsx` — client component, recebendo `tokens` por prop. Conteúdo:

- Tabela com nome, prefixo, criado em, último uso, validade e botão **Revogar** por linha (token revogado aparece riscado e sem botão).
- Formulário de criação: campo de nome e select de validade (30 / 90 / 365 dias).
- Ao criar, abrir um `Dialog` mostrando o token **uma única vez**, num bloco copiável, com o aviso "isso não aparece de novo" e o trecho pronto:

```
claude mcp add --transport http falow <URL_DA_INSTALACAO>/api/mcp \
  --header "Authorization: Bearer <TOKEN>"
```

Usar os componentes já existentes em `src/components/ui/` (Dialog, Button, Input, Select) e o padrão visual das telas de `rules` e `accounts`.

- [ ] **Step 4: Verificar manualmente**

Run: `npm run dev`
Conferir: criar token mostra o segredo uma vez; recarregar a página não mostra mais; revogar risca a linha; o token revogado passa a devolver 401 em `/api/mcp`.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings "src/app/(dashboard)/settings" "src/app/(dashboard)/layout.tsx"
git commit -m "feat(mcp): tela de criar e revogar token no painel"
```

---

## Task 15: OAuth 2.1 — metadata e registro de cliente

**Files:**
- Create: `src/app/.well-known/oauth-protected-resource/route.ts`
- Create: `src/app/.well-known/oauth-authorization-server/route.ts`
- Create: `src/app/api/mcp/register/route.ts`
- Test: `src/lib/mcp/oauth.test.ts`
- Create: `src/lib/mcp/oauth.ts`

**Interfaces:**
- Produces:
  - `metadataDoRecurso(baseUrl): object`
  - `metadataDoServidor(baseUrl): object`
  - `registrarCliente(db, body): Promise<{ client_id: string } | { error: string }>`

- [ ] **Step 1: Escrever os testes**

```ts
// src/lib/mcp/oauth.test.ts
import { describe, expect, it } from "vitest";

import {
  metadataDoRecurso,
  metadataDoServidor,
  registrarCliente,
} from "@/lib/mcp/oauth";
import { createFakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const BASE = "https://falow.exemplo.com";

describe("metadata", () => {
  it("o recurso aponta pro próprio servidor de autorização", () => {
    expect(metadataDoRecurso(BASE).authorization_servers).toEqual([BASE]);
  });

  it("o servidor anuncia os endpoints e o PKCE S256", () => {
    const m: any = metadataDoServidor(BASE);
    expect(m.authorization_endpoint).toBe(`${BASE}/api/mcp/authorize`);
    expect(m.token_endpoint).toBe(`${BASE}/api/mcp/token`);
    expect(m.registration_endpoint).toBe(`${BASE}/api/mcp/register`);
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
  });
});

describe("registrarCliente", () => {
  it("cria o cliente e devolve o client_id", async () => {
    const db = createFakeSupabase({ mcp_oauth_clients: [] });
    const r: any = await registrarCliente(db, {
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    expect(r.client_id).toEqual(expect.any(String));
  });

  it("sem redirect_uri não registra", async () => {
    const db = createFakeSupabase({ mcp_oauth_clients: [] });
    const r: any = await registrarCliente(db, { client_name: "Claude" });
    expect(r.error).toEqual(expect.any(String));
  });

  it("recusa redirect_uri que não é https", async () => {
    const db = createFakeSupabase({ mcp_oauth_clients: [] });
    const r: any = await registrarCliente(db, {
      client_name: "X",
      redirect_uris: ["http://malicioso.exemplo/cb"],
    });
    expect(r.error).toEqual(expect.any(String));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/oauth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/mcp/oauth.ts
import { randomUUID } from "node:crypto";

export function metadataDoRecurso(baseUrl: string) {
  return {
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
  };
}

export function metadataDoServidor(baseUrl: string) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/mcp/authorize`,
    token_endpoint: `${baseUrl}/api/mcp/token`,
    registration_endpoint: `${baseUrl}/api/mcp/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

export async function registrarCliente(db: any, body: any) {
  const uris: string[] = body?.redirect_uris ?? [];
  if (uris.length === 0) {
    return { error: "Informe pelo menos um redirect_uri." };
  }
  // localhost é exceção legítima: cliente MCP rodando na máquina de quem usa.
  const invalida = uris.find(
    (u) => !u.startsWith("https://") && !u.startsWith("http://localhost")
  );
  if (invalida) return { error: "redirect_uri precisa ser https." };

  const client_id = randomUUID();
  const { error } = await db.from("mcp_oauth_clients").insert({
    client_id,
    client_name: body?.client_name ?? null,
    redirect_uris: uris,
  });
  if (error) return { error: "Não consegui registrar o cliente." };

  return { client_id, redirect_uris: uris, token_endpoint_auth_method: "none" };
}
```

- [ ] **Step 4: As três rotas**

```ts
// src/app/.well-known/oauth-protected-resource/route.ts
import { metadataDoRecurso } from "@/lib/mcp/oauth";

export function GET() {
  return Response.json(metadataDoRecurso(process.env.NEXT_PUBLIC_APP_URL!));
}
```

```ts
// src/app/.well-known/oauth-authorization-server/route.ts
import { metadataDoServidor } from "@/lib/mcp/oauth";

export function GET() {
  return Response.json(metadataDoServidor(process.env.NEXT_PUBLIC_APP_URL!));
}
```

```ts
// src/app/api/mcp/register/route.ts
import { registrarCliente } from "@/lib/mcp/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const r = await registrarCliente(createAdminClient(), body);
  return Response.json(r, { status: "error" in r ? 400 : 201 });
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/oauth.test.ts && npx tsc --noEmit`
Expected: PASS (5 testes), tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mcp/oauth.ts src/lib/mcp/oauth.test.ts "src/app/.well-known" src/app/api/mcp/register
git commit -m "feat(mcp): metadata oauth e registro dinamico de cliente"
```

---

## Task 16: OAuth 2.1 — authorize e token

**Files:**
- Create: `src/app/api/mcp/authorize/route.ts`
- Create: `src/app/(dashboard)/mcp/autorizar/page.tsx` e `src/app/(dashboard)/mcp/autorizar/actions.ts`
- Create: `src/app/api/mcp/token/route.ts`
- Modify: `src/lib/mcp/oauth.ts`, `src/lib/mcp/oauth.test.ts`

**Interfaces:**
- Produces:
  - `verificarPkce(verifier: string, challenge: string): boolean`
  - `trocarCodigo(db, params): Promise<{ access_token: string; expires_in: number } | { error: string }>`

- [ ] **Step 1: Escrever os testes**

```ts
// acrescentar em src/lib/mcp/oauth.test.ts
import { createHash } from "node:crypto";

import { trocarCodigo, verificarPkce } from "@/lib/mcp/oauth";
import { createFakeSupabase } from "@/lib/sequences/__tests__/fake-supabase";

const VERIFIER = "verificador-de-teste-com-tamanho-bom-aqui-12345";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

describe("verificarPkce", () => {
  it("aceita o verificador certo", () => {
    expect(verificarPkce(VERIFIER, CHALLENGE)).toBe(true);
  });

  it("recusa verificador errado", () => {
    expect(verificarPkce("outro-qualquer", CHALLENGE)).toBe(false);
  });
});

describe("trocarCodigo", () => {
  function dbComCodigo(over: Record<string, unknown> = {}) {
    return createFakeSupabase({
      mcp_oauth_codes: [
        {
          code: "cod-1",
          client_id: "cli-1",
          user_id: "u1",
          redirect_uri: "https://claude.ai/cb",
          code_challenge: CHALLENGE,
          code_challenge_method: "S256",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          used_at: null,
          ...over,
        },
      ],
      mcp_tokens: [],
    });
  }

  it("troca o código por um token utilizável", async () => {
    const r: any = await trocarCodigo(dbComCodigo(), {
      code: "cod-1",
      code_verifier: VERIFIER,
      redirect_uri: "https://claude.ai/cb",
      client_id: "cli-1",
    });
    expect(r.access_token).toEqual(expect.stringContaining("falow_"));
  });

  it("verificador errado não troca", async () => {
    const r: any = await trocarCodigo(dbComCodigo(), {
      code: "cod-1",
      code_verifier: "errado",
      redirect_uri: "https://claude.ai/cb",
      client_id: "cli-1",
    });
    expect(r.error).toEqual(expect.any(String));
  });

  it("código já usado não troca de novo", async () => {
    const r: any = await trocarCodigo(
      dbComCodigo({ used_at: new Date().toISOString() }),
      {
        code: "cod-1",
        code_verifier: VERIFIER,
        redirect_uri: "https://claude.ai/cb",
        client_id: "cli-1",
      }
    );
    expect(r.error).toEqual(expect.any(String));
  });

  it("código expirado não troca", async () => {
    const r: any = await trocarCodigo(
      dbComCodigo({ expires_at: new Date(Date.now() - 1000).toISOString() }),
      {
        code: "cod-1",
        code_verifier: VERIFIER,
        redirect_uri: "https://claude.ai/cb",
        client_id: "cli-1",
      }
    );
    expect(r.error).toEqual(expect.any(String));
  });

  it("redirect_uri diferente do pedido não troca", async () => {
    const r: any = await trocarCodigo(dbComCodigo(), {
      code: "cod-1",
      code_verifier: VERIFIER,
      redirect_uri: "https://outro.exemplo/cb",
      client_id: "cli-1",
    });
    expect(r.error).toEqual(expect.any(String));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/mcp/oauth.test.ts`
Expected: FAIL nas novas.

- [ ] **Step 3: Implementar**

```ts
// acrescentar em src/lib/mcp/oauth.ts
import { createHash, timingSafeEqual } from "node:crypto";

import { generateToken } from "@/lib/mcp/token";

const TOKEN_DIAS = 90;

export function verificarPkce(verifier: string, challenge: string): boolean {
  const esperado = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(esperado);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function trocarCodigo(
  db: any,
  params: {
    code: string;
    code_verifier: string;
    redirect_uri: string;
    client_id: string;
  }
) {
  const INVALIDO = "Código de autorização inválido ou expirado.";

  const { data: cod } = await db
    .from("mcp_oauth_codes")
    .select("*")
    .eq("code", params.code)
    .maybeSingle();

  if (!cod) return { error: INVALIDO };
  if (cod.used_at) return { error: INVALIDO };
  if (new Date(cod.expires_at).getTime() <= Date.now()) return { error: INVALIDO };
  if (cod.redirect_uri !== params.redirect_uri) return { error: INVALIDO };
  if (cod.client_id !== params.client_id) return { error: INVALIDO };
  if (!verificarPkce(params.code_verifier, cod.code_challenge)) {
    return { error: INVALIDO };
  }

  // Uso único: queimar antes de emitir.
  await db
    .from("mcp_oauth_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", params.code);

  const { raw, hash, prefix } = generateToken();
  const expiraEm = TOKEN_DIAS * 86_400;
  const { error } = await db.from("mcp_tokens").insert({
    user_id: cod.user_id,
    name: `OAuth · ${cod.client_id.slice(0, 8)}`,
    token_hash: hash,
    prefix,
    expires_at: new Date(Date.now() + expiraEm * 1000).toISOString(),
  });
  if (error) return { error: "Não consegui emitir o token." };

  return { access_token: raw, token_type: "Bearer", expires_in: expiraEm };
}
```

- [ ] **Step 4: A rota de authorize e a tela de consentimento**

`GET /api/mcp/authorize` valida os parâmetros e manda para uma página do grupo `(dashboard)` — e é aí que está o truque: **o middleware já exige login nesse grupo**, então quem autoriza é necessariamente quem está logado, e o `user_id` da sessão é o que vai para o código. Nenhuma gestão de identidade nova.

```ts
// src/app/api/mcp/authorize/route.ts
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = url.searchParams;

  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const challenge = p.get("code_challenge") ?? "";

  if (!clientId || !redirectUri || !challenge) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (p.get("code_challenge_method") !== "S256") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  // O redirect_uri tem que ser um dos registrados — senão vira open redirect.
  const { data: cliente } = await createAdminClient()
    .from("mcp_oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!cliente || !cliente.redirect_uris.includes(redirectUri)) {
    return Response.json({ error: "invalid_client" }, { status: 400 });
  }

  const destino = new URL("/mcp/autorizar", process.env.NEXT_PUBLIC_APP_URL!);
  for (const chave of [
    "client_id",
    "redirect_uri",
    "code_challenge",
    "state",
  ]) {
    const valor = p.get(chave);
    if (valor) destino.searchParams.set(chave, valor);
  }
  return Response.redirect(destino.toString(), 302);
}
```

```tsx
// src/app/(dashboard)/mcp/autorizar/page.tsx
import { autorizarCliente } from "./actions";

export default function AutorizarPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  return (
    <div className="mx-auto max-w-md space-y-6 py-12">
      <h1 className="text-2xl font-semibold">Autorizar acesso</h1>
      <p className="text-muted-foreground">
        Um aplicativo está pedindo para ler e alterar suas automações, contatos
        e métricas no Falow. Autorize só se foi você que pediu.
      </p>
      <form action={autorizarCliente} className="flex gap-3">
        <input type="hidden" name="client_id" value={searchParams.client_id} />
        <input type="hidden" name="redirect_uri" value={searchParams.redirect_uri} />
        <input type="hidden" name="code_challenge" value={searchParams.code_challenge} />
        <input type="hidden" name="state" value={searchParams.state ?? ""} />
        <button name="decisao" value="autorizar" className="btn-primary">
          Autorizar
        </button>
        <button name="decisao" value="cancelar" className="btn-ghost">
          Cancelar
        </button>
      </form>
    </div>
  );
}
```

```ts
// src/app/(dashboard)/mcp/autorizar/actions.ts
"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const CODE_TTL_MS = 60_000;

export async function autorizarCliente(form: FormData) {
  const redirectUri = String(form.get("redirect_uri"));
  const state = String(form.get("state") ?? "");
  const destino = new URL(redirectUri);
  if (state) destino.searchParams.set("state", state);

  if (form.get("decisao") !== "autorizar") {
    destino.searchParams.set("error", "access_denied");
    redirect(destino.toString());
  }

  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) {
    destino.searchParams.set("error", "access_denied");
    redirect(destino.toString());
  }

  const code = randomUUID();
  await createAdminClient().from("mcp_oauth_codes").insert({
    code,
    client_id: String(form.get("client_id")),
    user_id: user!.id,
    redirect_uri: redirectUri,
    code_challenge: String(form.get("code_challenge")),
    code_challenge_method: "S256",
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });

  destino.searchParams.set("code", code);
  redirect(destino.toString());
}
```

Usar as classes de botão reais do projeto no lugar de `btn-primary`/`btn-ghost` — seguir o `Button` de `src/components/ui/`.

- [ ] **Step 5: A rota de token**

```ts
// src/app/api/mcp/token/route.ts
import { trocarCodigo } from "@/lib/mcp/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const form = await request.formData();
  const r = await trocarCodigo(createAdminClient(), {
    code: String(form.get("code") ?? ""),
    code_verifier: String(form.get("code_verifier") ?? ""),
    redirect_uri: String(form.get("redirect_uri") ?? ""),
    client_id: String(form.get("client_id") ?? ""),
  });

  if ("error" in r) {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }
  return Response.json(r);
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/mcp/oauth.test.ts && npm test && npx tsc --noEmit && npm run build`
Expected: tudo limpo.

- [ ] **Step 7: Verificação manual com um cliente de verdade**

Adicionar a instalação como conector no claude.ai e percorrer o fluxo inteiro: descoberta, registro, tela de autorização, consentimento, e uma chamada de `listar_automacoes` que volte com dado real.

- [ ] **Step 8: Commit**

```bash
git add src/lib/mcp/oauth.ts src/lib/mcp/oauth.test.ts src/app/api/mcp/authorize src/app/api/mcp/token "src/app/(dashboard)/mcp"
git commit -m "feat(mcp): fluxo oauth de autorizacao e emissao de token"
```

---

## Task 17: Documentação

**Files:**
- Modify: `README.md`, `.env.example`
- Modify: `tasks/todo.md`, `tasks/ai-handoff.md`

- [ ] **Step 1: README**

Seção nova "Conectar no Claude, no ChatGPT ou no Claude Code", com: o que o MCP faz, como criar o token no painel, o comando do `claude mcp add`, como adicionar a URL como conector no claude.ai, e a lista das doze tools.

- [ ] **Step 2: `.env.example`**

Acrescentar `SUPABASE_JWT_SECRET` com a explicação de onde tirar (Supabase → Settings → API → JWT Secret) e a marca de segredo.

- [ ] **Step 3: Fechar o registro de tarefa**

Atualizar `tasks/todo.md` (marcar a rodada 2 como concluída) e acrescentar o handoff em `tasks/ai-handoff.md` no formato do arquivo.

- [ ] **Step 4: Verificação final**

Run: `npm test && npx tsc --noEmit && npm run build && npm run build:cloudflare`
Expected: tudo limpo nos quatro.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example tasks/todo.md tasks/ai-handoff.md
git commit -m "docs(mcp): como conectar o Falow no Claude e no ChatGPT"
```

---

## Cobertura da spec

| Seção da spec | Task |
|---|---|
| §4.1 rota stateless | 13 |
| §4.2 camadas | 5, 6, 8–13 |
| §4.3 risco do SDK (R1) | 1 |
| §5.1 isolamento pela RLS | 2, 13 (teste de isolamento) |
| §5.2 Bearer token | 3, 4, 5, 14 |
| §5.3 OAuth 2.1 | 15, 16 |
| §5.4 client com identidade (R2) | 2 |
| §5.5 validade e revogação | 3, 5, 14 |
| §6.1 tools de leitura | 8, 9, 10 |
| §6.2 tools de escrita | 11 |
| §7 refactor do saveRule | 7 |
| §8 migration | 3 |
| §9 erro, limite, auditoria | 5, 6, 12 |
| §10 testes | em todas |
| §12 R3 (escrita sem cerimônia) | 11, mantido como decidido |
