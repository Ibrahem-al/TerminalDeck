import { create } from 'zustand'
import type { ShellKind } from '@shared/types'
import {
  buildGrid,
  layoutGeometry,
  paneInDirection,
  paneIdsIn,
  removePaneFromLayout,
  splitPaneInLayout,
  swapPanesInLayout,
  updateRatio,
  type Dir4,
  type Direction,
  type LayoutNode,
  type Template
} from '../components/workspace/layout'
import { toast } from './toasts'

export type PaneKind = 'terminal' | 'agent' | 'editor'

export interface PaneBadge {
  label: string
  color: string
}

export interface PaneMeta {
  id: string
  kind: PaneKind
  name: string
  shell?: ShellKind
  cwd?: string
  env?: Record<string, string>
  badge?: PaneBadge
  pinned?: boolean
  /** Terminal panes only: command auto-run once the shell is ready (e.g. 'claude'). */
  autoRun?: string
}

/** Defaults applied to newly created panes (set when a project opens). */
export interface SpawnDefaults {
  cwd?: string
  env?: Record<string, string>
  shell?: ShellKind
}

export interface WorkspaceTab {
  id: string
  name: string
  color: string
  layout: LayoutNode
  activePaneId: string
  /**
   * The pane that was active immediately before `activePaneId`, for tmux's
   * "last pane" jump (prefix ;). Absent until focus has moved at least once.
   */
  lastActivePaneId?: string
  /**
   * The pane currently zoomed to fill the tab (tmux prefix z). Non-destructive:
   * the layout is untouched; the other panes stay mounted but hidden. Cleared on
   * any focus change, and ignored if it no longer names a pane in the layout.
   */
  zoomedPaneId?: string
  /** Project this tab belongs to, when it was opened from a project. */
  projectId?: string
  /**
   * Panes that belong to this tab but are hidden from the layout. They stay
   * mounted (and their sessions alive) — a menu restores them. Absent = none.
   */
  hidden?: string[]
}

/** Optional extras when creating a tab (e.g. binding it to a project). */
export interface NewTabOptions {
  projectId?: string
  color?: string
}

export const TAB_COLORS = [
  '#d8a956',
  '#5b9dd9',
  '#4cc38a',
  '#ed5d5d',
  '#b583d9',
  '#4fb8c9',
  '#e8b130',
  '#9aa4b8'
]

export const MAX_PANES_PER_TAB = 16

let paneCounter = 0
let tabCounter = 0
const nextPaneId = (): string => `p${++paneCounter}-${Date.now().toString(36)}`

export interface NewPaneSpec {
  kind: PaneKind
  shell?: ShellKind
  name?: string
  cwd?: string
  env?: Record<string, string>
  badge?: PaneBadge
  /** Terminal panes only: command auto-run once the shell is ready (e.g. 'claude'). */
  autoRun?: string
}

interface WorkspaceStore {
  tabs: WorkspaceTab[]
  activeTabId: string
  panes: Record<string, PaneMeta>
  spawnDefaults: SpawnDefaults

  setSpawnDefaults: (defaults: SpawnDefaults) => void
  addTab: (template: Template, name?: string, opts?: NewTabOptions) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  reorderTabs: (from: number, to: number) => void
  cycleTabColor: (tabId: string) => void
  /** Sets a tab's color dot directly (right-click → color swatch). */
  setTabColor: (tabId: string, color: string) => void
  renameTab: (tabId: string, name: string) => void
  /**
   * Rebinds a tab to a project (or null to unbind), changing only which project
   * new panes spawn into — the existing layout and live sessions are untouched.
   * When `color` is given the tab's dot follows the project's color. Callers must
   * re-sync project context themselves when the rebinding tab is the active one.
   */
  setTabProject: (tabId: string, projectId: string | null, color?: string) => void

