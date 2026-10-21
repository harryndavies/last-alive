-- Dealing fix: weapon and place cards were shuffled separately, but nothing
-- stopped one hunter getting both from the same person. In a 4-player game
-- there are only two legal deals per kind, so half the time every
-- weapon/place pair stayed together ("wine" always came with "tennis court").
-- Now each hunter's cards come from different people whenever possible. With 4
-- players the phrase has to repeat someone (only two people's cards are
-- allowed per hunter without giving away the target); weapon and place never do.

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
  -- Whose card each hunter already got, so their next card comes from someone else.
  v_weapon_from uuid[];
  v_place_from uuid[];
  v_from uuid[];
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
    -- Fully split deals are rare in 5-7 player games (well under 1% of
    -- shuffles), so allow plenty of tries before relaxing a rule.
    for v_try in 1..4000 loop
      select array_agg(g order by random()) into v_perm from generate_series(1, v_m) g;
      v_ok := true;
      for i in 1..v_n loop
        v_idx := v_perm[((i - 1) % v_m) + 1];
        v_owner := v_owners[v_idx];
        -- Never your own card. Until try 3500, never your target's (a giveaway).
        -- Until try 3000, never two cards from the same person (impossible for
        -- the phrase with 4 players, so not attempted there).
        if v_owner = v_ring[i]
          or (v_try <= 3500 and v_n > 3 and v_owner = v_ring[(i % v_n) + 1])
          or (v_try <= 3000 and not (v_kind = 'phrase' and v_n <= 4)
            and (v_owner = v_weapon_from[i] or v_owner = v_place_from[i])) then
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
    v_from := array[]::uuid[];
    for i in 1..v_n loop
      v_chosen := v_chosen || v_cards[v_perm[((i - 1) % v_m) + 1]];
      v_from := v_from || v_owners[v_perm[((i - 1) % v_m) + 1]];
    end loop;

    if v_kind = 'weapon' then
      v_weapon := v_chosen;
      v_weapon_from := v_from;
    elsif v_kind = 'place' then
      v_place := v_chosen;
      v_place_from := v_from;
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
