import { powerSaveBlocker } from 'electron'

/** A terminal is treated as "working" until it has produced no output for this
 *  long — comfortably longer than any gap between an agent's streamed tokens or
 *  its once-a-second elapsed-time redraw, so an actively working agent is never
 *  seen as idle, while a terminal that truly falls quiet releases promptly. */
const TERMINAL_IDLE_MS = 90_000
/** How often we re-check tracked terminals for having gone quiet. */
const TERMINAL_SWEEP_MS = 20_000

/**
 * Holds the system awake (no idle system sleep) while AI work is in flight — but
 * only when the user has opted in via Settings › General › "Keep computer awake
 * while agents are working". Lets a batch of agents keep running after you step
 * away instead of stalling on sleep. Two independent kinds of work count, and the
 * blocker is held while *either* is active:
 *
 *  1. Embedded Claude chat sessions — tracked precisely per *turn* (see below).
 *  2. Terminal panes — an agent (or any task) run in a real terminal, tracked by
 *     output activity: while a pty keeps producing output it's "working", and it
 *     is released once it has been quiet for TERMINAL_IDLE_MS. A long-lived agent
 *     TUI like `claude` streams tokens and redraws its status line while working,
 *     so this stays engaged throughout a turn and lets go when it goes idle — no
 *     fragile parsing of any particular tool's on-screen UI.
 *
 * Uses 'prevent-app-suspension' (Windows ES_SYSTEM_REQUIRED): the system stays
 * awake but the display may still sleep — the same block the RemoteDeck server
 * uses. It runs on its own blocker id, independent of RemoteDeck's, so the two
 * never interfere with each other's start/stop.
 *
 * Chat busy is tracked as a per-agent *turn count*, not a boolean: a session can
 * have more than one turn in flight at once (e.g. a Kanban "send to pane" queues a
 * second prompt while the first is still running), and each turn ends with its
 * own `result`. Counting means the agent stays busy until every started turn has
 * finished — a boolean Set would clear on the first `result` and release the
 * block while later turns were still working. A session ending (exit / killed /
 * window gone) drops all of its outstanding turns at once. The blocker engages
 * only while at least one thing is working AND the setting is on, and is released
 * the instant either condition stops holding.
 */
class AiKeepAwake {
  private enabled = false
  /** agentId → number of turns sent but not yet resolved by a `result`. */
  private readonly inflight = new Map<string, number>()
  /** pty sessionId → timestamp (ms) of its most recent output. */
  private readonly terminals = new Map<string, number>()
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private blockerId: number | null = null

  /** Reflect the Settings toggle. Applies immediately. */
  setEnabled(on: boolean): void {
    if (this.enabled === on) return
    this.enabled = on
    this.apply()
  }

  /** A chat session started a turn (message sent, awaiting its result). */
  markBusy(agentId: string): void {
    this.inflight.set(agentId, (this.inflight.get(agentId) ?? 0) + 1)
    this.apply()
  }

  /** A chat session finished one turn (a `result` arrived) — one fewer in flight. */
  markIdle(agentId: string): void {
    const n = this.inflight.get(agentId)
    if (n === undefined) return // stray result with no tracked turn — ignore
    if (n <= 1) this.inflight.delete(agentId)
    else this.inflight.set(agentId, n - 1)
    this.apply()
  }

  /** A chat session ended (process exit, killed, or its window went away). */
  remove(agentId: string): void {
    if (this.inflight.delete(agentId)) this.apply()
  }

  /**
   * A terminal produced output — mark it working and keep it (and the machine)
   * awake until it falls quiet. Cheap enough to call on every pty data chunk:
   * when the setting is off it does nothing, and while a terminal is already
   * tracked it only refreshes its timestamp.
   */
  markTerminalActivity(sessionId: string): void {
    if (!this.enabled) return
    const isNew = !this.terminals.has(sessionId)
    this.terminals.set(sessionId, Date.now())
    if (isNew) {
      this.ensureSweep()
      this.apply() // first working terminal — maybe engage the blocker
    }
  }

  /** A terminal session ended (pty exit, killed, or its window went away). */
  terminalGone(sessionId: string): void {
    if (this.terminals.delete(sessionId)) {
      this.stopSweepIfIdle()
      this.apply()
    }
  }

  /** Drop all tracked work at once (app quit / dispose-all). */
  reset(): void {
    const had = this.inflight.size > 0 || this.terminals.size > 0
    this.inflight.clear()
    this.terminals.clear()
    this.stopSweep()
    if (had) this.apply()
  }

  private ensureSweep(): void {
    if (this.sweepTimer === null && this.terminals.size > 0) {
      this.sweepTimer = setInterval(() => this.sweep(), TERMINAL_SWEEP_MS)
    }
  }

  private stopSweep(): void {
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = null
    }
  }

  private stopSweepIfIdle(): void {
    if (this.terminals.size === 0) this.stopSweep()
  }

  /** Retire terminals that have gone quiet past the idle window. */
  private sweep(): void {
    const cutoff = Date.now() - TERMINAL_IDLE_MS
    let changed = false
    for (const [id, last] of this.terminals) {
      if (last <= cutoff) {
        this.terminals.delete(id)
        changed = true
      }
    }
    this.stopSweepIfIdle()
    if (changed) this.apply()
  }

  private apply(): void {
    const want = this.enabled && (this.inflight.size > 0 || this.terminals.size > 0)
    if (want && this.blockerId === null) {
      this.blockerId = powerSaveBlocker.start('prevent-app-suspension')
    } else if (!want && this.blockerId !== null) {
      if (powerSaveBlocker.isStarted(this.blockerId)) powerSaveBlocker.stop(this.blockerId)
      this.blockerId = null
    }
  }
}

/** App-wide singleton — the agent IPC, terminal pty stream, and settings save all drive it. */
export const aiKeepAwake = new AiKeepAwake()
