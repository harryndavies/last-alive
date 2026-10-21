-- Prizes: before the game starts, each player can suggest a prize and vote for
-- one. When the game starts, the most-voted idea becomes the prize (ties by
-- coin flip). The app only shows the words; friends settle up themselves.

alter table public.games add column prize text;

create table public.prize_ideas (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (game_id, player_id)
);

create table public.prize_votes (
  game_id uuid not null references public.games (id) on delete cascade,
  voter_id uuid not null references public.players (id) on delete cascade,
  idea_id uuid not null references public.prize_ideas (id) on delete cascade,
  primary key (game_id, voter_id)
);
create index prize_votes_idea_idx on public.prize_votes (idea_id);

alter table public.prize_ideas enable row level security;
alter table public.prize_votes enable row level security;
create policy prize_ideas_select_members on public.prize_ideas
  for select to authenticated using (private.is_member(game_id));
create policy prize_votes_select_members on public.prize_votes
  for select to authenticated using (private.is_member(game_id));
-- Writes go through the functions below.
revoke all on public.prize_ideas, public.prize_votes from anon, authenticated;
grant select on public.prize_ideas, public.prize_votes to authenticated;

alter publication supabase_realtime add table public.prize_ideas;
alter publication supabase_realtime add table public.prize_votes;

-- Your one suggestion: set it, change it, or clear it with an empty string.
create function public.suggest_prize(p_game_id uuid, p_text text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
  v_text text := btrim(coalesce(p_text, ''));
begin
  if v_game.status not in ('lobby', 'picking') then
    raise exception 'wrong_phase';
  end if;
  if v_text = '' then
    delete from public.prize_ideas where game_id = p_game_id and player_id = v_me.id;
    return;
  end if;
  if char_length(v_text) > 60 then
    raise exception 'prize_too_long';
  end if;
  insert into public.prize_ideas (game_id, player_id, text)
  values (p_game_id, v_me.id, v_text)
  on conflict (game_id, player_id) do update set text = excluded.text;
end;
$$;

-- One vote each; vote again to move it, or pass null to take it back.
create function public.vote_prize(p_game_id uuid, p_idea_id uuid default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games := private.lock_game(p_game_id);
  v_me public.players := private.my_player(p_game_id);
begin
  if v_game.status not in ('lobby', 'picking') then
    raise exception 'wrong_phase';
  end if;
  if p_idea_id is null then
    delete from public.prize_votes where game_id = p_game_id and voter_id = v_me.id;
    return;
  end if;
  if not exists (select 1 from public.prize_ideas where id = p_idea_id and game_id = p_game_id) then
    raise exception 'prize_not_found';
  end if;
  insert into public.prize_votes (game_id, voter_id, idea_id)
  values (p_game_id, v_me.id, p_idea_id)
  on conflict (game_id, voter_id) do update set idea_id = excluded.idea_id;
end;
$$;

revoke all on function public.suggest_prize(uuid, text) from public, anon;
revoke all on function public.vote_prize(uuid, uuid) from public, anon;
grant execute on function public.suggest_prize(uuid, text) to authenticated;
grant execute on function public.vote_prize(uuid, uuid) to authenticated;

-- When the game starts, lock in the winning idea.
create function private.choose_prize()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_top int;
  v_tied int;
  v_text text;
begin
  select max(n) into v_top from (
    select i.text, count(v.voter_id)::int as n from public.prize_ideas i
    left join public.prize_votes v on v.idea_id = i.id
    where i.game_id = new.id group by i.id, i.text
  ) t;
  if v_top is null then
    return new;  -- nobody suggested anything
  end if;
  select count(*) into v_tied from (
    select i.text, count(v.voter_id)::int as n from public.prize_ideas i
    left join public.prize_votes v on v.idea_id = i.id
    where i.game_id = new.id group by i.id, i.text
  ) t where n = v_top;
  select text into v_text from (
    select i.text, count(v.voter_id)::int as n from public.prize_ideas i
    left join public.prize_votes v on v.idea_id = i.id
    where i.game_id = new.id group by i.id, i.text
  ) t where n = v_top order by random() limit 1;

  new.prize := v_text;
  perform private.log_event(new.id, 'prize_chosen', jsonb_build_object(
    'text', v_text, 'votes', v_top, 'coin_flip', v_tied > 1));
  return new;
end;
$$;

create trigger games_choose_prize before update of status on public.games
  for each row when (old.status = 'picking' and new.status = 'active')
  execute function private.choose_prize();
