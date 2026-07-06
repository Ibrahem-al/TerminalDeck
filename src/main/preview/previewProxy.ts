/**
 * RemoteDeck live preview proxy: lets a paired phone open a local dev/test
 * server (e.g. a Vite/Next/CRA dev server on 127.0.0.1:3000) in its browser,
 * over the same Tailscale/LAN origin the Agent already serves.
 *
 * Security model:
 *  - Reachable only under the device-token-gated `/__preview/:port/*` route
 *    (auth is enforced by RemoteServer before anything here runs).
 *  - Connects ONLY to 127.0.0.1 — never an arbitrary host — so it can't be used
 *    as an SSRF relay across the tailnet. The target port must also currently be
 *    a local LISTEN port (best-effort allow-list) and never the Agent's own port.
 *  - The device token (Authorization header / `rdp` cookie) is stripped before
 *    forwarding, so it never leaks to the proxied dev server.
 *
 * Asset paths: dev servers reference assets with root-absolute URLs (`/foo.js`,
 * Vite's `/@vite/client`). We serve under a `/__preview/:port/` prefix, so HTML
 * responses get a `<base>` tag injected (fixes relative URLs) and their
 * root-absolute `src`/`href`/`action`/`url()` attributes rewritten to the prefix
 * (fixes absolute ones). HMR/live-reload WebSockets are passed through verbatim.
 */
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'http'
import { connect as netConnect } from 'net'
import type { Duplex } from 'stream'
import { listListeningPorts } from './listPorts'

export const PREVIEW_PREFIX = '/__preview/'
/** Cookie that carries the device token for preview asset/WS requests. */
export const PREVIEW_COOKIE = 'rdp'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])

const MAX_HTML_REWRITE_BYTES = 8 * 1024 * 1024

/** Parse `/__preview/3000/foo?x=1` → `{ port: 3000, rest: '/foo?x=1' }`. */
export function parsePreview(rawUrl: string): { port: number; rest: string } | null {
  if (!rawUrl.startsWith(PREVIEW_PREFIX)) return null
  const after = rawUrl.slice(PREVIEW_PREFIX.length)
  const slash = after.indexOf('/')
  const portStr = (slash === -1 ? after : after.slice(0, slash)).split('?')[0]
  const port = Number(portStr)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  const rest = slash === -1 ? '/' : after.slice(slash)
  return { port, rest }
}

/** Read a single cookie value out of a Cookie request header. */
export function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

// Best-effort cache of locally-listening ports (enumeration is ~seconds on Win).
let portCache: { at: number; ports: Set<number> } = { at: 0, ports: new Set() }

/**
 * True if `port` may be proxied: not the Agent's own port, and (when we can
 * enumerate) an actual local LISTEN port. If enumeration fails we still allow it
 * — the loopback-only connect is the real protection, the list is hardening.
 */
export async function isPreviewPortAllowed(port: number, agentPort: number): Promise<boolean> {
  if (port === agentPort) return false
  const now = Date.now()
  if (now - portCache.at >= 4000) {
    const list = await listListeningPorts().catch(() => [])
    portCache = { at: now, ports: new Set(list.map((p) => p.port)) }
  }
  return portCache.ports.size === 0 || portCache.ports.has(port)
}

function forwardReqHeaders(headers: IncomingHttpHeaders, port: number): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase()
    if (v == null || HOP_BY_HOP.has(key) || key === 'authorization' || key === 'host') continue
    if (key === 'cookie') {
      const stripped = stripPreviewCookie(Array.isArray(v) ? v.join('; ') : v)
      if (stripped) out['cookie'] = stripped
      continue
    }
    // Ask upstream for identity encoding so HTML can be rewritten safely.
    if (key === 'accept-encoding') continue
    out[k] = v
  }
  out['host'] = `127.0.0.1:${port}`
  out['accept-encoding'] = 'identity'
  return out
}

