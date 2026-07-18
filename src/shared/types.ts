/**
 * Types shared between the Electron main process and the renderer.
 * IPC payload shapes, persisted data models, and app-wide constants live here.
 */

export const APP_NAME = 'TerminalDeck'

/** Every IPC channel name in the app. Single source of truth. */
export const IPC = {
  WindowMinimize: 'window:minimize',
  WindowMaximize: 'window:maximize',
  WindowClose: 'window:close',
  WindowMaximized: 'window:maximized',
  /** Open another independent app window. */
  WindowNew: 'window:new',
  /** Main → renderer: the window is trying to close; the renderer confirms first. */
  WindowCloseRequest: 'window:close-request',
  /** Renderer → main: the user confirmed the close; actually close now. */
  WindowConfirmClose: 'window:confirm-close',
  /** Main → renderer: this window is now the session owner (the primary closed). */
  WindowSetPrimary: 'window:set-primary',

  // In-app auto-update (electron-updater, packaged builds only)
  UpdateCheck: 'update:check',
  UpdateDownload: 'update:download',
  UpdateInstall: 'update:install',
  /** Renderer → main: fetch the current updater state (catch-up for new windows). */
  UpdateGetCurrent: 'update:get-current',
  /** Main → renderer: current updater state (checking / available / progress / …). */
  UpdateStatus: 'update:status',

  /** Open an http(s) URL in the OS default app (terminal Ctrl+click, etc.). */
  ShellOpenExternal: 'shell:open-external',
  /** Begin a native OS file drag so a tree item can be dragged out to Explorer. */
  ShellStartDrag: 'shell:start-drag',

  PtyShells: 'pty:shells',
  PtyCreate: 'pty:create',
  PtyWrite: 'pty:write',
  PtyResize: 'pty:resize',
  PtyKill: 'pty:kill',
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',

  AgentCreate: 'agent:create',
  AgentSend: 'agent:send',
  AgentInterrupt: 'agent:interrupt',
  AgentKill: 'agent:kill',
  AgentRespondPermission: 'agent:permission',
  AgentSetPermissionMode: 'agent:set-permission-mode',
  AgentEvent: 'agent:event',

  FsPickRoot: 'fs:pick-root',
  FsReadDir: 'fs:read-dir',
  FsCreateFile: 'fs:create-file',
  FsCreateDir: 'fs:create-dir',
  FsRename: 'fs:rename',
  FsCopy: 'fs:copy',
  FsMove: 'fs:move',
  FsDelete: 'fs:delete',
  FsReveal: 'fs:reveal',
  FsSearch: 'fs:search',
  FsWatch: 'fs:watch',
  FsUnwatch: 'fs:unwatch',
  FsChanged: 'fs:changed',
  FsReadFile: 'fs:read-file',
  FsWriteFile: 'fs:write-file',
  FsWatchFile: 'fs:watch-file',
  FsUnwatchFile: 'fs:unwatch-file',
  FsFileChanged: 'fs:file-changed',
  FsImportPaths: 'fs:import-paths',
  FsWriteBlob: 'fs:write-blob',
  FsDownloadUrl: 'fs:download-url',
  FsPasteClipboard: 'fs:paste-clipboard',
  /** Put file/folder paths on the OS clipboard so they can be pasted in Explorer. */
  FsCopyToClipboard: 'fs:copy-to-clipboard',

  ProjectsList: 'projects:list',
  ProjectsSave: 'projects:save',
  ProjectsDelete: 'projects:delete',

  KanbanLoad: 'kanban:load',
  KanbanSave: 'kanban:save',

  SettingsLoad: 'settings:load',
  SettingsSave: 'settings:save',
  AppVersion: 'app:version',

  SessionLoad: 'session:load',
  SessionSave: 'session:save',

  // RemoteDeck — phone control Agent
  RemoteStatus: 'remote:status',
  RemoteStart: 'remote:start',
  RemoteStop: 'remote:stop',
  RemoteStatusChanged: 'remote:status-changed',
  RemoteGetConfig: 'remote:get-config',
  RemoteSetConfig: 'remote:set-config',
  RemotePairingNew: 'remote:pairing-new',
  RemoteDevicesList: 'remote:devices-list',
  RemoteDeviceRevoke: 'remote:device-revoke',
  RemoteTailscale: 'remote:tailscale',
  RemoteTailscaleUp: 'remote:tailscale-up',
  RemoteTailscaleServe: 'remote:tailscale-serve',
  RemoteTailscaleFunnel: 'remote:tailscale-funnel',
  RemoteSetPasscode: 'remote:set-passcode',
  RemotePorts: 'remote:ports',

  // Notifications (phone push + desktop)
  NotifyGetConfig: 'notify:get-config',
  NotifySetConfig: 'notify:set-config',
  NotifyTaskComplete: 'notify:task-complete',

  // Session sync (renderer ⇄ Agent): the phone mirrors the desktop's open panes
  SessionsReport: 'sessions:report',
  RemoteOpenPane: 'remote:open-pane'
} as const

