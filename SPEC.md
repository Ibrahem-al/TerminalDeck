# SPEC.md — Agentic Terminal Workspace

> This file is the full build specification. It is referenced by the `/goal` command. Read it completely before doing anything.

---


---

## 🔴 READ THIS FIRST — REQUIRED BEFORE ANY CODE

You are building a **personal, locally-run desktop application** — a visually stunning, chat-style terminal workspace with a multi-pane layout, integrated code editor, Kanban task board, and project management. This is for **personal daily developer use**, with heavy focus on running AI coding agents (Claude Code, Gemini CLI, etc.) in parallel.

### Skills You Must Apply

Before writing a single line of code or making any architecture decisions, **read and fully internalize** the following skill file:

```
/mnt/skills/public/frontend-design/SKILL.md
```

Apply that skill's full design methodology throughout the entire build — the brainstorm → plan → critique → build → critique loop. This app must look like a **commercially polished, award-winning developer tool**, not a tutorial project or a generic Electron boilerplate. Think: Linear, Warp, Raycast, Arc — the kind of app where the design itself builds trust.

After reading the frontend-design skill, **also identify and read any other skill files under `/mnt/skills/` that you think would significantly improve the quality of the output** (component architecture, UX patterns, animation, accessibility, etc.). List which skills you read in your first response.

Apply your **absolute maximum UI/UX judgment** throughout — every spacing decision, every micro-interaction, every typography choice should be deliberate and intentional. Pretend this is a product that will be submitted to awwwards.com.

---

## 🟡 STEP 0 — ASK QUESTIONS & CONFIRM ARCHITECTURE BEFORE BUILDING

**Do not write any code yet.** Think carefully through every decision below — evaluate tradeoffs and surface the non-obvious implications of each choice before committing. Then ask me all clarifying questions. Only proceed once I confirm.

### Architecture Questions to Evaluate and Answer

**1. App Framework**
My preferred choice is **Electron + TypeScript + React + Tailwind CSS**. However:
- Think carefully through whether Electron is genuinely the best choice for this use case, or if **Tauri** (Rust backend, smaller bundle, better native perf) or another framework is a meaningfully better fit for local, personal, daily use.
- Consider: PTY integration complexity, native module support, renderer flexibility, packaging simplicity, and long-term maintainability.
- State your recommendation with detailed reasoning and ask me to confirm before proceeding.

**2. Terminal Rendering Strategy**
The terminal UI should **look like a modern AI chatbot interface** (think: Claude.ai, ChatGPT), NOT a raw black-screen terminal. However, it must have **100% full terminal functionality** — real PTY, interactive stdin, ANSI colors, Ctrl+C, vim, everything. Evaluate each option carefully:
- **Option A**: `node-pty` + a custom React renderer (parse PTY output stream into styled command blocks, render manually)
- **Option B**: `node-pty` + `xterm.js` with heavy theming and custom CSS to make it look chat-like
- **Option C**: Hybrid — `xterm.js` for the active input/interactive layer, overlay a custom "command block" history renderer on top for completed commands
- **Option D**: Something else you determine is better

Reason through how each option handles: vim/full-screen programs, interactive prompts (yes/no, password, menus), progress bars, ANSI escape sequences, very long outputs, and the visual goal of looking like a chat UI. Recommend the best architecture and explain why. If a pure terminal emulator is NOT the best choice, say so explicitly.

**3. Code Editor**
My preference is **Monaco Editor** (VS Code engine). Confirm this is the right choice, or propose an alternative (CodeMirror 6, etc.) with reasoning covering: bundle size, API quality, theme-ability, TypeScript support, and integration complexity in Electron.

**4. State Management & Persistence Layer**
Think through the right combination of:
- State management (Zustand, Jotai, Redux Toolkit, or other)
- Local persistence (electron-store, SQLite via better-sqlite3, or other) for projects, settings, Kanban boards, and session state
- Recommend a specific stack with reasoning.

**5. Ask Me Anything**
After your analysis above, ask me **all clarifying questions you have** about features, preferences, edge cases, existing code to reuse, or anything that would help you build this correctly the first time. Batch all questions into one block so I can answer them together.

---

## 🟢 FEATURE CONFIRMATION PROTOCOL — REQUIRED FOR EVERY FEATURE

**This rule applies for the entire build, from the first line of code to the final polish pass. No exceptions.**

