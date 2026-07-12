import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, FolderGit2 } from 'lucide-react'
import { TEMPLATES, type Template } from './layout'
import { useSettings } from '../../store/settings'
import { sortedProjects, useProjects } from '../../store/projects'
import { FloatingMenu } from '../common/FloatingMenu'

function TemplateThumb({ template }: { template: Template }): React.JSX.Element {
  const cells = Array.from({ length: template.rows * template.cols })
  return (
    <div
      className="grid h-16 w-24 gap-[3px]"
      style={{
        gridTemplateRows: `repeat(${template.rows}, 1fr)`,
        gridTemplateColumns: `repeat(${template.cols}, 1fr)`
      }}
      aria-hidden="true"
    >
      {cells.map((_, i) => (
        <div key={i} className="rounded-[3px] border border-edge bg-raised" />
      ))}
    </div>
  )
}

interface Props {
  /** Creates the tab. `projectId` is null for a plain scratch tab. */
  onPick: (template: Template, projectId: string | null) => void
  onClose: () => void
}

export function TemplatePicker({ onPick, onClose }: Props): React.JSX.Element {
  const defaultTemplate = useSettings((s) => s.settings.general.defaultTemplate)
  const defaultProjectId = useSettings((s) => s.settings.general.defaultProjectId)
  const projects = useProjects((s) => s.projects)

  // Resolve the pinned default project; a dangling id (deleted project) → scratch.
  const initialProjectId = useMemo(
    () => (defaultProjectId && projects.some((p) => p.id === defaultProjectId) ? defaultProjectId : null),
    [defaultProjectId, projects]
  )
  const [projectId, setProjectId] = useState<string | null>(initialProjectId)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const selectedProject = projects.find((p) => p.id === projectId) ?? null
  // A chosen project suggests its own default layout; otherwise the app default.
  const suggestedTemplate = selectedProject?.defaultTemplate ?? defaultTemplate

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // While the project dropdown is open, let its own Escape handler close it
      // first — both listeners share `window`, and this one is registered earlier,
      // so it must stand down or Escape would also dismiss the whole dialog.
      if (e.key === 'Escape' && !menu) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, menu])

  const options = sortedProjects(projects)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      // Only a direct backdrop click closes the dialog — clicks that bubble up
      // from the project dropdown's own overlay must not also dismiss the dialog.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-label="Choose workspace layout"
    >
      <div
        className="modal-enter rounded-xl border border-edge bg-overlay p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-6">
          <h2 className="font-ui text-[13px] font-semibold text-ink">New workspace</h2>

          {projects.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-ui text-[11px] text-ink-3">Project</span>
              <button
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setMenu({ x: r.left, y: r.bottom + 4 })
                }}
                className="app-no-drag flex min-w-[150px] items-center gap-1.5 rounded-md border border-edge-2 bg-raised px-2 py-1 font-ui text-[11.5px] text-ink-2 transition-colors duration-100 hover:border-edge hover:text-ink"
              >
                {selectedProject ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: selectedProject.color }}
                    aria-hidden="true"
                  />
                ) : (
                  <FolderGit2 size={12} className="shrink-0 text-ink-3" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate text-left">
                  {selectedProject ? selectedProject.name : 'No project'}
                </span>
                <ChevronDown size={12} className="shrink-0 text-ink-3" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              autoFocus={template.id === suggestedTemplate}
              onClick={() => onPick(template, projectId)}
              className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors duration-100 hover:border-accent/60 focus-visible:border-accent ${
                template.id === suggestedTemplate ? 'border-accent/40' : 'border-edge-2'
              }`}
            >
              <TemplateThumb template={template} />
              <span className="font-ui text-[11.5px] font-medium text-ink-2">{template.label}</span>
              <span className="font-ui text-[10px] text-ink-3">
                {template.rows * template.cols} pane{template.rows * template.cols > 1 ? 's' : ''}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-center font-ui text-[10.5px] text-ink-3">
          {selectedProject
            ? `Opens in ${selectedProject.name} — panes start in its folder, shell, and env.`
            : 'Panes start as PowerShell terminals — split any pane to add Git Bash, cmd, or Agent Chat.'}
        </p>
      </div>

      {menu && (
        <FloatingMenu anchor={menu} onClose={() => setMenu(null)} minWidth={200}>
          <div className="max-h-[46vh] overflow-y-auto py-0.5">
            <button
              role="menuitem"
              onClick={() => {
                setProjectId(null)
                setMenu(null)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-ui text-[12.5px] text-ink-2 transition-colors duration-75 hover:bg-raised hover:text-ink"
            >
              <FolderGit2 size={13} className="shrink-0 text-ink-3" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">No project</span>
              {projectId === null && <Check size={13} className="shrink-0 text-accent" aria-hidden="true" />}
            </button>
            {options.map((project) => (
              <button
                key={project.id}
                role="menuitem"
                onClick={() => {
                  setProjectId(project.id)
                  setMenu(null)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-ui text-[12.5px] text-ink-2 transition-colors duration-75 hover:bg-raised hover:text-ink"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.id === defaultProjectId && (
                  <span className="shrink-0 font-ui text-[9.5px] font-semibold tracking-wider text-ink-3 uppercase">
                    default
                  </span>
                )}
                {project.id === projectId && <Check size={13} className="shrink-0 text-accent" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </FloatingMenu>
      )}
    </div>
  )
}
