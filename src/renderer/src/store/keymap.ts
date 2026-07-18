import { create } from 'zustand'

/**
 * Ephemeral UI state for the tmux-style keymap. Not persisted — it only carries
 * the transient "pane numbers are showing" flag from the key handler
 * (PaneShortcuts) to the pane layer that draws the badges (PaneLayer).
 */
interface KeymapUiStore {
  /** The pane-number picker overlay is up (tmux prefix q). */
  paneNumbers: boolean
  setPaneNumbers: (v: boolean) => void
}

export const useKeymapUi = create<KeymapUiStore>((set) => ({
  paneNumbers: false,
  setPaneNumbers: (paneNumbers) => set({ paneNumbers })
}))
