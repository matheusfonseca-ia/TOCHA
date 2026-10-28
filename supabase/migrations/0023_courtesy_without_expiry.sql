-- ══════════════════════════════════════════════════════════════════════════
-- Falow: cortesia sem prazo (período indeterminado).
--
-- A 0021 exigia `expires_at` em toda cortesia. Agora `expires_at` nulo numa
-- cortesia significa "sem prazo": vale até um admin remover. O bloqueio
-- continua sem prazo, como antes.
--
-- Aditiva para o código: o código que exigia validade continua funcionando
-- (ele só nunca grava nulo). Seguro para rodar de novo.
-- ══════════════════════════════════════════════════════════════════════════

-- O check da 0021 não tem nome próprio (Postgres nomeia `access_grants_check`).
-- Apaga pelo conteúdo, para não depender do nome gerado.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.access_grants'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%expires_at IS NOT NULL%'
  loop
    execute format('alter table public.access_grants drop constraint %I', c.conname);
  end loop;
end $$;
