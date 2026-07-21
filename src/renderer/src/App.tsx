import { useEffect, useState } from 'react'
import { TopBar } from './components/chrome/TopBar'
import { Toaster } from './components/toast/Toaster'
import { PaneLayer } from './components/workspace/PaneLayer'
import { PaneShortcuts } from './components/workspace/PaneShortcuts'
import { TemplatePicker } from './components/workspace/TemplatePicker'
import { Sidebar } from './components/sidebar/Sidebar'
import { QuickOpen } from './components/editor/QuickOpen'
import { ProjectSwitcher } from './components/projects/ProjectSwitcher'
import { ProjectForm } from './components/projects/ProjectForm'
import { RemotePanel } from './components/remote/RemotePanel'
import { KanbanBoard } from './components/kanban/KanbanBoard'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { useWorkspace } from './store/workspace'
import { useExplorer } from './store/explorer'
import { useProjects } from './store/projects'
import { useKanban } from './store/kanban'
import { useSettings } from './store/settings'
import { usePaneCwd } from './store/paneCwd'
import { usePtySessions } from './store/ptySessions'
import { useEditorStore } from './store/editor'
import { useUpdater } from './store/updater'
import { initSessionAutoSave, persistSessionNow, restoreSession } from './session'
import { CloseConfirm } from './components/common/CloseConfirm'
import { sendToPane } from './components/terminal/inputBus'
import { paneIdsIn } from './components/workspace/layout'
import type { Project } from '@shared/types'

