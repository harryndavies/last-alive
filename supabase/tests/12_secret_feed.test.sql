-- Secret feed: players still alive learn who is out, never who got them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
create function pg_temp.login_as(p_player uuid) returns void language sql as $$
  select pg_temp.login((select user_id from public.players where id = p_player));
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- A started game of six; returns its id.
create function pg_temp.start_game(p_name text, p_letters text[], p_secret boolean default true) returns uuid
language plpgsql as $$
declare
  v_game uuid;
  v_code text;
  l text;
begin
  perform pg_temp.login(pg_temp.uid(p_letters[1]));
  v_game := (public.create_game(p_name, 'P' || p_letters[1], 'red')->>'game_id')::uuid;
  select code into v_code from public.games where id = v_game;
  foreach l in array p_letters[2:] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(v_code, 'P' || l, 'blue');
  end loop;
  perform pg_temp.login(pg_temp.uid(p_letters[1]));
  perform public.set_secret_feed(v_game, p_secret);
  perform public.start_picking(v_game);
  foreach l in array p_letters loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.submit_cards(v_game, 'W' || l, 'P' || l, 'Say ' || l);
  end loop;
  perform pg_temp.login(pg_temp.uid(p_letters[1]));
  perform public.start_game(v_game);
  return v_game;
end;
$$;

-- Kills the target of p_killer and returns the victim.
create function pg_temp.kill(p_killer uuid) returns uuid language plpgsql as $$
declare
  v_victim uuid := (select target_id from public.missions where hunter_id = p_killer and is_active);
  v_kill uuid;
begin
  perform pg_temp.login_as(p_killer);
  v_kill := public.report_kill((select game_id from public.players where id = p_killer), v_victim);
  perform pg_temp.login_as(v_victim);
  perform public.respond_to_kill(v_kill, true);
  return v_victim;
end;
$$;

insert into ctx values ('game', pg_temp.start_game('Secret', array['a', 'b', 'c', 'd', 'e', 'f'])::text);
select is((select secret_feed from public.games where id = pg_temp.v('game')::uuid), true, 'the secret feed is on by default');

insert into ctx select 'killer', id from public.players where game_id = pg_temp.v('game')::uuid and user_id = pg_temp.uid('a');
insert into ctx select 'victim', pg_temp.kill(pg_temp.v('killer')::uuid)::text;
-- Someone else, still alive, who had nothing to do with it.
insert into ctx select 'bystander', id from public.players
  where game_id = pg_temp.v('game')::uuid and status = 'alive' and id <> pg_temp.v('killer')::uuid limit 1;

-- What each person can read, as the API would let them.
create function pg_temp.sees_killer(p_viewer uuid) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform pg_temp.login_as(p_viewer);
  set local role authenticated;
  select exists (select 1 from public.event_details d join public.events e on e.id = d.event_id
    where e.game_id = pg_temp.v('game')::uuid and e.type = 'kill_confirmed') into r;
  reset role;
  return r;
end;
$$;
create function pg_temp.sees_kill_count(p_viewer uuid, p_of uuid) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform pg_temp.login_as(p_viewer);
  set local role authenticated;
  select exists (select 1 from public.player_stats where player_id = p_of) into r;
  reset role;
  return r;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- --- The public feed ---------------------------------------------------------
select is((select payload->>'victim_name' from public.events where game_id = pg_temp.v('game')::uuid and type = 'kill_confirmed'),
  (select name from public.players where id = pg_temp.v('victim')::uuid), 'everyone learns who is out');
select ok((select not (payload ?| array['killer_id', 'killer_name', 'weapon', 'place', 'phrase', 'note', 'photo_path'])
  from public.events where game_id = pg_temp.v('game')::uuid and type = 'kill_confirmed'),
  'the public feed never says who got them, or how');

