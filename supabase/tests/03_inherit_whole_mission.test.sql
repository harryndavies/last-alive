-- A kill hands over the victim's whole mission, even when it holds a card the
-- killer wrote themselves.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

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

select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Own', 'Ana', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.v('game')::uuid;
do $$
declare l text;
begin
  foreach l in array array['b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(pg_temp.v('code'), 'P' || l, 'blue');
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_picking(pg_temp.v('game')::uuid);
  foreach l in array array['a', 'b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.submit_cards(pg_temp.v('game')::uuid, 'W' || l, 'P' || l, 'O' || l);
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_game(pg_temp.v('game')::uuid);
end;
$$;

-- Rig the deck: give Ana's target a mission holding Ana's own weapon card
-- (swapping weapons with whoever had it, so the deck stays consistent).
insert into ctx select 'ana', id from public.players where user_id = pg_temp.uid('a');
insert into ctx select 'ana_old', id from public.missions where hunter_id = pg_temp.v('ana')::uuid and is_active;
insert into ctx select 'victim', target_id from public.missions where id = pg_temp.v('ana_old')::uuid;
insert into ctx select 'victim_m', id from public.missions where hunter_id = pg_temp.v('victim')::uuid and is_active;
insert into ctx select 'ana_weapon', id from public.cards where submitted_by = pg_temp.v('ana')::uuid and kind = 'weapon';

update public.missions set weapon_card_id = (select weapon_card_id from public.missions where id = pg_temp.v('victim_m')::uuid)
where is_active and weapon_card_id = pg_temp.v('ana_weapon')::uuid;
update public.missions set weapon_card_id = pg_temp.v('ana_weapon')::uuid where id = pg_temp.v('victim_m')::uuid;

select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'k', public.report_kill(pg_temp.v('game')::uuid, pg_temp.v('victim')::uuid);
select pg_temp.login((select user_id from public.players where id = pg_temp.v('victim')::uuid));
select public.respond_to_kill(pg_temp.v('k')::uuid, true);

select results_eq(
  $$ select target_id, weapon_card_id, place_card_id, phrase_card_id
     from public.missions where hunter_id = pg_temp.v('ana')::uuid and is_active $$,
  $$ select target_id, weapon_card_id, place_card_id, phrase_card_id
     from public.missions where id = pg_temp.v('victim_m')::uuid $$,
  'the killer inherits the victim''s whole mission: target and all three cards');
select is((select weapon_card_id from public.missions where hunter_id = pg_temp.v('ana')::uuid and is_active),
  pg_temp.v('ana_weapon')::uuid, '...including a card the killer wrote themselves');
select is((select inherited_from from public.missions where hunter_id = pg_temp.v('ana')::uuid and is_active),
  pg_temp.v('victim_m')::uuid, '...and it is shown to them as an inherited mission');

select * from finish();
rollback;
