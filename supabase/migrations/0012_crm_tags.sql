-- ══════════════════════════════════════════════════════════════════════════
-- Falow: CRM, catálogo de tags (Fase 4)
--
-- `contacts.tags` (migration 0004) continua sendo a fonte de verdade lida
-- pelo runtime do workflow (nó Condição, `contacts/repository.ts`). Esta
-- migration só adiciona o CATÁLOGO (nome + cor) usado pela ficha do lead e
-- pelo gerenciador de tags do Inbox, mais as funções que propagam
-- renomear/excluir para `contacts.tags` sem duplicar por maiúscula/acento.
--
-- Seguro para rodar de novo: tudo usa `if not exists` / `drop ... if exists`.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Catálogo ────────────────────────────────────────────────────────────────
create table if not exists public.crm_tags (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ig_accounts (id) on delete cascade,
  name       text not null,
  color      text not null default 'green',
  created_at timestamptz not null default now()
);

-- Constraint com expressão não existe no Postgres: unique index cobre o caso
-- ("VIP" e "vip" não podem coexistir no catálogo da mesma conta).
create unique index if not exists crm_tags_account_name_lower_idx
  on public.crm_tags (account_id, lower(name));

comment on table public.crm_tags is
  'Catálogo de tags por conta (nome + cor). contacts.tags continua sendo a fonte de verdade lida pelo runtime; este catálogo só existe para a UI (ficha, filtro, gerenciador).';

alter table public.crm_tags enable row level security;

drop policy if exists "own crm_tags select" on public.crm_tags;
create policy "own crm_tags select" on public.crm_tags
  for select using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own crm_tags insert" on public.crm_tags;
create policy "own crm_tags insert" on public.crm_tags
  for insert with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own crm_tags update" on public.crm_tags;
create policy "own crm_tags update" on public.crm_tags
  for update using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  ) with check (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

drop policy if exists "own crm_tags delete" on public.crm_tags;
create policy "own crm_tags delete" on public.crm_tags
  for delete using (
    account_id in (select id from public.ig_accounts where user_id = auth.uid())
  );

-- ── Filtro por tag na lista do Inbox / funil ────────────────────────────────
create index if not exists contacts_tags_gin_idx
  on public.contacts using gin (tags);

-- ── Propagação: renomear tag em todos os contatos da conta ─────────────────
-- Reescreve cada `contacts.tags` que tenha uma variante de maiúscula/acento
-- de `p_old_name`, trocando pelo nome canônico e removendo duplicata (quando
-- o contato já tinha as duas grafias ao mesmo tempo). Mantém a ordem original
-- do array (pela 1ª ocorrência de cada tag após o rename).
create or replace function public.crm_tag_rename(
  p_account_id uuid,
  p_old_name   text,
  p_new_name   text
) returns integer
language sql
as $$
  with updated as (
    update public.contacts c set
      tags = (
        select coalesce(array_agg(tag order by first_ord), '{}')
        from (
          select distinct on (lower(tag))
                 tag,
                 min(ord) over (partition by lower(tag)) as first_ord
          from (
            select
              case when lower(t) = lower(p_old_name) then p_new_name else t end as tag,
              ord
            from unnest(c.tags) with ordinality as u(t, ord)
          ) mapped
        ) deduped
      ),
      updated_at = now()
    where c.account_id = p_account_id
      and exists (select 1 from unnest(c.tags) t where lower(t) = lower(p_old_name))
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- ── Propagação: excluir tag de todos os contatos da conta ──────────────────
create or replace function public.crm_tag_remove(
  p_account_id uuid,
  p_tag_name   text
) returns integer
language sql
as $$
  with updated as (
    update public.contacts c set
      tags = (
        select coalesce(array_agg(t order by ord), '{}')
        from unnest(c.tags) with ordinality as u(t, ord)
        where lower(t) <> lower(p_tag_name)
      ),
      updated_at = now()
    where c.account_id = p_account_id
      and exists (select 1 from unnest(c.tags) t where lower(t) = lower(p_tag_name))
    returning 1
  )
  select count(*)::integer from updated;
$$;

comment on function public.crm_tag_rename is
  'Chamada só pela service role (server action confere a posse da conta antes). Propaga renomear tag para contacts.tags sem diferenciar maiúscula.';
comment on function public.crm_tag_remove is
  'Chamada só pela service role (server action confere a posse da conta antes). Remove a tag de contacts.tags sem diferenciar maiúscula.';

-- Só a service role chama estas funções; a posse da conta é conferida na
-- server action com o client do usuário antes do rpc (padrão do módulo CRM).
revoke all on function public.crm_tag_rename(uuid, text, text) from public;
revoke all on function public.crm_tag_remove(uuid, text) from public;
-- No Supabase, anon e authenticated ganham execute em função nova por
-- privilégio padrão (o revoke de public não cobre). Mesmo com RLS barrando
-- contas alheias (as funções rodam como quem chama), fica explícito aqui.
revoke all on function public.crm_tag_rename(uuid, text, text) from anon, authenticated;
revoke all on function public.crm_tag_remove(uuid, text) from anon, authenticated;
grant execute on function public.crm_tag_rename(uuid, text, text) to service_role;
grant execute on function public.crm_tag_remove(uuid, text) to service_role;
