import { Check, FolderGit2, Pencil, X } from 'lucide-react'
import { TAB_COLORS, useWorkspace } from '../../store/workspace'
import { sortedProjects, useProjects } from '../../store/projects'
import { useSettings } from '../../store/settings'
import { FloatingMenu } from '../common/FloatingMenu'

interface Props {
  tabId: string
  anchor: { x: number; y: number }
  onClose: () => void
  /** Kicks off the tab strip's inline rename editor. */
  onRename: () => void
}

const item =
  'flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-ui text-[12.5px] transition-colors duration-75 hover:bg-raised'
const section = 'px-3 pt-2 pb-1 font-ui text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase'

/**
 * Right-click menu for a workspace tab. Rebinding a tab's project only changes
 * where new panes spawn (and recolors the dot) — the live layout is untouched.
 * The color swatches set the dot directly. Reads live tab state so the swatch
 * ring and project check reflect changes without closing the menu.
 */
export function TabContextMenu({ tabId, anchor, onClose, onRename }: Props): React.JSX.Element | null {
  const tab = useWorkspace((s) => s.tabs.find((t) => t.id === tabId))
  const projects = useProjects((s) => s.projects)

  if (!tab) return null

  const changeProject = (projectId: string | null, color?: string): void => {
    const ws = useWorkspace.getState()
    ws.setTabProject(tabId, projectId, color)
    // For the active tab, re-point spawn dir / sidebar / active-project indicator
    // right away; inactive tabs pick this up when next activated.
    if (ws.activeTabId === tabId) {
      useProjects.getState().syncTabContext(tabId)
      if (projectId === null) {
        // Explicit unbind of the active tab: new panes should open in the app's
        // default folder/shell, not linger on the old project's cwd/env.
        const g = useSettings.getState().settings.general
        ws.setSpawnDefaults({ cwd: g.defaultDirectory || undefined, env: undefined, shell: g.defaultShell })
      }
    }
    onClose()
  }

  return (
    <FloatingMenu anchor={anchor} onClose={onClose} minWidth={210}>
      <button
        role="menuitem"
        onClick={() => {
          onRename()
          onClose()
        }}
        className={`${item} text-ink-2 hover:text-ink`}
      >
        <Pencil size={13} className="text-ink-3" aria-hidden="true" />
        Rename tab
      </button>
      <button
        role="menuitem"
        onClick={() => {
          useWorkspace.getState().closeTab(tabId)
          onClose()
        }}
        className={`${item} text-danger`}
      >
        <X size={13} className="text-danger" aria-hidden="true" />
        Close tab
      </button>

      <div className="mx-2 my-1 border-t border-edge-2" />
      <p className={section}>Project</p>
      <div className="max-h-[34vh] overflow-y-auto">
        <button role="menuitem" onClick={() => changeProject(null)} className={`${item} text-ink-2 hover:text-ink`}>
          <FolderGit2 size={13} className="shrink-0 text-ink-3" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">No project</span>
          {!tab.projectId && <Check size={13} className="shrink-0 text-accent" aria-hidden="true" />}
        </button>
        {sortedProjects(projects).map((project) => (
          <button
            key={project.id}
            role="menuitem"
            onClick={() => changeProject(project.id, project.color)}
            className={`${item} text-ink-2 hover:text-ink`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {project.id === tab.projectId && <Check size={13} className="shrink-0 text-accent" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div className="mx-2 my-1 border-t border-edge-2" />
      <p className={section}>Tab color</p>
      <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-0.5">
        {TAB_COLORS.map((color) => (
          <button
            key={color}
            aria-label={`Set tab color ${color}`}
            onClick={() => useWorkspace.getState().setTabColor(tabId, color)}
            className={`h-4 w-4 rounded-full transition-transform duration-100 hover:scale-110 ${
              tab.color === color ? 'ring-2 ring-ink ring-offset-1 ring-offset-overlay' : ''
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </FloatingMenu>
  )
}
