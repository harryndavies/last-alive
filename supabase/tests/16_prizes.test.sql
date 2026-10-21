-- Prizes: suggest, vote, and the winner is locked in at the start.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.uid(p_letter text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-00000000000' || p_letter)::uuid;
$$;
create temp table ctx (k text primary key, v text);
create function pg_temp.v(p_k text) returns text language sql stable as $$
  select v from ctx where k = p_k;
$$;
create function pg_temp.game() returns uuid language sql stable as $$ select pg_temp.v('game')::uuid $$;
create function pg_temp.idea(p_text text) returns uuid language sql stable as $$
  select id from public.prize_ideas where game_id = pg_temp.game() and text = p_text;
$$;

select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'game', r->>'game_id' from (select public.create_game('Flat', 'Ana', 'red') r) s;
insert into ctx select 'code', code from public.games where id = pg_temp.game();
do $$
declare l text;
begin
  foreach l in array array['b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(pg_temp.v('code'), 'P' || l, 'blue');
  end loop;
end;
$$;

select pg_temp.login(pg_temp.uid('a'));
select public.suggest_prize(pg_temp.game(), ' Loser buys pizza ');
select public.suggest_prize(pg_temp.game(), 'Loser buys curry');
select is((select count(*)::int from public.prize_ideas where game_id = pg_temp.game()), 1,
  'one suggestion each: a new one replaces your old one');
select pg_temp.login(pg_temp.uid('b'));
select public.suggest_prize(pg_temp.game(), 'Winner picks the film');
select throws_ok($$ select public.suggest_prize(pg_temp.game(), repeat('x', 61)) $$, 'prize_too_long',
  'prizes are kept short');

-- Votes: b and c back the curry, d the film; d changes their mind once.
select pg_temp.login(pg_temp.uid('b'));
select public.vote_prize(pg_temp.game(), pg_temp.idea('Loser buys curry'));
select pg_temp.login(pg_temp.uid('c'));
select public.vote_prize(pg_temp.game(), pg_temp.idea('Loser buys curry'));
select pg_temp.login(pg_temp.uid('d'));
select public.vote_prize(pg_temp.game(), pg_temp.idea('Winner picks the film'));
select public.vote_prize(pg_temp.game(), pg_temp.idea('Winner picks the film'));
select is((select count(*)::int from public.prize_votes where game_id = pg_temp.game()), 3,
  'one vote each');

select pg_temp.login(pg_temp.uid('e'));
select throws_ok($$ select public.vote_prize(pg_temp.game(), pg_temp.idea('Loser buys curry')) $$,
  'not_in_game', 'outsiders cannot vote');

-- Start the game.
do $$
declare l text;
begin
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_picking(pg_temp.game());
  foreach l in array array['a', 'b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.submit_cards(pg_temp.game(), 'W' || l, 'P' || l, 'Say ' || l);
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_game(pg_temp.game());
end;
$$;

select is((select prize from public.games where id = pg_temp.game()), 'Loser buys curry',
  'the most-voted idea becomes the prize when the game starts');
select ok(exists (select 1 from public.events where game_id = pg_temp.game()
  and type = 'prize_chosen' and payload->>'text' = 'Loser buys curry'
  and (payload->>'coin_flip')::boolean = false), 'the feed announces it');

select pg_temp.login(pg_temp.uid('b'));
select throws_ok($$ select public.vote_prize(pg_temp.game(), pg_temp.idea('Winner picks the film')) $$,
  'wrong_phase', 'votes are locked once the game starts');

-- A game where nobody suggested anything has no prize; a tie is a coin flip.
select pg_temp.login(pg_temp.uid('a'));
insert into ctx select 'g2', r->>'game_id' from (select public.create_game('Two', 'Ana', 'red') r) s;
insert into ctx select 'code2', code from public.games where id = pg_temp.v('g2')::uuid;
do $$
declare l text;
begin
  foreach l in array array['b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.join_game(pg_temp.v('code2'), 'P' || l, 'blue');
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.suggest_prize(pg_temp.v('g2')::uuid, 'Pizza');
  perform pg_temp.login(pg_temp.uid('b'));
  perform public.suggest_prize(pg_temp.v('g2')::uuid, 'Curry');
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_picking(pg_temp.v('g2')::uuid);
  foreach l in array array['a', 'b', 'c', 'd'] loop
    perform pg_temp.login(pg_temp.uid(l));
    perform public.submit_cards(pg_temp.v('g2')::uuid, 'W' || l, 'P' || l, 'Say ' || l);
  end loop;
  perform pg_temp.login(pg_temp.uid('a'));
  perform public.start_game(pg_temp.v('g2')::uuid);
end;
$$;
select ok((select prize in ('Pizza', 'Curry') from public.games where id = pg_temp.v('g2')::uuid),
  'a tie still picks one of the tied ideas');
select ok(exists (select 1 from public.events where game_id = pg_temp.v('g2')::uuid
  and type = 'prize_chosen' and (payload->>'coin_flip')::boolean), '...and says it was a coin flip');

select * from finish();
rollback;
