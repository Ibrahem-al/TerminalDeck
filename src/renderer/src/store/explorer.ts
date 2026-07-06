import { create } from 'zustand'
import type { FsEntry, ImportResult } from '@shared/types'
import { toast } from './toasts'

/** A file/folder staged for paste. `cut` items are moved; otherwise copied. */
export interface Clipboard {
  path: string
  cut: boolean
}

interface ExplorerStore {
  root: string | null
  visible: boolean
  showHidden: boolean
  expanded: Set<string>
  entries: Record<string, FsEntry[]>
  selected: string | null
  filter: string
  clipboard: Clipboard | null

  openFolder: () => Promise<void>
  openRoot: (root: string) => Promise<void>
  toggleSidebar: () => void
  toggleHidden: () => void
  setFilter: (q: string) => void
  select: (path: string | null) => void
  toggleDir: (path: string) => Promise<void>
  loadDir: (path: string) => Promise<void>
  refreshDirs: (dirs: string[]) => Promise<void>

  copy: (path: string) => void
  cut: (path: string) => void
  clearClipboard: () => void
  /** Pastes the in-app clipboard into `destDir` (move when cut, otherwise copy). */
  paste: (destDir: string) => Promise<void>
  /**
   * Paste for keyboard / context menu: uses the in-app clipboard when one is
   * staged, otherwise falls back to the OS clipboard (files copied in Explorer,
   * or a copied image).
   */
  pasteAuto: (destDir: string) => Promise<void>
  /** Moves `src` into `destDir` (drag-and-drop within the tree). */
  move: (src: string, destDir: string) => Promise<void>
  /**
   * Handles a file drop onto `destDir`. Items already inside the open root are
   * MOVED (an internal reorg); files/folders from outside, browser blobs, and
   * dragged http(s)/data URLs are COPIED/downloaded in. This is the single entry
   * point for every tree drop — internal drags, Explorer drops, and our own
   * drag-out landing back all funnel here.
   */
  importDrop: (dataTransfer: DataTransfer, destDir: string) => Promise<void>
}

/** Parent directory of a path, or the path itself if it has no parent. */
function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i > 0 ? path.slice(0, i) : path
}

/** True when `path` is `dir` itself or lives anywhere inside it. */
function isUnder(path: string, dir: string): boolean {
  const d = dir.replace(/[\\/]+$/, '')
  return path === d || path.startsWith(`${d}\\`) || path.startsWith(`${d}/`)
}

