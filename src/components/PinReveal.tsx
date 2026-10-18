import { Button } from './Button'
import { Card } from './Card'

export interface PinRevealProps {
  pin: string
  onDone: () => void
  /** Shown under the PIN, e.g. when the photo did not upload. */
  note?: string | null
}

/** Shown once after creating or joining. The PIN is never shown again. */
export function PinReveal({ pin, onDone, note }: PinRevealProps) {
  return (
    <div className="flex flex-col gap-5 pt-6">
      <h1 className="text-4xl">Your secret PIN</h1>
      <Card tone="yellow" tilt={-2} className="text-center">
        <p className="label-mono">Seat PIN</p>
        <p
          className="font-display text-7xl tracking-[0.2em]"
          aria-label={`PIN ${pin.split('').join(' ')}`}
        >
          {pin}
        </p>
      </Card>
      <p className="font-medium">
        Screenshot it or write it down. If you lose your phone, this PIN gets your seat back on a
        new device. <strong>We will not show it again.</strong>
      </p>
      {note && <p className="font-bold text-red-ink">{note}</p>}
      <Button size="lg" block onClick={onDone}>
        Got it
      </Button>
    </div>
  )
}
