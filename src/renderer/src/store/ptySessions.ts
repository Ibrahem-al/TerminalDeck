import { create } from 'zustand'

/**
 * Maps each terminal pane to its live PTY sessionId. Used to report the
 * desktop's open terminal sessions to the Agent so the phone mirrors them.
 */
interface PtySessionEntry {
  sessionId: string
  createdAt: number
}

interface PtySessionsStore {
  byPane: Record<string, PtySessionEntry>
  setSession: (paneId: string, sessionId: string) => void
  clearSession: (paneId: string) => void
}

export const usePtySessions = create<PtySessionsStore>((set) => ({
  byPane: {},
  setSession: (paneId, sessionId) =>
    set((s) => ({ byPane: { ...s.byPane, [paneId]: { sessionId, createdAt: Date.now() } } })),
  clearSession: (paneId) =>
    set((s) => {
      if (!s.byPane[paneId]) return s
      const byPane = { ...s.byPane }
      delete byPane[paneId]
      return { byPane }
    })
}))