-- --- Who can see who did it ----------------------------------------------------
select ok(not pg_temp.sees_killer(pg_temp.v('bystander')::uuid), 'players still alive cannot see who did it');
select ok(pg_temp.sees_killer(pg_temp.v('killer')::uuid), 'the killer can see their own kill');
select ok(pg_temp.sees_killer(pg_temp.v('victim')::uuid), 'the victim (now out) can see who got them');

-- --- Kill counts ---------------------------------------------------------------
select ok(not pg_temp.sees_kill_count(pg_temp.v('bystander')::uuid, pg_temp.v('killer')::uuid),
  'players still alive cannot see other people''s kill counts');
select ok(pg_temp.sees_kill_count(pg_temp.v('bystander')::uuid, pg_temp.v('bystander')::uuid), '...but can see their own');
select ok(pg_temp.sees_kill_count(pg_temp.v('victim')::uuid, pg_temp.v('killer')::uuid), 'players who are out see everyone''s');

-- --- Notifications -------------------------------------------------------------
-- (Every push in this transaction is queued; check who got which version.)
set constraints all immediate;
create function pg_temp.push_to(p_title_like text, p_player uuid) returns boolean language sql stable as $$
  select exists (select 1 from net.http_request_queue
    where (convert_from(body, 'utf8')::jsonb->>'title') like p_title_like
      and (convert_from(body, 'utf8')::jsonb->'user_ids') ? (select user_id::text from public.players where id = p_player))
$$;
select vault.create_secret('http://example.test/functions/v1', 'last_alive_functions_url')
  where not exists (select 1 from vault.secrets where name = 'last_alive_functions_url');
select vault.create_secret('test-secret', 'last_alive_cron_secret')
  where not exists (select 1 from vault.secrets where name = 'last_alive_cron_secret');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  select 'https://push.example/' || id, user_id, 'k', 'a' from public.players where game_id = pg_temp.v('game')::uuid;
delete from net.http_request_queue;
-- A second kill, by someone whose target isn't the bystander, so the bystander
-- stays alive and uninvolved.
insert into ctx select 'killer2', m.hunter_id from public.missions m
  where m.game_id = pg_temp.v('game')::uuid and m.is_active
    and m.hunter_id <> pg_temp.v('bystander')::uuid and m.target_id <> pg_temp.v('bystander')::uuid
  limit 1;
select pg_temp.kill(pg_temp.v('killer2')::uuid);

select ok(pg_temp.push_to('💀 % is out', pg_temp.v('bystander')::uuid),
  'players still alive are told who is out');
select ok(not pg_temp.push_to('💀 % got %', pg_temp.v('bystander')::uuid), '...but not who got them');
select ok(pg_temp.push_to('💀 % got %', pg_temp.v('victim')::uuid), 'players who are out get the full story');

-- --- When everything is visible ------------------------------------------------
update public.games set status = 'finished', finished_at = now() where id = pg_temp.v('game')::uuid;
select ok(pg_temp.sees_killer(pg_temp.v('bystander')::uuid), 'once the game ends, everyone sees who did it');

insert into ctx values ('open', pg_temp.start_game('Open', array['1', '2', '3', '4', '5', '6'], false)::text);
update ctx set v = pg_temp.v('open') where k = 'game';
select pg_temp.kill((select id from public.players where game_id = pg_temp.v('open')::uuid and user_id = pg_temp.uid('1')));
select ok(pg_temp.sees_killer((select id from public.players
  where game_id = pg_temp.v('open')::uuid and status = 'alive' and user_id <> pg_temp.uid('1') limit 1)),
  'with the secret feed off, everyone sees who did it');

-- --- Changing the setting --------------------------------------------------------
select pg_temp.login(pg_temp.uid('2'));
select throws_ok($$ select public.set_secret_feed(pg_temp.v('open')::uuid, true) $$, 'not_host',
  'only the host can change the setting');
select pg_temp.login(pg_temp.uid('1'));
select throws_ok($$ select public.set_secret_feed(pg_temp.v('open')::uuid, true) $$, 'wrong_phase',
  'it cannot change once the game has started');

select * from finish();
rollback;
