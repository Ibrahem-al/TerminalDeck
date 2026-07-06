import { promises as fsp, watch, type FSWatcher } from 'fs'
import { execFile } from 'child_process'
import { basename, dirname, extname, isAbsolute, join, relative } from 'path'
import { clipboard, net, shell, type WebContents } from 'electron'
import { IPC, type FsEntry, type ImportResult } from '@shared/types'

const SEARCH_IGNORE = new Set(['node_modules', '.git', 'out', 'dist', '.vite'])
const SEARCH_MAX_RESULTS = 300
const SEARCH_MAX_VISITED = 30_000

export async function readDir(dir: string): Promise<FsEntry[]> {
  const dirents = await fsp.readdir(dir, { withFileTypes: true })
  const entries: FsEntry[] = dirents.map((d) => ({
    name: d.name,
    path: join(dir, d.name),
    isDir: d.isDirectory()
  }))
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return entries
}

export async function createFile(path: string): Promise<void> {
  await fsp.writeFile(path, '', { flag: 'wx' })
}

export async function createDir(path: string): Promise<void> {
  await fsp.mkdir(path)
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  try {
    await fsp.access(newPath)
    throw new Error('A file with that name already exists')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  await fsp.rename(oldPath, newPath)
}

export async function moveToTrash(path: string): Promise<void> {
  await shell.trashItem(path)
}

/** True when `child` is `parent` itself or nested anywhere inside it. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * A free destination path for `name` inside `destDir`. On a name collision the
 * stem gets a " copy" suffix (then " copy 2", " copy 3", …) so we never clobber.
 */
async function uniqueDest(destDir: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  for (let i = 0; ; i++) {
    const candidate =
      i === 0
        ? join(destDir, name)
        : join(destDir, `${stem} copy${i > 1 ? ` ${i}` : ''}${ext}`)
    try {
      await fsp.access(candidate)
    } catch {
      return candidate // doesn't exist — free to use
    }
  }
}

/** Copies a file or folder into `destDir`, returning the created path. */
export async function copyEntry(src: string, destDir: string): Promise<string> {
  if (isInside(src, destDir)) throw new Error('Cannot copy a folder into itself')
  const dest = await uniqueDest(destDir, basename(src))
  await fsp.cp(src, dest, { recursive: true })
  return dest
}

/** Moves a file or folder into `destDir`, returning the new path. */
export async function moveEntry(src: string, destDir: string): Promise<string> {
  if (dirname(src) === destDir) return src // already lives here — nothing to do
  if (isInside(src, destDir)) throw new Error('Cannot move a folder into itself')
  const dest = await uniqueDest(destDir, basename(src))
  try {
    await fsp.rename(src, dest)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    // crossing drives — rename can't, so copy then remove the original
    await fsp.cp(src, dest, { recursive: true })
    await fsp.rm(src, { recursive: true, force: true })
  }
  return dest
}

/* ── External import (drag-from-outside / OS-clipboard paste) ──────── */

function firstLine(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0]
}

/** Reduce an arbitrary name to a single, Windows-legal file name. */
function safeFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, '') // drop any directory part
  return base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim()
}

/** Copies external files/folders into `destDir`, never clobbering existing names. */
export async function importExternalPaths(
  destDir: string,
  srcPaths: string[]
): Promise<ImportResult> {
  const created: string[] = []
  const errors: string[] = []
  for (const src of srcPaths) {
    try {
      created.push(await copyEntry(src, destDir))
    } catch (err) {
      errors.push(`${basename(src)}: ${firstLine(err)}`)
    }
  }
  return { created, errors }
}

/** Writes raw bytes (a dropped/pasted browser blob) into `destDir` under a safe name. */
export async function writeIncomingFile(
  destDir: string,
  name: string,
  data: Uint8Array
): Promise<ImportResult> {
  try {
    const dest = await uniqueDest(destDir, safeFileName(name) || 'dropped-file')
    await fsp.writeFile(dest, Buffer.from(data))
    return { created: [dest], errors: [] }
  } catch (err) {
    return { created: [], errors: [`${name}: ${firstLine(err)}`] }
  }
}

const CONTENT_TYPE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf',
  'application/json': '.json',
  'text/plain': '.txt'
}

function nameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')
    return safeFileName(last)
  } catch {
    return ''
  }
}

function nameFromDisposition(header: string | null): string {
  if (!header) return ''
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)
  if (star) {
    try {
      return safeFileName(decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')))
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain ? safeFileName(plain[1]) : ''
}

/** Downloads `url` (an http/https link dragged from a browser) into `destDir`. */
export async function downloadInto(destDir: string, url: string): Promise<ImportResult> {
  try {
    const res = await net.fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const ctype = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    let name =
      nameFromDisposition(res.headers.get('content-disposition')) || nameFromUrl(url) || 'download'
    if (!extname(name) && CONTENT_TYPE_EXT[ctype]) name += CONTENT_TYPE_EXT[ctype]
    const dest = await uniqueDest(destDir, name)
    await fsp.writeFile(dest, buf)
    return { created: [dest], errors: [] }
  } catch (err) {
    return { created: [], errors: [`download: ${firstLine(err)}`] }
  }
}

/**
 * Puts file/folder paths onto the Windows clipboard as a file drop list, so the
 * user can paste them (a copy) in Explorer. Paths are single-quoted with any
 * embedded quote doubled, so building the command string can't inject anything.
 */
export function copyToClipboard(paths: string[]): Promise<void> {
  const real = paths.filter((p) => typeof p === 'string' && p !== '')
  if (process.platform !== 'win32' || real.length === 0) return Promise.resolve()
  const list = real.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      // -Sta: Set-Clipboard needs a single-threaded apartment.
      ['-NoProfile', '-NonInteractive', '-Sta', '-Command', `Set-Clipboard -LiteralPath @(${list})`],
      { timeout: 5000, windowsHide: true },
      () => resolve()
    )
  })
}

