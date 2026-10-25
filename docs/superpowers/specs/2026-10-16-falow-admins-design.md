# Falow — admins, cortesia e bloqueio (design)

**Data:** 2026-10-16
**Status:** aprovado no brainstorming, aguardando plano
**Base:** branch `multiusuario` (SaaS multiusuário, spec `2026-10-15-falow-multiusuario-design.md`). Nada desta mudança vai para a `main` nem é publicado sem ordem do Matheus.

## Objetivo

Permitir que alguns usuários sejam **admin**, com segurança: ninguém vira admin por dentro do app. Admin tem os poderes do dono e acesso a um painel `/admin` para ver clientes, dar cortesia, bloquear e reenviar convite/senha.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Quem é admin | O dono (`FALOW_OWNER_USER_ID`) **ou** um UUID listado em `FALOW_ADMIN_USER_IDS` (secret do Worker). Nada no app altera essa lista |
| Poderes | Os do dono: acesso sem pagar, sem limite de @, botão de IA, nunca apagado pelo purge; mais o painel `/admin` |
| O que o admin NÃO faz | Não lê conversas, contatos nem mensagens de clientes; não promove ninguém; não mexe na Stripe |
| Painel | Ver clientes e assinaturas; dar/remover cortesia (inclusive convidando e-mail novo); bloquear/desbloquear; reenviar convite ou link de senha |
| Armazenamento | Tabelas novas `access_grants` (cortesia/bloqueio) e `admin_audit_log` (migration 0018) |
| Admin como alvo | Admin não pode ser bloqueado nem receber cortesia pelo painel (o servidor recusa) |
| MFA | Recomendado no runbook para contas admin; não é trava no código |

## 1. Identidade de admin

- `isAdmin(userId)` em `src/lib/billing/access.ts`: `isOwner(userId)` **ou** `userId` está em `FALOW_ADMIN_USER_IDS`.
- `FALOW_ADMIN_USER_IDS`: UUIDs separados por vírgula; cada item com `trim`; itens que não casam com o formato de UUID são descartados com `console.error` (uma vez por processo/isolate). Vazio/ausente = nenhum admin extra.
- Comparação sempre pelo UUID exato do Supabase Auth (nunca e-mail).
- Onde hoje se usa `isOwner` para conceder privilégio (regra de acesso, limite de @ no OAuth, IA, exclusão de purge), passa a valer `isAdmin`. A guarda do purge que exige `FALOW_OWNER_USER_ID` preenchido continua igual.

## 2. Dados (migration `0018_admin_access_grants.sql`)

```
access_grants (
  user_id    uuid primary key references auth.users on delete cascade,
  kind       text not null check (kind in ('courtesy','block')),
  expires_at timestamptz,          -- obrigatório quando kind = 'courtesy'
  reason     text not null check (length(reason) between 1 and 200),
  granted_by uuid not null,        -- admin que fez (sem FK: admin pode não existir mais)
  created_at timestamptz not null default now(),
  check (kind <> 'courtesy' or expires_at is not null)
)
admin_audit_log (
  id             bigint generated always as identity primary key,
  admin_id       uuid not null,
  action         text not null,     -- courtesy_grant | courtesy_revoke | block | unblock | invite_resend | courtesy_invite
  target_user_id uuid,
  details        jsonb not null default '{}',
  created_at     timestamptz not null default now()
)
```

- RLS ligada nas duas. `access_grants`: só `select` da própria linha (`user_id = auth.uid()`). `admin_audit_log`: nenhuma policy (só service role). Nenhum insert/update/delete pela API.
- Aditiva: pode ser aplicada antes do deploy, junto com a 0016. `check-db-schema.mjs` passa a exigir as duas tabelas.
- Fake de testes ganha as duas tabelas.

## 3. Regra de acesso

Uma função só (`hasActiveAccess`), consultada pelo middleware, `findServedAccount` (bot), cron (`accountHasAccess`), IA e purge. Ordem:

1. `isAdmin(userId)` → acesso.
2. `access_grants.kind = 'block'` → sem acesso (mesmo pagando).
3. `access_grants.kind = 'courtesy'` e `expires_at > now()` → acesso.
4. senão: status da assinatura em `active|trialing|past_due` → acesso.

Erro em qualquer leitura → sem acesso + `console.error` (fail-closed com log). O middleware lê `access_grants` com o client do usuário (policy de select própria); bot/cron/purge com a service role.