Before implementing any feature, sub-feature, or meaningful chunk of work, you must stop and confirm with me first. Do not assume approval from the spec — the spec defines what to build, but you still confirm before building each piece.

### How confirmation works

For each feature you are about to implement, post a short confirmation block in this exact format:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 NEXT: [Feature Name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
What I'm building:
  [1–3 sentence plain-English description of this specific feature]

What it includes:
  • [sub-feature or detail]
  • [sub-feature or detail]
  • [sub-feature or detail]
  (list everything you plan to implement in this batch)

Files I'll create or modify:
  • [file path]
  • [file path]

Confirm? (yes / no / adjust)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Wait for my reply before writing any code. I will either:
- **"yes"** — proceed exactly as described
- **"no"** — skip this feature or sub-feature entirely
- **"adjust"** — followed by changes; incorporate them and re-confirm before proceeding

### Granularity rules

Confirm at the **feature level**, not the micro-level. Good examples of one confirmation block:
- "PTY layer + IPC bridge" (entire Part 1 foundation)
- "Command block system" (the visual renderer for a single pane)
- "Multi-pane split/resize + workspace templates" (Parts 2 together)
- "Kanban board — all five columns + card CRUD + drag-and-drop"

Do **not** ask for confirmation on every single function or file. Batch logically related things into one confirmation. The goal is to give me control over what gets built, not to slow progress down.

### After confirmation

Once I say "yes", implement the full feature as described, then stop again and post the next confirmation block. Do not chain features together without checking in between.

---

## PART 1 — Terminal System (Chat-Style)

### Visual Design Goals
- The terminal must look like a **polished AI chat interface**. Each command and its output should appear as a visually distinct **"command block"** — think chat bubbles, cards, or segmented message groups.
- User-typed commands appear as a styled "user message" (left or right-aligned, your design decision based on the aesthetic direction you establish).
- Terminal output (stdout) appears as a "response block" in a contrasting but harmonious style.
- Errors (stderr) get a distinct visual treatment (e.g., subtle red tint, error icon).
- The overall aesthetic: **clean, modern, minimal chrome around content** — not a terminal skin, but a workspace.

### Full Terminal Capability (Non-Negotiable)
- Real PTY via **`node-pty`** — full shell, real processes, real signals
- Full ANSI/VT100 escape code rendering (colors, bold, cursor movement)
- **Interactive stdin** must work natively: tools like `claude`, `npm init`, `git commit`, interactive REPLs, SSH, etc.
- Shell configuration fully preserved (reads `.zshrc`, `.bashrc`, `.config/fish/`, etc.)
- **Signal handling**: Ctrl+C (SIGINT), Ctrl+D (EOF), Ctrl+Z (SIGTSTP)
- Vim, nano, and other full-screen terminal programs must work correctly within the emulator
- Command history: up/down arrow navigation, persistent across sessions

### Command Block System
Each command run is captured as a discrete block containing:
- The exact command text (styled as user input)
- Full stdout/stderr output with proper ANSI rendering
- Exit code indicator: ✓ green badge for success, ✗ red badge for failure
- Timestamp (relative: "2s ago", absolute on hover)
- **Collapsible toggle** — click to collapse/expand long outputs
- **Copy output button** on hover
- Running state: a live animated indicator while the process is active

### Interactive CLI Popup Handling
When a CLI tool requests user input interactively (yes/no prompts, password fields, selection menus, etc.):
- For **yes/no prompts**: render quick-action `Yes` / `No` buttons inline above the raw input line (clicking them sends the input)
- For **password/secret inputs**: render a masked input field inline; show the terminal's own cursor but visually style it as a password field
- For **selection menus** (e.g., `inquirer.js` style, arrow-key selection): pass through normally — the interactive layer handles it, the chat-style renderer pauses and shows the raw interactive state
- For **progress bars** (npm install, pip, build tools): render as styled progress bars within the command block, not raw ASCII
- Toast notifications for: command completed, command failed, long-running command (>10s) finished, file saved

### Terminal Pane Features
- **Cmd+F / Ctrl+F**: Search terminal output across all command blocks
- Right-click context menu: copy, paste, clear terminal, split pane, rename pane
- **Drag and drop**: drop a file into the terminal to insert its absolute path
- Floating "Jump to Bottom" button when scrolled up
- GPU-accelerated rendering where possible
- Each pane has a **custom display name / label** (click to rename inline)

---

## PART 2 — Multi-Pane Layout System

- Split workspace into **1–16 terminal panes** in a resizable grid
- **Drag-to-resize** pane dividers (smooth, with snap points)
- Split any existing pane **horizontally or vertically** via button or keyboard shortcut (Cmd+D)
- **Workspace Templates** — pre-built layouts the user can pick when creating a new workspace tab:
  - Single (1 full-screen)
  - Split (2 side-by-side)
  - Quad (2×2 grid)
  - Six (2×3 grid)
  - Eight (2×4 or custom)
  - Up to 16 panes
- **Workspace Tabs**: multiple named tabs, each with its own independent pane layout
  - Cmd+T: new workspace tab
  - Cmd+W: close current tab
  - Cmd+1–9: switch tab by index
  - Color-code tabs (click tab color swatch to change)
  - Drag tabs to reorder

### Pane Instance Features (from prior TerminalDeck project)
These features come from a prior app I built — include them if not already covered above:
- **Pane type badge**: tag each pane as "Claude Code", "Dev Server", "Git", "Test Runner", "REPL", or any custom label — shown as a small colored badge in the pane header
- **One-click "Launch Claude Code" button** in each pane header: spawns `claude` in that terminal with proper env and working directory
- **Pane pinning**: pin a pane to prevent accidental close or replacement by workspace template switches
- **Session persistence**: when the app is relaunched, restore the last open workspace (pane layout, working directories, pane names, pane type badges, pinned panes)

---

## PART 3 — Integrated Code Editor

- Embed **Monaco Editor** (or your recommended alternative) as a first-class panel, not an afterthought
- Syntax highlighting for all major languages (auto-detected from file extension)
- **File watching**: changes made to the file outside the app are reflected automatically (no manual reload)
- **Quick Open** file search: Cmd+P — fuzzy search over all files in the current project
- **Multi-tab file editing**: open multiple files in tabs with close buttons and dirty indicators (●)
- Line numbers, bracket matching, auto-indentation
- Find & replace within editor: Cmd+H
- Minimap (toggleable)
- Word wrap toggle
- **Editor opens inline** alongside terminal panes (not in a separate window) — user can have a terminal pane on the left and the editor on the right in the same workspace

---

## PART 4 — File Browser (Sidebar)

- Left sidebar with a **full project file tree**
- Expand/collapse directories with chevron toggle
- File type icons (use a well-known icon set — Material File Icons or similar)
- **Right-click context menu**: new file, new folder, rename, delete, copy path, copy relative path, reveal in Finder/Explorer
- Show/hide hidden files toggle (Cmd+Shift+.)
- Drag files into a terminal pane to insert their path
- **Search files** in sidebar (Cmd+Shift+F): inline search above the file tree

---

## PART 5 — Kanban Task Board

A built-in task management board, accessible as a panel or tab:

### Columns
- **Backlog** — ideas and future work
- **Todo** — ready to start
- **In Progress** — actively being worked on
- **In Review** — completed, needs review
- **Done** — approved and complete

### Card Features
Each task card contains:
- Title (required)
- Description / notes (markdown supported)
- Priority label: Low (gray), Medium (blue), High (orange), Critical (red)
- Optional tags (free-form, colorable)
- Optional "Target Pane" — assign a task to a specific terminal pane number
- Created / updated timestamp
- Status auto-updates: if a task has a "Target Pane" assigned and that pane's running process exits with code 0, offer to move the card to "In Review" automatically (with a toast confirmation)

### Board Features
- **Drag and drop** cards between columns
- **Quick-add card**: click "+ Add task" at bottom of any column
- **Search/filter**: search by title, filter by priority or tag
- **Compact mode** toggle: show cards as smaller rows for high-density view
- **Send to terminal**: select a card → choose a pane → sends the task title/description as a prompt to that terminal (useful for AI agent workflows)

---

## PART 6 — Project Management

### Projects Panel
- Create named projects with:
  - **Project name**
  - **Root directory path** (file picker)
  - **Description** (optional)
  - **Default shell** (zsh, bash, fish, PowerShell, etc.)
  - **Default workspace template** (which pane layout to use when opening)
  - **Environment variables** (key=value pairs, stored locally and encrypted, never committed)
  - **Auto-start commands** (see Part 7)
  - **Associated Kanban board** (each project has its own board)

### Project Switcher
- Dropdown or side panel to switch between projects
- **Recent projects** list (last 5 used, shown on app launch)
- **Search projects** by name
- When switching projects:
  - Opens the project's root directory in the file browser
  - Applies the project's default workspace template
  - Runs auto-start commands
  - Loads the project's Kanban board
  - Restores the project's last session (pane layout, open files)

---

## PART 7 — Auto-Start Commands

Each project can define a list of commands that run automatically when the project is opened:

- **Command list** with:
  - Command string (e.g., `npm run dev`)
  - Target pane number (which pane to run it in)
  - Display name / label (e.g., "Dev Server")
  - Delay before running (ms) — useful for sequencing
  - Enabled/disabled toggle (disable without deleting)

- **Ordering**: commands run in the defined order, with optional delays between them
- **Edit auto-starts**: accessible from project settings panel
- **Example setup**:
  - Pane 1: `npm run dev` (label: "Dev Server", delay: 0ms)
  - Pane 2: `npx prisma studio` (label: "DB Studio", delay: 500ms)
  - Pane 3: `claude` (label: "Claude Code", delay: 1000ms)
  - Pane 4: `git status && git log --oneline -10` (label: "Git", delay: 0ms)

---

## PART 8 — Themes

Design **original themes from scratch** — do NOT replicate or reference themes from any other tool (no Dracula, no Synthwave, no Nord, no Tokyo Night — create entirely new visual identities).

**Required themes** (minimum 8 total):
1. **Your best dark theme** — this is the default and primary experience. Treat it as the "flagship" identity of the app. Apply the frontend-design skill fully to this one.
2. **Midnight Slate** — deep cool-gray dark, subtle blue undertones, minimal contrast noise
3. **Ember** — very dark background, warm amber/orange accent, feels like firelight in a dark room
4. **Ghost** — near-white dark theme: light gray backgrounds, dark text, feels clean but not a "light mode"
5. **Obsidian Sharp** — pure black, high saturation accents, maximum contrast without being harsh
6. **Daylight** — clean, bright, white-dominant light theme; primary for daytime use
7. **Parchment** — warm off-white, slightly sepia-tinted, easy on the eyes for long sessions
8. **At least 2 additional themes of your own creative direction** — take a real aesthetic risk on at least one

**Each theme controls**:
- App background / surface layers (3 depth levels: base, elevated, overlay)
- Text hierarchy: primary, secondary, muted, inverse
- Accent color (primary interactive color)
- Destructive / error color
- Success / warning colors
- Border and divider colors
- Terminal background and text
- Command block styling (user input vs output vs error backgrounds)
- Code editor theme (derived from the same palette)
- Sidebar, tab bar, toolbar styling
- Selection highlight and scrollbar
- Focus ring / keyboard navigation indicator

**Theme switcher**: accessible from the navigation bar (top-right icon or Cmd+Shift+T), live preview on hover before selecting.

---

## PART 9 — Settings Panel

A dedicated Settings panel (Cmd+,) with sections:
- **General**: default shell, default workspace template, startup behavior (restore last session / open empty / open specific project)
- **Editor**: font size, font family, tab size, word wrap, minimap toggle, format on save
- **Terminal**: font size, font family, scrollback limit, cursor style (block / underline / bar), cursor blink toggle, bell sound toggle
- **Keyboard Shortcuts**: display all shortcuts, allow rebinding (stretch goal)
- **Themes**: theme picker with live preview thumbnails
- **Projects**: list of all projects with edit / delete
- **About**: app version, links to docs

---

## PART 10 — Keyboard Shortcuts Reference

Implement and honor all of these shortcuts from day one:

| Shortcut | Action |
|---|---|
| Cmd+T | New workspace tab |
| Cmd+W | Close current workspace tab |
| Cmd+P | Quick Open (file search) |
| Cmd+F | Search in active terminal |
| Cmd+D | Split active pane |
| Cmd+1–9 | Switch to workspace tab by index |
| Cmd+Shift+T | Toggle theme picker |
| Cmd+Shift+. | Toggle hidden files in sidebar |
| Cmd+, | Open Settings |
| Cmd+K | Open project switcher / command palette |
| Cmd+B | Toggle sidebar |
| Cmd+Shift+E | Focus file browser |
| Cmd+Shift+K | Focus Kanban board |
| Cmd+Enter | Launch Claude Code in active pane |
| Cmd+Shift+N | New project |

---

## PART 11 — UI/UX Standards (Non-Negotiable)

Apply the frontend-design skill and the following:

- **GPU-accelerated rendering** where Electron allows (CSS transforms, canvas, WebGL for terminal if needed)
- **Smooth animations**: pane resize (spring physics), tab switch (cross-fade), card drag (shadow lift + cursor change), theme switch (short fade transition)
- **Focus states**: every interactive element has a visible keyboard focus ring — no exceptions
- **Hover states**: all buttons, pane headers, file tree items, Kanban cards
- **Keyboard navigation**: every feature reachable without a mouse
- **WCAG AA minimum** for color contrast in all themes, WCAG AAA in Daylight and high-contrast themes
- **Responsive to window resize**: panes reflow, sidebars can hide, text never overflows
- **Consistent 4px spacing grid** throughout all components
- **Typography system**:
  - Monospace font for all terminal content, code editor, file paths
  - Sans-serif font for all UI chrome (pane headers, task board, labels, nav)
  - Clear type scale: display, heading, body, label, caption
- **Consistent iconography**: pick one icon set and use it exclusively (Lucide, Phosphor, or Heroicons)
- **Empty states**: every empty state (no tasks, no projects, no files) has a brief directive message and a clear call to action — not a blank void
- **Error handling**: all errors surfaced visibly (toast or inline), never silent

---

## Technical Implementation Notes

### Project Structure
Organize the codebase cleanly:
```
src/
  main/           # Electron main process
    pty/          # node-pty management, shell spawning
    ipc/          # IPC handlers
    projects/     # Project data persistence
  renderer/       # React app (Electron renderer process)
    components/   # All React components
      terminal/   # Terminal & pane components
      editor/     # Monaco editor wrapper
      kanban/     # Task board components
      sidebar/    # File browser
      projects/   # Project management UI
      settings/   # Settings panel
      themes/     # Theme definitions and switcher
    hooks/        # Custom React hooks
    store/        # State management (Zustand or similar)
    styles/       # Global styles, theme CSS variables
  shared/         # Types/interfaces shared between main & renderer
```

### State Management
Use **Zustand** (preferred) or **Jotai** — NOT Redux. Keep it lean.

### Data Persistence
- Projects, settings, and Kanban boards: stored locally via **electron-store** or SQLite (your recommendation)
- No cloud sync, no telemetry, fully local and private
- Session state (last open panes, working directories): persisted to disk on app close, restored on launch

### Packaging
- Set up **electron-builder** for local builds (no distribution setup needed, just local run)
- Include a clear **README.md** with:
  - Prerequisites (Node version, etc.)
  - `npm install` + `npm start` instructions
  - How to build for production locally

---

## What NOT to Build

Do **not** build these features (explicitly excluded):
- Multi-agent swarm orchestration
- Persistent knowledge graph / memory system
- Cross-AI-assistant handoff prompt generation
- Cloud sync or accounts
- Any monetization or subscription logic

---

## Build Order

Build in this exact sequence — each layer must be solid before building on top of it:

1. **Project setup**: Electron + TypeScript + React + Tailwind scaffolding, dev tooling, hot reload
2. **PTY layer**: `node-pty` integration, shell spawning, IPC bridge between main and renderer
3. **Single-pane terminal UI**: chat-style renderer for one terminal — get this perfect before adding complexity
4. **Multi-pane layout**: split/resize system, workspace tabs, templates
5. **File browser sidebar**
6. **Monaco editor integration**
7. **Project management**: create, switch, persist projects
8. **Auto-start commands**
9. **Kanban task board**
10. **Settings panel**
11. **Themes**: implement full CSS variable token system, build all 8+ themes, theme switcher with live previews
12. **TerminalDeck carry-over features**: session persistence, pane type badges, Claude Code launch button, pane pinning
13. **Polish pass**: animations, micro-interactions, empty states, keyboard shortcuts audit, error handling, README

---

## Final Checklist Before You Start

- [ ] Read `/mnt/skills/public/frontend-design/SKILL.md`
- [ ] Identify and read any other helpful skill files under `/mnt/skills/`
- [ ] List all skill files you read
- [ ] Think through all architecture decisions in Step 0
- [ ] Surface all clarifying questions in one block
- [ ] Wait for my confirmation before writing any code
- [ ] Use the Feature Confirmation Protocol before every feature throughout the entire build

**Do not start building until I reply to your Step 0 questions. After that, follow the Feature Confirmation Protocol for every single feature without exception.**
