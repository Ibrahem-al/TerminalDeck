/**
 * The notch's brain: collects agent-attention events from every source (chat
 * pane events, Claude Code hooks, renderer heuristics, finished commands),
 * applies the clearing rules, and pushes the merged state to the notch window.
 *
 * Invariant: at most ONE attention per session/agent — the latest wins — so the
 * pulldown never accumulates stale duplicates of the same pane.
 *
 * Clearing rules (from the design review):
 * - chat: user replies / responds to the permission / turn result → clear or
 *   replace; agent exit → clear.
 * - terminal: PTY output resuming (>1.5s after the attention was raised, so the
 *   prompt's own redraw doesn't self-clear), an Enter keystroke to the PTY, or
 *   session exit all clear; a Stop hook replaces a question with turn-done.
 * - heuristic 'maybe-waiting': ANY output clears instantly, and heuristic
 *   signals are ignored for sessions with hook coverage (hooks are exact).
 */
import { BrowserWindow, powerMonitor } from 'electron'
import { randomUUID } from 'crypto'
import {
  IPC,
  type AppSettings,
  type NotchAgentSignal,
  type NotchAttention,
  type NotchJumpTarget,
  type NotchSessionSummary,
  type NotchStatePayload,
  type TaskCompletePayload
} from '@shared/types'
import { onReportedSessionsChange, reportedSessions, sessionInfo, windowIdForSession } from '../remote/sessionRegistry'
import {
  createNotchWindow,
  destroyNotchWindow,
  focusNotch,
  isNotchWindow,
  sendToNotch,
  setHiddenForEmpty,
  setHiddenForFocus,
  setNotchScale
} from './NotchWindow'
import type { HookEvent } from './hookServer'

const MAX_ATTENTIONS = 8
/** Output within this window after an attention is its own redraw, not an answer. */
const OUTPUT_CLEAR_GRACE_MS = 1500
/**
 * Output alone only clears an attention once it looks like REAL resumed work.
 * TUIs (Claude Code's Ink UI) re-render on timers even while sitting at a
 * permission prompt, so small post-grace trickles must not eat the alert —
 * that made questions vanish within seconds in practice.
 */
const OUTPUT_CLEAR_BYTES = 4096
const OUTPUT_CLEAR_BYTES_HEURISTIC = 1024

type NotchSettings = AppSettings['notch']

function preview(value: unknown, max = 200): string {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return text.length > max ? text.slice(0, max) + '…' : text
  } catch {
    return ''
  }
}

class NotchController {
  private attentions = new Map<string, NotchAttention>() // key: s:<sessionId> | a:<agentId>
  private workingChat = new Set<string>() // agentIds with a turn in flight
  private workingCmd = new Set<string>() // sessionIds with an OSC-133 command running
  private hookCovered = new Set<string>() // sessionIds that pinged SessionStart
  private raisedAt = new Map<string, number>() // key → ts, for the output-clear grace
  private outputSince = new Map<string, number>() // key → bytes seen after the grace
  private agentPanes = new Map<string, { wcId: number; paneId?: string }>()
  private settings: NotchSettings = {
    enabled: false,
    visibility: 'always',
    scale: 1,
    showWhenFocused: true,
    autoFocusQuestions: true,
    heuristics: true,
    notifyTurnDone: true,
    notifyCommandDone: true,
    minCommandSec: 15
  }
  private winBuild = 0
  private expandHint: string | undefined
  private pushTimer: ReturnType<typeof setTimeout> | null = null

  init(settings: NotchSettings, winBuild: number): void {
    this.winBuild = winBuild
    // The dashboard lists every reported pane — re-push as panes come and go.
    onReportedSessionsChange(() => this.push())
    this.applySettings(settings)
  }

