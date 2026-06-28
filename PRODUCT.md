# TerminalDeck — Complete Product Guide

> **A chat-style terminal workspace for commanding parallel AI agents — fully local, fully private, Windows-first, and reachable from your phone anywhere in the world.**

This document is the single source of truth for everything in TerminalDeck: positioning, every feature, use cases, architecture, security, setup, and ready-to-use marketing copy. It's written to be lifted directly into a website, landing page, docs site, or app store listing.

> The **quarterdeck** is the raised deck of a ship from which the captain commands. TerminalDeck is your command deck for AI-driven development.

---

## Table of contents

1. [One-liner & elevator pitches](#1-one-liner--elevator-pitches)
2. [What is TerminalDeck?](#2-what-is-terminaldeck)
3. [Who it's for](#3-who-its-for-personas)
4. [Why it's different](#4-why-its-different-value-propositions)
5. [Feature deep-dive](#5-feature-deep-dive)
   - [Real terminals](#51-real-terminals)
   - [AI agents & Claude Code](#52-ai-agents--claude-code)
   - [Multi-pane workspace & layouts](#53-multi-pane-workspace--layouts)
   - [Pane management](#54-pane-management-badges-pins-drag-split)
   - [Inline code editor (Monaco)](#55-inline-code-editor-monaco)
   - [File browser](#56-file-browser-sidebar)
   - [Kanban task board](#57-kanban-task-board)
   - [Projects](#58-projects)
   - [Themes & design system](#59-themes--design-system)
   - [Session restore](#510-session-restore)
   - [Settings](#511-settings)
   - [RemoteDeck — control from your phone](#512-remotedeck--control-from-your-phone)
   - [Phone & desktop notifications](#513-phone--desktop-notifications)
6. [Use cases & workflows](#6-use-cases--workflows)
7. [How it works (architecture)](#7-how-it-works-architecture)
8. [Security & privacy](#8-security--privacy)
9. [Requirements & installation](#9-requirements--installation)
10. [RemoteDeck setup guide (Tailscale)](#10-remotedeck-setup-guide-tailscale)
11. [Keyboard shortcuts](#11-keyboard-shortcuts)
12. [FAQ](#12-faq)
13. [Roadmap & honest notes](#13-roadmap--honest-notes)
14. [Comparison](#14-comparison)
15. [Suggested website structure & copy](#15-suggested-website-structure--copy)
16. [Glossary](#16-glossary)

---

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

## 5. Feature deep-dive

### 5.1 Real terminals

Full pseudo-terminals (PTYs) powered by `node-pty` (ConPTY on Windows) and rendered with `xterm.js` + a WebGL renderer for GPU-accelerated, flicker-free output.

- **Everything works:** `vim`, `nano`, `Ctrl+C`, interactive prompts, progress bars, full ANSI color, alt-screen apps.
- **Shells:** Windows PowerShell, PowerShell 7 (`pwsh`), Command Prompt (`cmd.exe`), and Git Bash — auto-detected on your system.
- **Search the buffer** with `Ctrl+F`.
- **Right-click menu:** copy, paste, clear.
- **Drag a file** from the sidebar (or OS) into a terminal to insert its path.
- **Click-to-move-cursor** (configurable: off / Alt+click / plain click) — text-editor feel at the prompt.
- **Configurable copy/paste:** `Ctrl+C`/`Ctrl+V` and `Ctrl+Shift+C`/`Ctrl+Shift+V` behaviors, plus "replace selection on type."
- **Invisible shell integration (OSC 133)** for PowerShell and Git Bash: the app silently learns when commands start and finish (and their exit codes) to power auto-start timing, the kanban auto-review hook, and phone notifications. `cmd.exe` has no integration and uses a short startup delay instead.
- **Live working-directory** shown in each pane header (reported by the shell).

### 5.2 AI agents & Claude Code

TerminalDeck is purpose-built for driving AI coding agents.

- **Run Claude Code as a real terminal.** Launch it in any pane (`Ctrl+Enter`), and it behaves exactly like the CLI — plugins, slash commands, interactive approvals, the works.
- **Auto-run on spawn.** A pane can be configured to launch `claude` (or any command) automatically when its shell is ready — so a project can open straight into an agent session.
- **Agent Chat mode** (chat-style): Claude Code presented as a true chatbox — streaming markdown responses, tool-activity cards, a stop button, and per-session cost — driven over Claude Code's `stream-json` protocol rather than by scraping the TUI.
- **Parallel agents.** Open multiple agent/terminal panes across tabs and run several Claude Code sessions at once, each in its own directory and project context.

### 5.3 Multi-pane workspace & layouts

- **1–16 panes per workspace tab**, arranged in resizable splits.
- **Layout templates:** Single, Split, Quad, Six, Eight — pick one when creating a tab.
- **Drag-to-resize dividers** (double-click a divider to reset to 50/50; arrow keys nudge focus dividers).
- **Workspace tabs** ("decks") across the top — create, rename, recolor, reorder by drag, and switch with `Ctrl+1–9`.
- **Each tab can be its own project** (see [Projects](#58-projects)) — switching tabs moves the active project, the new-terminal directory, and the sidebar root with it.

### 5.4 Pane management (badges, pins, drag, split)

- **Rename** any pane inline.
- **Custom badges with a color wheel.** Tag a pane with a name and a color chosen from a full **HSV color wheel** (hue ring + brightness + hex), plus quick presets (Claude Code, Dev Server, Git, Test Runner, REPL). Badges make a busy grid scannable at a glance.
- **Pin** a pane to protect it from accidental close (and to block closing the tab).
- **Drag a pane's header** to rearrange or swap panes — sessions stay alive through the move.
- **Split with control:** a per-pane menu lets you split **Right** or **Down** and choose what opens — any shell or the editor. Quick split buttons (right/down) are always one click away.

### 5.5 Inline code editor (Monaco)

The same editor engine as VS Code, embedded right next to your terminals.

- **Multi-tab editing** within an editor pane, with **dirty indicators**.
- **Format on save** (optional).
- **External-change reload** — edits made outside the app are picked up.
- **Quick Open** (`Ctrl+P`) fuzzy file search.
- **Find & replace** (`Ctrl+H`), syntax highlighting for dozens of languages, configurable font size, tab size, word wrap, and minimap.

### 5.6 File browser sidebar

- **Live-watching tree** that updates as files change on disk.
- **Inline create / rename**, **Recycle-Bin delete** (safe, recoverable), and **file search** (`Ctrl+Shift+F`).
- **Drag a file's path** into a terminal; **drag/drop or paste** external files into a folder to import them; **download a dragged URL** into a folder.
- **Dockable left or right**, and **hideable** (`Ctrl+B`).
- **Toggle hidden files** (`Ctrl+Shift+.`).

### 5.7 Kanban task board

A global, five-column board (Backlog → To Do → In Progress → In Review → Done) for managing the work in front of you.

- **Drag & drop** cards across columns.
- **Markdown card descriptions**, **priorities** (low/medium/high/critical), and **tags** with colors.
- **Send a card to a pane** — as a terminal command or an agent prompt — so a task flows straight into execution.
- **Exit-0 auto-review:** when a command finishes successfully in a pane, the board can auto-offer to move the related card to *In Review*.
- Open it any time with `Ctrl+Shift+K`.

### 5.8 Projects

A **project** captures everything about a workspace so it's one click to resume.

- **Root directory**, **default shell**, and **default layout template**.
- **Encrypted environment variables** — stored at rest with Windows DPAPI (`safeStorage`), decrypted only in memory.
- **Auto-start commands** — a list of commands that run when the project opens, each targeting a specific pane with an optional delay (e.g., pane 1: `npm run dev`, pane 2: `claude`).
- **Color & description** for quick identification.
- **Project switcher** in the top bar (click the project name, or `Ctrl+K`) — recent-first, searchable.
- **Per-tab projects:** opening a project gives it its own workspace tab (named and colored after it). Switching between tabs swaps the active project, the directory new terminals open in, and the sidebar root — so each tab is genuinely its own world.

### 5.9 Themes & design system

Nine original themes — not recolored defaults — each with a full 16-color ANSI palette, hover-to-preview, and instant live-apply.

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

### 5.10 Session restore

On launch, TerminalDeck can restore your last session — all tabs, panes, layouts, sizes, the active project, the sidebar root, and your open editor files. Shells respawn fresh in their saved working directories. (Scrollback itself isn't restorable — the shells are real and start clean — but the layout and context are.)

### 5.11 Settings

A live-applying settings panel with four areas:

- **General:** default shell, default layout, startup behavior (restore / empty), theme, default directory for new terminals, sidebar side.
- **Editor:** font size, tab size, word wrap, minimap, format-on-save.
- **Terminal:** font size, scrollback, cursor style/blink, bell, and fine-grained copy/paste & click-to-cursor behaviors.
- **Themes:** the gallery with hover-to-preview.

### 5.12 RemoteDeck — control from your phone

**RemoteDeck turns your phone into a remote control for TerminalDeck.** Because long AI tasks run unattended, you shouldn't have to sit at your desk to watch them.

**What it does:**
- **Installable phone app (PWA).** Add it to your home screen — no App Store, no Apple Developer account, no app review.
- **One-time QR pairing.** The desktop shows a QR + short code; the phone scans it and receives a long-lived device token. Pairings are revocable per device.
- **Mirrors your *actual* open desktop terminals.** The phone's session list is the **same** terminal panes open in TerminalDeck — live-synced. Open or close a terminal on the desktop and it appears/disappears on the phone instantly.
- **Full control.** Tap a session to see a live `xterm.js` terminal, complete with a **mobile key bar** for the keys phones lack — `Esc`, `Tab`, arrows, `Ctrl-C/D/Z/L/R`, `PgUp/PgDn`, etc. — exactly the keys Claude Code and shells wait on. Plus paste-from-clipboard for long prompts.
- **Type from your phone, it lands on your desktop.** Input goes to the same PTY, so what you type appears on both the phone and the desktop terminal.
- **Start new sessions from the phone** — which opens a new pane on the desktop, keeping both in sync.
- **Auto-reconnect.** Drop a connection (backgrounded, network change) and it reconnects with backoff and replays recent scrollback, so it feels continuous.

**Reachable from anywhere:** RemoteDeck rides **Tailscale** (a private, encrypted WireGuard mesh). With your laptop and phone signed into the same Tailscale account, the phone reaches your machine over **any** network — home Wi-Fi, cellular/5G, a coffee shop, another country — with no port forwarding and **no public URL**. (On the same Wi-Fi, a direct LAN address also works for quick local testing.)

**Guided setup.** A built-in "connect your phone" wizard walks you through detecting/connecting Tailscale, publishing the secure HTTPS endpoint, and scanning the QR.

**Also surfaced to the phone:** a "what's running" view of listening ports, file operations scoped to an allow-list, and a foundation for live dev-server preview.

### 5.13 Phone & desktop notifications

Stop babysitting long tasks. TerminalDeck watches your terminals and pings you when something finishes.

- **Trigger:** a real shell command completes (detected via the invisible OSC 133 integration) — and only if it ran **longer than a threshold** (default 20 s), so trivial commands never spam you.
- **Real Web Push to your phone.** Notifications use the Push API + a service worker, so your phone is alerted **even when the RemoteDeck app is closed or backgrounded** — and even when you're on a different network. The desktop just needs internet to send the push.
- **Routing options** — the key control: **Phone only** (the default), **Desktop only** (native Windows notification), **Phone + desktop**, or **Off**. "Phone only" lets you walk away from the desk entirely.
- **Enable on the phone** with one tap (the bell in the RemoteDeck app requests permission and subscribes).

---

## 6. Use cases & workflows

**A. Parallel AI agent orchestration.** Open a Quad layout, launch Claude Code in three panes against three repos (or three tasks in one repo), and a shell in the fourth. Badge each pane so you can tell them apart at a glance. Watch all three stream at once; when one finishes a long task, your phone buzzes.

**B. "Kick it off and walk away."** Start a 40-minute test suite or an agent refactor on your desktop. Set notifications to *Phone only*. Go make coffee / take the train. Your phone pings the moment it's done; tap the notification, open the live terminal on your phone, read the output, and type the next command — all from the couch, even on cellular.

**C. Per-project command center.** Define a "my-app" project: root dir, PowerShell 7, a Quad layout, encrypted `API_KEY`, and auto-start `npm run dev` in pane 1 + `claude` in pane 2. One click (or `Ctrl+K`) opens the whole thing wired up. Switch to a "job-search" project in another tab; switch back and your dev world returns intact.

**D. Triage with the board.** Drop tasks into the kanban backlog with priorities and tags. Drag one to *In Progress*, then "send to pane" to fire it as an agent prompt. When the command exits 0, the board offers to move the card to *In Review*.

**E. Edit + run without leaving.** Split a pane into the Monaco editor next to a terminal. Tweak a file, `Ctrl+S` (format on save), and re-run in the adjacent terminal — no app switching.

**F. Remote check-in.** On the train, open RemoteDeck on your phone, see all your desktop terminals, scroll the output of the agent you left running, and nudge it with a one-line instruction.

---

## 7. How it works (architecture)

TerminalDeck is an **Electron** application, but with an unusual twist: its main process doubles as a secure server for the phone.

- **Renderer (UI):** React + TypeScript + Tailwind CSS, state via Zustand. Terminals render with `xterm.js` + WebGL; the editor is Monaco.
- **Main process (Node.js host):** owns the PTYs (`node-pty`/ConPTY), the file service + watchers, the Claude Code `stream-json` sessions, encrypted persistence (`electron-store`), and **the RemoteDeck Agent**.
- **The RemoteDeck Agent** is an embedded HTTP + WebSocket server (`ws`) inside the main process. It serves the phone PWA, authenticates devices, and streams terminal sessions. Crucially, it **mirrors the desktop's own terminals**: the renderer reports its open panes, and the Agent fans out the same PTY output (with a scrollback ring buffer for instant replay) to any number of phone clients — so the desktop and phone see exactly the same session.
- **The phone PWA** is a separate lightweight web app (vanilla TS + `xterm.js`) built to its own bundle and served by the Agent. It installs to the home screen, registers a service worker (offline + push), and talks to the Agent over an authenticated WebSocket.
- **Transport:** Tailscale (WireGuard) provides the encrypted, NAT-crossing path; `tailscale serve` publishes the Agent over real HTTPS on your private `*.ts.net` name (required for PWA install + service workers).
- **Notifications:** Web Push with a VAPID keypair generated on first use; the phone subscribes via its browser's push service; the Agent sends encrypted push messages to that endpoint over the internet.
- **Shell integration:** OSC 133 (FinalTerm) sequences emitted by bundled PowerShell/Git Bash profiles let the app segment the stream into commands with real exit codes — invisibly.
- **Build & packaging:** `electron-vite` builds main/preload/renderer; a separate Vite build produces the PWA; `electron-builder` packages a Windows NSIS installer (with an "uninstall the old version?" prompt on upgrade).

---

## 8. Security & privacy

- **Local-only by default.** All data — settings, projects, kanban, session — lives at `%APPDATA%\quarterdeck`. **No cloud, no accounts, no telemetry.**
- **Secrets encrypted at rest.** Project environment variables are encrypted with **Windows DPAPI** (`safeStorage`) and decrypted only in memory; they're never written to the session file in plain text.
- **Device-token auth for the phone.** Pairing issues a 256-bit random token; **only its SHA-256 hash is stored**, compared in constant time. Every HTTP route and WebSocket upgrade is token-gated. Tokens are **revocable per device** (revoking also drops that device's live connections and push subscription).
- **Short-lived pairing codes.** One-time, ~5-minute, single-use, rate-limited.
- **No public exposure.** RemoteDeck uses `tailscale serve` (private to your tailnet), **not** `funnel` — there is no public URL and no port forwarding. Tailscale's own ACLs are a second layer of defense.
- **Filesystem allow-list.** Any phone-driven file operation or new-session directory is confined to a configurable set of root folders, with traversal/symlink-escape protection.
- **Scoped by default.** The phone controls terminals, files (within the allow-list), and preview — nothing else is exposed.

---

## 9. Requirements & installation

**System requirements:**
- **Windows 10 or 11**, 64-bit (Intel/AMD).
- **Claude Code** on your PATH — only needed for AI agent features; terminals, editor, files, and kanban work without it.
- **No build tools required** — native terminal binaries ship prebuilt.
- **For RemoteDeck:** the free **Tailscale** app on both your PC and your phone, signed into the same account.

**Installing:**
1. Download `TerminalDeck Setup.exe` and run it.
2. The installer lets you choose the install folder and creates a desktop shortcut. If a previous version is detected, it offers to remove it first (your settings and paired phones are kept).
3. **SmartScreen note:** the installer is not yet code-signed, so Windows may show *"Windows protected your PC."* Click **More info → Run anyway**. *(Code signing is on the roadmap.)*

---

## 10. RemoteDeck setup guide (Tailscale)

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

---

## 11. Keyboard shortcuts

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

---

## 12. FAQ

**Is my data sent anywhere?** No. Everything is local — no cloud, no telemetry, no accounts. Project secrets are encrypted at rest with Windows DPAPI.

**Do I need Claude Code?** Only for the AI agent features. Terminals, the editor, file browser, and kanban all work without it.

**Can I connect to my desktop from a different network / on cellular?** Yes — via Tailscale. With both devices on the same Tailscale account, your phone reaches your laptop from any network. It's not limited to the same Wi-Fi. The laptop must be awake and online.

**Is RemoteDeck exposing my machine to the internet?** No. It uses Tailscale's private mesh (`tailscale serve`), not a public tunnel. There's no public URL and no port forwarding.

**Does the phone see a copy or the real terminal?** The real one. The phone mirrors your *actual* open desktop terminal panes; typing on the phone writes to the same shell.

**What happens to my desktop terminals if I turn the phone server off?** Nothing — they keep running. The Agent never owns or kills your desktop sessions.

**Will notifications reach my phone if the app is closed?** Yes — they use Web Push, which works with the PWA backgrounded or closed. (On iOS, the PWA must be installed to the home screen first.)

**Why Windows-only?** It's built Windows-first around PowerShell, ConPTY, and DPAPI. Other platforms aren't supported today.

**Does it support cmd.exe?** Yes, though `cmd.exe` has no shell integration, so command-completion detection (and thus completion notifications) only applies to PowerShell and Git Bash.

**Is the installer signed?** Not yet — Windows SmartScreen will warn on first run (*More info → Run anyway*). Code signing is on the roadmap.

---

## 13. Roadmap & honest notes

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

## 14. Comparison

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

## 15. Suggested website structure & copy

A recommended page flow for the marketing site, with copy you can lift.

**1. Hero**
- Headline: **"Command your AI agents. From your desk — or your pocket."**
- Sub: *A private, Windows-native terminal workspace for running parallel AI coding agents — with a phone app that mirrors and controls your real terminals from anywhere.*
- CTAs: **Download for Windows** · **See how it works**
- Visual: the multi-pane grid (Deepwater theme) with a phone beside it showing the same session.

**2. The problem** — *"Running five Claude Code sessions across four terminal windows? Losing track of which one finished? Stuck at your desk because a 40-minute task might need a nudge?"*

**3. The cockpit** (feature grid) — Terminals · AI agents · Editor · Files · Kanban · Projects. Short benefit lines each (pull from §5).

**4. RemoteDeck spotlight** (its own section / page) — *"Your terminals, in your pocket."* Show pairing QR → phone session list (the same desktop terminals) → live phone terminal with the key bar. Emphasize **"from any network, over an encrypted private mesh."**

**5. Notifications** — *"Walk away. We'll tell you when it's done."* Show a phone lock-screen push: "✓ Terminal 2 finished · took 6m 12s."

**6. Privacy** — *"No cloud. No telemetry. No account. Secrets encrypted on your disk."*

**7. Themes** — a gallery carousel of the 9 themes with their taglines (§5.9).

**8. How it works** — a simple diagram: Desktop (TerminalDeck Agent) ⇄ Tailscale ⇄ Phone (PWA). Plus the local/private story.

**9. FAQ** — lift §12.

**10. Download / footer** — system requirements (§9), SmartScreen note, RemoteDeck needs Tailscale.

**Reusable taglines / microcopy:**
- "The command deck for AI-driven development."
- "Real terminals. Parallel agents. Zero cloud."
- "Your terminals, in your pocket — from anywhere."
- "Kick it off. Walk away. Get pinged."
- "Built Windows-first, not ported to Windows."
- "Private by default, reachable by design."

**Social proof angle (once you have it):** "Designed for developers who live in the terminal and run AI agents all day."

---

## 16. Glossary

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

*TerminalDeck — fully local, fully private, Windows-first. Command your fleet.*
