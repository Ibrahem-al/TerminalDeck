import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { ShellKind } from '@shared/types'
import { readXtermTheme } from './xtermTheme'
import { attachShellSignals } from './shellSignals'
import { registerPaneWriter, unregisterPaneWriter } from './inputBus'
import { useKanban } from '../../store/kanban'
import { usePaneCwd } from '../../store/paneCwd'
import { useSettings } from '../../store/settings'
import { useTheme } from '../../store/theme'
import { useWorkspace } from '../../store/workspace'
import { usePtySessions } from '../../store/ptySessions'

let beepCtx: AudioContext | null = null
function beep(): void {
  beepCtx ??= new AudioContext()
  const osc = beepCtx.createOscillator()
  const gain = beepCtx.createGain()
  osc.frequency.value = 740
  gain.gain.setValueAtTime(0.06, beepCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, beepCtx.currentTime + 0.12)
  osc.connect(gain).connect(beepCtx.destination)
  osc.start()
  osc.stop(beepCtx.currentTime + 0.13)
}

/** Theme-aware search highlight colours. */
function searchOptions(): ISearchOptions {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d8a956'
  return {
    caseSensitive: false,
    decorations: {
      matchBackground: `${accent}40`,
      matchOverviewRuler: accent,
      activeMatchBackground: accent,
      activeMatchColorOverviewRuler: accent
    }
  }
}

export interface SearchResults {
  count: number
  index: number
}

export interface TerminalSession {
  /** Ref callback — attach to the element that hosts the xterm view. */
  attachRef: (el: HTMLDivElement | null) => void
  /** True while a full-screen program (vim, htop) holds the alternate buffer. */
  altScreen: boolean
  /** Non-null once the shell process has exited. */
  exitCode: number | null
  searchResults: SearchResults
  restart: () => void
  focus: () => void
  paste: (text: string) => void
  getSelection: () => string
  clear: () => void
  search: (query: string, direction: 'next' | 'prev') => void
  clearSearch: () => void
}

export interface TerminalSessionOptions {
  shell?: ShellKind
  cwd?: string
  env?: Record<string, string>
  /** Workspace pane id — lets auto-start / "send to pane" route input here. */
  paneId?: string
  /** Command typed into the shell once it's ready (e.g. 'claude'). Re-runs on restart. */
  autoRun?: string
}

