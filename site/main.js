// The hunting-circle demo: each tap plays the next kill. The killer inherits
// the victim's target, so the circle shrinks until one player is left.
;(() => {
  const svg = document.getElementById('ring-svg')
  const button = document.getElementById('ring-next')
  const caption = document.getElementById('ring-caption')
  if (!svg || !button || !caption) return

  const NS = 'http://www.w3.org/2000/svg'
  const PLAYERS = [
    { name: 'Ana', colour: '#ff4b3e' },
    { name: 'Ben', colour: '#3a6bff' },
    { name: 'Cat', colour: '#7be0b0' },
    { name: 'Dev', colour: '#ff9ad5' },
    { name: 'Eli', colour: '#ffd23f' },
    { name: 'Fay', colour: '#b18cff' },
  ]
  // A scripted game: who gets whom, in order (each killer hunts the victim at that point).
  const SCRIPT = ['Ana', 'Dev', 'Ana', 'Fay', 'Fay']
  const START = 'Ana hunts Ben, Ben hunts Cat, and so on round the circle.'

  const cx = 160
  const cy = 160
  const r = 118
  const nodeR = 30
  const pos = PLAYERS.map((_, i) => {
    const a = (i / PLAYERS.length) * Math.PI * 2 - Math.PI / 2
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  })

  let alive = PLAYERS.map((p) => p.name)
  let step = 0

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
    parent.appendChild(node)
    return node
  }

  const defs = el('defs', {}, svg)
  const marker = el(
    'marker',
    {
      id: 'head',
      viewBox: '0 0 10 10',
      refX: 8,
      refY: 5,
      markerWidth: 5,
      markerHeight: 5,
      orient: 'auto-start-reverse',
    },
    defs,
  )
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#111' }, marker)
  const markerRed = el(
    'marker',
    {
      id: 'head-red',
      viewBox: '0 0 10 10',
      refX: 8,
      refY: 5,
      markerWidth: 5,
      markerHeight: 5,
      orient: 'auto-start-reverse',
    },
    defs,
  )
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#ff4b3e' }, markerRed)

  const arrows = el('g', {}, svg)
  const nodes = el('g', {}, svg)

  PLAYERS.forEach((p, i) => {
    const g = el('g', { class: 'node', 'data-name': p.name }, nodes)
    el('circle', { cx: pos[i].x, cy: pos[i].y, r: nodeR, fill: p.colour }, g)
    el('text', { x: pos[i].x, y: pos[i].y }, g).textContent = p.name
  })

  function drawArrows(highlight) {
    arrows.replaceChildren()
    alive.forEach((name, i) => {
      const from = pos[PLAYERS.findIndex((p) => p.name === name)]
      const toName = alive[(i + 1) % alive.length]
      const to = pos[PLAYERS.findIndex((p) => p.name === toName)]
      const dx = to.x - from.x
      const dy = to.y - from.y
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len
      const uy = dy / len
      const start = { x: from.x + ux * (nodeR + 4), y: from.y + uy * (nodeR + 4) }
      const end = { x: to.x - ux * (nodeR + 8), y: to.y - uy * (nodeR + 8) }
      // Curve slightly outward so arrows across the circle stay readable.
      const mx = (start.x + end.x) / 2 + (start.y - end.y) * 0.12
      const my = (start.y + end.y) / 2 + (end.x - start.x) * 0.12
      const isHighlight = name === highlight
      el(
        'path',
        {
          d: `M${start.x},${start.y} Q${mx},${my} ${end.x},${end.y}`,
          class: `arrow${isHighlight ? ' hunter-arrow' : ''}`,
          'marker-end': `url(#${isHighlight ? 'head-red' : 'head'})`,
        },
        arrows,
      )
    })
  }

  function setDead(name, dead) {
    const node = nodes.querySelector(`[data-name="${name}"]`)
    if (node) node.classList.toggle('dead', dead)
  }

  function reset() {
    alive = PLAYERS.map((p) => p.name)
    step = 0
    PLAYERS.forEach((p) => setDead(p.name, false))
    drawArrows(null)
    caption.textContent = START
    button.textContent = 'Play the next kill'
  }

  button.addEventListener('click', () => {
    if (alive.length === 1) {
      reset()
      return
    }
    const killer = SCRIPT[step] ?? alive[0]
    const i = alive.indexOf(killer)
    const victim = alive[(i + 1) % alive.length]
    alive = alive.filter((n) => n !== victim)
    setDead(victim, true)
    step += 1
    if (alive.length === 1) {
      drawArrows(null)
      caption.textContent = `${killer} gets ${victim}. ${killer} is the last one alive!`
      button.textContent = 'Play it again'
      return
    }
    const next = alive[(alive.indexOf(killer) + 1) % alive.length]
    drawArrows(killer)
    caption.textContent = `${killer} gets ${victim} and inherits their mission. ${killer} now hunts ${next}.`
  })

  reset()
})()
