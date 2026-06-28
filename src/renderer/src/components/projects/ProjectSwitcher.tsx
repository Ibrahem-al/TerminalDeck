import { useEffect, useRef, useState } from 'react'
import { FolderGit2, PencilLine, Plus, Search, Trash2 } from 'lucide-react'
import type { Project } from '@shared/types'
import { sortedProjects, useProjects } from '../../store/projects'
import { relativeTime } from '../terminal/time'
import { ConfirmDialog } from '../common/ConfirmDialog'

interface Props {
  onClose: () => void
  onNewProject: () => void
  onEditProject: (project: Project) => void
}

export function ProjectSwitcher({ onClose, onNewProject, onEditProject }: Props): React.JSX.Element {
  const projects = useProjects((s) => s.projects)
  const activeProjectId = useProjects((s) => s.activeProjectId)
  const openProject = useProjects((s) => s.openProject)
  const deleteProject = useProjects((s) => s.deleteProject)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const list = sortedProjects(projects).filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  const open = (id: string): void => {
    void openProject(id)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={onClose}
      role="dialog"
      aria-label="Project switcher"
    >
      <div
        className="modal-enter w-[520px] overflow-hidden rounded-xl border border-edge bg-overlay shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-edge-2 px-3.5 py-2.5">
          <Search size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            placeholder="Switch project…"
            className="min-w-0 flex-1 bg-transparent font-ui text-[13.5px] text-ink outline-none placeholder:text-ink-3"
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelected((i) => Math.min(list.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelected((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter' && list[selected]) {
                e.preventDefault()
                open(list[selected].id)
              }
            }}
          />
          <button
            onClick={() => {
              onNewProject()
              onClose()
            }}
            className="flex shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-1 font-ui text-[11.5px] font-semibold text-ink-inverse"
          >
            <Plus size={11} aria-hidden="true" /> New
          </button>
        </div>

        <div className="max-h-[44vh] overflow-y-auto py-1">
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
              <FolderGit2 size={18} className="text-ink-3" aria-hidden="true" />
              <p className="font-ui text-[12.5px] text-ink-2">
                {projects.length === 0 ? 'No projects yet' : 'No matches'}
              </p>
              {projects.length === 0 && (
                <p className="font-ui text-[11.5px] text-ink-3">
                  A project remembers its folder, shell, layout, env vars, and startup commands.
                </p>
              )}
            </div>
          ) : (
            list.map((project, i) => (
              <div
                key={project.id}
                className={`group flex w-full items-center gap-2.5 px-3.5 py-2 ${
                  i === selected ? 'bg-raised' : ''
                }`}
                onMouseEnter={() => setSelected(i)}
              >
                <button
                  onClick={() => open(project.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <FolderGit2
                    size={15}
                    className="shrink-0"
                    style={{ color: project.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-ui text-[13px] font-medium text-ink">
                      {project.name}
                      {project.id === activeProjectId && (
                        <span className="ml-2 font-ui text-[10px] font-semibold tracking-wider text-accent uppercase">
                          open
                        </span>
                      )}
                    </span>
                    <span className="block truncate font-mono text-[10.5px] text-ink-3">
                      {project.rootDir}
                    </span>
                  </span>
                </button>
                <span className="shrink-0 font-ui text-[10.5px] text-ink-3">
                  {project.lastOpenedAt ? relativeTime(project.lastOpenedAt, Date.now()) : 'never opened'}
                </span>
                <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                  <button
                    aria-label={`Edit ${project.name}`}
                    onClick={() => {
                      onEditProject(project)
                      onClose()
                    }}
                    className="rounded p-1 text-ink-3 hover:text-ink"
                  >
                    <PencilLine size={12} />
                  </button>
                  <button
                    aria-label={`Delete ${project.name}`}
                    onClick={() => setConfirmDelete(project)}
                    className="rounded p-1 text-ink-3 hover:text-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        <p className="border-t border-edge-2 px-3.5 py-2 font-ui text-[10.5px] text-ink-3">
          Enter opens · Ctrl+Shift+N new project · deleting a project never touches its files
        </p>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete project "${confirmDelete.name}"?`}
          body="Only the project entry is removed — the folder and its files stay untouched."
          confirmLabel="Delete project"
          danger
          onConfirm={() => {
            void deleteProject(confirmDelete.id)
            setConfirmDelete(null)
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
