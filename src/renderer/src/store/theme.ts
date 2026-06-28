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

let fadeTimer: ReturnType<typeof setTimeout> | undefined

export const useTheme = create<ThemeStore>((set, get) => ({
  activeId: 'deepwater',
  previewId: null,
  version: 0,

  init: (id) => {
    applyTokens(id)
    set((s) => ({ activeId: id, version: s.version + 1 }))
  },

  setActive: (id) => {
    const root = document.documentElement
    root.setAttribute('data-theme-fade', '')
    clearTimeout(fadeTimer)
    fadeTimer = setTimeout(() => root.removeAttribute('data-theme-fade'), 260)

    applyTokens(id)
    set((s) => ({ activeId: id, previewId: null, version: s.version + 1 }))
    useSettings.getState().update('general', { theme: id })
  },

  preview: (id) => {
    const target = id ?? get().activeId
    applyTokens(target)
    set((s) => ({ previewId: id, version: s.version + 1 }))
  }
}))
