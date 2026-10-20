-- Forgot your PIN: anyone with the game code and a player's name can reset
-- that player's PIN, which moves the seat to their device. It is never
-- silent: the feed says the seat moved, and the old device gets a push.

create function public.reset_pin(p_code text, p_name text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_game public.games;
  v_player public.players;
  v_pin text := private.generate_pin();
begin
  select * into v_game from public.games where code = private.normalise_code(p_code);
  if not found then
    raise exception 'game_not_found';
  end if;
  v_game := private.lock_game(v_game.id);

  select * into v_player from public.players
  where game_id = v_game.id and lower(name) = lower(btrim(coalesce(p_name, '')))
  for update;
  if not found then
    raise exception 'player_not_found';
  end if;

  if v_player.user_id <> v_uid then
    if exists (select 1 from public.players where game_id = v_game.id and user_id = v_uid) then
      raise exception 'already_seated';
    end if;
    -- Tell the old device before the seat leaves it.
    perform private.notify_players(array[v_player.id], '🔑 Your seat moved',
      'Someone reset your PIN in ' || v_game.name || '. If it wasn''t you, reset it back.',
      '/join/' || v_game.code, 'seat-' || v_player.id);
    update public.players set user_id = v_uid where id = v_player.id;
    perform private.log_event(v_game.id, 'seat_moved', jsonb_build_object(
      'player_id', v_player.id, 'name', v_player.name));
  end if;

  update private.player_secrets
  set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf')),
      failed_attempts = 0, locked_until = null
  where player_id = v_player.id;

  return jsonb_build_object(
    'game_id', v_game.id, 'code', v_game.code, 'player_id', v_player.id, 'pin', v_pin);
end;
$$;

revoke all on function public.reset_pin(text, text) from public, anon;
grant execute on function public.reset_pin(text, text) to authenticated;
