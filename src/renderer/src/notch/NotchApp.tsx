/**
 * The notch UI: a barely-there pill hugging the top edge that grows on hover,
 * becomes an alert when an agent wants you, and pulls down into a panel — the
 * pulldown shows attention items AND a dashboard of every running pane, each
 * openable as a live mini terminal to reply in place.
 *
 * Mouse contract: the window is click-through until armed. Hover comes from a
 * MAIN-PROCESS cursor poll (NotchHover events) — forwarded mousemove on
 * click-through windows proved unreliable on Windows, so DOM hover handlers
 * are only a best-effort backup. The renderer reports its visible UI rect
 * (NotchUiRect) for the poll. A dwell delay applies in the idle-pill state so
 * slamming the cursor to a maximized window's tab strip doesn't get eaten.
 *
 * Dismissal: Shift+Esc (Esc while the panel has focus outside the terminal),
 * blur after the window was actually focused, 30s untouched auto-expansions.
 * When the shown attention clears while you're interacting, the panel morphs
 * into the same session's terminal view instead of vanishing under your hands.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NotchAttention, NotchSessionSummary, NotchStatePayload } from '@shared/types'
import { MiniTerminal } from './MiniTerminal'

type Mode = 'pill' | 'alert' | 'expanded'

type Sel =
  | { type: 'attention'; id: string }
  | { type: 'terminal'; sessionId: string }
  | { type: 'chat'; agentId: string }

const KIND_ICON: Record<NotchAttention['kind'], { glyph: string; color: string }> = {
  question: { glyph: '?', color: '#e9c27a' },
  'turn-done': { glyph: '✓', color: '#8fce9a' },
  'command-done': { glyph: '✓', color: '#8fce9a' },
  'maybe-waiting': { glyph: '·', color: '#8b93a3' }
}

function Icon({ kind }: { kind: NotchAttention['kind'] }): React.JSX.Element {
  const { glyph, color } = KIND_ICON[kind]
  return (
    <span className="notch-alert-icon" style={{ color, fontWeight: 700 }}>
      {glyph}
    </span>
  )
}

function WorkDot({ working }: { working: boolean }): React.JSX.Element {
  return <span className={`notch-dot${working ? ' working' : ''}`} />
}

const sessionKey = (s: NotchSessionSummary): string => s.sessionId ?? s.agentId ?? ''

const EMPTY_STATE: NotchStatePayload = { attentions: [], sessions: [], working: 0, ui: { scale: 1 } }

export function NotchApp(): React.JSX.Element {
  const [state, setState] = useState<NotchStatePayload>(EMPTY_STATE)
  const [mode, setMode] = useState<Mode>('pill')
  const [sel, setSel] = useState<Sel | null>(null)
  const [hovered, setHovered] = useState(false)

  const hadFocusRef = useRef(false)
  const armedRef = useRef(false)
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHintRef = useRef<string | null>(null)
  const modeRef = useRef<Mode>('pill')
  const stateRef = useRef<NotchStatePayload>(EMPTY_STATE)
  const contentRef = useRef<HTMLDivElement | null>(null)
  modeRef.current = mode
  stateRef.current = state

  const setIgnore = useCallback((ignore: boolean): void => {
    if (armedRef.current === !ignore) return
    armedRef.current = !ignore
    window.quarterdeck.notch.setIgnoreMouse(ignore)
  }, [])

  const collapse = useCallback((): void => {
    hadFocusRef.current = false
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    setMode('pill')
    setSel(null)
  }, [])

  // Re-armable auto-collapse for never-touched auto-expansions: a pointer
  // graze pauses it (enter) and leaving re-arms it.
  const armIdleTimer = useCallback((): void => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      if (!hadFocusRef.current) collapse()
    }, 30_000)
  }, [collapse])

  /** Open the panel. null = dashboard: pick the most relevant thing to show. */
  const expand = useCallback(
    (target: Sel | null): void => {
      const s = stateRef.current
      let next = target
      if (!next) {
        const a = s.attentions[0]
        const working = s.sessions.find((x) => x.working && x.kind === 'terminal')
        const first = s.sessions[0]
        next = a
          ? { type: 'attention', id: a.id }
          : working?.sessionId
            ? { type: 'terminal', sessionId: working.sessionId }
            : first
              ? first.kind === 'terminal' && first.sessionId
                ? { type: 'terminal', sessionId: first.sessionId }
                : first.agentId
                  ? { type: 'chat', agentId: first.agentId }
                  : null
              : null
      }
      setMode('expanded')
      setSel(next)
      armIdleTimer()
    },
    [armIdleTimer]
  )

  // State feed (catch-up + live), auto-expand hints, stale-selection handling.
  useEffect(() => {
    let alive = true
    const apply = (payload: NotchStatePayload): void => {
      if (!alive) return
      const prev = stateRef.current
      setState(payload)
      stateRef.current = payload
      if (
        payload.expandHint &&
        payload.expandHint !== lastHintRef.current &&
        payload.attentions.some((a) => a.id === payload.expandHint)
      ) {
        lastHintRef.current = payload.expandHint
        expand({ type: 'attention', id: payload.expandHint })
        return
      }
      setSel((cur) => {
        if (!cur) return cur
        if (cur.type === 'attention') {
          if (payload.attentions.some((a) => a.id === cur.id)) return cur
          // The shown attention cleared. If the user is interacting, morph to
          // the same session's terminal view instead of yanking the panel away
          // mid-keystroke (MiniTerminal is keyed by sessionId, so it stays
          // mounted seamlessly). Otherwise fold up.
          const old = prev.attentions.find((a) => a.id === cur.id)
          if (
            hadFocusRef.current &&
            old?.sessionId &&
            payload.sessions.some((s) => s.sessionId === old.sessionId)
          ) {
            return { type: 'terminal', sessionId: old.sessionId }
          }
          if (modeRef.current === 'expanded') collapse()
          return null
        }
        if (cur.type === 'terminal' && !payload.sessions.some((s) => s.sessionId === cur.sessionId)) {
          if (modeRef.current === 'expanded') collapse()
          return null
        }
        if (cur.type === 'chat' && !payload.sessions.some((s) => s.agentId === cur.agentId)) {
          if (modeRef.current === 'expanded') collapse()
          return null
        }
        return cur
      })
    }
    void window.quarterdeck.notch.getState().then(apply)
    const off = window.quarterdeck.notch.onState(apply)
    return () => {
      alive = false
      off()
    }
  }, [expand, collapse])

  /* ── interactivity arming (hover from the main-process cursor poll) ── */

  const enterInteract = useCallback((): void => {
    setHovered(true)
    if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    if (armTimerRef.current) clearTimeout(armTimerRef.current)
    // Idle pill: dwell before stealing clicks from the window underneath.
    const dwell = modeRef.current === 'pill' && stateRef.current.attentions.length === 0 ? 140 : 0
    if (dwell === 0) setIgnore(false)
    else armTimerRef.current = setTimeout(() => setIgnore(false), dwell)
  }, [setIgnore])

  const leaveInteract = useCallback((): void => {
    setHovered(false)
    if (armTimerRef.current) clearTimeout(armTimerRef.current)
    if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
    disarmTimerRef.current = setTimeout(() => setIgnore(true), 250)
    if (modeRef.current === 'expanded' && !hadFocusRef.current) armIdleTimer()
  }, [setIgnore, armIdleTimer])

  useEffect(() => {
    return window.quarterdeck.notch.onHover((inside) => {
      if (inside) enterInteract()
      else leaveInteract()
    })
  }, [enterInteract, leaveInteract])

  // Report the visible UI's rect so main knows where "hovering the notch" is.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const report = (): void => {
      const r = el.getBoundingClientRect()
      window.quarterdeck.notch.uiRect({ x: r.x, y: r.y, w: r.width, h: r.height })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [mode, hovered, state.attentions.length, state.ui.scale])

  useEffect(() => () => window.quarterdeck.notch.uiRect(null), [])

  // Focus/blur + Esc. Blur-to-collapse only arms after a real focus — the
  // window is shown inactive and auto-expansions never steal focus.
  useEffect(() => {
    const onFocus = (): void => {
      hadFocusRef.current = true
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
    const onBlur = (): void => {
      if (hadFocusRef.current) collapse()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') collapse()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', onKey)
    }
  }, [collapse])

  useEffect(
    () => () => {
      for (const t of [armTimerRef, disarmTimerRef, idleTimerRef]) {
        if (t.current) clearTimeout(t.current)
      }
    },
    []
  )

  /* ── render ─────────────────────────────────────────────────────── */

  const attentions = state.attentions
  const sessions = state.sessions
  const latest = attentions[0]

  const selAttention = sel?.type === 'attention' ? attentions.find((a) => a.id === sel.id) : undefined
  const selSession =
    sel?.type === 'terminal'
      ? sessions.find((s) => s.sessionId === sel.sessionId)
      : sel?.type === 'chat'
        ? sessions.find((s) => s.agentId === sel.agentId)
        : undefined

  const headerTitle = selAttention?.title ?? selSession?.title ?? 'TerminalDeck'
  const headerSub = selAttention?.detail ?? selSession?.cwd ?? ''
  const bodySessionId = selAttention?.sessionId ?? (sel?.type === 'terminal' ? sel.sessionId : undefined)

  const jump = (): void => {
    if (selAttention) window.quarterdeck.notch.jump({ attentionId: selAttention.id })
    else if (sel?.type === 'terminal') window.quarterdeck.notch.jump({ sessionId: sel.sessionId })
    else if (sel?.type === 'chat') window.quarterdeck.notch.jump({ agentId: sel.agentId })
    collapse()
  }

  const respond = (a: NotchAttention, allow: boolean): void => {
    if (a.agentId && a.requestId) {
      window.quarterdeck.agent.respondPermission(a.agentId, a.requestId, allow)
    }
  }

  const macClass = window.quarterdeck.platform === 'darwin' ? ' notch-mac' : ''

  return (
    <div
      className={`notch-halo${macClass}`}
      style={{ zoom: state.ui.scale }}
      onMouseEnter={enterInteract}
      onMouseLeave={leaveInteract}
    >
      <div ref={contentRef}>
        {mode !== 'expanded' && attentions.length === 0 && (
          <div
            className={`notch-pill${hovered ? ' hovered' : ''}`}
            title="TerminalDeck agents — click for the pane dashboard"
            onClick={() => expand(null)}
          >
            <WorkDot working={state.working > 0} />
            {(hovered || state.working > 0) && (
              <span className="notch-pill-count">
                {hovered
                  ? `${state.working} working · ${sessions.length} pane${sessions.length === 1 ? '' : 's'}`
                  : state.working}
              </span>
            )}
          </div>
        )}

        {mode !== 'expanded' && attentions.length > 0 && latest && (
          <div
            className={`notch-alert${latest.kind === 'question' ? ' question' : ''}`}
            onClick={() => expand({ type: 'attention', id: latest.id })}
          >
            <Icon kind={latest.kind} />
            <span className="notch-alert-text">
              <b>{latest.title}</b> — {latest.detail ?? 'needs your attention'}
            </span>
            {attentions.length > 1 && <span className="notch-badge">{attentions.length}</span>}
          </div>
        )}

        {mode === 'expanded' && (
          <div className="notch-panel">
            <div className="notch-panel-header">
              {selAttention ? <Icon kind={selAttention.kind} /> : <WorkDot working={selSession?.working ?? false} />}
              <span className="notch-panel-title">{headerTitle}</span>
              <span className="notch-panel-sub">{headerSub}</span>
              {(selAttention || sel) && (
                <button className="notch-btn accent" onClick={jump} title="Open in TerminalDeck">
                  Open ↗
                </button>
              )}
              {selAttention && (
                <button
                  className="notch-btn danger"
                  onClick={() => window.quarterdeck.notch.dismiss(selAttention.id)}
                  title="Dismiss"
                >
                  ✕
                </button>
              )}
              <button className="notch-btn" onClick={collapse} title="Collapse (Shift+Esc)">
                ⌃
              </button>
            </div>

            {(attentions.length > 0 || sessions.length > 1) && (
              <div className="notch-chips">
                {attentions.map((a) => (
                  <div
                    key={a.id}
                    className={`notch-chip attention${selAttention?.id === a.id ? ' selected' : ''}`}
                    onClick={() => setSel({ type: 'attention', id: a.id })}
                  >
                    <Icon kind={a.kind} />
                    {a.title}
                  </div>
                ))}
                {sessions.map((s) => (
                  <div
                    key={sessionKey(s)}
                    className={`notch-chip${selSession === s && !selAttention ? ' selected' : ''}`}
                    onClick={() =>
                      setSel(
                        s.kind === 'terminal' && s.sessionId
                          ? { type: 'terminal', sessionId: s.sessionId }
                          : s.agentId
                            ? { type: 'chat', agentId: s.agentId }
                            : null
                      )
                    }
                    title={s.cwd ?? ''}
                  >
                    <WorkDot working={s.working} />
                    {s.title}
                  </div>
                ))}
              </div>
            )}

            {selAttention?.source === 'chat' ? (
              <div className="notch-chat-card">
                <div className="notch-chat-question">
                  {selAttention.kind === 'question'
                    ? `Claude wants to use ${selAttention.toolName ?? 'a tool'}`
                    : (selAttention.detail ?? 'Finished')}
                </div>
                {selAttention.inputPreview && (
                  <div className="notch-chat-input">{selAttention.inputPreview}</div>
                )}
                {selAttention.kind === 'question' && selAttention.requestId && (
                  <div className="notch-chat-actions">
                    <button className="notch-btn accent" onClick={() => respond(selAttention, true)}>
                      Allow
                    </button>
                    <button className="notch-btn danger" onClick={() => respond(selAttention, false)}>
                      Deny
                    </button>
                  </div>
                )}
              </div>
            ) : bodySessionId ? (
              <MiniTerminal sessionId={bodySessionId} />
            ) : sel?.type === 'chat' ? (
              <div className="notch-chat-card">
                <div className="notch-chat-question">Claude chat pane{selSession?.working ? ' — working…' : ''}</div>
                <div className="notch-chat-actions">
                  <button className="notch-btn accent" onClick={jump}>
                    Open in TerminalDeck ↗
                  </button>
                </div>
              </div>
            ) : (
              <div className="notch-term-dead">No running panes.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
