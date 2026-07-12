import { powerSaveBlocker } from 'electron'

/**
 * Holds the system awake (no idle system sleep) while one or more embedded
 * Claude chat sessions are actively working — but only when the user has opted
 * in via Settings › General › "Keep computer awake while AI is working". Lets a
 * batch of agents keep running after you step away instead of stalling on sleep.
 *
 * Uses 'prevent-app-suspension' (Windows ES_SYSTEM_REQUIRED): the system stays
 * awake but the display may still sleep — the same block the RemoteDeck server
 * uses. It runs on its own blocker id, independent of RemoteDeck's, so the two
 * never interfere with each other's start/stop.
 *
 * Busy is tracked as a per-agent *turn count*, not a boolean: a session can have
 * more than one turn in flight at once (e.g. a Kanban "send to pane" queues a
 * second prompt while the first is still running), and each turn ends with its
 * own `result`. Counting means the agent stays busy until every started turn has
 * finished — a boolean Set would clear on the first `result` and release the
 * block while later turns were still working. A session ending (exit / killed /
 * window gone) drops all of its outstanding turns at once. The blocker engages
 * only while at least one turn is in flight AND the setting is on, and is
 * released the instant either condition stops holding.
 */
class AiKeepAwake {
  private enabled = false
  /** agentId → number of turns sent but not yet resolved by a `result`. */
  private readonly inflight = new Map<string, number>()
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

  /** Drop all tracked sessions at once (app quit / dispose-all). */
  reset(): void {
    if (this.inflight.size === 0) return
    this.inflight.clear()
    this.apply()
  }

  private apply(): void {
    const want = this.enabled && this.inflight.size > 0
    if (want && this.blockerId === null) {
      this.blockerId = powerSaveBlocker.start('prevent-app-suspension')
    } else if (!want && this.blockerId !== null) {
      if (powerSaveBlocker.isStarted(this.blockerId)) powerSaveBlocker.stop(this.blockerId)
      this.blockerId = null
    }
  }
}

/** App-wide singleton — the agent IPC and settings save both drive it. */
export const aiKeepAwake = new AiKeepAwake()
