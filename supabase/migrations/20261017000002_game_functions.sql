-- Last Alive: game RPCs. Every state change happens here.
--
-- Conventions
--  * Public RPCs are SECURITY DEFINER with an empty search_path, check auth.uid()
--    and lock the game row (FOR UPDATE) first, so all writes to one game are
--    serialised and concurrent calls cannot race.
--  * Errors are raised with a short machine code as the message (e.g. 'not_host');
--    the client maps them to friendly text.
--  * Internal helpers live in the `private` schema, which PostgREST does not expose.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create function private.require_uid()
returns uuid
language plpgsql stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  return auth.uid();
end;
$$;

-- Locks and returns the game row.
create function private.lock_game(p_game_id uuid)
returns public.games
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game_not_found';
  end if;
  return v_game;
end;
$$;

-- The caller's seat in a game, or an error.
create function private.my_player(p_game_id uuid)
returns public.players
language plpgsql
set search_path = ''
as $$
declare
  v_player public.players;
begin
  select * into v_player
  from public.players
  where game_id = p_game_id and user_id = private.require_uid();
  if not found then
    raise exception 'not_in_game';
  end if;
  return v_player;
end;
$$;

create function private.normalise_code(p_code text)
returns text
language sql immutable
set search_path = ''
as $$
  select upper(btrim(coalesce(p_code, '')))
$$;

create function private.generate_game_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_words text[] := array[
    'CLUE', 'KNIFE', 'ROPE', 'PIPE', 'ALIBI', 'MOTIVE', 'SNEAK', 'SHADOW', 'RAVEN', 'VIPER',
    'GHOST', 'CIPHER', 'DAGGER', 'POISON', 'TRAP', 'BLUFF', 'RUSE', 'HEIST', 'NOIR', 'SPY',
    'AGENT', 'DECOY', 'MASK', 'SIGNAL', 'STEALTH', 'CLOAK', 'FOX', 'OWL', 'HUSH', 'MOLE'
  ];
  -- No 0/O or 1/I so codes are easy to read aloud.
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := v_words[1 + floor(random() * array_length(v_words, 1))::int]
      || '-'
      || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1)
      || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    exit when not exists (select 1 from public.games g where g.code = v_code);
  end loop;
  return v_code;
end;
$$;

-- A random 4-digit PIN from a cryptographic source.
create function private.generate_pin()
returns text
language sql volatile
set search_path = ''
as $$
  select lpad(
    (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 10000)::text,
    4, '0'
  )
$$;

create function private.log_event(p_game_id uuid, p_type text, p_payload jsonb default '{}')
returns void
language sql
set search_path = ''
as $$
  insert into public.events (game_id, type, payload) values (p_game_id, p_type, p_payload)
$$;

create function private.validate_colour(p_colour text)
returns text
language plpgsql immutable
set search_path = ''
as $$
begin
  if p_colour is null or p_colour not in (
    'yellow', 'red', 'blue', 'mint', 'pink', 'orange', 'purple', 'paper'
  ) then
    raise exception 'invalid_colour';
  end if;
  return p_colour;
end;
$$;

create function private.validate_name(p_name text)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception 'invalid_name';
  end if;
  return v_name;
end;
$$;

create function private.player_json(p public.players)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'colour', p.colour)
$$;