export type ShellKind = 'powershell' | 'pwsh' | 'cmd' | 'gitbash'

/** Chord that arms the tmux-style pane-command prefix. Ctrl+B is deliberately
 *  absent — it's already the sidebar toggle. */
export type TmuxPrefix = 'ctrl+a' | 'ctrl+space' | 'alt+q'

export interface ShellInfo {
  kind: ShellKind
  label: string
  path: string
}

export interface PtySpawnOptions {
  /** Defaults to the system shell (Windows PowerShell). */
  shell?: ShellKind
  /** Defaults to the user's home directory. */
  cwd?: string
  cols: number
  rows: number
  env?: Record<string, string>
}

export interface PtySession {
  sessionId: string
  shell: ShellKind
  cwd: string
  /** True when OSC 133 shell integration is active (enables command blocks). */
  integrated: boolean
}

/* ── File system (explorer sidebar) ───────────────────────────────── */

export interface FsEntry {
  name: string
  path: string
  isDir: boolean
}

/**
 * Outcome of importing one or more external items (a drop or an OS-clipboard
 * paste) into a folder. Partial success is normal — some items can land while
 * others fail, so successes and failures are reported together.
 */
export interface ImportResult {
  /** Absolute paths actually created in the destination folder. */
  created: string[]
  /** One human-readable message per item that could not be imported. */
  errors: string[]
}

/* ── Projects ─────────────────────────────────────────────────────── */

export interface AutoStartCommand {
  id: string
  command: string
  /** 1-based pane number within the project's workspace tab. */
  paneIndex: number
  label: string
  delayMs: number
  enabled: boolean
}

export interface ProjectEnvVar {
  key: string
  /** Decrypted in transit; encrypted at rest (DPAPI via safeStorage). */
  value: string
}

export interface Project {
  id: string
  name: string
  /** Accent color shown in the switcher, top bar, and project list. */
  color: string
  rootDir: string
  description: string
  defaultShell: ShellKind
  /** Template id from the workspace layout templates ('single', 'quad', …). */
  defaultTemplate: string
  env: ProjectEnvVar[]
  autoStart: AutoStartCommand[]
  createdAt: number
  lastOpenedAt: number | null
}

/* ── Settings ─────────────────────────────────────────────────────── */

