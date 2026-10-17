#!/usr/bin/env node
// Bot players for clicking through Last Alive locally.
//
//   npm run bots -- seed            create a game hosted by a bot, with 5 bots, print the link
//   npm run bots -- join CODE [n]   add n bots (default 5) to your game
//   npm run bots -- auto CODE       keep bots playing: lock cards, start (if a bot hosts),
//                                   confirm claims against them. Ctrl+C to stop.
//   npm run bots -- hunt CODE       the bot hunting YOU claims a kill on you
//   npm run bots -- kill CODE       one bot gets its (bot) target, confirmed instantly
//   npm run bots -- dispute CODE    bots dispute open claims against them instead of confirming
//   npm run bots -- status CODE     show who is alive
//
// Bots sign in anonymously and take their seat with reclaim_player + their PIN,
// which is stored in scripts/.bots.json (gitignored).
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const STATE_FILE = join(here, '.bots.json')

function loadEnv() {
  const env = { ...process.env }
  for (const file of ['.env.local', '.env']) {
    const path = join(here, '..', file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
  }
  return env
}

const env = loadEnv()
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173'
const NAMES = ['Botty', 'Robo', 'Chip', 'Gizmo', 'Bolt', 'Sprocket', 'Widget', 'Pixel', 'Servo']
const COLOURS = ['red', 'blue', 'mint', 'pink', 'orange', 'purple', 'paper', 'yellow']
const WEAPONS = [
  'Rubber duck',
  'Wooden spoon',
  'Sock',
  'Banana',
  'Teaspoon',
  'Pool noodle',
  'Post-it note',
  'Feather',
  'Ice cube',
]
const PLACES = [
  'Kitchen',
  'Lift',
  'Car park',
  'Bathroom',
  'Garden',
  'Staircase',
  'Bus stop',
  'Sofa',
  'Front door',
]
const OBJECTS = [
  'Mug',
  'Umbrella',
  'Phone charger',
  'Plant',
  'Hat',
  'Book',
  'Remote control',
  'Biscuit',
  'Shoe',
]

const pick = (list, i) => list[i % list.length]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function readState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}
}
function saveBots(code, bots) {
  const state = readState()
  state[code] = bots.map(({ name, pin }) => ({ name, pin }))
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function client() {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
  })
}

async function call(sb, fn, args) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}

async function newBot(i) {
  const sb = client()
  const { error } = await sb.auth.signInAnonymously()
  if (error) throw error
  return { sb, name: pick(NAMES, i), colour: pick(COLOURS, i), index: i }
}

/** Signs every saved bot in and back into its seat. */
async function connectBots(code) {
  const saved = readState()[code]
  if (!saved?.length) throw new Error(`No bots saved for ${code}. Run "join ${code}" first.`)
  return Promise.all(
    saved.map(async (b, i) => {
      const bot = await newBot(i)
      const res = await call(bot.sb, 'reclaim_player', {
        p_code: code,
        p_name: b.name,
        p_pin: b.pin,
      })
      if (!res.ok) throw new Error(`${b.name} could not reclaim: ${res.error}`)
      return { ...bot, name: b.name, pin: b.pin, playerId: res.player_id, gameId: res.game_id }
    }),
  )
}

async function snapshot(bot) {
  const { data: game } = await bot.sb.from('games').select('*').eq('id', bot.gameId).single()
  const { data: players } = await bot.sb.from('players').select('*').eq('game_id', bot.gameId)
  return { game, players }
}

async function activeMission(bot) {
  const { data } = await bot.sb
    .from('missions')
    .select('*')
    .eq('hunter_id', bot.playerId)
    .eq('is_active', true)
    .maybeSingle()
  return data
}

async function cmdJoin(code, count = 5) {
  const existing = readState()[code] ?? []
  const bots = []
  for (let i = 0; i < count; i++) {
    const bot = await newBot(existing.length + i)
    let res
    for (let attempt = 0; ; attempt++) {
      try {
        const name = attempt ? `${bot.name}${attempt + 1}` : bot.name
        res = await call(bot.sb, 'join_game', { p_code: code, p_name: name, p_colour: bot.colour })
        bot.name = name
        break
      } catch (e) {
        if (!String(e.message).includes('name_taken') || attempt > 5) throw e
      }
    }
    bot.pin = res.pin
    bots.push(bot)
    // Save as we go, so an interrupted run never leaves bots without their PIN.
    saveBots(code, [...existing, ...bots])
    console.log(`+ ${bot.name} joined`)
  }
}

async function cmdSeed() {
  const host = await newBot(0)
  const res = await call(host.sb, 'create_game', {
    p_game_name: 'Bot Test Game',
    p_player_name: host.name,
    p_colour: host.colour,
  })
  host.pin = res.pin
  saveBots(res.code, [host])
  console.log(`Created ${res.code} hosted by ${host.name}`)
  await cmdJoin(res.code, 4)
  console.log(`\nJoin it yourself: ${APP_URL}/join/${res.code}`)
  console.log(`Then run: npm run bots -- auto ${res.code}`)
}

