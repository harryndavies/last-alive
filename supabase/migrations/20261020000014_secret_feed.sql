-- Secret feed (on by default).
--
-- While a game is running, players who are still alive learn WHO is out but
-- never WHO got them: the killer, their cards, note and photo, and kill
-- counts are hidden, because "Alex got Ben" tells you who is hunting whom.
-- Players who are out see everything, and so does everyone once the game
-- ends. The killer and the victim always see their own kill.
--
-- It's enforced here, not in the app:
--  * events keep only the public part of a kill or rumble; the rest moves to
--    event_details, readable only by those allowed;
--  * kills_count and killed_by move from players (which Realtime sends whole
--    to everyone) to player_stats, with the same rule;
--  * kill photos, push notifications and comment pushes follow it too.

alter table public.games add column secret_feed boolean not null default true;

-- Does the caller get the full story in this game?
create function private.sees_everything(p_game_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.games g
      where g.id = p_game_id and (not g.secret_feed or g.status = 'finished')
    )
    or exists (
      select 1 from public.players p
      where p.game_id = p_game_id and p.user_id = auth.uid() and p.status = 'dead'
    )
$$;
revoke all on function private.sees_everything(uuid) from public;
grant execute on function private.sees_everything(uuid) to authenticated;

-- Host-only, before the game starts (switching mid-game would leak).
create function public.set_secret_feed(p_game_id uuid, p_on boolean)
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
  if v_game.status not in ('lobby', 'picking') then
    raise exception 'wrong_phase';
  end if;
  update public.games set secret_feed = coalesce(p_on, true) where id = p_game_id;