function stripPreviewCookie(cookie: string): string {
  return cookie
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith(`${PREVIEW_COOKIE}=`))
    .join('; ')
}

function forwardResHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v == null || HOP_BY_HOP.has(k.toLowerCase())) continue
    out[k] = v
  }
  return out
}

/** Forward an HTTP request to 127.0.0.1:port, rewriting HTML so assets resolve. */
export function proxyHttp(port: number, rest: string, req: IncomingMessage, res: ServerResponse): void {
  const upstream = httpRequest(
    { host: '127.0.0.1', port, method: req.method, path: rest, headers: forwardReqHeaders(req.headers, port) },
    (up) => {
      const status = up.statusCode ?? 200
      const headers = forwardResHeaders(up.headers)
      const isHtml = String(up.headers['content-type'] ?? '').includes('text/html')
      if (!isHtml) {
        res.writeHead(status, headers)
        up.pipe(res)
        return
      }
      // Buffer HTML, rewrite, send (length changes → drop content-length).
      delete headers['content-length']
      const chunks: Buffer[] = []
      let size = 0
      let overflow = false
      up.on('data', (c: Buffer) => {
        if (overflow) return
        size += c.length
        if (size > MAX_HTML_REWRITE_BYTES) {
          // Too big to rewrite — pass through untouched from here on.
          overflow = true
          res.writeHead(status, headers)
          for (const b of chunks) res.write(b)
          res.write(c)
          up.pipe(res)
          return
        }
        chunks.push(c)
      })
      up.on('end', () => {
        // Overflow path already wrote headers and piped `up` → `res`, which ends
        // `res` on its own; calling end() again would throw write-after-end.
        if (overflow) return
        const html = rewriteHtml(Buffer.concat(chunks).toString('utf8'), port)
        res.writeHead(status, headers)
        res.end(html)
      })
    }
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`Preview: could not reach 127.0.0.1:${port}. Is that server running?`)
  })
  req.pipe(upstream)
}

/** Pass a WebSocket/upgrade (e.g. Vite HMR) straight through to the dev server. */
export function proxyUpgrade(port: number, rest: string, req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const upstream = netConnect(port, '127.0.0.1', () => {
    const lines = [`${req.method ?? 'GET'} ${rest} HTTP/1.1`]
    for (const [k, v] of Object.entries(req.headers)) {
      const key = k.toLowerCase()
      if (v == null || key === 'authorization') continue
      if (key === 'host') {
        lines.push(`host: 127.0.0.1:${port}`)
        continue
      }
      if (key === 'cookie') {
        const stripped = stripPreviewCookie(Array.isArray(v) ? v.join('; ') : v)
        if (stripped) lines.push(`cookie: ${stripped}`)
        continue
      }
      for (const val of Array.isArray(v) ? v : [v]) lines.push(`${k}: ${val}`)
    }
    lines.push('', '')
    upstream.write(lines.join('\r\n'))
    if (head && head.length) upstream.write(head)
    socket.pipe(upstream)
    upstream.pipe(socket)
  })
  upstream.on('error', () => {
    try {
      socket.destroy()
    } catch {
      /* ignore */
    }
  })
  socket.on('error', () => {
    try {
      upstream.destroy()
    } catch {
      /* ignore */
    }
  })
}

function rewriteHtml(html: string, port: number): string {
  const prefix = `${PREVIEW_PREFIX}${port}`
  const baseTag = `<base href="${prefix}/">`
  let out = html
  // <base> fixes relative URLs; insert right after <head> (or prepend).
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
  else out = baseTag + out
  // Root-absolute URLs aren't affected by <base>, so rewrite them to the prefix.
  // Skip protocol-relative (`//host`) URLs.
  out = out.replace(/\b(src|href|action)=("|')\/(?!\/)/gi, `$1=$2${prefix}/`)
  out = out.replace(/url\((\s*)(["']?)\/(?!\/)/gi, `url($1$2${prefix}/`)
  return out
}
