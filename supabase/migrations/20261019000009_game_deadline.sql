-- Optional game deadline ("end by"), with a sudden-death finale.
--
-- * The host sets ends_at before the start (any future time, or none), and may
--   only extend it once the game is running.
-- * Sudden death: the last 24 hours, or the last quarter of a shorter game.
--   During it, any living player may claim any other, with any weapon, anywhere.
--   Credit goes to the killer; the victim's mission passes to whoever was
--   hunting them, so the circle stays whole.
-- * At the deadline no new claims are accepted. Claims made before it can still
--   be answered; once none are open (or 12 hours after the deadline at most)
--   the game ends. Winner: most kills among survivors; ties go to whoever made
--   their latest kill first, then to the longest-standing player.

alter table public.games
  add column ends_at timestamptz,
  add column sudden_death_announced_at timestamptz,
  add column final_hour_announced_at timestamptz;

alter table public.kills add column sudden_death boolean not null default false;

-- When sudden death begins for a game (null if it has no deadline).
create function private.sudden_death_from(p_game public.games)
returns timestamptz
language sql immutable
set search_path = ''
as $$
  select case when p_game.ends_at is null then null
    else p_game.ends_at - least(
      interval '24 hours',
      (p_game.ends_at - coalesce(p_game.started_at, p_game.created_at)) / 4
    )
  end
$$;

create function private.in_sudden_death(p_game public.games)
returns boolean
language sql stable
set search_path = ''
as $$
  select p_game.status = 'active' and p_game.ends_at is not null
    and now() >= private.sudden_death_from(p_game) and now() < p_game.ends_at
$$;

