/**
 * Web Push for RemoteDeck: real push notifications that reach a paired phone
 * even when the PWA is closed/backgrounded. The Agent generates a VAPID keypair
 * once, the phone subscribes (storing an endpoint at its browser's push
 * service), and the Agent POSTs encrypted messages to that endpoint over the
 * internet — independent of Tailscale/whether the phone is on the tailnet.
 */
import webpush from 'web-push'
import { hostname } from 'os'
import { getVapid, listPushSubs, removePushSubByEndpoint, setVapid } from '../store/persist'

let vapidConfigured = false

function ensureVapid(): { publicKey: string; privateKey: string } {
  let keys = getVapid()
  if (!keys) {
    keys = webpush.generateVAPIDKeys()
    setVapid(keys)
  }
  if (!vapidConfigured) {
    webpush.setVapidDetails(`mailto:remotedeck@${hostname()}.invalid`, keys.publicKey, keys.privateKey)
    vapidConfigured = true
  }
  return keys
}

/** The VAPID public key the PWA needs to subscribe. */
export function pushPublicKey(): string {
  return ensureVapid().publicKey
}

export interface PushPayload {
  title: string
  body: string
  tag?: string
}

/** Sends a push to every subscribed device; prunes endpoints the push service
 *  reports as gone (404/410). Returns how many were accepted. */
export async function pushToAll(payload: PushPayload): Promise<number> {
  ensureVapid()
  const body = JSON.stringify(payload)
  let sent = 0
  await Promise.all(
    listPushSubs().map(async ({ sub }) => {
      try {
        await webpush.sendNotification(sub, body, { TTL: 300 })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) removePushSubByEndpoint(sub.endpoint)
      }
    })
  )
  return sent
}
