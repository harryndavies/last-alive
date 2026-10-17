-- Joining, names, PIN reclaim, host transfer and leaving mid-game.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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
create function pg_temp.pid(p_letter text) returns uuid language sql stable as $$
  select id from public.players
  where user_id = pg_temp.uid(p_letter) and game_id = pg_temp.v('game')::uuid;
$$;

select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Pins', 'Alice', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.v('game')::uuid;

select pg_temp.login(pg_temp.uid('b'));
insert into ctx select 'bob', r::text from (select public.join_game(pg_temp.v('code'), 'Bob', 'blue') r) s;
select ok((pg_temp.v('bob')::jsonb->>'pin') ~ '^\d{4}$', 'joining returns a 4-digit PIN once');
select ok((select pin_hash <> pg_temp.v('bob')::jsonb->>'pin' from private.player_secrets
  where player_id = pg_temp.pid('b')), 'the PIN is stored hashed');
select is(public.join_game(pg_temp.v('code'), 'Bob', 'blue')->>'rejoined', 'true',
  'same device is recognised automatically');
select is(public.join_game(pg_temp.v('code'), 'Bob', 'blue')->>'pin', null,
  'the PIN is not shown again');

select pg_temp.login(pg_temp.uid('c'));
select throws_ok($$ select public.join_game(pg_temp.v('code'), 'bob', 'mint') $$,
  'name_taken', 'a taken name cannot be silently taken over (case-insensitive)');
select throws_ok($$ select public.join_game('NOPE-00', 'Cat', 'mint') $$,
  'game_not_found', 'unknown codes are rejected');
select throws_ok($$ select public.join_game(pg_temp.v('code'), 'Cat', 'tartan') $$,
  'invalid_colour', 'colours are validated');
select is(public.game_preview(pg_temp.v('code'))->>'is_member', 'false', 'preview works for non-members');

-- Reclaim from a new device (user c pretends to be Bob's new phone).
select is(public.reclaim_player(pg_temp.v('code'), 'Bob',
  lpad((((pg_temp.v('bob')::jsonb->>'pin')::int + 1) % 10000)::text, 4, '0'))->>'ok', 'false',
  'wrong PIN is refused');
select is((select user_id from public.players where id = pg_temp.pid('b')), pg_temp.uid('b'),
  'seat is unchanged after a wrong PIN');
select is(public.reclaim_player(pg_temp.v('code'), 'Bob', pg_temp.v('bob')::jsonb->>'pin')->>'ok', 'true',
  'correct PIN reclaims the seat');
select is((select user_id from public.players where game_id = pg_temp.v('game')::uuid and name = 'Bob'),
  pg_temp.uid('c'), 'the seat now belongs to the new device');

-- Brute force protection: 5 wrong guesses lock the seat.
select pg_temp.login(pg_temp.uid('d'));
select public.reclaim_player(pg_temp.v('code'), 'Alice', 'xxxx') from generate_series(1, 4);
select is(public.reclaim_player(pg_temp.v('code'), 'Alice', 'xxxx')->>'error', 'pin_locked',
  'five wrong PINs lock the seat');
select is(public.reclaim_player(pg_temp.v('code'), 'Alice', 'xxxx')->>'error', 'pin_locked',
  'it stays locked');

-- Host leaves the lobby: host passes on.
select public.join_game(pg_temp.v('code'), 'Dan', 'pink');
select pg_temp.login(pg_temp.uid('e'));
select public.join_game(pg_temp.v('code'), 'Eve', 'yellow');
select pg_temp.login(pg_temp.uid('f'));
select public.join_game(pg_temp.v('code'), 'Fay', 'orange');

select pg_temp.login(pg_temp.uid('a'));
select public.leave_game(pg_temp.v('game')::uuid);
select is((select p.name from public.players p join public.games g on g.host_player_id = p.id
  where g.id = pg_temp.v('game')::uuid), 'Bob', 'host role moves to the longest-standing player');
select is((select count(*)::int from public.players where is_host and game_id = pg_temp.v('game')::uuid),
  1, 'there is exactly one host');

-- Bob (now on device c) is host.
select pg_temp.login(pg_temp.uid('d'));
select throws_ok($$ select public.remove_player(pg_temp.v('game')::uuid, pg_temp.pid('e')) $$,
  'not_host', 'only the host can remove players');

select pg_temp.login(pg_temp.uid('c'));
select public.start_picking(pg_temp.v('game')::uuid);

select pg_temp.login(pg_temp.uid('1'));
select lives_ok($$ select public.join_game(pg_temp.v('code'), 'Gus', 'purple') $$,
  'late joiners can still join while cards are being picked');

do $$
declare l text;
begin
  foreach l in array array['c', 'd', 'e', 'f', '1'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.submit_cards(pg_temp.v('game')::uuid, 'Weapon ' || l, 'Place ' || l, 'Object ' || l);
  end loop;
end;
$$;
select pg_temp.login(pg_temp.uid('c'));
select public.start_game(pg_temp.v('game')::uuid);

select pg_temp.login(pg_temp.uid('2'));
select throws_ok($$ select public.join_game(pg_temp.v('code'), 'Hal', 'red') $$,
  'game_already_started', 'nobody can join a running game');

-- Leaving mid-game: your hunter inherits your mission.
insert into ctx select 'leaver_mission', id from public.missions where hunter_id = pg_temp.pid('d') and is_active;
insert into ctx select 'hunter', hunter_id from public.missions where target_id = pg_temp.pid('d') and is_active;
select pg_temp.login(pg_temp.uid('d'));
select public.leave_game(pg_temp.v('game')::uuid);
select is((select status::text from public.players where id = pg_temp.pid('d')), 'dead', 'leaver is out');
select ok((select m.target_id = l.target_id and m.inherited_from = l.id
  from public.missions m, public.missions l
  where m.hunter_id = pg_temp.v('hunter')::uuid and m.is_active and l.id = pg_temp.v('leaver_mission')::uuid),
  'the leaver''s hunter inherits their mission');
select is((select count(*)::int from public.events where type = 'player_left' and payload->>'name' = 'Dan' and game_id = pg_temp.v('game')::uuid),
  1, 'leaving is in the feed');
select is((select count(*)::int from public.missions where game_id = pg_temp.v('game')::uuid and is_active),
  4, 'ring is intact: one mission per living player');

-- Leaving with an open claim against you confirms it (no dodging).
insert into ctx select 'dodger', target_id from public.missions where hunter_id = pg_temp.pid('c') and is_active;
select pg_temp.login(pg_temp.uid('c'));
insert into ctx select 'k', public.report_kill(pg_temp.v('game')::uuid, pg_temp.v('dodger')::uuid);
select pg_temp.login((select user_id from public.players where id = pg_temp.v('dodger')::uuid));
select public.leave_game(pg_temp.v('game')::uuid);
select is((select status::text from public.kills where id = pg_temp.v('k')::uuid), 'confirmed',
  'leaving with a claim against you confirms the kill');

select * from finish();
rollback;
