-- Call time: the host adds an end time mid-game, with at least 48 hours' notice.
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
create function pg_temp.game() returns uuid language sql stable as $$ select pg_temp.v('game')::uuid $$;

select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Halls', 'Ana', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.game();
do $$
declare l text;
begin
  foreach l in array array['b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(pg_temp.v('code'), 'P' || l, 'blue');
  end loop;
end;
$$;

select pg_temp.login(pg_temp.uid('a'));
select throws_ok($$ select public.call_time(pg_temp.game(), now() + interval '3 days') $$, 'wrong_phase',
  'time can only be called once the game is running');

do $$
declare l text;
begin
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_picking(pg_temp.game());
  foreach l in array array['a', 'b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.submit_cards(pg_temp.game(), 'W' || l, 'P' || l, 'Say ' || l);
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_game(pg_temp.game());
end;
$$;

select pg_temp.login(pg_temp.uid('b'));
select throws_ok($$ select public.call_time(pg_temp.game(), now() + interval '3 days') $$, 'not_host',
  'only the host can call time');
select pg_temp.login(pg_temp.uid('a'));
select throws_ok($$ select public.call_time(pg_temp.game(), now() + interval '47 hours') $$, 'call_time_too_soon',
  'everyone gets at least 48 hours of warning');
select lives_ok($$ select public.call_time(pg_temp.game(), now() + interval '49 hours') $$,
  'the host can call time on an open-ended game');
select ok((select ends_at > now() + interval '48 hours' from public.games where id = pg_temp.game()),
  'the game now has an end time');
select ok(exists (select 1 from public.events where game_id = pg_temp.game()
  and type = 'time_called' and payload->>'by_name' = 'Ana'), 'the feed says who called time');
select throws_ok($$ select public.call_time(pg_temp.game(), now() + interval '5 days') $$, 'already_has_end',
  'once there is an end time, it can only be extended');

select * from finish();
rollback;
