import { useEffect, useId, useRef, type ReactNode } from 'react'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** Bottom sheet built on <dialog> so focus trapping and Esc come for free. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal() focuses the first button (Close), which draws a focus ring
      // on open. Focus the panel instead: focus stays inside the sheet for
      // keyboard and screen-reader users, and nothing looks selected.
      panelRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto bg-transparent p-0 backdrop:bg-ink/60 open:animate-slide-up sm:mx-auto sm:max-w-md"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="rounded-t-3xl brut border-b-0 bg-paper px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink" aria-hidden="true" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-2xl">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full brut bg-paper font-display text-lg shadow-hard-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
