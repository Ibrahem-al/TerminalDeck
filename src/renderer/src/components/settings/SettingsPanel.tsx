import { useEffect, useState } from 'react'
import {
  Download,
  FolderGit2,
  Info,
  Keyboard,
  Palette,
  PanelTop,
  PencilLine,
  RefreshCw,
  Settings,
  Settings2,
  SquareCode,
  Terminal,
  Trash2,
  X
} from 'lucide-react'
import {
  APP_NAME,
  INFINITE_SCROLLBACK,
  type NotchHooksStatus,
  type Project,
  type ShellInfo
} from '@shared/types'
import { useSettings } from '../../store/settings'
import { useProjects, sortedProjects } from '../../store/projects'
import { useTheme } from '../../store/theme'
import { useUpdater } from '../../store/updater'
import { THEMES } from '../../styles/themes'
import { TEMPLATES } from '../workspace/layout'
import { ConfirmDialog } from '../common/ConfirmDialog'

type SectionId =
  | 'general'
  | 'editor'
  | 'terminal'
  | 'notch'
  | 'shortcuts'
  | 'themes'
  | 'projects'
  | 'updates'
  | 'about'

const SECTIONS: { id: SectionId; label: string; icon: typeof Settings2 }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'editor', label: 'Editor', icon: SquareCode },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'notch', label: 'Notch', icon: PanelTop },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'themes', label: 'Themes', icon: Palette },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
  { id: 'about', label: 'About', icon: Info }
]

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl+T', action: 'New workspace tab (template picker)' },
  { keys: 'Ctrl+Shift+M', action: 'Open a new app window' },
  { keys: 'Ctrl+W', action: 'Close current workspace tab' },
  { keys: 'Ctrl+1–9', action: 'Switch workspace tab by index' },
  { keys: 'Ctrl+D', action: 'Split active pane right' },
  { keys: 'Ctrl+Shift+D', action: 'Split active pane down' },
  { keys: 'Alt+←/→/↑/↓', action: 'Focus the pane in that direction' },
  { keys: 'Alt+[ / Alt+]', action: 'Focus previous / next pane' },
  { keys: 'Alt+Shift+←/→/↑/↓', action: 'Swap active pane with its neighbour' },
  { keys: 'Prefix ←↑↓→ / hjkl', action: 'tmux: move to the adjacent pane' },
  { keys: 'Prefix o / ;', action: 'tmux: next pane / last pane' },
  { keys: 'Prefix % / "', action: 'tmux: split pane right / down' },
  { keys: 'Prefix x / z', action: 'tmux: close / zoom the active pane' },
  { keys: 'Prefix { / }', action: 'tmux: swap pane backward / forward' },
  { keys: 'Prefix !', action: 'tmux: break pane out to a new deck' },
  { keys: 'Prefix c / n / p', action: 'tmux: new deck / next / previous deck' },
  { keys: 'Prefix 1–9', action: 'tmux: select deck by number' },
  { keys: 'Prefix q', action: 'tmux: show pane numbers, digit to jump' },
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

