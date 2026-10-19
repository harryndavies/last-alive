-- Full game: ring generation, secrecy (RLS), acting out of turn, kill
-- confirmation + inheritance, auto-confirm, idempotency and winner detection.
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

-- Pretend to be a signed-in anonymous user. RPCs only look at auth.uid(), so for
-- them we stay as postgres; RLS checks below also switch the role.
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
create function pg_temp.pid(p_letter text) returns uuid language sql stable as $$
  select id from public.players
  where user_id = pg_temp.uid(p_letter) and game_id = pg_temp.v('game')::uuid;
$$;
create function pg_temp.target_of(p_player uuid) returns uuid language sql stable as $$
  select target_id from public.missions where hunter_id = p_player and is_active;
$$;
create function pg_temp.hunter_of(p_player uuid) returns uuid language sql stable as $$
  select hunter_id from public.missions where target_id = p_player and is_active;
$$;
create function pg_temp.letter_of(p_player uuid) returns text language sql stable as $$
  select right(user_id::text, 1) from public.players where id = p_player;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- --- Lobby ---------------------------------------------------------------
select pg_temp.login(pg_temp.uid('a'));
insert into ctx
select 'game', r->>'game_id' from (select public.create_game('Test', 'Alice', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.v('game')::uuid;

select pg_temp.login(pg_temp.uid('b'));
select public.join_game(pg_temp.v('code'), 'Bob', 'blue');
select pg_temp.login(pg_temp.uid('c'));
select public.join_game(lower(pg_temp.v('code')), 'Cat', 'mint');

select pg_temp.login(pg_temp.uid('a'));
select throws_ok($$ select public.start_picking(pg_temp.v('game')::uuid) $$,
  'need_four_players', 'host cannot start picking with fewer than 4 players');

select pg_temp.login(pg_temp.uid('d'));
select public.join_game(pg_temp.v('code'), 'Dan', 'pink');
select pg_temp.login(pg_temp.uid('e'));
select public.join_game(pg_temp.v('code'), 'Eve', 'yellow');

select pg_temp.login(pg_temp.uid('b'));
select throws_ok($$ select public.start_picking(pg_temp.v('game')::uuid) $$,
  'not_host', 'only the host can start picking');
select throws_ok($$ select public.submit_cards(pg_temp.v('game')::uuid, 'Spoon', 'Kitchen', 'Hat') $$,
  'wrong_phase', 'cannot submit cards in the lobby');

select pg_temp.login(pg_temp.uid('a'));
select lives_ok($$ select public.start_picking(pg_temp.v('game')::uuid) $$, 'host starts picking');

-- --- Cards ---------------------------------------------------------------
select pg_temp.login(pg_temp.uid('a'));
select public.submit_cards(pg_temp.v('game')::uuid, 'Spoon', 'Kitchen', 'Banana');
select throws_ok($$ select public.submit_cards(pg_temp.v('game')::uuid, 'Fork', 'Hall', 'Hat') $$,
  'cards_already_locked', 'cards cannot be changed once locked');
select throws_ok($$ select public.start_game(pg_temp.v('game')::uuid) $$,
  'cards_not_locked', 'host cannot start until everyone has locked cards');

select pg_temp.login(pg_temp.uid('b'));
select public.submit_cards(pg_temp.v('game')::uuid, 'Water pistol', 'Garden', 'Mug');
select throws_ok($$ select public.start_game(pg_temp.v('game')::uuid) $$,
  'not_host', 'only the host can start the game');
select pg_temp.login(pg_temp.uid('c'));
select public.submit_cards(pg_temp.v('game')::uuid, 'Sock', 'Stairs', 'Book');
select pg_temp.login(pg_temp.uid('d'));
select public.submit_cards(pg_temp.v('game')::uuid, 'Pillow', 'Bathroom', 'Phone');
select pg_temp.login(pg_temp.uid('e'));
select public.submit_cards(pg_temp.v('game')::uuid, 'Rubber duck', 'Car', 'Umbrella');

select pg_temp.login(pg_temp.uid('a'));
select lives_ok($$ select public.start_game(pg_temp.v('game')::uuid) $$, 'host starts the game');

-- --- Ring generation -----------------------------------------------------
select is((select count(*)::int from public.missions where game_id = pg_temp.v('game')::uuid and is_active),
  5, 'one active mission per player');
select is((select count(*)::int from public.missions where hunter_id = target_id and game_id = pg_temp.v('game')::uuid),
  0, 'nobody hunts themselves');
select is((
  with recursive walk(player, steps) as (
    select pg_temp.pid('a'), 0
    union all
    select pg_temp.target_of(player), steps + 1 from walk where steps < 10
  )
  select min(steps) from walk where steps > 0 and player = pg_temp.pid('a')
), 5, 'following targets from anyone visits all 5 players and returns: one single cycle');
select is((
  select count(*)::int from public.missions m
  join public.cards w on w.id = m.weapon_card_id
  join public.cards p on p.id = m.place_card_id
  join public.cards o on o.id = m.phrase_card_id
  where m.game_id = pg_temp.v('game')::uuid
    and m.hunter_id in (w.submitted_by, p.submitted_by, o.submitted_by)
), 0, 'nobody gets their own cards');
select is((
  select count(distinct weapon_card_id)::int + count(distinct place_card_id)::int
    + count(distinct phrase_card_id)::int
  from public.missions where game_id = pg_temp.v('game')::uuid
), 15, 'no card is reused across missions');
select is((
  select count(*)::int from public.missions m
  join public.cards w on w.id = m.weapon_card_id
  join public.cards p on p.id = m.place_card_id
  join public.cards o on o.id = m.phrase_card_id
  where m.game_id = pg_temp.v('game')::uuid
    and (w.kind, p.kind, o.kind) <> ('weapon', 'place', 'phrase')
), 0, 'each mission has one weapon, one place and one phrase');

-- --- Secrecy (RLS) ------------------------------------------------------
select pg_temp.login(pg_temp.uid('a'));
set local role authenticated;
select is((select count(*)::int from public.missions), 1, 'a player sees exactly one mission');
select is((select count(*)::int from public.missions where hunter_id <> pg_temp.pid('a')),
  0, 'a player cannot select anyone else''s mission');
select is((select count(*)::int from public.cards), 6,
  'a player sees only their own 3 cards and their mission''s 3 cards');
select is((select count(*)::int from public.kills), 0, 'no kills visible yet');
select is((select count(*)::int from public.players), 5, 'players in the same game are visible');
select throws_ok($$ select * from private.player_secrets $$, '42501', NULL,
  'PIN hashes are unreadable');
select throws_ok($$ insert into public.kills (game_id, mission_id, killer_id, victim_id)
  select game_id, id, hunter_id, target_id from public.missions $$, '42501', NULL,
  'clients cannot insert kills directly');
select throws_ok($$ update public.players set kills_count = 99 $$, '42501', NULL,
  'clients cannot update players directly');
select throws_ok($$ delete from public.missions $$, '42501', NULL,
  'clients cannot delete missions');
select throws_ok($$ select private.confirm_kill(gen_random_uuid(), 'host') $$, '42501', NULL,
  'internal functions are not callable');

-- An outsider sees nothing at all.
select pg_temp.login(pg_temp.uid('f'));
select is((select count(*)::int from public.games) + (select count(*)::int from public.players)
  + (select count(*)::int from public.events), 0, 'non-members see no games, players or events');
reset role;

-- --- Acting out of turn -------------------------------------------------
insert into ctx values ('t1', pg_temp.target_of(pg_temp.pid('a')));
insert into ctx select 'notarget', id from public.players
  where game_id = pg_temp.v('game')::uuid and id not in (pg_temp.pid('a'), pg_temp.v('t1')::uuid)
  limit 1;

select pg_temp.login(pg_temp.uid('a'));
select throws_ok($$ select public.report_kill(pg_temp.v('game')::uuid, pg_temp.v('notarget')::uuid) $$,
  'not_your_target', 'cannot report a kill on someone who is not your target');

insert into ctx select 'k1', public.report_kill(pg_temp.v('game')::uuid, pg_temp.v('t1')::uuid, 'gotcha');
select is(public.report_kill(pg_temp.v('game')::uuid, pg_temp.v('t1')::uuid)::text, pg_temp.v('k1'),
  'reporting twice returns the same open claim');
select throws_ok($$ select public.respond_to_kill(pg_temp.v('k1')::uuid, true) $$,
  'not_your_kill', 'the killer cannot confirm their own kill');

select pg_temp.login(pg_temp.uid(pg_temp.letter_of(pg_temp.v('notarget')::uuid)));
select throws_ok($$ select public.respond_to_kill(pg_temp.v('k1')::uuid, true) $$,
  'not_your_kill', 'a bystander cannot confirm someone else''s death');

-- Victim disputes.
select pg_temp.login(pg_temp.uid(pg_temp.letter_of(pg_temp.v('t1')::uuid)));
select is(public.respond_to_kill(pg_temp.v('k1')::uuid, false)::text, 'disputed', 'victim disputes');

select pg_temp.login(pg_temp.uid('b'));
select throws_ok($$ select public.resolve_dispute(pg_temp.v('k1')::uuid, true) $$,
  'not_host', 'only the host resolves disputes');

-- Remember the victim's mission before the host confirms.
insert into ctx select 'victim_mission', id from public.missions
  where hunter_id = pg_temp.v('t1')::uuid and is_active;

select pg_temp.login(pg_temp.uid('a'));
select is(public.resolve_dispute(pg_temp.v('k1')::uuid, true)::text, 'confirmed', 'host upholds the kill');

-- --- Inheritance ---------------------------------------------------------
select is((select status::text from public.players where id = pg_temp.v('t1')::uuid), 'dead', 'victim is out');
select is((select kills_count from public.players where id = pg_temp.pid('a')), 1, 'killer has 1 kill');
select is((select killed_by from public.players where id = pg_temp.v('t1')::uuid), pg_temp.pid('a'),
  'victim records who got them');
select ok((
  select m.target_id = v.target_id and m.inherited_from = v.id
  from public.missions m, public.missions v
  where m.hunter_id = pg_temp.pid('a') and m.is_active and v.id = pg_temp.v('victim_mission')::uuid
), 'killer inherits the victim''s target');
select ok((
  select bool_and(new_card = old_card or old_owner = pg_temp.pid('a'))
  from public.missions m, public.missions v,
    lateral (values
      (m.weapon_card_id, v.weapon_card_id), (m.place_card_id, v.place_card_id),
      (m.phrase_card_id, v.phrase_card_id)) as pair(new_card, old_card),
    lateral (select submitted_by as old_owner from public.cards where id = pair.old_card) o
  where m.hunter_id = pg_temp.pid('a') and m.is_active and v.id = pg_temp.v('victim_mission')::uuid
), 'killer inherits the victim''s cards (except any they wrote themselves)');
select is((select count(*)::int from public.missions where hunter_id = pg_temp.v('t1')::uuid and is_active),
  0, 'victim has no active mission');
select is((select count(*)::int from public.events where type = 'kill_confirmed' and game_id = pg_temp.v('game')::uuid), 1,
  'kill appears in the feed');

select is(public.resolve_dispute(pg_temp.v('k1')::uuid, true)::text, 'confirmed', 'confirming again is a no-op');
select is((select kills_count from public.players where id = pg_temp.pid('a')), 1, '...and does not double count');

select pg_temp.login(pg_temp.uid(pg_temp.letter_of(pg_temp.v('t1')::uuid)));
select throws_ok($$ select public.report_kill(pg_temp.v('game')::uuid, pg_temp.v('notarget')::uuid) $$,
  'you_are_dead', 'dead players cannot report kills');

-- --- Auto-confirm after 12 hours ----------------------------------------
select pg_temp.login(pg_temp.uid('a'));
insert into ctx values ('t2', pg_temp.target_of(pg_temp.pid('a')));
insert into ctx select 'k2', public.report_kill(pg_temp.v('game')::uuid, pg_temp.v('t2')::uuid);
select is(private.auto_confirm_expired_kills(), 0, 'fresh claims are not auto-confirmed');
update public.kills set created_at = now() - interval '13 hours' where id = pg_temp.v('k2')::uuid;
select is(private.auto_confirm_expired_kills(), 1, 'claims older than 12h are auto-confirmed');
select is((select status::text from public.players where id = pg_temp.v('t2')::uuid), 'dead',
  'auto-confirmed victim is out');

-- --- Winner detection ----------------------------------------------------
do $$
declare
  v_target uuid;
  v_kill uuid;
begin
  loop
    perform pg_temp.login(pg_temp.uid('a'));
    v_target := pg_temp.target_of(pg_temp.pid('a'));
    exit when v_target is null;
    v_kill := public.report_kill(pg_temp.v('game')::uuid, v_target);
    perform pg_temp.login(pg_temp.uid(pg_temp.letter_of(v_target)));
    perform public.respond_to_kill(v_kill, true);
  end loop;
end;
$$;

select is((select status::text from public.games where id = pg_temp.v('game')::uuid), 'finished',
  'game ends when one player is left');
select is((select winner_player_id from public.games where id = pg_temp.v('game')::uuid), pg_temp.pid('a'),
  'the last one alive wins');
select is((select count(*)::int from public.events where type = 'game_finished' and game_id = pg_temp.v('game')::uuid), 1, 'winner is announced');
select is((
  select count(*)::int from public.missions m
  join public.cards w on w.id = m.weapon_card_id
  join public.cards p on p.id = m.place_card_id
  join public.cards o on o.id = m.phrase_card_id
  where m.game_id = pg_temp.v('game')::uuid and m.inherited_from is null
    and m.hunter_id in (w.submitted_by, p.submitted_by, o.submitted_by)
), 0, 'nobody was dealt their own card');
select is((
  select count(*)::int from public.missions m
  join public.missions v on v.id = m.inherited_from
  where m.game_id = pg_temp.v('game')::uuid
    and (m.target_id, m.weapon_card_id, m.place_card_id, m.phrase_card_id)
      is distinct from (v.target_id, v.weapon_card_id, v.place_card_id, v.phrase_card_id)
), 0, 'every kill handed over the victim''s whole mission');
select is((select count(*)::int from public.missions where game_id = pg_temp.v('game')::uuid and is_active),
  0, 'no missions stay active after the game ends');

select * from finish();
rollback;
