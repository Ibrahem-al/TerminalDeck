import type { PairResponse, RemoteCreateOptions, RemoteSessionInfo, ListeningPort } from '@shared/types'

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

async function errorOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    return body.error ?? `http_${res.status}`
  } catch {
    return `http_${res.status}`
  }
}

export interface PairInfo {
  /** True when the desktop has an access passcode set (a second pairing factor). */
  passcodeRequired: boolean
  serverName: string
}

/** Public, pre-pair probe so the phone can collect a passcode before submitting. */
export async function getPairInfo(): Promise<PairInfo> {
  const res = await fetch('/api/pair-info')
  if (!res.ok) throw new Error(await errorOf(res))
  return (await res.json()) as PairInfo
}

export async function pair(code: string, deviceName: string, passcode?: string): Promise<PairResponse> {
  const res = await fetch('/api/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, deviceName, passcode })
  })
  if (!res.ok) throw new Error(await errorOf(res))
  return (await res.json()) as PairResponse
}

export async function listSessions(token: string): Promise<RemoteSessionInfo[]> {
  const res = await fetch('/api/sessions', { headers: authHeaders(token) })
  if (!res.ok) throw new Error(await errorOf(res))
  return ((await res.json()) as { sessions: RemoteSessionInfo[] }).sessions
}

export async function createSession(token: string, opts: RemoteCreateOptions): Promise<RemoteSessionInfo> {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(opts)
  })
  if (!res.ok) throw new Error(await errorOf(res))
  return (await res.json()) as RemoteSessionInfo
}

export async function deleteSession(token: string, id: string): Promise<void> {
  await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders(token) })
}

export async function listPorts(token: string): Promise<ListeningPort[]> {
  const res = await fetch('/api/ports', { headers: authHeaders(token) })
  if (!res.ok) throw new Error(await errorOf(res))
  return ((await res.json()) as { ports: ListeningPort[] }).ports
}

export async function getPushKey(token: string): Promise<string> {
  const res = await fetch('/api/push/key', { headers: authHeaders(token) })
  if (!res.ok) throw new Error(await errorOf(res))
  return ((await res.json()) as { key: string }).key
}

export async function subscribePush(token: string, subscription: unknown): Promise<void> {
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription })
  })
  if (!res.ok) throw new Error(await errorOf(res))
}

export async function unsubscribePush(token: string): Promise<void> {
  await fetch('/api/push/unsubscribe', { method: 'POST', headers: authHeaders(token) })
}
