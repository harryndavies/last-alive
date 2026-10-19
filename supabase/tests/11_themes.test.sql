-- Game themes: classic by default, host-only to change, kept by rematches.
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

select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Spies', 'Ana', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.v('game')::uuid;
select pg_temp.login(pg_temp.uid('b'));
select public.join_game(pg_temp.v('code'), 'Ben', 'blue');

select is((select theme from public.games where id = pg_temp.v('game')::uuid), 'classic', 'new games are classic');

select throws_ok($$ select public.set_game_theme(pg_temp.v('game')::uuid, 'spy') $$, 'not_host',
  'only the host can change the theme');
select pg_temp.login(pg_temp.uid('a'));
select throws_ok($$ select public.set_game_theme(pg_temp.v('game')::uuid, 'disco') $$, 'invalid_theme',
  'only known themes');
select lives_ok($$ select public.set_game_theme(pg_temp.v('game')::uuid, 'spy') $$, 'the host can pick the spy theme');
select is((select theme from public.games where id = pg_temp.v('game')::uuid), 'spy', '...and it sticks');

-- A rematch keeps the theme.
update public.games set status = 'finished', finished_at = now() where id = pg_temp.v('game')::uuid;
select pg_temp.login(pg_temp.uid('b'));
insert into ctx select 'r', public.create_rematch(pg_temp.v('game')::uuid)->>'game_id';
select is((select theme from public.games where id = pg_temp.v('r')::uuid), 'spy', 'rematches keep the theme');

select * from finish();
rollback;
