# TerminalDeck

A chat-style terminal workspace for commanding parallel AI agents. Fully local, fully private, Windows-first.

> The quarterdeck is the raised deck of a ship from which the captain commands.

## What it is

- **Real terminals** — full PTYs via node-pty + xterm.js: vim, Ctrl+C, interactive prompts, ANSI colors, GPU-accelerated rendering. Search the buffer (Ctrl+F), right-click to copy/paste/clear, and drag a file in to insert its path. OSC 133 shell integration runs invisibly to drive auto-start timing and the Kanban auto-review hook.
- **Agent Chat panes** — Claude Code as a true chatbox (like the IDE extensions): streaming markdown responses, tool-activity cards, stop button, session cost. Driven over Claude Code's stream-json protocol, never by scraping the TUI.
- **1–16 panes** per workspace tab in resizable splits, with templates (Single/Split/Quad/Six/Eight), drag-to-resize dividers, drag a pane's header to rearrange/swap panes, pane rename/badges/pinning, and a one-click Claude Code launcher per pane.
- **Monaco editor** inline with terminals — multi-tab, dirty indicators, format-on-save, external-change reload, Quick Open (Ctrl+P).
- **File browser sidebar** with live watching, inline create/rename, Recycle-Bin delete, file search, drag-path-into-terminal. Dockable left or right, and hideable (Ctrl+B).
- **Default directory** (Settings → General) — new terminals and the folder picker start there.
- **Kanban board** (global) — five columns, drag & drop, markdown cards, priorities/tags, send-a-card-to-a-pane (terminal command or agent prompt), and exit-0 auto-offers to move cards to In Review.
- **Projects** — root dir, default shell/layout, encrypted env vars (Windows DPAPI), auto-start commands with pane targeting and delays.
- **9 original themes** (Settings → Themes, with hover-to-preview); **session restore**; live-applying settings.
- **Multiple windows** — open independent workspaces (title-bar button or Ctrl+Shift+M); only the launch window restores/persists the saved session, so extra windows stay ephemeral. Closing a window with live terminals, running agents, or unsaved files asks first (toggle in Settings → General).
- **In-app updates** — TerminalDeck checks GitHub Releases on launch and from Settings → Updates, downloads in the background, and installs on restart; your settings, projects, and paired phones are preserved. No reinstalling from the website.

## Prerequisites

- Windows 10/11
- Node.js 20+ (developed on v24) and npm 10+
- [Claude Code](https://claude.com/claude-code) on PATH — only needed for Agent Chat panes
- No build tools required (node-pty ships prebuilt binaries)

## Develop

```sh
npm install
npm run dev
```

Renderer hot-reloads; the main process restarts on change.

## Quality gates

```sh
npm run typecheck                          # strict TS, main + renderer
npx electron scripts/pty-selftest.js       # PTY round trip inside Electron
npx electron scripts/integration-selftest.js  # OSC 133 shell integration
```

## Build for production

```sh
npm run build   # bundle main/preload/renderer to out/
npm run dist    # + package a Windows installer into dist/
```

## Releasing & auto-update

The app auto-updates from the GitHub Releases of `Ibrahem-al/TerminalDeck` (configured under `publish:` in `electron-builder.yml`). To cut a release:

```sh
npm version patch                 # bump the version (also update the website)
GH_TOKEN=<token> npm run release  # build + publish the installer, latest.yml, and blockmap
```

`npm run release` runs `electron-builder --win --publish always`, which uploads `TerminalDeck-Setup.exe` (version-less, so the website's download link is stable) plus the `latest.yml` feed that installed apps poll. Builds are unsigned (SmartScreen warns on first install; the in-place updater still works, since it verifies the SHA-512 from `latest.yml`).

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+T | New workspace tab (template picker) |
| Ctrl+Shift+M | New app window |
| Ctrl+W | Close current workspace tab |
| Ctrl+1–9 | Switch workspace tab |
| Ctrl+D / Ctrl+Shift+D | Split pane right / down |
| Ctrl+P | Quick Open file search |
| Ctrl+K | Project switcher |
| Ctrl+Shift+N | New project |
| Ctrl+F | Search terminal output (find in editor when focused) |
| Ctrl+H | Find & replace in editor |
| Ctrl+S | Save file |
| Ctrl+B | Toggle sidebar |
| Ctrl+Shift+E | Focus file browser |
| Ctrl+Shift+F | Search files |
| Ctrl+Shift+. | Toggle hidden files |
| Ctrl+Shift+K | Task board |
| Ctrl+Enter | Launch Claude Code in active pane |
| Ctrl+, | Settings |

## Structure

```
src/
  main/            Electron main process
    pty/           node-pty management, shell detection, OSC 133 setup
    agent/         Claude Code stream-json sessions
    fs/            file service + watchers
    ipc/           typed IPC handlers
    store/         electron-store persistence (settings, projects,
                   kanban, session) — env vars encrypted via DPAPI
  preload/         contextBridge API surface (window.quarterdeck)
  renderer/src/
    components/    terminal/ agent/ editor/ sidebar/ kanban/
                   projects/ settings/ workspace/ chrome/ toast/
    store/         Zustand stores
    styles/        design tokens + 9 theme definitions
  shared/          types shared between main and renderer
resources/
  shell-integration/  OSC 133 scripts for PowerShell and bash
scripts/           self-tests (PTY, shell integration, agent probe)
```

## Honest notes

- Shell command history (↑/↓) is the shell's own — PSReadLine already persists it across sessions, so TerminalDeck deliberately doesn't duplicate it.
- Shell integration (OSC 133, PowerShell + Git Bash) is used only for auto-start timing and Kanban exit detection — it's invisible. `cmd.exe` panes skip it and fall back to a short startup delay.
- The PowerShell integration sets the default `PS path>` prompt; a custom profile prompt (oh-my-posh, etc.) would be overridden. Tell me if you want the prompt-preserving variant.
- Session restore respawns fresh shells in their saved working directories; terminal scrollback itself is not restorable.
- Everything stays on disk at `%APPDATA%/quarterdeck/` — no cloud, no telemetry.