  applySettings(settings: NotchSettings): void {
    const wasEnabled = this.settings.enabled
    this.settings = settings
    if (settings.enabled && !wasEnabled) createNotchWindow(this.winBuild)
    else if (!settings.enabled && wasEnabled) destroyNotchWindow()
    setNotchScale(settings.scale)
    // Recompute focus suppression from LIVE focus — the flag is otherwise only
    // updated on focus transitions, so toggling showWhenFocused (or re-enabling
    // the notch) while an app window is focused would leave it stale.
    const focused = BrowserWindow.getFocusedWindow()
    setHiddenForFocus(!settings.showWhenFocused && focused !== null && !isNotchWindow(focused))
    this.push()
  }

  get showWhenFocused(): boolean {
    return this.settings.showWhenFocused
  }

  state(): NotchStatePayload {
    const attentions = [...this.attentions.values()].sort((a, b) => b.createdAt - a.createdAt)
    // Never emit a dangling hint: the attention it named may have cleared (or
    // been replaced under the same key, which mints a new id) since it was set.
    const hint =
      this.expandHint && attentions.some((a) => a.id === this.expandHint) ? this.expandHint : undefined
    // The dashboard: every reported terminal pane + every live chat pane.
    const sessions: NotchSessionSummary[] = reportedSessions()
      .filter((s) => s.alive)
      .map((s) => ({
        kind: 'terminal' as const,
        sessionId: s.id,
        paneId: s.paneId,
        title: s.title,
        cwd: s.cwd,
        shell: s.shell,
        working: this.workingCmd.has(s.id)
      }))
    for (const [agentId] of this.agentPanes) {
      sessions.push({
        kind: 'chat',
        agentId,
        paneId: this.agentPanes.get(agentId)?.paneId,
        title: 'Claude chat',
        working: this.workingChat.has(agentId)
      })
    }
    return {
      attentions,
      sessions,
      working: this.workingChat.size + this.workingCmd.size,
      ui: { scale: this.settings.scale },
      expandHint: hint
    }
  }

  /* ── inputs: embedded chat panes ─────────────────────────────────── */

  agentQuestion(
    agentId: string,
    wcId: number,
    paneId: string | undefined,
    requestId: string,
    toolName: string,
    input: unknown
  ): void {
    this.agentPanes.set(agentId, { wcId, paneId })
    this.set(`a:${agentId}`, {
      kind: 'question',
      source: 'chat',
      agentId,
      paneId,
      title: 'Claude chat',
      detail: `wants to use ${toolName}`,
      requestId,
      toolName,
      inputPreview: preview(input)
    })
    this.expandHint = this.attentions.get(`a:${agentId}`)?.id
    this.maybeFocusForQuestion()
    this.push()
  }

  agentResult(agentId: string, wcId: number, paneId: string | undefined, isError: boolean): void {
    this.agentPanes.set(agentId, { wcId, paneId })
    this.workingChat.delete(agentId)
    if (this.settings.notifyTurnDone) {
      this.set(`a:${agentId}`, {
        kind: 'turn-done',
        source: 'chat',
        agentId,
        paneId,
        title: 'Claude chat',
        detail: isError ? 'turn failed' : 'finished — waiting for you'
      })
    } else {
      this.clear(`a:${agentId}`)
    }
    this.push()
  }

  /** The user engaged with the chat (sent a message / answered the permission). */
  agentEngaged(agentId: string, nowWorking: boolean): void {
    if (nowWorking) this.workingChat.add(agentId)
    this.clear(`a:${agentId}`)
    this.push()
  }

  agentGone(agentId: string): void {
    this.workingChat.delete(agentId)
    this.agentPanes.delete(agentId)
    this.clear(`a:${agentId}`)
    this.push()
  }

  /* ── inputs: Claude Code hooks (terminal panes) ──────────────────── */

