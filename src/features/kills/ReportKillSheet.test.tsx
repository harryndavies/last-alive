import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Player } from '@/features/game/schemas'
import type { Mission } from '@/features/missions/queries'

const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<unknown>>()
vi.mock('@/lib/rpc', () => ({
  rpc: (name: string, args: Record<string, unknown>) => rpc(name, args),
  rpcParsed: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { ReportKillSheet } = await import('./ReportKillSheet')

const target: Player = {
  id: '11111111-1111-4111-8111-111111111111',
  game_id: '22222222-2222-4222-8222-222222222222',
  user_id: '33333333-3333-4333-8333-333333333333',
  name: 'Ben',
  colour: 'pink',
  is_host: false,
  status: 'alive',
  cards_locked: true,
  kills_count: 0,
  killed_by: null,
  died_at: null,
  created_at: '2026-10-01T00:00:00Z',
}

const mission: Mission = {
  id: '44444444-4444-4444-8444-444444444444',
  hunter_id: '55555555-5555-4555-8555-555555555555',
  target_id: target.id,
  is_active: true,
  inherited_from: null,
  created_at: '2026-10-01T00:00:00Z',
  weapon: { text: 'Sock' },
  place: { text: 'Kitchen' },
  phrase: { text: 'The eagle has landed' },
}

function renderSheet() {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReportKillSheet
        userId="66666666-6666-4666-8666-666666666666"
        open
        onClose={onClose}
        gameId={target.game_id}
        mission={mission}
        target={target}
      />
    </QueryClientProvider>,
  )
  return { onClose }
}

describe('ReportKillSheet', () => {
  it('needs the weapon, place and phrase ticked before you can confirm', async () => {
    renderSheet()
    const confirm = screen.getByRole('button', { name: 'Confirm the kill' })
    expect(confirm).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /took the weapon/ }))
    expect(confirm).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /Place/ }))
    expect(confirm).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /Said the phrase/ }))
    expect(confirm).toBeEnabled()
  })

  it('reports the kill with its note', async () => {
    rpc.mockResolvedValue('kill-id')
    const { onClose } = renderSheet()
    await userEvent.click(screen.getByRole('checkbox', { name: /took the weapon/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Place/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Said the phrase/ }))
    await userEvent.type(screen.getByRole('textbox', { name: /Note/ }), 'In the fridge')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm the kill' }))
    expect(rpc).toHaveBeenCalledWith('report_kill', {
      p_game_id: target.game_id,
      p_victim_id: target.id,
      p_note: 'In the fridge',
      p_photo_path: undefined,
    })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
