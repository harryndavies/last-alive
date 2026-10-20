// The words that change with the game's theme. Rules never change with the
// theme, only how the game looks and reads. Add a key here, then use it with
// useCopy() (components) or copyFor(theme) (plain functions).

export const THEMES = ['classic', 'spy'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_INFO: Record<Theme, { name: string; blurb: string }> = {
  classic: { name: 'Classic', blurb: 'Bold, bright and loud.' },
  spy: { name: 'Cold War spy', blurb: 'Dossiers, codenames, eyes only.' },
}

const classic = {
  tabHome: 'Home',
  tabMission: 'Mission',
  tabBoard: 'Board',
  homeAlive: 'Stay alive',
  homeOut: "You're out",
  statAlive: 'Alive',
  statKills: 'Kills',
  statSurvived: 'Survived',
  latestNews: 'Latest news',
  iGotThem: 'I got them!',
  iGotSomeone: 'I got someone!',
  missionKicker: 'Top secret',
  missionTitle: 'Your mission',
  weapon: 'Weapon',
  place: 'Place',
  phrase: 'Say',
  lobbyKicker: 'Lobby',
  cardsTitle: 'Pick your cards',
  boardTitle: 'The board',
  newMissionTag: 'New mission unlocked',
  killed: 'got',
  rumbled: 'rumbled',
  isOut: 'is out',
  gotchaStamp: 'Gotcha!',
  deadStamp: 'You got got',
  wasRumbled: 'got rumbled',
  hiddenBy: 'Out',
  feedTab: 'Kill feed',
  killCam: 'Kill cam',
  killCamSoFar: 'Kill cam so far',
  watchKillCam: 'Watch the kill cam',
  kill: 'kill',
  kills: 'kills',
}

export type Copy = typeof classic

const spy: Copy = {
  tabHome: 'HQ',
  tabMission: 'Dossier',
  tabBoard: 'Ledger',
  homeAlive: 'Field HQ',
  homeOut: 'Terminated',
  statAlive: 'Agents active',
  statKills: 'Hits',
  statSurvived: 'In the field',
  latestNews: 'Intercepted traffic',
  iGotThem: 'Mission accomplished',
  iGotSomeone: 'Target neutralised',
  missionKicker: 'Eyes only',
  missionTitle: 'Your assignment',
  weapon: 'Method',
  place: 'Location',
  phrase: 'Passphrase',
  lobbyKicker: 'Roster',
  cardsTitle: 'Equipment requisition',
  boardTitle: 'The ledger',
  newMissionTag: 'Reassignment',
  killed: 'terminated',
  rumbled: 'exposed',
  isOut: 'was neutralised',
  gotchaStamp: 'Neutralised',
  deadStamp: 'Terminated',
  wasRumbled: 'was exposed',
  hiddenBy: 'Neutralised',
  feedTab: 'Intercepts',
  killCam: 'Surveillance tape',
  killCamSoFar: 'Surveillance so far',
  watchKillCam: 'Watch the surveillance tape',
  kill: 'hit',
  kills: 'hits',
}

export function copyFor(theme: Theme | undefined): Copy {
  return theme === 'spy' ? spy : classic
}

// Codenames for the spy theme: one per player, unique within a game, and stable
// (worked out from ids, so everyone sees the same name without storing it).
const CODENAMES = [
  'NIGHTJAR',
  'FOXGLOVE',
  'MAGPIE',
  'HEMLOCK',
  'TOADFLAX',
  'KESTREL',
  'NIGHTSHADE',
  'WREN',
  'BELLADONNA',
  'OSPREY',
  'THISTLE',
  'SPARROWHAWK',
  'MANDRAKE',
  'CORMORANT',
  'BRAMBLE',
  'HERON',
  'WOLFSBANE',
  'CURLEW',
  'NETTLE',
  'GOSHAWK',
  'YARROW',
  'PLOVER',
  'HOGWEED',
  'MERLIN',
  'BLACKTHORN',
  'LAPWING',
  'TANSY',
  'SHRIKE',
  'IVY',
  'BITTERN',
  'RAGWORT',
  'PEREGRINE',
  'MISTLETOE',
  'STARLING',
  'HENBANE',
  'KITE',
  'SORREL',
  'NUTHATCH',
  'BRACKEN',
  'FALCON',
  'COMFREY',
  'ROOK',
  'TEASEL',
  'SWIFT',
  'ASPHODEL',
  'JACKDAW',
  'LOVAGE',
  'SANDPIPER',
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Each player's codename in a game, keyed by player id. */
export function codenames(gameId: string, playerIds: readonly string[]): Map<string, string> {
  const start = hash(gameId) % CODENAMES.length
  const ordered = [...playerIds].sort()
  return new Map(
    ordered.map((id, i) => [
      id,
      // Past the list's length (more players than names), add a number.
      (CODENAMES[(start + i) % CODENAMES.length] ?? 'AGENT') +
        (i >= CODENAMES.length ? ` ${Math.floor(i / CODENAMES.length) + 1}` : ''),
    ]),
  )
}
