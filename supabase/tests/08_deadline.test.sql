-- Game deadline: setting it, sudden death, no claims after time, deadline winner.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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
create function pg_temp.game() returns uuid language sql stable as $$ select pg_temp.v('game')::uuid $$;
create function pg_temp.pid(p_letter text) returns uuid language sql stable as $$
  select id from public.players where user_id = pg_temp.uid(p_letter) and game_id = pg_temp.game();
$$;
create function pg_temp.letter(p_player uuid) returns text language sql stable as $$
  select right(user_id::text, 1) from public.players where id = p_player;
$$;
create function pg_temp.target_of(p_player uuid) returns uuid language sql stable as $$
  select target_id from public.missions where hunter_id = p_player and is_active;
$$;
create function pg_temp.hunter_of(p_player uuid) returns uuid language sql stable as $$
  select hunter_id from public.missions where target_id = p_player and is_active;
$$;

-- A 6-player lobby.
select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Holiday', 'Ana', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.game();
do $$
declare l text;
begin
  foreach l in array array['b', 'c', 'd', 'e', 'f'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(pg_temp.v('code'), 'P' || l, 'blue');
  end loop;
end;
$$;

-- Setting the deadline
select pg_temp.login(pg_temp.uid('b'));
select throws_ok($$ select public.set_game_end(pg_temp.game(), now() + interval '3 days') $$, 'not_host',
  'only the host sets the deadline');
select pg_temp.login(pg_temp.uid('a'));
select throws_ok($$ select public.set_game_end(pg_temp.game(), now() + interval '10 minutes') $$, 'end_too_soon',
  'the deadline must be at least an hour away');
select lives_ok($$ select public.set_game_end(pg_temp.game(), now() + interval '3 days') $$, 'the host can set a deadline');
select lives_ok($$ select public.set_game_end(pg_temp.game()) $$, '...and clear it before the start');
select public.set_game_end(pg_temp.game(), now() + interval '3 days');

do $$
declare l text;
begin
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_picking(pg_temp.game());
  foreach l in array array['a', 'b', 'c', 'd', 'e', 'f'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.submit_cards(pg_temp.game(), 'W' || l, 'P' || l, 'Say ' || l);
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_game(pg_temp.game());
end;
$$;

select pg_temp.login(pg_temp.uid('a'));
select throws_ok($$ select public.set_game_end(pg_temp.game(), now() + interval '2 days') $$, 'can_only_extend',
  'mid-game the deadline cannot be brought forward');
select throws_ok($$ select public.set_game_end(pg_temp.game()) $$, 'can_only_extend',
  'mid-game the deadline cannot be removed');
select lives_ok($$ select public.set_game_end(pg_temp.game(), now() + interval '4 days') $$,
  'mid-game the host can extend it');

-- Before sudden death, only your own target.
insert into ctx values ('ana', pg_temp.pid('a'));
insert into ctx select 'stranger', id from public.players
  where game_id = pg_temp.game() and id not in (pg_temp.v('ana')::uuid, pg_temp.target_of(pg_temp.v('ana')::uuid),
    pg_temp.hunter_of(pg_temp.v('ana')::uuid)) limit 1;
select throws_ok($$ select public.report_kill(pg_temp.game(), pg_temp.v('stranger')::uuid) $$, 'not_your_target',
  'outside sudden death you can only claim your target');

-- Jump to the final day: sudden death.
update public.games set started_at = now() - interval '10 days', ends_at = now() + interval '2 hours'
where id = pg_temp.game();
select is(private.tick_deadlines(), 0, 'nothing ends while time remains');
select private.tick_deadlines();
select is((select count(*)::int from public.events where game_id = pg_temp.game() and type = 'sudden_death_started'),
  1, 'sudden death is announced once');

insert into ctx values ('stranger_hunter', pg_temp.hunter_of(pg_temp.v('stranger')::uuid));
insert into ctx values ('stranger_target', pg_temp.target_of(pg_temp.v('stranger')::uuid));
insert into ctx values ('ana_target', pg_temp.target_of(pg_temp.v('ana')::uuid));
select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'sd', public.report_kill(pg_temp.game(), pg_temp.v('stranger')::uuid);
select is((select sudden_death from public.kills where id = pg_temp.v('sd')::uuid), true,
  'in sudden death you can claim anyone');
select pg_temp.login(pg_temp.uid(pg_temp.letter(pg_temp.v('stranger')::uuid)));
select public.respond_to_kill(pg_temp.v('sd')::uuid, true);

select is((select kills_count from public.player_stats where player_id = pg_temp.v('ana')::uuid), 1, 'the killer gets the credit');
select is(pg_temp.target_of(pg_temp.v('ana')::uuid), pg_temp.v('ana_target')::uuid,
  'the killer keeps their own mission');
select is(pg_temp.target_of(pg_temp.v('stranger_hunter')::uuid), pg_temp.v('stranger_target')::uuid,
  'whoever hunted the victim inherits the victim''s target, so the circle stays whole');
select is((select count(*)::int from public.missions where game_id = pg_temp.game() and is_active), 5,
  'one active mission per survivor');
select is((select d.details->>'weapon' from public.events e join public.event_details d on d.event_id = e.id where e.game_id = pg_temp.game() and e.type = 'kill_confirmed'),
  null, 'a sudden-death kill has no weapon on the record');

-- A claim made before the deadline still gets answered after it.
select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'late', public.report_kill(pg_temp.game(), pg_temp.target_of(pg_temp.v('ana')::uuid));
update public.games set ends_at = now() - interval '1 minute' where id = pg_temp.game();
select throws_ok($$ select public.report_kill(pg_temp.game(), pg_temp.target_of(pg_temp.v('ana')::uuid)) $$,
  'times_up', 'no new claims after the deadline');
select is(private.tick_deadlines(), 0, 'the game waits for claims made before the deadline');

select pg_temp.login(pg_temp.uid(pg_temp.letter((select victim_id from public.kills where id = pg_temp.v('late')::uuid))));
select public.respond_to_kill(pg_temp.v('late')::uuid, true);
select is(private.tick_deadlines(), 1, 'once claims are settled, time is up');
select results_eq(
  $$ select status::text, winner_player_id, (select payload->>'reason' from public.events
       where game_id = pg_temp.game() and type = 'game_finished') from public.games where id = pg_temp.game() $$,
  $$ select 'finished', pg_temp.v('ana')::uuid, 'time' $$,
  'most kills among survivors wins on time');

select * from finish();
rollback;
