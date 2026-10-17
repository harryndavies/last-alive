import { useQuery } from '@tanstack/react-query'
import { Button, Card, Tag } from '@/components'
import { errorMessage } from '@/lib/errors'
import { KillPhoto } from './KillPhoto'
import { claimQuery, useResolveDispute } from './queries'

/** For the host: a disputed claim and the two ways to settle it. */
export function DisputeCard({ gameId, killId }: { gameId: string; killId: string }) {
  const { data: claim } = useQuery(claimQuery(killId))
  const resolve = useResolveDispute(gameId)
  if (!claim) return null
  return (
    <Card tone="yellow" tilt={1} className="flex flex-col gap-3">
      <Tag tone="ink" className="self-start">
        Host decision
      </Tag>
      <p className="text-lg font-bold">
        {claim.killer.name} says they got {claim.victim.name}. {claim.victim.name} says that&rsquo;s
        wrong.
      </p>
      <KillPhoto
        eager
        path={claim.photo_path}
        alt={`${claim.killer.name}'s proof photo`}
        className="aspect-[4/5] w-full rounded-xl shadow-hard-sm"
        fallback={<p className="label-mono">No photo with this claim</p>}
      />
      <ul className="space-y-1 label-mono">
        <li>Weapon: {claim.weapon}</li>
        <li>Place: {claim.place}</li>
        <li>Phrase: “{claim.phrase}”</li>
      </ul>
      {claim.note && <p className="font-medium">&ldquo;{claim.note}&rdquo;</p>}
      {resolve.isError && (
        <p role="alert" className="font-bold text-red-ink">
          {errorMessage(resolve.error)}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="red"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ killId, confirm: true })}
        >
          Kill stands
        </Button>
        <Button
          variant="paper"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ killId, confirm: false })}
        >
          No kill
        </Button>
      </div>
    </Card>
  )
}
