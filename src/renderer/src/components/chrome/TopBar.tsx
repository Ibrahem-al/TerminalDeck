import { useEffect, useState } from 'react'
import {
  ChevronDown,
  Copy,
  ListTodo,
  PanelLeftOpen,
  PanelRightOpen,
  Settings,
  Smartphone
} from 'lucide-react'
import { useProjects } from '../../store/projects'
import { useKanban } from '../../store/kanban'
import { useExplorer } from '../../store/explorer'
import { useSettings } from '../../store/settings'
import { WorkspaceTabs } from '../workspace/WorkspaceTabs'

function WindowControls(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => window.quarterdeck.window.onMaximizedChange(setMaximized), [])

  return (
    <div className="app-no-drag flex h-full shrink-0 items-stretch">
      <button
        aria-label="Minimize window"
        className="flex w-[46px] items-center justify-center text-ink-3 outline-none transition-colors duration-100 hover:bg-overlay hover:text-ink focus-visible:bg-overlay focus-visible:text-ink"
        onClick={() => window.quarterdeck.window.minimize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
        className="flex w-[46px] items-center justify-center text-ink-3 outline-none transition-colors duration-100 hover:bg-overlay hover:text-ink focus-visible:bg-overlay focus-visible:text-ink"
        onClick={() => window.quarterdeck.window.maximize()}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="2" y="0.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="0.5" y="2.5" width="7" height="7" fill="var(--bg-base)" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button
        aria-label="Close window"
        className="flex w-[46px] items-center justify-center text-ink-3 outline-none transition-colors duration-100 hover:bg-danger hover:text-white focus-visible:bg-danger focus-visible:text-white"
        onClick={() => window.quarterdeck.window.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  )
}

const toolBtn =
  'app-no-drag flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors duration-100 hover:bg-raised hover:text-ink'

export function TopBar({
  onNewTab,
  onOpenProjects,
  onOpenRemote,
  onNewWindow
}: {
  onNewTab: () => void
  onOpenProjects: () => void
  onOpenRemote: () => void
  onNewWindow: () => void
}): React.JSX.Element {
  const activeProjectId = useProjects((s) => s.activeProjectId)
  const projects = useProjects((s) => s.projects)
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const sidebarVisible = useExplorer((s) => s.visible)
  const sidebarSide = useSettings((s) => s.settings.general.sidebarSide)

  return (
    <header className="app-drag flex h-9 shrink-0 items-stretch border-b border-edge-2 bg-base">
      {!sidebarVisible && sidebarSide === 'left' && (
        <div className="app-no-drag flex shrink-0 items-center pl-1.5">
          <button
            aria-label="Show sidebar"
            title="Show sidebar (Ctrl+B)"
            onClick={() => useExplorer.getState().toggleSidebar()}
            className={toolBtn}
          >
            <PanelLeftOpen size={14} />
          </button>
        </div>
      )}
      <div className="flex shrink-0 items-center pr-0.5 pl-2">
        <button
          onClick={onOpenProjects}
          title={
            activeProject
              ? `${activeProject.name} — active project · switch (Ctrl+K)`
              : 'No project — open one (Ctrl+K)'
          }
          aria-label={activeProject ? `Active project: ${activeProject.name}. Switch project.` : 'Open a project'}
          className="app-no-drag group flex items-center gap-1.5 rounded-full border border-edge-2/60 py-[3px] pr-1.5 pl-2 transition-colors duration-100 hover:border-edge hover:bg-raised/50"
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeProject ? '' : 'bg-ink-3'}`}
            style={activeProject ? { backgroundColor: activeProject.color } : undefined}
            aria-hidden="true"
          />
          <span
            className={`max-w-[150px] truncate font-ui text-[11px] font-medium ${
              activeProject ? 'text-ink-2 group-hover:text-ink' : 'text-ink-3 group-hover:text-ink-2'
            }`}
          >
            {activeProject ? activeProject.name : 'No project'}
          </span>
          <ChevronDown
            size={10}
            className="shrink-0 text-ink-3 opacity-60 transition-opacity duration-100 group-hover:opacity-100"
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="mx-1.5 my-2.5 w-px shrink-0 self-stretch bg-edge-2/70" aria-hidden="true" />

      <div className="flex min-w-0 items-center">
        <WorkspaceTabs onNewTab={onNewTab} />
      </div>

      {/* draggable spacer keeps the window movable between tabs and tools */}
      <div className="h-full flex-1" />

      <div className="app-no-drag flex shrink-0 items-center gap-0.5 px-1">
        {!sidebarVisible && sidebarSide === 'right' && (
          <button
            aria-label="Show sidebar"
            title="Show sidebar (Ctrl+B)"
            onClick={() => useExplorer.getState().toggleSidebar()}
            className={toolBtn}
          >
            <PanelRightOpen size={14} />
          </button>
        )}
        <button
          aria-label="New window"
          title="New window (Ctrl+Shift+M)"
          onClick={onNewWindow}
          className={toolBtn}
        >
          <Copy size={14} />
        </button>
        <button
          aria-label="Connect a phone (RemoteDeck)"
          title="RemoteDeck — control from your phone"
          onClick={onOpenRemote}
          className={toolBtn}
        >
          <Smartphone size={14} />
        </button>
        <button
          aria-label="Open task board"
          title="Task board (Ctrl+Shift+K)"
          onClick={() => useKanban.getState().toggleOpen()}
          className={toolBtn}
        >
          <ListTodo size={14} />
        </button>
        <button
          aria-label="Open settings"
          title="Settings (Ctrl+,)"
          onClick={() => useSettings.getState().togglePanel()}
          className={toolBtn}
        >
          <Settings size={14} />
        </button>
      </div>

      <WindowControls />
    </header>
  )
}