async function cmdAuto(code, { dispute = false, once = false } = {}) {
  const bots = await connectBots(code)
  console.log(`${bots.length} bots connected to ${code}. ${once ? '' : 'Ctrl+C to stop.'}`)
  for (;;) {
    for (const bot of bots) {
      let { game, players } = await snapshot(bot)
      if (!game) {
        // Another bots command (hunt, kill…) took the seat over with the PIN. Take it back.
        const res = await call(bot.sb, 'reclaim_player', {
          p_code: code,
          p_name: bot.name,
          p_pin: bot.pin,
        })
        if (!res.ok) continue
        ;({ game, players } = await snapshot(bot))
        if (!game) continue
      }
      const me = players.find((p) => p.id === bot.playerId)
      if (!me) continue

      if (game.status === 'picking' && !me.cards_locked) {
        await call(bot.sb, 'submit_cards', {
          p_game_id: game.id,
          p_weapon: pick(WEAPONS, bot.index + 3),
          p_place: pick(PLACES, bot.index + 5),
          p_object: pick(OBJECTS, bot.index + 7),
        })
        console.log(`  ${bot.name} locked in cards`)
      }

      if (
        me.is_host &&
        game.status === 'lobby' &&
        players.length >= 4 &&
        players.length > bots.length
      ) {
        await call(bot.sb, 'start_picking', { p_game_id: game.id })
        console.log(`  ${bot.name} (host) started card picking`)
      }
      if (
        me.is_host &&
        game.status === 'picking' &&
        players.length >= 4 &&
        players.every((p) => p.cards_locked)
      ) {
        await call(bot.sb, 'start_game', { p_game_id: game.id })
        console.log(`  ${bot.name} (host) started the game`)
      }

      if (game.status === 'active') {
        const { data: kills } = await bot.sb
          .from('kills')
          .select('*')
          .eq('game_id', game.id)
          .in('status', ['pending', 'disputed'])
        for (const k of kills ?? []) {
          if (k.victim_id === bot.playerId && k.status === 'pending') {
            const status = await call(bot.sb, 'respond_to_kill', {
              p_kill_id: k.id,
              p_confirm: !dispute,
            })
            console.log(`  ${bot.name} answered a claim: ${status}`)
          }
          if (me.is_host && k.status === 'disputed' && k.victim_id !== bot.playerId) {
            // Bot hosts leave disputes for a human to look at.
          }
        }
      }
      if (game.status === 'finished') {
        console.log(`Game over.`)
        return
      }
    }
    if (once) return
    await sleep(2000)
  }
}

async function cmdHunt(code) {
  const bots = await connectBots(code)
  const botIds = new Set(bots.map((b) => b.playerId))
  for (const bot of bots) {
    const m = await activeMission(bot)
    if (m && !botIds.has(m.target_id)) {
      await call(bot.sb, 'report_kill', {
        p_game_id: bot.gameId,
        p_victim_id: m.target_id,
        p_used_object: true,
        p_note: 'Got you by the kettle!',
      })
      console.log(`${bot.name} claims they got you. Check your phone.`)
      return
    }
  }
  console.log('No living bot is hunting a human right now.')
}

async function cmdKill(code) {
  const bots = await connectBots(code)
  const byId = new Map(bots.map((b) => [b.playerId, b]))
  for (const bot of bots) {
    const m = await activeMission(bot)
    const victim = m && byId.get(m.target_id)
    if (!victim) continue
    const killId = await call(bot.sb, 'report_kill', {
      p_game_id: bot.gameId,
      p_victim_id: victim.playerId,
    })
    await call(victim.sb, 'respond_to_kill', { p_kill_id: killId, p_confirm: true })
    console.log(`${bot.name} got ${victim.name}`)
    return
  }
  console.log('No bot is hunting another bot right now.')
}

async function cmdStatus(code) {
  const [bot] = await connectBots(code)
  const { game, players } = await snapshot(bot)
  console.log(`${game.name} (${game.code}): ${game.status}`)
  for (const p of players)
    console.log(`  ${p.status === 'alive' ? '●' : '✕'} ${p.name}  kills=${p.kills_count}`)
}

const [cmd, code, arg] = process.argv.slice(2)
const upper = code?.toUpperCase()
const commands = {
  seed: () => cmdSeed(),
  join: () => cmdJoin(upper, Number(arg ?? 5)),
  auto: () => cmdAuto(upper),
  once: () => cmdAuto(upper, { once: true }),
  dispute: () => cmdAuto(upper, { dispute: true, once: true }),
  hunt: () => cmdHunt(upper),
  kill: () => cmdKill(upper),
  status: () => cmdStatus(upper),
}

if (!commands[cmd] || (cmd !== 'seed' && !upper)) {
  console.log(
    readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 14)
      .join('\n'),
  )
  process.exit(1)
}

commands[cmd]()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
