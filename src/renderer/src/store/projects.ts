import { create } from 'zustand'
import type { Project } from '@shared/types'
import { useWorkspace } from './workspace'
import { useExplorer } from './explorer'
import { TEMPLATES, paneIdsIn } from '../components/workspace/layout'
import { sendToPane } from '../components/terminal/inputBus'
import { toast } from './toasts'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function runAutoStart(project: Project): Promise<void> {
  const commands = project.autoStart.filter((c) => c.enabled && c.command.trim() !== '')
  if (commands.length === 0) return

  const ws = useWorkspace.getState()
  const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
  if (!tab) return
  const paneIds = paneIdsIn(tab.layout)

  let warnedFallback = false
  for (const cmd of commands) {
    if (cmd.delayMs > 0) await sleep(cmd.delayMs)

    let idx = cmd.paneIndex - 1
    if (idx < 0 || idx >= paneIds.length) {
      idx = paneIds.length - 1
      if (!warnedFallback) {
        toast('info', `Pane ${cmd.paneIndex} doesn't exist in this layout`, 'used the last pane instead')
        warnedFallback = true
      }
    }
    const paneId = paneIds[idx]
    if (cmd.label.trim() !== '') {
      useWorkspace.getState().renamePane(paneId, cmd.label.trim())
    }
    sendToPane(paneId, cmd.command + '\r')
  }

  toast(
    'success',
    'Auto-start complete',
    `${commands.length} command${commands.length > 1 ? 's' : ''} · ${project.name}`
  )
}

export const PROJECT_COLORS = [
  '#d8a956',
  '#5b9dd9',
  '#4cc38a',
  '#ed5d5d',
  '#b583d9',
  '#4fb8c9',
  '#e8b130',
  '#9aa4b8'
]

interface ProjectsStore {
  projects: Project[]
  activeProjectId: string | null
  loaded: boolean

  load: () => Promise<void>
  saveProject: (project: Project) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  openProject: (id: string) => Promise<void>
  /**
   * Re-applies the right project context for a tab when it becomes active, so
   * each tab behaves like "its" project — the top-bar indicator, new-pane spawn
   * directory/env, and sidebar root all follow the active tab.
   */
  syncTabContext: (tabId: string) => void
}

function envRecord(project: Project): Record<string, string> | undefined {
  const pairs = project.env.filter((v) => v.key.trim() !== '')
  if (pairs.length === 0) return undefined
  return Object.fromEntries(pairs.map((v) => [v.key, v.value]))
}

/**
 * Points new-pane spawn defaults and the sidebar at a project. Does NOT create
 * a tab or run auto-start — just the ambient context shared by a project's tab.
 */
async function applyProjectContext(project: Project): Promise<void> {
  useWorkspace.getState().setSpawnDefaults({
    cwd: project.rootDir,
    env: envRecord(project),
    shell: project.defaultShell
  })
  if (useExplorer.getState().root !== project.rootDir) {
    await useExplorer.getState().openRoot(project.rootDir)
  }
}

export const useProjects = create<ProjectsStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  loaded: false,

  load: async () => {
    const projects = await window.quarterdeck.projects.list()
    set({ projects, loaded: true })
  },

  saveProject: async (project) => {
    await window.quarterdeck.projects.save(project)
    set((s) => {
      const idx = s.projects.findIndex((p) => p.id === project.id)
      const projects = [...s.projects]
      if (idx >= 0) projects[idx] = project
      else projects.push(project)
      return { projects }
    })
    toast('success', 'Project saved', project.name)
  },

  deleteProject: async (id) => {
    await window.quarterdeck.projects.delete(id)
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId
    }))
  },

  openProject: async (id) => {
    const project = get().projects.find((p) => p.id === id)
    if (!project) return

    const template = TEMPLATES.find((t) => t.id === project.defaultTemplate) ?? TEMPLATES[0]

    // ambient context first, so the new tab's panes inherit it
    await applyProjectContext(project)
    set({ activeProjectId: id })

    // a fresh tab bound to this project, in its default layout and color
    useWorkspace.getState().addTab(template, project.name, { projectId: project.id, color: project.color })

    // fire-and-forget: commands queue per pane and run as shells come up
    void runAutoStart(project)

    const touched: Project = { ...project, lastOpenedAt: Date.now() }
    await window.quarterdeck.projects.save(touched)
    set((s) => ({
      activeProjectId: id,
      projects: s.projects.map((p) => (p.id === id ? touched : p))
    }))
  },

  syncTabContext: (tabId) => {
    const tab = useWorkspace.getState().tabs.find((t) => t.id === tabId)
    if (!tab) return
    const current = get().activeProjectId

    if (tab.projectId) {
      if (tab.projectId === current) return
      const project = get().projects.find((p) => p.id === tab.projectId)
      if (project) {
        void applyProjectContext(project)
        set({ activeProjectId: project.id })
      } else {
        set({ activeProjectId: null }) // project was deleted out from under the tab
      }
    } else if (current !== null) {
      // a plain (non-project) tab — reflect that nothing is open, but leave the
      // spawn dir/sidebar alone so a quick scratch tab doesn't yank context away
      set({ activeProjectId: null })
    }
  }
}))

/** Recent-first ordering for switcher and launch surfaces. */
export function sortedProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || a.name.localeCompare(b.name))
}
