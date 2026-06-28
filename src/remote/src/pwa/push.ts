import { getPushKey, subscribePush, unsubscribePush } from '../net/api'

/** VAPID public keys are base64url; the Push API wants the raw key bytes
 *  (explicitly ArrayBuffer-backed so it's a valid BufferSource). */
function urlB64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) !== null
}

/** Asks permission, subscribes to push, and registers the endpoint with the Agent. */
export async function enablePush(token: string): Promise<void> {
  if (!pushSupported()) throw new Error('not_supported')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('permission_denied')

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const key = await getPushKey(token)
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToBytes(key)
    }))
  await subscribePush(token, sub.toJSON())
}

export async function disablePush(token: string): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await sub.unsubscribe()
  await unsubscribePush(token)
}
