import {
  REMOTE_WS_SUBPROTOCOL,
  type RemoteClientFrame,
  type RemoteServerFrame,
  type RemoteSessionInfo
} from '@shared/types'

export type ConnState = 'connecting' | 'open' | 'closed'

interface Handlers {
  onState: (s: ConnState) => void
  onSessions: (s: RemoteSessionInfo[]) => void
  onData: (id: string, bytes: Uint8Array) => void
  onExit: (id: string, code: number) => void
  /** Scrollback gap on reconnect: clear the terminal before the replay arrives. */
  onReset: (id: string) => void
}

/** Client ping cadence. */
const HEARTBEAT_MS = 15_000
/** No traffic for this long ⇒ the socket is a zombie; force a reopen. */
const STALE_MS = 40_000
/**
 * On a resume event, reopen if the last traffic is older than this. Must exceed
 * one HEARTBEAT_MS cycle so a socket that exchanged a pong this cycle is merely
 * probed (ping), not needlessly torn down.
 */
const RESUME_STALE_MS = 20_000

/**
 * Resilient WebSocket transport to the Agent: token auth via subprotocol,
 * heartbeat, exponential backoff with jitter, and seq-tracked scrollback replay
 * so a dropped connection (phone backgrounded, network change) feels continuous.
 */
export class Transport {
  private ws: WebSocket | null = null
  private backoff = 500
  private heartbeat: number | null = null
  private reconnectTimer: number | null = null
  private closed = false
  /** ms of the last inbound traffic (pong or data) — drives zombie detection. */
  private lastActivityAt = 0
  private readonly lastSeq = new Map<string, number>()
  private readonly attached = new Map<string, { cols: number; rows: number }>()

  constructor(
    private readonly token: string,
    private readonly handlers: Handlers
  ) {}

  connect(): void {
    this.closed = false
    this.open()
  }

  private open(): void {
    if (this.closed) return
    this.clearReconnectTimer()
    // Stop the prior socket's heartbeat/watchdog so it can't fire mid-reconnect
    // (re-armed in onopen).
    this.stopHeartbeat()
    // Tear down any prior socket so we never run two in parallel (the old
    // reconnect-vs-reconnectNow race that produced duplicate data streams).
    if (this.ws) {
      const stale = this.ws
      stale.onopen = stale.onclose = stale.onerror = stale.onmessage = null
      try {
        stale.close()
      } catch {
        /* ignore */
      }
      this.ws = null
    }

    this.handlers.onState('connecting')
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${scheme}://${location.host}/ws`, [REMOTE_WS_SUBPROTOCOL, `bearer.${this.token}`])
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.onopen = () => {
      this.backoff = 500
      this.lastActivityAt = Date.now()
      this.handlers.onState('open')
      this.startHeartbeat()
      this.send({ t: 'list' })
      for (const [id, dims] of this.attached) {
        this.send({ t: 'attach', id, cols: dims.cols, rows: dims.rows, since: this.lastSeq.get(id) ?? 0 })
      }
    }
    ws.onmessage = (ev) => this.onMessage(ev)
    ws.onclose = () => {
      // Ignore a superseded socket's close (we already moved on).
      if (this.ws !== ws) return
      this.stopHeartbeat()
      this.handlers.onState('closed')
      this.scheduleReconnect()
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
  }

  private onMessage(ev: MessageEvent): void {
    // Any inbound frame is proof of life.
    this.lastActivityAt = Date.now()
    let frame: RemoteServerFrame
    try {
      const text = typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer)
      frame = JSON.parse(text) as RemoteServerFrame
    } catch {
      return
    }
    switch (frame.t) {
      case 'sessions':
        this.handlers.onSessions(frame.sessions)
        break
      case 'reset':
        // Scrollback scrolled past while we were away — clear, then the replay
        // that follows rebuilds the screen from a clean slate.
        this.lastSeq.delete(frame.id)
        this.handlers.onReset(frame.id)
        break
      case 'attached':
        this.lastSeq.set(frame.id, frame.seq)
        break
      case 'data':
        this.lastSeq.set(frame.id, frame.seq)
        this.handlers.onData(frame.id, base64ToBytes(frame.b64))
        break
      case 'exit':
        this.handlers.onExit(frame.id, frame.code)
        break
      case 'pong':
        break
      case 'error':
        console.warn('[remote]', frame.message)
        break
    }
  }

  list(): void {
    this.send({ t: 'list' })
  }

  attach(id: string, cols: number, rows: number): void {
    this.attached.set(id, { cols, rows })
    this.send({ t: 'attach', id, cols, rows, since: this.lastSeq.get(id) ?? 0 })
  }

  detach(id: string): void {
    this.attached.delete(id)
    // Drop the replay cursor: a user-initiated leave means the next open builds a
    // fresh empty terminal that must replay from the start, not from where we
    // left off (which would render blank). Reconnect drops do NOT call detach.
    this.lastSeq.delete(id)
  }

  input(id: string, data: string): void {
    this.send({ t: 'input', id, b64: bytesToBase64(new TextEncoder().encode(data)) })
  }

  resize(id: string, cols: number, rows: number): void {
    const dims = this.attached.get(id)
    if (dims) {
      dims.cols = cols
      dims.rows = rows
    }
    this.send({ t: 'resize', id, cols, rows })
  }

  /**
   * Called on resume signals (tab visible / focus / online / pageshow). Mobile
   * browsers freeze the page on background and the socket comes back a half-open
   * zombie that still reads `OPEN` — so we can't trust readyState alone. Reopen
   * if the socket is gone, not open, or has shown no traffic recently; otherwise
   * probe with a ping and let the watchdog catch a dead one (avoids churning a
   * genuinely-healthy socket on every brief app-switch).
   */
  reconnectNow(): void {
    if (this.closed) return
    const open = this.ws && this.ws.readyState === WebSocket.OPEN
    const stale = Date.now() - this.lastActivityAt > RESUME_STALE_MS
    if (!open || stale) {
      this.open()
    } else {
      this.send({ t: 'ping' })
    }
  }

  close(): void {
    this.closed = true
    this.stopHeartbeat()
    this.clearReconnectTimer()
    const ws = this.ws
    this.ws = null
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
  }

  private send(frame: RemoteClientFrame): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame))
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = window.setInterval(() => {
      // Watchdog: prolonged silence (even on a socket that still reads OPEN)
      // means a zombie — force a clean reopen.
      if (Date.now() - this.lastActivityAt > STALE_MS) {
        this.open()
        return
      }
      this.send({ t: 'ping' })
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== null) return
    const delay = Math.min(this.backoff, 20_000) * (0.5 + Math.random())
    this.backoff = Math.min(this.backoff * 2, 20_000)
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closed) this.open()
    }, delay)
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
