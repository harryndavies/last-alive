-- Photo proof: who can upload where, who can see a photo and when.
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
grant select on ctx to authenticated;
create function pg_temp.v(p_k text) returns text language sql stable as $$
  select v from ctx where k = p_k;
$$;
create function pg_temp.letter(p_player uuid) returns text language sql stable as $$
  select right(user_id::text, 1) from public.players where id = p_player;
$$;
create function pg_temp.can_see(p_letter text, p_name text) returns boolean language plpgsql as $$
declare n int;
begin
  perform pg_temp.login(pg_temp.uid(p_letter));
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'kill-photos' and name = p_name;
  reset role;
  return n = 1;
end;
$$;
create function pg_temp.upload(p_letter text, p_name text) returns void language plpgsql as $$
begin
  perform pg_temp.login(pg_temp.uid(p_letter));
  set local role authenticated;
  insert into storage.objects (bucket_id, name) values ('kill-photos', p_name);
  reset role;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- A running 4-player game.
select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Pics', 'Ana', 'red') r) s;
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
    perform public.submit_cards(pg_temp.v('game')::uuid, 'W' || l, 'P' || l, 'Say ' || l);
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_game(pg_temp.v('game')::uuid);
end;
$$;
insert into ctx select 'ana', id from public.players where user_id = pg_temp.uid('a') and game_id = pg_temp.v('game')::uuid;
insert into ctx select 'victim', target_id from public.missions where hunter_id = pg_temp.v('ana')::uuid and is_active;
insert into ctx select 'bystander', id from public.players
  where game_id = pg_temp.v('game')::uuid and id not in (pg_temp.v('ana')::uuid, pg_temp.v('victim')::uuid) limit 1;
insert into ctx values ('photo', pg_temp.v('game') || '/' || pg_temp.uid('a') || '/' || gen_random_uuid() || '.jpg');
insert into ctx values ('other_game_photo', gen_random_uuid() || '/' || pg_temp.uid('a') || '/' || gen_random_uuid() || '.jpg');
insert into ctx values ('as_someone_else', pg_temp.v('game') || '/' || pg_temp.uid('b') || '/' || gen_random_uuid() || '.jpg');

-- Uploads
select lives_ok($$ select pg_temp.upload('a', pg_temp.v('photo')) $$, 'a player can upload into their own folder');
select throws_ok($$ select pg_temp.upload('a', pg_temp.v('as_someone_else')) $$, '42501', NULL,
  'cannot upload into someone else''s folder');
select throws_ok($$ select pg_temp.upload('a', pg_temp.v('other_game_photo')) $$, '42501', NULL,
  'cannot upload into a game you are not in');
select throws_ok($$ select pg_temp.upload('e', pg_temp.v('game') || '/' || pg_temp.uid('e') || '/' || gen_random_uuid() || '.jpg') $$,
  '42501', NULL, 'outsiders cannot upload');

-- report_kill only accepts your own photo from this game.
select pg_temp.login(pg_temp.uid('a'));
select throws_ok($$ select public.report_kill(pg_temp.v('game')::uuid, pg_temp.v('victim')::uuid, null,
  pg_temp.v('game') || '/' || pg_temp.uid('a') || '/' || gen_random_uuid() || '.jpg') $$,
  'invalid_photo', 'a photo that was never uploaded is rejected');
insert into ctx select 'k', public.report_kill(pg_temp.v('game')::uuid, pg_temp.v('victim')::uuid, 'snap', pg_temp.v('photo'));
select is((select photo_path from public.kills where id = pg_temp.v('k')::uuid), pg_temp.v('photo'),
  'the claim carries the photo');

-- Visibility while pending
select ok(pg_temp.can_see(pg_temp.letter(pg_temp.v('victim')::uuid), pg_temp.v('photo')),
  'the victim can see the photo on a pending claim');
select ok(not pg_temp.can_see(pg_temp.letter(pg_temp.v('bystander')::uuid), pg_temp.v('photo')),
  'a bystander cannot see it before the kill is confirmed');
select ok(not pg_temp.can_see('e', pg_temp.v('photo')), 'an outsider cannot see it');

-- Confirm, then everyone in the game can.
select pg_temp.login((select user_id from public.players where id = pg_temp.v('victim')::uuid));
select public.respond_to_kill(pg_temp.v('k')::uuid, true);
select ok(pg_temp.can_see(pg_temp.letter(pg_temp.v('bystander')::uuid), pg_temp.v('photo')),
  'after confirmation every player can see it');
select ok(not pg_temp.can_see('e', pg_temp.v('photo')), 'outsiders still cannot');

select is((select payload->>'photo_path' from public.events
  where game_id = pg_temp.v('game')::uuid and type = 'kill_confirmed'), pg_temp.v('photo'),
  'the feed event carries the photo for the kill cam');

select * from finish();
rollback;
