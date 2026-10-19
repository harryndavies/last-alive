-- Game themes. The host picks how the game looks and reads for everyone in it:
-- 'classic' (the default) or 'spy' (Cold War dossier). Purely presentational:
-- no rules change with the theme.

alter table public.games
  add column theme text not null default 'classic'
  check (theme in ('classic', 'spy'));

-- The host can change the theme until the game is over.
create function public.set_game_theme(p_game_id uuid, p_theme text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
begin
  perform private.my_player(p_game_id);
  if not private.is_host(p_game_id) then
    raise exception 'not_host';
  end if;
  if v_game.status = 'finished' then
    raise exception 'wrong_phase';
  end if;
  if p_theme is null or p_theme not in ('classic', 'spy') then
    raise exception 'invalid_theme';
  end if;
  update public.games set theme = p_theme where id = p_game_id;
end;
$$;
revoke execute on function public.set_game_theme(uuid, text) from public, anon;
grant execute on function public.set_game_theme(uuid, text) to authenticated;

-- Rematches keep the theme.
create or replace function public.create_rematch(p_game_id uuid)
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
  -- The rematch keeps the look the group chose.
  update public.games set theme = v_game.theme where id = (v_new->>'game_id')::uuid;

  perform private.log_event(p_game_id, 'rematch_created', jsonb_build_object(
    'code', v_new->>'code', 'by_id', v_me.id, 'by_name', v_me.name));

  return v_new || jsonb_build_object('rejoined', false);
end;
$$;