export function useTerminalSession({ shell, cwd, env, paneId, autoRun }: TerminalSessionOptions): TerminalSession {
  const [altScreen, setAltScreen] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResults>({ count: 0, index: -1 })

  const elRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const inputStartRef = useRef<{ line: number; col: number } | null>(null)
  const startedRef = useRef(false)
  const cleanupRef = useRef<(() => void)[]>([])

  const start = useCallback(
    async (el: HTMLDivElement): Promise<void> => {
      // correct glyph metrics require the mono font before xterm opens
      await Promise.all([
        document.fonts.load('400 13px "IBM Plex Mono"'),
        document.fonts.load('600 13px "IBM Plex Mono"')
      ])

      const ts = useSettings.getState().settings.terminal
      const term = new Terminal({
        allowProposedApi: true,
        cursorBlink: ts.cursorBlink,
        cursorStyle: ts.cursorStyle,
        fontFamily: '"IBM Plex Mono", Consolas, monospace',
        fontSize: ts.fontSize,
        lineHeight: 1.35,
        letterSpacing: 0,
        scrollback: ts.scrollback,
        theme: readXtermTheme()
      })
      termRef.current = term

      // Clipboard shortcuts, each individually toggleable in Settings → Terminal:
      //  • Ctrl+C       copies the selection if there is one, else passes through as SIGINT
      //  • Ctrl+V       pastes
      //  • Ctrl+Shift+C dedicated copy (never interrupts)
      //  • Ctrl+Shift+V dedicated paste
      // Matches Windows Terminal / VS Code. preventDefault stops xterm's native
      // paste handler from firing a second time on the same key event.
      const copySelection = (e: KeyboardEvent): void => {
        if (term.hasSelection()) {
          void navigator.clipboard.writeText(term.getSelection())
          term.clearSelection()
        }
        e.preventDefault()
      }
      const pasteClipboard = (e: KeyboardEvent): void => {
        e.preventDefault()
        void navigator.clipboard.readText().then((text) => {
          if (text !== '') term.paste(text)
        })
      }

      // Replace/delete a highlighted region of the *editable input* by driving the
      // shell. PowerShell: select the range (Shift+Right) then delete/replace it, so
      // it's a SINGLE PSReadLine undo (Ctrl+Z restores the whole thing). Other
      // shells lack shift-selection, so move to the end and backspace (per-char
      // undo). The 133;B marker (inputStartRef) bounds the editable region, so
      // selections touching the prompt or scrollback are ignored. `replacement` is
      // '' to just delete, or the typed character to replace. Returns true if acted.
      const isPwsh = shell === 'powershell' || shell === 'pwsh' || shell === undefined
      const replaceSelection = (replacement: string): boolean => {
        const id = sessionIdRef.current
        const sel = term.getSelectionPosition()
        const anchor = inputStartRef.current
        if (!id || !sel || !anchor) return false
        const buf = term.buffer.active
        if (buf.type === 'alternate' || buf.viewportY !== buf.baseY) return false
        const cols = term.cols
        const startLin = sel.start.y * cols + sel.start.x
        const endLin = sel.end.y * cols + sel.end.x // exclusive
        const anchorLin = anchor.line * cols + anchor.col
        if (endLin <= startLin || startLin < anchorLin) return false // empty or not editable
        const cursorLin = (buf.baseY + buf.cursorY) * cols + buf.cursorX
        const len = endLin - startLin
        let seq: string
        if (isPwsh) {
          const toStart = startLin - cursorLin
          seq = toStart > 0 ? '\x1b[C'.repeat(toStart) : toStart < 0 ? '\x1b[D'.repeat(-toStart) : ''
          seq += '\x1b[1;2C'.repeat(len) // Shift+Right ×len selects the range in PSReadLine
          seq += replacement === '' ? '\x7f' : replacement // delete the selection, or replace it
        } else {
          const toEnd = endLin - cursorLin
          seq = toEnd > 0 ? '\x1b[C'.repeat(toEnd) : toEnd < 0 ? '\x1b[D'.repeat(-toEnd) : ''
          seq += '\x7f'.repeat(len) + replacement
        }
        window.quarterdeck.pty.write(id, seq)
        term.clearSelection()
        return true
      }

      term.attachCustomKeyEventHandler((e): boolean => {
        if (e.type !== 'keydown') return true
        const keys = useSettings.getState().settings.terminal

        // Replace / delete a highlighted region of the editable input line
        if (keys.replaceSelectionOnType && !e.ctrlKey && !e.altKey && !e.metaKey && term.hasSelection()) {
          if (e.key === 'Backspace' || e.key === 'Delete') {
            if (replaceSelection('')) {
              e.preventDefault()
              return false
            }
          } else if (e.key.length === 1) {
            // printable: replace the selection with the typed character
            if (replaceSelection(e.key)) {
              e.preventDefault()
              return false
            }
          }
        }

        // Clipboard shortcuts (Ctrl / Ctrl+Shift + C/V)
        if (!e.ctrlKey || e.altKey || e.metaKey) return true
        const key = e.key.toLowerCase()
        if (e.shiftKey) {
          // Ctrl+Shift+C / Ctrl+Shift+V — no SIGINT conflict, so always pure copy/paste
          if (key === 'c' && keys.copyCtrlShiftC) {
            copySelection(e)
            return false
          }
          if (key === 'v' && keys.pasteCtrlShiftV) {
            pasteClipboard(e)
            return false
          }
          return true
        }
        // plain Ctrl+C only copies when text is selected, so SIGINT still works otherwise
        if (key === 'c' && keys.copyCtrlC && term.hasSelection()) {
          copySelection(e)
          return false
        }
        if (key === 'v' && keys.pasteCtrlV) {
          pasteClipboard(e)
          return false
        }
        return true
      })

      const fit = new FitAddon()
      term.loadAddon(fit)
      fitRef.current = fit
      const search = new SearchAddon()
      term.loadAddon(search)
      searchRef.current = search
      // Detect URLs and open them in the OS default app on Ctrl+click (Cmd on
      // mac). Plain click is left to cursor positioning / selection. main gates
      // the scheme to http(s), so terminal output can't launch arbitrary apps.
      term.loadAddon(
        new WebLinksAddon((event, uri) => {
          if (event.ctrlKey || event.metaKey) void window.quarterdeck.shell.openExternal(uri)
        })
      )
      term.open(el)
      try {
        const webgl = new WebglAddon()
        webgl.onContextLoss(() => webgl.dispose())
        term.loadAddon(webgl)
      } catch {
        // GPU unavailable — xterm falls back to its DOM renderer
      }
      fit.fit()

      const session = await window.quarterdeck.pty.create({
        shell,
        cwd,
        env,
        cols: term.cols,
        rows: term.rows
      })
      sessionIdRef.current = session.sessionId
      // register so the Agent can mirror this terminal to the phone
      if (paneId) usePtySessions.getState().setSession(paneId, session.sessionId)

      // expose this pane to the input bus once the shell can take input
      let readyTimer: ReturnType<typeof setTimeout> | undefined
      let autoRunSent = false
      const markReady = (): void => {
        clearTimeout(readyTimer)
        if (paneId) {
          registerPaneWriter(paneId, (data) => window.quarterdeck.pty.write(session.sessionId, data))
        }
        // auto-launch a command (e.g. `claude`) on the first ready prompt
        if (autoRun && !autoRunSent) {
          autoRunSent = true
          window.quarterdeck.pty.write(session.sessionId, autoRun + '\r')
        }
      }

      let signals: { dispose: () => void } | null = null
      if (session.integrated) {
        signals = attachShellSignals(term, {
          onReady: markReady,
          onExit: (code, durationMs) => {
            if (!paneId) return
            useKanban.getState().onPaneCommandExit(paneId, code)
            // Let main decide whether to alert (route + duration threshold).
            const name = useWorkspace.getState().panes[paneId]?.name ?? 'Terminal'
            window.quarterdeck.notify.taskComplete({ title: name, exitCode: code, durationMs })
          },
          onCwd: (cwd) => {
            if (paneId) usePaneCwd.getState().setCwd(paneId, cwd)
          },
          onInputStart: (pos) => {
            inputStartRef.current = pos
          }
        })
      } else {
        // no prompt marker from cmd.exe — give the shell a beat to start
        readyTimer = setTimeout(markReady, 1200)
      }

      const offSearch = search.onDidChangeResults(({ resultCount, resultIndex }) =>
        setSearchResults({ count: resultCount, index: resultIndex })
      )
      const offBell = term.onBell(() => {
        if (useSettings.getState().settings.terminal.bell) beep()
      })
      const offBuffer = term.buffer.onBufferChange((buf) => setAltScreen(buf.type === 'alternate'))
      const offData = window.quarterdeck.pty.onData((id, data) => {
        if (id === session.sessionId) term.write(data)
      })
      const offExit = window.quarterdeck.pty.onExit((id, code) => {
        if (id === session.sessionId) setExitCode(code)
      })
      const offInput = term.onData((data) => {
        window.quarterdeck.pty.write(session.sessionId, data)
      })
      const offResize = term.onResize(({ cols, rows }) => {
        window.quarterdeck.pty.resize(session.sessionId, cols, rows)
      })

      // Click-to-position the cursor by sending arrow keys (like VS Code / iTerm2).
      // Mode (Settings → Terminal): 'off', 'alt' (Alt+click), or 'plain' (any click).
      // A drag is left to selection; a resulting selection (double-click word) is
      // left alone. At the shell prompt only horizontal arrows are sent (Up/Down
      // there recalls history) and clicks before the input start are ignored. In
      // full-screen apps (claude, vim) we require Alt and use 2D arrows, best-effort.
      let downX = 0
      let downY = 0
      const onTermMouseDown = (ev: MouseEvent): void => {
        if (ev.button === 0) {
          downX = ev.clientX
          downY = ev.clientY
        }
      }
      const onTermMouseUp = (ev: MouseEvent): void => {
        const id = sessionIdRef.current
        if (!id || ev.button !== 0) return
        if (ev.ctrlKey) return // Ctrl+click is reserved for opening links
        const mode = useSettings.getState().settings.terminal.clickMovesCursor
        if (mode === 'off') return
        // App grabbed the mouse (e.g. claude in fullscreen) — let it handle clicks.
        if (term.modes.mouseTrackingMode !== 'none') return
        const buf = term.buffer.active
        const inAlt = buf.type === 'alternate'
        // prompt: follow the mode; full-screen apps: Alt only (deliberate)
        if (!(inAlt ? ev.altKey : mode === 'plain' || ev.altKey)) return
        if (Math.abs(ev.clientX - downX) > 4 || Math.abs(ev.clientY - downY) > 4) return // drag → selection
        if (term.hasSelection()) return // double-click word select etc.
        if (!inAlt && buf.viewportY !== buf.baseY) return // scrolled up in history
        const screen = el.querySelector('.xterm-screen') as HTMLElement | null
        if (!screen) return
        const rect = screen.getBoundingClientRect()
        const cols = term.cols
        const cellW = rect.width / cols
        const cellH = rect.height / term.rows
        if (cellW <= 0 || cellH <= 0) return
        // cursor sits on a cell boundary, so round (not floor) to the nearest gap
        const colRaw = Math.round((ev.clientX - rect.left) / cellW)
        const row = Math.min(term.rows - 1, Math.max(0, Math.floor((ev.clientY - rect.top) / cellH)))
        if (inAlt) {
          const col = Math.min(cols - 1, Math.max(0, colRaw))
          const vy = row - buf.cursorY
          const vx = col - buf.cursorX
          let seq = ''
          if (vy > 0) seq += '\x1b[B'.repeat(vy)
          else if (vy < 0) seq += '\x1b[A'.repeat(-vy)
          if (vx > 0) seq += '\x1b[C'.repeat(vx)
          else if (vx < 0) seq += '\x1b[D'.repeat(-vx)
          if (seq !== '') window.quarterdeck.pty.write(id, seq)
        } else {
          const col = Math.min(cols, Math.max(0, colRaw))
          const targetLin = (buf.baseY + row) * cols + col
          const anchor = inputStartRef.current
          if (anchor && targetLin < anchor.line * cols + anchor.col) return // prompt / output
          const delta = targetLin - ((buf.baseY + buf.cursorY) * cols + buf.cursorX)
          if (delta === 0) return
          window.quarterdeck.pty.write(id, (delta > 0 ? '\x1b[C' : '\x1b[D').repeat(Math.abs(delta)))
        }
      }
      el.addEventListener('mousedown', onTermMouseDown, true)
      el.addEventListener('mouseup', onTermMouseUp, true)

      // ── Text selection inside full-screen apps (Claude Code, vim) ──────────
      // Those apps turn on mouse reporting, so a normal drag is sent to the app
      // and never becomes a selection — leaving nothing to copy. When enabled, we
      // intercept a plain left drag over such an app and drive a local xterm
      // selection ourselves via term.select(); finishing it can auto-copy. Plain
      // clicks are swallowed here (they'd otherwise be reported to the app), which
      // is the documented trade-off. Shift+drag is left to xterm's own force-
      // selection, and non-mouse-mode terminals are untouched.
      const cellAt = (clientX: number, clientY: number): { col: number; row: number } | null => {
        const screen = el.querySelector('.xterm-screen') as HTMLElement | null
        if (!screen) return null
        const rect = screen.getBoundingClientRect()
        const cellW = rect.width / term.cols
        const cellH = rect.height / term.rows
        if (cellW <= 0 || cellH <= 0) return null
        const col = Math.min(term.cols - 1, Math.max(0, Math.floor((clientX - rect.left) / cellW)))
        const relRow = Math.min(term.rows - 1, Math.max(0, Math.floor((clientY - rect.top) / cellH)))
        return { col, row: term.buffer.active.viewportY + relRow }
      }
      const appSelectArmed = (ev: MouseEvent): boolean =>
        useSettings.getState().settings.terminal.mouseSelectInApps &&
        ev.button === 0 &&
        !ev.shiftKey &&
        !ev.altKey &&
        !ev.ctrlKey &&
        !ev.metaKey &&
        term.modes.mouseTrackingMode !== 'none'

      let selAnchor: { col: number; row: number } | null = null
      let selDragging = false
      const applySel = (cur: { col: number; row: number }): void => {
        if (!selAnchor) return
        const cols = term.cols
        const aLin = selAnchor.row * cols + selAnchor.col
        const cLin = cur.row * cols + cur.col
        const start = Math.min(aLin, cLin)
        const end = Math.max(aLin, cLin)
        term.select(start % cols, Math.floor(start / cols), end - start + 1)
      }
      const copyOnSelect = (): void => {
        if (useSettings.getState().settings.terminal.copyOnSelect && term.hasSelection()) {
          void navigator.clipboard.writeText(term.getSelection())
        }
      }
      const onSelDown = (ev: MouseEvent): void => {
        if (!appSelectArmed(ev)) return
        const cell = cellAt(ev.clientX, ev.clientY)
        if (!cell) return
        ev.preventDefault()
        ev.stopImmediatePropagation()
        selAnchor = cell
        selDragging = false
        term.clearSelection()
      }
      const onSelMove = (ev: MouseEvent): void => {
        if (!selAnchor || (ev.buttons & 1) === 0) return
        const cell = cellAt(ev.clientX, ev.clientY)
        if (!cell) return
        ev.preventDefault()
        ev.stopImmediatePropagation()
        // Not a real drag until the pointer leaves the anchor cell — otherwise a
        // jittery click would select one glyph and (with copy-on-select) clobber
        // the clipboard.
        if (cell.col === selAnchor.col && cell.row === selAnchor.row) return
        selDragging = true
        applySel(cell)
      }
      const onSelUp = (ev: MouseEvent): void => {
        if (!selAnchor) return
        ev.preventDefault()
        ev.stopImmediatePropagation()
        const wasDragging = selDragging
        selAnchor = null
        selDragging = false
        if (wasDragging) copyOnSelect()
        else term.clearSelection() // a plain click — nothing to select
        // We swallowed the mouse events, so xterm didn't refocus its input; a drag
        // also emits no `click` for the pane's focus handler — refocus so typing works.
        term.focus()
      }
      // Auto-copy a native selection once the drag finishes (bubble phase, after
      // xterm has set the selection): a normal terminal, or a Shift+drag inside a
      // mouse-mode app (Shift forces xterm's own selection there). The app-armed
      // path can't reach here — it stopImmediatePropagation's in the capture phase.
      const onNativeSelectUp = (ev: MouseEvent): void => {
        if (ev.button !== 0) return
        if (term.modes.mouseTrackingMode !== 'none' && !ev.shiftKey) return
        copyOnSelect()
      }
      el.addEventListener('mousedown', onSelDown, true)
      el.addEventListener('mousemove', onSelMove, true)
      el.addEventListener('mouseup', onSelUp, true)
      el.addEventListener('mouseup', onNativeSelectUp)

      let raf = 0
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
          if (el.clientWidth > 0 && el.clientHeight > 0) fit.fit()
        })
      })
      observer.observe(el)

      term.focus()

      cleanupRef.current = [
        () => observer.disconnect(),
        () => cancelAnimationFrame(raf),
        () => clearTimeout(readyTimer),
        () => {
          if (paneId) unregisterPaneWriter(paneId)
        },
        () => {
          if (paneId) usePaneCwd.getState().clear(paneId)
        },
        () => {
          if (paneId) usePtySessions.getState().clearSession(paneId)
        },
        () => el.removeEventListener('mousedown', onTermMouseDown, true),
        () => el.removeEventListener('mouseup', onTermMouseUp, true),
        () => el.removeEventListener('mousedown', onSelDown, true),
        () => el.removeEventListener('mousemove', onSelMove, true),
        () => el.removeEventListener('mouseup', onSelUp, true),
        () => el.removeEventListener('mouseup', onNativeSelectUp),
        () => offSearch.dispose(),
        () => offBell.dispose(),
        () => offBuffer.dispose(),
        () => offData(),
        () => offExit(),
        () => offInput.dispose(),
        () => offResize.dispose(),
        () => signals?.dispose(),
        () => {
          if (sessionIdRef.current) void window.quarterdeck.pty.kill(sessionIdRef.current)
        },
        () => term.dispose()
      ]
    },
    [shell, cwd, env, paneId, autoRun]
  )

  const attachRef = useCallback(
    (el: HTMLDivElement | null): void => {
      elRef.current = el
      if (el && !startedRef.current) {
        startedRef.current = true
        void start(el)
      }
    },
    [start]
  )

  const restart = useCallback((): void => {
    for (const fn of cleanupRef.current) fn()
    cleanupRef.current = []
    termRef.current = null
    searchRef.current = null
    fitRef.current = null
    sessionIdRef.current = null
    inputStartRef.current = null
    setAltScreen(false)
    setExitCode(null)
    setSearchResults({ count: 0, index: -1 })
    if (elRef.current) {
      void start(elRef.current)
    } else {
      startedRef.current = false
    }
  }, [start])

  const focus = useCallback((): void => termRef.current?.focus(), [])

  const paste = useCallback((text: string): void => {
    termRef.current?.paste(text)
    termRef.current?.focus()
  }, [])

  const getSelection = useCallback((): string => {
    const term = termRef.current
    if (term?.hasSelection()) return term.getSelection()
    return window.getSelection()?.toString() ?? ''
  }, [])

  const clear = useCallback((): void => termRef.current?.clear(), [])

  const search = useCallback((query: string, direction: 'next' | 'prev'): void => {
    const addon = searchRef.current
    if (!addon || query === '') return
    if (direction === 'next') addon.findNext(query, searchOptions())
    else addon.findPrevious(query, searchOptions())
  }, [])

  const clearSearch = useCallback((): void => {
    searchRef.current?.clearDecorations()
    setSearchResults({ count: 0, index: -1 })
  }, [])

  // re-theme the live terminal when the app theme changes (incl. previews)
  const themeVersion = useTheme((s) => s.version)
  useEffect(() => {
    const term = termRef.current
    if (term) term.options.theme = readXtermTheme()
  }, [themeVersion])

  // live-apply terminal settings to the running instance
  const terminalSettings = useSettings((s) => s.settings.terminal)
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = terminalSettings.fontSize
    term.options.cursorStyle = terminalSettings.cursorStyle
    term.options.cursorBlink = terminalSettings.cursorBlink
    term.options.scrollback = terminalSettings.scrollback
    fitRef.current?.fit()
  }, [terminalSettings])

  // unmount cleanup
  useEffect(() => {
    return () => {
      for (const fn of cleanupRef.current) fn()
      cleanupRef.current = []
    }
  }, [])

  return {
    attachRef,
    altScreen,
    exitCode,
    searchResults,
    restart,
    focus,
    paste,
    getSelection,
    clear,
    search,
    clearSearch
  }
}
