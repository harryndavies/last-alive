-- Reactions and comments on confirmed kills. They hang off the feed event
-- (kills themselves are private to killer and victim; the feed is public).
-- Anyone in the game can react and comment, dead players included.

create table public.kill_reactions (
  event_id bigint not null references public.events (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  emoji text not null check (emoji in ('💀', '😂', '🔥', '😱', '👏')),
  created_at timestamptz not null default now(),
  primary key (event_id, player_id, emoji)
);
create index kill_reactions_game_idx on public.kill_reactions (game_id);

create table public.kill_comments (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200 and body = btrim(body)),
  created_at timestamptz not null default clock_timestamp()
);
create index kill_comments_game_idx on public.kill_comments (game_id, created_at);

alter table public.kill_reactions enable row level security;
alter table public.kill_comments enable row level security;

create policy kill_reactions_select_members on public.kill_reactions
  for select to authenticated using (private.is_member(game_id));
create policy kill_comments_select_members on public.kill_comments
  for select to authenticated using (private.is_member(game_id));

revoke all on public.kill_reactions, public.kill_comments from anon, authenticated;
grant select on public.kill_reactions, public.kill_comments to authenticated;

alter publication supabase_realtime add table public.kill_reactions, public.kill_comments;

-- The caller's seat in the game of a kill event, or an error.
create function private.kill_event_seat(p_event_id bigint)
returns public.players
language plpgsql
set search_path = ''
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.type <> 'kill_confirmed' then
    raise exception 'kill_not_found';
  end if;
  return private.my_player(v_event.game_id);
end;
$$;

-- Adds the reaction, or removes it if you already had it. Returns true if it is now on.
create function public.toggle_reaction(p_event_id bigint, p_emoji text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me public.players := private.kill_event_seat(p_event_id);
begin
  if p_emoji is null or p_emoji not in ('💀', '😂', '🔥', '😱', '👏') then
    raise exception 'invalid_reaction';
  end if;
  delete from public.kill_reactions
  where event_id = p_event_id and player_id = v_me.id and emoji = p_emoji;
  if found then
    return false;
  end if;
  insert into public.kill_reactions (event_id, game_id, player_id, emoji)
  values (p_event_id, v_me.game_id, v_me.id, p_emoji);
  return true;
end;
$$;

create function public.add_comment(p_event_id bigint, p_body text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_me public.players := private.kill_event_seat(p_event_id);
  v_body text := regexp_replace(btrim(coalesce(p_body, '')), '\s+', ' ', 'g');
  v_id uuid;
begin
  if char_length(v_body) < 1 or char_length(v_body) > 200 then
    raise exception 'invalid_comment';
  end if;
  -- Light flood protection: one comment every 3 seconds per player.
  if exists (
    select 1 from public.kill_comments
    where player_id = v_me.id and created_at > clock_timestamp() - interval '3 seconds'
  ) then
    raise exception 'slow_down';
  end if;
  insert into public.kill_comments (event_id, game_id, player_id, body)
  values (p_event_id, v_me.game_id, v_me.id, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

-- Your own comment, or any comment if you are the host.
create function public.delete_comment(p_comment_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_comment public.kill_comments;
  v_me public.players;
begin
  select * into v_comment from public.kill_comments where id = p_comment_id;
  if not found then
    return;
  end if;
  v_me := private.my_player(v_comment.game_id);
  if v_comment.player_id <> v_me.id and not v_me.is_host then
    raise exception 'not_allowed';
  end if;
  delete from public.kill_comments where id = p_comment_id;
end;
$$;

revoke execute on function public.toggle_reaction(bigint, text) from public, anon;
revoke execute on function public.add_comment(bigint, text) from public, anon;
revoke execute on function public.delete_comment(uuid) from public, anon;
grant execute on function public.toggle_reaction(bigint, text) to authenticated;
grant execute on function public.add_comment(bigint, text) to authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;
revoke all on function private.kill_event_seat(bigint) from public, anon, authenticated;

-- Push the killer and victim when someone else comments on their kill.
create function private.on_comment_notify()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  p jsonb;
  v_code text;
  v_author text;
  v_targets uuid[];
begin
  select payload into p from public.events where id = new.event_id;
  select code into v_code from public.games where id = new.game_id;
  select name into v_author from public.players where id = new.player_id;
  if p is null then
    return null;
  end if;
  select array_agg(x) into v_targets
  from unnest(array[(p->>'killer_id')::uuid, (p->>'victim_id')::uuid]) x
  where x <> new.player_id;
  perform private.notify_players(
    v_targets,
    '💬 ' || v_author || ' on ' || coalesce(p->>'killer_name', 'someone') || ' getting '
      || coalesce(p->>'victim_name', 'someone'),
    left(new.body, 120),
    '/g/' || v_code || '/board?tab=feed',
    'comments-' || new.event_id
  );
  return null;
end;
$$;
revoke all on function private.on_comment_notify() from public, anon, authenticated;

create constraint trigger kill_comments_notify
  after insert on public.kill_comments
  deferrable initially deferred
  for each row execute function private.on_comment_notify();
