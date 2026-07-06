import { memo, useEffect, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  Bot,
  ChevronDown,
  EyeOff,
  FileCode2,
  Folder,
  GripVertical,
  Pin,
  Plus,
  SquareSplitHorizontal,
  SquareSplitVertical,
  Tag,
  Terminal,
  X
} from 'lucide-react'
import type { ShellInfo } from '@shared/types'
import { useWorkspace, type NewPaneSpec, type PaneBadge, type PaneMeta } from '../../store/workspace'
import { usePaneCwd } from '../../store/paneCwd'
import { TerminalPane } from '../terminal/TerminalPane'
import { AgentChatPane } from '../agent/AgentChatPane'
import { EditorPane } from '../editor/EditorPane'
import { FloatingMenu } from '../common/FloatingMenu'
import { ColorWheel } from '../common/ColorWheel'
import { PANE_DRAG_TYPE } from './paneDrag'
import type { Direction } from './layout'

/** The pane currently being dragged by its header (single window). */
let draggedPaneId: string | null = null

/** Compact directory label for the pane header — last two path segments. */
function shortenCwd(p: string): string {
  const parts = p.split(/[\\/]+/).filter(Boolean)
  if (parts.length <= 2) return parts.join('/') || p
  return '…/' + parts.slice(-2).join('/')
}

const PRESET_BADGES: PaneBadge[] = [
  { label: 'Claude Code', color: '#d8a956' },
  { label: 'Dev Server', color: '#4cc38a' },
  { label: 'Git', color: '#e8b130' },
  { label: 'Test Runner', color: '#b583d9' },
  { label: 'REPL', color: '#4fb8c9' }
]

function BadgeEditor({
  anchor,
  current,
  onPick,
  onClose
}: {
  anchor: { x: number; y: number }
  current: PaneBadge | undefined
  onPick: (badge: PaneBadge | null) => void
  onClose: () => void
}): React.JSX.Element {
  const [label, setLabel] = useState(current?.label ?? '')
  const [color, setColor] = useState(current?.color ?? '#d8a956')
  const trimmed = label.trim()

  const apply = (): void => {
    if (trimmed === '') return
    onPick({ label: trimmed, color })
    onClose()
  }

  return (
    <FloatingMenu anchor={anchor} onClose={onClose} minWidth={244}>
      <div className="w-[244px] px-3 py-2.5">
        <p className="mb-2 font-ui text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
          Pane badge
        </p>

        <div className="mb-2.5 flex flex-wrap gap-1">
          {PRESET_BADGES.map((b) => (
            <button
              key={b.label}
              title={`Use “${b.label}”`}
              onClick={() => {
                setLabel(b.label)
                setColor(b.color)
              }}
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 font-ui text-[9.5px] font-semibold transition-transform duration-75 hover:scale-105"
              style={{ backgroundColor: `${b.color}26`, color: b.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: b.color }} aria-hidden="true" />
              {b.label}
            </button>
          ))}
        </div>

        <input
          autoFocus
          value={label}
          placeholder="Badge name…"
          className="mb-2.5 w-full rounded border border-edge bg-term px-2 py-1.5 font-ui text-[12px] text-ink outline-none placeholder:text-ink-3 focus-visible:border-accent"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
            else if (e.key === 'Escape') onClose()
          }}
        />

        <ColorWheel value={color} onChange={setColor} size={150} />

        <div className="mt-3 flex items-center justify-between gap-2">
          <span
            className="min-w-0 max-w-[110px] shrink truncate rounded-full px-1.5 py-px font-ui text-[9.5px] font-semibold"
            style={{ backgroundColor: `${color}26`, color }}
          >
            {trimmed || 'Preview'}
          </span>
          <div className="flex shrink-0 gap-1.5">
            {current && (
              <button
                onClick={() => {
                  onPick(null)
                  onClose()
                }}
                className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 font-ui text-[11px] font-medium text-danger transition-colors duration-100 hover:bg-danger-soft"
              >
                <X size={10} aria-hidden="true" /> Remove
              </button>
            )}
            <button
              onClick={apply}
              disabled={trimmed === ''}
              className="rounded-md bg-accent px-2.5 py-1 font-ui text-[11px] font-semibold text-ink-inverse transition-opacity disabled:opacity-30"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </FloatingMenu>
  )
}

