/**
 * The renderer reports its open terminal panes (sessionId, name, cwd) here so
 * the Agent can present and broadcast the SAME sessions to the phone.
 */
import type { RemoteSessionInfo } from '@shared/types'

let sessions: RemoteSessionInfo[] = []
let changed: (() => void) | null = null

export function setReportedSessions(list: RemoteSessionInfo[]): void {
  sessions = list
  changed?.()
}

export function reportedSessions(): RemoteSessionInfo[] {
  return sessions
}

export function onReportedSessionsChange(fn: () => void): void {
  changed = fn
}
