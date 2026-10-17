import { useEffect, useId, useMemo } from 'react'

export interface PhotoPickerProps {
  file: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
}

/** Optional proof photo. On phones the picker offers the camera or the library. */
export function PhotoPicker({ file, onChange, disabled }: PhotoPickerProps) {
  const inputId = useId()
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  if (file && preview) {
    return (
      <div className="flex items-center gap-3">
        <img
          src={preview}
          alt="Your proof photo"
          className="size-24 shrink-0 -rotate-2 rounded-xl brut object-cover shadow-hard-sm"
        />
        <div className="flex flex-col gap-1">
          <span className="label-mono">Proof photo ✓</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="min-h-11 self-start label-mono underline"
          >
            Remove photo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="peer sr-only"
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      <label
        htmlFor={inputId}
        className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl brut border-dashed bg-yellow p-3 shadow-hard-sm peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-blue active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      >
        <span aria-hidden="true" className="font-display text-2xl">
          📸
        </span>
        <span>
          <span className="block label-mono">Proof photo · optional</span>
          <span className="font-bold">Add a photo for the kill cam</span>
        </span>
      </label>
    </div>
  )
}