export const useExplorer = create<ExplorerStore>((set, get) => ({
  root: null,
  visible: true,
  showHidden: false,
  expanded: new Set(),
  entries: {},
  selected: null,
  filter: '',
  clipboard: null,

  openFolder: async () => {
    // lazy import avoids a settings↔projects↔explorer module cycle at eval time
    const { useSettings } = await import('./settings')
    const def = useSettings.getState().settings.general.defaultDirectory
    const root = await window.quarterdeck.fs.pickRoot(def || undefined)
    if (!root) return
    await get().openRoot(root)
  },

  openRoot: async (root) => {
    window.quarterdeck.fs.watch(root)
    set({
      root,
      expanded: new Set(),
      entries: {},
      selected: null,
      filter: '',
      clipboard: null,
      visible: true
    })
    await get().loadDir(root)
  },

  toggleSidebar: () => set((s) => ({ visible: !s.visible })),
  toggleHidden: () => set((s) => ({ showHidden: !s.showHidden })),
  setFilter: (q) => set({ filter: q }),
  select: (path) => set({ selected: path }),

  loadDir: async (path) => {
    try {
      const list = await window.quarterdeck.fs.readDir(path)
      set((s) => ({ entries: { ...s.entries, [path]: list } }))
    } catch {
      // directory vanished — drop it
      set((s) => {
        const entries = { ...s.entries }
        delete entries[path]
        const expanded = new Set(s.expanded)
        expanded.delete(path)
        return { entries, expanded }
      })
    }
  },

  toggleDir: async (path) => {
    const s = get()
    const expanded = new Set(s.expanded)
    if (expanded.has(path)) {
      expanded.delete(path)
      set({ expanded })
    } else {
      expanded.add(path)
      set({ expanded })
      if (!s.entries[path]) await get().loadDir(path)
    }
  },

  refreshDirs: async (dirs) => {
    const s = get()
    for (const dir of dirs) {
      if (dir === s.root || s.entries[dir]) {
        await get().loadDir(dir)
      }
    }
  },

  copy: (path) => {
    set({ clipboard: { path, cut: false } })
    // Also put it on the OS clipboard so it can be pasted into Explorer.
    void window.quarterdeck.fs.copyToClipboard([path])
  },
  cut: (path) => set({ clipboard: { path, cut: true } }),
  clearClipboard: () => set({ clipboard: null }),

  paste: async (destDir) => {
    const clip = get().clipboard
    if (!clip) return
    const from = parentDir(clip.path)
    const newPath = await fsResult(
      () =>
        clip.cut
          ? window.quarterdeck.fs.move(clip.path, destDir)
          : window.quarterdeck.fs.copy(clip.path, destDir),
      clip.cut ? 'Could not move' : 'Could not paste'
    )
    if (newPath === null) return
    set((s) => ({
      expanded: new Set(s.expanded).add(destDir),
      selected: newPath,
      clipboard: clip.cut ? null : s.clipboard
    }))
    await get().loadDir(destDir)
    if (clip.cut && from !== destDir) await get().loadDir(from)
  },

  move: async (src, destDir) => {
    const from = parentDir(src)
    // No-op when dropped into its own folder, or refused when dropped into its
    // own subtree (can't move a folder inside itself).
    if (from === destDir || isUnder(destDir, src)) return
    const newPath = await fsResult(
      () => window.quarterdeck.fs.move(src, destDir),
      'Could not move'
    )
    if (newPath === null) return
    set((s) => ({ expanded: new Set(s.expanded).add(destDir), selected: newPath }))
    await get().loadDir(destDir)
    await get().loadDir(from)
  },

  pasteAuto: async (destDir) => {
    if (get().clipboard) {
      await get().paste(destDir)
      return
    }
    const res = await fsResult(
      () => window.quarterdeck.fs.pasteClipboard(destDir),
      'Could not paste'
    )
    if (!res) return
    if (res.created.length === 0 && res.errors.length === 0) {
      toast('info', 'Nothing to paste', 'Copy a file or image first')
      return
    }
    await applyImportResult(destDir, res)
  },

  importDrop: async (dataTransfer, destDir) => {
    // A DataTransfer is only readable during the drop event, so capture all of
    // it synchronously before the first await.
    const root = get().root
    const fileList = Array.from(dataTransfer.files)
    const movePaths: string[] = []
    const copyPaths: string[] = []
    const blobs: File[] = []
    for (const file of fileList) {
      const path = window.quarterdeck.files.getPathForFile(file)
      if (!path) {
        blobs.push(file)
        continue
      }
      // A file already inside the open root is an internal reorg → MOVE. Anything
      // from outside (Explorer, a browser, or our own file dragged out and back)
      // → COPY. Skip drops onto the item's own folder or into its own subtree.
      if (root !== null && isUnder(path, root)) {
        if (parentDir(path) !== destDir && !isUnder(destDir, path)) movePaths.push(path)
      } else {
        copyPaths.push(path)
      }
    }
    const urls =
      fileList.length === 0
        ? parseDropUrls(dataTransfer.getData('text/uri-list'), dataTransfer.getData('text/plain'))
        : []

    if (movePaths.length === 0 && copyPaths.length === 0 && blobs.length === 0 && urls.length === 0) return

    // Internal moves first (a within-root file dragged from Explorer's copy of
    // the project, say). Count successes so reporting matches reality.
    const fromDirs = new Set<string>()
    let lastMoved: string | null = null
    let moved = 0
    for (const src of movePaths) {
      const newPath = await fsResult(() => window.quarterdeck.fs.move(src, destDir), 'Could not move')
      if (newPath !== null) {
        fromDirs.add(parentDir(src))
        lastMoved = newPath
        moved++
      }
    }

    const merged: ImportResult = { created: [], errors: [] }
    const absorb = (r: ImportResult | null): void => {
      if (!r) return
      merged.created.push(...r.created)
      merged.errors.push(...r.errors)
    }

    if (copyPaths.length > 0) {
      absorb(
        await fsResult(() => window.quarterdeck.fs.importPaths(destDir, copyPaths), 'Import failed')
      )
    }
    for (const blob of blobs) {
      try {
        const data = new Uint8Array(await blob.arrayBuffer())
        absorb(
          await fsResult(
            () => window.quarterdeck.fs.writeBlob(destDir, blob.name || 'dropped-file', data),
            'Import failed'
          )
        )
      } catch (err) {
        merged.errors.push(
          `${blob.name || 'file'}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    for (const url of urls) {
      if (url.startsWith('data:')) {
        const decoded = decodeDataUrl(url)
        if (!decoded) {
          merged.errors.push('Pasted image could not be read')
          continue
        }
        absorb(
          await fsResult(
            () => window.quarterdeck.fs.writeBlob(destDir, dataUrlName(decoded.mime), decoded.bytes),
            'Import failed'
          )
        )
      } else {
        absorb(await fsResult(() => window.quarterdeck.fs.downloadUrl(destDir, url), 'Download failed'))
      }
    }

    // Refresh source folders emptied by internal moves + the destination.
    for (const dir of fromDirs) if (dir !== destDir) await get().loadDir(dir)
    const added = merged.created.length
    if (added > 0 || moved > 0) {
      set((s) => ({
        expanded: new Set(s.expanded).add(destDir),
        selected: merged.created[added - 1] ?? lastMoved ?? s.selected
      }))
      await get().loadDir(destDir)
    }

    // Report moves and copies independently so a mixed drop shows both and a
    // partial failure counts only what actually landed.
    if (added > 0 && moved > 0) {
      toast('success', `Moved ${moved}, added ${added}`, baseName(destDir))
    } else if (moved > 0) {
      toast('success', moved === 1 ? 'Moved 1 item' : `Moved ${moved} items`, baseName(destDir))
    } else if (added > 0 && merged.errors.length === 0) {
      toast('success', added === 1 ? 'Added 1 item' : `Added ${added} items`, baseName(destDir))
    } else if (added > 0) {
      toast('info', `Added ${added}, ${merged.errors.length} failed`, merged.errors[0])
    } else if (merged.errors.length > 0) {
      toast('error', 'Could not add files', merged.errors[0])
    }
  }
}))

/** Base name of a path (handles both Windows and POSIX separators). */
function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i >= 0 ? path.slice(i + 1) : path
}

/** Pull http(s)/data URLs out of a drag's text payload (uri-list wins). */
function parseDropUrls(uriList: string, plain: string): string[] {
  const text = uriList || plain || ''
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim()
    if (s && !s.startsWith('#') && /^(https?:|data:)/i.test(s)) out.push(s)
  }
  return out
}

/** Decode a `data:` URL into its MIME type and raw bytes (no network / no fetch). */
function decodeDataUrl(url: string): { mime: string; bytes: Uint8Array } | null {
  const comma = url.indexOf(',')
  if (comma < 0) return null
  const header = url.slice(5, comma) // drop the leading "data:"
  const body = url.slice(comma + 1)
  const isBase64 = /;base64$/i.test(header)
  const mime = header.replace(/;base64$/i, '').split(';')[0] || 'application/octet-stream'
  try {
    if (isBase64) {
      const bin = atob(body)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return { mime, bytes }
    }
    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(body)) }
  } catch {
    return null
  }
}

/** A filename for a pasted/dropped data: URL, keyed off its MIME type. */
function dataUrlName(mime: string): string {
  const ext =
    mime === 'image/png'
      ? '.png'
      : mime === 'image/jpeg'
        ? '.jpg'
        : mime === 'image/gif'
          ? '.gif'
          : mime === 'image/webp'
            ? '.webp'
            : mime === 'image/svg+xml'
              ? '.svg'
              : ''
  return `pasted-image-${Date.now()}${ext}`
}

/** Refreshes the destination, reveals what landed, and reports the outcome. */
async function applyImportResult(destDir: string, result: ImportResult): Promise<void> {
  const n = result.created.length
  if (n > 0) {
    useExplorer.setState((s) => ({
      expanded: new Set(s.expanded).add(destDir),
      selected: result.created[n - 1]
    }))
    await useExplorer.getState().loadDir(destDir)
  }
  if (n > 0 && result.errors.length === 0) {
    toast('success', n === 1 ? 'Added 1 item' : `Added ${n} items`, baseName(destDir))
  } else if (n > 0) {
    toast('info', `Added ${n}, ${result.errors.length} failed`, result.errors[0])
  } else if (result.errors.length > 0) {
    toast('error', 'Could not add files', result.errors[0])
  }
}

/* ── Mutating helpers (used by the sidebar UI) ────────────────────── */

export async function fsResult<T>(
  action: () => Promise<T>,
  errorTitle: string
): Promise<T | null> {
  try {
    return await action()
  } catch (err) {
    toast('error', errorTitle, err instanceof Error ? err.message.split('\n')[0] : String(err))
    return null
  }
}

export async function fsAction(action: () => Promise<void>, errorTitle: string): Promise<boolean> {
  return (await fsResult(action, errorTitle)) !== null
}