  /** Returns the new pane's id, or null when the pane limit blocks the split. */
  splitPane: (paneId: string, direction: Direction, spec: NewPaneSpec) => string | null
  /** Opens a new pane in the active tab (file-tree "open here"). Null if blocked. */
  openInActiveTab: (spec: NewPaneSpec) => string | null
  closePane: (paneId: string) => void
  setActivePane: (tabId: string, paneId: string) => void
  /** Moves focus to the pane spatially adjacent to the active one (tmux arrows/hjkl). */
  focusPaneInDirection: (dir: Dir4) => void
  /** Cycles focus through the active tab's panes in layout order (tmux o). */
  focusAdjacentPane: (delta: 1 | -1) => void
  /** Jumps back to the previously focused pane in the active tab (tmux ;). */
  focusLastPane: () => void
  /** Focuses the nth pane (1-based) in the active tab's layout order (pane numbers). */
  focusPaneByOrdinal: (ordinal: number) => void
  /** Swaps the active pane with its spatial neighbour, focus following (Alt+Shift+Arrow). */
  swapActivePaneInDirection: (dir: Dir4) => void
  /** Swaps the active pane with the next/previous pane in layout order (tmux { }). */
  swapAdjacentPane: (delta: 1 | -1) => void
  /** Zooms the active pane to fill the tab, or restores it (tmux z). */
  toggleZoomActivePane: () => void
  renamePane: (paneId: string, name: string) => void
  setSplitRatio: (tabId: string, splitId: string, ratio: number) => void
  setPaneBadge: (paneId: string, badge: PaneBadge | null) => void
  togglePin: (paneId: string) => void
  /** Swaps two panes' positions within their tab (sessions stay alive). */
  swapPanes: (paneIdA: string, paneIdB: string) => void
  /** Moves a pane into another tab, keeping its session alive. */
  movePaneToTab: (paneId: string, destTabId: string) => void
  /** Moves a pane into a brand-new tab, keeping its session alive. */
  movePaneToNewTab: (paneId: string) => void
  /** Hides a pane from its tab's layout (stays mounted/alive). */
  hidePane: (paneId: string) => void
  /** Restores a hidden pane back into its tab's layout. */
  restorePane: (paneId: string) => void
  /** Replaces the whole workspace from a saved session snapshot. */
  hydrate: (state: {
    tabs: WorkspaceTab[]
    panes: Record<string, PaneMeta>
    activeTabId: string
    spawnDefaults: SpawnDefaults
  }) => void
}

function makePane(spec: NewPaneSpec, index: number, defaults: SpawnDefaults): PaneMeta {
  const fallback =
    spec.kind === 'agent' ? `Agent ${index}` : spec.kind === 'editor' ? `Editor ${index}` : `Terminal ${index}`
  return {
    id: nextPaneId(),
    kind: spec.kind,
    name: spec.name ?? fallback,
    shell: spec.shell ?? defaults.shell,
    cwd: spec.cwd ?? defaults.cwd,
    env: spec.env ?? defaults.env,
    badge: spec.badge,
    autoRun: spec.autoRun
  }
}

function makeTab(
  template: Template,
  panes: Record<string, PaneMeta>,
  defaults: SpawnDefaults,
  name?: string,
  opts?: NewTabOptions
): WorkspaceTab {
  let i = 0
  const layout = buildGrid(template.rows, template.cols, () => {
    const pane = makePane({ kind: 'terminal' }, ++i, defaults)
    panes[pane.id] = pane
    return pane.id
  })
  const tabId = `tab${++tabCounter}-${Date.now().toString(36)}`
  return {
    id: tabId,
    name: name ?? `Deck ${tabCounter}`,
    color: opts?.color ?? TAB_COLORS[(tabCounter - 1) % TAB_COLORS.length],
    layout,
    activePaneId: paneIdsIn(layout)[0],
    projectId: opts?.projectId
  }
}

/**
 * Removes `paneId` from a tab's layout. Returns the updated tab, or null when
 * the tab should be dropped entirely. If the layout empties but the tab still
 * has hidden panes, one is promoted back into the layout so those panes aren't
 * orphaned (a tab with hidden panes always keeps ≥1 visible pane).
 */
function tabWithoutLayoutPane(tab: WorkspaceTab, paneId: string): WorkspaceTab | null {
  const newLayout = removePaneFromLayout(tab.layout, paneId)
  if (newLayout !== null) {
    const remaining = paneIdsIn(newLayout)
    return {
      ...tab,
      layout: newLayout,
      activePaneId: remaining.includes(tab.activePaneId) ? tab.activePaneId : remaining[0]
    }
  }
  const hidden = tab.hidden ?? []
  if (hidden.length > 0) {
    const [promote, ...rest] = hidden
    return { ...tab, layout: { type: 'pane', paneId: promote }, hidden: rest, activePaneId: promote }
  }
  return null
}

