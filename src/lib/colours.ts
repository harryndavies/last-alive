export const AVATAR_COLOURS = [
  'yellow',
  'red',
  'blue',
  'mint',
  'pink',
  'orange',
  'purple',
  'paper',
] as const

export type AvatarColour = (typeof AVATAR_COLOURS)[number]

export const COLOUR_HEX: Record<AvatarColour, string> = {
  yellow: '#ffd23f',
  red: '#ff4b3e',
  blue: '#3a6bff',
  mint: '#7be0b0',
  pink: '#ff9ad5',
  orange: '#ff8a3d',
  purple: '#b18cff',
  paper: '#fffaf0',
}

export function isAvatarColour(value: string): value is AvatarColour {
  return (AVATAR_COLOURS as readonly string[]).includes(value)
}
