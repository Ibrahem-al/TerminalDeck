import { spawn, type IPty } from 'node-pty'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import type { PtySession, PtySpawnOptions, ShellKind } from '@shared/types'
import { buildShellLaunch } from './shellIntegration'
import type { RemoteSubscriber, SubscribeResult } from '../remote/backend'

interface SessionCallbacks {
  onData: (data: string) => void
  onExit: (exitCode: number) => void
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
    const cwd = options.cwd ?? homedir()
    const sessionId = randomUUID()

    const pty = spawn(launch.path, launch.args, {
      name: 'xterm-256color',
      cols: Math.max(2, options.cols),
      rows: Math.max(2, options.rows),
      cwd,
      env: { ...process.env, ...options.env } as Record<string, string>
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
    if (since >= s.headSeq) replay = Buffer.alloc(0)
    else replay = Buffer.from(s.ring.subarray(Math.max(0, since - s.bufStartSeq)))
    s.subs.set(subscriberId, sub)
    return {
      headSeq: s.headSeq,
      replay,
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
