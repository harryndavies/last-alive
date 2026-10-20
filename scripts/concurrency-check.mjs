#!/usr/bin/env node
// Fires parallel calls at the kill RPCs against the local stack and checks the
// result is as if they ran once: one death, one kill counted, one inheritance.
//   npm run test:concurrency
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'

const env = Object.fromEntries(
  (existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '')
    .split('\n')
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)
const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY

async function player(name) {
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await sb.auth.signInAnonymously()
  if (error) throw error
  return { sb, name }
}
async function call(p, fn, args) {
  const { data, error } = await p.sb.rpc(fn, args)
  if (error) throw new Error(`${p.name} ${fn}: ${error.message}`)
  return data
}

const ps = await Promise.all(['A', 'B', 'C', 'D', 'E'].map(player))
const [host] = ps
const game = await call(host, 'create_game', {
  p_game_name: 'Race',
  p_player_name: 'A',
  p_colour: 'red',
})
for (const p of ps.slice(1))
  await call(p, 'join_game', { p_code: game.code, p_name: p.name, p_colour: 'blue' })
for (const p of ps) {
  const { data } = await p.sb
    .from('players')
    .select('id')
    .eq('game_id', game.game_id)
    .eq('name', p.name)
    .single()
  p.id = data.id
}
await call(host, 'start_picking', { p_game_id: game.game_id })
await Promise.all(
  ps.map((p) =>
    call(p, 'submit_cards', {
      p_game_id: game.game_id,
      p_weapon: `W${p.name}`,
      p_place: `P${p.name}`,
      p_phrase: `Phrase ${p.name}`,
    }),
  ),
)
await call(host, 'start_game', { p_game_id: game.game_id })

const mission = async (p) =>
  (await p.sb.from('missions').select('*').eq('is_active', true).maybeSingle()).data
const killer = host
const m = await mission(killer)
const target = ps.find((p) => p.id === m.target_id)

// 1. Ten simultaneous reports return the same single claim.
const ids = await Promise.all(
  Array.from({ length: 10 }, () =>
    call(killer, 'report_kill', { p_game_id: game.game_id, p_victim_id: target.id }),
  ),
)
const uniqueClaims = new Set(ids).size

// 2. The victim mashes "Yes, I'm dead" ten times at once.
const results = await Promise.allSettled(
  Array.from({ length: 10 }, () =>
    call(target, 'respond_to_kill', { p_kill_id: ids[0], p_confirm: true }),
  ),
)

const { data: players } = await killer.sb
  .from('players')
  .select('name, status, player_stats!player_stats_player_id_fkey(kills_count)')
  .eq('game_id', game.game_id)
const { data: events } = await killer.sb
  .from('events')
  .select('type')
  .eq('game_id', game.game_id)
  .eq('type', 'kill_confirmed')
const killerRow = players.find((p) => p.name === killer.name)
const deadCount = players.filter((p) => p.status === 'dead').length
const killerMissions = (await killer.sb.from('missions').select('id').eq('is_active', true)).data
  .length

const checks = [
  ['10 parallel reports create 1 claim', uniqueClaims === 1],
  [
    '10 parallel confirms all succeed',
    results.every((r) => r.status === 'fulfilled' && r.value === 'confirmed'),
  ],
  ['exactly 1 player died', deadCount === 1],
  ['killer credited exactly once', killerRow.player_stats?.kills_count === 1],
  ['exactly 1 feed event', events.length === 1],
  ['killer has exactly 1 active mission', killerMissions === 1],
]
let ok = true
for (const [label, pass] of checks) {
  console.log(`${pass ? '✓' : '✗'} ${label}`)
  ok &&= pass
}
process.exit(ok ? 0 : 1)
