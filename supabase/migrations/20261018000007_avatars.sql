-- Photo avatars. Stored in the private `avatars` bucket at
--   <game_id>/<uploader auth uid>/<random uuid>.jpg
-- Upload: any player of the game, into their own folder. View: players of that
-- game only. Same rules and lifetime as the game itself.

alter table public.players add column avatar_path text check (
  avatar_path is null
  or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function private.can_upload_avatar(p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.photo_uploader(p_name) = auth.uid()
    and exists (
      select 1 from public.players p
      join public.games g on g.id = p.game_id
      where p.game_id = private.photo_game_id(p_name)
        and p.user_id = auth.uid()
        and g.status <> 'finished'
    )
$$;

create function private.can_view_avatar(p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.photo_uploader(p_name) = auth.uid()
    or private.is_member(private.photo_game_id(p_name))
$$;

revoke all on function private.can_upload_avatar(text) from public;
revoke all on function private.can_view_avatar(text) from public;
grant execute on function private.can_upload_avatar(text) to authenticated;
grant execute on function private.can_view_avatar(text) to authenticated;

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and private.can_upload_avatar(name));

create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and private.can_view_avatar(name));

-- Sets (or clears, with null) your avatar in a game.
create function public.set_avatar(p_game_id uuid, p_path text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me public.players := private.my_player(p_game_id);
begin
  if p_path is not null and not (
    private.photo_game_id(p_path) = p_game_id
    and private.photo_uploader(p_path) = auth.uid()
    and exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = p_path)
  ) then
    raise exception 'invalid_photo';
  end if;
  update public.players set avatar_path = p_path where id = v_me.id;
end;
$$;
revoke execute on function public.set_avatar(uuid, text) from public, anon;
grant execute on function public.set_avatar(uuid, text) to authenticated;

-- The claim details shown to the victim and host include avatars.
create or replace function private.player_json(p public.players)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'colour', p.colour, 'avatar_path', p.avatar_path)
$$;

-- Cleanup now removes avatars as well as kill photos.
create or replace function public.kill_photo_paths(p_game_ids uuid[])
returns setof text
language sql stable security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'kill-photos' and private.photo_game_id(o.name) = any (p_game_ids)
$$;

create function public.avatar_paths(p_game_ids uuid[])
returns setof text
language sql stable security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'avatars' and private.photo_game_id(o.name) = any (p_game_ids)
$$;
revoke all on function public.avatar_paths(uuid[]) from public, anon, authenticated;
grant execute on function public.avatar_paths(uuid[]) to service_role;
