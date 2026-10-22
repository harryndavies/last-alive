-- "I've been got": the victim reports their own death, for when the killer
-- forgets to. The victim saying so is the confirmation, so it counts at once
-- and goes through the normal kill flow (stats, missions passed on, feed,
-- pushes). The killer is your hunter; in sudden death you say who it was.

create function public.report_own_death(p_game_id uuid, p_killer_id uuid default null)
returns public.kill_status
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_hunter uuid;
  v_killer public.players;
  v_mission public.missions;
  v_claim public.kills;
  v_kill_id uuid;
begin
  if v_game.status <> 'active' then
    raise exception 'wrong_phase';
  end if;
  if v_game.ends_at is not null and now() >= v_game.ends_at then
    raise exception 'times_up';
  end if;
  if v_me.status <> 'alive' then
    raise exception 'you_are_dead';
  end if;

  select hunter_id into v_hunter from public.missions where target_id = v_me.id and is_active;

  -- Someone already claimed you: confirm that (unless you're naming someone else).
  select * into v_claim from public.kills
  where victim_id = v_me.id and status in ('pending', 'disputed')
  order by created_at desc limit 1;
  if found and (p_killer_id is null or p_killer_id = v_claim.killer_id) then
    return private.confirm_kill(v_claim.id, 'victim');
  end if;

  select * into v_killer from public.players
  where id = coalesce(p_killer_id, v_hunter) and game_id = p_game_id and status = 'alive';
  if not found or v_killer.id = v_me.id then
    raise exception 'player_not_found';
  end if;
  -- Outside sudden death, only your hunter can have got you.
  if v_killer.id is distinct from v_hunter and not private.in_sudden_death(v_game) then
    raise exception 'not_your_hunter';
  end if;

  select * into v_mission from public.missions where hunter_id = v_killer.id and is_active;
  if not found then
    raise exception 'player_not_found';
  end if;

  -- Their open claim on someone else gives way to your confession (sudden death only).
  update public.kills set status = 'rejected', resolved_at = now(), resolved_by = 'system'
  where mission_id = v_mission.id and status in ('pending', 'disputed');

  insert into public.kills (game_id, mission_id, killer_id, victim_id, sudden_death)
  values (p_game_id, v_mission.id, v_killer.id, v_me.id, v_mission.target_id <> v_me.id)
  returning id into v_kill_id;

  return private.confirm_kill(v_kill_id, 'victim');
end;
$$;

revoke all on function public.report_own_death(uuid, uuid) from public, anon;
grant execute on function public.report_own_death(uuid, uuid) to authenticated;
