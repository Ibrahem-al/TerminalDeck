/**
 * Lets the pane header's reload button reach the terminal inside the pane.
 * The header is drawn by PaneFrame, which knows nothing about the terminal
 * session living in its body, so each TerminalPane publishes its reload here
 * under its pane id (same shape as inputBus, minus the queue — a reload for a
 * pane that isn't mounted yet is meaningless, so it's simply dropped).
 */

type Reloader = () => void

const reloaders = new Map<string, Reloader>()

export function registerPaneReloader(paneId: string, reload: Reloader): void {
  reloaders.set(paneId, reload)
}

export function unregisterPaneReloader(paneId: string): void {
  reloaders.delete(paneId)
}

/** Re-fit and repaint that pane's terminal. No-op for panes without one. */
export function reloadPane(paneId: string): void {
  reloaders.get(paneId)?.()
}
