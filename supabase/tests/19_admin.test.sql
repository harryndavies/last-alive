-- Admin: password checked in the database, lockout, and each action.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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

select private.set_admin_password('correct horse battery staple');

select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Office', 'Ana', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.game();
do $$
declare l text;
begin
  foreach l in array array['b', 'c', 'd', 'e'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(pg_temp.v('code'), 'P' || l, 'blue');
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_picking(pg_temp.game());
  foreach l in array array['a', 'b', 'c', 'd', 'e'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.submit_cards(pg_temp.game(), 'W' || l, 'P' || l, 'S' || l);
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_game(pg_temp.game());
end;
$$;

-- Any signed-in player can call these, so the password is the only key.
select pg_temp.login(pg_temp.uid('b'));
select is(public.admin_overview('nope')->>'error', 'admin_wrong_password', 'a wrong password gets nothing');
select is((public.admin_overview('correct horse battery staple')->>'ok')::boolean, true,
  'the right password works');
select ok((public.admin_overview('correct horse battery staple')->'stats'->>'running')::int >= 1,
  'the overview counts running games');

insert into ctx select 'detail', public.admin_game('correct horse battery staple', pg_temp.v('code'))::text;
select is(jsonb_array_length(pg_temp.v('detail')::jsonb->'missions'), 5, 'the game view shows every mission');

-- Edit a card.
insert into ctx select 'card', pg_temp.v('detail')::jsonb->'missions'->0->'weapon'->>'id';
select public.admin_set_card('correct horse battery staple', pg_temp.v('card')::uuid, 'Flip flop');
select is((select text from public.cards where id = pg_temp.v('card')::uuid), 'Flip flop', 'cards can be edited');

-- Change the end time freely.
select public.admin_set_end('correct horse battery staple', pg_temp.game(), now() + interval '6 hours');
select ok((select ends_at < now() + interval '7 hours' from public.games where id = pg_temp.game()),
  'the end time can be brought forward, unlike the host');

-- Remove a player: their hunter takes their mission.
insert into ctx select 'gone', id from public.players where game_id = pg_temp.game() and name = 'Pc';
insert into ctx select 'gone_target', target_id from public.missions where hunter_id = pg_temp.v('gone')::uuid and is_active;
insert into ctx select 'gone_hunter', hunter_id from public.missions where target_id = pg_temp.v('gone')::uuid and is_active;
select is((public.admin_remove_player('correct horse battery staple', pg_temp.v('gone')::uuid)->>'ok')::boolean,
  true, 'a player can be removed');
select is((select status::text from public.players where id = pg_temp.v('gone')::uuid), 'dead', 'they are out');
select is((select target_id from public.missions where hunter_id = pg_temp.v('gone_hunter')::uuid and is_active),
  pg_temp.v('gone_target')::uuid, 'and their hunter inherits their mission');

-- Five wrong passwords lock it, even for the right one.
do $$ begin for i in 1..5 loop perform public.admin_overview('wrong'); end loop; end $$;
select is(public.admin_overview('correct horse battery staple')->>'error', 'admin_locked',
  'five wrong passwords lock admin for a while');

-- Players can't set the password or reach the check directly.
select ok(not has_function_privilege('authenticated', 'private.set_admin_password(text)', 'execute'),
  'nobody but the database owner can set the password');
select ok(not has_function_privilege('anon', 'public.admin_overview(text)', 'execute'),
  'signed-out visitors cannot even try');

select * from finish();
rollback;
