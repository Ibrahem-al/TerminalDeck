/**
 * Token auth for the RemoteDeck Agent. The raw 256-bit device token is the
 * gate on every HTTP route and WS upgrade; only its SHA-256 is ever stored.
 * Comparison happens in persist.deviceForToken (constant-time over all rows).
 */
import type { IncomingMessage } from 'http'
import { deviceForToken, touchDevice } from '../store/persist'

const WS_TOKEN_PREFIX = 'bearer.'

/** Extract the bearer token from an `Authorization: Bearer <token>` header. */
export function bearerFromHttp(req: IncomingMessage): string | null {
  const h = req.headers['authorization']
  if (typeof h !== 'string') return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m ? m[1].trim() : null
}

/**
 * Browsers cannot set headers on a WebSocket, so the token rides as a second
 * subprotocol `bearer.<token>` alongside the app subprotocol. Read it from the
 * comma-joined `Sec-WebSocket-Protocol` request header.
 */
export function tokenFromWsProtocols(header: string | string[] | undefined): string | null {
  if (!header) return null
  const list = Array.isArray(header) ? header : header.split(',')
  for (const raw of list) {
    const p = raw.trim()
    if (p.startsWith(WS_TOKEN_PREFIX)) return p.slice(WS_TOKEN_PREFIX.length)
  }
  return null
}

/** Verifies a token and returns the device id (bumping lastSeen), or null. */
export function verifyToken(token: string | null): string | null {
  if (!token) return null
  const id = deviceForToken(token)
  if (id) touchDevice(id)
  return id
}
