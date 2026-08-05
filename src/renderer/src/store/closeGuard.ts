import { create } from 'zustand'
import { paneIdsIn } from '../components/workspace/layout'
import { useSettings } from './settings'
import { useWorkspace, type PaneMeta, type WorkspaceTab } from './workspace'

/** What a confirmed close would actually destroy, for the prompt's wording. */
export interface CloseTally {
  terminals: number
  agents: number
  editors: number
}

export interface PendingClose extends CloseTally {
  kind: 'tab' | 'pane'
  /** Tab id or pane id, depending on `kind`. */
  id: string
  /** Deck name or pane name — shown in the prompt. */
  name: string
  /** Pane closes only: it's the deck's last pane, so the deck goes too. */
  closesTab: boolean
}

interface CloseGuardStore {
  /** The close waiting on the user, or null when nothing is pending. */
  pending: PendingClose | null
  /** Closes a deck, prompting first when the setting asks for it. */
  requestCloseTab: (tabId: string) => void
  /** Closes a pane, prompting first when the setting asks for it. */
  requestClosePane: (paneId: string) => void
  /** Carries out the pending close. `dontAskAgain` turns its setting off first. */
  confirm: (dontAskAgain?: boolean) => void
  cancel: () => void
}

/** Every pane a deck owns, laid-out and hidden alike. */
function tabPaneIds(tab: WorkspaceTab): string[] {
  return [...paneIdsIn(tab.layout), ...(tab.hidden ?? [])]
}

function tally(panes: Record<string, PaneMeta>, ids: string[]): CloseTally {
  const t: CloseTally = { terminals: 0, agents: 0, editors: 0 }
  for (const id of ids) {
    const kind = panes[id]?.kind
    if (kind === 'terminal') t.terminals++
    else if (kind === 'agent') t.agents++
    else if (kind === 'editor') t.editors++
  }
  return t
}

/**
 * Confirmation in front of the destructive workspace closes. Every close path
 * (tab strip ✕, tab context menu, pane header ✕, hidden-pane list, Ctrl+W, the
 * tmux `x` / `&` commands) goes through here rather than calling the workspace
 * store directly, so one setting governs all of them.
 *
 * Pinned panes are left to the workspace store: it refuses the close and toasts
 * "unpin first", which is a better answer than a prompt that leads nowhere.
 */
export const useCloseGuard = create<CloseGuardStore>((set, get) => ({
  pending: null,

  requestCloseTab: (tabId) => {
    const ws = useWorkspace.getState()
    const tab = ws.tabs.find((t) => t.id === tabId)
    if (!tab) return
    const ids = tabPaneIds(tab)
    const pinned = ids.some((id) => ws.panes[id]?.pinned)
    if (pinned || !useSettings.getState().settings.general.confirmOnCloseTab) {
      ws.closeTab(tabId)
      return
    }
    set({ pending: { kind: 'tab', id: tabId, name: tab.name, closesTab: false, ...tally(ws.panes, ids) } })
  },

  requestClosePane: (paneId) => {
    const ws = useWorkspace.getState()
    const pane = ws.panes[paneId]
    if (!pane) return
    const tab = ws.tabs.find((t) => paneIdsIn(t.layout).includes(paneId))
    // Closing a deck's last visible pane closes the deck (unless hidden panes
    // get promoted in its place) — so the deck setting arms the prompt too.
    const closesTab =
      !!tab && paneIdsIn(tab.layout).length === 1 && (tab.hidden?.length ?? 0) === 0
    const general = useSettings.getState().settings.general
    const ask = general.confirmOnClosePane || (closesTab && general.confirmOnCloseTab)
    if (pane.pinned || !ask) {
      ws.closePane(paneId)
      return
    }
    set({ pending: { kind: 'pane', id: paneId, name: pane.name, closesTab, ...tally(ws.panes, [paneId]) } })
  },

  confirm: (dontAskAgain) => {
    const pending = get().pending
    set({ pending: null })
    if (!pending) return
    if (dontAskAgain) {
      const settings = useSettings.getState()
      // A last-pane close is armed by whichever setting asked for it; turning
      // "don't ask again" on there must silence both, or the next one prompts.
      if (pending.kind === 'tab' || pending.closesTab) settings.update('general', { confirmOnCloseTab: false })
      if (pending.kind === 'pane') settings.update('general', { confirmOnClosePane: false })
      settings.flush()
    }
    const ws = useWorkspace.getState()
    if (pending.kind === 'tab') ws.closeTab(pending.id)
    else ws.closePane(pending.id)
  },

  cancel: () => set({ pending: null })
}))

/** Convenience wrappers so components don't have to reach into the store. */
export const requestCloseTab = (tabId: string): void => useCloseGuard.getState().requestCloseTab(tabId)
export const requestClosePane = (paneId: string): void => useCloseGuard.getState().requestClosePane(paneId)
