import { useMemo } from 'react'
import { encode } from 'uqr'
import { Button, Sheet } from '@/components'

export interface QrSheetProps {
  open: boolean
  onClose: () => void
  code: string
  gameName: string
}

export function joinUrl(code: string): string {
  return `${window.location.origin}/join/${code}`
}

/** A QR code drawn as one SVG path. Generated on the phone, so it works offline. */
function QrCode({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(text, { ecc: 'M', border: 2 })
    let d = ''
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x},${y}h1v1h-1z`
      }),
    )
    return { size: qr.size, path: d }
  }, [text])

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="block size-full"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#111111" />
    </svg>
  )
}

export function QrSheet({ open, onClose, code, gameName }: QrSheetProps) {
  const url = joinUrl(code)
  return (
    <Sheet open={open} onClose={onClose} title="Scan to join">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="font-medium">Friends point their phone camera here and tap the link.</p>
        {/* White, square and big: easiest for cameras to read, even in a dark pub. */}
        <div className="w-full max-w-[min(20rem,70dvh)] -rotate-1 rounded-2xl brut bg-white p-3 shadow-hard-lg">
          {open && <QrCode text={url} label={`QR code to join ${gameName}`} />}
        </div>
        <div>
          <p className="label-mono">Or type the code</p>
          <p className="font-display text-4xl tracking-wide">{code}</p>
          <p className="mt-1 label-mono text-muted">{gameName}</p>
        </div>
        <p className="label-mono text-muted">Tip: turn your screen brightness up</p>
        <Button variant="paper" block onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  )
}
