# Last Alive

A mobile-first web app for playing a real-life assassin game with friends. No accounts: you join
with a code, a name and a colour.

1. The host creates a game and shares the code (e.g. `CLUE-7Q`).
2. Everyone joins, then submits one **weapon** (an everyday object), one **place** and one
   **phrase** card.
3. The server secretly deals a hunting ring. Each hunter gets a target plus one weapon, place and
   phrase card, never their own.
4. Get your target to willingly take the weapon from you, in the place, then say the phrase. Tap
   **I got them**. The victim confirms or disputes. No answer within 12 hours counts as a yes.
   The host settles disputes.
5. The killer inherits the victim's mission. The last player alive wins.

**Stack:** React 18, TypeScript, Vite, TanStack Router (file-based) and Query, Supabase (Postgres,
anonymous auth, RLS, Realtime, RPC functions, pg_cron), Tailwind CSS v4, Zod, Vitest + React
Testing Library, pgTAP.

---

## Run it locally

You need Node 20+ and Docker running.

```bash
npm install
npx supabase start          # first run pulls the Docker images (a few minutes)
cp .env.example .env.local  # then paste the values below into it
npm run dev                 # http://localhost:5173
```

`npx supabase status` prints the values for `.env.local`:

| `.env.local`             | from `supabase status`                     |
| ------------------------ | ------------------------------------------ |
| `VITE_SUPABASE_URL`      | API URL (`http://127.0.0.1:54321`)         |
| `VITE_SUPABASE_ANON_KEY` | Publishable key (or the legacy `anon key`) |

The migrations in `supabase/migrations` are applied by `supabase start`. To start again from an
empty database, run `npm run db:reset`. Supabase Studio is at http://127.0.0.1:54323.

### Click through with bots

You need at least 4 players, so `scripts/bots.mjs` gives you bot players. Their PINs are saved
in `scripts/.bots.json`, which is gitignored.

```bash
npm run bots -- seed             # a game hosted by a bot, with 5 bots; prints a join link
npm run bots -- auto SNEAK-XW    # leave running: bots lock cards, start, and confirm claims
```

Open the link, join, and lock in your cards. The bot host then starts the game. In a second
terminal:

| Command                         | What it does                                                     |
| ------------------------------- | ---------------------------------------------------------------- |
| `npm run bots -- join CODE [n]` | add n bots (default 5) to **your** game, so you are the host     |
| `npm run bots -- hunt CODE`     | the bot hunting you claims a kill, so your phone shows the alert |
| `npm run bots -- kill CODE`     | one bot gets its bot target, confirmed at once                   |
| `npm run bots -- dispute CODE`  | bots answer open claims with "That's wrong"                      |
| `npm run bots -- status CODE`   | who is alive                                                     |

To test disputes and host decisions, create the game yourself and use `join`. When you kill a
bot, `auto` makes it confirm, and you get the **New mission unlocked** screen.

### Scripts

| Script                     | What it does                                               |
| -------------------------- | ---------------------------------------------------------- |
| `npm run dev`              | Vite dev server                                            |
| `npm run build`            | type-check, then build the static SPA into `dist/`         |
| `npm run typecheck`        | `tsc -b` only                                              |
| `npm run lint` / `format`  | ESLint (strict TS, no `any`) / Prettier                    |
| `npm test`                 | Vitest unit and component tests                            |
| `npm run test:db`          | pgTAP tests in `supabase/tests` (needs `supabase start`)   |
| `npm run test:concurrency` | parallel RPC calls against the local stack, checks results |
| `npm run db:types`         | regenerate `src/lib/database.types.ts` from the local DB   |

---

## How it fits together

```
src/
  routes/                  file-based routes (TanStack Router)
    index.tsx              /            landing
    new.tsx                /new         create a game
    join.$code.tsx         /join/$code  join, or reclaim a seat with a PIN
    g/$code/route.tsx      game layout: loads game + you, route guard, realtime, tab bar, victim alert
    g/$code/lobby.tsx      code + share, players, host "Start picking cards"
    g/$code/cards.tsx      weapon/place/phrase with suggestion chips, "n / m locked", host "Start the game"
    g/$code/index.tsx      Home: stats, target, "I got them!", claim status, host disputes, latest news
    g/$code/mission.tsx    top-secret mission with hide/reveal
    g/$code/new-mission.tsx  "You inherit X's mission" with NEW badges
    g/$code/board.tsx      Standings and Kill feed tabs
    g/$code/winner.tsx     winner and final standings
  components/              Button, Card, Tag, Avatar, Sheet, TabBar, StatBox, TextField, ColourPicker, …
  features/
    game/                  game/player queries and mutations, Zod schemas, route guard, realtime hook
    cards/                 card form, suggestions, PlayingCard
    missions/              your mission (and history), target card, reveal toggle
    kills/                 report sheet, victim alert, host dispute card, kill RPCs
    board/                 feed formatting, standings sort, feed and standings lists
  lib/                     supabase client + anonymous session, typed RPC helper, error codes
supabase/
  migrations/              schema + RLS, game RPCs, pg_cron jobs
  tests/                   pgTAP tests
```

