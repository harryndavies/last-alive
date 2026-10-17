import type { ReactNode } from 'react'
import { Tag } from './Tag'

export interface PageHeaderProps {
  kicker?: string
  title: string
  children?: ReactNode
}

export function PageHeader({ kicker, title, children }: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-2">
      {kicker && (
        <Tag tone="ink" tilt className="self-start">
          {kicker}
        </Tag>
      )}
      <h1 className="text-4xl break-words">{title}</h1>
      {children}
    </header>
  )
}
