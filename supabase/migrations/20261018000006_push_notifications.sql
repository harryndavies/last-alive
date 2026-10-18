-- Web Push notifications.
--
-- Devices register a push subscription (per anonymous user, i.e. per device).
-- Deferred triggers on `kills` and `events` decide who to notify once the
-- transaction has fully committed its changes, then hand the message to the
-- send-push Edge Function through pg_net. Nothing here may ever make a game
-- action fail: every notify call swallows its own errors.

create table public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) < 1000),
  user_id uuid not null,
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  user_agent text check (user_agent is null or char_length(user_agent) < 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Only the Edge Function (service role) reads this. Clients go through the RPCs.
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, v_uid, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now();
end;
$$;

create function public.delete_push_subscription(p_endpoint text)
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid()
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

-- Queues one push to the current devices of the given players.
create function private.notify_players(
  p_player_ids uuid[], p_title text, p_body text, p_url text, p_tag text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_users uuid[];
  v_url text;
  v_secret text;
begin
  select array_agg(distinct p.user_id) into v_users
  from public.players p where p.id = any (p_player_ids);

  -- Skip the HTTP call entirely when none of them has turned notifications on.
  if v_users is null or not exists (
    select 1 from public.push_subscriptions s where s.user_id = any (v_users)
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets
  where name = 'last_alive_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets
  where name = 'last_alive_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url || '/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object(
      'user_ids', to_jsonb(v_users),
      'title', p_title,
      'body', p_body,
      'url', p_url,
      'tag', p_tag
    )
  );
exception when others then
  -- A notification must never break the game action that caused it.
  raise warning 'notify_players failed: %', sqlerrm;
end;
$$;

-- Claims, disputes and rulings.
create function private.on_kill_notify()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_code text;
  v_killer text;
  v_victim text;
  v_hosts uuid[];
begin
  select code into v_code from public.games where id = new.game_id;
  select name into v_killer from public.players where id = new.killer_id;
  select name into v_victim from public.players where id = new.victim_id;

  if tg_op = 'INSERT' and new.status = 'pending' then
    -- Deliberately not naming the killer: lock screens are visible to others.
    perform private.notify_players(
      array[new.victim_id],
      'Someone says they got you',
      'Tap to answer. No reply in 12 hours counts as yes.',
      '/g/' || v_code,
      'claim-' || new.id
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'disputed' then
      select array_agg(id) into v_hosts
      from public.players where game_id = new.game_id and is_host;
      perform private.notify_players(
        v_hosts,
        'A kill needs your decision',
        v_killer || ' says they got ' || v_victim || '. ' || v_victim || ' says that''s wrong.',
        '/g/' || v_code,
        'dispute-' || new.id
      );
    elsif new.status = 'rejected' and new.resolved_by = 'host' then
      perform private.notify_players(
        array[new.killer_id],
        'Your claim was ruled out',
        'The host says your kill on ' || v_victim || ' didn''t count. Keep hunting.',
        '/g/' || v_code,
        'claim-' || new.id
      );
    end if;
  end if;
  return null;
end;
$$;

-- Confirmed kills and game phases. Deferred, so by the time this runs the
-- game status is final (a confirmed kill may also have ended the game).
create function private.on_event_notify()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_game public.games;
  v_all uuid[];
  v_killer uuid;
  v_victim uuid;
  v_alive integer;
  v_others uuid[];
  p jsonb := new.payload;
begin
  select * into v_game from public.games where id = new.game_id;
  if not found then
    return null;
  end if;
  select array_agg(id) into v_all from public.players where game_id = new.game_id;

  if new.type = 'picking_started' then
    perform private.notify_players(v_all, 'Time to pick your cards',
      'Write a weapon, a place and a phrase for the deck.',
      '/g/' || v_game.code || '/cards', 'phase-' || v_game.id);

  elsif new.type = 'game_started' then
    perform private.notify_players(v_all, 'The hunt is on',
      'Your secret mission is waiting. Keep your screen to yourself.',
      '/g/' || v_game.code || '/mission', 'phase-' || v_game.id);

  elsif new.type = 'game_finished' then
    perform private.notify_players(v_all,
      '♛ ' || coalesce(p->>'winner_name', 'Someone') || ' is the last one alive',
      'Game over. Watch the kill cam.',
      '/g/' || v_game.code || '/killcam', 'phase-' || v_game.id);

  elsif new.type = 'kill_confirmed' then
    v_killer := (p->>'killer_id')::uuid;
    v_victim := (p->>'victim_id')::uuid;

    if p->>'resolved_by' is distinct from 'victim' then
      perform private.notify_players(array[v_victim], 'You''re out',
        coalesce(p->>'killer_name', 'Someone') || ' got you.'
          || case p->>'resolved_by'
               when 'auto' then ' No answer in 12 hours, so it counts.'
               when 'host' then ' The host upheld the kill.'
               else '' end,
        '/g/' || v_game.code, 'out-' || v_victim);
    end if;

    -- The winner announcement covers everyone if this kill ended the game.
    if v_game.status = 'finished' then
      return null;
    end if;

    perform private.notify_players(array[v_killer],
      'Confirmed: you got ' || coalesce(p->>'victim_name', 'them'),
      'Their mission is yours now. Check your new target.',
      '/g/' || v_game.code || '/new-mission', 'mission-' || v_killer);

    select count(*) into v_alive from public.players
    where game_id = new.game_id and status = 'alive';
    select array_agg(id) into v_others from public.players
    where game_id = new.game_id and id not in (v_killer, v_victim);
    perform private.notify_players(v_others,
      '💀 ' || coalesce(p->>'killer_name', 'Someone') || ' got ' || coalesce(p->>'victim_name', 'someone'),
      v_alive || ' left. Trust no one.',
      '/g/' || v_game.code || '/board?tab=feed', 'feed-' || v_game.id);
  end if;
  return null;
end;
$$;

create constraint trigger kills_notify
  after insert or update of status on public.kills
  deferrable initially deferred
  for each row execute function private.on_kill_notify();

create constraint trigger events_notify
  after insert on public.events
  deferrable initially deferred
  for each row execute function private.on_event_notify();

revoke all on function private.notify_players(uuid[], text, text, text, text) from public, anon, authenticated;
revoke all on function private.on_kill_notify() from public, anon, authenticated;
revoke all on function private.on_event_notify() from public, anon, authenticated;

-- Stale subscriptions (the push service said the device is gone) are removed
-- by the Edge Function; this lets it do that through the API.
create function public.drop_push_subscriptions(p_endpoints text[])
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = any (p_endpoints)
$$;
revoke all on function public.drop_push_subscriptions(text[]) from public, anon, authenticated;
grant execute on function public.drop_push_subscriptions(text[]) to service_role;

-- Unrelated fix: record the real moment each player joined (now() is fixed per
-- transaction), so "longest-standing player" for host hand-over is exact.
alter table public.players alter column created_at set default clock_timestamp();
