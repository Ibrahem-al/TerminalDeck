import { spawn, type IPty } from 'node-pty'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { statSync } from 'fs'
import { dirname, join } from 'path'
import type { PtySession, PtySpawnOptions, ShellKind } from '@shared/types'
import { buildShellLaunch } from './shellIntegration'
import { aiKeepAwake } from '../power/keepAwake'
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
/**
 * Small consecutive chunks are merged into the newest retained buffer until it
 * reaches this size. Without it a stream of tiny writes (keystroke echo, cursor
 * sequences) grows the retained-chunk array towards RING_CAP entries, and V8's
 * Array#shift stops being O(1) past ~8k elements — measured 106us/chunk at 8-byte
 * chunks, i.e. the very cliff this ring rewrite exists to remove. Merging keeps
 * the array around a hundred entries for any input pattern; the copy is bounded
 * by this constant, never by the ring size.
 */
const COALESCE_BYTES = 4096

interface Session {
  pty: IPty
  cwd: string
  shell: ShellKind
  exited: boolean
  /**
   * Scrollback ring for additional (phone / notch mini-terminal) subscribers,
   * held as the raw chunks rather than one contiguous Buffer. This runs on the
   * main thread for EVERY byte the shell prints, so it must stay O(chunk):
   * re-packing a contiguous 256 KiB ring per chunk cost 73-194us and ~512 KiB of
   * garbage each time (measured), and the resulting GC pauses stall the main
   * thread — which on Windows is also the thread servicing window messages.
   * The one Buffer.concat now happens in subscribe(), where it is rare.
   */
  chunks: Buffer[]
  /** Total bytes across `chunks` (<= RING_CAP + one chunk). */
  ringBytes: number
  headSeq: number
  subs: Map<string, RemoteSubscriber>
}

export class PtyManager {
  private sessions = new Map<string, Session>()
  // Env vars injected into EVERY spawned shell (set once the notch hook server
  // is listening). Always injected — behavior is gated at the hook server, so
  // toggling the notch mid-session doesn't leave older panes invisible to hooks.
  private extraEnv: Record<string, string> = {}
  // Notch controller taps: session activity ('data' per chunk with its byte
  // count, 'exit' once) and user input, for attention clearing and
  // working-state tracking.
  private activityListener: ((sessionId: string, event: 'data' | 'exit', bytes: number) => void) | null =
    null
  private writeListener: ((sessionId: string, data: string) => void) | null = null

  /** Env vars merged into every future spawn (TERMINALDECK_SESSION_ID is per-session). */
  setExtraEnv(env: Record<string, string>): void {
    this.extraEnv = env
  }

  setActivityListener(fn: (sessionId: string, event: 'data' | 'exit', bytes: number) => void): void {
    this.activityListener = fn
  }

  setWriteListener(fn: (sessionId: string, data: string) => void): void {
    this.writeListener = fn
  }

  /** The PTY's live size, for mini terminals that must match it exactly. */
  dims(sessionId: string): { cols: number; rows: number } | null {
    const s = this.sessions.get(sessionId)
    return s ? { cols: s.pty.cols, rows: s.pty.rows } : null
  }

  create(options: PtySpawnOptions, callbacks: SessionCallbacks): PtySession {
    const launch = buildShellLaunch(options.shell)
    const cwd = resolveSpawnDir(options.cwd)
    const sessionId = randomUUID()

    const pty = spawn(launch.path, launch.args, {
      name: 'xterm-256color',
      cols: Math.max(2, options.cols),
      rows: Math.max(2, options.rows),
      cwd,
      env: buildPtyEnv({
        ...this.extraEnv,
        ...options.env,
        TERMINALDECK_SESSION_ID: sessionId
      })
    })

    const session: Session = {
      pty,
      cwd,
      shell: launch.kind,
      exited: false,
      chunks: [],
      ringBytes: 0,
      headSeq: 0,
      subs: new Map()
    }
    this.sessions.set(sessionId, session)

    pty.onData((data) => {
      // Output means this terminal is doing work — hold the machine awake while
      // an agent/task keeps producing output (no-op unless the setting is on).
      aiKeepAwake.markTerminalActivity(sessionId)
      this.activityListener?.(sessionId, 'data', data.length)
      this.fanOut(session, data) // ring + phone subscribers
      callbacks.onData(data) // the owning renderer pane (unchanged path)
    })
    pty.onExit(({ exitCode }) => {
      session.exited = true
      aiKeepAwake.terminalGone(sessionId)
      this.activityListener?.(sessionId, 'exit', 0)
      for (const sub of session.subs.values()) sub.onExit(exitCode)
      this.sessions.delete(sessionId)
      callbacks.onExit(exitCode)
    })

    return { sessionId, shell: launch.kind, cwd, integrated: launch.integrated }
  }

