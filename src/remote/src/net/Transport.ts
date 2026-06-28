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
}

/**
 * Resilient WebSocket transport to the Agent: token auth via subprotocol,
 * heartbeat, exponential backoff with jitter, and seq-tracked scrollback replay
 * so a dropped connection (phone backgrounded, network change) feels continuous.
 */
export class Transport {
  private ws: WebSocket | null = null
  private backoff = 500
  private heartbeat: number | null = null
  private closed = false
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
    this.handlers.onState('connecting')
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${scheme}://${location.host}/ws`, [REMOTE_WS_SUBPROTOCOL, `bearer.${this.token}`])
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.onopen = () => {
      this.backoff = 500
      this.handlers.onState('open')
      this.startHeartbeat()
      this.send({ t: 'list' })
      for (const [id, dims] of this.attached) {
        this.send({ t: 'attach', id, cols: dims.cols, rows: dims.rows, since: this.lastSeq.get(id) ?? 0 })
      }
    }
    ws.onmessage = (ev) => this.onMessage(ev)
    ws.onclose = () => {
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

  /** Force a reconnect if the socket isn't open (e.g. on tab becoming visible). */
  reconnectNow(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) this.open()
  }

  close(): void {
    this.closed = true
    this.stopHeartbeat()
    this.ws?.close()
  }

  private send(frame: RemoteClientFrame): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame))
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = window.setInterval(() => this.send({ t: 'ping' }), 20_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return
    const delay = Math.min(this.backoff, 20_000) * (0.5 + Math.random())
    this.backoff = Math.min(this.backoff * 2, 20_000)
    window.setTimeout(() => {
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