  hookEvent(ev: HookEvent): void {
    const key = `s:${ev.sessionId}`
    const title = sessionInfo(ev.sessionId)?.title ?? 'Terminal agent'
    switch (ev.hookEventName) {
      case 'SessionStart':
        this.hookCovered.add(ev.sessionId)
        // A fresh agent session supersedes any stale attention for the pane.
        this.clear(key)
        break
      case 'Notification': {
        // Two shapes: permission prompts (immediate — auto-expand) and the
        // ≥60s idle "waiting for your input" (surface, but don't pop open).
        this.hookCovered.add(ev.sessionId)
        const isPermission = /permission|approv/i.test(ev.message ?? '')
        this.set(key, {
          kind: 'question',
          source: 'hook',
          sessionId: ev.sessionId,
          paneId: sessionInfo(ev.sessionId)?.paneId,
          title,
          detail: ev.message ?? 'needs your input'
        })
        if (isPermission) {
          this.expandHint = this.attentions.get(key)?.id
          this.maybeFocusForQuestion()
        }
        break
      }
      case 'Stop':
        // The primary "done — look at me" signal: questions asked in plain
        // assistant text only ever surface through Stop (Notification waits 60s).
        this.hookCovered.add(ev.sessionId)
        if (this.settings.notifyTurnDone) {
          this.set(key, {
            kind: 'turn-done',
            source: 'hook',
            sessionId: ev.sessionId,
            paneId: sessionInfo(ev.sessionId)?.paneId,
            title,
            detail: 'finished a turn — waiting for you'
          })
        } else {
          this.clear(key)
        }
        break
      case 'SessionEnd':
        this.hookCovered.delete(ev.sessionId)
        this.clear(key)
        break
    }
    this.push()
  }

  /* ── inputs: renderer signals (heuristics / bell / OSC 9 / C-D) ──── */

  agentSignal(sessionId: string, signal: NotchAgentSignal): void {
    if (signal.kind === 'command-state') {
      if (signal.running) this.workingCmd.add(sessionId)
      else {
        this.workingCmd.delete(sessionId)
        // The foreground command ended however it died (OSC 133 D fires even
        // when claude crashed and no SessionEnd hook ran) — drop hook coverage
        // so the pane's heuristics come back for whatever runs next. A live
        // claude re-covers itself on its next hook ping.
        this.hookCovered.delete(sessionId)
      }
      this.push()
      return
    }
    // Best-effort hints only matter without hook coverage, and only if wanted.
    if (!this.settings.heuristics || this.hookCovered.has(sessionId)) return
    const title = sessionInfo(sessionId)?.title ?? 'Terminal'
    const detail =
      signal.kind === 'osc9'
        ? preview(signal.message, 120)
        : signal.kind === 'bell'
          ? 'rang the bell'
          : (signal.detail ?? 'may be waiting for input')
    this.set(`s:${sessionId}`, {
      kind: 'maybe-waiting',
      source: 'heuristic',
      sessionId,
      paneId: sessionInfo(sessionId)?.paneId,
      title,
      detail
    })
    this.push()
  }

  /* ── inputs: finished shell commands ─────────────────────────────── */

  commandDone(p: TaskCompletePayload): void {
    if (!this.settings.notifyCommandDone) return
    if (p.durationMs < this.settings.minCommandSec * 1000) return
    if (!p.sessionId) return
    const mins = Math.floor(p.durationMs / 60_000)
    const secs = Math.round((p.durationMs % 60_000) / 1000)
    const took = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
    this.set(`s:${p.sessionId}`, {
      kind: 'command-done',
      source: 'command',
      sessionId: p.sessionId,
      paneId: p.paneId,
      title: p.title,
      detail: p.exitCode === 0 ? `command finished · ${took}` : `exit ${p.exitCode} · ${took}`
    })
    this.push()
  }

  /* ── inputs: raw PTY lifecycle (attention clearing) ──────────────── */

  ptyActivity(sessionId: string, event: 'data' | 'exit', bytes: number): void {
    const key = `s:${sessionId}`
    if (event === 'exit') {
      this.workingCmd.delete(sessionId)
      this.hookCovered.delete(sessionId)
      if (this.attentions.has(key)) {
        this.clear(key)
        this.push()
      }
      return
    }
    const attention = this.attentions.get(key)
    if (!attention) return
    // Output-based clearing must mean REAL resumed work, not a TUI redraw
    // tick: wait out the grace, then require a substantial cumulative burst.
    if (Date.now() - (this.raisedAt.get(key) ?? 0) <= OUTPUT_CLEAR_GRACE_MS) return
    const seen = (this.outputSince.get(key) ?? 0) + bytes
    this.outputSince.set(key, seen)
    const threshold =
      attention.source === 'heuristic' ? OUTPUT_CLEAR_BYTES_HEURISTIC : OUTPUT_CLEAR_BYTES
    if (seen >= threshold) {
      this.clear(key)
      this.push()
    }
  }

