import { useEffect, useRef, useState } from 'react'
import {
  Eye,
  EyeOff,
  FilePlus,
  FolderOpen,
  FolderPlus,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  Search,
  X
} from 'lucide-react'
import { useExplorer } from '../../store/explorer'
import { useSettings } from '../../store/settings'
import { useEditorStore } from '../../store/editor'
import { fileIcon } from './fileIcons'
import { isExternalFileDrag, getTreeDragPath, setTreeDragPath } from './dnd'
import { FileTree, type PendingOp } from './FileTree'

const MIN_W = 180
const MAX_W = 420

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i >= 0 ? path.slice(i + 1) : path
}

function parentOf(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i > 0 ? path.slice(0, i) : path
}

/** Where a keyboard paste should land: the selection if it's a folder, else its parent, else root. */
function pasteDestFor(sel: string | null): string {
  const ex = useExplorer.getState()
  if (!sel) return ex.root as string
  const parent = parentOf(sel)
  const entry = ex.entries[parent]?.find((it) => it.path === sel)
  return entry?.isDir ? sel : parent
}

function SearchResults({ results }: { results: string[] }): React.JSX.Element {
  const root = useExplorer((s) => s.root)
  const select = useExplorer((s) => s.select)
  const selected = useExplorer((s) => s.selected)

  if (!root) return <></>
  if (results.length === 0) {
    return <p className="px-3 py-4 text-center font-ui text-[11.5px] text-ink-3">No matches</p>
  }
  return (
    <div className="py-1">
      {results.map((path) => {
        const name = baseName(path)
        const spec = fileIcon(name)
        const Icon = spec.icon
        const rel = path.slice(root.length + 1)
        return (
          <button
            key={path}
            draggable
            onDragStart={(e) => {
              // Native drag (drag out to Explorer) + stash for same-window drops.
              e.preventDefault()
              setTreeDragPath(path)
              window.quarterdeck.shell.startDrag(path)
            }}
            onDragEnd={() => setTreeDragPath(null)}
            onClick={() => select(path)}
            onDoubleClick={() => useEditorStore.getState().openFile(path)}
            title={path}
            className={`flex w-full items-center gap-1.5 px-2.5 py-[3px] text-left transition-colors duration-75 ${
              selected === path ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-raised'
            }`}
          >
            <Icon size={13} className="shrink-0" style={{ color: spec.color }} aria-hidden="true" />
            <span className="truncate font-ui text-[12px]">{rel}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Sidebar(): React.JSX.Element | null {
  const root = useExplorer((s) => s.root)
  const visible = useExplorer((s) => s.visible)
  const showHidden = useExplorer((s) => s.showHidden)
  const filter = useExplorer((s) => s.filter)
  const openFolder = useExplorer((s) => s.openFolder)
  const toggleHidden = useExplorer((s) => s.toggleHidden)
  const setFilter = useExplorer((s) => s.setFilter)
  const refreshDirs = useExplorer((s) => s.refreshDirs)
  const toggleSidebar = useExplorer((s) => s.toggleSidebar)
  const sidebarSide = useSettings((s) => s.settings.general.sidebarSide)
  const setSide = (side: 'left' | 'right'): void =>
    useSettings.getState().update('general', { sidebarSide: side })

  const [width, setWidth] = useState(260)
  const [pendingOp, setPendingOp] = useState<PendingOp>(null)
  const [results, setResults] = useState<string[]>([])
  const sidebarRef = useRef<HTMLElement>(null)

  // live refresh from the fs watcher
  useEffect(() => window.quarterdeck.fs.onChanged((dirs) => void refreshDirs(dirs)), [refreshDirs])

  // debounced filename search
  useEffect(() => {
    if (!root || filter.trim() === '') {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      void window.quarterdeck.fs.search(root, filter.trim(), showHidden).then(setResults)
    }, 250)
    return () => clearTimeout(t)
  }, [root, filter, showHidden])

  if (!visible) return null

  const onResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent): void => {
      const rect = sidebarRef.current?.getBoundingClientRect()
      if (!rect) return
      const w = sidebarSide === 'right' ? rect.right - ev.clientX : ev.clientX - rect.left
      setWidth(Math.min(MAX_W, Math.max(MIN_W, w)))
    }
    const onUp = (): void => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  const headerButton =
    'rounded p-1 text-ink-3 transition-colors duration-100 hover:bg-raised hover:text-ink'

  return (
    <aside
      ref={sidebarRef}
      style={{ width }}
      className={`relative flex shrink-0 flex-col bg-base border-edge-2 ${
        sidebarSide === 'right' ? 'border-l' : 'border-r'
      }`}
    >
      {!root && (
        <button
          aria-label="Hide sidebar"
          title="Hide sidebar (Ctrl+B)"
          onClick={toggleSidebar}
          className={`absolute top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md text-ink-3 transition-colors duration-100 hover:bg-raised hover:text-ink ${
            sidebarSide === 'right' ? 'left-1.5' : 'right-1.5'
          }`}
        >
          <PanelLeftClose size={13} />
        </button>
      )}
      {root ? (
        <>
          <header className="flex h-8 shrink-0 items-center gap-1 border-b border-edge-2 pr-1.5 pl-3">
            <span
              className="min-w-0 flex-1 truncate font-ui text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase"
              title={root}
            >
              {baseName(root)}
            </span>
            <button
              aria-label="New file in root"
              title="New file"
              className={headerButton}
              onClick={() => setPendingOp({ mode: 'create-file', dir: root })}
            >
              <FilePlus size={13} />
            </button>
            <button
              aria-label="New folder in root"
              title="New folder"
              className={headerButton}
              onClick={() => setPendingOp({ mode: 'create-dir', dir: root })}
            >
              <FolderPlus size={13} />
            </button>
            <button
              aria-label={showHidden ? 'Hide hidden files' : 'Show hidden files'}
              title={`${showHidden ? 'Hide' : 'Show'} hidden files (Ctrl+Shift+.)`}
              className={headerButton}
              onClick={toggleHidden}
            >
              {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button
              aria-label="Open another folder"
              title="Open folder"
              className={headerButton}
              onClick={() => void openFolder()}
            >
              <FolderOpen size={13} />
            </button>
            <button
              aria-label={sidebarSide === 'left' ? 'Dock sidebar to the right' : 'Dock sidebar to the left'}
              title={sidebarSide === 'left' ? 'Dock right' : 'Dock left'}
              className={headerButton}
              onClick={() => setSide(sidebarSide === 'left' ? 'right' : 'left')}
            >
              {sidebarSide === 'left' ? <PanelRight size={13} /> : <PanelLeft size={13} />}
            </button>
            <button
              aria-label="Hide sidebar"
              title="Hide sidebar (Ctrl+B)"
              className={headerButton}
              onClick={toggleSidebar}
            >
              <PanelLeftClose size={13} />
            </button>
          </header>

          <div className="flex shrink-0 items-center gap-1.5 border-b border-edge-2 px-2.5 py-1.5">
            <Search size={12} className="shrink-0 text-ink-3" aria-hidden="true" />
            <input
              id="qd-sidebar-search"
              value={filter}
              placeholder="Search files…"
              className="min-w-0 flex-1 bg-transparent font-ui text-[12px] text-ink outline-none placeholder:text-ink-3"
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFilter('')
              }}
            />
            {filter !== '' && (
              <button
                aria-label="Clear search"
                onClick={() => setFilter('')}
                className="shrink-0 rounded p-0.5 text-ink-3 hover:text-ink"
              >
                <X size={11} />
              </button>
            )}
          </div>

          <div
            id="qd-sidebar-tree"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto outline-none"
            onKeyDown={(e) => {
              if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
              const ex = useExplorer.getState()
              const sel = ex.selected
              const key = e.key.toLowerCase()
              if (key === 'c' && sel) {
                e.preventDefault()
                e.stopPropagation()
                ex.copy(sel)
              } else if (key === 'x' && sel) {
                e.preventDefault()
                e.stopPropagation()
                ex.cut(sel)
              } else if (key === 'v') {
                // in-app clipboard if staged, otherwise the OS clipboard
                e.preventDefault()
                e.stopPropagation()
                void ex.pasteAuto(pasteDestFor(sel))
              }
            }}
            onDragOver={(e) => {
              // fallback drop zone (search results / empty space) — lands in root
              if (root && (getTreeDragPath() || isExternalFileDrag(e.dataTransfer))) {
                e.preventDefault()
                e.dataTransfer.dropEffect = getTreeDragPath() ? 'move' : 'copy'
              }
            }}
            onDrop={(e) => {
              if (!root) return
              const internal = getTreeDragPath()
              if (internal) {
                e.preventDefault()
                setTreeDragPath(null)
                void useExplorer.getState().move(internal, root)
              } else if (isExternalFileDrag(e.dataTransfer)) {
                e.preventDefault()
                void useExplorer.getState().importDrop(e.dataTransfer, root)
              }
            }}
          >
            {filter.trim() !== '' ? (
              <SearchResults results={results} />
            ) : (
              <FileTree pendingOp={pendingOp} setPendingOp={setPendingOp} />
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <FolderOpen size={20} className="text-ink-3" aria-hidden="true" />
          <p className="font-ui text-[13px] font-medium text-ink-2">No folder open</p>
          <p className="font-ui text-[11.5px] leading-relaxed text-ink-3">
            Open a folder to browse files and drop paths into terminals.
          </p>
          <button
            onClick={() => void openFolder()}
            className="mt-1 rounded-md bg-accent px-3 py-1.5 font-ui text-[12px] font-semibold text-ink-inverse"
          >
            Open Folder
          </button>
        </div>
      )}

      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onResize}
        className={`absolute top-0 z-10 h-full w-[6px] cursor-col-resize ${
          sidebarSide === 'right' ? '-left-[3px]' : '-right-[3px]'
        }`}
      />
    </aside>
  )
}
