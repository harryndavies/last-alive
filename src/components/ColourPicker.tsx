import { AVATAR_COLOURS, COLOUR_HEX, type AvatarColour } from '@/lib/colours'
import { cn } from '@/lib/cn'

export interface ColourPickerProps {
  value: AvatarColour
  onChange: (colour: AvatarColour) => void
  name?: string
}

export function ColourPicker({ value, onChange, name = 'colour' }: ColourPickerProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 label-mono">Your colour</legend>
      <div className="flex flex-wrap gap-3">
        {AVATAR_COLOURS.map((colour) => (
          <label key={colour} className="relative">
            <input
              type="radio"
              name={name}
              value={colour}
              checked={value === colour}
              onChange={() => onChange(colour)}
              className="peer sr-only"
            />
            <span className="sr-only">{colour}</span>
            <span
              aria-hidden="true"
              style={{ backgroundColor: COLOUR_HEX[colour] }}
              className={cn(
                'block size-11 cursor-pointer rounded-full brut shadow-hard-sm transition-transform',
                'peer-checked:scale-110 peer-checked:shadow-hard peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-blue',
              )}
            />
            {value === colour && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-lg"
              >
                ✓
              </span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
