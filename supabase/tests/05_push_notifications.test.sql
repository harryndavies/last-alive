-- Who gets which push. Deferred triggers are forced to run with
-- SET CONSTRAINTS ALL IMMEDIATE; queued pushes are read from pg_net's queue.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.uid(p_letter text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000000' || p_letter)::uuid;
$$;
create temp table ctx (k text primary key, v text);
grant select on ctx to authenticated;
create function pg_temp.v(p_k text) returns text language sql stable as $$
  select v from ctx where k = p_k;
$$;
-- Pushes queued so far in this test, as {title, user_ids}.
create function pg_temp.pushes() returns table (title text, users jsonb) language sql as $$
  set constraints all immediate;
  select (convert_from(body, 'utf8')::jsonb)->>'title', (convert_from(body, 'utf8')::jsonb)->'user_ids'
  from net.http_request_queue where url like '%/send-push' order by id;
$$;
create function pg_temp.pushed_to(p_title_like text, p_letter text) returns boolean language sql as $$
  select exists (select 1 from pg_temp.pushes() p
    where p.title like p_title_like and p.users ? pg_temp.uid(p_letter)::text);
$$;
grant execute on all functions in schema pg_temp to authenticated;

delete from net.http_request_queue;
select vault.create_secret('http://example.test/functions/v1', 'last_alive_functions_url')
  where not exists (select 1 from vault.secrets where name = 'last_alive_functions_url');
select vault.create_secret('test-secret', 'last_alive_cron_secret')
  where not exists (select 1 from vault.secrets where name = 'last_alive_cron_secret');

-- Subscriptions: clients can only use the RPCs.
select pg_temp.login(pg_temp.uid('b'));
set local role authenticated;
select lives_ok($$ select public.save_push_subscription('https://push.example/b', 'k', 'a', 'ua') $$,
  'a device can register for push');
select throws_ok($$ select * from public.push_subscriptions $$, '42501', NULL,
  'clients cannot read push subscriptions');
reset role;
select is((select user_id from public.push_subscriptions where endpoint = 'https://push.example/b'),
  pg_temp.uid('b'), 'the subscription belongs to the caller');

-- A 4-player game where everyone has notifications on.
select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Push', 'Ana', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.v('game')::uuid;
do $$
declare l text;
begin
  foreach l in array array['b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(pg_temp.v('code'), 'P' || l, 'blue');
  end loop;
  foreach l in array array['a', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.save_push_subscription('https://push.example/' || l, 'k', 'a');
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_picking(pg_temp.v('game')::uuid);
end;
$$;
select ok(pg_temp.pushed_to('Time to pick your cards', 'b'), 'everyone hears when card picking starts');

do $$
declare l text;
begin
  foreach l in array array['a', 'b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.submit_cards(pg_temp.v('game')::uuid, 'W' || l, 'P' || l, 'Say ' || l);
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_game(pg_temp.v('game')::uuid);
end;
$$;
select ok(pg_temp.pushed_to('The hunt is on', 'c'), 'everyone hears when the game starts');

-- A kill claim: only the victim is told, and not by whom.
delete from net.http_request_queue;
insert into ctx select 'ana', id from public.players where user_id = pg_temp.uid('a') and game_id = pg_temp.v('game')::uuid;
insert into ctx select 'victim', target_id from public.missions where hunter_id = pg_temp.v('ana')::uuid and is_active;
insert into ctx select 'vletter', right(user_id::text, 1) from public.players where id = pg_temp.v('victim')::uuid;
select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'k', public.report_kill(pg_temp.v('game')::uuid, pg_temp.v('victim')::uuid);
select ok(pg_temp.pushed_to('Someone says they got you', pg_temp.v('vletter')), 'the victim is told about the claim');
select is((select count(*)::int from pg_temp.pushes()), 1, 'nobody else is told about a claim');
select ok((select title from pg_temp.pushes() limit 1) not like '%Ana%', 'the claim push does not name the killer');

-- Dispute: the host (Ana here) is asked to decide.
delete from net.http_request_queue;
select pg_temp.login(pg_temp.uid(pg_temp.v('vletter')));
select public.respond_to_kill(pg_temp.v('k')::uuid, false);
select ok(pg_temp.pushed_to('A kill needs your decision', 'a'), 'the host is asked to settle a dispute');

-- Host upholds it: victim is told they are out, killer confirmed, others see the kill.
delete from net.http_request_queue;
select pg_temp.login(pg_temp.uid('a'));
select public.resolve_dispute(pg_temp.v('k')::uuid, true);
select ok(pg_temp.pushed_to('You''re out', pg_temp.v('vletter')), 'the victim hears they are out when they did not confirm it themselves');
select ok(pg_temp.pushed_to('Confirmed: you got %', 'a'), 'the killer hears the kill is confirmed');
select ok(exists (select 1 from pg_temp.pushes() p where p.title like '💀 %'
  and not (p.users ? pg_temp.uid('a')::text) and not (p.users ? pg_temp.uid(pg_temp.v('vletter'))::text)),
  'everyone else sees the kill, but not the killer or victim twice');

-- Missing configuration never breaks the game: notifications are skipped.
delete from net.http_request_queue;
delete from vault.secrets where name = 'last_alive_functions_url';
select pg_temp.login(pg_temp.uid('a'));
select lives_ok($$ select public.report_kill(pg_temp.v('game')::uuid,
  (select target_id from public.missions where hunter_id = pg_temp.v('ana')::uuid and is_active)) $$,
  'game actions still work when push is not configured');
select is((select count(*)::int from pg_temp.pushes()), 0, '...and nothing is queued');

select * from finish();
rollback;
