/** Cheeky lines for a player's gravestone, built from how they went out. */
export interface Death {
  /** A stable id, so the same death always gets the same line. */
  id: string
  weapon?: string | null
  place?: string | null
  rumbled?: boolean
  left?: boolean
}

/** "A Rubber Duck " -> "rubber duck". */
function bare(text: string): string {
  return text
    .trim()
    .replace(/^(a|an|the|some)\s+/i, '')
    .toLowerCase()
}

function pick(id: string, options: string[]): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return options[h % options.length] ?? options[0] ?? ''
}

export function epitaph(d: Death): string {
  if (d.left) return pick(d.id, ['Left early. Coward.', 'Gone, but not got.'])
  if (d.rumbled) return pick(d.id, ['Caught red-handed.', 'Should have been sneakier.'])
  const weapon = d.weapon ? bare(d.weapon) : null
  const place = d.place ? bare(d.place) : null
  const lines: string[] = []
  if (weapon) {
    lines.push(
      `Trusted a ${weapon}.`,
      `Took the ${weapon}. Regrets everything.`,
      `Died holding a ${weapon}.`,
    )
  }
  if (place) lines.push(`Should have stayed out of the ${place}.`, `Last seen: the ${place}.`)
  if (lines.length === 0) lines.push('Never saw it coming.', 'Too trusting.')
  return pick(d.id, lines)
}
