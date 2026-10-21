import { useCallback, useEffect, useState } from 'react'
import { Avatar, FitText, Gravestone, Tag } from '@/components'
import { KillPhoto } from '@/features/kills/KillPhoto'
import { useKillPhotoUrl } from '@/features/kills/photos'
import { cn } from '@/lib/cn'
import { epitaph } from './epitaph'
import { whenInGame, type Slide, type Who } from './killcamSlides'
import { useCopy } from '@/lib/theme'

const SLIDE_MS = { intro: 3500, kill: 6000, winner: 6000 } as const

export interface Banter {
  reactions: Array<{ emoji: string; count: number }>
  comments: Array<{ id: string; author: string; body: string }>
}

export interface KillCamProps {
  slides: Slide[]
  startedAt: string | null
  onClose: () => void
  /** Reactions and latest comments per kill event id. */
  banter?: Map<number, Banter>
}

/** Full-screen, stories-style replay. Tap right/left to skip, hold the pause button to look. */
export function KillCam({ slides, startedAt, onClose, banter }: KillCamProps) {
  const copy = useCopy()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const slide = slides[index]
  const last = index === slides.length - 1

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, slides.length - 1)),
    [slides.length],
  )
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === ' ') {
        e.preventDefault()
        setPaused((p) => !p)
      } else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onClose])

  // Warm up the next photo so it is there when the slide changes.
  const upcoming = slides[index + 1]
  const { data: upcomingUrl } = useKillPhotoUrl(
    upcoming?.kind === 'kill' ? upcoming.photoPath : null,
  )
  useEffect(() => {
    if (upcomingUrl) new Image().src = upcomingUrl
  }, [upcomingUrl])

  if (!slide) return null

  return (
    <div
      role="region"
      aria-roledescription="slideshow"
      aria-label={copy.killCam}
      className="fixed inset-0 z-40 flex flex-col bg-ink text-paper"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-1.5" aria-hidden="true">
          {slides.map((s, i) => (
            <div key={s.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper/25">
              {i < index && <div className="h-full w-full bg-yellow" />}
              {i === index && (
                <div
                  key={`${s.key}-progress`}
                  className="h-full bg-yellow motion-reduce:w-full"
                  style={{
                    animation: `killcam-progress ${SLIDE_MS[s.kind]}ms linear forwards`,
                    animationPlayState: paused ? 'paused' : 'running',
                  }}
                  onAnimationEnd={() => (last ? setPaused(true) : next())}
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="label-mono text-paper/80">{copy.killCam}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              className="inline-flex size-11 items-center justify-center rounded-full border-2 border-paper font-display"
              aria-label={paused ? 'Play' : 'Pause'}
            >
              {paused ? '▶' : '❚❚'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-11 items-center justify-center rounded-full border-2 border-paper font-display"
              aria-label="Close kill cam"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="relative mt-4 flex flex-1 flex-col" aria-live="polite">
          <SlideView
            slide={slide}
            startedAt={startedAt}
            banter={slide.kind === 'kill' ? banter?.get(slide.eventId) : undefined}
          />
          {/* Tap zones sit on top of the slide: left third goes back, the rest forward. */}
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize disabled:cursor-default"
            aria-label="Previous"
          />
          <button
            type="button"
            onClick={last ? onClose : next}
            className="absolute inset-y-0 right-0 w-2/3 cursor-e-resize"
            aria-label={last ? 'Finish' : 'Next'}
          />
        </div>

        <p className="mt-3 text-center label-mono text-paper/70">
          {index + 1} / {slides.length}
        </p>
      </div>
    </div>
  )
}

function SlideView({
  slide,
  startedAt,
  banter,
}: {
  slide: Slide
  startedAt: string | null
  banter?: Banter
}) {
  const copy = useCopy()
  switch (slide.kind) {
    case 'intro':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <Tag tone="red" tilt>
            Replay
          </Tag>
          <h2 className="text-6xl leading-[0.9]">
            The
            <br />
            <span className="inline-block -rotate-2 bg-yellow px-2 text-ink">kill cam</span>
          </h2>
          <p className="text-lg font-bold">{slide.gameName}</p>
          <p className="label-mono text-paper/80">
            {slide.kills} {slide.kills === 1 ? copy.kill : copy.kills} · {slide.players} players
          </p>
        </div>
      )

    case 'winner':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span aria-hidden="true" className="font-display text-6xl text-yellow">
            ♛
          </span>
          {slide.winner && (
            <Avatar
              name={slide.winner.name}
              colour={slide.winner.colour}
              photo={slide.winner.photo}
              size="xl"
            />
          )}
          <p className="label-mono">{slide.onTime ? 'Time’s up · most kills' : 'Last one alive'}</p>
          <FitText as="h2" max={60} className="text-yellow">
            {slide.winner?.name ?? 'Nobody'}
          </FitText>
          <p className="font-bold">
            {slide.kills} {slide.kills === 1 ? copy.kill : copy.kills}
          </p>
        </div>
      )

    case 'kill': {
      const line = epitaph({
        id: String(slide.eventId),
        weapon: slide.weapon,
        place: slide.place,
      })
      return (
        <article className="flex flex-1 flex-col gap-3" aria-label={`Kill ${slide.number}`}>
          <div className="flex items-center justify-between">
            <Tag tone="red">Kill #{slide.number}</Tag>
            <span className="label-mono text-paper/80">
              <time dateTime={slide.at}>{whenInGame(slide.at, startedAt)}</time>
            </span>
          </div>

          <div className="relative">
            <KillPhoto
              eager
              path={slide.photoPath}
              alt={`${slide.killer.name} gets ${slide.victim.name}`}
              className="max-h-[46dvh] w-full -rotate-1 rounded-2xl border-paper shadow-[6px_6px_0_#ffd23f]"
              fallback={<NoPhoto victim={slide.victim} line={line} />}
            />
            {slide.photoPath && (
              <Gravestone
                size="sm"
                className="absolute -right-2 -bottom-3 w-16 motion-safe:animate-[grave-drop_500ms_300ms_both]"
              />
            )}
          </div>

          <FitText as="h2" max={36} className="mt-1 leading-none">
            <span className="text-yellow">{slide.killer.name}</span> got {slide.victim.name}
          </FitText>

          {(slide.weapon || slide.place) && (
            <div className="flex flex-wrap gap-2">
              {slide.weapon && <Chip tone="bg-red">🗡 {slide.weapon}</Chip>}
              {slide.place && <Chip tone="bg-blue">⌖ {slide.place}</Chip>}
            </div>
          )}
          {slide.phrase && (
            <p className="rotate-1 self-start rounded-xl brut bg-mint px-3 py-2 font-display text-xl text-ink uppercase shadow-[4px_4px_0_#fffaf0]">
              “{slide.phrase}”
            </p>
          )}
          {slide.note && <p className="font-medium text-paper/90">{slide.note}</p>}
          {slide.resolvedBy === 'host' && (
            <p className="label-mono text-paper/70">Upheld by the host</p>
          )}
          {slide.resolvedBy === 'auto' && (
            <p className="label-mono text-paper/70">No reply in 12h</p>
          )}
          {banter && (banter.reactions.length > 0 || banter.comments.length > 0) && (
            <div className="mt-1 flex flex-col gap-2">
              {banter.reactions.length > 0 && (
                <p className="flex flex-wrap gap-1.5" aria-label="Reactions">
                  {banter.reactions.map((r) => (
                    <span
                      key={r.emoji}
                      className="inline-flex items-center gap-1 rounded-full border-2 border-paper px-2 py-0.5 text-sm"
                    >
                      {r.emoji} <b className="font-mono text-xs">{r.count}</b>
                    </span>
                  ))}
                </p>
              )}
              {banter.comments.map((c) => (
                <p key={c.id} className="text-sm text-paper/90">
                  <b className="text-yellow">{c.author}</b> {c.body}
                </p>
              ))}
            </div>
          )}
        </article>
      )
    }
  }
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn('rounded-lg brut px-2.5 py-1 font-display text-sm text-ink uppercase', tone)}
    >
      {children}
    </span>
  )
}

function NoPhoto({ victim, line }: { victim: Who; line: string }) {
  return (
    <div className="flex aspect-[4/3] w-full -rotate-1 flex-col items-center justify-center gap-2 rounded-2xl brut border-paper bg-red text-ink shadow-[6px_6px_0_#ffd23f]">
      <Gravestone
        size="md"
        name={victim.name}
        epitaph={line}
        className="motion-safe:animate-[grave-drop_500ms_200ms_both]"
      />
      <span className="label-mono">No photo. You had to be there.</span>
    </div>
  )
}
