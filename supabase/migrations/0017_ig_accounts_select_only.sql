-- ══════════════════════════════════════════════════════════════════════════
-- Falow multiusuário: ig_accounts passa a ser SOMENTE LEITURA para o usuário.
--
-- A policy "own accounts" (0001) era `for all`: qualquer usuário logado escrevia
-- em ig_accounts direto pela API (chave anon + JWT dele), inclusive com o
-- ig_user_id de outra pessoa. Com o índice único da 0016 isso deixaria um
-- usuário "reservar" o @ de quem ainda vai conectar, ou desviar para uma conta
-- falsa os eventos do webhook de um @ desconectado. Conectar, desconectar e
-- sincronizar perfil passam pelo servidor (service role), depois de conferir a
-- sessão e a posse.
--
-- ORDEM DE APLICAÇÃO: só DEPOIS de publicar o código novo. O código antigo
-- escrevia em ig_accounts com o client do usuário e deixaria de conectar.
-- As policies das outras tabelas consultam ig_accounts por subselect e seguem
-- funcionando, porque a policy de select continua.
-- ══════════════════════════════════════════════════════════════════════════

drop policy if exists "own accounts" on public.ig_accounts;
drop policy if exists "own accounts select" on public.ig_accounts;
create policy "own accounts select" on public.ig_accounts
  for select using (user_id = auth.uid());
