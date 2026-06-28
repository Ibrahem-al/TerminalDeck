import { create } from 'zustand'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'
import { useWorkspace } from './workspace'
import { useProjects } from './projects'

interface SettingsStore {
  settings: AppSettings
  loaded: boolean
  panelOpen: boolean

  load: () => Promise<void>
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  update: <K extends keyof AppSettings>(section: K, patch: Partial<AppSettings[K]>) => void
  /** Persist immediately, bypassing the debounce (used by the Save button). */
  flush: () => void
}

let persistTimer: ReturnType<typeof setTimeout> | undefined
function persist(settings: AppSettings): void {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void window.quarterdeck.settings.save(settings)
  }, 300)
}

/** When no project is open, the general default shell drives new panes. */
function syncSpawnDefaults(settings: AppSettings): void {
  if (useProjects.getState().activeProjectId !== null) return
  const current = useWorkspace.getState().spawnDefaults
  useWorkspace.getState().setSpawnDefaults({
    ...current,
    shell: settings.general.defaultShell,
    cwd: settings.general.defaultDirectory || undefined
  })
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  panelOpen: false,

  load: async () => {
    if (get().loaded) return
    const settings = await window.quarterdeck.settings.load()
    set({ settings, loaded: true })
    syncSpawnDefaults(settings)
    // theme store import is deferred to avoid a module cycle at eval time
    const { useTheme } = await import('./theme')
    useTheme.getState().init(settings.general.theme)
  },

  setPanelOpen: (panelOpen) => set({ panelOpen }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  update: (section, patch) => {
    const settings: AppSettings = {
      ...get().settings,
      [section]: { ...get().settings[section], ...patch }
    }
    set({ settings })
    persist(settings)
    if (section === 'general') syncSpawnDefaults(settings)
  },

  flush: () => {
    clearTimeout(persistTimer)
    void window.quarterdeck.settings.save(get().settings)
  }
}))
