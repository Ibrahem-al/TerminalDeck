import type { IDisposable, Terminal } from '@xterm/xterm'

export interface ShellSignalCallbacks {
  /** Fires once, on the first shell prompt — safe to send queued input. */
  onReady?: () => void
  /** Fires when a real command finishes, with its exit code and run time (ms). */
  onExit?: (exitCode: number, durationMs: number) => void
  /** Fires whenever the shell reports its working directory (every prompt). */
  onCwd?: (cwd: string) => void
  /**
   * Fires at the input-start marker (133;B) with the column/line where the
   * editable input begins, and with null while a command runs (133;C). Lets the
   * UI tell the editable prompt apart from the prompt text and scrollback.
   */
  onInputStart?: (pos: { line: number; col: number } | null) => void
}

/** `file://host/path` → a plain filesystem path (handles the Windows `/C:/…` form). */
function fileUrlToPath(url: string): string {
  if (!url.startsWith('file://')) return url
  let rest = url.slice('file://'.length)
  const slash = rest.indexOf('/') // drop the host segment
  rest = slash === -1 ? '' : rest.slice(slash)
  try {
    rest = decodeURIComponent(rest)
  } catch {
    // malformed escapes — fall through with what we have
  }
  return /^\/[a-zA-Z]:/.test(rest) ? rest.slice(1) : rest
}

/**
 * OSC listener for our shell integration. It consumes the integration
 * sequences so they never render, and surfaces the signals a plain terminal
 * needs: "shell ready" (auto-start), "command exited" (Kanban auto-review),
 * and "working directory changed" (pane-header path). No command-block
 * rendering — this is a normal terminal.
 *
 * `running` gates the exit signal so empty prompts don't report a command.
 * (The PowerShell integration only emits `C` for non-empty input; bash's PS0
 * only prints before a real command — so empty Enter never trips this.)
 */
export function attachShellSignals(term: Terminal, cb: ShellSignalCallbacks): IDisposable {
  let sawFirstPrompt = false
  let running = false
  let commandStart = 0

  const reportCwd = (raw: string): void => {
    const cwd = raw.trim().replace(/^"|"$/g, '')
    if (cwd !== '') cb.onCwd?.(cwd)
  }

  const disposables = [
    // OSC 133 (FinalTerm) — prompt/command lifecycle markers
    term.parser.registerOscHandler(133, (data) => {
      const [type, arg] = data.split(';')
      switch (type) {
        case 'A':
          if (!sawFirstPrompt) {
            sawFirstPrompt = true
            cb.onReady?.()
          }
          break
        case 'B':
          cb.onInputStart?.({
            line: term.buffer.active.baseY + term.buffer.active.cursorY,
            col: term.buffer.active.cursorX
          })
          break
        case 'C':
          running = true
          commandStart = Date.now()
          cb.onInputStart?.(null)
          break
        case 'D':
          if (running) {
            running = false
            const code = Number.parseInt(arg ?? '0', 10)
            cb.onExit?.(Number.isNaN(code) ? 0 : code, commandStart ? Date.now() - commandStart : 0)
          }
          break
      }
      return true // consume — these markers must never print
    }),

    // OSC 9;9 (ConEmu) — current directory as a raw path (what our shells emit)
    term.parser.registerOscHandler(9, (data) => {
      const sep = data.indexOf(';')
      if (sep !== -1 && data.slice(0, sep) === '9') {
        reportCwd(data.slice(sep + 1))
        return true // consume our cwd report
      }
      return false // leave other OSC 9 uses (notifications, progress) alone
    }),

    // OSC 7 — current directory as a file:// URL (for user shell configs)
    term.parser.registerOscHandler(7, (data) => {
      reportCwd(fileUrlToPath(data))
      return true
    })
  ]

  return { dispose: () => disposables.forEach((d) => d.dispose()) }
}