/** File paths sitting on the Windows clipboard (Explorer "Copy"), newest first. */
function clipboardFilePaths(): Promise<string[]> {
  if (process.platform !== 'win32') return Promise.resolve([])
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }'
      ],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve([])
          return
        }
        resolve(
          stdout
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
        )
      }
    )
  })
}

/** Saves a bitmap on the clipboard (e.g. "Copy image" in a browser) as a PNG. */
async function saveClipboardImage(destDir: string): Promise<string | null> {
  const img = clipboard.readImage()
  if (img.isEmpty()) return null
  const dest = await uniqueDest(destDir, `clipboard-image-${Date.now()}.png`)
  await fsp.writeFile(dest, img.toPNG())
  return dest
}

/** Pastes whatever the OS clipboard holds (copied files, else an image) into `destDir`. */
export async function pasteClipboardInto(destDir: string): Promise<ImportResult> {
  const files = await clipboardFilePaths()
  if (files.length > 0) return importExternalPaths(destDir, files)
  try {
    const img = await saveClipboardImage(destDir)
    return img ? { created: [img], errors: [] } : { created: [], errors: [] }
  } catch (err) {
    return { created: [], errors: [`image: ${firstLine(err)}`] }
  }
}

export async function search(root: string, query: string, showHidden: boolean): Promise<string[]> {
  const q = query.toLowerCase()
  const results: string[] = []
  let visited = 0
  const queue: string[] = [root]

  while (queue.length > 0 && results.length < SEARCH_MAX_RESULTS && visited < SEARCH_MAX_VISITED) {
    const dir = queue.shift()!
    let dirents
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const d of dirents) {
      visited++
      if (!showHidden && d.name.startsWith('.')) continue
      const full = join(dir, d.name)
      if (d.isDirectory()) {
        if (!SEARCH_IGNORE.has(d.name)) queue.push(full)
      }
      if (d.name.toLowerCase().includes(q)) {
        results.push(full)
        if (results.length >= SEARCH_MAX_RESULTS) break
      }
    }
  }
  return results
}

export async function readFile(path: string): Promise<string> {
  return fsp.readFile(path, 'utf8')
}

export async function writeFile(path: string, content: string): Promise<void> {
  await fsp.writeFile(path, content, 'utf8')
}

/* ── Single-file watching (open editor files) ─────────────────────── */

const fileWatchers = new Map<number, Map<string, { watcher: FSWatcher; timer: ReturnType<typeof setTimeout> | null }>>()

export function watchFile(wc: WebContents, path: string): void {
  let perWc = fileWatchers.get(wc.id)
  if (!perWc) {
    perWc = new Map()
    fileWatchers.set(wc.id, perWc)
  }
  if (perWc.has(path)) return

  try {
    const state: { watcher: FSWatcher; timer: ReturnType<typeof setTimeout> | null } = {
      watcher: watch(path, () => {
        if (state.timer !== null) return
        state.timer = setTimeout(() => {
          state.timer = null
          if (!wc.isDestroyed()) wc.send(IPC.FsFileChanged, path)
        }, 150)
      }),
      timer: null
    }
    state.watcher.on('error', () => {
      /* file removed or locked — change events stop, that's fine */
    })
    perWc.set(path, state)
  } catch {
    // file vanished between open and watch — reload bar will surface it
  }
}

export function unwatchFile(wcId: number, path: string): void {
  const perWc = fileWatchers.get(wcId)
  const state = perWc?.get(path)
  if (!state || !perWc) return
  if (state.timer !== null) clearTimeout(state.timer)
  state.watcher.close()
  perWc.delete(path)
}

/* ── Watching ─────────────────────────────────────────────────────── */

interface WatchState {
  watcher: FSWatcher
  pending: Set<string>
  timer: ReturnType<typeof setTimeout> | null
}

const watchers = new Map<number, WatchState>()

export function watchRoot(wc: WebContents, root: string): void {
  unwatchRoot(wc.id)

  let state: WatchState
  try {
    const watcher = watch(root, { recursive: true }, (_event, filename) => {
      const dir = filename ? dirname(join(root, filename.toString())) : root
      state.pending.add(dir)
      if (state.timer === null) {
        state.timer = setTimeout(() => {
          state.timer = null
          const dirs = [...state.pending]
          state.pending.clear()
          if (!wc.isDestroyed()) wc.send(IPC.FsChanged, dirs)
        }, 300)
      }
    })
    watcher.on('error', () => {
      /* locked/permission dirs — keep going */
    })
    state = { watcher, pending: new Set(), timer: null }
    watchers.set(wc.id, state)
  } catch {
    // watching is best-effort; manual refresh still works via reads
  }
}

export function unwatchRoot(wcId: number): void {
  const state = watchers.get(wcId)
  if (!state) return
  if (state.timer !== null) clearTimeout(state.timer)
  state.watcher.close()
  watchers.delete(wcId)
}

export function disposeAllWatchers(): void {
  for (const [id] of watchers) unwatchRoot(id)
  for (const [, perWc] of fileWatchers) {
    for (const [, state] of perWc) {
      if (state.timer !== null) clearTimeout(state.timer)
      state.watcher.close()
    }
  }
  fileWatchers.clear()
}
