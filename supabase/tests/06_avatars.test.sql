-- Avatar photos: only your own folder, only your own game, visible to players only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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
create function pg_temp.upload(p_letter text, p_name text) returns void language plpgsql as $$
begin
  perform pg_temp.login(pg_temp.uid(p_letter));
  set local role authenticated;
  insert into storage.objects (bucket_id, name) values ('avatars', p_name);
  reset role;
end;
$$;
create function pg_temp.can_see(p_letter text, p_name text) returns boolean language plpgsql as $$
declare n int;
begin
  perform pg_temp.login(pg_temp.uid(p_letter));
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'avatars' and name = p_name;
  reset role;
  return n = 1;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Faces', 'Ana', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.v('game')::uuid;
select pg_temp.login(pg_temp.uid('b'));
select public.join_game(pg_temp.v('code'), 'Ben', 'blue');
insert into ctx values ('mine', pg_temp.v('game') || '/' || pg_temp.uid('a') || '/' || gen_random_uuid() || '.jpg');

select lives_ok($$ select pg_temp.upload('a', pg_temp.v('mine')) $$, 'a player can upload their avatar');
select throws_ok($$ select pg_temp.upload('a', pg_temp.v('game') || '/' || pg_temp.uid('b') || '/' || gen_random_uuid() || '.jpg') $$,
  '42501', NULL, 'not into someone else''s folder');
select throws_ok($$ select pg_temp.upload('e', pg_temp.v('game') || '/' || pg_temp.uid('e') || '/' || gen_random_uuid() || '.jpg') $$,
  '42501', NULL, 'outsiders cannot upload into the game');

select pg_temp.login(pg_temp.uid('a'));
select lives_ok($$ select public.set_avatar(pg_temp.v('game')::uuid, pg_temp.v('mine')) $$, 'you can set your uploaded photo');
select throws_ok($$ select public.set_avatar(pg_temp.v('game')::uuid,
  pg_temp.v('game') || '/' || pg_temp.uid('a') || '/' || gen_random_uuid() || '.jpg') $$,
  'invalid_photo', 'a photo that was never uploaded is rejected');

select ok(pg_temp.can_see('b', pg_temp.v('mine')), 'other players in the game see it');
select ok(not pg_temp.can_see('e', pg_temp.v('mine')), 'outsiders do not');

select pg_temp.login(pg_temp.uid('a'));
select public.set_avatar(pg_temp.v('game')::uuid);
select is((select avatar_path from public.players where user_id = pg_temp.uid('a')), null, 'you can clear it');

select * from finish();
rollback;