function UpdatesSection(): React.JSX.Element {
  const status = useUpdater((s) => s.status)
  const version = useUpdater((s) => s.version)
  const check = useUpdater((s) => s.check)
  const download = useUpdater((s) => s.download)
  const install = useUpdater((s) => s.install)

  const busy = status.state === 'checking' || status.state === 'downloading'
  const btn =
    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-ui text-[12px] font-semibold transition-opacity duration-100 hover:opacity-90 disabled:opacity-50'

  return (
    <div className="space-y-4 py-1">
      <div className="flex items-center gap-2.5">
        <div className="h-3 w-3 rotate-45 bg-accent" aria-hidden="true" />
        <span className="font-ui text-[13px] font-semibold text-ink">{APP_NAME}</span>
        <span className="font-mono text-[11px] text-ink-3">v{version || '…'}</span>
      </div>

      <div className="rounded-lg border border-edge-2 bg-term/40 p-3.5">
        {status.state === 'dev' && (
          <p className="font-ui text-[12.5px] text-ink-2">
            This is a development build — auto-update is disabled. Packaged builds update from GitHub
            Releases.
          </p>
        )}

        {status.state === 'checking' && (
          <p className="flex items-center gap-2 font-ui text-[12.5px] text-ink-2">
            <RefreshCw size={13} className="animate-spin text-accent" aria-hidden="true" />
            Checking for updates…
          </p>
        )}

        {(status.state === 'idle' || status.state === 'not-available') && (
          <div className="flex items-center justify-between gap-4">
            <p className="font-ui text-[12.5px] text-ink-2">
              {status.state === 'not-available'
                ? "You're on the latest version."
                : 'Check whether a newer version is available.'}
            </p>
            <button onClick={check} className={`${btn} bg-accent text-ink-inverse`}>
              <RefreshCw size={13} aria-hidden="true" />
              Check for updates
            </button>
          </div>
        )}

        {status.state === 'available' && (
          <div className="space-y-2.5">
            <p className="font-ui text-[12.5px] text-ink">
              Version <span className="font-semibold text-accent">{status.version}</span> is available.
            </p>
            {status.notes && (
              <pre className="max-h-32 overflow-y-auto rounded border border-edge-2 bg-base p-2 font-ui text-[11.5px] whitespace-pre-wrap text-ink-3">
                {status.notes}
              </pre>
            )}
            <button onClick={download} className={`${btn} bg-accent text-ink-inverse`}>
              <Download size={13} aria-hidden="true" />
              Download update
            </button>
          </div>
        )}

        {status.state === 'downloading' && (
          <div className="space-y-2">
            <p className="font-ui text-[12.5px] text-ink-2">
              Downloading update… {status.percent ?? 0}%
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${status.percent ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {status.state === 'downloaded' && (
          <div className="flex items-center justify-between gap-4">
            <p className="font-ui text-[12.5px] text-ink">
              Version <span className="font-semibold text-accent">{status.version}</span> is ready to
              install.
            </p>
            <button onClick={install} className={`${btn} bg-accent text-ink-inverse`}>
              Restart &amp; install
            </button>
          </div>
        )}

        {status.state === 'error' && (
          <div className="flex items-center justify-between gap-4">
            <p className="min-w-0 font-ui text-[12.5px] text-danger">
              Couldn’t check for updates: {status.error}
            </p>
            <button onClick={check} disabled={busy} className={`${btn} bg-accent text-ink-inverse`}>
              <RefreshCw size={13} aria-hidden="true" />
              Try again
            </button>
          </div>
        )}
      </div>

      <p className="font-ui text-[11px] text-ink-3">
        Updates install a signed-in-place NSIS package and keep your settings, projects, and paired
        phones. TerminalDeck checks automatically on launch.
      </p>
    </div>
  )
}

function NotchSection(): React.JSX.Element {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [hooks, setHooks] = useState<NotchHooksStatus | null>(null)
  const [hooksBusy, setHooksBusy] = useState(false)

  useEffect(() => {
    void window.quarterdeck.notch.hooksStatus().then(setHooks)
  }, [])

  const n = settings.notch

  const toggleHooks = async (): Promise<void> => {
    if (!hooks || hooksBusy) return
    setHooksBusy(true)
    try {
      const next = hooks.installed
        ? await window.quarterdeck.notch.hooksUninstall()
        : await window.quarterdeck.notch.hooksInstall()
      setHooks(next)
    } finally {
      setHooksBusy(false)
    }
  }

  return (
    <>
      <Row
        label="Enable the notch"
        hint="Always-on-top pill at the top of the screen that surfaces agent questions and finished work"
      >
        <Toggle checked={n.enabled} onChange={(v) => update('notch', { enabled: v })} label="Enable the notch" />
      </Row>
      <Row
        label="Pill visibility"
        hint="Hidden: appears for alerts, or when you park the mouse at the top-center screen edge (like taskbar auto-hide)"
      >
        <select
          value={n.visibility}
          aria-label="Pill visibility"
          className={fieldCls}
          onChange={(e) => update('notch', { visibility: e.target.value as 'always' | 'autohide' })}
        >
          <option value="always">Always visible</option>
          <option value="autohide">Hidden until needed</option>
        </select>
      </Row>
      <Row label="Size" hint="Overall size of the pill, alerts, and pulldown">
        <select
          value={String(n.scale)}
          aria-label="Notch size"
          className={fieldCls}
          onChange={(e) => update('notch', { scale: Number(e.target.value) || 1 })}
        >
          <option value="0.85">Small</option>
          <option value="1">Normal</option>
          <option value="1.2">Large</option>
          <option value="1.4">Extra large</option>
        </select>
      </Row>
      <Row
        label="Show while TerminalDeck is focused"
        hint="Off: alerts only appear while you're working in other apps"
      >
        <Toggle
          checked={n.showWhenFocused}
          onChange={(v) => update('notch', { showWhenFocused: v })}
          label="Show while TerminalDeck is focused"
        />
      </Row>
      <Row
        label="Auto-focus questions"
        hint="When a question pops and you're not mid-typing, the pulldown takes the keyboard so you can answer immediately"
      >
        <Toggle
          checked={n.autoFocusQuestions}
          onChange={(v) => update('notch', { autoFocusQuestions: v })}
          label="Auto-focus questions"
        />
      </Row>
      <Row label="Turn finished" hint="Alert when an agent finishes a turn and is waiting for you">
        <Toggle
          checked={n.notifyTurnDone}
          onChange={(v) => update('notch', { notifyTurnDone: v })}
          label="Turn finished alerts"
        />
      </Row>
      <Row label="Command finished" hint="Alert when a long shell command completes">
        <Toggle
          checked={n.notifyCommandDone}
          onChange={(v) => update('notch', { notifyCommandDone: v })}
          label="Command finished alerts"
        />
      </Row>
      <Row label="Minimum command time" hint="Only alert for commands that ran at least this many seconds">
        <input
          type="number"
          min={1}
          max={3600}
          value={n.minCommandSec}
          aria-label="Minimum command time in seconds"
          className={`${fieldCls} w-20`}
          onChange={(e) =>
            update('notch', { minCommandSec: Math.max(1, Math.min(3600, Number(e.target.value) || 15)) })
          }
        />
      </Row>
      <Row
        label="Waiting-detection heuristics"
        hint="Best-effort 'may be waiting for you' hints (screen content, bell, OSC 9) for CLIs without hooks"
      >
        <Toggle
          checked={n.heuristics}
          onChange={(v) => update('notch', { heuristics: v })}
          label="Waiting-detection heuristics"
        />
      </Row>

      <div className="mt-5 rounded-lg border border-edge-2 p-4">
        <p className="font-ui text-[12.5px] font-semibold text-ink">Claude Code hooks — exact detection</p>
        <p className="mt-1.5 font-ui text-[11.5px] leading-relaxed text-ink-3">
          Installs a tiny hook into <code className="text-ink-2">~/.claude/settings.json</code> so Claude Code
          tells TerminalDeck precisely when it needs your input or finishes a turn. The hook does nothing when
          claude runs outside TerminalDeck, and takes effect for <b>newly started</b> claude sessions. Covers
          claude running natively on this machine (not inside WSL).
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => void toggleHooks()}
            disabled={!hooks || hooksBusy}
            className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 font-ui text-[12px] font-medium text-accent transition-colors duration-100 hover:bg-accent/20 disabled:opacity-50"
          >
            {hooks === null ? 'Checking…' : hooks.installed ? 'Remove hooks' : 'Install hooks'}
          </button>
          <span className="font-ui text-[11px] text-ink-3">
            {hooks?.error
              ? `Failed: ${hooks.error}`
              : hooks?.installed
                ? 'Installed — exact detection active for new claude sessions'
                : 'Not installed — the notch falls back to heuristics'}
          </span>
        </div>
      </div>
    </>
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
                <Row
                  label="Keep computer awake while agents are working"
                  hint="Prevents your PC from sleeping while a Claude chat pane is working or a terminal is actively running a task (e.g. an agent you left running), so work isn't paused when you step away. The display can still sleep; it releases automatically once everything goes idle."
                >
                  <Toggle
                    checked={settings.general.keepAwakeWhileBusy}
                    label="Keep computer awake while agents are working"
                    onChange={(v) => update('general', { keepAwakeWhileBusy: v })}
                  />
                </Row>
                <Row
                  label="Confirm before closing"
                  hint="Warn before a window closes while it still has live terminals, agents, or unsaved files. Empty windows always close without a prompt."
                >
                  <Toggle
                    checked={settings.general.confirmOnClose}
                    label="Confirm before closing"
                    onChange={(v) => update('general', { confirmOnClose: v })}
                  />
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
                <p className="pb-1 font-ui text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
                  Pane navigation (tmux-style)
                </p>
                <Row
                  label="Direct pane navigation"
                  hint="Alt + Arrow moves focus to the pane in that direction; Alt+[ / Alt+] cycle panes; Alt+Shift+Arrow swaps the pane with its neighbour. Ignored inside the code editor, which uses the Alt keys itself."
                >
                  <Toggle
                    checked={settings.keys.directPaneNav}
                    label="Direct pane navigation"
                    onChange={(v) => update('keys', { directPaneNav: v })}
                  />
                </Row>
                <Row
                  label="tmux prefix mode"
                  hint={'Press the prefix, then a command key: arrows or h/j/k/l move, o/; cycle, % / " split, x close, z zoom, { } swap, c/n/p/1–9 decks, q pane numbers. A hint shows while the prefix is armed.'}
                >
                  <Toggle
                    checked={settings.keys.tmuxPrefixEnabled}
                    label="tmux prefix mode"
                    onChange={(v) => update('keys', { tmuxPrefixEnabled: v })}
                  />
                </Row>
                <Row
                  label="Prefix key"
                  hint="The chord that arms prefix mode. It's captured from terminals, so it overrides that key there (e.g. Ctrl+A is normally start-of-line)."
                >
                  <select
                    value={settings.keys.tmuxPrefix}
                    aria-label="tmux prefix key"
                    disabled={!settings.keys.tmuxPrefixEnabled}
                    className={`${fieldCls} disabled:opacity-40`}
                    onChange={(e) => update('keys', { tmuxPrefix: e.target.value as never })}
                  >
                    <option value="ctrl+a">Ctrl+A</option>
                    <option value="ctrl+space">Ctrl+Space</option>
                    <option value="alt+q">Alt+Q</option>
                  </select>
                </Row>

                <p className="pt-6 pb-1 font-ui text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
                  All shortcuts
                </p>
                {SHORTCUTS.map((s) => (
                  <div key={s.keys} className="flex items-center justify-between gap-4 border-b border-edge-2 py-2 last:border-0">
                    <span className="font-ui text-[12.5px] text-ink-2">{s.action}</span>
                    <kbd className="shrink-0 rounded border border-edge bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                      {s.keys}
                    </kbd>
                  </div>
                ))}
                <p className="pt-3 font-ui text-[11px] text-ink-3">
                  “Prefix” means the tmux prefix key set above. Terminal copy/paste shortcuts are in Terminal settings.
                </p>
              </div>
            )}

            {section === 'notch' && <NotchSection />}

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

            {section === 'updates' && <UpdatesSection />}

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
