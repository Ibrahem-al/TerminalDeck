import { useEffect, useState } from 'react'
import {
  FolderGit2,
  Info,
  Keyboard,
  Palette,
  PencilLine,
  Settings,
  Settings2,
  SquareCode,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import { APP_NAME, INFINITE_SCROLLBACK, type Project, type ShellInfo } from '@shared/types'
import { useSettings } from '../../store/settings'
import { useProjects, sortedProjects } from '../../store/projects'
import { useTheme } from '../../store/theme'
import { THEMES } from '../../styles/themes'
import { TEMPLATES } from '../workspace/layout'
import { ConfirmDialog } from '../common/ConfirmDialog'

type SectionId = 'general' | 'editor' | 'terminal' | 'shortcuts' | 'themes' | 'projects' | 'about'

const SECTIONS: { id: SectionId; label: string; icon: typeof Settings2 }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'editor', label: 'Editor', icon: SquareCode },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'themes', label: 'Themes', icon: Palette },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'about', label: 'About', icon: Info }
]

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl+T', action: 'New workspace tab (template picker)' },
  { keys: 'Ctrl+W', action: 'Close current workspace tab' },
  { keys: 'Ctrl+1–9', action: 'Switch workspace tab by index' },
  { keys: 'Ctrl+D', action: 'Split active pane right' },
  { keys: 'Ctrl+Shift+D', action: 'Split active pane down' },
  { keys: 'Ctrl+P', action: 'Quick Open file search' },
  { keys: 'Ctrl+K', action: 'Project switcher' },
  { keys: 'Ctrl+Shift+N', action: 'New project' },
  { keys: 'Ctrl+F', action: 'Search terminal output / find in editor' },
  { keys: 'Ctrl+C', action: 'Copy selection in terminal (else interrupt)' },
  { keys: 'Ctrl+V', action: 'Paste into terminal' },
  { keys: 'Ctrl+Shift+C', action: 'Copy selection in terminal' },
  { keys: 'Ctrl+Shift+V', action: 'Paste into terminal' },
  { keys: 'Alt+Click', action: 'Move terminal cursor to the click' },
  { keys: 'Ctrl+H', action: 'Find & replace (editor)' },
  { keys: 'Ctrl+S', action: 'Save file' },
  { keys: 'Ctrl+B', action: 'Toggle sidebar' },
  { keys: 'Ctrl+Shift+F', action: 'Search files in sidebar' },
  { keys: 'Ctrl+Shift+E', action: 'Focus file browser' },
  { keys: 'Ctrl+Enter', action: 'Launch Claude Code in active pane' },
  { keys: 'Ctrl+Shift+.', action: 'Toggle hidden files' },
  { keys: 'Ctrl+Shift+K', action: 'Toggle task board' },
  { keys: 'Ctrl+,', action: 'Open settings' }
]

const fieldCls =
  'rounded-md border border-edge bg-term px-2.5 py-1.5 font-ui text-[12.5px] text-ink outline-none focus-visible:border-accent'

