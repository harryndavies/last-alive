import { useId, useState } from 'react'
import { blobToDataUrl, squarePhoto } from '@/lib/image'
import { Avatar } from './Avatar'

export interface AvatarPickerProps {
  name: string
  colour: string
  /** The chosen photo as a small JPEG data URL, or null for none. */
  value: string | null
  onChange: (photo: string | null) => void
  disabled?: boolean
}

/** Optional profile photo. On phones the picker offers the camera or the library. */
export function AvatarPicker({ name, colour, value, onChange, disabled }: AvatarPickerProps) {
  const inputId = useId()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setWorking(true)
    setError(null)
    try {
      onChange(await blobToDataUrl(await squarePhoto(file)))
    } catch {
      setError('That photo could not be used. Try another one.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 label-mono">Your photo (optional)</legend>
      <div className="flex items-center gap-4">
        <Avatar name={name || '?'} colour={colour} src={value} size="xl" />
        <div className="flex flex-col items-start gap-1">
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="peer sr-only"
            disabled={disabled || working}
            onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <label
            htmlFor={inputId}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-xl brut bg-yellow px-4 font-display text-sm uppercase shadow-hard-sm peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-blue active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            {working ? 'Loading…' : value ? 'Change photo' : '📸 Add photo'}
          </label>
          {value && (
            <button
              type="button"
              className="min-h-11 label-mono underline"
              disabled={disabled || working}
              onClick={() => onChange(null)}
            >
              Remove photo
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm font-bold text-red-ink">
          {error}
        </p>
      )}
    </fieldset>
  )
}
