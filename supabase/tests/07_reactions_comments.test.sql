-- Reactions and comments on kills: who can, limits, moderation, notifications.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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
grant execute on all functions in schema pg_temp to authenticated;

-- A running game with one confirmed kill.
select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Banter', 'Ana', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.v('game')::uuid;
do $$
declare l text; v_target uuid; v_kill uuid;
begin
  foreach l in array array['b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(pg_temp.v('code'), 'P' || l, 'blue');
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_picking(pg_temp.v('game')::uuid);
  foreach l in array array['a', 'b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.submit_cards(pg_temp.v('game')::uuid, 'W' || l, 'P' || l, 'Say ' || l);
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_game(pg_temp.v('game')::uuid);
  select target_id into v_target from public.missions m
    join public.players p on p.id = m.hunter_id where p.user_id = pg_temp.uid('a') and m.is_active;
  v_kill := public.report_kill(pg_temp.v('game')::uuid, v_target);
  perform pg_temp.login((select user_id from public.players where id = v_target));
  perform public.respond_to_kill(v_kill, true);
end;
$$;
insert into ctx select 'event', id::text from public.events where game_id = pg_temp.v('game')::uuid and type = 'kill_confirmed';
insert into ctx select 'other_event', id::text from public.events where game_id = pg_temp.v('game')::uuid and type = 'game_started';
insert into ctx select 'bystander', right(user_id::text, 1) from public.players
  where game_id = pg_temp.v('game')::uuid and status = 'alive' and user_id <> pg_temp.uid('a') limit 1;
insert into ctx select 'victim', right(user_id::text, 1) from public.players
  where game_id = pg_temp.v('game')::uuid and status = 'dead';

-- Reactions
select pg_temp.login(pg_temp.uid(pg_temp.v('bystander')));
select is(public.toggle_reaction(pg_temp.v('event')::bigint, '💀'), true, 'a player can react to a kill');
select is(public.toggle_reaction(pg_temp.v('event')::bigint, '💀'), false, 'reacting again removes it');
select public.toggle_reaction(pg_temp.v('event')::bigint, '😂');
select throws_ok($$ select public.toggle_reaction(pg_temp.v('event')::bigint, '🍕') $$, 'invalid_reaction',
  'only the five game reactions are allowed');
select throws_ok($$ select public.toggle_reaction(pg_temp.v('other_event')::bigint, '😂') $$, 'kill_not_found',
  'you can only react to kills');
select pg_temp.login(pg_temp.uid(pg_temp.v('victim')));
select is(public.toggle_reaction(pg_temp.v('event')::bigint, '😱'), true, 'dead players can react too');
select pg_temp.login(pg_temp.uid('e'));
select throws_ok($$ select public.toggle_reaction(pg_temp.v('event')::bigint, '😂') $$, 'not_in_game',
  'outsiders cannot react');

-- Comments
delete from net.http_request_queue;
select vault.create_secret('http://example.test/functions/v1', 'last_alive_functions_url')
  where not exists (select 1 from vault.secrets where name = 'last_alive_functions_url');
select vault.create_secret('test-secret', 'last_alive_cron_secret')
  where not exists (select 1 from vault.secrets where name = 'last_alive_cron_secret');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  select 'https://push.example/' || l, pg_temp.uid(l), 'k', 'a' from unnest(array['a', 'b', 'c', 'd']) l;

select pg_temp.login(pg_temp.uid(pg_temp.v('bystander')));
insert into ctx select 'c1', public.add_comment(pg_temp.v('event')::bigint, '  HOW did you fall for that  ')::text;
select is((select body from public.kill_comments where id = pg_temp.v('c1')::uuid), 'HOW did you fall for that',
  'comments are trimmed and saved');
select throws_ok($$ select public.add_comment(pg_temp.v('event')::bigint, 'again') $$, 'slow_down',
  'no more than one comment every few seconds');
select throws_ok($$ select public.add_comment(pg_temp.v('event')::bigint, repeat('x', 201)) $$, 'invalid_comment',
  'comments are limited to 200 characters');

set constraints all immediate;
select ok(exists (select 1 from net.http_request_queue
  where (convert_from(body, 'utf8')::jsonb->>'title') like '💬 %'
    and (convert_from(body, 'utf8')::jsonb->'user_ids') ? pg_temp.uid('a')::text
    and (convert_from(body, 'utf8')::jsonb->'user_ids') ? pg_temp.uid(pg_temp.v('victim'))::text
    and not ((convert_from(body, 'utf8')::jsonb->'user_ids') ? pg_temp.uid(pg_temp.v('bystander'))::text)),
  'the killer and victim are told about a comment, the commenter is not');

-- Reading and moderation
select pg_temp.login(pg_temp.uid('e'));
set local role authenticated;
select is((select count(*)::int from public.kill_comments) + (select count(*)::int from public.kill_reactions), 0,
  'outsiders cannot read reactions or comments');
select throws_ok($$ insert into public.kill_comments (event_id, game_id, player_id, body)
  values (1, gen_random_uuid(), gen_random_uuid(), 'x') $$, '42501', NULL, 'clients cannot write comments directly');
reset role;

select pg_temp.login(pg_temp.uid(pg_temp.v('victim')));
select throws_ok($$ select public.delete_comment(pg_temp.v('c1')::uuid) $$, 'not_allowed',
  'you cannot delete other people''s comments');
select pg_temp.login(pg_temp.uid('a'));
select lives_ok($$ select public.delete_comment(pg_temp.v('c1')::uuid) $$, 'the host can delete any comment');
select is((select count(*)::int from public.kill_comments where id = pg_temp.v('c1')::uuid), 0, '...and it is gone');

select * from finish();
rollback;
