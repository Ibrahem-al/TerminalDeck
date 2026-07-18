import { useSettings } from '../../store/settings'
import { useKanban } from '../../store/kanban'

/**
 * Whether a pane may pull keyboard focus in when it becomes the active pane.
 * Returns false when:
 *  • a full-screen overlay (Settings / task board) is up — activating a pane
 *    behind it must not steal focus from the overlay; or
 *  • a real input, select, or floating menu OUTSIDE this pane currently holds
 *    focus (a header rename box, the badge editor, a slash-command menu) — so a
 *    pane that becomes active in the same tick as one of those opening never
 *    yanks the caret back out of it.
 *
 * Textareas are intentionally NOT treated as blockers: xterm's hidden textarea,
 * Monaco's input, and the agent composer are all textareas, and pane navigation
 * must be able to move focus between those. `container` is this pane's own root,
 * so focus already inside it never blocks (e.g. Monaco refocusing itself).
 */
export function canPullPaneFocus(container: HTMLElement | null): boolean {
  if (useSettings.getState().panelOpen || useKanban.getState().open) return false
  const active = document.activeElement as HTMLElement | null
  if (
    active &&
    active !== document.body &&
    !container?.contains(active) &&
    typeof active.closest === 'function' &&
    active.closest('input, select, [contenteditable="true"], [role="menu"]')
  ) {
    return false
  }
  return true
}
