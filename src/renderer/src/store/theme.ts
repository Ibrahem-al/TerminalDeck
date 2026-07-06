import { create } from 'zustand'
import { cssTokens, themeById } from '../styles/themes'
import { useSettings } from './settings'

interface ThemeStore {
  activeId: string
  previewId: string | null
  /** Bumped on every applied change — terminals and Monaco re-read tokens. */
  version: number

  /** Apply on startup, without persisting. */
  init: (id: string) => void
  /** Commit a theme: apply with fade and persist. */
  setActive: (id: string) => void
  /** Hover preview (null reverts to the active theme). */
  preview: (id: string | null) => void
}

function applyTokens(id: string): void {
  const tokens = cssTokens(themeById(id))
  const root = document.documentElement
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value)
  }
}

/** How long the cross-fade transition stays armed. Must exceed the CSS
 *  transition duration in global.css so the last change fully settles. */
const FADE_MS = 300

let fadeTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Apply a theme with a brief cross-fade so large swings (especially dark↔light)
 * ease in instead of snapping. Used by both hover-preview and commit; rapid
 * hovers keep resetting the timer, so the transition stays smooth as the pointer
 * sweeps across swatches and only disarms once things settle.
 */
function applyTokensWithFade(id: string): void {
  const root = document.documentElement
  root.setAttribute('data-theme-fade', '')
  clearTimeout(fadeTimer)
  fadeTimer = setTimeout(() => root.removeAttribute('data-theme-fade'), FADE_MS)
  applyTokens(id)
}

export const useTheme = create<ThemeStore>((set, get) => ({
  activeId: 'deepwater',
  previewId: null,
  version: 0,

  init: (id) => {
    applyTokens(id)
    set((s) => ({ activeId: id, version: s.version + 1 }))
  },

  setActive: (id) => {
    applyTokensWithFade(id)
    set((s) => ({ activeId: id, previewId: null, version: s.version + 1 }))
    useSettings.getState().update('general', { theme: id })
  },

  preview: (id) => {
    const target = id ?? get().activeId
    applyTokensWithFade(target)
    set((s) => ({ previewId: id, version: s.version + 1 }))
  }
}))
