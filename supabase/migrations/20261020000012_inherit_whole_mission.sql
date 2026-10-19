-- A kill now hands over the victim's WHOLE mission: target, weapon, place and
-- phrase, even cards the killer wrote themselves.
--
-- Previously a card the killer had written was swapped for one from their old
-- mission, so they could end up with a new target but their old weapon and
-- place, which read as a half-inherited mission. The target never knows who
-- wrote which card, so holding your own card gives nothing away. (The first
-- deal still never gives anyone their own card; rumbles still keep the new
-- hunter's own cards, because the rumbled hunter's cards have been seen.)

create or replace function private.pass_mission_on(p_from uuid, p_to uuid)
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

  -- Take the departing player's mission, as it stands.
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
    v_inherit.weapon_card_id, v_inherit.place_card_id, v_inherit.phrase_card_id,
    v_inherit.id
  )
  returning id into v_new;
  return v_new;
end;
$$;

drop function if exists private.inheritable_card(uuid, uuid, uuid);