end;
$$;
revoke execute on function public.set_secret_feed(uuid, boolean) from public, anon;
grant execute on function public.set_secret_feed(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Kill counts and who got whom
-- ---------------------------------------------------------------------------

create table public.player_stats (
  player_id uuid primary key references public.players (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  kills_count integer not null default 0 check (kills_count >= 0),
  killed_by uuid references public.players (id) on delete set null
);
create index player_stats_game_idx on public.player_stats (game_id);

insert into public.player_stats (player_id, game_id, kills_count, killed_by)
select id, game_id, kills_count, killed_by from public.players;

-- Every seat gets a row.
create function private.on_player_created()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.player_stats (player_id, game_id) values (new.id, new.game_id);
  return new;
end;
$$;
revoke all on function private.on_player_created() from public, anon, authenticated;
create trigger players_stats_row after insert on public.players
  for each row execute function private.on_player_created();

alter table public.player_stats enable row level security;
-- Supabase grants new tables to clients by default: read-only, like the rest.
revoke all on public.player_stats from anon, authenticated;
grant select on public.player_stats to authenticated;
-- Your own row always (you know your kills, and who got you); everyone's once
-- you see everything.
create policy player_stats_select on public.player_stats for select to authenticated
  using (player_id in (select private.my_player_ids()) or private.sees_everything(game_id));
alter publication supabase_realtime add table public.player_stats;

-- ---------------------------------------------------------------------------
-- The secret half of feed events
-- ---------------------------------------------------------------------------

create table public.event_details (
  event_id bigint primary key references public.events (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  details jsonb not null,
  -- Players who may always see these details (the killer and the victim).
  involved uuid[] not null default '{}'
);
create index event_details_game_idx on public.event_details (game_id);

alter table public.event_details enable row level security;
revoke all on public.event_details from anon, authenticated;
grant select on public.event_details to authenticated;
create policy event_details_select on public.event_details for select to authenticated
  using (
    private.sees_everything(game_id)
    or exists (select 1 from unnest(involved) x where x in (select private.my_player_ids()))
  );
alter publication supabase_realtime add table public.event_details;

create function private.log_secret_event(
  p_game_id uuid, p_type text, p_payload jsonb, p_details jsonb, p_involved uuid[]
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.events (game_id, type, payload) values (p_game_id, p_type, p_payload)
  returning id into v_id;
  insert into public.event_details (event_id, game_id, details, involved)
  values (v_id, p_game_id, p_details, p_involved);
end;
$$;
revoke all on function private.log_secret_event(uuid, text, jsonb, jsonb, uuid[]) from public, anon, authenticated;

-- Who gets which version of a notification: those who see everything, and the
-- rest. Leaves out the given players (they get their own messages).
create function private.split_audience(
  p_game_id uuid, p_except uuid[], out p_insiders uuid[], out p_outsiders uuid[]
)
language sql stable
set search_path = ''
as $$
  select
    array_agg(p.id) filter (where not g.secret_feed or g.status = 'finished' or p.status = 'dead'),
    array_agg(p.id) filter (where g.secret_feed and g.status <> 'finished' and p.status <> 'dead')
  from public.players p
  join public.games g on g.id = p.game_id
  where p.game_id = p_game_id and p.id <> all (coalesce(array_remove(p_except, null), '{}'))
$$;
revoke all on function private.split_audience(uuid, uuid[]) from public, anon, authenticated;

-- Existing games: move the secret half of past kills and rumbles across.
insert into public.event_details (event_id, game_id, details, involved)
select e.id, e.game_id,
  e.payload - 'kill_id' - 'victim_id' - 'victim_name' - 'resolved_by' - 'sudden_death',
  array_remove(array[(e.payload->>'killer_id')::uuid, (e.payload->>'victim_id')::uuid], null)
from public.events e where e.type = 'kill_confirmed';
update public.events
set payload = jsonb_strip_nulls(jsonb_build_object(
  'kill_id', payload->'kill_id', 'victim_id', payload->'victim_id', 'victim_name', payload->'victim_name',
  'resolved_by', payload->'resolved_by', 'sudden_death', payload->'sudden_death'))
where type = 'kill_confirmed';

insert into public.event_details (event_id, game_id, details, involved)
select e.id, e.game_id, jsonb_build_object('by_id', e.payload->'by_id', 'by_name', e.payload->'by_name'),
  array_remove(array[(e.payload->>'by_id')::uuid, (e.payload->>'hunter_id')::uuid], null)
from public.events e where e.type = 'rumbled';
update public.events
set payload = jsonb_build_object('hunter_id', payload->'hunter_id', 'hunter_name', payload->'hunter_name')
where type = 'rumbled';

-- ---------------------------------------------------------------------------
-- Functions that wrote or read the old columns and payloads
-- ---------------------------------------------------------------------------

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
  update public.players set status = 'dead', died_at = now() where id = v_victim.id;
  update public.player_stats set killed_by = v_killer.id where player_id = v_victim.id;
  update public.player_stats set kills_count = kills_count + 1 where player_id = v_killer.id;

  perform private.void_claims_by(v_victim.id);
  select hunter_id into v_victim_hunter from public.missions where target_id = v_victim.id and is_active;
  if v_victim_hunter is not null then
    perform private.pass_mission_on(v_victim.id, v_victim_hunter);
  end if;

  -- Everyone learns who is out; who did it (and how) stays secret while the
  -- feed is secret, except from the killer and the victim.
  perform private.log_secret_event(v_kill.game_id, 'kill_confirmed',
    jsonb_build_object(
      'kill_id', v_kill.id,
      'victim_id', v_victim.id,
      'victim_name', v_victim.name,
      'resolved_by', p_resolved_by,
      'sudden_death', v_kill.sudden_death
    ),
    jsonb_build_object(
      'killer_id', v_killer.id,
      'killer_name', v_killer.name,
      'note', v_kill.note,
      'photo_path', v_kill.photo_path,
      'weapon', case when v_kill.sudden_death then null
        else (select text from public.cards where id = v_mission.weapon_card_id) end,
      'place', case when v_kill.sudden_death then null
        else (select text from public.cards where id = v_mission.place_card_id) end,
      'phrase', case when v_kill.sudden_death then null
        else (select text from public.cards where id = v_mission.phrase_card_id) end
    ),
    array[v_killer.id, v_victim.id]
  );

  perform private.check_winner(v_kill.game_id);
  return 'confirmed';
end;
$$;

create or replace function public.call_out_hunter(p_game_id uuid, p_suspect_id uuid)
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

  update public.players set status = 'dead', died_at = now() where id = v_suspect.id;
  update public.player_stats set killed_by = v_me.id where player_id = v_suspect.id;
  update public.player_stats set kills_count = kills_count + 1 where player_id = v_me.id;

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

  -- Public: who was exposed. Secret (while the feed is): who exposed them.
  -- It never says who hunts the caller now.
  perform private.log_secret_event(p_game_id, 'rumbled',
    jsonb_build_object('hunter_id', v_suspect.id, 'hunter_name', v_suspect.name),
    jsonb_build_object('by_id', v_me.id, 'by_name', v_me.name),
    array[v_me.id, v_suspect.id]
  );

  if v_suspect.is_host then
    perform private.transfer_host(p_game_id, v_suspect.id);
  end if;
  perform private.check_winner(p_game_id);
  return jsonb_build_object('correct', true);
end;
$$;

create or replace function private.deadline_winner(p_game_id uuid)
returns uuid
language sql stable
set search_path = ''
as $$
  select p.id
  from public.players p
  join public.player_stats st on st.player_id = p.id
  left join lateral (
    select max(k.resolved_at) as last_kill
    from public.kills k
    where k.killer_id = p.id and k.status = 'confirmed'
  ) lk on true
  where p.game_id = p_game_id and p.status = 'alive'
  order by st.kills_count desc, lk.last_kill asc nulls last, p.created_at asc
  limit 1
$$;

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
  update public.games set theme = v_game.theme, secret_feed = v_game.secret_feed
  where id = (v_new->>'game_id')::uuid;

  perform private.log_event(p_game_id, 'rematch_created', jsonb_build_object(
    'code', v_new->>'code', 'by_id', v_me.id, 'by_name', v_me.name));

  return v_new || jsonb_build_object('rejoined', false);
end;
$$;

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
  d jsonb;
  v_insiders uuid[];
  v_outsiders uuid[];
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
    -- Who exposed them: their correct call-out.
    select jsonb_build_object('by_id', c.accuser_id, 'by_name', ap.name) into d
    from public.callouts c join public.players ap on ap.id = c.accuser_id
    where c.accused_id = (p->>'hunter_id')::uuid and c.correct
    order by c.created_at desc limit 1;
    v_victim := (p->>'hunter_id')::uuid;   -- the hunter who got caught
    v_killer := (d->>'by_id')::uuid;       -- the target who called them out

    perform private.notify_players(array[v_victim], '🕵️ You''ve been rumbled',
      coalesce(d->>'by_name', 'Your target') || ' called you out. You''re out of the game.',
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
    select a.p_insiders, a.p_outsiders into v_insiders, v_outsiders
    from private.split_audience(new.game_id, array[v_killer, v_victim, v_new_hunter]) a;
    perform private.notify_players(v_insiders,
      '🕵️ ' || coalesce(d->>'by_name', 'Someone') || ' rumbled ' || coalesce(p->>'hunter_name', 'their hunter'),
      v_alive || ' left. Trust no one.',
      '/g/' || v_game.code || '/board?tab=feed', 'feed-' || v_game.id);
    perform private.notify_players(v_outsiders,
      '🕵️ ' || coalesce(p->>'hunter_name', 'Someone') || ' was exposed',
      v_alive || ' left. Trust no one.',
      '/g/' || v_game.code || '/board?tab=feed', 'feed-' || v_game.id);

  elsif new.type = 'kill_confirmed' then
    -- Who did it: the confirmed kill.
    select jsonb_build_object('killer_id', k.killer_id, 'killer_name', kp.name) into d
    from public.kills k join public.players kp on kp.id = k.killer_id
    where k.id = (p->>'kill_id')::uuid;
    v_killer := (d->>'killer_id')::uuid;
    v_victim := (p->>'victim_id')::uuid;

    if p->>'resolved_by' is distinct from 'victim' then
      perform private.notify_players(array[v_victim], 'You''re out',
        coalesce(d->>'killer_name', 'Someone') || ' got you.'
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
    -- Players who see everything get the full line; the rest only learn who is out.
    select a.p_insiders, a.p_outsiders into v_insiders, v_outsiders
    from private.split_audience(new.game_id, array[v_killer, v_victim]) a;
    perform private.notify_players(v_insiders,
      '💀 ' || coalesce(d->>'killer_name', 'Someone') || ' got ' || coalesce(p->>'victim_name', 'someone'),
      v_alive || ' left. Trust no one.',
      '/g/' || v_game.code || '/board?tab=feed', 'feed-' || v_game.id);
    perform private.notify_players(v_outsiders,
      '💀 ' || coalesce(p->>'victim_name', 'Someone') || ' is out',
      v_alive || ' left. Trust no one.',
      '/g/' || v_game.code || '/board?tab=feed', 'feed-' || v_game.id);
  end if;
  return null;
end;
$$;

create or replace function private.on_comment_notify()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  p jsonb;
  d jsonb;
  v_code text;
  v_author text;
  v_targets uuid[];
begin
  select payload into p from public.events where id = new.event_id;
  select jsonb_build_object('killer_id', k.killer_id, 'killer_name', kp.name) into d
  from public.kills k join public.players kp on kp.id = k.killer_id
  where k.id = (p->>'kill_id')::uuid;
  select code into v_code from public.games where id = new.game_id;
  select name into v_author from public.players where id = new.player_id;
  if p is null then
    return null;
  end if;
  select array_agg(x) into v_targets
  from unnest(array[(d->>'killer_id')::uuid, (p->>'victim_id')::uuid]) x
  where x <> new.player_id;
  perform private.notify_players(
    v_targets,
    '💬 ' || v_author || ' on ' || coalesce(d->>'killer_name', 'someone') || ' getting '
      || coalesce(p->>'victim_name', 'someone'),
    left(new.body, 120),
    '/g/' || v_code || '/board?tab=feed',
    'comments-' || new.event_id
  );
  return null;
end;
$$;

create or replace function private.can_view_kill_photo(p_name text)
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
          or (k.status = 'confirmed' and private.is_member(k.game_id) and private.sees_everything(k.game_id))
        )
    )
$$;

-- The columns now live in player_stats.
alter table public.players drop column kills_count, drop column killed_by;