function initialState(): Pick<WorkspaceStore, 'tabs' | 'activeTabId' | 'panes' | 'spawnDefaults'> {
  const panes: Record<string, PaneMeta> = {}
  const tab = makeTab({ id: 'single', label: 'Single', rows: 1, cols: 1 }, panes, {})
  return { tabs: [tab], activeTabId: tab.id, panes, spawnDefaults: {} }
}

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  ...initialState(),

  setSpawnDefaults: (defaults) => set({ spawnDefaults: defaults }),

  addTab: (template, name, opts) =>
    set((s) => {
      const panes = { ...s.panes }
      const tab = makeTab(template, panes, s.spawnDefaults, name, opts)
      return { tabs: [...s.tabs, tab], panes, activeTabId: tab.id }
    }),

  closeTab: (tabId) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      if (!tab) return s
      const allIds = [...paneIdsIn(tab.layout), ...(tab.hidden ?? [])]
      const pinned = allIds.filter((id) => s.panes[id]?.pinned)
      if (pinned.length > 0) {
        toast('info', 'Tab has pinned panes', 'unpin them before closing the tab')
        return s
      }
      const panes = { ...s.panes }
      for (const id of allIds) delete panes[id]
      let tabs = s.tabs.filter((t) => t.id !== tabId)
      let activeTabId = s.activeTabId
      if (tabs.length === 0) {
        const fresh = makeTab({ id: 'single', label: 'Single', rows: 1, cols: 1 }, panes, s.spawnDefaults)
        tabs = [fresh]
        activeTabId = fresh.id
      } else if (activeTabId === tabId) {
        const idx = s.tabs.findIndex((t) => t.id === tabId)
        activeTabId = tabs[Math.max(0, idx - 1)].id
      }
      return { tabs, panes, activeTabId }
    }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  reorderTabs: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.tabs.length || to >= s.tabs.length) return s
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(from, 1)
      tabs.splice(to, 0, moved)
      return { tabs }
    }),

  cycleTabColor: (tabId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t
        const idx = TAB_COLORS.indexOf(t.color)
        return { ...t, color: TAB_COLORS[(idx + 1) % TAB_COLORS.length] }
      })
    })),

  setTabColor: (tabId, color) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, color } : t))
    })),

  renameTab: (tabId, name) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId && name.trim() !== '' ? { ...t, name: name.trim() } : t))
    })),

  setTabProject: (tabId, projectId, color) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, projectId: projectId ?? undefined, color: color ?? t.color }
          : t
      )
    })),

  splitPane: (paneId, direction, spec) => {
    const s = get()
    const tab = s.tabs.find((t) => paneIdsIn(t.layout).includes(paneId))
    if (!tab) return null
    // Count hidden panes too — they're live sessions, just parked off-layout.
    const count = paneIdsIn(tab.layout).length + (tab.hidden?.length ?? 0)
    if (count >= MAX_PANES_PER_TAB) {
      toast('info', `Pane limit reached (${MAX_PANES_PER_TAB} per workspace)`)
      return null
    }
    const pane = makePane(spec, count + 1, s.spawnDefaults)
    set((prev) => ({
      panes: { ...prev.panes, [pane.id]: pane },
      tabs: prev.tabs.map((t) =>
        t.id === tab.id
          ? {
              ...t,
              layout: splitPaneInLayout(t.layout, paneId, direction, pane.id),
              activePaneId: pane.id,
              zoomedPaneId: undefined // a split reveals the new pane — unzoom (like tmux)
            }
          : t
      )
    }))
    return pane.id
  },

  openInActiveTab: (spec) => {
    const { tabs, activeTabId, splitPane } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return null
    return splitPane(tab.activePaneId, 'row', spec)
  },

  closePane: (paneId) =>
    set((s) => {
      if (s.panes[paneId]?.pinned) {
        toast('info', 'Pane is pinned', 'unpin it to close')
        return s
      }

      // Closing a hidden pane: drop it from its tab's hidden list.
      const hiddenTab = s.tabs.find((t) => t.hidden?.includes(paneId))
      if (hiddenTab) {
        const panes = { ...s.panes }
        delete panes[paneId]
        return {
          panes,
          tabs: s.tabs.map((t) =>
            t.id === hiddenTab.id ? { ...t, hidden: (t.hidden ?? []).filter((id) => id !== paneId) } : t
          )
        }
      }

      const tab = s.tabs.find((t) => paneIdsIn(t.layout).includes(paneId))
      if (!tab) return s
      const panes = { ...s.panes }
      delete panes[paneId]
      const updated = tabWithoutLayoutPane(tab, paneId)

      if (updated === null) {
        // last pane in the tab (no hidden panes) → the tab goes too
        let tabs = s.tabs.filter((t) => t.id !== tab.id)
        let activeTabId = s.activeTabId
        if (tabs.length === 0) {
          const fresh = makeTab({ id: 'single', label: 'Single', rows: 1, cols: 1 }, panes, s.spawnDefaults)
          tabs = [fresh]
          activeTabId = fresh.id
        } else if (activeTabId === tab.id) {
          activeTabId = tabs[0].id
        }
        return { tabs, panes, activeTabId }
      }

      return { panes, tabs: s.tabs.map((t) => (t.id === tab.id ? updated : t)) }
    }),

  setActivePane: (tabId, paneId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        // No-op on a redundant activation, so `lastActivePaneId` only tracks real
        // moves and a click on the already-active pane doesn't clobber it.
        if (t.id !== tabId || t.activePaneId === paneId) return t
        // Any deliberate focus change restores a zoomed pane (matches tmux).
        return { ...t, lastActivePaneId: t.activePaneId, activePaneId: paneId, zoomedPaneId: undefined }
      })
    })),

  focusPaneInDirection: (dir) => {
    const s = get()
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    if (!tab) return
    const target = paneInDirection(tab.layout, tab.activePaneId, dir)
    if (target) s.setActivePane(tab.id, target)
  },

  focusAdjacentPane: (delta) => {
    const s = get()
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    if (!tab) return
    const ids = paneIdsIn(tab.layout)
    if (ids.length < 2) return
    const i = ids.indexOf(tab.activePaneId)
    s.setActivePane(tab.id, ids[(i + delta + ids.length) % ids.length])
  },

  focusLastPane: () => {
    const s = get()
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    if (!tab || !tab.lastActivePaneId) return
    if (paneIdsIn(tab.layout).includes(tab.lastActivePaneId)) s.setActivePane(tab.id, tab.lastActivePaneId)
  },

  focusPaneByOrdinal: (ordinal) => {
    const s = get()
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    if (!tab) return
    const ids = paneIdsIn(tab.layout)
    const target = ids[ordinal - 1]
    if (target) s.setActivePane(tab.id, target)
  },

  swapActivePaneInDirection: (dir) => {
    const s = get()
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    if (!tab) return
    const target = paneInDirection(tab.layout, tab.activePaneId, dir)
    if (target) s.swapPanes(tab.activePaneId, target) // focus follows the pane (its id is unchanged)
  },

  swapAdjacentPane: (delta) => {
    const s = get()
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    if (!tab) return
    const ids = paneIdsIn(tab.layout)
    if (ids.length < 2) return
    const i = ids.indexOf(tab.activePaneId)
    const j = (i + delta + ids.length) % ids.length
    if (i !== j) s.swapPanes(ids[i], ids[j])
  },

  toggleZoomActivePane: () =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === s.activeTabId
          ? { ...t, zoomedPaneId: t.zoomedPaneId === t.activePaneId ? undefined : t.activePaneId }
          : t
      )
    })),

  renamePane: (paneId, name) =>
    set((s) => {
      if (name.trim() === '') return s
      const pane = s.panes[paneId]
      if (!pane) return s
      return { panes: { ...s.panes, [paneId]: { ...pane, name: name.trim() } } }
    }),

  setSplitRatio: (tabId, splitId, ratio) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, layout: updateRatio(t.layout, splitId, ratio) } : t))
    })),

  setPaneBadge: (paneId, badge) =>
    set((s) => {
      const pane = s.panes[paneId]
      if (!pane) return s
      return { panes: { ...s.panes, [paneId]: { ...pane, badge: badge ?? undefined } } }
    }),

  togglePin: (paneId) =>
    set((s) => {
      const pane = s.panes[paneId]
      if (!pane) return s
      return { panes: { ...s.panes, [paneId]: { ...pane, pinned: !pane.pinned } } }
    }),

  swapPanes: (paneIdA, paneIdB) =>
    set((s) => {
      if (paneIdA === paneIdB) return s
      const tab = s.tabs.find((t) => {
        const ids = paneIdsIn(t.layout)
        return ids.includes(paneIdA) && ids.includes(paneIdB)
      })
      if (!tab) return s // only swap within the same tab
      return {
        tabs: s.tabs.map((t) =>
          t.id === tab.id ? { ...t, layout: swapPanesInLayout(t.layout, paneIdA, paneIdB) } : t
        )
      }
    }),

  movePaneToTab: (paneId, destTabId) =>
    set((s) => {
      const src = s.tabs.find((t) => paneIdsIn(t.layout).includes(paneId) || t.hidden?.includes(paneId))
      const dest = s.tabs.find((t) => t.id === destTabId)
      if (!src || !dest || src.id === dest.id) return s
      if (paneIdsIn(dest.layout).length + (dest.hidden?.length ?? 0) >= MAX_PANES_PER_TAB) {
        toast('info', `That deck is full (${MAX_PANES_PER_TAB} panes)`)
        return s
      }
      const wasHidden = src.hidden?.includes(paneId) ?? false
      const destUpdated: WorkspaceTab = {
        ...dest,
        layout: splitPaneInLayout(dest.layout, dest.activePaneId, 'row', paneId),
        activePaneId: paneId,
        zoomedPaneId: undefined // the moved-in pane becomes active — unzoom the destination
      }
      const srcUpdated = wasHidden
        ? { ...src, hidden: (src.hidden ?? []).filter((id) => id !== paneId) }
        : tabWithoutLayoutPane(src, paneId)

      let tabs = s.tabs.map((t) => (t.id === dest.id ? destUpdated : t))
      tabs =
        srcUpdated === null
          ? tabs.filter((t) => t.id !== src.id)
          : tabs.map((t) => (t.id === src.id ? srcUpdated : t))
      return { tabs, activeTabId: dest.id }
    }),

  movePaneToNewTab: (paneId) =>
    set((s) => {
      const src = s.tabs.find((t) => paneIdsIn(t.layout).includes(paneId) || t.hidden?.includes(paneId))
      if (!src) return s
      const wasHidden = src.hidden?.includes(paneId) ?? false
      const tabId = `tab${++tabCounter}-${Date.now().toString(36)}`
      const newTab: WorkspaceTab = {
        id: tabId,
        name: `Deck ${tabCounter}`,
        color: TAB_COLORS[(tabCounter - 1) % TAB_COLORS.length],
        layout: { type: 'pane', paneId },
        activePaneId: paneId,
        projectId: src.projectId
      }
      const srcUpdated = wasHidden
        ? { ...src, hidden: (src.hidden ?? []).filter((id) => id !== paneId) }
        : tabWithoutLayoutPane(src, paneId)

      const kept =
        srcUpdated === null
          ? s.tabs.filter((t) => t.id !== src.id)
          : s.tabs.map((t) => (t.id === src.id ? srcUpdated : t))
      return { tabs: [...kept, newTab], activeTabId: tabId }
    }),

  hidePane: (paneId) =>
    set((s) => {
      const tab = s.tabs.find((t) => paneIdsIn(t.layout).includes(paneId))
      if (!tab) return s
      if (paneIdsIn(tab.layout).length <= 1) {
        toast('info', "Can't hide the only pane", 'split, add, or move this pane first')
        return s
      }
      const newLayout = removePaneFromLayout(tab.layout, paneId)
      if (newLayout === null) return s // unreachable (length > 1), keeps types honest
      const remaining = paneIdsIn(newLayout)
      return {
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                layout: newLayout,
                hidden: [...(t.hidden ?? []), paneId],
                activePaneId: remaining.includes(t.activePaneId) ? t.activePaneId : remaining[0]
              }
            : t
        )
      }
    }),

  restorePane: (paneId) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.hidden?.includes(paneId))
      if (!tab) return s
      if (paneIdsIn(tab.layout).length >= MAX_PANES_PER_TAB) {
        toast('info', `Pane limit reached (${MAX_PANES_PER_TAB} per workspace)`)
        return s
      }
      return {
        activeTabId: tab.id,
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                hidden: (t.hidden ?? []).filter((id) => id !== paneId),
                layout: splitPaneInLayout(t.layout, t.activePaneId, 'row', paneId),
                activePaneId: paneId,
                zoomedPaneId: undefined // restoring focuses the restored pane — unzoom
              }
            : t
        )
      }
    }),

  hydrate: (state) => {
    // keep generated names from colliding with restored ones
    tabCounter += state.tabs.length
    paneCounter += Object.keys(state.panes).length
    set({
      tabs: state.tabs,
      panes: state.panes,
      activeTabId: state.activeTabId,
      spawnDefaults: state.spawnDefaults
    })
  }
}))

/** Geometry for a tab, memoization-friendly. */
export function tabGeometry(tab: WorkspaceTab): ReturnType<typeof layoutGeometry> {
  return layoutGeometry(tab.layout)
}
