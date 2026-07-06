import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  ChevronRight,
  ClipboardCopy,
  ClipboardList,
  ClipboardPaste,
  Copy,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  PencilLine,
  Rocket,
  Scissors,
  Terminal,
  Trash2,
  ExternalLink
} from 'lucide-react'
import type { FsEntry } from '@shared/types'
import { useExplorer, fsAction } from '../../store/explorer'
import { useWorkspace } from '../../store/workspace'
import { useEditorStore } from '../../store/editor'
import { toast } from '../../store/toasts'
import { fileIcon } from './fileIcons'
import { isExternalFileDrag, getTreeDragPath, setTreeDragPath } from './dnd'
import { ContextMenu, type MenuAction } from '../terminal/ContextMenu'

export type PendingOp =
  | { mode: 'create-file' | 'create-dir'; dir: string }
  | { mode: 'rename'; path: string; name: string; dir: string }
  | null

function joinPath(dir: string, name: string): string {
  return `${dir}${dir.endsWith('\\') || dir.endsWith('/') ? '' : '\\'}${name}`
}

function parentOf(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i > 0 ? path.slice(0, i) : path
}

function NameInput({
  depth,
  initial,
  onCommit,
  onCancel
}: {
  depth: number
  initial: string
  onCommit: (name: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const dot = initial.lastIndexOf('.')
    ref.current?.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])

  return (
    <div style={{ paddingLeft: 8 + depth * 14 }} className="flex items-center py-0.5 pr-2">
      <input
        ref={ref}
        value={value}
        className="w-full rounded border border-accent/60 bg-term px-1.5 py-0.5 font-ui text-[12px] text-ink outline-none"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => (value.trim() === '' ? onCancel() : onCommit(value.trim()))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (value.trim() !== '') onCommit(value.trim())
          } else if (e.key === 'Escape') onCancel()
        }}
      />
    </div>
  )
}

interface FileTreeProps {
  pendingOp: PendingOp
  setPendingOp: (op: PendingOp) => void
}

