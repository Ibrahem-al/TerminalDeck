/**
 * Serves the built PWA bundle (out/remote/) over the Agent's HTTP server.
 * `__dirname` is out/main in dev and inside app.asar when packaged; the sibling
 * out/remote resolves in both, and fs reads transparently from the asar.
 */
import { readFile, stat } from 'fs/promises'
import { join, extname, normalize, sep } from 'path'
import type { ServerResponse } from 'http'

const REMOTE_ROOT = join(__dirname, '../remote')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

export async function serveStatic(rawUrl: string, res: ServerResponse): Promise<void> {
  const clean = decodeURIComponent(rawUrl.split('?')[0])
  // strip leading slashes + any traversal, then contain to REMOTE_ROOT
  let rel = normalize(clean).replace(/^([/\\]|\.\.([/\\]|$))+/, '')
  if (rel === '' || rel === '.') rel = 'index.html'

  let filePath = join(REMOTE_ROOT, rel)
  if (filePath !== REMOTE_ROOT && !filePath.startsWith(REMOTE_ROOT + sep)) {
    res.writeHead(403).end('forbidden')
    return
  }

  try {
    const st = await stat(filePath)
    if (st.isDirectory()) filePath = join(filePath, 'index.html')
  } catch {
    // unknown path with no extension → SPA fallback to the app shell
    if (extname(rel) === '') filePath = join(REMOTE_ROOT, 'index.html')
  }

  try {
    const data = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache'
    })
    res.end(data)
  } catch {
    res.writeHead(404).end('not found')
  }
}
