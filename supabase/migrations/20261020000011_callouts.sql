-- Cutthroat call-outs.
--
-- A failed hand-over usually gives the hunter away. Any living player can name
-- who they think is hunting them:
--  * Right: the hunter is out ("rumbled") and the caller gets the kill. The
--    caller keeps their own mission. Whoever was hunting the rumbled player
--    takes over the caller as their target, with their OWN cards (the caller
--    has just seen the rumbled hunter's weapon and place, so those are burnt).
--  * Wrong: nothing happens in the game, nobody else is told, and the caller
--    can't call anyone out for 24 hours.
-- In the chain Hana -> Alex -> Tom -> Zoe, if Tom rumbles Alex the chain
-- becomes Hana -> Tom -> Zoe, and Tom's kill count goes up by one.

create table public.callouts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  accuser_id uuid not null references public.players (id) on delete cascade,
  accused_id uuid not null references public.players (id) on delete cascade,
  correct boolean not null,
  created_at timestamptz not null default now()
);
create index callouts_accuser_idx on public.callouts (accuser_id, created_at desc);

-- Your own call-outs only (wrong guesses stay secret). Writes go through the function.
alter table public.callouts enable row level security;
revoke all on public.callouts from anon, authenticated;
grant select on public.callouts to authenticated;
create policy callouts_select_own on public.callouts for select to authenticated
  using (accuser_id in (select private.my_player_ids()));

create function public.call_out_hunter(p_game_id uuid, p_suspect_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_suspect public.players;
  v_hunt public.missions;       -- the suspect's mission on me, if they really are my hunter
  v_above public.missions;      -- the mission on the suspect (Hana -> Alex)
  v_last_miss timestamptz;
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

  select * into v_suspect from public.players
  where id = p_suspect_id and game_id = p_game_id and status = 'alive'
  for update;
  if not found or v_suspect.id = v_me.id then
    raise exception 'player_not_found';
  end if;

  select max(created_at) into v_last_miss from public.callouts
  where accuser_id = v_me.id and not correct;
  if v_last_miss is not null and v_last_miss > now() - interval '24 hours' then
    raise exception 'callout_cooldown';
  end if;

  select * into v_hunt from public.missions
  where target_id = v_me.id and hunter_id = v_suspect.id and is_active;

  if v_hunt.id is null then
    insert into public.callouts (game_id, accuser_id, accused_id, correct)
    values (p_game_id, v_me.id, v_suspect.id, false);
    return jsonb_build_object('correct', false, 'retry_at', now() + interval '24 hours');
  end if;

  -- Rumbled.
  insert into public.callouts (game_id, accuser_id, accused_id, correct)
  values (p_game_id, v_me.id, v_suspect.id, true);

  -- Their open claims die with them, as do claims on them (the call-out came first).
  perform private.void_claims_by(v_suspect.id);
  update public.kills set status = 'rejected', resolved_at = now(), resolved_by = 'system'
  where victim_id = v_suspect.id and status in ('pending', 'disputed');

  update public.players set status = 'dead', died_at = now(), killed_by = v_me.id
  where id = v_suspect.id;
  update public.players set kills_count = kills_count + 1 where id = v_me.id;

  -- The rumbled hunter's mission (on me) ends, and so does the one on them.
  update public.missions set is_active = false, ended_at = now() where id = v_hunt.id;
  update public.missions set is_active = false, ended_at = now()
  where target_id = v_suspect.id and is_active
  returning * into v_above;

  -- Their hunter now hunts me, keeping their own cards. (If their hunter is me,
  -- only the two of us were left and the winner check below ends the game.)
  if v_above.id is not null and v_above.hunter_id <> v_me.id then
    insert into public.missions (
      game_id, hunter_id, target_id, weapon_card_id, place_card_id, phrase_card_id, inherited_from
    ) values (
      p_game_id, v_above.hunter_id, v_me.id,
      v_above.weapon_card_id, v_above.place_card_id, v_above.phrase_card_id, v_hunt.id
    );
  end if;

  -- Public, like a kill. It never says who hunts the caller now.
  perform private.log_event(p_game_id, 'rumbled', jsonb_build_object(
    'hunter_id', v_suspect.id,
    'hunter_name', v_suspect.name,
    'by_id', v_me.id,
    'by_name', v_me.name
  ));

  if v_suspect.is_host then
    perform private.transfer_host(p_game_id, v_suspect.id);
  end if;
  perform private.check_winner(p_game_id);
  return jsonb_build_object('correct', true);
end;
$$;
revoke execute on function public.call_out_hunter(uuid, uuid) from public, anon;
grant execute on function public.call_out_hunter(uuid, uuid) to authenticated;

-- Notifications: the existing trigger, plus rumbles.
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
  v_new_hunter uuid;
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

  elsif new.type = 'rumbled' then
    v_victim := (p->>'hunter_id')::uuid;   -- the hunter who got caught
    v_killer := (p->>'by_id')::uuid;       -- the target who called them out

    perform private.notify_players(array[v_victim], '🕵️ You''ve been rumbled',
      coalesce(p->>'by_name', 'Your target') || ' called you out. You''re out of the game.',
      '/g/' || v_game.code, 'out-' || v_victim);

    if v_game.status = 'finished' then
      return null;
    end if;

    -- Whoever hunts the caller now (they took over from the rumbled hunter).
    select hunter_id into v_new_hunter from public.missions
    where target_id = v_killer and is_active;
    if v_new_hunter is not null then
      perform private.notify_players(array[v_new_hunter], 'Your target is out',
        coalesce(p->>'hunter_name', 'They') || ' was rumbled. You have a new target.',
        '/g/' || v_game.code || '/new-mission', 'mission-' || v_new_hunter);
    end if;

    select count(*) into v_alive from public.players
    where game_id = new.game_id and status = 'alive';
    select array_agg(id) into v_others from public.players
    where game_id = new.game_id and id not in (v_killer, v_victim)
      and id is distinct from v_new_hunter;
    perform private.notify_players(v_others,
      '🕵️ ' || coalesce(p->>'by_name', 'Someone') || ' rumbled ' || coalesce(p->>'hunter_name', 'their hunter'),
      v_alive || ' left. Trust no one.',
      '/g/' || v_game.code || '/board?tab=feed', 'feed-' || v_game.id);

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
