import type { ReactNode } from 'react'
import { FitText } from './FitText'
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
      <FitText as="h1" max={36}>
        {title}
      </FitText>
      {children}
    </header>
  )
}
