-- The third card is now a PHRASE the hunter must say after the kill (it was an
-- optional "object in shot" bonus). Every kill needs weapon, place and phrase,
-- so the bonus flag goes too.

-- Kind and column renames keep existing rows valid.
alter type public.card_kind rename value 'object' to 'phrase';
alter table public.missions rename column object_card_id to phrase_card_id;
alter table public.missions
  rename constraint missions_object_card_id_fkey to missions_phrase_card_id_fkey;
alter table public.kills drop column used_object;

-- Phrases can be a little longer than a weapon or a place.
alter table public.cards drop constraint cards_text_check;
alter table public.cards
  add constraint cards_text_check check (char_length(text) between 2 and 80 and text = btrim(text));

-- Signatures change, so these two are dropped and recreated.
drop function public.submit_cards(uuid, text, text, text);
drop function public.report_kill(uuid, uuid, boolean, text);

-- Recreated with the new column and kind names (bodies otherwise unchanged).
-- Picks the card to inherit. Keeps the victim's card unless the new hunter
-- wrote it themselves; then swaps in the same kind of card from the hunter's
-- just-finished mission (now free, and never their own), or failing that any
-- card of that kind they did not write, preferring ones not on a live mission.
create or replace function private.inheritable_card(p_card uuid, p_fallback uuid, p_hunter uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_card public.cards;
  v_alt uuid;
begin
  select * into v_card from public.cards where id = p_card;
  if v_card.submitted_by <> p_hunter then
    return p_card;
  end if;
  if p_fallback is not null
    and (select submitted_by from public.cards where id = p_fallback) <> p_hunter then
    return p_fallback;
  end if;
  select c.id into v_alt
  from public.cards c
  where c.game_id = v_card.game_id and c.kind = v_card.kind and c.submitted_by <> p_hunter
  order by exists (
    select 1 from public.missions m
    where m.is_active and c.id in (m.weapon_card_id, m.place_card_id, m.phrase_card_id)
  ), random()
  limit 1;
  return coalesce(v_alt, p_card);
end;
$$;

-- Moves the dead/leaving player's active mission to their hunter.
-- Returns the new mission id, or null if the hunter would be hunting themself.
create or replace function private.pass_mission_on(p_from uuid, p_to uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_old public.missions;
  v_inherit public.missions;
  v_new uuid;
begin
  -- The hunter's own mission (on the departing player) is done.
  update public.missions set is_active = false, ended_at = now()
  where hunter_id = p_to and is_active
  returning * into v_old;

  -- Take the departing player's mission.
  update public.missions set is_active = false, ended_at = now()
  where hunter_id = p_from and is_active
  returning * into v_inherit;

  if v_inherit.id is null or v_inherit.target_id = p_to then
    return null;
  end if;

  insert into public.missions (
    game_id, hunter_id, target_id, weapon_card_id, place_card_id, phrase_card_id, inherited_from
  ) values (
    v_inherit.game_id, p_to, v_inherit.target_id,
    private.inheritable_card(v_inherit.weapon_card_id, v_old.weapon_card_id, p_to),
    private.inheritable_card(v_inherit.place_card_id, v_old.place_card_id, p_to),
    private.inheritable_card(v_inherit.phrase_card_id, v_old.phrase_card_id, p_to),
    v_inherit.id
  )
  returning id into v_new;
  return v_new;
end;
$$;

-- Ring: alive players in random order; player i hunts player i+1 (wrapping), so
-- it is always one single cycle.
-- Cards: for each kind, a random permutation such that no hunter gets a card
-- they submitted. For the first attempts we also avoid giving a hunter their
-- target's own card (it would hint at who the target is). Every card is used
-- once when there are as many cards as hunters; only if there are fewer cards
-- than hunters are cards reused.
create or replace function private.assign_missions(p_game_id uuid)
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
  v_phrase uuid[];
  v_chosen uuid[];
  i integer;
begin
  select array_agg(id order by random()) into v_ring
  from public.players where game_id = p_game_id and status = 'alive';
  v_n := coalesce(array_length(v_ring, 1), 0);
  if v_n < 2 then
    raise exception 'not_enough_players';
  end if;

  foreach v_kind in array array['weapon', 'place', 'phrase']::public.card_kind[] loop
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
      v_phrase := v_chosen;
    end if;
  end loop;

  for i in 1..v_n loop
    insert into public.missions (
      game_id, hunter_id, target_id, weapon_card_id, place_card_id, phrase_card_id
    ) values (
      p_game_id, v_ring[i], v_ring[(i % v_n) + 1], v_weapon[i], v_place[i], v_phrase[i]
    );
  end loop;
end;
$$;

-- The heart of the game. Confirms a kill in one transaction:
-- victim dead, killer +1, missions passed on, feed event, winner check.
-- Idempotent: confirming an already-confirmed kill is a no-op. Safe under
-- concurrency because the game row is locked before anything is read.
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
    'note', v_kill.note,
    'resolved_by', p_resolved_by
  ));

  perform private.check_winner(v_kill.game_id);
  return 'confirmed';
end;
$$;

create function public.submit_cards(p_game_id uuid, p_weapon text, p_place text, p_phrase text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_weapon text := regexp_replace(btrim(coalesce(p_weapon, '')), '\s+', ' ', 'g');
  v_place text := regexp_replace(btrim(coalesce(p_place, '')), '\s+', ' ', 'g');
  v_phrase text := regexp_replace(btrim(coalesce(p_phrase, '')), '\s+', ' ', 'g');
begin
  if v_game.status <> 'picking' then
    raise exception 'wrong_phase';
  end if;
  if v_me.cards_locked then
    raise exception 'cards_already_locked';
  end if;
  if char_length(v_weapon) not between 2 and 60
    or char_length(v_place) not between 2 and 60
    or char_length(v_phrase) not between 2 and 80 then
    raise exception 'invalid_card';
  end if;

  insert into public.cards (game_id, kind, text, submitted_by) values
    (p_game_id, 'weapon', v_weapon, v_me.id),
    (p_game_id, 'place', v_place, v_me.id),
    (p_game_id, 'phrase', v_phrase, v_me.id);

  update public.players set cards_locked = true where id = v_me.id;
end;
$$;

create function public.report_kill(
  p_game_id uuid, p_victim_id uuid, p_note text default null
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

  insert into public.kills (game_id, mission_id, killer_id, victim_id, note)
  values (p_game_id, v_mission.id, v_me.id, p_victim_id, v_note)
  returning id into v_kill_id;
  return v_kill_id;
end;
$$;

-- Details of a claim for the people allowed to judge it: the victim, the
-- killer, and the host once it is disputed.
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
    'weapon', (select text from public.cards where id = v_mission.weapon_card_id),
    'place', (select text from public.cards where id = v_mission.place_card_id),
    'phrase', (select text from public.cards where id = v_mission.phrase_card_id),
    'note', v_kill.note,
    'created_at', v_kill.created_at,
    'auto_confirm_at', v_kill.created_at + interval '12 hours'
  );
end;
$$;

revoke execute on function private.inheritable_card(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.pass_mission_on(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.assign_missions(uuid) from public, anon, authenticated;
revoke execute on function private.confirm_kill(uuid, text) from public, anon, authenticated;

revoke execute on function public.submit_cards(uuid, text, text, text) from public, anon;
revoke execute on function public.report_kill(uuid, uuid, text) from public, anon;
grant execute on function public.submit_cards(uuid, text, text, text) to authenticated;
grant execute on function public.report_kill(uuid, uuid, text) to authenticated;