export default function App(): React.JSX.Element {
  const kanbanOpen = useKanban((s) => s.open)
  const settingsOpen = useSettings((s) => s.panelOpen)
  const sidebarSide = useSettings((s) => s.settings.general.sidebarSide)
  const [booted, setBooted] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [projectForm, setProjectForm] = useState<{ project: Project | null } | null>(null)
  const [closePrompt, setClosePrompt] = useState<{ terminals: number; agents: number; dirtyFiles: number } | null>(null)

  // boot: settings → projects → optional session restore → auto-save on
  useEffect(() => {
    void (async () => {
      await useSettings.getState().load()
      await useProjects.getState().load()

      let restored = false
      // Only the primary window restores the saved session; extra windows open
      // as fresh scratch workspaces so they can't duplicate or clobber it.
      if (
        useSettings.getState().settings.general.startup === 'restore' &&
        window.quarterdeck.window.isPrimary
      ) {
        const saved = await window.quarterdeck.session.load()
        restored = await restoreSession(saved)
      }
      setBooted(true)
      // Only the session-owning window autosaves; a promoted survivor starts
      // later via onBecomePrimary.
      if (window.quarterdeck.window.isPrimary) initSessionAutoSave()

      if (!restored) {
        // Prefer the pinned default project on a cold start; fall back to the
        // switcher when projects exist but none is pinned.
        const defaultId = useSettings.getState().settings.general.defaultProjectId
        const projects = useProjects.getState().projects
        if (defaultId && projects.some((p) => p.id === defaultId)) {
          void useProjects.getState().openProject(defaultId)
        } else if (projects.length > 0) {
          setSwitcherOpen(true)
        }
      }
    })()
  }, [])

  // Confirm before this window closes if it still has live terminals/agents or
  // unsaved edits (any close path lands here via the main process). Empty windows
  // — or when the setting is off — close straight through.
  useEffect(() => {
    return window.quarterdeck.window.onCloseRequest(() => {
      const panes = Object.values(useWorkspace.getState().panes)
      const terminals = panes.filter((p) => p.kind === 'terminal').length
      const agents = panes.filter((p) => p.kind === 'agent').length
      const dirtyFiles = Object.values(useEditorStore.getState().dirty).filter(Boolean).length
      const confirmOnClose = useSettings.getState().settings.general.confirmOnClose
      if (!confirmOnClose || (terminals === 0 && agents === 0 && dirtyFiles === 0)) {
        window.quarterdeck.window.confirmClose()
        return
      }
      setClosePrompt({ terminals, agents, dirtyFiles })
    })
  }, [])

  // If the primary (session-owning) window closes, main promotes this window;
  // take over persistence and capture the current workspace right away.
  useEffect(() => {
    return window.quarterdeck.window.onBecomePrimary(() => {
      initSessionAutoSave()
      persistSessionNow()
    })
  }, [])

  // Wire the in-app updater once (subscribes to update events, silent launch check).
  useEffect(() => {
    useUpdater.getState().init()
  }, [])

  // Notch "Open ↗": main focused this window and asks for a specific pane —
  // restore it if hidden, activate its tab, then focus it.
  useEffect(() => {
    return window.quarterdeck.sessions.onFocusPane((paneId) => {
      const ws = useWorkspace.getState()
      if (!ws.panes[paneId]) return
      if (ws.tabs.some((t) => t.hidden?.includes(paneId))) ws.restorePane(paneId)
      const fresh = useWorkspace.getState()
      const tab = fresh.tabs.find((t) => paneIdsIn(t.layout).includes(paneId))
      if (!tab) return
      fresh.setActiveTab(tab.id)
      fresh.setActivePane(tab.id, paneId)
    })
  }, [])

  // each tab behaves like its own project: keep the active project in step with
  // the active tab. Armed only after boot so session restore doesn't clobber the
  // restored sidebar root.
  useEffect(() => {
    if (!booted) return
    let prevTabId = useWorkspace.getState().activeTabId
    return useWorkspace.subscribe((s) => {
      if (s.activeTabId !== prevTabId) {
        prevTabId = s.activeTabId
        useProjects.getState().syncTabContext(s.activeTabId)
      }
    })
  }, [booted])

  // Session sync with the phone (RemoteDeck): report the desktop's open
  // terminal sessions to the Agent, and open a new pane when the phone asks.
  useEffect(() => {
    if (!booted) return
    const report = (): void => {
      const ptySessions = usePtySessions.getState().byPane
      const panes = useWorkspace.getState().panes
      const cwds = usePaneCwd.getState().byPane
      const list = Object.entries(ptySessions).flatMap(([paneId, info]) => {
        const pane = panes[paneId]
        if (!pane) return []
        return [
          {
            id: info.sessionId,
            title: pane.name,
            cwd: cwds[paneId] ?? pane.cwd ?? '',
            shell: pane.shell ?? 'powershell',
            busy: false,
            alive: true,
            createdAt: info.createdAt,
            paneId
          }
        ]
      })
      window.quarterdeck.sessions.report(list)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (): void => {
      clearTimeout(timer)
      timer = setTimeout(report, 250)
    }
    report()
    const unsubs = [
      usePtySessions.subscribe(schedule),
      useWorkspace.subscribe(schedule),
      usePaneCwd.subscribe(schedule)
    ]
    const offOpenPane = window.quarterdeck.sessions.onOpenPane((opts) => {
      useWorkspace.getState().openInActiveTab({ kind: 'terminal', cwd: opts.cwd, autoRun: opts.command })
    })
    return () => {
      clearTimeout(timer)
      unsubs.forEach((u) => u())
      offOpenPane()
    }
  }, [booted])

  // workspace + sidebar shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.altKey) return
      const ws = useWorkspace.getState()
      const ex = useExplorer.getState()
      const key = e.key.toLowerCase()

      const handle = (fn: () => void): void => {
        e.preventDefault()
        e.stopPropagation()
        fn()
      }

      if (key === 't' && !e.shiftKey) handle(() => setPickerOpen(true))
      else if (key === 'p' && !e.shiftKey) handle(() => setQuickOpen(true))
      else if (key === 'k' && !e.shiftKey) handle(() => setSwitcherOpen(true))
      else if (key === 'n' && e.shiftKey) handle(() => setProjectForm({ project: null }))
      else if (e.key === ',' && !e.shiftKey) handle(() => useSettings.getState().togglePanel())
      else if (key === 'w' && !e.shiftKey) handle(() => ws.closeTab(ws.activeTabId))
      else if (key === 'b' && !e.shiftKey) handle(() => ex.toggleSidebar())
      else if (key === 'd') {
        handle(() => {
          const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
          if (tab) ws.splitPane(tab.activePaneId, e.shiftKey ? 'column' : 'row', { kind: 'terminal' })
        })
      } else if (e.shiftKey && (e.key === '.' || e.key === '>')) {
        handle(() => ex.toggleHidden())
      } else if (e.shiftKey && key === 'k') {
        handle(() => useKanban.getState().toggleOpen())
      } else if (e.shiftKey && key === 'm') {
        handle(() => window.quarterdeck.window.newWindow())
      } else if (e.shiftKey && key === 'f') {
        handle(() => {
          if (!ex.visible) ex.toggleSidebar()
          requestAnimationFrame(() => document.getElementById('qd-sidebar-search')?.focus())
        })
      } else if (e.shiftKey && key === 'e') {
        // spec: focus the file browser itself (search has its own shortcut)
        handle(() => {
          if (!ex.visible) ex.toggleSidebar()
          requestAnimationFrame(() => document.getElementById('qd-sidebar-tree')?.focus())
        })
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const tab = ws.tabs.find((t) => t.id === ws.activeTabId)
        const pane = tab ? ws.panes[tab.activePaneId] : undefined
        if (pane?.kind === 'terminal') {
          handle(() => sendToPane(pane.id, 'claude\r'))
        }
      } else if (!e.shiftKey && key >= '1' && key <= '9') {
        const idx = Number(key) - 1
        if (idx < ws.tabs.length) handle(() => ws.setActiveTab(ws.tabs[idx].id))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-base text-ink">
      <TopBar
        onNewTab={() => setPickerOpen(true)}
        onOpenProjects={() => setSwitcherOpen(true)}
        onOpenRemote={() => setRemoteOpen(true)}
        onNewWindow={() => window.quarterdeck.window.newWindow()}
      />
      <div className="flex min-h-0 flex-1">
        {sidebarSide === 'left' && <Sidebar />}
        <main className="relative min-h-0 min-w-0 flex-1">
          {booted && <PaneLayer />}
          {kanbanOpen && <KanbanBoard />}
          {settingsOpen && (
            <SettingsPanel
              onEditProject={(project) => setProjectForm({ project })}
              onNewProject={() => setProjectForm({ project: null })}
            />
          )}
        </main>
        {sidebarSide === 'right' && <Sidebar />}
      </div>
      <Toaster />
      <PaneShortcuts />
      {pickerOpen && (
        <TemplatePicker
          onPick={(template, projectId) => {
            if (projectId) void useProjects.getState().openProject(projectId, template)
            else useWorkspace.getState().addTab(template)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {quickOpen && <QuickOpen onClose={() => setQuickOpen(false)} />}
      {switcherOpen && (
        <ProjectSwitcher
          onClose={() => setSwitcherOpen(false)}
          onNewProject={() => setProjectForm({ project: null })}
          onEditProject={(project) => setProjectForm({ project })}
        />
      )}
      {remoteOpen && <RemotePanel onClose={() => setRemoteOpen(false)} />}
      {projectForm && (
        <ProjectForm project={projectForm.project} onClose={() => setProjectForm(null)} />
      )}
      {closePrompt && (
        <CloseConfirm
          terminals={closePrompt.terminals}
          agents={closePrompt.agents}
          dirtyFiles={closePrompt.dirtyFiles}
          onCancel={() => setClosePrompt(null)}
        />
      )}
    </div>
  )
}