export function FileTree({ pendingOp, setPendingOp }: FileTreeProps): React.JSX.Element {
  const root = useExplorer((s) => s.root)
  const entries = useExplorer((s) => s.entries)
  const expanded = useExplorer((s) => s.expanded)
  const showHidden = useExplorer((s) => s.showHidden)
  const selected = useExplorer((s) => s.selected)
  const clipboard = useExplorer((s) => s.clipboard)
  const select = useExplorer((s) => s.select)
  const toggleDir = useExplorer((s) => s.toggleDir)
  const loadDir = useExplorer((s) => s.loadDir)
  const copy = useExplorer((s) => s.copy)
  const cut = useExplorer((s) => s.cut)
  const pasteAuto = useExplorer((s) => s.pasteAuto)
  const move = useExplorer((s) => s.move)
  const importDrop = useExplorer((s) => s.importDrop)
  const openInActiveTab = useWorkspace((s) => s.openInActiveTab)

  const [menu, setMenu] = useState<{ x: number; y: number; entry: FsEntry } | null>(null)
  // folder currently hovered as a drop target
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  if (!root) return <></>

  const commitPending = async (name: string): Promise<void> => {
    const op = pendingOp
    if (!op) return
    if (op.mode === 'rename') {
      const newPath = joinPath(op.dir, name)
      if (newPath !== op.path) {
        const ok = await fsAction(
          () => window.quarterdeck.fs.rename(op.path, newPath),
          'Could not rename'
        )
        if (ok) {
          await loadDir(op.dir)
          select(newPath)
        }
      }
    } else {
      const path = joinPath(op.dir, name)
      const ok = await fsAction(
        () =>
          op.mode === 'create-file'
            ? window.quarterdeck.fs.createFile(path)
            : window.quarterdeck.fs.createDir(path),
        'Could not create'
      )
      if (ok) {
        await loadDir(op.dir)
        select(path)
      }
    }
    setPendingOp(null)
  }

  const menuActionsFor = (entry: FsEntry): MenuAction[] => {
    const dir = parentOf(entry.path)
    const pasteDir = entry.isDir ? entry.path : dir
    const actions: MenuAction[] = []

    if (entry.isDir) {
      actions.push(
        {
          label: 'Open Terminal Here',
          icon: Terminal,
          onClick: () => openInActiveTab({ kind: 'terminal', cwd: entry.path, name: entry.name })
        },
        {
          label: 'Open Claude Code Here',
          icon: Rocket,
          onClick: () =>
            openInActiveTab({
              kind: 'terminal',
              cwd: entry.path,
              name: 'Claude Code',
              autoRun: 'claude',
              badge: { label: 'Claude Code', color: '#d8a956' }
            })
        },
        {
          label: 'Open Agent Chat Here',
          icon: Bot,
          onClick: () => openInActiveTab({ kind: 'agent', cwd: entry.path, name: entry.name })
        },
        {
          label: 'New File',
          icon: FilePlus,
          separator: true,
          onClick: () => {
            if (!expanded.has(entry.path)) void toggleDir(entry.path)
            setPendingOp({ mode: 'create-file', dir: entry.path })
          }
        },
        {
          label: 'New Folder',
          icon: FolderPlus,
          onClick: () => {
            if (!expanded.has(entry.path)) void toggleDir(entry.path)
            setPendingOp({ mode: 'create-dir', dir: entry.path })
          }
        }
      )
    }

    actions.push(
      {
        label: 'Cut',
        icon: Scissors,
        separator: entry.isDir,
        onClick: () => cut(entry.path)
      },
      { label: 'Copy', icon: Copy, onClick: () => copy(entry.path) },
      {
        label: 'Paste',
        icon: ClipboardPaste,
        onClick: () => {
          if (entry.isDir && !expanded.has(entry.path)) void toggleDir(entry.path)
          void pasteAuto(pasteDir)
        }
      },
      {
        label: 'Rename',
        icon: PencilLine,
        separator: true,
        onClick: () => setPendingOp({ mode: 'rename', path: entry.path, name: entry.name, dir })
      },
      {
        label: 'Delete',
        icon: Trash2,
        danger: true,
        onClick: () => {
          void fsAction(() => window.quarterdeck.fs.delete(entry.path), 'Could not delete').then(
            (ok) => {
              if (ok) {
                toast('info', 'Moved to Recycle Bin', entry.name)
                void loadDir(dir)
              }
            }
          )
        }
      },
      {
        label: 'Copy Path',
        icon: ClipboardCopy,
        separator: true,
        onClick: () => void navigator.clipboard.writeText(entry.path)
      },
      {
        label: 'Copy Relative Path',
        icon: ClipboardList,
        onClick: () =>
          void navigator.clipboard.writeText(entry.path.slice(root.length + 1))
      },
      {
        label: 'Reveal in Explorer',
        icon: ExternalLink,
        onClick: () => window.quarterdeck.fs.reveal(entry.path)
      }
    )
    return actions
  }

  const renderDir = (dir: string, depth: number): React.JSX.Element[] => {
    const list = (entries[dir] ?? []).filter((e) => showHidden || !e.name.startsWith('.'))
    const rows: React.JSX.Element[] = []

    if (pendingOp && pendingOp.mode !== 'rename' && pendingOp.dir === dir) {
      rows.push(
        <NameInput
          key={`__pending-${dir}`}
          depth={depth}
          initial=""
          onCommit={(name) => void commitPending(name)}
          onCancel={() => setPendingOp(null)}
        />
      )
    }

    for (const entry of list) {
      if (pendingOp?.mode === 'rename' && pendingOp.path === entry.path) {
        rows.push(
          <NameInput
            key={entry.path}
            depth={depth}
            initial={pendingOp.name}
            onCommit={(name) => void commitPending(name)}
            onCancel={() => setPendingOp(null)}
          />
        )
        continue
      }

      const isOpen = entry.isDir && expanded.has(entry.path)
      const spec = fileIcon(entry.name)
      const Icon = entry.isDir ? (isOpen ? FolderOpen : Folder) : spec.icon

      const isCut = clipboard?.cut === true && clipboard.path === entry.path

      rows.push(
        <div key={entry.path}>
          <button
            draggable
            onDragStart={(e) => {
              // Native OS drag so the item can be dropped into Explorer/the desktop
              // (copies it). The source is stashed (setTreeDragPath) so a drop back
              // in this window resolves directly — a within-tree drop moves, a
              // terminal drop inserts the path — without depending on the OS
              // redelivering the file to our own window.
              e.preventDefault()
              setTreeDragPath(entry.path)
              window.quarterdeck.shell.startDrag(entry.path)
            }}
            onDragEnd={() => {
              setTreeDragPath(null)
              setDropTarget(null)
            }}
            onDragOver={(e) => {
              if (getTreeDragPath() || isExternalFileDrag(e.dataTransfer)) {
                // a file drag onto a file lands in that file's folder
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = getTreeDragPath() ? 'move' : 'copy'
                setDropTarget(entry.isDir ? entry.path : parentOf(entry.path))
              }
            }}
            onDragLeave={() => {
              const target = entry.isDir ? entry.path : parentOf(entry.path)
              if (dropTarget === target) setDropTarget(null)
            }}
            onDrop={(e) => {
              const internal = getTreeDragPath()
              if (internal || isExternalFileDrag(e.dataTransfer)) {
                e.preventDefault()
                e.stopPropagation()
                setTreeDragPath(null)
                const dest = entry.isDir ? entry.path : parentOf(entry.path)
                setDropTarget(null)
                if (internal) void move(internal, dest)
                else void importDrop(e.dataTransfer, dest)
              }
            }}
            onClick={() => {
              select(entry.path)
              if (entry.isDir) void toggleDir(entry.path)
            }}
            onDoubleClick={() => {
              if (!entry.isDir) useEditorStore.getState().openFile(entry.path)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              select(entry.path)
              setMenu({ x: e.clientX, y: e.clientY, entry })
            }}
            style={{ paddingLeft: 8 + depth * 14 }}
            title={entry.path}
            className={`flex w-full items-center gap-1.5 py-[3px] pr-2 text-left transition-colors duration-75 ${
              dropTarget === entry.path
                ? 'bg-accent-soft text-ink ring-1 ring-inset ring-accent'
                : selected === entry.path
                  ? 'bg-accent-soft text-ink'
                  : 'text-ink-2 hover:bg-raised'
            } ${isCut ? 'opacity-50' : ''}`}
          >
            {entry.isDir ? (
              <ChevronRight
                size={11}
                className={`shrink-0 text-ink-3 transition-transform duration-100 ${isOpen ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
            ) : (
              <span className="w-[11px] shrink-0" aria-hidden="true" />
            )}
            <Icon
              size={13}
              className="shrink-0"
              style={{ color: entry.isDir ? 'var(--accent)' : spec.color }}
              aria-hidden="true"
            />
            <span className="truncate font-ui text-[12px]">{entry.name}</span>
          </button>
          {isOpen && renderDir(entry.path, depth + 1)}
        </div>
      )
    }

    if (rows.length === 0 && depth > 0) {
      rows.push(
        <p
          key={`__empty-${dir}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          className="py-1 font-ui text-[11px] text-ink-3 italic"
        >
          empty
        </p>
      )
    }
    return rows
  }

  return (
    <div
      className={`min-h-full py-1 ${
        dropTarget === root ? 'rounded-sm ring-1 ring-inset ring-accent/60' : ''
      }`}
      onDragOver={(e) => {
        if (getTreeDragPath() || isExternalFileDrag(e.dataTransfer)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = getTreeDragPath() ? 'move' : 'copy'
          setDropTarget(root)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null)
      }}
      onDrop={(e) => {
        const internal = getTreeDragPath()
        if (internal || isExternalFileDrag(e.dataTransfer)) {
          e.preventDefault()
          e.stopPropagation()
          setTreeDragPath(null)
          setDropTarget(null)
          if (internal) void move(internal, root)
          else void importDrop(e.dataTransfer, root)
        }
      }}
    >
      {renderDir(root, 0)}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} actions={menuActionsFor(menu.entry)} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