### Identity

On first visit the app calls `supabase.auth.signInAnonymously()`. The session is stored in
localStorage, so the same device is recognised when it comes back. A seat is a `players` row
that links `auth.uid()` to a game and a name.

Joining with a name that is already taken never takes that seat over. Instead you see a
**Reclaim your seat** form. Each player is shown a 4-digit PIN once, when they join. The PIN is
stored as a bcrypt hash. `reclaim_player` checks it and moves the seat to the new device. Five
wrong PINs lock the seat for 15 minutes.

### Security model (enforced in Postgres, not the client)

- RLS is on for every table. The client can only `SELECT`. Clients have no insert, update or
  delete rights on any table.
- `missions` is readable only where `hunter_id` is one of your seats. `cards` shows only cards
  you wrote, plus the cards on your own missions. `kills` is visible to the killer and the
  victim, plus the host once a claim is disputed. Victim names reach everyone else only through
  the `events` feed, and only after a kill is confirmed. There is no public event for a claim or
  a dispute.
- Every write is a `SECURITY DEFINER` RPC with `search_path = ''`. Each one checks `auth.uid()`
  and the game state:
  `create_game`, `join_game`, `reclaim_player`, `start_picking`, `submit_cards`, `start_game`,
  `report_kill`, `respond_to_kill`, `resolve_dispute`, `remove_player`, `leave_game`, and the
  read helpers `game_preview` and `get_kill_claim`. Internal helpers live in a `private` schema,
  which the API does not expose.
- Every RPC that changes a game first locks that game's row (`FOR UPDATE`), so changes to one
  game run one at a time. Kill confirmation happens in one transaction: the victim dies, the
  killer's count goes up, both missions end, the killer gets the inherited mission, a feed event
  is written, and the game ends if one player is left. Confirming twice does nothing.
  `npm run test:concurrency` fires 10 simultaneous reports and 10 simultaneous confirms, then
  checks the outcome is as if each ran once.
- `pg_cron` runs `auto_confirm_expired_kills` every 5 minutes and `cleanup_old_games` daily.
  Cleanup deletes finished games after 7 days and abandoned lobbies after 30.

### Realtime

`useGameRealtime` opens one channel per game and listens to `players`, `kills` and `events`. A
change never updates the cache directly. It invalidates the matching TanStack Query keys, and
the data is refetched through RLS. Realtime also applies RLS to each subscriber, so the victim's
phone gets the new pending claim and nobody else's does. The game layout shows the victim alert
whenever you have a pending claim against you.

### Route guards

`features/game/guard.ts` decides where each player may be:

| Game status | Allowed screens                                                       |
| ----------- | --------------------------------------------------------------------- |
| lobby       | lobby                                                                 |
| picking     | cards                                                                 |
| active      | home, mission, new-mission, board (dead players: home and board only) |
| finished    | winner, board                                                         |

The guard runs in `beforeLoad` and again whenever the status changes over Realtime. That's why
everyone moves from lobby to cards to home together.

---

## Deploy

### Supabase (hosted)

1. Create a project, then link it and push the migrations:

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

2. **Authentication → Sign In / Providers:** turn on **Allow anonymous sign-ins**. Turn on
   CAPTCHA (Turnstile or hCaptcha) for anonymous sign-ins as well, or anyone can create users
   in bulk.
3. **Database → Extensions:** `pg_cron` must be enabled. The migration runs
   `create extension pg_cron`. If your plan forbids that, enable it in the dashboard and run
   `20261017000003_cron.sql` by hand.
4. **Database → Publications:** check that `supabase_realtime` includes `players`, `kills` and
   `events`. The migration adds them.
5. Copy the project URL and the publishable (anon) key for Vercel.

### Vercel

Import the repo. `vercel.json` already sets the Vite build, the SPA rewrites and the cache
headers. Add the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then
deploy. In Supabase, set **Auth → URL Configuration → Site URL** to the Vercel URL.

### PWA

`public/manifest.webmanifest`, the icons, and a small service worker (`public/sw.js`, registered
in production only) make the app installable to the home screen. The service worker caches the
app shell and hashed assets. It never caches Supabase traffic, because a stale mission is worse
than none.
