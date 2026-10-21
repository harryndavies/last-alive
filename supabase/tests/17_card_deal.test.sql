-- Dealing: a hunter's cards come from different people, never their own or their target's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.uid(p_n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid;
$$;
-- Starts a game of p_size players, p_rounds times over, and returns the games.
create function pg_temp.deal(p_size int, p_rounds int) returns setof uuid language plpgsql as $$
declare
  r int; i int; v_game uuid; v_code text;
begin
  for r in 1..p_rounds loop
    perform pg_temp.login(pg_temp.uid(1));
    select (public.create_game('Deal', 'P1', 'red')->>'game_id')::uuid into v_game;
    select code into v_code from public.games where id = v_game;
    for i in 2..p_size loop
      perform pg_temp.login(pg_temp.uid(i));
      perform public.join_game(v_code, 'P' || i, 'blue');
    end loop;
    perform pg_temp.login(pg_temp.uid(1));
    perform public.start_picking(v_game);
    for i in 1..p_size loop
      perform pg_temp.login(pg_temp.uid(i));
      perform public.submit_cards(v_game, 'W' || i, 'P' || i, 'S' || i);
    end loop;
    perform pg_temp.login(pg_temp.uid(1));
    perform public.start_game(v_game);
    return next v_game;
  end loop;
end;
$$;
create temp table games4 as select g from pg_temp.deal(4, 15) g;
create temp table games6 as select g from pg_temp.deal(6, 15) g;

create temp view dealt as
select m.game_id, m.hunter_id, m.target_id,
  w.submitted_by as w_from, p.submitted_by as p_from, s.submitted_by as s_from
from public.missions m
join public.cards w on w.id = m.weapon_card_id
join public.cards p on p.id = m.place_card_id
join public.cards s on s.id = m.phrase_card_id
where m.is_active;

select is((select count(*)::int from dealt where game_id in (select g from games4)), 60,
  '15 four-player games dealt');
select is((select count(*)::int from dealt where game_id in (select g from games4) and w_from = p_from), 0,
  'with 4 players, weapon and place always come from different people');
select is((select count(*)::int from dealt
  where game_id in (select g from games4 union select g from games6)
    and (w_from = hunter_id or p_from = hunter_id or s_from = hunter_id)), 0,
  'nobody gets their own card');
select is((select count(*)::int from dealt
  where game_id in (select g from games4 union select g from games6)
    and (w_from = target_id or p_from = target_id or s_from = target_id)), 0,
  'nobody gets a card from their own target');
select is((select count(*)::int from dealt where game_id in (select g from games6)
  and (w_from = p_from or w_from = s_from or p_from = s_from)), 0,
  'with 6 players, all three cards come from three different people');
select is((select count(*)::int from dealt where game_id in (select g from games6)), 90,
  '15 six-player games dealt');

select * from finish();
rollback;
