-- Seasons: a chain of rematches is one season. The winner screen shows a
-- league table across every finished game in the chain up to this one.
-- Players are matched by user (their device), so a rename carries over.
-- Points: win 10, kill 2, survive to the end 1.

create function public.season_standings(p_game_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_member(p_game_id) then
    raise exception 'not_in_game';
  end if;

  with recursive chain as (
    select g.id, 1 as depth from public.games g where g.id = p_game_id
    union all
    select g.id, c.depth + 1 from public.games g join chain c on g.rematch_game_id = c.id
  ),
  -- Only finished games count, so a live game never leaks its kills.
  done as (
    select g.id, g.winner_player_id, c.depth
    from chain c join public.games g on g.id = c.id
    where g.status = 'finished'
  ),
  seats as (
    select p.user_id, p.name, p.colour, d.depth,
      (p.id = d.winner_player_id) as won,
      coalesce(s.kills_count, 0) as kills,
      (p.status = 'alive') as survived
    from done d
    join public.players p on p.game_id = d.id
    left join public.player_stats s on s.player_id = p.id
  ),
  totals as (
    select user_id,
      -- The name and colour from their most recent game.
      (array_agg(name order by depth))[1] as name,
      (array_agg(colour order by depth))[1] as colour,
      count(*)::int as played,
      count(*) filter (where won)::int as wins,
      sum(kills)::int as kills,
      (10 * count(*) filter (where won) + 2 * sum(kills) + count(*) filter (where survived))::int
        as points
    from seats
    group by user_id
  )
  select jsonb_build_object(
    'games', (select count(*) from done),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
          'user_id', user_id, 'name', name, 'colour', colour, 'played', played,
          'wins', wins, 'kills', kills, 'points', points)
        order by points desc, wins desc, kills desc, name)
      from totals), '[]'::jsonb))
  into v_result;
  return v_result;
end;
$$;

revoke all on function public.season_standings(uuid) from public, anon;
grant execute on function public.season_standings(uuid) to authenticated;
