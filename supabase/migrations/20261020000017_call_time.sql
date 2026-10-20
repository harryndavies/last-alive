-- Call time: in a game with no end time, the host can set one mid-game, at
-- least 48 hours away so everyone gets fair warning. The usual deadline rules
-- then apply (the last 24 hours are sudden death). Everyone is told who did it.

create function public.call_time(p_game_id uuid, p_ends_at timestamptz)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_all uuid[];
begin
  if not v_me.is_host then
    raise exception 'not_host';
  end if;
  if v_game.status <> 'active' then
    raise exception 'wrong_phase';
  end if;
  if v_game.ends_at is not null then
    raise exception 'already_has_end';
  end if;
  if p_ends_at is null or p_ends_at < now() + interval '48 hours' then
    raise exception 'call_time_too_soon';
  end if;

  update public.games set ends_at = p_ends_at, final_hour_announced_at = null,
    sudden_death_announced_at = null
  where id = p_game_id;

  perform private.log_event(p_game_id, 'time_called', jsonb_build_object(
    'ends_at', p_ends_at, 'by_id', v_me.id, 'by_name', v_me.name));

  select array_agg(id) into v_all from public.players
  where game_id = p_game_id and id <> v_me.id;
  if v_all is not null then
    perform private.notify_players(v_all, '⏱ Time has been called',
      v_me.name || ' set an end time for ' || v_game.name
        || '. The last 24 hours are sudden death.',
      '/g/' || v_game.code, 'time-' || p_game_id);
  end if;
end;
$$;

revoke all on function public.call_time(uuid, timestamptz) from public, anon;
grant execute on function public.call_time(uuid, timestamptz) to authenticated;