  ptyWrite(sessionId: string, data: string): void {
    // An Enter aimed at this session (from the pane, the phone, or the notch
    // itself) means the user is answering — the alert has done its job.
    if (!data.includes('\r')) return
    const key = `s:${sessionId}`
    if (this.attentions.has(key)) {
      this.clear(key)
      this.push()
    }
  }

  /* ── actions from the notch renderer ─────────────────────────────── */

  dismiss(attentionId: string): void {
    for (const [key, a] of this.attentions) {
      if (a.id === attentionId) {
        this.clear(key)
        this.push()
        return
      }
    }
  }

  /** Focus a pane in its real app window — by attention, or any listed session. */
  jump(target: NotchJumpTarget): void {
    let sessionId = target.sessionId
    let agentId = target.agentId
    let paneId: string | undefined
    if (target.attentionId) {
      const attention = [...this.attentions.values()].find((a) => a.id === target.attentionId)
      if (!attention) return
      sessionId = attention.sessionId
      agentId = attention.agentId
      paneId = attention.paneId
    }
    let wcId: number | null = null
    if (agentId) {
      const loc = this.agentPanes.get(agentId)
      wcId = loc?.wcId ?? null
      paneId = paneId ?? loc?.paneId
    } else if (sessionId) {
      wcId = windowIdForSession(sessionId)
      paneId = paneId ?? sessionInfo(sessionId)?.paneId
    }
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.id === wcId)
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (paneId) win.webContents.send(IPC.PaneFocus, { paneId })
  }

  dispose(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = null
  }

  /**
   * Auto-focus for a just-raised question: hand the pulldown the keyboard so
   * the answer can be typed immediately — but ONLY when the user has been
   * input-idle for a beat (getSystemIdleTime counts seconds since any
   * keyboard/mouse activity), so it never steals keystrokes from someone
   * mid-typing in another app. Delayed past the state-push debounce so the
   * renderer has already expanded when focus arrives.
   */
  private maybeFocusForQuestion(): void {
    if (!this.settings.autoFocusQuestions) return
    if (powerMonitor.getSystemIdleTime() < 2) return
    setTimeout(() => focusNotch(), 250)
  }

  /* ── internals ───────────────────────────────────────────────────── */

  private set(key: string, attention: Omit<NotchAttention, 'id' | 'createdAt'>): void {
    this.attentions.set(key, { ...attention, id: randomUUID(), createdAt: Date.now() })
    this.raisedAt.set(key, Date.now())
    this.outputSince.delete(key)
    if (this.attentions.size > MAX_ATTENTIONS) {
      const oldest = [...this.attentions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0]
      this.attentions.delete(oldest[0])
    }
  }

  private clear(key: string): void {
    this.attentions.delete(key)
    this.raisedAt.delete(key)
    this.outputSince.delete(key)
  }

  private push(): void {
    if (this.pushTimer) return
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      // The hint is NOT consumed here: a push can land while the notch page is
      // still loading (startup, settings re-enable) and would eat it. state()
      // filters it once its attention clears, and the renderer de-dupes by id,
      // so re-sending the same live hint is harmless.
      sendToNotch(IPC.NotchState, this.state())
      // Taskbar-style auto-hide: off-screen while nothing needs attention.
      setHiddenForEmpty(this.settings.visibility === 'autohide' && this.attentions.size === 0)
    }, 50)
  }
}

/** Singleton — imported by the IPC layers (agent/notify/notch) and index.ts. */
export const notch = new NotchController()
