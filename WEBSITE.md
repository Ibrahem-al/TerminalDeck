# TerminalDeck — The Complete Reference (Website Source of Truth)

> **Command a fleet of AI coding agents from one beautiful, private terminal workspace — and check on them from your phone, anywhere.**

**Version:** 0.2.0 · **Platform:** Windows 10/11 (64-bit) · **Type:** Electron desktop app + companion phone PWA (RemoteDeck)

This is the single, consolidated document for everything about TerminalDeck — positioning, every feature, the architecture and internals, security, setup, and ready-to-lift website copy. It merges the product/marketing guide and the technical reference into one file so it can drive the marketing site, a docs site, an app-store listing, or a pitch.

> The **quarterdeck** is the raised deck of a ship from which the captain commands. TerminalDeck is your command deck for AI-driven development.

---

## Table of contents

**Part I — Product & positioning**
1. [One-liner & elevator pitches](#1-one-liner--elevator-pitches)
2. [What is TerminalDeck?](#2-what-is-terminaldeck)
3. [Who it's for (personas)](#3-who-its-for-personas)
4. [Why it's different (value propositions)](#4-why-its-different-value-propositions)
5. [Use cases & workflows](#5-use-cases--workflows)
6. [Comparison](#6-comparison)

**Part II — Complete feature catalog**
7. [Feature catalog](#7-feature-catalog) — terminals · agents · workspace · panes · editor · files · kanban · projects · themes · session restore · settings · RemoteDeck · notifications · shell integration

**Part III — Technical reference**
8. [Tech stack](#8-tech-stack)
9. [Architecture](#9-architecture)
10. [Source layout](#10-source-layout)
11. [IPC API surface](#11-ipc-api-surface)
12. [Data & persistence model](#12-data--persistence-model)
13. [RemoteDeck protocol & internals](#13-remotedeck-protocol--internals)
14. [Shell integration (OSC 133)](#14-shell-integration-osc-133)
15. [Security model](#15-security-model)
16. [Build, packaging & development](#16-build-packaging--development)

**Part IV — Using it**
17. [Requirements](#17-requirements)
18. [Installation](#18-installation)
19. [RemoteDeck setup guide (Tailscale)](#19-remotedeck-setup-guide-tailscale)
20. [Keyboard shortcuts](#20-keyboard-shortcuts)
21. [FAQ](#21-faq)
22. [Roadmap & honest notes](#22-roadmap--honest-notes)

**Part V — Website build kit**
23. [Suggested website structure & copy](#23-suggested-website-structure--copy)
24. [Taglines & microcopy bank](#24-taglines--microcopy-bank)
25. [Glossary](#25-glossary)

---

# Part I — Product & positioning

## 1. One-liner & elevator pitches

**One-liner (hero):**
> Command a fleet of AI coding agents from one beautiful, private terminal workspace — and check on them from your phone, anywhere.

**Alternate taglines (pick per context):**
- "The command deck for AI-driven development."
- "Run terminals, AI agents, an editor, and a task board in one Windows-native workspace — then control it from your pocket."
- "Your whole dev cockpit: real terminals, Claude Code, code editor, kanban, projects — local, private, and phone-reachable over an encrypted mesh."
- "Parallel AI agents, real PTYs, zero cloud. Plus a phone that mirrors your desktop terminals from anywhere."

**30-second pitch:**
> TerminalDeck is a desktop workspace for developers who run AI coding agents like Claude Code. Instead of juggling terminal tabs, it gives you a resizable multi-pane grid where you run real terminals, AI agents, and an inline code editor side by side — with a file browser, a kanban board, and per-project setups built in. Everything stays on your machine: no cloud, no telemetry, secrets encrypted at rest. And because long AI tasks run unattended, TerminalDeck includes **RemoteDeck**: an installable phone app that mirrors and controls your *actual* open desktop terminals over Tailscale — from any network — and pushes a notification to your phone the moment a task finishes.

---

## 2. What is TerminalDeck?

TerminalDeck is a **Windows-first desktop application** (Electron + React) that reimagines the terminal as a **command deck for parallel AI agents**. It's built for the new way developers work: kicking off multiple long-running AI coding sessions (Claude Code, CLIs, build/test loops) and orchestrating them at once.

It combines, in a single window:

- **Real terminals** (full PTYs, not emulated shells)
- **AI agent panes** for Claude Code
- **An inline Monaco code editor** (the same engine as VS Code)
- **A live file browser**
- **A global kanban task board**
- **Project management** with encrypted environment variables and auto-start commands
- **9 hand-crafted themes**
- **RemoteDeck**, a phone companion that controls your desktop from anywhere

Its design language is deliberate and premium — modeled on tools like Linear, Warp, Raycast, and Arc. The flagship theme, *Deepwater*, evokes "the bridge of a ship at night: ink and brass." Every spacing, micro-interaction, and color choice is intentional.

**Core philosophy:**
- **Local & private by default.** Everything lives on your disk (`%APPDATA%`). No accounts, no cloud, no telemetry.
- **Real, not faked.** Terminals are true PTYs via `node-pty` + `xterm.js` — `vim`, `Ctrl+C`, interactive prompts, ANSI colors, GPU-accelerated rendering all work.
- **Built for parallelism.** 1–16 panes per workspace tab; multiple tabs; each can be its own project.
- **Reachable.** Long AI tasks don't keep you at your desk — your phone can watch and drive them.

---

## 3. Who it's for (personas)

**1. The "AI-first" developer.** Runs Claude Code and other agents constantly, often several at once across different repos. Needs to launch, watch, and steer them without drowning in terminal tabs. *Hook: "Stop alt-tabbing between five terminal windows."*

**2. The solo builder / indie hacker.** One machine, many side projects. Wants per-project setups (root dir, shell, env vars, startup commands) one click away, plus a built-in task board to stay organized. *Hook: "Every project, pre-wired and one click away."*

**3. The "walk away" engineer.** Kicks off long builds, test suites, or agent tasks and steps away from the desk. Wants their phone to notify them when it's done — and to peek at or steer the session from the couch or the train. *Hook: "Get pinged on your phone the second your build finishes — from anywhere."*

**4. The privacy-conscious developer.** Won't put their terminal, secrets, or code through a cloud service. Wants encryption at rest and a remote-access path that never exposes a public URL. *Hook: "No cloud. No telemetry. Your machine, your data, your encrypted mesh."*

**5. The Windows power user.** Tired of dev tools that treat Windows as a second-class citizen. Wants something that embraces PowerShell, ConPTY, and the Windows ecosystem natively. *Hook: "Built Windows-first, not ported to Windows."*

---

## 4. Why it's different (value propositions)

| Pillar | What it means | Why it matters |
|---|---|---|
| **One cockpit** | Terminals + AI agents + editor + files + kanban + projects in one window | No more 6 apps and 20 tabs to do one task |
| **Real terminals** | True PTYs (ConPTY/`node-pty`), GPU-rendered (WebGL) | `vim`, `claude`, interactive CLIs, colors — all just work |
| **Parallel by design** | 1–16 resizable panes per tab, multiple tabs, per-tab projects | Command a fleet of agents at a glance |
| **Local & private** | Everything on disk, env vars encrypted (Windows DPAPI), no telemetry | Trust it with secrets and proprietary code |
| **Phone control** | Installable PWA mirrors & drives your *actual* desktop terminals | Steer long tasks from anywhere, no app store |
| **Cross-network** | Tailscale (WireGuard) — encrypted, NAT-crossing, never public | Reach your machine from cellular, another city, etc. |
| **Push notifications** | Web Push when a task completes | Walk away; your phone tells you when it's done |
| **Crafted design** | 9 original themes, deliberate UI | Feels like a product, not a tutorial project |

---

## 5. Use cases & workflows

**A. Parallel AI agent orchestration.** Open a Quad layout, launch Claude Code in three panes against three repos (or three tasks in one repo), and a shell in the fourth. Badge each pane so you can tell them apart at a glance. Watch all three stream at once; when one finishes a long task, your phone buzzes.

**B. "Kick it off and walk away."** Start a 40-minute test suite or an agent refactor on your desktop. Set notifications to *Phone only*. Go make coffee / take the train. Your phone pings the moment it's done; tap the notification, open the live terminal on your phone, read the output, and type the next command — all from the couch, even on cellular.

**C. Per-project command center.** Define a "my-app" project: root dir, PowerShell 7, a Quad layout, encrypted `API_KEY`, and auto-start `npm run dev` in pane 1 + `claude` in pane 2. One click (or `Ctrl+K`) opens the whole thing wired up. Switch to a "job-search" project in another tab; switch back and your dev world returns intact.

**D. Triage with the board.** Drop tasks into the kanban backlog with priorities and tags. Drag one to *In Progress*, then "send to pane" to fire it as an agent prompt. When the command exits 0, the board offers to move the card to *In Review*.

**E. Edit + run without leaving.** Split a pane into the Monaco editor next to a terminal. Tweak a file, `Ctrl+S` (format on save), and re-run in the adjacent terminal — no app switching.

**F. Remote check-in.** On the train, open RemoteDeck on your phone, see all your desktop terminals, scroll the output of the agent you left running, and nudge it with a one-line instruction.

---

## 6. Comparison

| | **TerminalDeck** | Windows Terminal | Warp | VS Code terminal |
|---|---|---|---|---|
| Real PTYs | ✅ | ✅ | ✅ | ✅ |
| Multi-pane grid (1–16) | ✅ | ✅ (tabs/panes) | ✅ | ⚠️ limited |
| Built for parallel **AI agents** | ✅ | ❌ | ⚠️ AI features | ⚠️ via extensions |
| Inline code editor | ✅ (Monaco) | ❌ | ❌ | ✅ (it *is* the editor) |
| Kanban task board | ✅ | ❌ | ❌ | ⚠️ via extensions |
| Per-project setups + encrypted env | ✅ | ⚠️ profiles | ⚠️ | ⚠️ via config |
| **Phone control of your terminals** | ✅ (RemoteDeck) | ❌ | ❌ | ❌ |
| **Phone notifications on task done** | ✅ (Web Push) | ❌ | ❌ | ❌ |
| Fully local / no cloud / no account | ✅ | ✅ | ⚠️ account-based | ✅ |

*(Comparisons are directional; competitors evolve.)*

---

# Part II — Complete feature catalog

## 7. Feature catalog

Each feature below leads with the user-facing description, followed by **Under the hood** notes for technical accuracy and depth.

### 7.1 Real terminals

Full pseudo-terminals (PTYs) — not emulated shells — powered by `node-pty` (ConPTY on Windows) and rendered with `xterm.js` v6 + a WebGL renderer for GPU-accelerated, flicker-free output.

- **Everything works:** `vim`, `nano`, `Ctrl+C`, interactive prompts, progress bars, full 16-color and 256-color ANSI, alt-screen apps.
- **Shells, auto-detected:** Windows PowerShell, PowerShell 7 (`pwsh`), Command Prompt (`cmd.exe`), Git Bash.
- **Buffer search** with `Ctrl+F` (match count + navigation).
- **Right-click menu:** copy, paste, clear.
- **Drag a file** from the sidebar (or OS) into a terminal to insert its path.
- **Click-to-move-cursor** (configurable: off / Alt+click / plain click) — text-editor feel at the prompt; sends arrow-key sequences to reposition, including 2D movement in full-screen apps.
- **Configurable copy/paste:** independent `Ctrl+C`/`Ctrl+V` and `Ctrl+Shift+C`/`Ctrl+Shift+V` behaviors, plus "replace selection on type." `Ctrl+C` copies a selection when present, otherwise sends SIGINT.
- **Live working directory** shown in each pane header.

**Under the hood:**
- Engine: `node-pty` (Windows ConPTY) + `@xterm/xterm` ^6, with the **fit**, **webgl**, and **search** addons.
- Shell detection probes well-known install paths (`src/main/pty/shells.ts`); each theme defines its own complete 16-entry ANSI palette.
- Working directory comes from `OSC 9;9` (ConEmu style) / `OSC 7` (file URL).
- Configurable: font size, scrollback (with an effectively-infinite sentinel = `100,000,000` lines), cursor style/blink, and bell.

### 7.2 AI agents & Claude Code

TerminalDeck is purpose-built for driving AI coding agents.

- **Run Claude Code as a real terminal.** Launch it in any pane (`Ctrl+Enter`) and it behaves exactly like the CLI — plugins, slash commands, interactive approvals, the works.
- **Auto-run on spawn.** A pane can launch `claude` (or any command) automatically the instant its shell is ready — so a project can open straight into an agent session.
- **Agent Chat mode** (chat-style): Claude Code presented as a true chatbox — streaming markdown responses, tool-activity cards, a stop/interrupt button, permission prompts, and per-session cost — driven over Claude Code's **`stream-json` protocol** rather than by scraping the TUI.
- **Parallel agents.** Open many agent/terminal panes across tabs and run several Claude Code sessions at once, each in its own directory and project context.

**Under the hood:**
- `src/main/agent/AgentSession.ts` spawns Claude Code in `stream-json` mode and emits a typed `AgentEvent` stream: `init` (session id, model, cwd, slash commands), `text-delta`, `assistant-message` (text/`tool_use` blocks), `tool-result`, `permission-request`, `result` (cost USD + duration), `stderr`, `exit`.
- Permission modes: `default`, `acceptEdits`, `plan`, `bypassPermissions`.

### 7.3 Multi-pane workspace & layouts

- **1–16 panes per workspace tab**, arranged in resizable splits. Three pane kinds: **terminal**, **agent**, **editor**.
- **Layout templates:** Single, Split, Quad, Six, Eight — pick one when creating a tab.
- **Drag-to-resize dividers**; double-click a divider to reset to 50/50; arrow keys nudge.
- **Workspace tabs ("decks")** across the top — create (`Ctrl+T`), close (`Ctrl+W`), switch (`Ctrl+1–9`), reorder by drag, recolor, and rename (double-click).
- **Each tab can be its own project** — switching tabs moves the active project, the new-terminal directory, and the sidebar root with it.

**Under the hood:**
- `MAX_PANES_PER_TAB = 16` (`store/workspace.ts`). The layout engine (`components/workspace/layout.ts`) is a binary split tree (`split`/`pane` nodes with row/column directions and ratios) computed to absolute percentage rects with draggable dividers (`MIN_RATIO`/`MAX_RATIO` clamps).
- All tabs stay mounted; inactive ones are `invisible/opacity-0` so sessions survive tab switches.

### 7.4 Pane management (badges, pins, drag, split)

- **Rename** any pane inline.
- **Custom badges with a color wheel.** Tag a pane with a name and a color chosen from a full **HSV color wheel** (hue ring via conic-gradient + saturation/brightness + hex input), plus quick presets (Claude Code, Dev Server, Git, Test Runner, REPL). Badges make a busy grid scannable.
- **Pin** a pane to protect it from accidental close (and to block closing the tab while pinned).
- **Drag a pane's header** to rearrange or swap panes — sessions stay alive through the move.
- **Split with control:** a per-pane menu (the `⌄` chevron) lets you split **Right** (row) or **Down** (column) and choose what opens — any detected shell or the editor. Quick split buttons (right/down) are always one click away.

**Under the hood:** `components/workspace/PaneFrame.tsx`, `components/common/ColorWheel.tsx` (HSV⇄RGB⇄hex math), `store/workspace.ts` (`splitPane`, `swapPanes`, `togglePin`).

### 7.5 Inline code editor (Monaco)

The same editor engine as VS Code, embedded right next to your terminals.

- **Multi-tab editing** within an editor pane, with **dirty indicators**.
- **Format on save** (optional) and **external-change reload** (file-watcher driven).
- **Quick Open** (`Ctrl+P`) fuzzy file search; **find & replace** (`Ctrl+H`).
- Syntax highlighting for dozens of languages; configurable font size, tab size, word wrap, and minimap.

**Under the hood:** `monaco-editor` ^0.55; per-pane editor state (open files + active file) lives in `store/editor.ts` and is persisted in the session.

### 7.6 File browser sidebar

- **Live-watching tree** that updates as files change on disk.
- **Inline create / rename**, **Recycle-Bin delete** (safe, recoverable), **reveal in Explorer**, and **file search** (`Ctrl+Shift+F`).
- **Import:** drag/drop external files into a folder, paste OS-clipboard files/images, or **download a dragged http(s) URL** into a folder.
- **Drag a file's path** into a terminal to insert it.
- **Dockable left or right**, **hideable** (`Ctrl+B`), **focus** (`Ctrl+Shift+E`), and **toggle hidden files** (`Ctrl+Shift+.`).
- **Default directory** (Settings → General) seeds new terminals and the folder picker.

**Under the hood:** `src/main/fs/fsService.ts` (file ops + watchers); imports return an `ImportResult` reporting per-item success/failure.

### 7.7 Kanban task board

A global, five-column board (**Backlog → To Do → In Progress → In Review → Done**) for managing the work in front of you.

- **Drag & drop** cards across columns.
- **Markdown card descriptions**, **priorities** (low/medium/high/critical), and **tags** with colors.
- **Send a card to a pane** — as a terminal command or an agent prompt — so a task flows straight into execution.
- **Exit-0 auto-review:** when a command finishes successfully (exit 0) in a pane, the board can auto-offer to move the related card to *In Review* (driven by the OSC 133 exit hook).
- Open it any time with `Ctrl+Shift+K`.

**Under the hood:** card model in `shared/types.ts` (`KanbanCard`, columns `backlog`/`todo`/`inprogress`/`inreview`/`done`); an optional 1-based `targetPane`.

### 7.8 Projects

A **project** captures everything about a workspace so it's one click to resume.

- **Root directory**, **default shell**, and **default layout template**.
- **Encrypted environment variables** — stored at rest with **Windows DPAPI** (`safeStorage`), decrypted only in memory; never written to the session file.
- **Auto-start commands** — a list of commands that run when the project opens, each targeting a specific pane with an optional delay (e.g., pane 1: `npm run dev`, pane 2: `claude`).
- **Color & description** for quick identification.
- **Project switcher** in the top bar (click the project name, or `Ctrl+K`) — recent-first, searchable; `Ctrl+Shift+N` for a new project.
- **Per-tab projects:** opening a project gives it its own workspace tab (named and colored after it). Switching tabs swaps the active project, the directory new terminals open in, and the sidebar root — so each tab is genuinely its own world.

**Under the hood:** `Project`, `ProjectEnvVar`, and `AutoStartCommand` types in `shared/types.ts`; encryption in `src/main/store/persist.ts`; tab binding in `store/projects.ts` (`syncTabContext`).

### 7.9 Themes & design system

Nine original themes — not recolored defaults — each with three surface depths, four ink levels, an accent, signal colors, edges, terminal colors, and a **full 16-color ANSI palette** (light themes use re-derived dark ANSI colors, never inversions). Hover-to-preview in the gallery; instant live-apply.

| Theme | Kind | Tagline |
|---|---|---|
| **Deepwater** *(flagship)* | Dark | The bridge of a ship at night — ink and brass |
| **Midnight Slate** | Dark | Deep cool gray, blue undertones, no noise |
| **Ember** | Dark | Firelight in a dark room |
| **Obsidian Sharp** | Dark | Pure black, electric accents, maximum contrast |
| **Verdigris** | Dark | Sea-green patina on old ship bronze |
| **Abyssal** | Dark | Hadal black-blue lit by bioluminescence |
| **Ghost** | Light | Near-white surfaces, dark text — not a light mode |
| **Daylight** | Light | Clean, bright, built for daytime work |
| **Parchment** | Light | Warm sepia for long sessions |

Typography pairs **Schibsted Grotesk** (UI) with **IBM Plex Mono** (terminals/code).

**Under the hood:** themes in `src/renderer/src/styles/themes.ts` (each a full `ThemeSpec`); design tokens in `styles/tokens.css` are CSS custom properties consumed by Tailwind v4's `@theme inline` — switching a theme rewrites the token map live. The flagship is `deepwater` (accent: brass `#d8a956`, base ink `#0b0f16`).

### 7.10 Session restore

On launch, TerminalDeck can restore your last session — all tabs, panes, layouts, sizes, the active project, the sidebar root, and your open editor files. Shells respawn fresh in their saved working directories.

**Under the hood:** `src/renderer/src/session.ts` serializes/rehydrates (debounced autosave + on `beforeunload`); enabled via Settings → startup = `restore`. Scrollback itself isn't restorable (the shells are real and start clean); env vars are re-derived from the encrypted project store, never stored in the session file.

### 7.11 Settings

A live-applying settings panel with four areas:

- **General:** default shell, default layout, startup behavior (restore / empty), theme, default directory for new terminals, sidebar side.
- **Editor:** font size, tab size, word wrap, minimap, format-on-save.
- **Terminal:** font size, scrollback, cursor style/blink, bell, and fine-grained copy/paste & click-to-cursor behaviors (the full copy/paste matrix and replace-selection-on-type).
- **Themes:** the gallery with hover-to-preview.

**Under the hood:** `store/settings.ts` + `DEFAULT_SETTINGS` in `shared/types.ts` (deep-merged with defaults so new keys never read undefined).

### 7.12 RemoteDeck — control from your phone

**RemoteDeck turns your phone into a remote control for TerminalDeck.** Because long AI tasks run unattended, you shouldn't have to sit at your desk to watch them.

- **Installable phone app (PWA).** Add it to your home screen — no App Store, no Apple Developer account, no app review.
- **One-time QR pairing.** The desktop shows a QR + short code; the phone scans it and receives a long-lived device token. Pairings are revocable per device.
- **Mirrors your *actual* open desktop terminals.** The phone's session list is the **same** terminal panes open in TerminalDeck — live-synced. Open or close a terminal on the desktop and it appears/disappears on the phone instantly.
- **Full control.** Tap a session to see a live `xterm.js` terminal with a **mobile key bar** for keys phones lack — `Esc`, `Tab`, arrows, `Ctrl-C/D/Z/L/R`, `PgUp/PgDn`, `Del`, `Home/End` — exactly the keys Claude Code and shells wait on. Plus paste-from-clipboard for long prompts.
- **Type from your phone, it lands on your desktop.** Input goes to the same PTY, so what you type appears on both.
- **Start new sessions from the phone** — which opens a new pane on the desktop, keeping both in sync. **End** kills that PTY.
- **Auto-reconnect.** Drop a connection (backgrounded, network change) and it reconnects with exponential backoff + heartbeat, replaying recent scrollback so it feels continuous.

**Reachable from anywhere:** RemoteDeck rides **Tailscale** (a private, encrypted WireGuard mesh). With your laptop and phone on the same Tailscale account, the phone reaches your machine over **any** network — home Wi-Fi, cellular/5G, a coffee shop, another country — with no port forwarding and **no public URL**. (On the same Wi-Fi, a direct LAN address also works for quick local testing.)

**Guided setup.** A built-in "connect your phone" wizard detects/connects Tailscale, publishes the secure HTTPS endpoint, shows the pairing QR + code, lists/revokes paired devices, edits allowed roots, and routes notifications.

**Also surfaced to the phone:** a "what's running" view of listening ports, file operations scoped to an allow-list, and a foundation for live dev-server preview.

**Under the hood:** see [§13](#13-remotedeck-protocol--internals). The Agent is the Electron main process (embedded `http` + `ws` server, default **off**, default port **8787**); it mirrors desktop panes via `DesktopBackend` over `PtyManager`'s scrollback ring + multi-subscriber fan-out.

### 7.13 Phone & desktop notifications

Stop babysitting long tasks. TerminalDeck watches your terminals and pings you when something finishes.

- **Trigger:** a real shell command completes (detected via the invisible OSC 133 integration, with duration) — and only if it ran **longer than a threshold** (default 20 s), so trivial commands never spam you.
- **Real Web Push to your phone.** Notifications use the Push API + a service worker, so your phone is alerted **even when the RemoteDeck app is closed or backgrounded** — and even on a different network. The desktop just needs internet to send the push.
- **Routing options** — the key control: **Phone only** (the default), **Desktop only** (native Windows notification), **Phone + desktop**, or **Off**.
- **Enable on the phone** with one tap (the bell in the RemoteDeck app requests permission and subscribes).

**Under the hood:** a VAPID keypair is generated once (`src/main/remote/push.ts`); the desktop POSTs encrypted push messages to each device's browser push endpoint over the internet (pruning expired 404/410 endpoints). Desktop notifications use Electron's `Notification` with `setAppUserModelId` so Windows displays them. Config: `NotifyConfig { route, minDurationSec }`, default `{ phone, 20 }`.

### 7.14 Shell integration (OSC 133)

Bundled profiles (`resources/shell-integration/integration.ps1` and `integration.bash`) emit FinalTerm **OSC 133** sequences so the app can segment the stream into commands with real exit codes — invisibly.

| Sequence | Meaning |
|---|---|
| `OSC 133;A` | prompt start (→ "shell ready"; drives auto-start timing) |
| `OSC 133;B` | input start (bounds the editable prompt region) |
| `OSC 133;C` | command started executing (starts the duration timer) |
| `OSC 133;D;<exit>` | command finished + exit code (→ kanban auto-review + completion notifications) |
| `OSC 9;9;<path>` | current directory (ConEmu style) → pane-header cwd |
| `OSC 7 file://…` | current directory as a URL |

Parsed by `components/terminal/shellSignals.ts`. PowerShell sets the integrated `PS path>` prompt (a custom profile prompt like oh-my-posh is overridden in integrated shells). `cmd.exe` has no integration → a short startup delay and no command-completion detection (so no completion notifications for cmd).

---

# Part III — Technical reference

## 8. Tech stack

### Runtime & build
| Layer | Technology | Version | Role |
|---|---|---|---|
| App shell | **Electron** | ^42.4.0 | Desktop runtime (main + renderer) |
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
| **node-pty** | ^1.1.0 | Real PTYs via Windows ConPTY (prebuilt N-API binaries) |
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

## 9. Architecture

TerminalDeck is an Electron app whose **main process doubles as a secure server** for the phone.

```
                                  ELECTRON APP (Windows host)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  MAIN PROCESS (Node.js, CommonJS)                                           │
 │   • PtyManager        — node-pty/ConPTY sessions + scrollback ring + fan-out│
 │   • AgentSession      — Claude Code via stream-json                         │
 │   • fsService         — file ops + watchers                                 │
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

**Four build targets:**
- **main** — CommonJS, `externalizeDepsPlugin()` (deps `require`d at runtime), entry `src/main/index.ts`.
- **preload** — sandboxed `contextBridge`, exposes the typed `window.quarterdeck` API.
- **renderer** — React app served by Vite (dev) / `out/renderer` (prod).
- **PWA** — a standalone Vite build (`vite.remote.config.ts`) → `out/remote`, served at runtime by the Agent.

**Key data flows:**
- Renderer → main via typed IPC (`window.quarterdeck.*`).
- PTY output: main `PtyManager` → IPC `pty:data` → renderer xterm **and** (fan-out) → Agent → phone WebSocket.
- Phone input → Agent WS → `PtyManager.write` → same PTY (desktop + phone stay in sync).

## 10. Source layout

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
│  │  ├─ pty/                   # PtyManager, shells (detection), shellIntegration (OSC 133)
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
│  │  ├─ store/                 # zustand: workspace, projects, settings, theme, kanban,
│  │  │                         #   editor, explorer, paneCwd, ptySessions, toasts
│  │  ├─ session.ts             # session serialize/restore + autosave
│  │  └─ styles/               # tokens.css, themes.ts, global.css
│  └─ remote/                   # the PWA (phone client)
│     ├─ index.html
│     ├─ public/               # manifest.webmanifest, sw.js, offline.html, icons/
│     └─ src/                  # main.ts, net/(Transport,api), terminal/(TerminalView,KeyBar,keymap),
│                              #   pwa/(register-sw,push)
```

## 11. IPC API surface

All IPC channel names live in `src/shared/types.ts` (the `IPC` const) and are exposed to the renderer as namespaces on `window.quarterdeck` (typed via `QuarterdeckApi`):

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

## 12. Data & persistence model

`electron-store` (JSON), with **separate store files for dev vs packaged** so dev testing never bleeds into an installed copy:
- packaged → `%APPDATA%\quarterdeck\quarterdeck.json`
- dev → `%APPDATA%\quarterdeck\quarterdeck-dev.json`

Schema (`src/main/store/persist.ts`):

| Key | Contents |
|---|---|
| `projects` | Projects; env var **values encrypted via DPAPI** (`safeStorage`), stored as base64 `valueEnc` |
| `kanban` | Kanban cards |
| `settings` | `AppSettings` (deep-merged with defaults) |
| `session` | Opaque renderer session snapshot (no secrets; env vars excluded) |
| `devices` | Paired phones — `id`, `name`, `userAgent`, **`tokenHash` (SHA-256 only)**, `createdAt`, `lastSeen` |
| `allowedRoots` | Folders the phone may browse / open sessions in (default: home) |
| `remote` | `{ autoStart, port }` |
| `notify` | `{ route, minDurationSec }` |
| `vapid` | Web Push VAPID keypair (generated once) |
| `pushSubs` | Per-device Web Push subscriptions |

Nothing is sent to any server; there are no accounts and no telemetry.

## 13. RemoteDeck protocol & internals

**Session backend abstraction** (`remote/backend.ts`): the transport depends only on a `SessionBackend` (`list/subscribe/write/resize/end/create/disposeAll`). v1 uses **`DesktopBackend`**, which mirrors the desktop's panes; this can later be swapped (e.g. WSL+tmux) without touching transport/auth/PWA.

**PtyManager fan-out:** each PTY keeps a 256 KB **scrollback ring** with a monotonic byte `seq`; `subscribe(id, subId, since, sub)` replays buffered output after `since`, then streams live to any number of phone subscribers — independent of the renderer's own data path.

**HTTP routes** (all except `/api/pair` require a Bearer device token):
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/pair` | exchange a one-time code for a device token |
| GET | `/api/sessions` | list the desktop's open terminals |
| POST | `/api/sessions` | open a new desktop pane |
| DELETE | `/api/sessions/:id` | kill that PTY |
| GET | `/api/ports` | listening ports + owning process |
| GET | `/api/push/key` | VAPID public key |
| POST | `/api/push/{subscribe,unsubscribe}` | manage this device's push subscription |
| static | `/*` | the PWA shell (SPA fallback) |

**WS terminal protocol** (`/ws`): the token rides as a `Sec-WebSocket-Protocol` subprotocol (`['terminaldeck.v1', 'bearer.<token>']`), validated at upgrade; only `terminaldeck.v1` is echoed back (the bearer one is never returned or logged). JSON control frames; terminal payloads base64; output frames carry a monotonic `seq`:
- client → server: `list` · `attach {id,cols,rows,since}` · `input {id,b64}` · `resize {id,cols,rows}` · `ping`
- server → client: `sessions` · `attached {id,seq}` · `data {id,seq,b64}` · `exit {id,code}` · `pong` · `error`

**Pairing & auth:** a single short-lived (5-min, single-use, rate-limited) **Crockford-base32 code** (`remote/pairing.ts`); the QR encodes `{url}/?c={code}`. `/api/pair` mints a 256-bit base64url token, returns it once, and stores **only its SHA-256**. Verification hashes the presented token and `timingSafeEqual`s against **every** device row (constant-time). Revoking a device drops its sockets + push subscription.

**Transport (Tailscale):** `remote/tailscale.ts` shells out to `tailscale.exe` — `status --json` (detect state, MagicDNS, fqdn), `up` (connect), `serve --bg <port>` (publish `https://<fqdn>` → `http://127.0.0.1:<port>`, tailnet-private, **not** funnel), `serve reset` (tear down). The wizard surfaces the CLI's own errors as clickable links and verifies `serve status` actually contains the port before reporting success.

**Build/serve:** the PWA builds to `out/remote`; the main process resolves it at `join(__dirname, '../remote')` (works in dev and inside `app.asar` when packaged) and serves it with `staticServer.ts`.

## 14. Shell integration (OSC 133)

See [§7.14](#714-shell-integration-osc-133) for the sequence table. In short: bundled PowerShell/Git Bash profiles emit FinalTerm OSC 133 markers so the app knows when commands start/finish and their exit codes — used invisibly for auto-start timing, the kanban exit-0 auto-review, and completion notifications. `cmd.exe` is unintegrated (startup-delay fallback, no completion detection).

## 15. Security model

- **Local-only, no cloud/telemetry/accounts.** All data in `%APPDATA%`.
- **Secrets at rest:** project env vars encrypted with **Windows DPAPI** (`safeStorage`); excluded from the session file.
- **Phone auth:** 256-bit device tokens; **only SHA-256 hashes stored**; constant-time comparison over all rows; per-device revocation (kills sockets + push sub). One-time, 5-minute, rate-limited pairing codes.
- **No public exposure:** RemoteDeck uses `tailscale serve` (tailnet-private), never `funnel`; no port forwarding, no public URL; Tailscale ACLs are a second layer.
- **Filesystem allow-list:** phone file ops and new-session cwd are confined to configured roots with realpath + traversal/symlink-escape protection (`net/allowlist.ts`).
- **WS token in subprotocol** (never a query string, so it isn't logged); validated before the socket opens.

## 16. Build, packaging & development

- **`electron.vite.config.ts`** builds main (CJS, `externalizeDepsPlugin`), preload, and renderer (React + Tailwind v4 + path aliases `@renderer`/`@main`/`@shared`).
- **`vite.remote.config.ts`** builds the PWA (`root: src/remote`, `base: './'`, `publicDir: src/remote/public`) → `out/remote`.
- **Scripts:**
  - `dev` — `electron-vite dev` (renderer hot-reloads; main restarts on change)
  - `build` — `electron-vite build && npm run build:remote`
  - `build:remote` — `vite build -c vite.remote.config.ts` (the PWA → `out/remote`)
  - `dist` — `electron-vite build && npm run build:remote && electron-builder --win`
  - `typecheck` — strict TS, main (node) + renderer/PWA (web)
- **`electron-builder.yml`** (NSIS): `appId app.terminaldeck.desktop`, `productName TerminalDeck`, custom `build/icon.ico`, `oneClick:false`, `perMachine:false`, `allowToChangeInstallationDirectory`, desktop shortcut. `node-pty` is `asarUnpack`ed (native binaries can't load from inside asar); `npmRebuild:false` (prebuilt N-API binaries).
- **`build/installer.nsh`** — a `customInit` NSIS hook that detects a previous install and prompts **"remove the old version?"** before installing (app data is preserved).
- The app icon is generated by **`scripts/make-icon.ps1`** (.NET System.Drawing → multi-size DIB `.ico`, the brass `❯_` mark).
- Self-tests (`scripts/`): `pty-selftest.js` (PTY round-trip), `integration-selftest.js` (OSC 133), `probe-agent.js` (Claude Code).
- **Output:** `dist/TerminalDeck Setup <version>.exe` (~120 MB). Currently **unsigned** (SmartScreen warns on first run → *More info → Run anyway*).

---

# Part IV — Using it

## 17. Requirements

- **Windows 10 or 11, 64-bit** (Intel/AMD).
- **Claude Code** on your PATH — only needed for AI agent features; terminals, editor, files, and kanban all work without it.
- **No build tools required** — native terminal binaries ship prebuilt.
- **For RemoteDeck:** the free **Tailscale** app on both your PC and your phone, signed into the same account; the PC must stay awake and online; the tailnet needs **Serve** and **HTTPS Certificates** enabled (one-time). iOS Web Push requires installing the PWA to the home screen (iOS 16.4+).

## 18. Installation

1. Download `TerminalDeck Setup.exe` and run it.
2. The installer lets you choose the install folder and creates a desktop shortcut. If a previous version is detected, it offers to remove it first (your settings and paired phones are kept).
3. **SmartScreen note:** the installer is not yet code-signed, so Windows may show *"Windows protected your PC."* Click **More info → Run anyway**. *(Code signing is on the roadmap.)*

## 19. RemoteDeck setup guide (Tailscale)

Do this once. After that, your phone reaches your desktop from anywhere.

1. **Install Tailscale** on your PC (Windows app) and your phone (App Store / Play Store — a normal free app), and sign both into the **same account**.
2. In TerminalDeck, open **RemoteDeck** (the 📱 phone icon in the top bar).
3. **Turn the Agent on.**
4. **Step 1 — Network:** the wizard detects Tailscale. Click **Connect** if needed, then **Publish over HTTPS**. *(One-time: enable MagicDNS + HTTPS Certificates in your Tailscale admin console if prompted.)*
5. **Step 2 — Pair:** tap **Show pairing QR** and scan it with your phone, or open the shown URL and type the code.
6. On the phone, tap **Add to Home Screen** to install it, then tap the **🔔 bell** to enable task-complete notifications.

**Connectivity recap:**
- **Same Wi-Fi:** LAN address or Tailscale both work.
- **Different network (cellular, elsewhere):** the **Tailscale HTTPS address** works from anywhere — encrypted, private, no public exposure.
- **Always required:** your laptop is awake and online. (Use *PowerToys Awake* to keep it from sleeping; you can let only the display turn off.)

## 20. Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+T` | New workspace tab (template picker) |
| `Ctrl+W` | Close current workspace tab |
| `Ctrl+1`–`9` | Switch workspace tab |
| `Ctrl+D` / `Ctrl+Shift+D` | Split pane right / down |
| `Ctrl+Enter` | Launch Claude Code in the active pane |
| `Ctrl+P` | Quick Open file search |
| `Ctrl+K` | Project switcher |
| `Ctrl+Shift+N` | New project |
| `Ctrl+F` | Search terminal output (find in editor when focused) |
| `Ctrl+H` | Find & replace in editor |
| `Ctrl+S` | Save file |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+E` | Focus file browser |
| `Ctrl+Shift+F` | Search files |
| `Ctrl+Shift+.` | Toggle hidden files |
| `Ctrl+Shift+K` | Task board |
| `Ctrl+,` | Settings |

**Terminal copy/paste (configurable in Settings → Terminal):** `Ctrl+C` / `Ctrl+V` and `Ctrl+Shift+C` / `Ctrl+Shift+V`, plus `Alt+Click` to move the cursor. `Ctrl+C` copies a selection when present, otherwise sends SIGINT.

## 21. FAQ

**Is my data sent anywhere?** No. Everything is local — no cloud, no telemetry, no accounts. Project secrets are encrypted at rest with Windows DPAPI.

**Do I need Claude Code?** Only for the AI agent features. Terminals, the editor, file browser, and kanban all work without it.

**Can I connect to my desktop from a different network / on cellular?** Yes — via Tailscale. With both devices on the same Tailscale account, your phone reaches your laptop from any network. The laptop must be awake and online.

**Is RemoteDeck exposing my machine to the internet?** No. It uses Tailscale's private mesh (`tailscale serve`), not a public tunnel. There's no public URL and no port forwarding.

**Does the phone see a copy or the real terminal?** The real one. The phone mirrors your *actual* open desktop terminal panes; typing on the phone writes to the same shell.

**What happens to my desktop terminals if I turn the phone server off?** Nothing — they keep running. The Agent never owns or kills your desktop sessions.

**Will notifications reach my phone if the app is closed?** Yes — they use Web Push, which works with the PWA backgrounded or closed. (On iOS, the PWA must be installed to the home screen first.)

**Why Windows-only?** It's built Windows-first around PowerShell, ConPTY, and DPAPI. Other platforms aren't supported today.

**Does it support cmd.exe?** Yes, though `cmd.exe` has no shell integration, so command-completion detection (and thus completion notifications) only applies to PowerShell and Git Bash.

**Is the installer signed?** Not yet — Windows SmartScreen will warn on first run (*More info → Run anyway*). Code signing is on the roadmap.

## 22. Roadmap & honest notes

**On the roadmap:**
- **Code signing** the installer (removes the SmartScreen warning).
- **RemoteDeck live preview proxy** — load a local dev server on your phone over the tailnet (foundations in place).
- **WSL + tmux session discovery** — pick up AI sessions started outside the app and survive app restarts.
- Optional **macOS / Linux** support.
- App version bumps and update channels.

**Honest notes (good for a transparent FAQ / docs):**
- Terminal **scrollback isn't restored** across app restarts — shells are real and start clean in their saved directories.
- **Shell history (↑/↓)** is the shell's own (PSReadLine already persists it) — TerminalDeck doesn't duplicate it.
- Shell integration sets the default `PS path>` prompt; a custom profile prompt (oh-my-posh, etc.) would be overridden in the integrated shells.
- **The desktop must stay awake** for the phone to reach it (use PowerToys Awake).
- **iOS Web Push** requires installing the PWA to the home screen (iOS 16.4+); Android/Chrome works in-browser too.
- Completion notifications fire for **integrated shells** (PowerShell, Git Bash), not `cmd.exe`.

---

# Part V — Website build kit

## 23. Suggested website structure & copy

A recommended page flow for the marketing site, with copy you can lift directly.

**1. Hero**
- Headline: **"Command your AI agents. From your desk — or your pocket."**
- Sub: *A private, Windows-native terminal workspace for running parallel AI coding agents — with a phone app that mirrors and controls your real terminals from anywhere.*
- CTAs: **Download for Windows** · **See how it works**
- Visual: the multi-pane grid (Deepwater theme) with a phone beside it showing the same session.

**2. The problem** — *"Running five Claude Code sessions across four terminal windows? Losing track of which one finished? Stuck at your desk because a 40-minute task might need a nudge?"*

**3. The cockpit** (feature grid) — Terminals · AI agents · Editor · Files · Kanban · Projects. Short benefit lines each (pull from §7).

**4. RemoteDeck spotlight** (its own section / page) — *"Your terminals, in your pocket."* Show pairing QR → phone session list (the same desktop terminals) → live phone terminal with the key bar. Emphasize **"from any network, over an encrypted private mesh."**

**5. Notifications** — *"Walk away. We'll tell you when it's done."* Show a phone lock-screen push: "✓ Terminal 2 finished · took 6m 12s."

**6. Privacy** — *"No cloud. No telemetry. No account. Secrets encrypted on your disk."*

**7. Themes** — a gallery carousel of the 9 themes with their taglines (§7.9).

**8. How it works** — a simple diagram: Desktop (TerminalDeck Agent) ⇄ Tailscale ⇄ Phone (PWA). Plus the local/private story.

**9. FAQ** — lift §21.

**10. Download / footer** — system requirements (§17), SmartScreen note, RemoteDeck needs Tailscale.

## 24. Taglines & microcopy bank

- "The command deck for AI-driven development."
- "Real terminals. Parallel agents. Zero cloud."
- "Your terminals, in your pocket — from anywhere."
- "Kick it off. Walk away. Get pinged."
- "Built Windows-first, not ported to Windows."
- "Private by default, reachable by design."
- "Command a fleet of AI coding agents from one beautiful, private terminal workspace."

**Social proof angle (once you have it):** "Designed for developers who live in the terminal and run AI agents all day."

## 25. Glossary

- **PTY (pseudo-terminal):** a real terminal device the OS provides; what makes `vim`, `Ctrl+C`, and interactive CLIs work (vs. a fake/emulated shell). TerminalDeck uses ConPTY via `node-pty`.
- **Pane:** one terminal, agent, or editor inside a workspace tab.
- **Workspace tab ("deck"):** a layout of 1–16 panes; you can have many, each optionally tied to a project.
- **Project:** a saved workspace definition — root dir, shell, layout, encrypted env vars, auto-start commands.
- **Agent / Claude Code:** an AI coding CLI you run in a pane (or as a chat-style Agent pane).
- **RemoteDeck:** the phone companion (installable PWA) that mirrors and controls your desktop terminals.
- **PWA (Progressive Web App):** an installable web app — added to the home screen, no app store.
- **Tailscale:** a private, encrypted WireGuard mesh network that connects your devices across any network without exposing them publicly.
- **Web Push:** the browser standard that delivers notifications to your phone even when the app is closed.
- **OSC 133:** terminal escape sequences (FinalTerm) that mark command start/end + exit codes — used invisibly for auto-start, kanban auto-review, and notifications.
- **VAPID:** the keypair standard that authenticates Web Push messages.
- **DPAPI / safeStorage:** Windows' built-in encryption used to protect your project secrets at rest.

---

*TerminalDeck v0.2.0 — fully local, fully private, Windows-first. Command your fleet.*