export interface AppSettings {
  general: {
    defaultShell: ShellKind
    defaultTemplate: string
    startup: 'restore' | 'empty'
    theme: string
    /** Starting directory for new terminals and the folder picker ('' = home). */
    defaultDirectory: string
    /**
     * Project a new tab is bound to when the new-tab dialog is confirmed without
     * an explicit pick (the ★ "default project" in the switcher). Null = new tabs
     * are plain scratch tabs. Dangling ids (project deleted) are treated as null.
     */
    defaultProjectId: string | null
    sidebarSide: 'left' | 'right'
    /**
     * Keep the PC awake (no idle system sleep) while any embedded Claude chat
     * pane is actively working, so agents aren't paused when you step away. The
     * display may still sleep; releases automatically once every chat is idle.
     */
    keepAwakeWhileBusy: boolean
    /**
     * Ask for confirmation before a window closes while it still has live
     * terminals/agents or unsaved editor files, so a stray Alt+F4 or click on ✕
     * doesn't silently kill running work. Empty windows close without a prompt.
     */
    confirmOnClose: boolean
  }
  editor: {
    fontSize: number
    tabSize: number
    wordWrap: boolean
    minimap: boolean
    formatOnSave: boolean
  }
  terminal: {
    fontSize: number
    scrollback: number
    cursorStyle: 'block' | 'underline' | 'bar'
    cursorBlink: boolean
    bell: boolean
    /** Ctrl+C copies the selection when there is one (otherwise sends SIGINT). */
    copyCtrlC: boolean
    /** Ctrl+V pastes from the clipboard. */
    pasteCtrlV: boolean
    /** Ctrl+Shift+C copies the selection (dedicated copy, never interrupts). */
    copyCtrlShiftC: boolean
    /** Ctrl+Shift+V pastes from the clipboard. */
    pasteCtrlShiftV: boolean
    /** Click-to-move-cursor trigger: off, Alt+click, or plain click (text-editor feel). */
    clickMovesCursor: 'off' | 'alt' | 'plain'
    /** Highlight + type / Backspace replaces or deletes the selected input text. */
    replaceSelectionOnType: boolean
    /** Finishing a selection copies it to the clipboard automatically. */
    copyOnSelect: boolean
    /**
     * Let a plain mouse drag select text even in full-screen apps that grab the
     * mouse (e.g. Claude Code, vim). When on, a left drag over such an app selects
     * text locally instead of being sent to the app — so a plain click won't reach
     * the app there. (Shift+drag always selects regardless.)
     */
    mouseSelectInApps: boolean
  }
  /** tmux-style pane navigation shortcuts. */
  keys: {
    /**
     * Direct (no-prefix) pane navigation: Alt+Arrow moves focus to the pane in
     * that direction, Alt+[ / Alt+] cycle panes, Alt+Shift+Arrow swaps the active
     * pane with its neighbour. Suppressed while a Monaco editor is focused (it owns
     * the Alt keys); works from terminals, the agent composer, and app chrome.
     */
    directPaneNav: boolean
    /**
     * tmux-style prefix mode: press the prefix chord, then a command key (arrows /
     * hjkl move, o/; cycle, % / " split, x close, z zoom, { } swap, c/n/p/1-9 decks,
     * q pane numbers). A hint shows while the prefix is armed.
     */
    tmuxPrefixEnabled: boolean
    /** Which chord arms the prefix (remappable). */
    tmuxPrefix: TmuxPrefix
  }
}

/**
 * Sentinel scrollback value meaning "infinite". xterm keeps this many lines
 * before trimming; the buffer only grows with real content, so this is
 * effectively unlimited while staying a finite, JSON-serializable number
 * (Infinity can't survive JSON persistence).
 */
export const INFINITE_SCROLLBACK = 100_000_000

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    defaultShell: 'powershell',
    defaultTemplate: 'single',
    startup: 'restore',
    theme: 'deepwater',
    defaultDirectory: '',
    defaultProjectId: null,
    sidebarSide: 'left',
    keepAwakeWhileBusy: false,
    confirmOnClose: true
  },
  editor: { fontSize: 13, tabSize: 2, wordWrap: false, minimap: true, formatOnSave: false },
  terminal: {
    fontSize: 13,
    scrollback: 10_000,
    cursorStyle: 'bar',
    cursorBlink: true,
    bell: false,
    copyCtrlC: true,
    pasteCtrlV: true,
    copyCtrlShiftC: true,
    pasteCtrlShiftV: true,
    clickMovesCursor: 'alt',
    replaceSelectionOnType: true,
    copyOnSelect: true,
    mouseSelectInApps: true
  },
  keys: {
    directPaneNav: true,
    tmuxPrefixEnabled: true,
    tmuxPrefix: 'ctrl+a'
  }
}

