-- Seasons: points across a chain of rematches, newcomers included.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

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
-- Ends a game: the named user wins with some kills, everyone else is out.
create function pg_temp.finish(p_game uuid, p_winner uuid, p_kills int) returns void language sql as $$
  update public.players set status = 'dead' where game_id = p_game and user_id <> p_winner;
  update public.player_stats s set kills_count = p_kills
    from public.players p where p.id = s.player_id and p.game_id = p_game and p.user_id = p_winner;
  update public.games set status = 'finished', finished_at = now(),
    winner_player_id = (select id from public.players where game_id = p_game and user_id = p_winner)
    where id = p_game;
$$;

-- Game 1: Ana, Pb, Pc, Pd. Ana wins with 2 kills.
select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'g1', r->>'game_id' from (select public.create_game('Ibiza', 'Ana', 'red') r) s;
insert into ctx select 'code1', code from public.games where id = pg_temp.v('g1')::uuid;
do $$
declare l text;
begin
  foreach l in array array['b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(pg_temp.v('code1'), 'P' || l, 'mint');
  end loop;
end;
$$;

select pg_temp.login(pg_temp.uid('a'));
select is((public.season_standings(pg_temp.v('g1')::uuid)->>'games')::int, 0,
  'a game still being played is not counted');

select pg_temp.finish(pg_temp.v('g1')::uuid, pg_temp.uid('a'), 2);
select is((public.season_standings(pg_temp.v('g1')::uuid)->>'games')::int, 1,
  'a one-off game is a season of one');

-- Game 2: a rematch. Ana sits out, newcomer Eve joins and wins with 1 kill.
select pg_temp.login(pg_temp.uid('b'));
insert into ctx select 'g2', public.create_rematch(pg_temp.v('g1')::uuid)->>'game_id';
select pg_temp.login(pg_temp.uid('c'));
select public.join_rematch(pg_temp.v('g1')::uuid);
select pg_temp.login(pg_temp.uid('d'));
select public.join_rematch(pg_temp.v('g1')::uuid);
select pg_temp.login(pg_temp.uid('e'));
select public.join_game((select code from public.games where id = pg_temp.v('g2')::uuid), 'Eve', 'blue');
select pg_temp.finish(pg_temp.v('g2')::uuid, pg_temp.uid('e'), 1);

select pg_temp.login(pg_temp.uid('e'));
select is((public.season_standings(pg_temp.v('g2')::uuid)->>'games')::int, 2,
  'the rematch carries the season on');
select results_eq(
  $$ select r->>'name', (r->>'points')::int, (r->>'played')::int
     from jsonb_array_elements(public.season_standings(pg_temp.v('g2')::uuid)->'rows') r $$,
  $$ values ('Ana', 15, 1), ('Eve', 13, 1), ('Pb', 0, 2), ('Pc', 0, 2), ('Pd', 0, 2) $$,
  'win 10, kill 2, survive 1, with newcomers and players who sat one out');

-- Pb renames in game 3; the table follows the person, not the name.
select pg_temp.login(pg_temp.uid('b'));
insert into ctx select 'g3', public.create_rematch(pg_temp.v('g2')::uuid)->>'game_id';
update public.players set name = 'Bez'
  where game_id = pg_temp.v('g3')::uuid and user_id = pg_temp.uid('b');
select pg_temp.finish(pg_temp.v('g3')::uuid, pg_temp.uid('b'), 0);
select ok(exists (
  select 1 from jsonb_array_elements(public.season_standings(pg_temp.v('g3')::uuid)->'rows') r
  where r->>'name' = 'Bez' and (r->>'played')::int = 3 and (r->>'points')::int = 11),
  'a rename keeps your record and shows your latest name');

select pg_temp.login(pg_temp.uid('f'));
select throws_ok($$ select public.season_standings(pg_temp.v('g2')::uuid) $$, 'not_in_game',
  'outsiders cannot read a season');

select * from finish();
rollback;