const SCROLLBACK_PRESETS = [1000, 5000, 10000, 25000, 50000, 100000]

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-edge-2 py-3 last:border-0">
      <div className="min-w-0">
        <p className="font-ui text-[12.5px] font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 font-ui text-[11px] text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors duration-150 ${checked ? 'bg-accent' : 'bg-edge'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-base transition-transform duration-150 ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function ThemesGrid(): React.JSX.Element {
  const activeId = useTheme((s) => s.activeId)
  const setActive = useTheme((s) => s.setActive)
  const preview = useTheme((s) => s.preview)

  useEffect(() => {
    return () => preview(null)
  }, [preview])

  return (
    <div>
      <div className="grid grid-cols-2 gap-3" onMouseLeave={() => preview(null)}>
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            onMouseEnter={() => preview(theme.id)}
            onFocus={() => preview(theme.id)}
            onClick={() => setActive(theme.id)}
            aria-pressed={theme.id === activeId}
            className={`overflow-hidden rounded-xl border text-left transition-colors duration-100 ${
              theme.id === activeId ? 'border-accent/60' : 'border-edge-2 hover:border-edge'
            }`}
          >
            <div className="flex h-20 flex-col justify-between p-3" style={{ backgroundColor: theme.bg[0] }}>
              <div className="flex gap-1.5">
                {[theme.accent, theme.ansi[4], theme.ansi[2], theme.ansi[1], theme.ansi[5]].map((c, i) => (
                  <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />
                ))}
              </div>
              <code className="truncate font-mono text-[10.5px]" style={{ color: theme.term.ink }}>
                <span style={{ color: theme.accent }}>❯</span> {theme.tagline.toLowerCase()}
              </code>
            </div>
            <div
              className="flex items-center justify-between border-t px-3 py-2"
              style={{ backgroundColor: theme.bg[1], borderColor: theme.edge[1] }}
            >
              <span className="font-ui text-[11.5px] font-semibold" style={{ color: theme.ink[0] }}>
                {theme.name}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-ui text-[9.5px] tracking-wider uppercase" style={{ color: theme.ink[2] }}>
                  {theme.kind}
                </span>
                {theme.id === activeId && (
                  <span className="font-ui text-[9.5px] font-bold tracking-wider uppercase" style={{ color: theme.accent }}>
                    active
                  </span>
                )}
              </span>
            </div>
          </button>
        ))}
      </div>
      <p className="mt-3 font-ui text-[11px] text-ink-3">
        Hover to preview the whole app live · click to apply
      </p>
    </div>
  )
}

interface Props {
  onEditProject: (project: Project) => void
  onNewProject: () => void
}

