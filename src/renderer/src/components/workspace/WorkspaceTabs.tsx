import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useWorkspace } from '../../store/workspace'
import { TabContextMenu } from './TabContextMenu'

interface Props {
  onNewTab: () => void
}

/** The workspace tab strip — embedded in the top bar. Scrolls when crowded. */
export function WorkspaceTabs({ onNewTab }: Props): React.JSX.Element {
  const tabs = useWorkspace((s) => s.tabs)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  const setActiveTab = useWorkspace((s) => s.setActiveTab)
  const closeTab = useWorkspace((s) => s.closeTab)
  const reorderTabs = useWorkspace((s) => s.reorderTabs)
  const cycleTabColor = useWorkspace((s) => s.cycleTabColor)
  const renameTab = useWorkspace((s) => s.renameTab)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const dragFrom = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const beginRename = (tabId: string): void => {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return
    setDraft(tab.name)
    setEditingId(tab.id)
  }

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingId])

  return (
    <div className="app-no-drag flex min-w-0 items-center gap-1 overflow-x-auto px-1">
      {tabs.map((tab, i) => {
        const active = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            draggable={editingId !== tab.id}
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current !== null) reorderTabs(dragFrom.current, i)
              dragFrom.current = null
            }}
            title="Right-click for project & color options"
            className={`group flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md pr-1 pl-2.5 transition-colors duration-100 ${
              active ? 'bg-overlay' : 'hover:bg-raised'
            }`}
            onClick={() => setActiveTab(tab.id)}
            onContextMenu={(e) => {
              if (editingId === tab.id) return
              e.preventDefault()
              setCtxMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
            }}
          >
            <button
              aria-label="Change tab color"
              title="Double-click to change tab color"
              onDoubleClick={(e) => {
                e.stopPropagation()
                cycleTabColor(tab.id)
              }}
              className="h-2 w-2 shrink-0 rounded-full transition-transform duration-100 hover:scale-125"
              style={{ backgroundColor: tab.color }}
            />
            {editingId === tab.id ? (
              <input
                ref={inputRef}
                value={draft}
                className="w-24 rounded border border-accent/50 bg-term px-1 py-0.5 font-ui text-[11.5px] text-ink outline-none"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  renameTab(tab.id, draft)
                  setEditingId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renameTab(tab.id, draft)
                    setEditingId(null)
                  } else if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                onDoubleClick={() => beginRename(tab.id)}
                className={`font-ui text-[11.5px] font-medium select-none ${
                  active ? 'text-ink' : 'text-ink-3'
                }`}
                title="Double-click to rename"
              >
                {tab.name}
              </span>
            )}
            <button
              aria-label={`Close ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="rounded p-0.5 text-ink-3 opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        )
      })}

      <button
        aria-label="New workspace tab"
        title="New workspace tab (Ctrl+T)"
        onClick={onNewTab}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors duration-100 hover:bg-raised hover:text-ink"
      >
        <Plus size={14} />
      </button>

      {ctxMenu && (
        <TabContextMenu
          tabId={ctxMenu.tabId}
          anchor={{ x: ctxMenu.x, y: ctxMenu.y }}
          onClose={() => setCtxMenu(null)}
          onRename={() => beginRename(ctxMenu.tabId)}
        />
      )}
    </div>
  )
}