-- Hands the host role to the longest-standing other player (alive first).
create function private.transfer_host(p_game_id uuid, p_leaving uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_next public.players;
begin
  select * into v_next
  from public.players
  where game_id = p_game_id and id <> p_leaving
  order by (status = 'alive') desc, created_at
  limit 1;

  update public.players set is_host = false where id = p_leaving;
  if v_next.id is null then
    return;
  end if;
  update public.players set is_host = true where id = v_next.id;
  update public.games set host_player_id = v_next.id where id = p_game_id;
  perform private.log_event(p_game_id, 'host_changed', jsonb_build_object(
    'player_id', v_next.id, 'name', v_next.name));
end;
$$;

-- Ends the game if exactly one player is left alive. Returns true if it ended.
create function private.check_winner(p_game_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_alive integer;
  v_winner public.players;
begin
  select count(*) into v_alive
  from public.players where game_id = p_game_id and status = 'alive';

  if v_alive > 1 then
    return false;
  end if;

  select * into v_winner
  from public.players where game_id = p_game_id and status = 'alive' limit 1;

  update public.missions set is_active = false, ended_at = now()
  where game_id = p_game_id and is_active;

  update public.kills set status = 'rejected', resolved_at = now(), resolved_by = 'system'
  where game_id = p_game_id and status in ('pending', 'disputed');

  update public.games
  set status = 'finished', finished_at = now(), winner_player_id = v_winner.id
  where id = p_game_id;

  perform private.log_event(p_game_id, 'game_finished', jsonb_build_object(
    'winner_id', v_winner.id, 'winner_name', v_winner.name));
  return true;
end;
$$;

-- Voids any open claims made BY a player (used when they die or leave: their
-- mission moves to someone else, so their unconfirmed claim no longer stands).
create function private.void_claims_by(p_player_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.kills set status = 'rejected', resolved_at = now(), resolved_by = 'system'
  where killer_id = p_player_id and status in ('pending', 'disputed')
$$;

-- Moves the dead/leaving player's active mission to their hunter.
-- Returns the new mission id, or null if the hunter would be hunting themself.
create function private.pass_mission_on(p_from uuid, p_to uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_inherit public.missions;
  v_new uuid;
begin
  -- The hunter's own mission (on the departing player) is done.
  update public.missions set is_active = false, ended_at = now()
  where hunter_id = p_to and is_active;

  -- Take the departing player's mission.
  update public.missions set is_active = false, ended_at = now()
  where hunter_id = p_from and is_active
  returning * into v_inherit;

  if v_inherit.id is null or v_inherit.target_id = p_to then
    return null;
  end if;

  insert into public.missions (
    game_id, hunter_id, target_id, weapon_card_id, place_card_id, object_card_id, inherited_from
  ) values (
    v_inherit.game_id, p_to, v_inherit.target_id, v_inherit.weapon_card_id,
    v_inherit.place_card_id, v_inherit.object_card_id, v_inherit.id
  )
  returning id into v_new;
  return v_new;
end;
$$;

-- Builds the hunting ring and deals cards.
--
-- Ring: alive players in random order; player i hunts player i+1 (wrapping), so
-- it is always one single cycle.
-- Cards: for each kind, a random permutation such that no hunter gets a card
-- they submitted. For the first attempts we also avoid giving a hunter their
-- target's own card (it would hint at who the target is). Every card is used
-- once when there are as many cards as hunters; only if there are fewer cards
-- than hunters are cards reused.
create function private.assign_missions(p_game_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ring uuid[];
  v_n integer;
  v_kind public.card_kind;
  v_cards uuid[];
  v_owners uuid[];
  v_m integer;
  v_perm integer[];
  v_ok boolean;
  v_try integer;
  v_idx integer;
  v_owner uuid;
  v_weapon uuid[];
  v_place uuid[];
  v_object uuid[];
  v_chosen uuid[];
  i integer;
begin
  select array_agg(id order by random()) into v_ring
  from public.players where game_id = p_game_id and status = 'alive';
  v_n := coalesce(array_length(v_ring, 1), 0);
  if v_n < 2 then
    raise exception 'not_enough_players';
  end if;

  foreach v_kind in array array['weapon', 'place', 'object']::public.card_kind[] loop
    select array_agg(c.id order by c.id), array_agg(c.submitted_by order by c.id)
      into v_cards, v_owners
    from public.cards c
    join public.players p on p.id = c.submitted_by and p.status = 'alive'
    where c.game_id = p_game_id and c.kind = v_kind;
    v_m := coalesce(array_length(v_cards, 1), 0);
    if v_m = 0 then
      raise exception 'not_enough_cards';
    end if;

    v_ok := false;
    for v_try in 1..400 loop
      select array_agg(g order by random()) into v_perm from generate_series(1, v_m) g;
      v_ok := true;
      for i in 1..v_n loop
        v_idx := v_perm[((i - 1) % v_m) + 1];
        v_owner := v_owners[v_idx];
        if v_owner = v_ring[i]
          or (v_try <= 200 and v_n > 3 and v_owner = v_ring[(i % v_n) + 1]) then
          v_ok := false;
          exit;
        end if;
      end loop;
      exit when v_ok;
    end loop;
    if not v_ok then
      raise exception 'could_not_deal_cards';
    end if;

    v_chosen := array[]::uuid[];
    for i in 1..v_n loop
      v_chosen := v_chosen || v_cards[v_perm[((i - 1) % v_m) + 1]];
    end loop;

    if v_kind = 'weapon' then
      v_weapon := v_chosen;
    elsif v_kind = 'place' then
      v_place := v_chosen;
    else
      v_object := v_chosen;
    end if;
  end loop;

  for i in 1..v_n loop
    insert into public.missions (
      game_id, hunter_id, target_id, weapon_card_id, place_card_id, object_card_id
    ) values (
      p_game_id, v_ring[i], v_ring[(i % v_n) + 1], v_weapon[i], v_place[i], v_object[i]
    );
  end loop;
end;
$$;

-- The heart of the game. Confirms a kill in one transaction:
-- victim dead, killer +1, missions passed on, feed event, winner check.
-- Idempotent: confirming an already-confirmed kill is a no-op. Safe under
-- concurrency because the game row is locked before anything is read.
create function private.confirm_kill(p_kill_id uuid, p_resolved_by text)
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
    'used_object', v_kill.used_object,
    'note', v_kill.note,
    'resolved_by', p_resolved_by
  ));

  perform private.check_winner(v_kill.game_id);
  return 'confirmed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

create function public.create_game(p_game_name text, p_player_name text, p_colour text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_game_name text := btrim(coalesce(p_game_name, ''));
  v_game_id uuid;
  v_code text;
  v_player_id uuid;
  v_pin text := private.generate_pin();
begin
  if char_length(v_game_name) < 1 then
    v_game_name := 'Last Alive';
  end if;
  if char_length(v_game_name) > 40 then
    raise exception 'invalid_game_name';
  end if;

  v_code := private.generate_game_code();
  insert into public.games (code, name) values (v_code, v_game_name) returning id into v_game_id;

  insert into public.players (game_id, user_id, name, colour, is_host)
  values (
    v_game_id, v_uid, private.validate_name(p_player_name), private.validate_colour(p_colour), true
  )
  returning id into v_player_id;

  insert into private.player_secrets (player_id, pin_hash)
  values (v_player_id, extensions.crypt(v_pin, extensions.gen_salt('bf')));

  update public.games set host_player_id = v_player_id where id = v_game_id;

  perform private.log_event(v_game_id, 'game_created', jsonb_build_object(
    'player_id', v_player_id, 'name', private.validate_name(p_player_name)));

  return jsonb_build_object(
    'game_id', v_game_id, 'code', v_code, 'player_id', v_player_id, 'pin', v_pin);
end;
$$;

-- What a non-member may know about a game before joining.
create function public.game_preview(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_game public.games;
begin
  perform private.require_uid();
  select * into v_game from public.games where code = private.normalise_code(p_code);
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'code', v_game.code,
    'name', v_game.name,
    'status', v_game.status,
    'player_count', (select count(*) from public.players p where p.game_id = v_game.id),
    'is_member', private.is_member(v_game.id)
  );
end;
$$;

create function public.join_game(p_code text, p_name text, p_colour text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_game public.games;
  v_existing public.players;
  v_name text := private.validate_name(p_name);
  v_player_id uuid;
  v_pin text := private.generate_pin();
begin
  select * into v_game from public.games where code = private.normalise_code(p_code);
  if not found then
    raise exception 'game_not_found';
  end if;
  v_game := private.lock_game(v_game.id);

  -- Same device coming back: recognise it, no PIN needed.
  select * into v_existing from public.players where game_id = v_game.id and user_id = v_uid;
  if found then
    return jsonb_build_object(
      'game_id', v_game.id, 'code', v_game.code, 'player_id', v_existing.id,
      'pin', null, 'rejoined', true);
  end if;

  if v_game.status not in ('lobby', 'picking') then
    raise exception 'game_already_started';
  end if;

  -- Never silently take over a name. The owner can reclaim it with their PIN.
  if exists (
    select 1 from public.players where game_id = v_game.id and lower(name) = lower(v_name)
  ) then
    raise exception 'name_taken';
  end if;

  if (select count(*) from public.players where game_id = v_game.id) >= 40 then
    raise exception 'game_full';
  end if;

  insert into public.players (game_id, user_id, name, colour)
  values (v_game.id, v_uid, v_name, private.validate_colour(p_colour))
  returning id into v_player_id;

  insert into private.player_secrets (player_id, pin_hash)
  values (v_player_id, extensions.crypt(v_pin, extensions.gen_salt('bf')));

  perform private.log_event(v_game.id, 'player_joined', jsonb_build_object(
    'player_id', v_player_id, 'name', v_name));

  return jsonb_build_object(
    'game_id', v_game.id, 'code', v_game.code, 'player_id', v_player_id,
    'pin', v_pin, 'rejoined', false);
end;
$$;

-- Lost-device recovery. Five wrong PINs lock the seat for 15 minutes.
-- Wrong PINs return {ok:false} instead of raising, so the attempt counter is
-- not rolled back with the error.
create function public.reclaim_player(p_code text, p_name text, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_game public.games;
  v_player public.players;
  v_secret private.player_secrets;
begin
  select * into v_game from public.games where code = private.normalise_code(p_code);
  if not found then
    raise exception 'game_not_found';
  end if;
  v_game := private.lock_game(v_game.id);

  select * into v_player from public.players
  where game_id = v_game.id and lower(name) = lower(btrim(coalesce(p_name, '')));
  if not found then
    raise exception 'player_not_found';
  end if;

  if v_player.user_id = v_uid then
    return jsonb_build_object(
      'ok', true, 'game_id', v_game.id, 'code', v_game.code, 'player_id', v_player.id);
  end if;

  if exists (select 1 from public.players where game_id = v_game.id and user_id = v_uid) then
    raise exception 'already_seated';
  end if;

  select * into v_secret from private.player_secrets where player_id = v_player.id for update;

  if v_secret.locked_until is not null and v_secret.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'pin_locked',
      'locked_until', v_secret.locked_until);
  end if;

  if p_pin is null or p_pin !~ '^\d{4}$'
    or extensions.crypt(p_pin, v_secret.pin_hash) <> v_secret.pin_hash then
    update private.player_secrets
    set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
        locked_until = case when failed_attempts + 1 >= 5
          then now() + interval '15 minutes' else locked_until end
    where player_id = v_player.id
    returning * into v_secret;
    return jsonb_build_object('ok', false, 'error',
      case when v_secret.locked_until > now() then 'pin_locked' else 'wrong_pin' end,
      'attempts_left', 5 - v_secret.failed_attempts);
  end if;

  update private.player_secrets set failed_attempts = 0, locked_until = null
  where player_id = v_player.id;
  update public.players set user_id = v_uid where id = v_player.id;

  return jsonb_build_object(
    'ok', true, 'game_id', v_game.id, 'code', v_game.code, 'player_id', v_player.id);
end;
$$;

create function public.start_picking(p_game_id uuid)
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
  if v_game.status <> 'lobby' then
    raise exception 'wrong_phase';
  end if;
  if (select count(*) from public.players where game_id = p_game_id) < 4 then
    raise exception 'need_four_players';
  end if;
  update public.games set status = 'picking' where id = p_game_id;
  perform private.log_event(p_game_id, 'picking_started');
end;
$$;

create function public.submit_cards(p_game_id uuid, p_weapon text, p_place text, p_object text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_weapon text := regexp_replace(btrim(coalesce(p_weapon, '')), '\s+', ' ', 'g');
  v_place text := regexp_replace(btrim(coalesce(p_place, '')), '\s+', ' ', 'g');
  v_object text := regexp_replace(btrim(coalesce(p_object, '')), '\s+', ' ', 'g');
begin
  if v_game.status <> 'picking' then
    raise exception 'wrong_phase';
  end if;
  if v_me.cards_locked then
    raise exception 'cards_already_locked';
  end if;
  if char_length(v_weapon) not between 2 and 60
    or char_length(v_place) not between 2 and 60
    or char_length(v_object) not between 2 and 60 then
    raise exception 'invalid_card';
  end if;

  insert into public.cards (game_id, kind, text, submitted_by) values
    (p_game_id, 'weapon', v_weapon, v_me.id),
    (p_game_id, 'place', v_place, v_me.id),
    (p_game_id, 'object', v_object, v_me.id);

  update public.players set cards_locked = true where id = v_me.id;
end;
$$;

create function public.start_game(p_game_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_count integer;
begin
  if not v_me.is_host then
    raise exception 'not_host';
  end if;
  if v_game.status <> 'picking' then
    raise exception 'wrong_phase';
  end if;
  select count(*) into v_count from public.players where game_id = p_game_id;
  if v_count < 4 then
    raise exception 'need_four_players';
  end if;
  if exists (select 1 from public.players where game_id = p_game_id and not cards_locked) then
    raise exception 'cards_not_locked';
  end if;

  perform private.assign_missions(p_game_id);
  update public.games set status = 'active', started_at = now() where id = p_game_id;
  perform private.log_event(p_game_id, 'game_started', jsonb_build_object(
    'player_count', v_count));
end;
$$;

create function public.report_kill(
  p_game_id uuid, p_victim_id uuid, p_used_object boolean default false, p_note text default null
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

  -- Double taps return the claim already open.
  select id into v_existing from public.kills
  where mission_id = v_mission.id and status in ('pending', 'disputed');
  if found then
    return v_existing;
  end if;

  insert into public.kills (game_id, mission_id, killer_id, victim_id, used_object, note)
  values (p_game_id, v_mission.id, v_me.id, p_victim_id, coalesce(p_used_object, false), v_note)
  returning id into v_kill_id;
  return v_kill_id;
end;
$$;

create function public.respond_to_kill(p_kill_id uuid, p_confirm boolean)
returns public.kill_status
language plpgsql security definer
set search_path = ''
as $$
declare
  v_kill public.kills;
  v_me public.players;
begin
  select * into v_kill from public.kills where id = p_kill_id;
  if not found then
    raise exception 'kill_not_found';
  end if;
  perform private.lock_game(v_kill.game_id);
  v_me := private.my_player(v_kill.game_id);
  select * into v_kill from public.kills where id = p_kill_id for update;

  if v_kill.victim_id <> v_me.id then
    raise exception 'not_your_kill';
  end if;

  if v_kill.status <> 'pending' then
    -- Repeat taps of the same answer are fine.
    if (p_confirm and v_kill.status = 'confirmed') or (not p_confirm and v_kill.status = 'disputed') then
      return v_kill.status;
    end if;
    raise exception 'kill_not_pending';
  end if;

  if p_confirm then
    return private.confirm_kill(p_kill_id, 'victim');
  end if;

  update public.kills set status = 'disputed' where id = p_kill_id;
  return 'disputed';
end;
$$;

create function public.resolve_dispute(p_kill_id uuid, p_confirm boolean)
returns public.kill_status
language plpgsql security definer
set search_path = ''
as $$
declare
  v_kill public.kills;
  v_me public.players;
begin
  select * into v_kill from public.kills where id = p_kill_id;
  if not found then
    raise exception 'kill_not_found';
  end if;
  perform private.lock_game(v_kill.game_id);
  v_me := private.my_player(v_kill.game_id);
  select * into v_kill from public.kills where id = p_kill_id for update;

  if not v_me.is_host then
    raise exception 'not_host';
  end if;
  if v_kill.status <> 'disputed' then
    if (p_confirm and v_kill.status = 'confirmed') or (not p_confirm and v_kill.status = 'rejected') then
      return v_kill.status;
    end if;
    raise exception 'kill_not_disputed';
  end if;

  if p_confirm then
    return private.confirm_kill(p_kill_id, 'host');
  end if;

  update public.kills set status = 'rejected', resolved_at = now(), resolved_by = 'host'
  where id = p_kill_id;
  return 'rejected';
end;
$$;

-- Host-only: remove a no-show before the game starts.
create function public.remove_player(p_game_id uuid, p_player_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_target public.players;
begin
  if not v_me.is_host then
    raise exception 'not_host';
  end if;
  if v_game.status not in ('lobby', 'picking') then
    raise exception 'wrong_phase';
  end if;
  if p_player_id = v_me.id then
    raise exception 'cannot_remove_self';
  end if;
  delete from public.players where id = p_player_id and game_id = p_game_id
  returning * into v_target;
  if v_target.id is null then
    raise exception 'player_not_found';
  end if;
  perform private.log_event(p_game_id, 'player_left', jsonb_build_object(
    'player_id', v_target.id, 'name', v_target.name, 'removed', true));
end;
$$;

-- Before the game: give up the seat. During the game: forfeit. If someone has
-- an open claim on you, it is confirmed (no dodging by leaving); otherwise
-- your hunter inherits your mission.
create function public.leave_game(p_game_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_hunter_mission public.missions;
  v_open_claim uuid;
begin
  if v_game.status in ('lobby', 'picking') then
    if v_me.is_host then
      perform private.transfer_host(p_game_id, v_me.id);
    end if;
    delete from public.players where id = v_me.id;
    if not exists (select 1 from public.players where game_id = p_game_id) then
      delete from public.games where id = p_game_id;
      return;
    end if;
    perform private.log_event(p_game_id, 'player_left', jsonb_build_object(
      'player_id', v_me.id, 'name', v_me.name));
    return;
  end if;

  if v_game.status = 'finished' or v_me.status = 'dead' then
    return;
  end if;

  select id into v_open_claim from public.kills
  where victim_id = v_me.id and status in ('pending', 'disputed');
  if v_open_claim is not null then
    if private.confirm_kill(v_open_claim, 'system') = 'confirmed' then
      if v_me.is_host then
        perform private.transfer_host(p_game_id, v_me.id);
      end if;
      return;
    end if;
  end if;

  select * into v_hunter_mission from public.missions where target_id = v_me.id and is_active;

  update public.players set status = 'dead', died_at = now() where id = v_me.id;
  perform private.void_claims_by(v_me.id);
  if v_hunter_mission.id is not null then
    perform private.pass_mission_on(v_me.id, v_hunter_mission.hunter_id);
  end if;

  perform private.log_event(p_game_id, 'player_left', jsonb_build_object(
    'player_id', v_me.id, 'name', v_me.name));

  if v_me.is_host then
    perform private.transfer_host(p_game_id, v_me.id);
  end if;
  perform private.check_winner(p_game_id);
end;
$$;

-- Details of a claim for the people allowed to judge it: the victim, the
-- killer, and the host once it is disputed.
create function public.get_kill_claim(p_kill_id uuid)
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
    'object', (select text from public.cards where id = v_mission.object_card_id),
    'used_object', v_kill.used_object,
    'note', v_kill.note,
    'created_at', v_kill.created_at,
    'auto_confirm_at', v_kill.created_at + interval '12 hours'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------

-- Pending claims nobody answered within 12 hours count as confirmed.
create function private.auto_confirm_expired_kills()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.kills
    where status = 'pending' and created_at < now() - interval '12 hours'
    order by created_at
  loop
    if private.confirm_kill(v_id, 'auto') = 'confirmed' then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Finished games are deleted after 7 days; abandoned lobbies after 30.
create function private.cleanup_old_games()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.games
  where (status = 'finished' and finished_at < now() - interval '7 days')
     or (status in ('lobby', 'picking') and created_at < now() - interval '30 days');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only the public RPCs are callable, and only by signed-in users.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.my_player_ids() to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_host(uuid) to authenticated;

revoke execute on function public.create_game(text, text, text) from public, anon;
revoke execute on function public.game_preview(text) from public, anon;
revoke execute on function public.join_game(text, text, text) from public, anon;
revoke execute on function public.reclaim_player(text, text, text) from public, anon;
revoke execute on function public.start_picking(uuid) from public, anon;
revoke execute on function public.submit_cards(uuid, text, text, text) from public, anon;
revoke execute on function public.start_game(uuid) from public, anon;
revoke execute on function public.report_kill(uuid, uuid, boolean, text) from public, anon;
revoke execute on function public.respond_to_kill(uuid, boolean) from public, anon;
revoke execute on function public.resolve_dispute(uuid, boolean) from public, anon;
revoke execute on function public.remove_player(uuid, uuid) from public, anon;
revoke execute on function public.leave_game(uuid) from public, anon;
revoke execute on function public.get_kill_claim(uuid) from public, anon;

grant execute on function public.create_game(text, text, text) to authenticated;
grant execute on function public.game_preview(text) to authenticated;
grant execute on function public.join_game(text, text, text) to authenticated;
grant execute on function public.reclaim_player(text, text, text) to authenticated;
grant execute on function public.start_picking(uuid) to authenticated;
grant execute on function public.submit_cards(uuid, text, text, text) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.report_kill(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.respond_to_kill(uuid, boolean) to authenticated;
grant execute on function public.resolve_dispute(uuid, boolean) to authenticated;
grant execute on function public.remove_player(uuid, uuid) to authenticated;
grant execute on function public.leave_game(uuid) to authenticated;
grant execute on function public.get_kill_claim(uuid) to authenticated;