/* ── Kanban board ─────────────────────────────────────────────────── */

export type KanbanColumnId = 'backlog' | 'todo' | 'inprogress' | 'inreview' | 'done'
export type KanbanPriority = 'low' | 'medium' | 'high' | 'critical'

export interface KanbanTag {
  name: string
  color: string
}

export interface KanbanCard {
  id: string
  title: string
  /** Markdown supported. */
  description: string
  priority: KanbanPriority
  tags: KanbanTag[]
  /** 1-based pane number in the pane's workspace tab, or null. */
  targetPane: number | null
  column: KanbanColumnId
  createdAt: number
  updatedAt: number
}

/* ── Agent Chat (Claude Code via stream-json) ─────────────────────── */

export type AgentPermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export interface AgentSpawnOptions {
  /** Defaults to the user's home directory. */
  cwd?: string
  permissionMode?: AgentPermissionMode
}

export interface AgentSessionInfo {
  agentId: string
  cwd: string
}

export type AgentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }

export type AgentEvent =
  | { kind: 'init'; sessionId: string; model: string; cwd: string; slashCommands: string[] }
  | { kind: 'text-delta'; text: string }
  | { kind: 'assistant-message'; blocks: AgentBlock[] }
  | { kind: 'tool-result'; toolUseId: string; isError: boolean; preview: string }
  | { kind: 'permission-request'; requestId: string; toolName: string; input: unknown }
  | { kind: 'result'; isError: boolean; costUsd: number; durationMs: number; errorText?: string }
  | { kind: 'stderr'; text: string }
  | { kind: 'exit'; code: number }

/* ── RemoteDeck — phone control over Tailscale ────────────────────── */

/** Default port for the embedded Agent HTTP/WS server. */
export const REMOTE_DEFAULT_PORT = 8787
/** Pairing codes are single-use and expire after this long. */
export const PAIR_CODE_TTL_MS = 5 * 60_000
/** WebSocket subprotocol that also carries the device token (`bearer.<token>`). */
export const REMOTE_WS_SUBPROTOCOL = 'terminaldeck.v1'

export interface RemoteConfig {
  /** Start the Agent automatically when the app launches. */
  autoStart: boolean
  port: number
  /** Filesystem roots the phone may browse / open sessions in. */
  allowedRoots: string[]
  /**
   * Keep the PC awake (no idle system sleep) the whole time the Agent is
   * running, so a phone can always reconnect after you leave. The display may
   * still sleep. Defaults on — turn off to let the PC sleep normally.
   */
  keepAwake: boolean
  /**
   * Whether an access passcode (second pairing factor) is set. Read-only mirror
   * for the wizard — the passcode itself is never sent to the renderer, and
   * setConfig ignores this field (change it via the dedicated set-passcode IPC).
   */
  hasPasscode: boolean
}

/** Live status of the embedded Agent, surfaced to the renderer wizard. */
export interface RemoteServerStatus {
  running: boolean
  port: number
  /** All reachable base URLs (loopback, LAN IPs, tailnet https when served). */
  urls: string[]
  /** Best URL to show in the QR (tailnet https preferred), or null when off. */
  primaryUrl: string | null
  deviceCount: number
}

/** A phone that has paired. The raw token is never stored — only its hash. */
export interface PairedDevice {
  id: string
  name: string
  userAgent: string
  createdAt: number
  lastSeen: number
}

/** Payload encoded into the pairing QR (and shown as text). */
export interface PairQrPayload {
  /** The PWA base URL the phone opens. */
  url: string
  /** One-time pairing code. */
  code: string
  /** ms epoch when the code expires. */
  expiresAt: number
}

