import { create } from 'zustand'
import { useWorkspace } from './workspace'
import { paneIdsIn } from '../components/workspace/layout'

interface EditorStore {
  /** Open file paths per editor pane, in tab order. */
  filesByPane: Record<string, string[]>
  activeByPane: Record<string, string | null>
  dirty: Record<string, boolean>
  conflict: Record<string, boolean>

  /** Routes a file to an editor pane in the active tab (creates one if needed). */
  openFile: (path: string) => void
  closeFile: (paneId: string, path: string) => void
  activateFile: (paneId: string, path: string) => void
  /** Drops a pane's slice entirely (pane closed). */
  dropPane: (paneId: string) => string[]
  setDirty: (path: string, dirty: boolean) => void
  setConflict: (path: string, conflict: boolean) => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  filesByPane: {},
  activeByPane: {},
  dirty: {},
  conflict: {},

  openFile: (path) => {
    const ws = useWorkspace.getState()
    const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
    if (!tab) return
    const tabPanes = paneIdsIn(tab.layout)

    let target =
      tabPanes.find((id) => ws.panes[id]?.kind === 'editor' && id === tab.activePaneId) ??
      tabPanes.find((id) => ws.panes[id]?.kind === 'editor') ??
      null

    if (!target) {
      target = ws.splitPane(tab.activePaneId, 'row', { kind: 'editor' })
      if (!target) return // pane limit reached — toast already shown
    }

    set((s) => {
      const files = s.filesByPane[target] ?? []
      return {
        filesByPane: files.includes(path) ? s.filesByPane : { ...s.filesByPane, [target]: [...files, path] },
        activeByPane: { ...s.activeByPane, [target]: path }
      }
    })
    ws.setActivePane(tab.id, target)
  },

  closeFile: (paneId, path) =>
    set((s) => {
      const files = (s.filesByPane[paneId] ?? []).filter((p) => p !== path)
      const active = s.activeByPane[paneId]
      let nextActive = active
      if (active === path) {
        const old = s.filesByPane[paneId] ?? []
        const idx = old.indexOf(path)
        nextActive = files[Math.min(Math.max(0, idx), files.length - 1)] ?? null
      }
      return {
        filesByPane: { ...s.filesByPane, [paneId]: files },
        activeByPane: { ...s.activeByPane, [paneId]: nextActive }
      }
    }),

  activateFile: (paneId, path) =>
    set((s) => ({ activeByPane: { ...s.activeByPane, [paneId]: path } })),

  dropPane: (paneId) => {
    const files = get().filesByPane[paneId] ?? []
    set((s) => {
      const filesByPane = { ...s.filesByPane }
      const activeByPane = { ...s.activeByPane }
      delete filesByPane[paneId]
      delete activeByPane[paneId]
      return { filesByPane, activeByPane }
    })
    return files
  },

  setDirty: (path, dirty) =>
    set((s) => ({ dirty: { ...s.dirty, [path]: dirty } })),

  setConflict: (path, conflict) =>
    set((s) => ({ conflict: { ...s.conflict, [path]: conflict } }))
}))
