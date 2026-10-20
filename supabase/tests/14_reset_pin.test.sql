-- Forgot your PIN: code + name gets you a new PIN and your seat, loudly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.uid(p_letter text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000000' || p_letter)::uuid;
$$;
create temp table ctx (k text primary key, v text);
create function pg_temp.v(p_k text) returns text language sql stable as $$
  select v from ctx where k = p_k;
$$;

select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Ibiza', 'Ana', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.v('game')::uuid;
select pg_temp.login(pg_temp.uid('b'));
select public.join_game(pg_temp.v('code'), 'Ben', 'blue');

-- Ben's new phone (user c) resets his PIN.
select pg_temp.login(pg_temp.uid('c'));
insert into ctx select 'reset', public.reset_pin(lower(pg_temp.v('code')), ' ben ')::text;
select ok((pg_temp.v('reset')::jsonb->>'pin') ~ '^\d{4}$', 'a reset hands out a new PIN');
select is((select user_id from public.players where name = 'Ben'), pg_temp.uid('c'),
  'and moves the seat to the new phone');
select ok(exists (select 1 from public.events where game_id = pg_temp.v('game')::uuid
  and type = 'seat_moved' and payload->>'name' = 'Ben'), 'the feed says the seat moved');

-- The new PIN works for reclaiming; the old phone can take it back with it.
select pg_temp.login(pg_temp.uid('b'));
select is((public.reclaim_player(pg_temp.v('code'), 'Ben', pg_temp.v('reset')::jsonb->>'pin')->>'ok')::boolean,
  true, 'the new PIN reclaims the seat');

-- Resetting your own seat just changes the PIN, with no feed noise.
select public.reset_pin(pg_temp.v('code'), 'Ben');
select is((select count(*)::int from public.events where type = 'seat_moved'), 1,
  'resetting your own PIN does not announce a move');

-- You cannot take a second seat in a game you are already in.
select pg_temp.login(pg_temp.uid('a'));
select throws_ok($$ select public.reset_pin(pg_temp.v('code'), 'Ben') $$, 'already_seated',
  'a player cannot grab someone else''s seat as well as their own');
select throws_ok($$ select public.reset_pin(pg_temp.v('code'), 'Nobody') $$, 'player_not_found',
  'unknown names are refused');

select * from finish();
rollback;
