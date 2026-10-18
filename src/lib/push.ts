import { useCallback, useEffect, useState } from 'react'
import { env } from './env'
import { rpc } from './rpc'

export type PushState =
  | 'unsupported' // this browser cannot do Web Push (or no key configured)
  | 'ios-install' // iPhone/iPad Safari: only works once added to the home screen
  | 'denied' // the user blocked notifications for this site
  | 'off' // can be turned on
  | 'on'

const VAPID = env.VITE_VAPID_PUBLIC_KEY || ''

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

function supported(): boolean {
  return (
    !!VAPID && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  )
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function save(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth)
    throw new Error('The browser gave an incomplete subscription')
  await rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent,
  })
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

function initialState(): PushState {
  if (isIos() && !isStandalone() && !('PushManager' in window)) return 'ios-install'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'off'
}

/** Push notification state for this device, plus actions to turn it on and off. */
export function usePush() {
  const [state, setState] = useState<PushState>(initialState)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If this device already subscribed, re-save it: the subscription follows the
  // current anonymous user, which changes when a seat is reclaimed.
  useEffect(() => {
    if (!supported() || Notification.permission !== 'granted') return
    let cancelled = false
    void (async () => {
      try {
        const sub = await currentSubscription()
        if (!sub || cancelled) return
        await save(sub)
        if (!cancelled) setState('on')
      } catch {
        // Leave it as "off"; the user can turn it on again.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(VAPID),
        }))
      await save(sub)
      setState('on')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn on notifications')
    } finally {
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const sub = await currentSubscription()
      if (sub) {
        await rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      setState('off')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn off notifications')
    } finally {
      setBusy(false)
    }
  }, [])

  return { state, busy, error, enable, disable }
}
