-- Admin: a password-protected back office for Harry. Every admin function takes
-- the password and checks it here, in the database, against a bcrypt hash.
-- Five wrong passwords lock admin for 15 minutes. Bad passwords return
-- {ok:false} instead of raising, so the failed-attempt count is kept.
-- Set the password (SQL editor only, never from the app):
--   select private.set_admin_password('your long password');

create table private.admin_secret (
  id boolean primary key default true check (id),
  password_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz
);
alter table private.admin_secret enable row level security;

create function private.set_admin_password(p_password text)
returns void
language sql
set search_path = ''
as $$
  insert into private.admin_secret (id, password_hash)
  values (true, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  on conflict (id) do update
    set password_hash = excluded.password_hash, failed_attempts = 0, locked_until = null;
$$;
revoke all on function private.set_admin_password(text) from public, anon, authenticated;

-- null when the password is good, otherwise {ok:false, error}.
create function private.admin_check(p_password text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v private.admin_secret;
begin
  select * into v from private.admin_secret where id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'admin_not_set_up');
  end if;
  if v.locked_until is not null and v.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'admin_locked', 'locked_until', v.locked_until);
  end if;
  if p_password is null or extensions.crypt(p_password, v.password_hash) <> v.password_hash then
    update private.admin_secret
    set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where id;
    return jsonb_build_object('ok', false, 'error', 'admin_wrong_password');
  end if;
  update private.admin_secret set failed_attempts = 0, locked_until = null where id;
  return null;
end;
$$;
revoke all on function private.admin_check(text) from public, anon, authenticated;

-- Totals and the games that are still going.
create function public.admin_overview(p_password text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bad jsonb := private.admin_check(p_password);
begin
  if v_bad is not null then return v_bad; end if;
  return jsonb_build_object(
    'ok', true,
    'stats', jsonb_build_object(
      'games', (select count(*) from public.games),
      'running', (select count(*) from public.games where status <> 'finished'),
      'players', (select count(*) from public.players),
      'games_24h', (select count(*) from public.games where created_at > now() - interval '24 hours'),
      'kills_24h', (select count(*) from public.kills
                    where status = 'confirmed' and resolved_at > now() - interval '24 hours')),
    'games', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', g.id, 'code', g.code, 'name', g.name, 'status', g.status,
          'players', (select count(*) from public.players p where p.game_id = g.id),
          'alive', (select count(*) from public.players p where p.game_id = g.id and p.status = 'alive'),
          'created_at', g.created_at, 'ends_at', g.ends_at)
        order by g.created_at desc)
      from public.games g where g.status <> 'finished'), '[]'::jsonb));
end;
$$;

-- One game in full: players and every live mission with its cards.
create function public.admin_game(p_password text, p_code text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bad jsonb := private.admin_check(p_password);
  v_game public.games;
begin
  if v_bad is not null then return v_bad; end if;
  select * into v_game from public.games where code = private.normalise_code(p_code);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'game_not_found');
  end if;
  return jsonb_build_object(
    'ok', true,
    'game', jsonb_build_object('id', v_game.id, 'code', v_game.code, 'name', v_game.name,
      'status', v_game.status, 'ends_at', v_game.ends_at, 'started_at', v_game.started_at,
      'prize', v_game.prize, 'secret_feed', v_game.secret_feed),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status,
          'is_host', p.is_host, 'kills', coalesce(s.kills_count, 0)) order by p.created_at)
      from public.players p left join public.player_stats s on s.player_id = p.id
      where p.game_id = v_game.id), '[]'::jsonb),
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'hunter', h.name, 'target', t.name,
          'weapon', jsonb_build_object('id', w.id, 'text', w.text),
          'place', jsonb_build_object('id', pl.id, 'text', pl.text),
          'phrase', jsonb_build_object('id', ph.id, 'text', ph.text)) order by h.name)
      from public.missions m
      join public.players h on h.id = m.hunter_id
      join public.players t on t.id = m.target_id
      join public.cards w on w.id = m.weapon_card_id
      join public.cards pl on pl.id = m.place_card_id
      join public.cards ph on ph.id = m.phrase_card_id
      where m.game_id = v_game.id and m.is_active), '[]'::jsonb));
end;
$$;

-- Fix a card's wording (a weapon, place or phrase).
create function public.admin_set_card(p_password text, p_card_id uuid, p_text text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bad jsonb := private.admin_check(p_password);
  v_text text := btrim(coalesce(p_text, ''));
begin
  if v_bad is not null then return v_bad; end if;
  if v_text = '' or char_length(v_text) > 80 then
    return jsonb_build_object('ok', false, 'error', 'card_text_invalid');
  end if;
  update public.cards set text = v_text where id = p_card_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'card_not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Set, move or clear a game's end time, with none of the host's limits.
create function public.admin_set_end(p_password text, p_game_id uuid, p_ends_at timestamptz default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bad jsonb := private.admin_check(p_password);
  v_game public.games;
begin
  if v_bad is not null then return v_bad; end if;
  v_game := private.lock_game(p_game_id);
  if v_game.status = 'finished' then
    return jsonb_build_object('ok', false, 'error', 'wrong_phase');
  end if;
  update public.games set ends_at = p_ends_at, final_hour_announced_at = null,
    sudden_death_announced_at = null
  where id = p_game_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Take a player out of a running game. Their hunter inherits their mission,
-- exactly as if they had left; open claims on or by them are dropped.
create function public.admin_remove_player(p_password text, p_player_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_bad jsonb := private.admin_check(p_password);
  v_player public.players;
  v_game public.games;
  v_hunter_mission public.missions;
begin
  if v_bad is not null then return v_bad; end if;
  select * into v_player from public.players where id = p_player_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'player_not_found');
  end if;
  v_game := private.lock_game(v_player.game_id);
  if v_game.status <> 'active' or v_player.status <> 'alive' then
    return jsonb_build_object('ok', false, 'error', 'wrong_phase');
  end if;

  update public.kills set status = 'rejected', resolved_at = now(), resolved_by = 'system'
  where victim_id = v_player.id and status in ('pending', 'disputed');
  perform private.void_claims_by(v_player.id);

  select * into v_hunter_mission from public.missions where target_id = v_player.id and is_active;
  update public.players set status = 'dead', died_at = now() where id = v_player.id;
  if v_hunter_mission.id is not null then
    perform private.pass_mission_on(v_player.id, v_hunter_mission.hunter_id);
  end if;
  perform private.log_event(v_game.id, 'player_left', jsonb_build_object(
    'player_id', v_player.id, 'name', v_player.name, 'removed', true));
  if v_player.is_host then
    perform private.transfer_host(v_game.id, v_player.id);
  end if;
  perform private.check_winner(v_game.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_overview(text) from public, anon;
revoke all on function public.admin_game(text, text) from public, anon;
revoke all on function public.admin_set_card(text, uuid, text) from public, anon;
revoke all on function public.admin_set_end(text, uuid, timestamptz) from public, anon;
revoke all on function public.admin_remove_player(text, uuid) from public, anon;
grant execute on function public.admin_overview(text) to authenticated;
grant execute on function public.admin_game(text, text) to authenticated;
grant execute on function public.admin_set_card(text, uuid, text) to authenticated;
grant execute on function public.admin_set_end(text, uuid, timestamptz) to authenticated;
grant execute on function public.admin_remove_player(text, uuid) to authenticated;