/** POST /api/pair request/response (HTTP, used by the PWA). */
export interface PairRequest {
  code: string
  deviceName?: string
  /** Access passcode — required only when the desktop has one set (2nd factor). */
  passcode?: string
}
export interface PairResponse {
  token: string
  deviceId: string
  serverName: string
}

/** Tailscale state, for the connect-phone wizard. */
export interface TailscaleStatus {
  installed: boolean
  running: boolean
  needsLogin: boolean
  /** MagicDNS name without the trailing dot, e.g. `pc.tailNNNN.ts.net`. */
  fqdn: string | null
  ipv4: string | null
  magicDnsEnabled: boolean
  /** True when our `tailscale serve` for the Agent port is active (tailnet-only HTTPS). */
  serving: boolean
  /** True when `tailscale funnel` exposes the Agent port on the public internet. */
  funnel: boolean
  error?: string
}

export interface ListeningPort {
  port: number
  pid: number
  process: string
  address: string
  /** Heuristic: likely a WSL-forwarded listener. */
  wsl: boolean
}

/** One attachable terminal session owned by the Agent. */
export interface RemoteSessionInfo {
  id: string
  title: string
  cwd: string
  shell: string
  busy: boolean
  alive: boolean
  createdAt: number
}

export interface RemoteCreateOptions {
  cwd?: string
  shell?: ShellKind
  /** Command auto-run once the shell is ready (e.g. 'claude'). */
  command?: string
  cols?: number
  rows?: number
  title?: string
}

/** WS frames: phone → Agent. Terminal bytes are base64 in `b64`. */
export type RemoteClientFrame =
  | { t: 'list' }
  | { t: 'attach'; id: string; cols: number; rows: number; since: number }
  | { t: 'input'; id: string; b64: string }
  | { t: 'resize'; id: string; cols: number; rows: number }
  | { t: 'ping' }

/** WS frames: Agent → phone. */
export type RemoteServerFrame =
  | { t: 'sessions'; sessions: RemoteSessionInfo[] }
  | { t: 'attached'; id: string; seq: number }
  | { t: 'data'; id: string; seq: number; b64: string }
  | { t: 'exit'; id: string; code: number }
  /** Scrollback gap: the requested `since` fell out of the ring on reconnect.
   *  The phone should reset its terminal before applying the replay that follows. */
  | { t: 'reset'; id: string }
  | { t: 'pong' }
  | { t: 'error'; message: string }

/* ── Notifications: task-complete alerts to phone and/or desktop ──── */

/** Where a "task complete" alert goes. `phone` = Web Push to paired phones. */
export type NotifyRoute = 'off' | 'phone' | 'desktop' | 'both'

export interface NotifyConfig {
  route: NotifyRoute
  /** Only alert for commands/tasks that ran at least this many seconds. */
  minDurationSec: number
}

export const DEFAULT_NOTIFY_CONFIG: NotifyConfig = { route: 'phone', minDurationSec: 20 }

/** Emitted by a pane when a real shell command finishes. */
export interface TaskCompletePayload {
  /** Pane/session label, e.g. "Terminal 2" or "Claude Code". */
  title: string
  exitCode: number
  durationMs: number
  /** Optional extra context (cwd, command…). */
  detail?: string
}

/* ── In-app auto-update (electron-updater) ────────────────────────── */

/**
 * Where the updater is in its lifecycle. `dev` = running unpackaged (updates
 * disabled); `error` carries a message; the rest map to electron-updater events.
 */
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'dev'

export interface UpdateStatusPayload {
  state: UpdateState
  /** Version offered by the feed (available/downloading/downloaded states). */
  version?: string
  /** Release notes (plain text/markdown), when the feed provides them. */
  notes?: string
  /** 0–100 download progress, present only while downloading. */
  percent?: number
  /** Human-readable error, present only in the `error` state. */
  error?: string
}

/** A browser Push API subscription (from PushSubscription.toJSON()). */
export interface WebPushSubscription {
  endpoint: string
  expirationTime?: number | null
  keys: { p256dh: string; auth: string }
}