function NewPaneMenu({
  anchor,
  onPick,
  onClose
}: {
  anchor: { x: number; y: number }
  onPick: (direction: Direction, spec: NewPaneSpec) => void
  onClose: () => void
}): React.JSX.Element {
  const [shells, setShells] = useState<ShellInfo[]>([])
  const [direction, setDirection] = useState<Direction>('row')

  useEffect(() => {
    void window.quarterdeck.pty.listShells().then(setShells)
  }, [])

  const pick = (spec: NewPaneSpec): void => {
    onPick(direction, spec)
    onClose()
  }

  const dirCls = (d: Direction): string =>
    `flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 font-ui text-[11.5px] font-medium transition-colors duration-75 ${
      direction === d ? 'bg-overlay text-ink' : 'text-ink-3 hover:text-ink-2'
    }`

  return (
    <FloatingMenu anchor={anchor} onClose={onClose} minWidth={210}>
      <div className="px-2.5 pt-2 pb-1">
        <p className="mb-1.5 px-0.5 font-ui text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
          Split direction
        </p>
        <div className="flex gap-1 rounded-md bg-base p-0.5">
          <button
            type="button"
            onClick={() => setDirection('row')}
            title="New pane to the right (side by side)"
            className={dirCls('row')}
          >
            <SquareSplitHorizontal size={13} aria-hidden="true" />
            Right
          </button>
          <button
            type="button"
            onClick={() => setDirection('column')}
            title="New pane below (stacked)"
            className={dirCls('column')}
          >
            <SquareSplitVertical size={13} aria-hidden="true" />
            Down
          </button>
        </div>
      </div>
      <div className="mx-2 my-1 border-t border-edge-2" />
      <p className="px-3 pt-1 pb-1 font-ui text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
        New pane
      </p>
      {shells.map((shell) => (
        <button
          key={shell.kind}
          role="menuitem"
          onClick={() => pick({ kind: 'terminal', shell: shell.kind })}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-ui text-[12.5px] text-ink-2 transition-colors duration-75 hover:bg-raised hover:text-ink"
        >
          <Terminal size={13} className="text-ink-3" aria-hidden="true" />
          {shell.label}
        </button>
      ))}
      <button
        role="menuitem"
        onClick={() => pick({ kind: 'editor' })}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-ui text-[12.5px] text-ink-2 transition-colors duration-75 hover:bg-raised hover:text-ink"
      >
        <FileCode2 size={13} className="text-ink-3" aria-hidden="true" />
        Editor
      </button>
    </FloatingMenu>
  )
}

/** Menu to move this pane into another deck (tab), or a brand-new one. */
function MoveMenu({
  paneId,
  currentTabId,
  anchor,
  onClose
}: {
  paneId: string
  currentTabId: string
  anchor: { x: number; y: number }
  onClose: () => void
}): React.JSX.Element {
  const tabs = useWorkspace((s) => s.tabs)
  const movePaneToTab = useWorkspace((s) => s.movePaneToTab)
  const movePaneToNewTab = useWorkspace((s) => s.movePaneToNewTab)
  const others = tabs.filter((t) => t.id !== currentTabId)

  return (
    <FloatingMenu anchor={anchor} onClose={onClose} minWidth={190}>
      <p className="px-3 pt-2 pb-1 font-ui text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
        Move to deck
      </p>
      {others.length === 0 && (
        <p className="px-3 pb-1.5 font-ui text-[11.5px] text-ink-3">No other decks yet.</p>
      )}
      {others.map((t) => (
        <button
          key={t.id}
          role="menuitem"
          onClick={() => {
            movePaneToTab(paneId, t.id)
            onClose()
          }}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-ui text-[12.5px] text-ink-2 transition-colors duration-75 hover:bg-raised hover:text-ink"
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
          <span className="truncate">{t.name}</span>
        </button>
      ))}
      <div className="mx-2 my-1 border-t border-edge-2" />
      <button
        role="menuitem"
        onClick={() => {
          movePaneToNewTab(paneId)
          onClose()
        }}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-ui text-[12.5px] text-ink-2 transition-colors duration-75 hover:bg-raised hover:text-ink"
      >
        <Plus size={13} className="text-ink-3" aria-hidden="true" /> New deck
      </button>
    </FloatingMenu>
  )
}

interface Props {
  pane: PaneMeta
  tabId: string
  isActive: boolean
  isTabActive: boolean
  isOnlyPane: boolean
}

