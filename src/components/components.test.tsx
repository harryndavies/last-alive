import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { Button } from './Button'
import { ColourPicker } from './ColourPicker'
import { ProgressBar } from './ProgressBar'

describe('Button', () => {
  it('is a real button that is disabled while loading', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Go</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <Button onClick={onClick} loading>
        Go
      </Button>,
    )
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })
})

describe('ColourPicker', () => {
  it('is a labelled radio group', async () => {
    const onChange = vi.fn()
    render(<ColourPicker value="yellow" onChange={onChange} />)
    expect(screen.getByRole('group', { name: 'Your colour' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'yellow' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'mint' }))
    expect(onChange).toHaveBeenCalledWith('mint')
  })
})

describe('ProgressBar', () => {
  it('reports progress to assistive tech', () => {
    render(<ProgressBar value={3} max={5} label="Locked in" />)
    const bar = screen.getByRole('progressbar', { name: 'Locked in' })
    expect(bar).toHaveAttribute('aria-valuenow', '3')
    expect(screen.getByText('3 / 5')).toBeInTheDocument()
  })
})

describe('PlayingCard', () => {
  it('hides its text when the mission is hidden', () => {
    const { rerender } = render(<PlayingCard kind="weapon" text="Rubber duck" />)
    expect(screen.getByText('Rubber duck')).toBeInTheDocument()
    rerender(<PlayingCard kind="weapon" text="Rubber duck" hidden />)
    expect(screen.queryByText('Rubber duck')).not.toBeInTheDocument()
  })

  it('shows a NEW badge', () => {
    render(<PlayingCard kind="place" text="Kitchen" badge="New" />)
    expect(screen.getByText('New')).toBeInTheDocument()
  })
})
