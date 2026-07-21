/**
 * Each renderer window reports its open terminal panes (sessionId, name, cwd)
 * here so the Agent can present and broadcast the SAME sessions to the phone.
 *
 * Reports are keyed by window (webContents id) and merged, so with several app
 * windows open the phone sees every window's panes — not just whichever one
 * reported last. When a window closes, its slice is dropped.
 */
import type { RemoteSessionInfo } from '@shared/types'

const byWindow = new Map<number, RemoteSessionInfo[]>()
const listeners = new Set<() => void>()

function notifyChanged(): void {
  for (const fn of listeners) fn()
}

export function setReportedSessions(windowId: number, list: RemoteSessionInfo[]): void {
  byWindow.set(windowId, list)
  notifyChanged()
}

/** Drop a closed window's sessions from the merged view. */
export function removeWindowSessions(windowId: number): void {
  if (byWindow.delete(windowId)) notifyChanged()
}

/** Which window (webContents id) reported a session, for jump-to-pane. */
export function windowIdForSession(sessionId: string): number | null {
  for (const [windowId, list] of byWindow) {
    if (list.some((s) => s.id === sessionId)) return windowId
  }
  return null
}

/** The reported info for one session (title/paneId lookups). */
export function sessionInfo(sessionId: string): RemoteSessionInfo | null {
  for (const list of byWindow.values()) {
    const found = list.find((s) => s.id === sessionId)
    if (found) return found
  }
  return null
}

/** All windows' reported sessions, de-duplicated by session id (ids are unique
 *  per main process, so a pane can't appear twice even across windows). */
export function reportedSessions(): RemoteSessionInfo[] {
  const seen = new Set<string>()
  const merged: RemoteSessionInfo[] = []
  for (const list of byWindow.values()) {
    for (const s of list) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      merged.push(s)
    }
  }
  return merged
}

/** Subscribe to registry changes. Multiple listeners are supported (phone
 *  broadcast + notch controller); returns an unsubscribe. */
export function onReportedSessionsChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