export const PaneFrame = memo(function PaneFrame({
  pane,
  tabId,
  isActive,
  isTabActive,
  isOnlyPane
}: Props): React.JSX.Element {
  const splitPane = useWorkspace((s) => s.splitPane)
  const closePane = useWorkspace((s) => s.closePane)
  const setActivePane = useWorkspace((s) => s.setActivePane)
  const renamePane = useWorkspace((s) => s.renamePane)
  const setPaneBadge = useWorkspace((s) => s.setPaneBadge)
  const togglePin = useWorkspace((s) => s.togglePin)
  const swapPanes = useWorkspace((s) => s.swapPanes)
  const hidePane = useWorkspace((s) => s.hidePane)
  const liveCwd = usePaneCwd((s) => s.byPane[pane.id])

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(pane.name)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [badgeMenu, setBadgeMenu] = useState<{ x: number; y: number } | null>(null)
  const [moveMenu, setMoveMenu] = useState<{ x: number; y: number } | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const dropCounter = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commitRename = (): void => {
    renamePane(pane.id, draft)
    setEditing(false)
  }

  const openTypeMenu = (e: React.MouseEvent): void => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ x: rect.left, y: rect.bottom + 4 })
  }

  const isPaneDrag = (e: React.DragEvent): boolean =>
    draggedPaneId !== null && draggedPaneId !== pane.id && e.dataTransfer.types.includes(PANE_DRAG_TYPE)

  const KindIcon = pane.kind === 'agent' ? Bot : pane.kind === 'editor' ? FileCode2 : Terminal
  // Live cwd for terminals (reported by shell integration), spawn dir for agents.
  const dir = pane.kind === 'editor' ? undefined : liveCwd ?? pane.cwd

  return (
    <div
      onPointerDownCapture={() => setActivePane(tabId, pane.id)}
      onDragOver={(e) => {
        if (isPaneDrag(e)) e.preventDefault()
      }}
      onDragEnter={(e) => {
        if (!isPaneDrag(e)) return
        dropCounter.current++
        setDropActive(true)
      }}
      onDragLeave={(e) => {
        if (!isPaneDrag(e)) return
        dropCounter.current = Math.max(0, dropCounter.current - 1)
        if (dropCounter.current === 0) setDropActive(false)
      }}
      onDrop={(e) => {
        dropCounter.current = 0
        setDropActive(false)
        if (isPaneDrag(e)) {
          e.preventDefault()
          swapPanes(draggedPaneId!, pane.id)
        }
      }}
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-lg border transition-colors duration-150 ${
        isActive && isTabActive ? 'border-accent/40' : 'border-edge-2'
      }`}
    >
      <header
        draggable={!editing}
        onDragStart={(e) => {
          if (editing) return
          draggedPaneId = pane.id
          e.dataTransfer.setData(PANE_DRAG_TYPE, pane.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          draggedPaneId = null
          setDropActive(false)
        }}
        className="group flex h-7 shrink-0 cursor-grab items-center gap-1.5 border-b border-edge-2 bg-raised pr-1 pl-2 active:cursor-grabbing"
      >
        <GripVertical size={11} className="shrink-0 text-ink-3/60" aria-hidden="true" />
        <KindIcon
          size={11}
          className={pane.kind === 'agent' ? 'shrink-0 text-accent' : 'shrink-0 text-ink-3'}
          aria-hidden="true"
        />
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            className="w-36 rounded border border-accent/50 bg-term px-1 py-0.5 font-ui text-[11.5px] text-ink outline-none"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') {
                setDraft(pane.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button
            title="Rename pane"
            onClick={() => {
              setDraft(pane.name)
              setEditing(true)
            }}
            className={`truncate rounded px-1 font-ui text-[11.5px] font-medium transition-colors duration-100 hover:text-ink ${
              isActive && isTabActive ? 'text-ink' : 'text-ink-3'
            }`}
          >
            {pane.name}
          </button>
        )}

        {dir && (
          <span
            title={dir}
            className="flex min-w-0 shrink items-center gap-1 font-ui text-[10.5px] text-ink-3"
          >
            <Folder size={10} className="shrink-0 opacity-70" aria-hidden="true" />
            <span className="truncate">{shortenCwd(dir)}</span>
          </span>
        )}

        {pane.badge && (
          <button
            title="Change badge"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setBadgeMenu({ x: rect.left, y: rect.bottom + 4 })
            }}
            className="shrink-0 truncate rounded-full px-1.5 py-px font-ui text-[9.5px] font-semibold"
            style={{ backgroundColor: `${pane.badge.color}26`, color: pane.badge.color }}
          >
            {pane.badge.label}
          </button>
        )}

        {pane.pinned && <Pin size={10} className="shrink-0 fill-current text-accent" aria-label="pinned" />}

        <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus-within:opacity-100">
          {!pane.badge && (
            <button
              aria-label="Set pane badge"
              title="Set pane badge"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setBadgeMenu({ x: rect.left, y: rect.bottom + 4 })
              }}
              className="rounded p-1 text-ink-3 transition-colors duration-100 hover:text-ink"
            >
              <Tag size={12} />
            </button>
          )}
          <button
            aria-label={pane.pinned ? 'Unpin pane' : 'Pin pane'}
            title={pane.pinned ? 'Unpin pane' : 'Pin pane (prevents closing)'}
            onClick={() => togglePin(pane.id)}
            className={`rounded p-1 transition-colors duration-100 ${
              pane.pinned ? 'text-accent' : 'text-ink-3 hover:text-ink'
            }`}
          >
            <Pin size={12} className={pane.pinned ? 'fill-current' : ''} />
          </button>
          <button
            aria-label="Split right"
            title="Split right — new terminal (Ctrl+D)"
            onClick={() => splitPane(pane.id, 'row', { kind: 'terminal' })}
            className="rounded p-1 text-ink-3 transition-colors duration-100 hover:text-ink"
          >
            <SquareSplitHorizontal size={12} />
          </button>
          <button
            aria-label="Split down"
            title="Split down — new terminal (Ctrl+Shift+D)"
            onClick={() => splitPane(pane.id, 'column', { kind: 'terminal' })}
            className="rounded p-1 text-ink-3 transition-colors duration-100 hover:text-ink"
          >
            <SquareSplitVertical size={12} />
          </button>
          <button
            aria-label="Split options"
            title="Split — choose a shell or editor and the direction"
            onClick={openTypeMenu}
            className="rounded p-1 text-ink-3 transition-colors duration-100 hover:text-ink"
          >
            <ChevronDown size={12} />
          </button>
          <button
            aria-label="Move pane to another deck"
            title="Move to another deck"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setMoveMenu({ x: rect.left, y: rect.bottom + 4 })
            }}
            className="rounded p-1 text-ink-3 transition-colors duration-100 hover:text-ink"
          >
            <ArrowRightLeft size={12} />
          </button>
          <button
            aria-label="Hide pane"
            title="Hide pane — keeps it running; restore from the menu"
            onClick={() => hidePane(pane.id)}
            className="rounded p-1 text-ink-3 transition-colors duration-100 hover:text-ink"
          >
            <EyeOff size={12} />
          </button>
          <button
            aria-label="Close pane"
            title={pane.pinned ? 'Pinned — unpin to close' : isOnlyPane ? 'Closes this workspace tab' : 'Close pane'}
            onClick={() => closePane(pane.id)}
            className={`rounded p-1 transition-colors duration-100 ${
              pane.pinned ? 'cursor-not-allowed text-ink-3 opacity-40' : 'text-ink-3 hover:text-danger'
            }`}
          >
            <X size={12} />
          </button>
        </span>
      </header>

      <div className="min-h-0 flex-1">
        {pane.kind === 'terminal' ? (
          <TerminalPane
            shell={pane.shell}
            cwd={pane.cwd}
            env={pane.env}
            paneId={pane.id}
            autoRun={pane.autoRun}
            active={isActive && isTabActive}
          />
        ) : pane.kind === 'agent' ? (
          <AgentChatPane cwd={pane.cwd} paneId={pane.id} />
        ) : (
          <EditorPane paneId={pane.id} />
        )}
      </div>

      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-accent bg-accent-soft">
          <span className="rounded-md bg-overlay px-2.5 py-1 font-ui text-[11.5px] font-medium text-accent shadow">
            Swap here
          </span>
        </div>
      )}

      {menu && (
        <NewPaneMenu
          anchor={menu}
          onPick={(direction, spec) => splitPane(pane.id, direction, spec)}
          onClose={() => setMenu(null)}
        />
      )}
      {badgeMenu && (
        <BadgeEditor
          anchor={badgeMenu}
          current={pane.badge}
          onPick={(badge) => setPaneBadge(pane.id, badge)}
          onClose={() => setBadgeMenu(null)}
        />
      )}
      {moveMenu && (
        <MoveMenu paneId={pane.id} currentTabId={tabId} anchor={moveMenu} onClose={() => setMoveMenu(null)} />
      )}
    </div>
  )
})
