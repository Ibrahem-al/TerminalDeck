# TerminalDeck — Complete Feature & Technical Reference

**Version:** 0.2.0 · **Platform:** Windows 10/11 (x64) · **Type:** Electron desktop app + companion PWA

A chat-style terminal workspace for commanding parallel AI coding agents — fully local, fully private, with a phone companion (**RemoteDeck**) that mirrors and controls your desktop terminals over Tailscale.

> This is the deep technical reference: every feature, the full tech stack, the architecture, the IPC surface, the data model, security, and the build pipeline. For marketing/website copy, see `PRODUCT.md`.

---

## Table of contents

1. [Tech stack](#1-tech-stack)
2. [High-level architecture](#2-high-level-architecture)
3. [Source layout](#3-source-layout)
4. [Feature catalog](#4-feature-catalog)
   - [4.1 Terminals](#41-terminals)
   - [4.2 AI agents & Claude Code](#42-ai-agents--claude-code)
   - [4.3 Workspace, tabs & layouts](#43-workspace-tabs--layouts)
   - [4.4 Pane management](#44-pane-management)
   - [4.5 Code editor (Monaco)](#45-code-editor-monaco)
   - [4.6 File browser](#46-file-browser)
   - [4.7 Kanban board](#47-kanban-board)
   - [4.8 Projects](#48-projects)
   - [4.9 Themes & design tokens](#49-themes--design-tokens)
   - [4.10 Session restore](#410-session-restore)
   - [4.11 Settings](#411-settings)
   - [4.12 RemoteDeck (phone control)](#412-remotedeck-phone-control)
   - [4.13 Notifications](#413-notifications)
5. [Shell integration (OSC 133)](#5-shell-integration-osc-133)
6. [IPC API surface](#6-ipc-api-surface)
7. [Data & persistence model](#7-data--persistence-model)
8. [RemoteDeck protocol & internals](#8-remotedeck-protocol--internals)
9. [Security model](#9-security-model)
10. [Build & packaging](#10-build--packaging)
11. [Development workflow](#11-development-workflow)
12. [Requirements](#12-requirements)
13. [Keyboard shortcuts](#13-keyboard-shortcuts)
14. [Limitations & roadmap](#14-limitations--roadmap)

---

## 1. Tech stack

### Runtime & build
| Layer | Technology | Version | Role |
|---|---|---|---|
| App shell | **Electron** | ^42.4.0 | Desktop runtime (main + renderer processes) |
| Language | **TypeScript** | ^6.0.3 | Strict typing across all processes |
| Build orchestrator | **electron-vite** | ^5.0.0 | Builds main (CJS) / preload / renderer |
| Bundler | **Vite** | ^7.3.5 | Renderer + the separate PWA build |
| Packager | **electron-builder** | ^26.15.2 | Windows NSIS installer |

### UI & state
| Technology | Version | Role |
|---|---|---|
| **React** + react-dom | ^18.3.1 | Renderer UI |
| **Tailwind CSS** (`@tailwindcss/vite`) | ^4.3.0 | Styling via design tokens |
| **Zustand** | ^5.0.14 | Renderer state stores |
| **lucide-react** | ^1.17.0 | Icon set |
| **react-markdown** + **remark-gfm** | ^10.1.0 / ^4.0.1 | Agent chat & kanban markdown |
| **qrcode.react** | ^4.2.0 | Pairing QR in the desktop wizard |
| Fonts | Schibsted Grotesk (UI), IBM Plex Mono (mono) | `@fontsource*` |

### Terminal & editor
| Technology | Version | Role |
|---|---|---|
| **node-pty** | ^1.1.0 | Real PTYs via Windows ConPTY (ships prebuilt N-API binaries) |
| **@xterm/xterm** | ^6.0.0 | Terminal rendering |
| **@xterm/addon-fit** | ^0.11.0 | Fit terminal to container |
| **@xterm/addon-webgl** | ^0.19.0 | GPU-accelerated rendering |
| **@xterm/addon-search** | ^0.16.0 | In-buffer search |
| **monaco-editor** | ^0.55.1 | Inline code editor (VS Code engine) |

### Persistence, networking, notifications
| Technology | Version | Role |
|---|---|---|
| **electron-store** | ^8.2.0 | JSON persistence (settings, projects, kanban, session, devices) |
| Windows **DPAPI** (`safeStorage`) | built-in | Encrypts project env vars at rest |
| **ws** | ^8.18.0 | RemoteDeck WebSocket server (main process) |
| Node `http` / `net` | built-in | RemoteDeck HTTP server + upgrade handling |
| **web-push** | ^3.6.7 | VAPID Web Push to phones |
| **Tailscale** (external) | — | Encrypted WireGuard transport for RemoteDeck |

**Native modules:** only `node-pty` (prebuilt N-API binaries; `npmRebuild: false`, `asarUnpack`ed). Everything else is pure JS, so no C++ toolchain is required to build.

---

## 2. High-level architecture

TerminalDeck is an Electron app whose **main process doubles as a secure server** for the phone.

```
                                  ELECTRON APP (Windows host)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  MAIN PROCESS (Node.js, CommonJS)                                           │
 │   • PtyManager        — node-pty/ConPTY sessions + scrollback ring + fan-out│
 │   • AgentSession      — Claude Code via stream-json                         │
 │   • fsService         — file ops + chokidar-style watchers                  │
 │   • persist (electron-store) — settings/projects/kanban/session/devices     │
 │   • RemoteDeck Agent  — http + ws server (the phone API)                    │
 │        DesktopBackend → mirrors PtyManager sessions to phones               │
 │   • IPC handlers (ipcMain.handle / .on)                                     │
 └───────────────▲───────────────────────────────────────────▲───────────────┘
                 │ contextBridge (window.quarterdeck)         │ HTTPS + WSS (Tailscale)
 ┌───────────────┴───────────────┐                  ┌─────────┴────────────────┐
 │  PRELOAD (sandboxed bridge)   │                  │  PWA PHONE CLIENT         │
 └───────────────▲───────────────┘                  │  (src/remote → out/remote)│
 ┌───────────────┴───────────────┐                  │  xterm.js + WS transport  │
 │  RENDERER (React + Zustand)   │                  │  installable, push-enabled│
 │  terminals · editor · files · │                  └───────────────────────────┘
 │  kanban · projects · settings │
 └───────────────────────────────┘
```

**Three TypeScript build targets** (+ one for the PWA):
- **main** — CommonJS, `externalizeDepsPlugin()` (deps `require`d at runtime), entry `src/main/index.ts`.
- **preload** — sandboxed `contextBridge`, exposes the typed `window.quarterdeck` API.
- **renderer** — React app served by Vite (dev) / `out/renderer` (prod).
- **PWA** — a standalone Vite build (`vite.remote.config.ts`) → `out/remote`, served at runtime by the Agent.

**Key data flows:**
- Renderer → main via typed IPC (`window.quarterdeck.*`).
- PTY output: main `PtyManager` → IPC `pty:data` → renderer xterm **and** (fan-out) → Agent → phone WebSocket.
- Phone input → Agent WS → `PtyManager.write` → same PTY (desktop + phone stay in sync).

---

## 3. Source layout

```
app/
├─ electron.vite.config.ts      # main/preload/renderer build config
├─ vite.remote.config.ts        # standalone PWA build → out/remote
├─ electron-builder.yml         # NSIS installer config
├─ build/
│  ├─ icon.ico / icon.png       # app icon (brass ❯_)
│  └─ installer.nsh             # NSIS customInit: "remove old version?" prompt
├─ resources/shell-integration/ # OSC 133 profiles (integration.ps1, integration.bash)
├─ scripts/                     # make-icon.ps1, pty/integration/agent self-tests
├─ src/
│  ├─ shared/types.ts           # IPC channel names + all shared types (single source of truth)
│  ├─ main/
│  │  ├─ index.ts               # app lifecycle, window, IPC registration, Agent wiring
│  │  ├─ pty/                   # PtyManager, shells (detection), shellIntegration (OSC 133 launch)
│  │  ├─ agent/AgentSession.ts  # Claude Code stream-json session
│  │  ├─ fs/fsService.ts        # file service + watchers
│  │  ├─ net/                   # auth (token hashing/verify), allowlist (path confinement)
│  │  ├─ preview/listPorts.ts   # listening-port enumeration
│  │  ├─ remote/                # RemoteServer, DesktopBackend, backend, sessionRegistry,
│  │  │                         #   staticServer, lan, tailscale, pairing, push, notify
│  │  ├─ store/persist.ts       # electron-store schema + accessors (+ DPAPI encryption)
│  │  └─ ipc/                   # pty, agent, fs, projects, remote, notify, sessions handlers
│  ├─ preload/index.ts(.d.ts)   # window.quarterdeck contextBridge surface
│  ├─ renderer/src/
│  │  ├─ App.tsx                # shell, shortcuts, session-sync reporter
│  │  ├─ components/            # terminal/ agent/ editor/ sidebar/ kanban/ projects/
│  │  │                         #   workspace/ chrome/ remote/ settings/ common/ toast/
│  │  ├─ store/                # zustand: workspace, projects, settings, theme, kanban,
│  │  │                         #   editor, explorer, paneCwd, ptySessions, toasts
│  │  ├─ session.ts            # session serialize/restore + autosave
│  │  └─ styles/               # tokens.css, themes.ts, global.css
│  └─ remote/                   # the PWA (phone client)
│     ├─ index.html
│     ├─ public/               # manifest.webmanifest, sw.js, offline.html, icons/
│     └─ src/                  # main.ts, net/(Transport,api), terminal/(TerminalView,KeyBar,keymap),
│                              #   pwa/(register-sw,push), ui/styles.css
```

---

## 4. Feature catalog

### 4.1 Terminals

Real pseudo-terminals — not emulated shells.

- **Engine:** `node-pty` (Windows ConPTY) for the PTY; `@xterm/xterm` v6 for rendering; **WebGL addon** for GPU-accelerated, flicker-free output; **fit addon** to size to the pane; **search addon** for buffer search.
- **Shells (auto-detected):** Windows PowerShell, PowerShell 7 (`pwsh`), Command Prompt (`cmd.exe`), Git Bash. Detection in `src/main/pty/shells.ts` probes well-known install paths.
- **Full fidelity:** `vim`, `claude`, interactive prompts, progress bars, alt-screen apps, full 16-color + 256-color ANSI (each theme defines its own ANSI palette).
- **Buffer search** (`Ctrl+F`) with match count + navigation.
- **Right-click context menu:** copy, paste, clear.
- **Configurable copy/paste:** independent `Ctrl+C`/`Ctrl+V` and `Ctrl+Shift+C`/`Ctrl+Shift+V` behaviors; "replace selection on type"; `Ctrl+C` copies a selection when present, otherwise sends SIGINT.
- **Click-to-move-cursor:** off / `Alt+click` / plain click — sends arrow-key sequences to reposition the cursor at the prompt (and 2D arrows in full-screen apps, Alt-gated).
- **Drag-a-file-in:** dropping a file inserts its path at the prompt.
- **Live working directory** in the pane header (via OSC 9;9 / OSC 7).
- **Configurable** font size, scrollback (incl. an effectively-infinite sentinel), cursor style/blink, and bell.

### 4.2 AI agents & Claude Code

- **Claude Code as a real CLI:** launch `claude` in any terminal pane via `Ctrl+Enter`, or have a pane **auto-run** a command (e.g. `claude`) the instant its shell is ready (`autoRun`).
- **Agent Chat mode:** a chat-style pane (`AgentChatPane`) that drives Claude Code over its **`stream-json` protocol** (`src/main/agent/AgentSession.ts`) rather than scraping the TUI — surfacing streaming markdown, tool-activity cards, a stop/interrupt button, permission prompts, and per-session cost. Event model (`AgentEvent`): `init`, `text-delta`, `assistant-message` (text/tool_use blocks), `tool-result`, `permission-request`, `result` (cost + duration), `stderr`, `exit`.
- **Parallel by design:** run many agent/terminal panes across tabs, each in its own directory + project context.

### 4.3 Workspace, tabs & layouts

- **Panes:** 1–16 per workspace tab (`MAX_PANES_PER_TAB = 16`), three kinds: `terminal`, `agent`, `editor`.
- **Layout engine** (`components/workspace/layout.ts`): a binary split tree (`split`/`pane` nodes) with row/column directions and ratios; geometry is computed to absolute percentage rects + draggable dividers.
- **Templates:** Single, Split, Quad, Six, Eight.
- **Dividers:** drag to resize, double-click to reset to 50/50, arrow keys to nudge (with `MIN_RATIO`/`MAX_RATIO` clamps).
- **Workspace tabs ("decks"):** create (`Ctrl+T` → template picker), close (`Ctrl+W`), switch (`Ctrl+1–9`), reorder by drag, recolor (cycles a palette), rename (double-click). Each tab can carry a `projectId`.
- **Tab rendering:** all tabs are mounted; inactive ones are `invisible/opacity-0` so sessions stay alive when switching.

### 4.4 Pane management

- **Inline rename** of any pane.
- **Custom badges + HSV color wheel:** a `BadgeEditor` popover with quick presets (Claude Code, Dev Server, Git, Test Runner, REPL), a name field, and a full **color wheel** (`components/common/ColorWheel.tsx` — hue ring via conic-gradient, saturation via radial white, a brightness slider, and a hex input; HSV⇄RGB⇄hex math built in), live preview, and apply/remove.
- **Pin** a pane (`togglePin`) to protect it from close and block the tab from closing while pinned.
- **Drag the pane header** to swap/rearrange panes within a tab (`swapPanes`) — sessions survive.
- **Split menu (the `⌄` chevron):** choose a **direction** (Right = `row` / Down = `column`) and **what opens** (any detected shell, or the editor). Quick split buttons (right/down → default terminal) are always present.
- Quick header actions: badge, pin, split-right, split-down, split-menu, close.

### 4.5 Code editor (Monaco)

- **Monaco** (`monaco-editor` ^0.55) embedded as a pane kind.
- **Multi-tab editing** within an editor pane, **dirty indicators**, **format-on-save** (optional), **external-change reload** (file watcher driven).
- **Quick Open** (`Ctrl+P`) fuzzy file search; **find & replace** (`Ctrl+H`); configurable font size, tab size, word wrap, minimap.
- Per-pane editor state (`store/editor.ts`): open files + active file, persisted in the session.

### 4.6 File browser

- **Live-watching tree** (`fsService` watchers) docked left or right (`Settings → General → sidebar side`), hideable (`Ctrl+B`).
- **Operations:** inline create file/folder, rename, **Recycle-Bin delete** (recoverable), reveal in Explorer.
- **Search files** (`Ctrl+Shift+F`); **toggle hidden files** (`Ctrl+Shift+.`); **focus tree** (`Ctrl+Shift+E`).
- **Import:** drag/drop external files into a folder, paste OS-clipboard files/images, or **download a dragged http(s) URL** into a folder (`ImportResult` reports per-item success/failure).
- **Drag a path into a terminal** to insert it.
- **Default directory** (`Settings → General`) seeds new terminals and the folder picker.

### 4.7 Kanban board

- **Global board** (`Ctrl+Shift+K`), five columns: Backlog → To Do → In Progress → In Review → Done.
- **Cards:** markdown description, priority (low/medium/high/critical), colored tags, and an optional **target pane**.
- **Drag & drop** between columns; **send-a-card-to-a-pane** as a terminal command or an agent prompt.
- **Exit-0 auto-review:** when a command finishes (exit 0) in a pane, the board can auto-offer to move the related card to *In Review* (driven by the OSC 133 exit hook).

### 4.8 Projects

A project (`Project` type) captures a reusable workspace:
- `rootDir`, `defaultShell`, `defaultTemplate`, `color`, `description`.
- **Encrypted env vars** (`ProjectEnvVar[]`) — encrypted at rest with **Windows DPAPI** via `safeStorage` (`store/persist.ts`); decrypted only in transit/memory; never serialized to the session file.
- **Auto-start commands** (`AutoStartCommand[]`): label, command, 1-based target pane, delay (ms), enabled — run in order when the project opens.
- **Per-tab projects:** opening a project creates a tab bound to it (named/colored after it); switching tabs syncs the active project, the new-terminal spawn directory/env, and the sidebar root (`projects.syncTabContext`).
- **Switcher:** click the project name in the top bar, or `Ctrl+K` — recent-first, searchable; `Ctrl+Shift+N` for a new project.

### 4.9 Themes & design tokens

- **9 original themes** (`styles/themes.ts`), each a full `ThemeSpec` with three surface depths, four ink levels, an accent, signal colors, edges, terminal colors, and a **complete 16-entry ANSI palette** (light themes use re-derived dark ANSI colors, never inversions):
  `deepwater` (flagship), `midnight-slate`, `ember`, `obsidian-sharp`, `verdigris`, `abyssal` (dark) · `ghost`, `daylight`, `parchment` (light).
- **Design tokens** (`styles/tokens.css`) are CSS custom properties consumed by Tailwind v4's `@theme inline`; switching a theme rewrites the token map live (hover-to-preview in the gallery).
- **Typography:** Schibsted Grotesk (UI) + IBM Plex Mono (terminal/code), bundled via `@fontsource`.

### 4.10 Session restore

- `session.ts` serializes tabs, panes, layouts/sizes, active tab, active project, sidebar root, and open editor files (debounced autosave + on `beforeunload`).
- On launch (`Settings → startup = restore`), it rehydrates everything; shells respawn fresh in their saved working directories (terminal scrollback itself is not restorable). **Env vars are re-derived from the encrypted project store**, never stored in the session file.
- **Only the primary window** restores and persists the session (see [§4.14](#414-multiple-windows)); extra windows are ephemeral and never touch the session store.

### 4.11 Settings

Live-applying panel (`store/settings.ts`, `DEFAULT_SETTINGS`):
- **General:** default shell, default template, startup (restore/empty), theme, default directory, sidebar side, keep-awake-while-busy, confirm-before-closing.
- **Editor:** font size, tab size, word wrap, minimap, format-on-save.
- **Terminal:** font size, scrollback, cursor style/blink, bell, the copy/paste matrix, click-to-cursor mode, replace-selection-on-type.
- **Themes:** the gallery with hover-to-preview.

### 4.12 RemoteDeck (phone control)

The headline feature — see [§8](#8-remotedeck-protocol--internals) for protocol internals.

- **The Agent is the Electron main process:** an embedded `http.Server` + `ws` `WebSocketServer` (`RemoteServer`), default **off**, started from the wizard or via `autoStart`. Default port **8787**.
- **Mirrors the desktop's live terminals:** the renderer reports its open terminal panes (`SessionsReport` → `sessionRegistry`); `DesktopBackend` lists them and attaches via `PtyManager`'s scrollback ring + multi-subscriber fan-out. The phone sees/controls the **same** PTYs the desktop shows; opening/closing a terminal on the desktop pushes a live `sessions` update to phones.
- **Installable PWA** (`src/remote`, vanilla TS + xterm) served from `out/remote`: home-screen install, service worker, offline shell.
- **Mobile terminal:** xterm + fit, a **key bar** (`Esc`, `Tab`, arrows, `^C/^D/^Z/^L/^R`, `PgUp/PgDn`, `Del`, `Home/End`) with exact byte sequences, paste-from-clipboard, auto-reconnect (exponential backoff + heartbeat) and **scrollback replay** via per-session `seq`.
- **New session from the phone** opens a real desktop pane (`RemoteOpenPane` → `openInActiveTab`), keeping both in sync. **End** kills that PTY.
- **Connect-phone wizard:** detects Tailscale, runs `up`/`serve`, shows a pairing QR + code, lists/revokes paired devices, edits allowed roots, and routes notifications.
- **Also exposed:** listening-ports view (`/api/ports`), allow-list-confined file ops, and preview foundations.

### 4.13 Notifications

- **Trigger:** a real shell command completes (OSC 133 `133;D` with exit code), tracked with **duration** (in `shellSignals.ts`); the renderer reports it via `notify:task-complete`.
- **Routing** (`NotifyConfig`, default `phone`, `minDurationSec = 20`): **Phone only** / Desktop only / Both / Off, with a duration threshold so trivial commands never alert.
- **Phone = real Web Push:** a VAPID keypair is generated once (`remote/push.ts`); the phone subscribes via its browser push service and the service worker shows the notification — even when the PWA is **closed/backgrounded** and on a different network. The Agent POSTs encrypted messages to the push endpoint over the internet (prunes 404/410 endpoints).
- **Desktop = native** OS notification via Electron `Notification` (with `setAppUserModelId` so Windows displays it).

### 4.14 Multiple windows

- **Open independent windows** from the title-bar button or **Ctrl+Shift+M** (`WindowNew` → `createWindow(false)`). Each window is a full, independent workspace (its own tabs, panes, sidebar, editors).
- **Single session owner:** only the **primary** window (the one created at launch) restores and persists the saved session. Extra windows are ephemeral scratch workspaces — they start fresh and never write the session store, so they can't duplicate or clobber it. Role is passed to the sandboxed preload via `additionalArguments` (`--qd-window-role=…`) and read from `process.argv` as `window.isPrimary`.
- **RemoteDeck stays correct across windows:** `sessionRegistry` merges each window's reported panes keyed by `webContents.id` (deduped by session id), and drops a window's slice on close — so a phone sees every window's terminals, not just the last one to report.
- **Close confirmation:** every close path (✕ button, Alt+F4, taskbar, app quit) funnels through the main-process `close` handler, which asks the renderer first (`WindowCloseRequest`). If the window has live terminals/agents or unsaved editor files (and `confirmOnClose` is on), an in-app dialog warns before killing them; empty windows close straight through. Confirming replies `WindowConfirmClose` → the window is allowed to close.

### 4.15 In-app updates

- **electron-updater** (`main/updater/updater.ts`) reads the GitHub Releases feed configured under `publish:` in `electron-builder.yml` (`Ibrahem-al/TerminalDeck`); electron-builder bakes `app-update.yml` into the package so no runtime config is needed.
- **Flow:** a silent check runs ~4s after launch and on demand from **Settings → Updates**. `autoDownload` is off (no surprise data use) and `autoInstallOnAppQuit` is on. The user downloads on click, watches progress, then **Restart & install** (`quitAndInstall`). A toast surfaces a ready update from any screen.
- **State** is broadcast to every window (`UpdateStatus`) and mirrored in `store/updater.ts`. Unpackaged dev builds report a stable `dev` state instead of erroring.
- **Preserves data:** the NSIS in-place update keeps settings, projects, and paired phones. Builds are unsigned, so the updater verifies the SHA-512 from `latest.yml` rather than a code signature.

---

## 5. Shell integration (OSC 133)

Bundled profiles (`resources/shell-integration/integration.ps1` and `integration.bash`) emit FinalTerm **OSC 133** sequences so the app can segment the stream into commands with real exit codes — invisibly:

| Sequence | Meaning |
|---|---|
| `OSC 133;A` | prompt start (→ "shell ready" on first prompt; drives auto-start timing) |
| `OSC 133;B` | input start (bounds the editable prompt region) |
| `OSC 133;C` | command started executing (starts the duration timer) |
| `OSC 133;D;<exit>` | command finished + exit code (→ kanban auto-review + completion notifications) |
| `OSC 9;9;<path>` | current directory (ConEmu style) → pane-header cwd |
| `OSC 7 file://…` | current directory as a URL (user shell configs) |

Parsed in the renderer by `components/terminal/shellSignals.ts`. PowerShell sets the integrated prompt (`-NoExit -File`); a custom profile prompt (oh-my-posh, etc.) is overridden in integrated shells. `cmd.exe` has no integration → a short startup delay and no command-completion detection (hence no completion notifications for cmd).

---

## 6. IPC API surface

All IPC channel names live in `src/shared/types.ts` (`IPC` const) — the single source of truth — and are exposed to the renderer as namespaces on `window.quarterdeck` (typed via `QuarterdeckApi`). Namespaces:

- **`window`** — minimize/maximize/close + maximized-change events.
- **`pty`** — `listShells`, `create`, `write`, `resize`, `kill`, `onData`, `onExit`.
- **`fs`** — `pickRoot`, `readDir`, create/rename/copy/move/delete, `search`, `reveal`, `watch`/`unwatch`, `readFile`/`writeFile`, `importPaths`/`writeBlob`/`downloadUrl`/`pasteClipboard`, file-watch + change events.
- **`projects`** — `list`, `save`, `delete`.
- **`kanban`** — `load`, `save`.
- **`settings`** — `load`, `save`. **`app`** — `version`. **`session`** — `load`, `save`.
- **`agent`** — `create`, `send`, `interrupt`, `respondPermission`, `setPermissionMode`, `kill`, `onEvent`.
- **`remote`** — `status`, `start`, `stop`, `getConfig`, `setConfig`, `newPairing`, `listDevices`, `revokeDevice`, `tailscale`, `tailscaleUp`, `tailscaleServe`, `ports`, `onStatusChanged`.
- **`notify`** — `getConfig`, `setConfig`, `taskComplete`.
- **`sessions`** — `report` (renderer→main session list), `onOpenPane` (main→renderer "open a pane").

---

## 7. Data & persistence model

`electron-store` (JSON), **separate store files for dev vs packaged** so dev testing never bleeds into an installed copy:
- packaged → `%APPDATA%\quarterdeck\quarterdeck.json`
- dev → `%APPDATA%\quarterdeck\quarterdeck-dev.json`

Schema (`store/persist.ts`):

| Key | Contents |
|---|---|
| `projects` | Projects; env var **values encrypted via DPAPI** (`safeStorage`), stored as base64 `valueEnc` |
| `kanban` | Kanban cards |
| `settings` | `AppSettings` (deep-merged with defaults so new keys never read undefined) |
| `session` | Opaque renderer session snapshot (no secrets; env vars excluded) |
| `devices` | Paired phones — `id`, `name`, `userAgent`, **`tokenHash` (SHA-256 only)**, `createdAt`, `lastSeen` |
| `allowedRoots` | Folders the phone may browse / open sessions in (default: home) |
| `remote` | `{ autoStart, port }` |
| `notify` | `{ route, minDurationSec }` |
| `vapid` | Web Push VAPID keypair (generated once) |
| `pushSubs` | Per-device Web Push subscriptions |

Nothing is sent to any server; there are no accounts and no telemetry.

---

## 8. RemoteDeck protocol & internals

**Session backend abstraction** (`remote/backend.ts`): the transport depends only on a `SessionBackend` (`list/subscribe/write/resize/end/create/disposeAll`). v1 uses **`DesktopBackend`**, which mirrors the desktop's panes; this can later be swapped (e.g. WSL+tmux) without touching transport/auth/PWA.

**PtyManager fan-out:** each PTY keeps a 256 KB **scrollback ring** with a monotonic byte `seq`; `subscribe(id, subId, since, sub)` replays buffered output after `since`, then streams live to any number of phone subscribers — independent of the renderer's own data path (zero change to desktop terminal behavior).

**HTTP routes** (all except `/api/pair` require a Bearer device token):
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/pair` | exchange a one-time code for a device token |
| GET | `/api/sessions` | list the desktop's open terminals |
| POST | `/api/sessions` | open a new desktop pane (201 with session, or 202) |
| DELETE | `/api/sessions/:id` | kill that PTY |
| GET | `/api/ports` | listening ports + owning process |
| GET | `/api/push/key` | VAPID public key |
| POST | `/api/push/{subscribe,unsubscribe}` | manage this device's push subscription |
| static | `/*` | the PWA shell (SPA fallback) |

**WS terminal protocol** (`/ws`): the token rides as a `Sec-WebSocket-Protocol` subprotocol (`['terminaldeck.v1', 'bearer.<token>']`), validated at upgrade; only `terminaldeck.v1` is echoed back (the bearer one is never returned/logged). JSON control frames; terminal payloads base64; output frames carry a monotonic `seq`:
- client → server: `list` · `attach {id,cols,rows,since}` · `input {id,b64}` · `resize {id,cols,rows}` · `ping`
- server → client: `sessions` · `attached {id,seq}` · `data {id,seq,b64}` · `exit {id,code}` · `pong` · `error`

**Pairing & auth:** a single short-lived (5-min, single-use, rate-limited) **Crockford-base32 code** (`remote/pairing.ts`); the QR encodes `{url}/?c={code}`. `/api/pair` mints a 256-bit base64url token, returns it once, and stores **only its SHA-256**. Verification hashes the presented token and `timingSafeEqual`s against **every** device row (constant-time). Revoking a device drops its sockets + push subscription.

**Transport (Tailscale):** `remote/tailscale.ts` shells out to `tailscale.exe` — `status --json` (detect state, MagicDNS, fqdn), `up` (connect), `serve --bg <port>` (publish `https://<fqdn>` → `http://127.0.0.1:<port>`, tailnet-private, **not** funnel), `serve reset` (tear down). The wizard surfaces the CLI's own errors (e.g. "Serve is not enabled… visit <link>") as clickable links, and verifies `serve status` actually contains the port before reporting success.

**Build/serve:** the PWA builds to `out/remote`; the main process resolves it at `join(__dirname, '../remote')` (works in dev on disk and inside `app.asar` when packaged) and serves it with `staticServer.ts`.

---

## 9. Security model

- **Local-only, no cloud/telemetry/accounts.** All data in `%APPDATA%`.
- **Secrets at rest:** project env vars encrypted with **Windows DPAPI** (`safeStorage`); excluded from the session file.
- **Phone auth:** 256-bit device tokens; **only SHA-256 hashes stored**; constant-time comparison over all rows; per-device revocation (kills sockets + push sub). One-time, 5-minute, rate-limited pairing codes.
- **No public exposure:** RemoteDeck uses `tailscale serve` (tailnet-private), never `funnel`; no port forwarding, no public URL; Tailscale ACLs are a second layer.
- **Filesystem allow-list:** phone file ops and new-session cwd are confined to configured roots with realpath + traversal/symlink-escape protection (`net/allowlist.ts`).
- **WS token in subprotocol** (never a query string, so it isn't logged); validated before the socket opens.

---

## 10. Build & packaging

- **`electron.vite.config.ts`** builds main (CJS, `externalizeDepsPlugin`), preload, and renderer (React + Tailwind v4 + path aliases `@renderer`/`@main`/`@shared`).
- **`vite.remote.config.ts`** builds the PWA (`root: src/remote`, `base: './'`, `publicDir: src/remote/public`) → `out/remote`.
- **Scripts:** `dev` (electron-vite dev), `build` (`electron-vite build && build:remote`), `build:remote` (the PWA), `dist` (`electron-vite build && build:remote && electron-builder --win`), `release` (`… && electron-builder --win --publish always`), `typecheck` (strict, main + web).
- **`electron-builder.yml`** (NSIS): `appId app.terminaldeck.desktop`, `productName TerminalDeck`, custom `build/icon.ico`, `oneClick:false`, `perMachine:false`, `allowToChangeInstallationDirectory`, desktop shortcut, `artifactName: ${productName}-Setup.${ext}` (version-less → stable download link), and `publish: github` (`Ibrahem-al/TerminalDeck`) which feeds both the website download and the in-app updater. `node-pty` is `asarUnpack`ed (native binaries can't load from inside asar); `npmRebuild:false` (prebuilt N-API binaries).
- **`build/installer.nsh`** — a `customInit` NSIS hook that detects a previous install (HKCU/HKLM) and prompts **"remove the old version?"** before installing (app data is preserved).
- The app icon is generated by `scripts/make-icon.ps1` (.NET System.Drawing → multi-size DIB `.ico`).
- **Output:** `dist/TerminalDeck-Setup.exe` (~120 MB, version-less for a stable download link) plus `latest.yml` + `.blockmap` for the updater. Currently **unsigned** (SmartScreen warns on first run → *More info → Run anyway*); the updater verifies the SHA-512 from `latest.yml`, so in-place updates work unsigned.
- **`npm run release`** (with `GH_TOKEN`) builds and publishes the installer + `latest.yml` to the GitHub Release. Push the `v<x.y.z>` tag **first** (`npm version …` then `git push --follow-tags`) — with `releaseType: release`, GitHub 422s a published release whose tag doesn't exist yet. See [§4.15](#415-in-app-updates).

---

## 11. Development workflow

```sh
npm install            # no native build step (node-pty ships prebuilt)
npm run dev            # renderer hot-reloads; main restarts on change
npm run build:remote   # (re)build the PWA into out/remote
npm run typecheck      # strict TS — main (node) + renderer/PWA (web)
npm run build          # bundle everything to out/
npm run dist           # + package the Windows installer into dist/
```

Self-tests (`scripts/`): `pty-selftest.js` (PTY round-trip inside Electron), `integration-selftest.js` (OSC 133), `probe-agent.js` (Claude Code).

---

## 12. Requirements

- **Windows 10/11, 64-bit.**
- **Claude Code** on PATH — only for AI agent features (everything else works without it).
- **No build tools** (node-pty prebuilt).
- **RemoteDeck:** Tailscale on the PC and phone, same account; the PC must stay awake; the tailnet must have **Serve** and **HTTPS Certificates** enabled (one-time). iOS Web Push requires installing the PWA to the home screen (iOS 16.4+).

---

## 13. Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+T` / `Ctrl+W` | New / close workspace tab |
| `Ctrl+Shift+M` | New app window |
| `Ctrl+1`–`9` | Switch workspace tab |
| `Ctrl+D` / `Ctrl+Shift+D` | Split pane right / down |
| `Ctrl+Enter` | Launch Claude Code in active pane |
| `Ctrl+P` | Quick Open file search |
| `Ctrl+K` / `Ctrl+Shift+N` | Project switcher / new project |
| `Ctrl+F` / `Ctrl+H` | Search terminal output / find & replace in editor |
| `Ctrl+S` | Save file |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+E` / `Ctrl+Shift+F` | Focus file browser / search files |
| `Ctrl+Shift+.` | Toggle hidden files |
| `Ctrl+Shift+K` | Task board |
| `Ctrl+,` | Settings |

---

## 14. Limitations & roadmap

**Current limitations (honest):**
- Windows-only (PowerShell/ConPTY/DPAPI-centric).
- Installer is **unsigned** (SmartScreen warning); the in-app updater still works (SHA-512-verified), but first install shows the SmartScreen prompt.
- `cmd.exe` has no shell integration → no command-completion detection/notifications there.
- Terminal scrollback isn't restored across restarts (shells respawn clean in saved dirs).
- RemoteDeck requires the PC awake + Tailscale Serve/HTTPS enabled; iOS push needs home-screen install.
- The completion-notification trigger watches desktop panes (not yet phone-initiated RemoteDeck-only sessions).

**Roadmap:**
- Code-signing the installer.
- RemoteDeck live **preview proxy** (load a local dev server on the phone over the tailnet).
- **WSL + tmux** session discovery (pick up agent sessions started outside the app; survive app restarts).
- Optional macOS/Linux support; update channels (beta/stable).

---

*TerminalDeck v0.2.1 — fully local, fully private, Windows-first. Command your fleet.*
