import { useEffect, useState } from 'react'
import { FolderOpen, Plus, Trash2, X } from 'lucide-react'
import type { AutoStartCommand, Project, ProjectEnvVar, ShellInfo, ShellKind } from '@shared/types'
import { useProjects, PROJECT_COLORS } from '../../store/projects'
import { useSettings } from '../../store/settings'
import { TEMPLATES } from '../workspace/layout'

interface Props {
  /** null = create new */
  project: Project | null
  onClose: () => void
}

const inputCls =
  'w-full rounded-md border border-edge bg-term px-2.5 py-1.5 font-ui text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus-visible:border-accent'
const labelCls = 'mb-1 block font-ui text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase'

export function ProjectForm({ project, onClose }: Props): React.JSX.Element {
  const saveProject = useProjects((s) => s.saveProject)

  const [shells, setShells] = useState<ShellInfo[]>([])
  const [name, setName] = useState(project?.name ?? '')
  const [color, setColor] = useState(
    project?.color ?? PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)]
  )
  const [rootDir, setRootDir] = useState(project?.rootDir ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [shell, setShell] = useState<ShellKind>(project?.defaultShell ?? 'powershell')
  const [template, setTemplate] = useState(project?.defaultTemplate ?? 'single')
  const [env, setEnv] = useState<ProjectEnvVar[]>(project?.env ?? [])
  const [autoStart, setAutoStart] = useState<AutoStartCommand[]>(project?.autoStart ?? [])

  useEffect(() => {
    void window.quarterdeck.pty.listShells().then(setShells)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const valid = name.trim() !== '' && rootDir.trim() !== ''

  const save = async (): Promise<void> => {
    if (!valid) return
    const result: Project = {
      id: project?.id ?? crypto.randomUUID(),
      name: name.trim(),
      color,
      rootDir: rootDir.trim(),
      description: description.trim(),
      defaultShell: shell,
      defaultTemplate: template,
      env: env.filter((v) => v.key.trim() !== ''),
      autoStart: autoStart.filter((c) => c.command.trim() !== ''),
      createdAt: project?.createdAt ?? Date.now(),
      lastOpenedAt: project?.lastOpenedAt ?? null
    }
    await saveProject(result)
    onClose()
  }

  const browse = async (): Promise<void> => {
    const def = useSettings.getState().settings.general.defaultDirectory
    const dir = await window.quarterdeck.fs.pickRoot(def || undefined)
    if (dir) {
      setRootDir(dir)
      if (name.trim() === '') {
        const i = Math.max(dir.lastIndexOf('\\'), dir.lastIndexOf('/'))
        setName(i >= 0 ? dir.slice(i + 1) : dir)
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-label={project ? 'Edit project' : 'New project'}
    >
      <div
        className="modal-enter flex max-h-[84vh] w-[560px] flex-col overflow-hidden rounded-xl border border-edge bg-overlay shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-edge-2 px-5 py-3">
          <h2 className="font-ui text-[14px] font-semibold text-ink">
            {project ? `Edit ${project.name}` : 'New project'}
          </h2>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-3 hover:text-ink">
            <X size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-name" className={labelCls}>
                Name *
              </label>
              <input
                id="pf-name"
                value={name}
                className={inputCls}
                placeholder="my-app"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="pf-shell" className={labelCls}>
                Default shell
              </label>
              <select
                id="pf-shell"
                value={shell}
                className={inputCls}
                onChange={(e) => setShell(e.target.value as ShellKind)}
              >
                {shells.map((s) => (
                  <option key={s.kind} value={s.kind}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className={labelCls}>Color</span>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use color ${c}`}
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded-full transition-transform duration-100 hover:scale-110"
                  style={{
                    backgroundColor: c,
                    boxShadow: color === c ? `0 0 0 2px var(--bg-overlay), 0 0 0 4px ${c}` : undefined
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="pf-root" className={labelCls}>
              Root directory *
            </label>
            <div className="flex gap-2">
              <input
                id="pf-root"
                value={rootDir}
                className={`${inputCls} font-mono text-[11.5px]`}
                placeholder="C:\dev\my-app"
                onChange={(e) => setRootDir(e.target.value)}
              />
              <button
                onClick={() => void browse()}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-edge px-2.5 font-ui text-[12px] font-medium text-ink-2 hover:border-accent hover:text-ink"
              >
                <FolderOpen size={12} aria-hidden="true" /> Browse
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pf-desc" className={labelCls}>
                Description
              </label>
              <input
                id="pf-desc"
                value={description}
                className={inputCls}
                placeholder="optional"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="pf-template" className={labelCls}>
                Workspace template
              </label>
              <select
                id="pf-template"
                value={template}
                className={inputCls}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} · {t.rows * t.cols} pane{t.rows * t.cols > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className={labelCls}>Environment variables</span>
            <div className="space-y-1.5">
              {env.map((v, i) => (
                <div key={i} className="flex gap-1.5">
                  <input
                    value={v.key}
                    placeholder="KEY"
                    aria-label={`Variable ${i + 1} name`}
                    className={`${inputCls} w-40 font-mono text-[11.5px]`}
                    onChange={(e) =>
                      setEnv(env.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                    }
                  />
                  <input
                    value={v.value}
                    placeholder="value (encrypted at rest)"
                    aria-label={`Variable ${i + 1} value`}
                    className={`${inputCls} flex-1 font-mono text-[11.5px]`}
                    onChange={(e) =>
                      setEnv(env.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                    }
                  />
                  <button
                    aria-label="Remove variable"
                    onClick={() => setEnv(env.filter((_, j) => j !== i))}
                    className="shrink-0 rounded p-1.5 text-ink-3 hover:text-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setEnv([...env, { key: '', value: '' }])}
                className="flex items-center gap-1 font-ui text-[11.5px] font-medium text-accent hover:underline"
              >
                <Plus size={11} aria-hidden="true" /> Add variable
              </button>
            </div>
          </div>

          <div>
            <span className={labelCls}>Auto-start commands</span>
            <p className="mb-1.5 font-ui text-[11px] text-ink-3">
              Run automatically when the project opens, in order, into the numbered pane.
            </p>
            <div className="space-y-1.5">
              {autoStart.map((c, i) => (
                <div key={c.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    aria-label={`Command ${i + 1} enabled`}
                    className="shrink-0 accent-(--accent)"
                    onChange={(e) =>
                      setAutoStart(autoStart.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))
                    }
                  />
                  <input
                    value={c.label}
                    placeholder="Label"
                    aria-label={`Command ${i + 1} label`}
                    className={`${inputCls} w-28`}
                    onChange={(e) =>
                      setAutoStart(autoStart.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <input
                    value={c.command}
                    placeholder="npm run dev"
                    aria-label={`Command ${i + 1}`}
                    className={`${inputCls} flex-1 font-mono text-[11.5px]`}
                    onChange={(e) =>
                      setAutoStart(autoStart.map((x, j) => (j === i ? { ...x, command: e.target.value } : x)))
                    }
                  />
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={c.paneIndex}
                    title="Target pane number"
                    aria-label={`Command ${i + 1} target pane`}
                    className={`${inputCls} w-14 text-center`}
                    onChange={(e) =>
                      setAutoStart(
                        autoStart.map((x, j) =>
                          j === i ? { ...x, paneIndex: Math.max(1, Math.min(16, Number(e.target.value) || 1)) } : x
                        )
                      )
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={c.delayMs}
                    title="Delay before running (ms)"
                    aria-label={`Command ${i + 1} delay in milliseconds`}
                    className={`${inputCls} w-20 text-center`}
                    onChange={(e) =>
                      setAutoStart(
                        autoStart.map((x, j) => (j === i ? { ...x, delayMs: Math.max(0, Number(e.target.value) || 0) } : x))
                      )
                    }
                  />
                  <button
                    aria-label="Remove command"
                    onClick={() => setAutoStart(autoStart.filter((_, j) => j !== i))}
                    className="shrink-0 rounded p-1.5 text-ink-3 hover:text-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setAutoStart([
                    ...autoStart,
                    {
                      id: crypto.randomUUID(),
                      label: '',
                      command: '',
                      paneIndex: Math.min(16, autoStart.length + 1),
                      delayMs: 0,
                      enabled: true
                    }
                  ])
                }
                className="flex items-center gap-1 font-ui text-[11.5px] font-medium text-accent hover:underline"
              >
                <Plus size={11} aria-hidden="true" /> Add command
              </button>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-edge-2 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-edge px-3 py-1.5 font-ui text-[12px] font-medium text-ink-2 hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!valid}
            className="rounded-md bg-accent px-3 py-1.5 font-ui text-[12px] font-semibold text-ink-inverse disabled:opacity-30"
          >
            {project ? 'Save changes' : 'Create project'}
          </button>
        </footer>
      </div>
    </div>
  )
}