export function SettingsPanel({ onEditProject, onNewProject }: Props): React.JSX.Element {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const setPanelOpen = useSettings((s) => s.setPanelOpen)
  const flush = useSettings((s) => s.flush)
  const projects = useProjects((s) => s.projects)
  const deleteProject = useProjects((s) => s.deleteProject)

  const saveAndClose = (): void => {
    flush()
    setPanelOpen(false)
  }

  const sb = settings.terminal.scrollback
  const scrollbackOptions =
    sb < INFINITE_SCROLLBACK && !SCROLLBACK_PRESETS.includes(sb)
      ? [...SCROLLBACK_PRESETS, sb].sort((a, b) => a - b)
      : SCROLLBACK_PRESETS

  const [section, setSection] = useState<SectionId>('general')
  const [shells, setShells] = useState<ShellInfo[]>([])
  const [version, setVersion] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)

  useEffect(() => {
    void window.quarterdeck.pty.listShells().then(setShells)
    void window.quarterdeck.app.version().then(setVersion)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !confirmDelete) setPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPanelOpen, confirmDelete])

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-base">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-edge-2 px-4">
        <span className="flex items-center gap-2 font-ui text-[13px] font-semibold text-ink">
          <Settings size={15} className="text-accent" aria-hidden="true" />
          Settings
        </span>
        <button
          aria-label="Close settings"
          title="Close (Esc)"
          onClick={() => setPanelOpen(false)}
          className="rounded p-1.5 text-ink-3 transition-colors duration-100 hover:text-ink"
        >
          <X size={14} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 space-y-0.5 border-r border-edge-2 p-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                aria-current={section === s.id}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 font-ui text-[12.5px] font-medium transition-colors duration-100 ${
                  section === s.id ? 'bg-overlay text-ink' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                <Icon size={13} aria-hidden="true" />
                {s.label}
              </button>
            )
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-[560px]">
            {section === 'general' && (
              <>
                <Row label="Default shell" hint="Used for new panes when no project is open">
                  <select
                    value={settings.general.defaultShell}
                    aria-label="Default shell"
                    className={fieldCls}
                    onChange={(e) => update('general', { defaultShell: e.target.value as never })}
                  >
                    {shells.map((s) => (
                      <option key={s.kind} value={s.kind}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Default workspace template" hint="Preselected when creating a new tab">
                  <select
                    value={settings.general.defaultTemplate}
                    aria-label="Default workspace template"
                    className={fieldCls}
                    onChange={(e) => update('general', { defaultTemplate: e.target.value })}
                  >
                    {TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="On startup" hint="Restore the last workspace, or start with a fresh terminal">
                  <select
                    value={settings.general.startup}
                    aria-label="Startup behavior"
                    className={fieldCls}
                    onChange={(e) => update('general', { startup: e.target.value as never })}
                  >
                    <option value="restore">Restore last session</option>
                    <option value="empty">Start empty</option>
                  </select>
                </Row>
                <Row label="Default directory" hint="New terminals and the folder picker start here">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={settings.general.defaultDirectory}
                      placeholder="(home)"
                      aria-label="Default directory"
                      className={`${fieldCls} w-52 font-mono text-[11px]`}
                      onChange={(e) => update('general', { defaultDirectory: e.target.value })}
                    />
                    <button
                      onClick={() =>
                        void window.quarterdeck.fs
                          .pickRoot(settings.general.defaultDirectory || undefined)
                          .then((dir) => {
                            if (dir) update('general', { defaultDirectory: dir })
                          })
                      }
                      className="shrink-0 rounded-md border border-edge px-2 py-1.5 font-ui text-[11.5px] font-medium text-ink-2 transition-colors duration-100 hover:border-accent hover:text-ink"
                    >
                      Browse
                    </button>
                  </div>
                </Row>
                <Row label="Sidebar side" hint="Dock the file browser on the left or right">
                  <select
                    value={settings.general.sidebarSide}
                    aria-label="Sidebar side"
                    className={fieldCls}
                    onChange={(e) => update('general', { sidebarSide: e.target.value as 'left' | 'right' })}
                  >
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </Row>
              </>
            )}

            {section === 'editor' && (
              <>
                <Row label="Font size">
                  <input
                    type="number"
                    min={9}
                    max={28}
                    value={settings.editor.fontSize}
                    aria-label="Editor font size"
                    className={`${fieldCls} w-20 text-center`}
                    onChange={(e) => update('editor', { fontSize: Math.max(9, Math.min(28, Number(e.target.value) || 13)) })}
                  />
                </Row>
                <Row label="Tab size">
                  <select
                    value={settings.editor.tabSize}
                    aria-label="Tab size"
                    className={fieldCls}
                    onChange={(e) => update('editor', { tabSize: Number(e.target.value) })}
                  >
                    {[2, 4, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} spaces
                      </option>
                    ))}
                  </select>
                </Row>
                <Row label="Word wrap">
                  <Toggle
                    checked={settings.editor.wordWrap}
                    label="Word wrap"
                    onChange={(v) => update('editor', { wordWrap: v })}
                  />
                </Row>
                <Row label="Minimap">
                  <Toggle
                    checked={settings.editor.minimap}
                    label="Minimap"
                    onChange={(v) => update('editor', { minimap: v })}
                  />
                </Row>
                <Row label="Format on save" hint="Runs the language formatter before writing (JSON, CSS, HTML, TS…)">
                  <Toggle
                    checked={settings.editor.formatOnSave}
                    label="Format on save"
                    onChange={(v) => update('editor', { formatOnSave: v })}
                  />
                </Row>
              </>
            )}

            {section === 'terminal' && (
              <>
                <Row label="Font size" hint="Applies live to every open terminal">
                  <input
                    type="number"
                    min={9}
                    max={24}
                    value={settings.terminal.fontSize}
                    aria-label="Terminal font size"
                    className={`${fieldCls} w-20 text-center`}
                    onChange={(e) => update('terminal', { fontSize: Math.max(9, Math.min(24, Number(e.target.value) || 13)) })}
                  />
                </Row>
                <Row label="Scrollback" hint="Lines kept in terminal history — Infinite grows with output">
                  <select
                    value={sb >= INFINITE_SCROLLBACK ? 'infinite' : String(sb)}
                    aria-label="Scrollback lines"
                    className={fieldCls}
                    onChange={(e) =>
                      update('terminal', {
                        scrollback: e.target.value === 'infinite' ? INFINITE_SCROLLBACK : Number(e.target.value)
                      })
                    }
                  >
                    {scrollbackOptions.map((n) => (
                      <option key={n} value={n}>
                        {n.toLocaleString()} lines
                      </option>
                    ))}
                    <option value="infinite">Infinite</option>
                  </select>
                </Row>
                <Row label="Cursor style">
                  <select
                    value={settings.terminal.cursorStyle}
                    aria-label="Cursor style"
                    className={fieldCls}
                    onChange={(e) => update('terminal', { cursorStyle: e.target.value as never })}
                  >
                    <option value="bar">Bar</option>
                    <option value="block">Block</option>
                    <option value="underline">Underline</option>
                  </select>
                </Row>
                <Row label="Cursor blink">
                  <Toggle
                    checked={settings.terminal.cursorBlink}
                    label="Cursor blink"
                    onChange={(v) => update('terminal', { cursorBlink: v })}
                  />
                </Row>
                <Row label="Bell sound" hint="Quiet blip when a program rings the terminal bell">
                  <Toggle
                    checked={settings.terminal.bell}
                    label="Bell sound"
                    onChange={(v) => update('terminal', { bell: v })}
                  />
                </Row>

                <p className="pt-5 pb-1 font-ui text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
                  Clipboard shortcuts
                </p>
                <Row label="Ctrl+C copies selection" hint="Copies when text is selected; sends interrupt (SIGINT) otherwise">
                  <Toggle
                    checked={settings.terminal.copyCtrlC}
                    label="Ctrl+C copies selection"
                    onChange={(v) => update('terminal', { copyCtrlC: v })}
                  />
                </Row>
                <Row label="Ctrl+V pastes">
                  <Toggle
                    checked={settings.terminal.pasteCtrlV}
                    label="Ctrl+V pastes"
                    onChange={(v) => update('terminal', { pasteCtrlV: v })}
                  />
                </Row>
                <Row label="Ctrl+Shift+C copies" hint="Dedicated copy — never interrupts the running program">
                  <Toggle
                    checked={settings.terminal.copyCtrlShiftC}
                    label="Ctrl+Shift+C copies"
                    onChange={(v) => update('terminal', { copyCtrlShiftC: v })}
                  />
                </Row>
                <Row label="Ctrl+Shift+V pastes">
                  <Toggle
                    checked={settings.terminal.pasteCtrlShiftV}
                    label="Ctrl+Shift+V pastes"
                    onChange={(v) => update('terminal', { pasteCtrlShiftV: v })}
                  />
                </Row>
                <Row label="Copy on select" hint="Highlighting text copies it to the clipboard automatically — handy in apps like Claude Code that redraw and clear the highlight before you can press Ctrl+C">
                  <Toggle
                    checked={settings.terminal.copyOnSelect}
                    label="Copy on select"
                    onChange={(v) => update('terminal', { copyOnSelect: v })}
                  />
                </Row>
                <Row label="Select text in full-screen apps" hint="Lets a plain mouse drag select text even in apps that grab the mouse (Claude Code, vim). While on, a plain click won't reach those apps — turn off if you need to click inside them (Shift+drag always selects).">
                  <Toggle
                    checked={settings.terminal.mouseSelectInApps}
                    label="Select text in full-screen apps"
                    onChange={(v) => update('terminal', { mouseSelectInApps: v })}
                  />
                </Row>

                <p className="pt-5 pb-1 font-ui text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
                  Editing
                </p>
                <Row label="Click to move cursor" hint="Reposition the prompt cursor by clicking. Click = text-editor feel; Alt + click keeps plain click free for selecting. Full-screen apps (claude, vim) handle the mouse themselves.">
                  <select
                    value={settings.terminal.clickMovesCursor}
                    aria-label="Click to move cursor"
                    className={fieldCls}
                    onChange={(e) =>
                      update('terminal', { clickMovesCursor: e.target.value as 'off' | 'alt' | 'plain' })
                    }
                  >
                    <option value="off">Off</option>
                    <option value="alt">Alt + click</option>
                    <option value="plain">Click</option>
                  </select>
                </Row>
                <Row label="Type over selection" hint="Highlight text in the prompt, then type or press Backspace to replace or delete it">
                  <Toggle
                    checked={settings.terminal.replaceSelectionOnType}
                    label="Type over selection"
                    onChange={(v) => update('terminal', { replaceSelectionOnType: v })}
                  />
                </Row>
              </>
            )}

            {section === 'shortcuts' && (
              <div className="space-y-0">
                {SHORTCUTS.map((s) => (
                  <div key={s.keys} className="flex items-center justify-between border-b border-edge-2 py-2 last:border-0">
                    <span className="font-ui text-[12.5px] text-ink-2">{s.action}</span>
                    <kbd className="rounded border border-edge bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                      {s.keys}
                    </kbd>
                  </div>
                ))}
                <p className="pt-3 font-ui text-[11px] text-ink-3">
                  Terminal copy/paste shortcuts can be turned on or off in Terminal settings. Custom rebinding is on the roadmap.
                </p>
              </div>
            )}

            {section === 'themes' && <ThemesGrid />}

            {section === 'projects' && (
              <div>
                {sortedProjects(projects).map((p) => (
                  <div key={p.id} className="flex items-center gap-3 border-b border-edge-2 py-2.5 last:border-0">
                    <FolderGit2 size={14} className="shrink-0" style={{ color: p.color }} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-ui text-[12.5px] font-medium text-ink">{p.name}</p>
                      <p className="truncate font-mono text-[10.5px] text-ink-3">{p.rootDir}</p>
                    </div>
                    <button
                      aria-label={`Edit ${p.name}`}
                      onClick={() => onEditProject(p)}
                      className="rounded p-1 text-ink-3 hover:text-ink"
                    >
                      <PencilLine size={13} />
                    </button>
                    <button
                      aria-label={`Delete ${p.name}`}
                      onClick={() => setConfirmDelete(p)}
                      className="rounded p-1 text-ink-3 hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {projects.length === 0 && (
                  <p className="py-4 font-ui text-[12px] text-ink-3">No projects yet.</p>
                )}
                <button
                  onClick={onNewProject}
                  className="mt-3 rounded-md bg-accent px-3 py-1.5 font-ui text-[12px] font-semibold text-ink-inverse"
                >
                  New project
                </button>
              </div>
            )}

            {section === 'about' && (
              <div className="space-y-2 py-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-3 w-3 rotate-45 bg-accent" aria-hidden="true" />
                  <span className="font-ui text-[16px] font-semibold text-ink">{APP_NAME}</span>
                  <span className="font-mono text-[11px] text-ink-3">v{version}</span>
                </div>
                <p className="font-ui text-[12.5px] leading-relaxed text-ink-2">
                  A terminal workspace for commanding parallel AI agents — real terminals, an inline
                  editor, agent chat, a file browser, and a task board, all local.
                </p>
                <p className="font-ui text-[11.5px] text-ink-3">
                  Electron · React · xterm.js · Monaco · node-pty — fully local, no telemetry, no cloud.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="flex h-12 shrink-0 items-center justify-end gap-3 border-t border-edge-2 px-4">
        <span className="mr-auto font-ui text-[11px] text-ink-3">
          Changes apply live and save automatically.
        </span>
        <button
          onClick={saveAndClose}
          className="rounded-md bg-accent px-4 py-1.5 font-ui text-[12.5px] font-semibold text-ink-inverse transition-opacity duration-100 hover:opacity-90"
        >
          Save
        </button>
      </footer>

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
