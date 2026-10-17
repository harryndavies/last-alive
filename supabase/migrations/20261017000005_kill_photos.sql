-- Photo proof on kill claims, and the data the kill cam replay needs.
--
-- Photos live in the private `kill-photos` bucket at
--   <game_id>/<uploader auth uid>/<random uuid>.<ext>
-- Upload: an alive player of a running game, into their own folder only.
-- View: same people as the claim (killer, victim, host once disputed), and
-- everyone in the game once the kill is confirmed.

create extension if not exists pg_net with schema extensions;

alter table public.kills add column photo_path text check (
  photo_path is null
  or photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kill-photos', 'kill-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- <game_id>/<uid>/<file>, parsed safely (no cast errors on junk names).
create function private.photo_game_id(p_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

create function private.photo_uploader(p_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    then split_part(p_name, '/', 2)::uuid
  end
$$;

create function private.can_upload_kill_photo(p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.photo_uploader(p_name) = auth.uid()
    and exists (
      select 1
      from public.players p
      join public.games g on g.id = p.game_id
      where p.game_id = private.photo_game_id(p_name)
        and p.user_id = auth.uid()
        and p.status = 'alive'
        and g.status = 'active'
    )
$$;

create function private.can_view_kill_photo(p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.photo_uploader(p_name) = auth.uid()
    or exists (
      select 1 from public.kills k
      where k.photo_path = p_name
        and (
          k.killer_id in (select private.my_player_ids())
          or k.victim_id in (select private.my_player_ids())
          or (private.is_host(k.game_id) and (k.status = 'disputed' or k.resolved_by = 'host'))
          or (k.status = 'confirmed' and private.is_member(k.game_id))
        )
    )
$$;

-- For report_kill: the photo exists, is in this game and was uploaded by the caller.
create function private.is_own_kill_photo(p_name text, p_game_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.photo_game_id(p_name) = p_game_id
    and private.photo_uploader(p_name) = auth.uid()
    and exists (
      select 1 from storage.objects o where o.bucket_id = 'kill-photos' and o.name = p_name
    )
$$;

revoke all on function private.photo_game_id(text) from public;
revoke all on function private.photo_uploader(text) from public;
revoke all on function private.can_upload_kill_photo(text) from public;
revoke all on function private.can_view_kill_photo(text) from public;
revoke all on function private.is_own_kill_photo(text, uuid) from public;
grant execute on function private.photo_game_id(text) to authenticated;
grant execute on function private.photo_uploader(text) to authenticated;
grant execute on function private.can_upload_kill_photo(text) to authenticated;
grant execute on function private.can_view_kill_photo(text) to authenticated;

create policy kill_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kill-photos' and private.can_upload_kill_photo(name));

create policy kill_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'kill-photos' and private.can_view_kill_photo(name));

-- No update or delete policies: photos are immutable to clients.

-- report_kill gains an optional photo, so it is dropped and recreated.
drop function public.report_kill(uuid, uuid, text);

-- The heart of the game. Confirms a kill in one transaction:
-- victim dead, killer +1, missions passed on, feed event, winner check.
-- Idempotent: confirming an already-confirmed kill is a no-op. Safe under
-- concurrency because the game row is locked before anything is read.
create or replace function private.confirm_kill(p_kill_id uuid, p_resolved_by text)
returns public.kill_status
language plpgsql
set search_path = ''
as $$
declare
  v_kill public.kills;
  v_killer public.players;
  v_victim public.players;
  v_mission public.missions;
begin
  select * into v_kill from public.kills where id = p_kill_id;
  if not found then
    raise exception 'kill_not_found';
  end if;
  perform private.lock_game(v_kill.game_id);
  -- Re-read under the lock.
  select * into v_kill from public.kills where id = p_kill_id for update;

  if v_kill.status = 'confirmed' or v_kill.status = 'rejected' then
    return v_kill.status;
  end if;

  select * into v_killer from public.players where id = v_kill.killer_id for update;
  select * into v_victim from public.players where id = v_kill.victim_id for update;
  select * into v_mission from public.missions
  where hunter_id = v_killer.id and is_active;

  -- The world moved on (someone left, game ended): the claim no longer applies.
  if v_killer.status <> 'alive' or v_victim.status <> 'alive'
    or v_mission.id is null or v_mission.target_id <> v_victim.id then
    update public.kills set status = 'rejected', resolved_at = now(), resolved_by = 'system'
    where id = v_kill.id;
    return 'rejected';
  end if;

  update public.kills set status = 'confirmed', resolved_at = now(), resolved_by = p_resolved_by
  where id = v_kill.id;

  update public.players
  set status = 'dead', died_at = now(), killed_by = v_killer.id
  where id = v_victim.id;

  update public.players set kills_count = kills_count + 1 where id = v_killer.id;

  perform private.void_claims_by(v_victim.id);
  perform private.pass_mission_on(v_victim.id, v_killer.id);

  perform private.log_event(v_kill.game_id, 'kill_confirmed', jsonb_build_object(
    'kill_id', v_kill.id,
    'killer_id', v_killer.id,
    'killer_name', v_killer.name,
    'victim_id', v_victim.id,
    'victim_name', v_victim.name,
    'note', v_kill.note,
    'resolved_by', p_resolved_by,
    'photo_path', v_kill.photo_path,
    'weapon', (select text from public.cards where id = v_mission.weapon_card_id),
    'place', (select text from public.cards where id = v_mission.place_card_id),
    'phrase', (select text from public.cards where id = v_mission.phrase_card_id)
  ));

  perform private.check_winner(v_kill.game_id);
  return 'confirmed';
end;
$$;

create function public.report_kill(
  p_game_id uuid, p_victim_id uuid, p_note text default null, p_photo_path text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_mission public.missions;
  v_existing uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_kill_id uuid;
begin
  if v_game.status <> 'active' then
    raise exception 'wrong_phase';
  end if;
  if v_me.status <> 'alive' then
    raise exception 'you_are_dead';
  end if;

  select * into v_mission from public.missions where hunter_id = v_me.id and is_active;
  if not found or v_mission.target_id <> p_victim_id then
    raise exception 'not_your_target';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'note_too_long';
  end if;

  if p_photo_path is not null and not private.is_own_kill_photo(p_photo_path, p_game_id) then
    raise exception 'invalid_photo';
  end if;

  -- Double taps return the claim already open (adding the photo if it had none).
  select id into v_existing from public.kills
  where mission_id = v_mission.id and status in ('pending', 'disputed');
  if found then
    if p_photo_path is not null then
      update public.kills set photo_path = coalesce(photo_path, p_photo_path) where id = v_existing;
    end if;
    return v_existing;
  end if;

  insert into public.kills (game_id, mission_id, killer_id, victim_id, note, photo_path)
  values (p_game_id, v_mission.id, v_me.id, p_victim_id, v_note, p_photo_path)
  returning id into v_kill_id;
  return v_kill_id;
end;
$$;

-- Details of a claim for the people allowed to judge it: the victim, the
-- killer, and the host once it is disputed.
create or replace function public.get_kill_claim(p_kill_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_kill public.kills;
  v_me public.players;
  v_killer public.players;
  v_victim public.players;
  v_mission public.missions;
begin
  select * into v_kill from public.kills where id = p_kill_id;
  if not found then
    raise exception 'kill_not_found';
  end if;
  v_me := private.my_player(v_kill.game_id);
  if v_me.id not in (v_kill.killer_id, v_kill.victim_id)
    and not (v_me.is_host and (v_kill.status = 'disputed' or v_kill.resolved_by = 'host')) then
    raise exception 'not_allowed';
  end if;

  select * into v_killer from public.players where id = v_kill.killer_id;
  select * into v_victim from public.players where id = v_kill.victim_id;
  select * into v_mission from public.missions where id = v_kill.mission_id;

  return jsonb_build_object(
    'id', v_kill.id,
    'game_id', v_kill.game_id,
    'status', v_kill.status,
    'killer', private.player_json(v_killer),
    'victim', private.player_json(v_victim),
    'weapon', (select text from public.cards where id = v_mission.weapon_card_id),
    'place', (select text from public.cards where id = v_mission.place_card_id),
    'phrase', (select text from public.cards where id = v_mission.phrase_card_id),
    'note', v_kill.note,
    'photo_path', v_kill.photo_path,
    'created_at', v_kill.created_at,
    'auto_confirm_at', v_kill.created_at + interval '12 hours'
  );
end;
$$;

revoke execute on function public.report_kill(uuid, uuid, text, text) from public, anon;
grant execute on function public.report_kill(uuid, uuid, text, text) to authenticated;
revoke execute on function private.confirm_kill(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cleanup moves to an Edge Function, because files can only be deleted through
-- the Storage API. These two helpers are for that function (service role) only.
-- ---------------------------------------------------------------------------
create function public.games_due_for_cleanup()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.games
  where (status = 'finished' and finished_at < now() - interval '7 days')
     or (status in ('lobby', 'picking') and created_at < now() - interval '30 days')
$$;

create function public.kill_photo_paths(p_game_ids uuid[])
returns setof text
language sql stable security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'kill-photos' and private.photo_game_id(o.name) = any (p_game_ids)
$$;

revoke all on function public.games_due_for_cleanup() from public, anon, authenticated;
revoke all on function public.kill_photo_paths(uuid[]) from public, anon, authenticated;
grant execute on function public.games_due_for_cleanup() to service_role;
grant execute on function public.kill_photo_paths(uuid[]) to service_role;

-- Calls the cleanup-games Edge Function. The URL and shared secret come from
-- Vault (set once per environment, see README); without them this is a no-op.
create function private.request_cleanup()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets
  where name = 'last_alive_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets
  where name = 'last_alive_cron_secret';
  if v_url is null or v_secret is null then
    raise notice 'cleanup skipped: Vault secrets not set';
    return;
  end if;
  perform net.http_post(
    url := v_url || '/cleanup-games',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function private.request_cleanup() from public, anon, authenticated;

select cron.schedule(
  'last-alive-cleanup-games',
  '17 3 * * *',
  $$select private.request_cleanup()$$
);