-- ---------------------------------------------------------------------------
-- Setting the deadline
-- ---------------------------------------------------------------------------
create function public.set_game_end(p_game_id uuid, p_ends_at timestamptz default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
begin
  if not v_me.is_host then
    raise exception 'not_host';
  end if;
  if v_game.status = 'finished' then
    raise exception 'wrong_phase';
  end if;
  if p_ends_at is not null and p_ends_at < now() + interval '1 hour' then
    raise exception 'end_too_soon';
  end if;

  if v_game.status = 'active' then
    -- Mid-game the deadline can only move later, never earlier or away.
    if v_game.ends_at is null or p_ends_at is null or p_ends_at <= v_game.ends_at then
      raise exception 'can_only_extend';
    end if;
    update public.games set ends_at = p_ends_at, final_hour_announced_at = null,
      sudden_death_announced_at = case
        when now() < private.sudden_death_from(v_game) then sudden_death_announced_at
        else null end
    where id = p_game_id;
    perform private.log_event(p_game_id, 'deadline_extended', jsonb_build_object('ends_at', p_ends_at));
    return;
  end if;

  update public.games set ends_at = p_ends_at where id = p_game_id;
  perform private.log_event(p_game_id, 'deadline_set', jsonb_build_object('ends_at', p_ends_at));
end;
$$;
revoke execute on function public.set_game_end(uuid, timestamptz) from public, anon;
grant execute on function public.set_game_end(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Claims: sudden death lets you claim anyone; nothing after the deadline.
-- ---------------------------------------------------------------------------
drop function public.report_kill(uuid, uuid, text, text);

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
  v_victim public.players;
  v_existing public.kills;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_sudden boolean := false;
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

  select * into v_mission from public.missions where hunter_id = v_me.id and is_active;
  if not found then
    raise exception 'not_your_target';
  end if;

  if v_mission.target_id <> p_victim_id then
    -- Off-mission claims are only allowed in sudden death.
    select * into v_victim from public.players
    where id = p_victim_id and game_id = p_game_id and status = 'alive';
    if not private.in_sudden_death(v_game) or v_victim.id is null or v_victim.id = v_me.id then
      raise exception 'not_your_target';
    end if;
    v_sudden := true;
  end if;

  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'note_too_long';
  end if;
  if p_photo_path is not null and not private.is_own_kill_photo(p_photo_path, p_game_id) then
    raise exception 'invalid_photo';
  end if;

  -- One open claim per hunter. Double taps on the same person return it.
  select * into v_existing from public.kills
  where mission_id = v_mission.id and status in ('pending', 'disputed');
  if found then
    if v_existing.victim_id <> p_victim_id then
      raise exception 'claim_already_open';
    end if;
    if p_photo_path is not null then
      update public.kills set photo_path = coalesce(photo_path, p_photo_path) where id = v_existing.id;
    end if;
    return v_existing.id;
  end if;

  insert into public.kills (game_id, mission_id, killer_id, victim_id, note, photo_path, sudden_death)
  values (p_game_id, v_mission.id, v_me.id, p_victim_id, v_note, p_photo_path, v_sudden)
  returning id into v_kill_id;
  return v_kill_id;
end;
$$;
revoke execute on function public.report_kill(uuid, uuid, text, text) from public, anon;
grant execute on function public.report_kill(uuid, uuid, text, text) to authenticated;

-- Confirming: works for sudden-death victims too. The victim's mission goes to
-- whoever was hunting them (normally the killer).
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
  v_victim_hunter uuid;
begin
  select * into v_kill from public.kills where id = p_kill_id;
  if not found then
    raise exception 'kill_not_found';
  end if;
  perform private.lock_game(v_kill.game_id);
  select * into v_kill from public.kills where id = p_kill_id for update;

  if v_kill.status = 'confirmed' or v_kill.status = 'rejected' then
    return v_kill.status;
  end if;

  select * into v_killer from public.players where id = v_kill.killer_id for update;
  select * into v_victim from public.players where id = v_kill.victim_id for update;
  select * into v_mission from public.missions where hunter_id = v_killer.id and is_active;

  -- The world moved on (someone left, game ended): the claim no longer applies.
  if v_killer.status <> 'alive' or v_victim.status <> 'alive' or v_mission.id is null
    or (not v_kill.sudden_death and v_mission.target_id <> v_victim.id) then
    update public.kills set status = 'rejected', resolved_at = now(), resolved_by = 'system'
    where id = v_kill.id;
    return 'rejected';
  end if;

  update public.kills set status = 'confirmed', resolved_at = now(), resolved_by = p_resolved_by
  where id = v_kill.id;
  update public.players set status = 'dead', died_at = now(), killed_by = v_killer.id
  where id = v_victim.id;
  update public.players set kills_count = kills_count + 1 where id = v_killer.id;

  perform private.void_claims_by(v_victim.id);
  select hunter_id into v_victim_hunter from public.missions where target_id = v_victim.id and is_active;
  if v_victim_hunter is not null then
    perform private.pass_mission_on(v_victim.id, v_victim_hunter);
  end if;

  perform private.log_event(v_kill.game_id, 'kill_confirmed', jsonb_build_object(
    'kill_id', v_kill.id,
    'killer_id', v_killer.id,
    'killer_name', v_killer.name,
    'victim_id', v_victim.id,
    'victim_name', v_victim.name,
    'note', v_kill.note,
    'resolved_by', p_resolved_by,
    'photo_path', v_kill.photo_path,
    'sudden_death', v_kill.sudden_death,
    'weapon', case when v_kill.sudden_death then null
      else (select text from public.cards where id = v_mission.weapon_card_id) end,
    'place', case when v_kill.sudden_death then null
      else (select text from public.cards where id = v_mission.place_card_id) end,
    'phrase', case when v_kill.sudden_death then null
      else (select text from public.cards where id = v_mission.phrase_card_id) end
  ));

  perform private.check_winner(v_kill.game_id);
  return 'confirmed';
end;
$$;
revoke all on function private.confirm_kill(uuid, text) from public, anon, authenticated;

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
    'sudden_death', v_kill.sudden_death,
    -- A sudden-death kill needs no particular weapon, place or phrase.
    'weapon', case when v_kill.sudden_death then null
      else (select text from public.cards where id = v_mission.weapon_card_id) end,
    'place', case when v_kill.sudden_death then null
      else (select text from public.cards where id = v_mission.place_card_id) end,
    'phrase', case when v_kill.sudden_death then null
      else (select text from public.cards where id = v_mission.phrase_card_id) end,
    'note', v_kill.note,
    'photo_path', v_kill.photo_path,
    'created_at', v_kill.created_at,
    'auto_confirm_at', v_kill.created_at + interval '12 hours'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Finishing
-- ---------------------------------------------------------------------------
create function private.finish_game(p_game_id uuid, p_winner_id uuid, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_winner public.players;
begin
  select * into v_winner from public.players where id = p_winner_id;

  update public.missions set is_active = false, ended_at = now()
  where game_id = p_game_id and is_active;
  update public.kills set status = 'rejected', resolved_at = now(), resolved_by = 'system'
  where game_id = p_game_id and status in ('pending', 'disputed');
  update public.games
  set status = 'finished', finished_at = now(), winner_player_id = v_winner.id
  where id = p_game_id;

  perform private.log_event(p_game_id, 'game_finished', jsonb_build_object(
    'winner_id', v_winner.id, 'winner_name', v_winner.name, 'reason', p_reason));
end;
$$;

create or replace function private.check_winner(p_game_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_winner uuid;
begin
  if (select count(*) from public.players where game_id = p_game_id and status = 'alive') > 1 then
    return false;
  end if;
  select id into v_winner from public.players where game_id = p_game_id and status = 'alive' limit 1;
  perform private.finish_game(p_game_id, v_winner, 'last_alive');
  return true;
end;
$$;

-- The survivor with most kills; ties: earliest latest kill, then longest-standing.
create function private.deadline_winner(p_game_id uuid)
returns uuid
language sql stable
set search_path = ''
as $$
  select p.id
  from public.players p
  left join lateral (
    select max(k.resolved_at) as last_kill
    from public.kills k
    where k.killer_id = p.id and k.status = 'confirmed'
  ) lk on true
  where p.game_id = p_game_id and p.status = 'alive'
  order by p.kills_count desc, lk.last_kill asc nulls last, p.created_at asc
  limit 1
$$;

-- Runs every few minutes: announces sudden death and the final hour, and ends
-- games whose deadline has passed. Returns the number of games ended.
create function private.tick_deadlines()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games;
  v_ended integer := 0;
begin
  for v_game in
    select * from public.games
    where status = 'active' and ends_at is not null
      and now() >= private.sudden_death_from(games)
  loop
    perform private.lock_game(v_game.id);
    select * into v_game from public.games where id = v_game.id;
    continue when v_game.status <> 'active';

    if now() >= v_game.ends_at then
      -- Let claims made before the deadline be answered, but not forever.
      if exists (select 1 from public.kills where game_id = v_game.id and status in ('pending', 'disputed'))
        and now() < v_game.ends_at + interval '12 hours' then
        continue;
      end if;
      perform private.finish_game(v_game.id, private.deadline_winner(v_game.id), 'time');
      v_ended := v_ended + 1;
      continue;
    end if;

    if v_game.sudden_death_announced_at is null then
      update public.games set sudden_death_announced_at = now() where id = v_game.id;
      perform private.log_event(v_game.id, 'sudden_death_started',
        jsonb_build_object('ends_at', v_game.ends_at));
    end if;
    if v_game.final_hour_announced_at is null and now() >= v_game.ends_at - interval '1 hour' then
      update public.games set final_hour_announced_at = now() where id = v_game.id;
      perform private.log_event(v_game.id, 'final_hour', jsonb_build_object('ends_at', v_game.ends_at));
    end if;
  end loop;
  return v_ended;
end;
$$;

revoke all on function private.finish_game(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.check_winner(uuid) from public, anon, authenticated;
revoke all on function private.deadline_winner(uuid) from public, anon, authenticated;
revoke all on function private.tick_deadlines() from public, anon, authenticated;
revoke all on function private.sudden_death_from(public.games) from public, anon, authenticated;
revoke all on function private.in_sudden_death(public.games) from public, anon, authenticated;

select cron.schedule('last-alive-deadlines', '* * * * *', $$select private.tick_deadlines()$$);

-- ---------------------------------------------------------------------------
-- Notifications for the new moments
-- ---------------------------------------------------------------------------
create or replace function private.on_event_notify()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_all uuid[];
  v_alive_ids uuid[];
  v_killer uuid;
  v_victim uuid;
  v_alive integer;
  v_others uuid[];
  p jsonb := new.payload;
begin
  select * into v_game from public.games where id = new.game_id;
  if not found then
    return null;
  end if;
  select array_agg(id) into v_all from public.players where game_id = new.game_id;
  select array_agg(id) into v_alive_ids from public.players
  where game_id = new.game_id and status = 'alive';

  if new.type = 'picking_started' then
    perform private.notify_players(v_all, 'Time to pick your cards',
      'Write a weapon, a place and a phrase for the deck.',
      '/g/' || v_game.code || '/cards', 'phase-' || v_game.id);

  elsif new.type = 'game_started' then
    perform private.notify_players(v_all, 'The hunt is on',
      'Your secret mission is waiting. Keep your screen to yourself.',
      '/g/' || v_game.code || '/mission', 'phase-' || v_game.id);

  elsif new.type = 'sudden_death_started' then
    perform private.notify_players(v_alive_ids, '⚡ Sudden death',
      'Anyone can get anyone now. Any weapon, any place. Trust no one.',
      '/g/' || v_game.code, 'deadline-' || v_game.id);

  elsif new.type = 'final_hour' then
    perform private.notify_players(v_all, '⏱ One hour left',
      'Most kills among survivors wins when the clock runs out.',
      '/g/' || v_game.code, 'deadline-' || v_game.id);

  elsif new.type = 'deadline_extended' then
    perform private.notify_players(v_all, '⏱ The game has been extended',
      'The host moved the deadline. More time to hunt.',
      '/g/' || v_game.code, 'deadline-' || v_game.id);

  elsif new.type = 'game_finished' then
    perform private.notify_players(v_all,
      case when p->>'reason' = 'time' then '⏱ Time''s up! ' else '♛ ' end
        || coalesce(p->>'winner_name', 'Someone') || ' wins',
      case when p->>'reason' = 'time' then 'Most kills among the survivors. Watch the kill cam.'
        else 'Last one alive. Watch the kill cam.' end,
      '/g/' || v_game.code || '/killcam', 'phase-' || v_game.id);

  elsif new.type = 'kill_confirmed' then
    v_killer := (p->>'killer_id')::uuid;
    v_victim := (p->>'victim_id')::uuid;

    if p->>'resolved_by' is distinct from 'victim' then
      perform private.notify_players(array[v_victim], 'You''re out',
        coalesce(p->>'killer_name', 'Someone') || ' got you.'
          || case p->>'resolved_by'
               when 'auto' then ' No answer in 12 hours, so it counts.'
               when 'host' then ' The host upheld the kill.'
               else '' end,
        '/g/' || v_game.code, 'out-' || v_victim);
    end if;

    if v_game.status = 'finished' then
      return null;
    end if;

    perform private.notify_players(array[v_killer],
      'Confirmed: you got ' || coalesce(p->>'victim_name', 'them'),
      case when (p->>'sudden_death')::boolean then 'Sudden-death kill. Keep going.'
        else 'Their mission is yours now. Check your new target.' end,
      '/g/' || v_game.code ||
        case when (p->>'sudden_death')::boolean then '' else '/new-mission' end,
      'mission-' || v_killer);

    select count(*) into v_alive from public.players
    where game_id = new.game_id and status = 'alive';
    select array_agg(id) into v_others from public.players
    where game_id = new.game_id and id not in (v_killer, v_victim);
    perform private.notify_players(v_others,
      '💀 ' || coalesce(p->>'killer_name', 'Someone') || ' got ' || coalesce(p->>'victim_name', 'someone'),
      v_alive || ' left. Trust no one.',
      '/g/' || v_game.code || '/board?tab=feed', 'feed-' || v_game.id);
  end if;
  return null;
end;
$$;
