-- Last Alive: core schema, row level security and grants.
-- Clients only ever SELECT (filtered by RLS). Every write goes through the
-- SECURITY DEFINER functions in 20261017000002_game_functions.sql.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.game_status as enum ('lobby', 'picking', 'active', 'finished');
create type public.player_status as enum ('alive', 'dead');
create type public.card_kind as enum ('weapon', 'place', 'object');
create type public.kill_status as enum ('pending', 'confirmed', 'disputed', 'rejected');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{3,8}-[A-Z0-9]{2}$'),
  name text not null check (char_length(name) between 1 and 40),
  host_player_id uuid,
  status public.game_status not null default 'lobby',
  winner_player_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  -- auth.uid() of the anonymous user currently holding this seat. Changes on reclaim.
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 20 and name = btrim(name)),
  colour text not null check (
    colour in ('yellow', 'red', 'blue', 'mint', 'pink', 'orange', 'purple', 'paper')
  ),
  is_host boolean not null default false,
  status public.player_status not null default 'alive',
  cards_locked boolean not null default false,
  kills_count integer not null default 0 check (kills_count >= 0),
  -- Public once a kill is confirmed (it is in the feed anyway). Null for leavers.
  killed_by uuid references public.players (id) on delete set null,
  died_at timestamptz,
  created_at timestamptz not null default now(),
  constraint players_game_user_unique unique (game_id, user_id),
  constraint players_game_name_unique unique (game_id, name)
);
-- Names are unique per game ignoring case, so "Sam" and "sam" cannot both join.
create unique index players_game_lower_name_idx on public.players (game_id, lower(name));
create index players_user_idx on public.players (user_id);

alter table public.games
  add constraint games_host_fk foreign key (host_player_id)
    references public.players (id) on delete set null deferrable initially deferred,
  add constraint games_winner_fk foreign key (winner_player_id)
    references public.players (id) on delete set null deferrable initially deferred;

-- Secrets live apart from `players` because Realtime broadcasts whole rows and
-- ignores column grants. Nobody can read this table except definer functions.
create table private.player_secrets (
  player_id uuid primary key references public.players (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  kind public.card_kind not null,
  text text not null check (char_length(text) between 2 and 60 and text = btrim(text)),
  submitted_by uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint cards_one_per_kind unique (submitted_by, kind)
);
create index cards_game_idx on public.cards (game_id);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  hunter_id uuid not null references public.players (id) on delete cascade,
  target_id uuid not null references public.players (id) on delete cascade,
  weapon_card_id uuid not null references public.cards (id) on delete cascade,
  place_card_id uuid not null references public.cards (id) on delete cascade,
  object_card_id uuid not null references public.cards (id) on delete cascade,
  is_active boolean not null default true,
  -- The mission this one was inherited from (the victim's), if any.
  inherited_from uuid references public.missions (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint missions_not_self check (hunter_id <> target_id)
);
-- Exactly one active mission per hunter, and each target hunted by one person.
create unique index missions_one_active_per_hunter on public.missions (hunter_id) where is_active;
create unique index missions_one_active_per_target on public.missions (target_id) where is_active;
create index missions_game_idx on public.missions (game_id);

create table public.kills (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete cascade,
  killer_id uuid not null references public.players (id) on delete cascade,
  victim_id uuid not null references public.players (id) on delete cascade,
  status public.kill_status not null default 'pending',
  used_object boolean not null default false,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text check (resolved_by in ('victim', 'host', 'auto', 'system')),
  constraint kills_not_self check (killer_id <> victim_id)
);
-- At most one open claim per mission.
create unique index kills_one_open_per_mission on public.kills (mission_id)
  where status in ('pending', 'disputed');
create index kills_game_idx on public.kills (game_id);
create index kills_pending_idx on public.kills (created_at) where status = 'pending';

create table public.events (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_game_idx on public.events (game_id, id desc);

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer so policies on players do not recurse)
-- ---------------------------------------------------------------------------
create function private.my_player_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select p.id from public.players p where p.user_id = auth.uid()
$$;

create function private.is_member(p_game_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players p where p.game_id = p_game_id and p.user_id = auth.uid()
  )
$$;

create function private.is_host(p_game_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    where p.game_id = p_game_id and p.user_id = auth.uid() and p.is_host
  )
$$;

revoke all on function private.my_player_ids() from public;
revoke all on function private.is_member(uuid) from public;
revoke all on function private.is_host(uuid) from public;
grant execute on function private.my_player_ids() to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_host(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.cards enable row level security;
alter table public.missions enable row level security;
alter table public.kills enable row level security;
alter table public.events enable row level security;
alter table private.player_secrets enable row level security;

create policy games_select_members on public.games
  for select to authenticated using (private.is_member(id));

create policy players_select_members on public.players
  for select to authenticated using (private.is_member(game_id));

-- Your own submitted cards, plus the cards on missions you hunt with.
create policy cards_select_own_or_mission on public.cards
  for select to authenticated using (
    submitted_by in (select private.my_player_ids())
    or exists (
      select 1 from public.missions m
      where m.hunter_id in (select private.my_player_ids())
        and cards.id in (m.weapon_card_id, m.place_card_id, m.object_card_id)
    )
  );

-- The core secret: you only ever see missions where you are the hunter.
create policy missions_select_own on public.missions
  for select to authenticated using (hunter_id in (select private.my_player_ids()));

-- Killer and victim see their claim. The host sees disputes they must resolve.
create policy kills_select_involved on public.kills
  for select to authenticated using (
    killer_id in (select private.my_player_ids())
    or victim_id in (select private.my_player_ids())
    or (private.is_host(game_id) and (status = 'disputed' or resolved_by = 'host'))
  );

create policy events_select_members on public.events
  for select to authenticated using (private.is_member(game_id));

-- No policies on private.player_secrets: unreadable to clients.

-- ---------------------------------------------------------------------------
-- Grants: read-only for signed-in users, nothing for anon.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
grant select on public.games, public.players, public.cards, public.missions, public.kills,
  public.events to authenticated;

-- Realtime: the client listens to these and invalidates TanStack Query keys.
-- Realtime applies the SELECT policies above for each subscriber.
alter publication supabase_realtime add table public.players, public.kills, public.events;
