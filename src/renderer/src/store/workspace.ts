import { create } from 'zustand'
import type { ShellKind } from '@shared/types'
import {
  buildGrid,
  layoutGeometry,
  paneIdsIn,
  removePaneFromLayout,
  splitPaneInLayout,
  swapPanesInLayout,
  updateRatio,
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
  /** Project this tab belongs to, when it was opened from a project. */
  projectId?: string
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
  renameTab: (tabId: string, name: string) => void

  /** Returns the new pane's id, or null when the pane limit blocks the split. */
  splitPane: (paneId: string, direction: Direction, spec: NewPaneSpec) => string | null
  /** Opens a new pane in the active tab (file-tree "open here"). Null if blocked. */
  openInActiveTab: (spec: NewPaneSpec) => string | null
  closePane: (paneId: string) => void
  setActivePane: (tabId: string, paneId: string) => void
  renamePane: (paneId: string, name: string) => void
  setSplitRatio: (tabId: string, splitId: string, ratio: number) => void
  setPaneBadge: (paneId: string, badge: PaneBadge | null) => void
  togglePin: (paneId: string) => void
  /** Swaps two panes' positions within their tab (sessions stay alive). */
  swapPanes: (paneIdA: string, paneIdB: string) => void
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
      const pinned = paneIdsIn(tab.layout).filter((id) => s.panes[id]?.pinned)
      if (pinned.length > 0) {
        toast('info', 'Tab has pinned panes', 'unpin them before closing the tab')
        return s
      }
      const panes = { ...s.panes }
      for (const id of paneIdsIn(tab.layout)) delete panes[id]
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

  renameTab: (tabId, name) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId && name.trim() !== '' ? { ...t, name: name.trim() } : t))
    })),

  splitPane: (paneId, direction, spec) => {
    const s = get()
    const tab = s.tabs.find((t) => paneIdsIn(t.layout).includes(paneId))
    if (!tab) return null
    const count = paneIdsIn(tab.layout).length
    if (count >= MAX_PANES_PER_TAB) {
      toast('info', `Pane limit reached (${MAX_PANES_PER_TAB} per workspace)`)
      return null
    }
    const pane = makePane(spec, count + 1, s.spawnDefaults)
    set((prev) => ({
      panes: { ...prev.panes, [pane.id]: pane },
      tabs: prev.tabs.map((t) =>
        t.id === tab.id
          ? { ...t, layout: splitPaneInLayout(t.layout, paneId, direction, pane.id), activePaneId: pane.id }
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
      const tab = s.tabs.find((t) => paneIdsIn(t.layout).includes(paneId))
      if (!tab) return s
      const newLayout = removePaneFromLayout(tab.layout, paneId)
      const panes = { ...s.panes }
      delete panes[paneId]

      if (newLayout === null) {
        // last pane in the tab → the tab goes too (closeTab handles ≥1 invariant)
        let tabs = s.tabs.filter((t) => t.id !== tab.id)
        let activeTabId = s.activeTabId
        if (tabs.length === 0) {
          const fresh = makeTab({ id: 'single', label: 'Single', rows: 1, cols: 1 }, panes, s.spawnDefaults)
          tabs = [fresh]
          activeTabId = fresh.id
        } else if (activeTabId === tab.id) {
          tabs.length > 0 && (activeTabId = tabs[0].id)
        }
        return { tabs, panes, activeTabId }
      }

      const remaining = paneIdsIn(newLayout)
      return {
        panes,
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                layout: newLayout,
                activePaneId: remaining.includes(t.activePaneId) ? t.activePaneId : remaining[0]
              }
            : t
        )
      }
    }),

  setActivePane: (tabId, paneId) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, activePaneId: paneId } : t))
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