`/assinatura` mostra, além do que já mostra: "Conta bloqueada. Fale com o suporte." (bloqueio; sem botão Reativar) e "Cortesia válida até {data}" (cortesia ativa).

## 4. Painel `/admin`

**Três camadas, todas no servidor:**
1. Middleware: não-admin em qualquer `/admin*` → resposta 404 (rewrite para a página de não encontrado), sem revelar a área.
2. Layout de `/admin`: `requireAdmin()`.
3. Toda server action de admin começa com `requireAdmin()` (valida sessão com `getUser`, confere `isAdmin`, lança se falhar) antes de qualquer leitura/escrita; só depois usa a service role. As actions entram no manifesto do teste de auditoria (`src/lib/auth/__tests__/admin-actions.audit.test.ts`), que passa a exigir `requireAdmin` como primeira checagem nas actions de `src/app/admin/**`.

**Telas:**
- `/admin/clientes`: lista paginada (busca por e-mail) com e-mail, cadastro, último login, @ conectado, status e fim do período da assinatura, `purge_after`, cortesia/bloqueio. Fonte: `auth.admin.listUsers` + `subscriptions` + `ig_accounts` (só `ig_username`, `status`) + `access_grants`. Admins aparecem marcados e sem botões de ação.
- Ações por cliente: dar cortesia (30/90/365 dias ou data; motivo), remover cortesia, bloquear (motivo; aviso "se o cliente paga, cancele também na Stripe"), desbloquear, reenviar convite (usuário que nunca entrou → `inviteUserByEmail`; já entrou → `resetPasswordForEmail`). Ações destrutivas pedem confirmação.
- "Convidar com cortesia": e-mail + validade + motivo; reaproveita a conta se o e-mail já existe (`falow_user_id_by_email`), senão convida (mesmo e-mail de definir senha da compra); grava a cortesia.
- `/admin` mostra as últimas 50 linhas de `admin_audit_log`.

**Validação (zod):** `user_id` UUID; datas no futuro e até 5 anos; e-mail válido; motivo 1-200 caracteres. Alvo admin → recusa (`"Admins não podem ser alterados pelo painel."`).

**Auditoria:** toda ação de escrita grava em `admin_audit_log` (admin, ação, alvo, detalhes: validade, motivo). Leitura da lista não gera registro. Se a gravação da auditoria falhar, a ação é desfeita ou devolve erro — nunca fica ação sem registro (ordem: gravar a mudança e a auditoria; se a auditoria falhar, reverter a mudança e devolver erro).

## 5. Bordas

- Cortesia vencida: acesso cai; sem purge automático (não há assinatura `canceled`); aparece na consulta mensal do runbook.
- Cancelado com cortesia ativa: a releitura do purge usa `hasActiveAccess` → não apaga.
- Bloqueado pagando: segue cobrado até o operador cancelar na Stripe; não é apagado enquanto a assinatura existir.
- Bloqueado com assinatura cancelada: purge normal 30 dias depois.
- Convite de cortesia para e-mail existente: reaproveita a conta.
- Admin listado sem conta: nada acontece até existir conta.
- UUID inválido na variável: ignorado com log.

## 6. Testes

- Regra de acesso: cada degrau e a precedência (admin > bloqueio > cortesia > assinatura), cortesia vencida, erro de leitura.
- `isAdmin`: vazio, espaços, UUID inválido, dono sempre admin.
- Actions: não-admin recusado sem tocar no banco; alvo admin recusado; validação; auditoria gravada; falha de auditoria reverte.
- Middleware: `/admin` → 404 para não-admin, passa para admin.
- Purge: não apaga admin nem quem tem cortesia válida.
- Script de isolamento: B não lê `access_grants` de outros nem `admin_audit_log`.

## 7. Runbook

- Aplicar 0018 junto com 0016 (antes do deploy).
- Secret `FALOW_ADMIN_USER_IDS` (UUIDs do Supabase → Authentication → Users, separados por vírgula).
- Recomendar MFA (TOTP) do Supabase nas contas admin.
- Consulta mensal inclui cortesias vencidas há mais de 30 dias.

## Fora de escopo

MFA obrigatório no código; papéis intermediários (ex.: suporte só leitura); admin vendo conversas; ações na Stripe pelo painel; impersonar cliente.
