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
let changed: (() => void) | null = null

export function setReportedSessions(windowId: number, list: RemoteSessionInfo[]): void {
  byWindow.set(windowId, list)
  changed?.()
}

/** Drop a closed window's sessions from the merged view. */
export function removeWindowSessions(windowId: number): void {
  if (byWindow.delete(windowId)) changed?.()
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

export function onReportedSessionsChange(fn: () => void): void {
  changed = fn
}
