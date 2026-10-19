-- Cutthroat call-outs: right means the hunter is out and you get the kill;
-- wrong means no call-outs for 24 hours.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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
create function pg_temp.login_as(p_player uuid) returns void language sql as $$
  select pg_temp.login((select user_id from public.players where id = p_player));
$$;
create function pg_temp.hunter_of(p_player uuid) returns uuid language sql stable as $$
  select hunter_id from public.missions where target_id = p_player and is_active;
$$;
create function pg_temp.target_of(p_player uuid) returns uuid language sql stable as $$
  select target_id from public.missions where hunter_id = p_player and is_active;
$$;

-- A six-player game, started.
create function pg_temp.start_game(p_name text, p_letters text[]) returns uuid language plpgsql as $$
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

insert into ctx values ('game', pg_temp.start_game('Office', array['a', 'b', 'c', 'd', 'e', 'f'])::text);

-- Name the chain around Tom: Hana -> Alex -> Tom -> Zoe.
insert into ctx select 'tom', id from public.players
  where game_id = pg_temp.v('game')::uuid and user_id = pg_temp.uid('a');
insert into ctx select 'alex', pg_temp.hunter_of(pg_temp.v('tom')::uuid);
insert into ctx select 'hana', pg_temp.hunter_of(pg_temp.v('alex')::uuid);
insert into ctx select 'zoe', pg_temp.target_of(pg_temp.v('tom')::uuid);
insert into ctx select 'tom_mission', id from public.missions where hunter_id = pg_temp.v('tom')::uuid and is_active;
insert into ctx select 'hana_cards', weapon_card_id || ',' || place_card_id || ',' || phrase_card_id
  from public.missions where hunter_id = pg_temp.v('hana')::uuid and is_active;
-- Someone who is not hunting Tom, for the wrong guess.
insert into ctx select 'innocent', id from public.players
  where game_id = pg_temp.v('game')::uuid and id not in (pg_temp.v('tom')::uuid, pg_temp.v('alex')::uuid) limit 1;

-- --- A wrong guess ----------------------------------------------------------
select pg_temp.login_as(pg_temp.v('tom')::uuid);
select is((public.call_out_hunter(pg_temp.v('game')::uuid, pg_temp.v('innocent')::uuid))->>'correct', 'false',
  'naming the wrong person is a miss');
select is((select status::text from public.players where id = pg_temp.v('innocent')::uuid), 'alive',
  '...and nothing happens to them');
select throws_ok($$ select public.call_out_hunter(pg_temp.v('game')::uuid, pg_temp.v('alex')::uuid) $$,
  'callout_cooldown', 'after a miss you cannot call anyone out for 24 hours');

-- Wrong guesses are secret: other players cannot see them.
select pg_temp.login_as(pg_temp.v('innocent')::uuid);
set local role authenticated;
select is((select count(*)::int from public.callouts), 0, 'nobody else can see your call-outs');
reset role;

-- A day later...
update public.callouts set created_at = now() - interval '25 hours' where accuser_id = pg_temp.v('tom')::uuid;

-- --- Rumbled ----------------------------------------------------------------
delete from net.http_request_queue;
select vault.create_secret('http://example.test/functions/v1', 'last_alive_functions_url')
  where not exists (select 1 from vault.secrets where name = 'last_alive_functions_url');
select vault.create_secret('test-secret', 'last_alive_cron_secret')
  where not exists (select 1 from vault.secrets where name = 'last_alive_cron_secret');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  select 'https://push.example/' || id, user_id, 'k', 'a' from public.players
  where game_id = pg_temp.v('game')::uuid;
select pg_temp.login_as(pg_temp.v('tom')::uuid);
select is((public.call_out_hunter(pg_temp.v('game')::uuid, pg_temp.v('alex')::uuid))->>'correct', 'true',
  'naming your real hunter rumbles them');
select results_eq(
  $$ select status::text, killed_by from public.players where id = pg_temp.v('alex')::uuid $$,
  $$ values ('dead', pg_temp.v('tom')::uuid) $$,
  'the rumbled hunter is out, got by their target');
select is((select kills_count from public.players where id = pg_temp.v('tom')::uuid), 1,
  'the caller gets the kill');
select is((select id from public.missions where hunter_id = pg_temp.v('tom')::uuid and is_active),
  pg_temp.v('tom_mission')::uuid, 'the caller keeps their own mission');
select is(pg_temp.target_of(pg_temp.v('tom')::uuid), pg_temp.v('zoe')::uuid, '...still hunting the same person');
select is(pg_temp.hunter_of(pg_temp.v('tom')::uuid), pg_temp.v('hana')::uuid,
  'whoever hunted the rumbled player now hunts the caller');
select is((select weapon_card_id || ',' || place_card_id || ',' || phrase_card_id
  from public.missions where hunter_id = pg_temp.v('hana')::uuid and is_active),
  pg_temp.v('hana_cards'), '...with their own cards, not the burnt ones');
select isnt((select inherited_from from public.missions where hunter_id = pg_temp.v('hana')::uuid and is_active),
  null, '...shown to them as a new mission');
select is((select array_agg(k order by k) from public.events e, jsonb_object_keys(e.payload) k
  where e.game_id = pg_temp.v('game')::uuid and e.type = 'rumbled'),
  array['by_id', 'by_name', 'hunter_id', 'hunter_name'],
  'the feed says who rumbled whom, and never who hunts the caller now');

set constraints all immediate;
create function pg_temp.pushed(p_title text, p_player uuid) returns boolean language sql stable as $$
  select exists (select 1 from net.http_request_queue
    where (convert_from(body, 'utf8')::jsonb->>'title') = p_title
      and (convert_from(body, 'utf8')::jsonb->'user_ids')
        ? (select user_id::text from public.players where id = p_player))
$$;
select ok(pg_temp.pushed('🕵️ You''ve been rumbled', pg_temp.v('alex')::uuid),
  'the rumbled hunter is told they are out');
select ok(pg_temp.pushed('Your target is out', pg_temp.v('hana')::uuid),
  'their hunter is told they have a new target');

select pg_temp.login_as(pg_temp.v('alex')::uuid);
select throws_ok($$ select public.call_out_hunter(pg_temp.v('game')::uuid, pg_temp.v('hana')::uuid) $$,
  'you_are_dead', 'players who are out cannot call anyone out');

-- --- Endgame: rumbling down to the last one ---------------------------------
insert into ctx values ('small', pg_temp.start_game('Small', array['1', '2', '3', '4'])::text);
do $$
declare
  v_me uuid;
begin
  while (select count(*) from public.players where game_id = pg_temp.v('small')::uuid and status = 'alive') > 1 loop
    select id into v_me from public.players
    where game_id = pg_temp.v('small')::uuid and status = 'alive' order by id limit 1;
    perform pg_temp.login_as(v_me);
    perform public.call_out_hunter(pg_temp.v('small')::uuid, pg_temp.hunter_of(v_me));
    insert into ctx values ('last_caller', v_me) on conflict (k) do update set v = excluded.v;
  end loop;
end;
$$;
select is((select status::text from public.games where id = pg_temp.v('small')::uuid), 'finished',
  'rumbling the last rival ends the game');
select is((select winner_player_id from public.games where id = pg_temp.v('small')::uuid),
  pg_temp.v('last_caller')::uuid, '...and the caller wins');

select * from finish();
rollback;
