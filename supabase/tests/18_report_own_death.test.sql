-- "I've been got": the victim reports their own death and it counts at once.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

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
create function pg_temp.hunter_of(p_player uuid) returns uuid language sql stable as $$
  select hunter_id from public.missions where target_id = p_player and is_active;
$$;

select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Pub', 'Ana', 'red') r) s;
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

-- Ana reports her own death; her hunter gets the kill.
insert into ctx values ('ana', pg_temp.pid('a'));
insert into ctx select 'hunter', pg_temp.hunter_of(pg_temp.pid('a'));
insert into ctx select 'ana_target', target_id from public.missions where hunter_id = pg_temp.pid('a') and is_active;
select pg_temp.login(pg_temp.uid('a'));
select is(public.report_own_death(pg_temp.game())::text, 'confirmed', 'it counts straight away');
select is((select status::text from public.players where id = pg_temp.v('ana')::uuid), 'dead', 'Ana is out');
select is((select kills_count from public.player_stats where player_id = pg_temp.v('hunter')::uuid), 1,
  'her hunter gets the kill');
select is((select target_id from public.missions where hunter_id = pg_temp.v('hunter')::uuid and is_active),
  pg_temp.v('ana_target')::uuid, 'and inherits her mission');
select is((select resolved_by from public.kills where victim_id = pg_temp.v('ana')::uuid), 'victim',
  'recorded as confirmed by the victim');
select throws_ok($$ select public.report_own_death(pg_temp.game()) $$, 'you_are_dead',
  'you can only die once');

-- Outside sudden death you can't pin it on someone who isn't your hunter.
insert into ctx select 'next', target_id from public.missions where hunter_id = pg_temp.v('hunter')::uuid and is_active;
select pg_temp.login(pg_temp.uid(pg_temp.letter(pg_temp.v('next')::uuid)));
select throws_ok(format($$ select public.report_own_death(%L, %L) $$, pg_temp.game(),
  (select id from public.players where game_id = pg_temp.game() and status = 'alive'
     and id <> pg_temp.v('next')::uuid and id <> pg_temp.v('hunter')::uuid limit 1)),
  'not_your_hunter', 'outside sudden death it can only be your hunter');

-- If your hunter already claimed you, saying "I've been got" confirms that claim.
select pg_temp.login(pg_temp.uid(pg_temp.letter(pg_temp.v('hunter')::uuid)));
insert into ctx select 'claim', public.report_kill(pg_temp.game(), pg_temp.v('next')::uuid)::text;
select pg_temp.login(pg_temp.uid(pg_temp.letter(pg_temp.v('next')::uuid)));
select is(public.report_own_death(pg_temp.game())::text, 'confirmed', 'an open claim is confirmed');
select is((select count(*)::int from public.kills where victim_id = pg_temp.v('next')::uuid), 1,
  'without recording a second kill');

-- In sudden death you say who got you, and it needn't be your hunter.
update public.games set started_at = now() - interval '5 days', ends_at = now() + interval '2 hours'
where id = pg_temp.game();
insert into ctx select 'last_pair', string_agg(id::text, ',' order by created_at)
from public.players where game_id = pg_temp.game() and status = 'alive';
do $$
declare v_victim uuid; v_killer uuid;
begin
  select p.id into v_victim from public.players p
  where p.game_id = pg_temp.game() and p.status = 'alive' limit 1;
  select p.id into v_killer from public.players p
  where p.game_id = pg_temp.game() and p.status = 'alive' and p.id <> v_victim
    and p.id <> pg_temp.hunter_of(v_victim) limit 1;
  insert into ctx values ('sd_victim', v_victim), ('sd_killer', v_killer);
end;
$$;
select pg_temp.login(pg_temp.uid(pg_temp.letter(pg_temp.v('sd_victim')::uuid)));
select public.report_own_death(pg_temp.game(), pg_temp.v('sd_killer')::uuid);
select ok((select sudden_death and killer_id = pg_temp.v('sd_killer')::uuid from public.kills
  where victim_id = pg_temp.v('sd_victim')::uuid and status = 'confirmed'),
  'in sudden death the kill goes to whoever you name');

select * from finish();
rollback;
