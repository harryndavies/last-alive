-- Rematch: one new game however many tap, same names and colours, pushes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

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
do $$
declare l text;
begin
  foreach l in array array['b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(pg_temp.v('code'), 'P' || l, case l when 'b' then 'blue' else 'mint' end);
  end loop;
end;
$$;

select pg_temp.login(pg_temp.uid('b'));
select throws_ok($$ select public.create_rematch(pg_temp.v('game')::uuid) $$, 'wrong_phase',
  'no rematch until the game is over');

-- Finish the game.
update public.games set status = 'finished', finished_at = now() where id = pg_temp.v('game')::uuid;

delete from net.http_request_queue;
select vault.create_secret('http://example.test/functions/v1', 'last_alive_functions_url')
  where not exists (select 1 from vault.secrets where name = 'last_alive_functions_url');
select vault.create_secret('test-secret', 'last_alive_cron_secret')
  where not exists (select 1 from vault.secrets where name = 'last_alive_cron_secret');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  select 'https://push.example/' || l, pg_temp.uid(l), 'k', 'a' from unnest(array['a', 'b', 'c', 'd']) l;

select pg_temp.login(pg_temp.uid('b'));
insert into ctx select 'r1', public.create_rematch(pg_temp.v('game')::uuid)::text;
select ok((pg_temp.v('r1')::jsonb->>'pin') ~ '^\d{4}$', 'the first tap creates a rematch with a new PIN');
insert into ctx select 'new', pg_temp.v('r1')::jsonb->>'game_id';

select pg_temp.login(pg_temp.uid('c'));
select is(public.create_rematch(pg_temp.v('game')::uuid)->>'game_id', pg_temp.v('new'),
  'a later tap joins the same rematch instead of making another');
select pg_temp.login(pg_temp.uid('d'));
select is(public.join_rematch(pg_temp.v('game')::uuid)->>'game_id', pg_temp.v('new'), 'others join it in one tap');
select pg_temp.login(pg_temp.uid('b'));
select is(public.create_rematch(pg_temp.v('game')::uuid)->>'rejoined', 'true', 'tapping again is harmless');

select is((select name from public.players where game_id = pg_temp.v('new')::uuid and is_host), 'Pb',
  'whoever started the rematch hosts it');
select results_eq(
  $$ select name, colour from public.players where game_id = pg_temp.v('new')::uuid order by name $$,
  $$ values ('Pb', 'blue'), ('Pc', 'mint'), ('Pd', 'mint') $$,
  'players keep their names and colours');
select is((select status::text from public.games where id = pg_temp.v('new')::uuid), 'lobby',
  'the rematch starts in the lobby');

set constraints all immediate;
select ok(exists (select 1 from net.http_request_queue
  where (convert_from(body, 'utf8')::jsonb->>'title') like '🔁 Rematch!%'
    and (convert_from(body, 'utf8')::jsonb->'user_ids') ? pg_temp.uid('a')::text
    and not ((convert_from(body, 'utf8')::jsonb->'user_ids') ? pg_temp.uid('b')::text)),
  'everyone else from the old game is told, not the person who started it');

select pg_temp.login(pg_temp.uid('e'));
select throws_ok($$ select public.join_rematch(pg_temp.v('game')::uuid) $$, 'not_in_game',
  'outsiders cannot use the old game to get in');

select * from finish();
rollback;
