import { useState } from 'react'
import { AvatarPicker, Button, Sheet } from '@/components'
import { clearAvatar, uploadAvatar } from '@/lib/avatars'
import { isAvatarColour } from '@/lib/colours'
import { errorMessage } from '@/lib/errors'
import { dataUrlToBlob } from '@/lib/image'
import { loadProfile, saveProfile } from '@/lib/profile'
import type { Player } from '../schemas'

export interface ChangePhotoSheetProps {
  open: boolean
  onClose: () => void
  me: Player
  userId: string
  onSaved: () => void
}

export function ChangePhotoSheet({ open, onClose, me, userId, onSaved }: ChangePhotoSheetProps) {
  // Start from the photo remembered on this device; the stored one is a signed URL.
  const [photo, setPhoto] = useState<string | null>(() => loadProfile()?.photo ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      if (photo) await uploadAvatar(me.game_id, userId, await dataUrlToBlob(photo))
      else await clearAvatar(me.game_id)
      saveProfile({
        name: me.name,
        colour: isAvatarColour(me.colour) ? me.colour : 'yellow',
        photo,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Your photo">
      <div className="flex flex-col gap-4">
        <AvatarPicker
          name={me.name}
          colour={me.colour}
          value={photo}
          onChange={setPhoto}
          disabled={saving}
        />
        <p className="text-sm font-medium">Only players in this game can see it.</p>
        {error && (
          <p role="alert" className="font-bold text-red-ink">
            {error}
          </p>
        )}
        <Button block loading={saving} onClick={() => void save()}>
          {photo ? 'Save photo' : me.avatar_path ? 'Remove my photo' : 'Done'}
        </Button>
      </div>
    </Sheet>
  )
}
