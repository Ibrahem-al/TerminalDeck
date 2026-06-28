/**
 * The RemoteDeck Agent: an embedded HTTP + WebSocket server (in the Electron
 * main process) that serves the PWA, pairs phones, and streams terminal
 * sessions. Every route and WS upgrade is device-token gated; new-session cwds
 * are allow-list confined. Defaults OFF — started only from the wizard.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { Duplex } from 'stream'
import { randomUUID } from 'crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  REMOTE_WS_SUBPROTOCOL,
  type PairQrPayload,
  type PairRequest,
  type PairResponse,
  type RemoteClientFrame,
  type RemoteCreateOptions,
  type RemoteServerFrame,
  type RemoteServerStatus,
  type ShellKind,
  type WebPushSubscription
} from '@shared/types'
import type { SessionBackend } from './backend'
import { serveStatic } from './staticServer'
import { bestLanUrl, lanUrls } from './lan'
import { bearerFromHttp, tokenFromWsProtocols, verifyToken } from '../net/auth'
import { ensureAllowedPath } from '../net/allowlist'
import { consumePairingCode, mintToken, newPairingCode } from './pairing'
import { listDevices, registerDevice, removePushSubsForDevice, setPushSubForDevice } from '../store/persist'
import { pushPublicKey } from './push'
import { tailscaleStatus } from './tailscale'
import { listListeningPorts } from '../preview/listPorts'

interface SocketMeta {
  deviceId: string
  alive: boolean
}

const PAIR_FAIL_LIMIT = 10
const PAIR_FAIL_WINDOW_MS = 5 * 60_000

export class RemoteServer {
  private http: Server | null = null
  private wss: WebSocketServer | null = null
  private port: number
  private onChange: (() => void) | null = null

  private readonly sockets = new Set<WebSocket>()
  private readonly meta = new WeakMap<WebSocket, SocketMeta>()
  private readonly pairFails = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly backend: SessionBackend,
    opts: { port: number; serverName: string }
  ) {
    this.port = opts.port
    this.serverName = opts.serverName
  }

  private serverName: string

  setOnChange(fn: () => void): void {
    this.onChange = fn
  }

  isRunning(): boolean {
    return this.http !== null
  }

  async start(port?: number): Promise<void> {
    if (this.http) return
    if (port) this.port = port

    const http = createServer((req, res) => {
      this.handleHttp(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500)
        res.end()
      })
    })
    const wss = new WebSocketServer({
      noServer: true,
      // Accept only the app subprotocol; never echo the bearer.<token> one.
      handleProtocols: (protocols) => (protocols.has(REMOTE_WS_SUBPROTOCOL) ? REMOTE_WS_SUBPROTOCOL : false)
    })
    http.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head, wss))

    await new Promise<void>((resolve, reject) => {
      const onErr = (e: Error): void => reject(e)
      http.once('error', onErr)
      http.listen(this.port, '0.0.0.0', () => {
        http.off('error', onErr)
        resolve()
      })
    })

    this.http = http
    this.wss = wss
    this.onChange?.()
  }

  async stop(): Promise<void> {
    for (const ws of this.sockets) {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
    this.sockets.clear()
    this.wss?.close()
    this.wss = null
    await new Promise<void>((resolve) => {
      if (this.http) this.http.close(() => resolve())
      else resolve()
    })
    this.http = null
    this.onChange?.()
  }

  /** Push the current session list to every connected phone (live sync with
   *  the desktop's open panes). Called when the renderer reports a change. */
  broadcastSessions(): void {
    if (!this.wss) return
    const frame = JSON.stringify({ t: 'sessions', sessions: this.backend.list() })
    for (const ws of this.sockets) {
      if (ws.readyState === ws.OPEN) ws.send(frame)
    }
  }

  /** Closes any live sockets belonging to a revoked device. */
  dropDevice(deviceId: string): void {
    for (const ws of this.sockets) {
      if (this.meta.get(ws)?.deviceId === deviceId) {
        try {
          ws.close(4003, 'revoked')
        } catch {
          /* ignore */
        }
      }
    }
    this.onChange?.()
  }

  status(): RemoteServerStatus {
    const running = this.isRunning()
    const urls = running ? lanUrls(this.port) : []
    return {
      running,
      port: this.port,
      urls,
      primaryUrl: running ? bestLanUrl(this.port) : null,
      deviceCount: listDevices().length
    }
  }

  /** Issues a fresh one-time code and computes the best URL for its QR. */
  async pairingPayload(): Promise<PairQrPayload> {
    const { code, expiresAt } = newPairingCode()
    return { code, expiresAt, url: (await this.bestPairingUrl()) ?? `http://localhost:${this.port}` }
  }

  private async bestPairingUrl(): Promise<string | null> {
    try {
      const ts = await tailscaleStatus(this.port)
      if (ts.running && ts.serving && ts.fqdn) return `https://${ts.fqdn}`
    } catch {
      /* fall through to LAN */
    }
    return bestLanUrl(this.port)
  }

  /* ── HTTP ──────────────────────────────────────────────────────── */

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    if (path === '/api/pair' && req.method === 'POST') return this.handlePair(req, res)

    if (path.startsWith('/api/')) {
      const deviceId = verifyToken(bearerFromHttp(req))
      if (!deviceId) return json(res, 401, { error: 'unauthorized' })
      return this.handleApi(path, req, res, deviceId)
    }

    await serveStatic(req.url ?? '/', res)
  }

  private async handleApi(
    path: string,
    req: IncomingMessage,
    res: ServerResponse,
    deviceId: string
  ): Promise<void> {
    if (path === '/api/sessions' && req.method === 'GET') {
      return json(res, 200, { sessions: this.backend.list() })
    }
    if (path === '/api/sessions' && req.method === 'POST') {
      let body: Record<string, unknown>
      try {
        body = await readJson(req)
      } catch {
        return json(res, 400, { error: 'invalid_body' })
      }
      const opts: RemoteCreateOptions = {}
      try {
        if (typeof body.cwd === 'string' && body.cwd) opts.cwd = ensureAllowedPath(body.cwd)
      } catch {
        return json(res, 400, { error: 'cwd_not_allowed' })
      }
      if (typeof body.shell === 'string') opts.shell = body.shell as ShellKind
      if (typeof body.command === 'string') opts.command = body.command
      if (typeof body.title === 'string') opts.title = body.title
      if (typeof body.cols === 'number') opts.cols = body.cols
      if (typeof body.rows === 'number') opts.rows = body.rows
      const created = await this.backend.create(opts)
      return created ? json(res, 201, created) : json(res, 202, { ok: true })
    }
    const del = /^\/api\/sessions\/(.+)$/.exec(path)
    if (del && req.method === 'DELETE') {
      this.backend.end(decodeURIComponent(del[1]))
      return json(res, 200, { ok: true })
    }
    if (path === '/api/ports' && req.method === 'GET') {
      return json(res, 200, { ports: await listListeningPorts() })
    }
    if (path === '/api/push/key' && req.method === 'GET') {
      return json(res, 200, { key: pushPublicKey() })
    }
    if (path === '/api/push/subscribe' && req.method === 'POST') {
      let body: Record<string, unknown>
      try {
        body = await readJson(req)
      } catch {
        return json(res, 400, { error: 'invalid_body' })
      }
      const sub = body.subscription as WebPushSubscription | undefined
      if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) {
        return json(res, 400, { error: 'invalid_subscription' })
      }
      setPushSubForDevice(deviceId, sub)
      return json(res, 201, { ok: true })
    }
    if (path === '/api/push/unsubscribe' && req.method === 'POST') {
      removePushSubsForDevice(deviceId)
      return json(res, 200, { ok: true })
    }
    return json(res, 404, { error: 'not_found' })
  }

  private async handlePair(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ip = req.socket.remoteAddress ?? 'unknown'
    if (this.isRateLimited(ip)) return json(res, 429, { error: 'rate_limited' })

    let body: PairRequest
    try {
      body = (await readJson(req)) as unknown as PairRequest
    } catch {
      return json(res, 400, { error: 'invalid_body' })
    }
    if (!body?.code || !consumePairingCode(String(body.code))) {
      this.recordPairFail(ip)
      return json(res, 401, { error: 'invalid_or_expired_code' })
    }
    const token = mintToken()
    const ua = String(req.headers['user-agent'] ?? '')
    const device = registerDevice(body.deviceName ?? 'Phone', ua, token)
    this.pairFails.delete(ip)
    this.onChange?.()
    const resp: PairResponse = { token, deviceId: device.id, serverName: this.serverName }
    return json(res, 200, resp)
  }

  private isRateLimited(ip: string): boolean {
    const e = this.pairFails.get(ip)
    return !!e && e.resetAt > Date.now() && e.count >= PAIR_FAIL_LIMIT
  }

  private recordPairFail(ip: string): void {
    const now = Date.now()
    const e = this.pairFails.get(ip)
    if (!e || e.resetAt <= now) this.pairFails.set(ip, { count: 1, resetAt: now + PAIR_FAIL_WINDOW_MS })
    else e.count++
  }

  /* ── WebSocket ─────────────────────────────────────────────────── */

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, wss: WebSocketServer): void {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') {
      socket.destroy()
      return
    }
    const deviceId = verifyToken(tokenFromWsProtocols(req.headers['sec-websocket-protocol']))
    if (!deviceId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, deviceId))
  }

  private onConnection(ws: WebSocket, deviceId: string): void {
    this.sockets.add(ws)
    this.meta.set(ws, { deviceId, alive: true })
    const unsubscribers = new Map<string, () => void>()

    const send = (frame: RemoteServerFrame): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame))
    }

    const heartbeat = setInterval(() => {
      const m = this.meta.get(ws)
      if (!m) return
      if (!m.alive) {
        ws.terminate()
        return
      }
      m.alive = false
      try {
        ws.ping()
      } catch {
        /* ignore */
      }
    }, 25_000)

    ws.on('pong', () => {
      const m = this.meta.get(ws)
      if (m) m.alive = true
    })

    ws.on('message', (raw) => {
      let frame: RemoteClientFrame
      try {
        const parsed = JSON.parse(raw.toString())
        if (!parsed || typeof parsed.t !== 'string') return
        frame = parsed as RemoteClientFrame
      } catch {
        return
      }
      switch (frame.t) {
        case 'list':
          send({ t: 'sessions', sessions: this.backend.list() })
          break
        case 'attach':
          this.attach(frame, send, unsubscribers)
          break
        case 'input':
          this.backend.write(frame.id, Buffer.from(frame.b64, 'base64').toString('utf8'))
          break
        case 'resize':
          this.backend.resize(frame.id, frame.cols, frame.rows)
          break
        case 'ping':
          send({ t: 'pong' })
          break
      }
    })

    ws.on('close', () => {
      clearInterval(heartbeat)
      for (const un of unsubscribers.values()) un()
      unsubscribers.clear()
      this.sockets.delete(ws)
      this.meta.delete(ws)
    })
  }

  private attach(
    frame: { id: string; cols: number; rows: number; since: number },
    send: (f: RemoteServerFrame) => void,
    unsubscribers: Map<string, () => void>
  ): void {
    unsubscribers.get(frame.id)?.()
    const result = this.backend.subscribe(frame.id, randomUUID(), frame.since ?? 0, {
      onData: (seq, chunk) => send({ t: 'data', id: frame.id, seq, b64: chunk.toString('base64') }),
      onExit: (code) => send({ t: 'exit', id: frame.id, code })
    })
    if (!result) {
      send({ t: 'error', message: 'no such session' })
      return
    }
    this.backend.resize(frame.id, frame.cols, frame.rows)
    send({ t: 'attached', id: frame.id, seq: result.headSeq })
    if (result.replay.length) {
      send({ t: 'data', id: frame.id, seq: result.headSeq, b64: result.replay.toString('base64') })
    }
    unsubscribers.set(frame.id, result.unsubscribe)
  }
}

/* ── helpers ──────────────────────────────────────────────────────── */

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage, limit = 1 << 20): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        req.destroy()
        reject(new Error('payload_too_large'))
      } else {
        chunks.push(c)
      }
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      } catch {
        reject(new Error('invalid_json'))
      }
    })
    req.on('error', reject)
  })
}
