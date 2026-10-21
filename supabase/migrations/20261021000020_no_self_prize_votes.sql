-- You can't vote for your own prize idea.

delete from public.prize_votes v
using public.prize_ideas i
where i.id = v.idea_id and i.player_id = v.voter_id;

create or replace function public.vote_prize(p_game_id uuid, p_idea_id uuid default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_idea public.prize_ideas;
begin
  if v_game.status not in ('lobby', 'picking') then
    raise exception 'wrong_phase';
  end if;
  if p_idea_id is null then
    delete from public.prize_votes where game_id = p_game_id and voter_id = v_me.id;
    return;
  end if;
  select * into v_idea from public.prize_ideas where id = p_idea_id and game_id = p_game_id;
  if not found then
    raise exception 'prize_not_found';
  end if;
  if v_idea.player_id = v_me.id then
    raise exception 'own_prize';
  end if;
  insert into public.prize_votes (game_id, voter_id, idea_id)
  values (p_game_id, v_me.id, p_idea_id)
  on conflict (game_id, voter_id) do update set idea_id = excluded.idea_id;
end;
$$;
