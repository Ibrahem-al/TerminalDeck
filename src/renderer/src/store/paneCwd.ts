import { create } from 'zustand'

/**
 * Live working directory per terminal pane, reported by the shell integration
 * (OSC 9;9 / OSC 7) on every prompt. Kept in its own store — not in the
 * workspace store — so a cwd change doesn't re-render every workspace-bound
 * component. It is folded into the persisted session (see session.ts) so a
 * restored terminal reopens in its last dir; the session autosave subscribes
 * here. The equality guard in `setCwd` makes repeat reports (every prompt, even
 * without a `cd`) free, so only real directory changes trigger a save.
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
