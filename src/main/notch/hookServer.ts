/**
 * Loopback HTTP endpoint that receives Claude Code hook events (SessionStart /
 * Notification / Stop / SessionEnd) from CLIs running inside TerminalDeck PTYs.
 *
 * Detection contract: PtyManager injects TERMINALDECK_SESSION_ID + the server's
 * port/token into every shell's env. The installed hook is a tiny wrapper
 * script (cmd on Windows, sh elsewhere) that exits instantly when those vars
 * are absent — so `claude` outside TerminalDeck never notices it — and
 * otherwise POSTs the hook's stdin JSON here via curl (no Node/Bun dependency;
 * curl ships with Windows 10 1803+ and macOS).
 */
import { createServer, type Server } from 'http'
import { randomBytes } from 'crypto'
import { app } from 'electron'
import { chmodSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface HookEvent {
  /** TERMINALDECK_SESSION_ID of the PTY the CLI runs in. */
  sessionId: string
  /** Claude Code hook name: SessionStart | Notification | Stop | SessionEnd | … */
  hookEventName: string
  /** Notification hook message ("Claude needs your permission…", "…waiting for your input"). */
  message?: string
  cwd?: string
}

const MAX_BODY = 256 * 1024

let server: Server | null = null
let port = 0
const token = randomBytes(16).toString('hex')
let listener: ((ev: HookEvent) => void) | null = null

export function onHookEvent(fn: (ev: HookEvent) => void): void {
  listener = fn
}

/** Env injected into every PTY once the server is listening (empty before). */
export function hookEnv(): Record<string, string> {
  if (port === 0) return {}
  return {
    TERMINALDECK_NOTCH_PORT: String(port),
    TERMINALDECK_NOTCH_TOKEN: token
  }
}

/** Where the wrapper scripts live (stable across launches — hooks reference them). */
export function hookScriptPath(): string {
  return join(app.getPath('userData'), process.platform === 'win32' ? 'notch-hook.cmd' : 'notch-hook.sh')
}

/**
 * Write the wrapper scripts (idempotent, every launch — keeps them current
 * after updates). The env gate lives in the SCRIPT, not the hook command, so
 * the installed hook is a bare quoted path that works under any shell.
 */
function writeHookScripts(): void {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  const cmd = [
    '@echo off',
    'if not defined TERMINALDECK_NOTCH_PORT exit /b 0',
    'curl.exe -s -m 2 -X POST -H "x-notch-token: %TERMINALDECK_NOTCH_TOKEN%" -H "x-notch-session: %TERMINALDECK_SESSION_ID%" --data-binary @- "http://127.0.0.1:%TERMINALDECK_NOTCH_PORT%/hook" >nul 2>nul',
    'exit /b 0',
    ''
  ].join('\r\n')
  const sh = [
    '#!/bin/sh',
    '[ -z "$TERMINALDECK_NOTCH_PORT" ] && exit 0',
    'curl -s -m 2 -X POST -H "x-notch-token: $TERMINALDECK_NOTCH_TOKEN" -H "x-notch-session: ${TERMINALDECK_SESSION_ID:-}" --data-binary @- "http://127.0.0.1:$TERMINALDECK_NOTCH_PORT/hook" >/dev/null 2>&1',
    'exit 0',
    ''
  ].join('\n')
  writeFileSync(join(dir, 'notch-hook.cmd'), cmd, 'utf8')
  const shPath = join(dir, 'notch-hook.sh')
  writeFileSync(shPath, sh, 'utf8')
  if (process.platform !== 'win32') {
    try {
      chmodSync(shPath, 0o755)
    } catch {
      // hooks will fail loudly enough if the script isn't executable
    }
  }
}

/**
 * Start the server on a random loopback port. Awaited before the first window
 * is created so every PTY spawn sees the real port in hookEnv().
 */
export function startHookServer(): Promise<void> {
  writeHookScripts()
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      const done = (code: number): void => {
        res.statusCode = code
        res.end()
      }
      if (req.method !== 'POST' || req.url !== '/hook') return done(404)
      if (req.headers['x-notch-token'] !== token) return done(403)
      const sessionId = String(req.headers['x-notch-session'] ?? '')
      let body = ''
      let over = false
      req.on('data', (chunk: Buffer) => {
        if (over) return
        body += chunk.toString('utf8')
        if (body.length > MAX_BODY) {
          over = true
          done(413)
        }
      })
      req.on('end', () => {
        if (over) return
        // Always 200 fast — a slow/failing response would stall Claude Code's
        // hook execution inside the user's session.
        done(200)
        if (sessionId === '') return
        try {
          const payload = JSON.parse(body) as Record<string, unknown>
          const hookEventName = typeof payload.hook_event_name === 'string' ? payload.hook_event_name : ''
          if (hookEventName === '') return
          listener?.({
            sessionId,
            hookEventName,
            message: typeof payload.message === 'string' ? payload.message : undefined,
            cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined
          })
        } catch {
          // malformed body — not ours to complain about
        }
      })
      req.on('error', () => {
        /* client vanished mid-request */
      })
    })
    server.on('error', (e) => {
      // Port grab failed (or runtime error) — hooks silently won't fire this
      // launch; heuristics still cover detection.
      console.error('[notch] hook server error', e)
      resolve()
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address()
      if (addr && typeof addr === 'object') port = addr.port
      resolve()
    })
  })
}

export function stopHookServer(): void {
  server?.close()
  server = null
  port = 0
}
