-- Rematch: from a finished game, anyone in it can start a new game with the
-- same name, and everyone else can join it in one tap with their old name and
-- colour. The first tap creates it (and hosts it); later taps join it.

alter table public.games
  add column rematch_game_id uuid references public.games (id) on delete set null,
  add column rematch_code text;

-- Joins the rematch of a finished game as the same name and colour.
create function public.join_rematch(p_game_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_me public.players := private.my_player(p_game_id);
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.rematch_code is null then
    raise exception 'no_rematch';
  end if;
  return public.join_game(v_game.rematch_code, v_me.name, v_me.colour);
end;
$$;

-- Creates the rematch, or joins it if someone got there first.
create function public.create_rematch(p_game_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_new jsonb;
begin
  if v_game.status <> 'finished' then
    raise exception 'wrong_phase';
  end if;
  -- The game row is locked, so two simultaneous taps cannot both create one.
  if v_game.rematch_game_id is not null then
    return public.join_rematch(p_game_id);
  end if;

  v_new := public.create_game(v_game.name, v_me.name, v_me.colour);
  update public.games
  set rematch_game_id = (v_new->>'game_id')::uuid, rematch_code = v_new->>'code'
  where id = p_game_id;

  perform private.log_event(p_game_id, 'rematch_created', jsonb_build_object(
    'code', v_new->>'code', 'by_id', v_me.id, 'by_name', v_me.name));

  return v_new || jsonb_build_object('rejoined', false);
end;
$$;

revoke execute on function public.join_rematch(uuid) from public, anon;
revoke execute on function public.create_rematch(uuid) from public, anon;
grant execute on function public.join_rematch(uuid) to authenticated;
grant execute on function public.create_rematch(uuid) to authenticated;

-- Tell everyone else from the old game.
create function private.on_rematch_notify()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_code text;
  v_others uuid[];
begin
  select code into v_code from public.games where id = new.game_id;
  select array_agg(id) into v_others from public.players
  where game_id = new.game_id and id <> (new.payload->>'by_id')::uuid;
  perform private.notify_players(v_others,
    '🔁 Rematch! ' || coalesce(new.payload->>'by_name', 'Someone') || ' started a new game',
    'Tap to join in one go. Same names, new missions.',
    '/g/' || v_code || '/winner', 'rematch-' || new.game_id);
  return null;
end;
$$;
revoke all on function private.on_rematch_notify() from public, anon, authenticated;

create constraint trigger events_rematch_notify
  after insert on public.events
  deferrable initially deferred
  for each row
  when (new.type = 'rematch_created')
  execute function private.on_rematch_notify();
