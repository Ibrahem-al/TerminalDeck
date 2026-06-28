import { create } from 'zustand'

/**
 * Live working directory per terminal pane, reported by the shell integration
 * (OSC 9;9 / OSC 7) on every prompt. Kept in its own store — not in the
 * workspace store — so the high-frequency cwd updates never churn the session
 * autosave. The equality guard in `setCwd` makes repeat reports (every prompt,
 * even without a `cd`) free.
 */
interface PaneCwdStore {
  byPane: Record<string, string>
  setCwd: (paneId: string, cwd: string) => void
  clear: (paneId: string) => void
}

export const usePaneCwd = create<PaneCwdStore>((set) => ({
  byPane: {},
  setCwd: (paneId, cwd) =>
    set((s) => (s.byPane[paneId] === cwd ? s : { byPane: { ...s.byPane, [paneId]: cwd } })),
  clear: (paneId) =>
    set((s) => {
      if (!(paneId in s.byPane)) return s
      const byPane = { ...s.byPane }
      delete byPane[paneId]
      return { byPane }
    })
}))