  private fanOut(s: Session, data: string): void {
    // Always maintain the ring (capped) so a phone attaching later can replay
    // recent scrollback, even if nothing is attached right now. Appending a
    // chunk and dropping whole chunks off the front is O(chunk), not O(ring).
    const chunk = Buffer.from(data, 'utf8')
    s.headSeq += chunk.length
    const tail = s.chunks[s.chunks.length - 1]
    if (tail !== undefined && tail.length + chunk.length <= COALESCE_BYTES) {
      s.chunks[s.chunks.length - 1] = Buffer.concat([tail, chunk], tail.length + chunk.length)
    } else {
      s.chunks.push(chunk)
    }
    s.ringBytes += chunk.length
    while (s.ringBytes > RING_CAP) {
      const head = s.chunks[0]
      const excess = s.ringBytes - RING_CAP
      if (head.length <= excess) {
        s.chunks.shift()
        s.ringBytes -= head.length
      } else {
        // Partial trim of the oldest chunk. subarray is a free view, but a view
        // pins its whole backing allocation — so when we are discarding more
        // than we keep (one huge write arriving at once), copy instead. That
        // caps retained memory at 2x RING_CAP for any input pattern.
        const kept = head.subarray(excess)
        s.chunks[0] = excess > kept.length ? Buffer.from(kept) : kept
        s.ringBytes -= excess
      }
    }
    for (const sub of s.subs.values()) sub.onData(s.headSeq, chunk)
  }

  /** The seq of the first byte still held in the ring. */
  private bufStartSeq(s: Session): number {
    return s.headSeq - s.ringBytes
  }

  /** Flatten the retained chunks, optionally from an offset into the ring. */
  private ringSnapshot(s: Session, from = 0): Buffer {
    const all = Buffer.concat(s.chunks, s.ringBytes)
    return from > 0 ? all.subarray(from) : all
  }

  /** Attach an extra (phone) subscriber: replay buffered output after `since`,
   *  then stream live. Does not affect the owning renderer pane. */
  subscribe(sessionId: string, subscriberId: string, since: number, sub: RemoteSubscriber): SubscribeResult | null {
    const s = this.sessions.get(sessionId)
    if (!s) return null
    const bufStartSeq = this.bufStartSeq(s)
    let replay: Buffer
    let reset = false
    if (since >= s.headSeq) {
      // Caller is already up to date — nothing buffered to replay.
      replay = Buffer.alloc(0)
    } else if (since > 0 && since < bufStartSeq) {
      // The bytes the caller last saw have scrolled out of the ring (long gap).
      // Replay everything we still hold and signal a reset so the phone clears
      // its terminal first — otherwise the missing region garbles the screen.
      replay = this.ringSnapshot(s)
      reset = true
    } else {
      // Fresh attach (since 0) or an in-range resume: replay from the requested
      // point (clamped to the start of what we retain).
      replay = this.ringSnapshot(s, Math.max(0, since - bufStartSeq))
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
    if (s && !s.exited) {
      this.writeListener?.(sessionId, data)
      s.pty.write(data)
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    try {
      s.pty.resize(Math.max(2, cols), Math.max(2, rows))
      for (const sub of s.subs.values()) sub.onResize?.(s.pty.cols, s.pty.rows)
    } catch {
      // resizing a pty that exited this tick is a no-op, not an error
    }
  }

  kill(sessionId: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    this.sessions.delete(sessionId)
    aiKeepAwake.terminalGone(sessionId)
    try {
      s.pty.kill()
    } catch {
      // already dead
    }
  }

  disposeAll(): void {
    for (const [sessionId, s] of this.sessions) {
      aiKeepAwake.terminalGone(sessionId)
      try {
        s.pty.kill()
      } catch {
        // already dead
      }
    }
    this.sessions.clear()
  }
}
