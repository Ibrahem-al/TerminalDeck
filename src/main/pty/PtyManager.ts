import { spawn, type IPty } from 'node-pty'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { statSync } from 'fs'
import { dirname, join } from 'path'
import type { PtySession, PtySpawnOptions, ShellKind } from '@shared/types'
import { buildShellLaunch } from './shellIntegration'
import type { RemoteSubscriber, SubscribeResult } from '../remote/backend'

interface SessionCallbacks {
  onData: (data: string) => void
  onExit: (exitCode: number) => void
}

/**
 * Build the child environment, giving CLIs a working way to open the browser for
 * OAuth/login (Claude Code's `claude`/`/login`, `gh`, `vercel`, MCP auth, …).
 *
 * Inside an embedded ConPTY the CLI's default opener (`cmd /c start …`) can
 * silently no-op, so authentication that "auto-opens the browser" just hangs.
 * Most tools (and the `open` npm package they use) honor the `BROWSER` env var,
 * so we default it to explorer.exe, which reliably hands the URL to the OS
 * default browser and works whether the tool spawns it directly or via a shell.
 * Only a default — a BROWSER already set by the user or project env wins.
 */
function buildPtyEnv(optionsEnv?: Record<string, string>): Record<string, string> {
  const env = { ...process.env, ...optionsEnv } as Record<string, string>
  if (process.platform === 'win32' && !env.BROWSER) {
    env.BROWSER = join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe')
  }
  return env
}

/**
 * Resolve a usable spawn directory. A restored terminal may point at a dir that
 * has since been deleted or lives on an unmounted drive; walk up to the nearest
 * existing ancestor (falling back to home) so node-pty never throws on spawn.
 */
function resolveSpawnDir(requested: string | undefined): string {
  const home = homedir()
  let dir = requested ?? home
  const seen = new Set<string>()
  while (dir && !seen.has(dir)) {
    try {
      if (statSync(dir).isDirectory()) return dir
    } catch {
      // missing / inaccessible — fall through and try the parent
    }
    seen.add(dir)
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return home
}

/** Recent output kept per session so a phone attaching mid-stream gets replay. */
const RING_CAP = 256 * 1024

interface Session {
  pty: IPty
  cwd: string
  shell: ShellKind
  exited: boolean
  // Scrollback ring + monotonic byte seq, for additional (phone) subscribers.
  ring: Buffer
  bufStartSeq: number
  headSeq: number
  subs: Map<string, RemoteSubscriber>
}

export class PtyManager {
  private sessions = new Map<string, Session>()

  create(options: PtySpawnOptions, callbacks: SessionCallbacks): PtySession {
    const launch = buildShellLaunch(options.shell)
    const cwd = resolveSpawnDir(options.cwd)
    const sessionId = randomUUID()

    const pty = spawn(launch.path, launch.args, {
      name: 'xterm-256color',
      cols: Math.max(2, options.cols),
      rows: Math.max(2, options.rows),
      cwd,
      env: buildPtyEnv(options.env)
    })

    const session: Session = {
      pty,
      cwd,
      shell: launch.kind,
      exited: false,
      ring: Buffer.alloc(0),
      bufStartSeq: 0,
      headSeq: 0,
      subs: new Map()
    }
    this.sessions.set(sessionId, session)

    pty.onData((data) => {
      this.fanOut(session, data) // ring + phone subscribers
      callbacks.onData(data) // the owning renderer pane (unchanged path)
    })
    pty.onExit(({ exitCode }) => {
      session.exited = true
      for (const sub of session.subs.values()) sub.onExit(exitCode)
      this.sessions.delete(sessionId)
      callbacks.onExit(exitCode)
    })

    return { sessionId, shell: launch.kind, cwd, integrated: launch.integrated }
  }

  private fanOut(s: Session, data: string): void {
    // Always maintain the ring (capped) so a phone attaching later can replay
    // recent scrollback, even if nothing is attached right now.
    const chunk = Buffer.from(data, 'utf8')
    s.headSeq += chunk.length
    const combined = Buffer.concat([s.ring, chunk])
    s.ring = combined.length > RING_CAP ? Buffer.from(combined.subarray(combined.length - RING_CAP)) : combined
    s.bufStartSeq = s.headSeq - s.ring.length
    for (const sub of s.subs.values()) sub.onData(s.headSeq, chunk)
  }

  /** Attach an extra (phone) subscriber: replay buffered output after `since`,
   *  then stream live. Does not affect the owning renderer pane. */
  subscribe(sessionId: string, subscriberId: string, since: number, sub: RemoteSubscriber): SubscribeResult | null {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    let replay: Buffer
    let reset = false
    if (since >= s.headSeq) {
      // Caller is already up to date — nothing buffered to replay.
      replay = Buffer.alloc(0)
    } else if (since > 0 && since < s.bufStartSeq) {
      // The bytes the caller last saw have scrolled out of the ring (long gap).
      // Replay everything we still hold and signal a reset so the phone clears
      // its terminal first — otherwise the missing region garbles the screen.
      replay = Buffer.from(s.ring)
      reset = true
    } else {
      // Fresh attach (since 0) or an in-range resume: replay from the requested
      // point (clamped to the start of what we retain).
      replay = Buffer.from(s.ring.subarray(Math.max(0, since - s.bufStartSeq)))
    }
    s.subs.set(subscriberId, sub)
    return {
      headSeq: s.headSeq,
      replay,
      reset,
      unsubscribe: () => {
        s.subs.delete(subscriberId)
      }
    }
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  write(sessionId: string, data: string): void {
    const s = this.sessions.get(sessionId)
    if (s && !s.exited) s.pty.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    try {
      s.pty.resize(Math.max(2, cols), Math.max(2, rows))
    } catch {
      // resizing a pty that exited this tick is a no-op, not an error
    }
  }

  kill(sessionId: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    this.sessions.delete(sessionId)
    try {
      s.pty.kill()
    } catch {
      // already dead
    }
  }

  disposeAll(): void {
    for (const [, s] of this.sessions) {
      try {
        s.pty.kill()
      } catch {
        // already dead
      }
    }
    this.sessions.clear()
  }
}
