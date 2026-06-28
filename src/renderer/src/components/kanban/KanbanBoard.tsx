import { useEffect, useState } from 'react'
import { AlignLeft, ListTodo, Plus, Rows3, Search, SquareStack, X } from 'lucide-react'
import type { KanbanCard, KanbanColumnId } from '@shared/types'
import { useKanban } from '../../store/kanban'
import { CardEditor, PRIORITIES } from './CardEditor'

const COLUMNS: { id: KanbanColumnId; label: string; accent: string }[] = [
  { id: 'backlog', label: 'Backlog', accent: '#5c677c' },
  { id: 'todo', label: 'Todo', accent: '#5b9dd9' },
  { id: 'inprogress', label: 'In Progress', accent: '#d8a956' },
  { id: 'inreview', label: 'In Review', accent: '#b583d9' },
  { id: 'done', label: 'Done', accent: '#4cc38a' }
]

function priorityOf(card: KanbanCard): { label: string; color: string } {
  const p = PRIORITIES.find((x) => x.value === card.priority) ?? PRIORITIES[1]
  return { label: p.label, color: p.color }
}

function QuickAdd({ column }: { column: KanbanColumnId }): React.JSX.Element {
  const addCard = useKanban((s) => s.addCard)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 font-ui text-[11.5px] text-ink-3 transition-colors duration-100 hover:bg-raised hover:text-ink-2"
      >
        <Plus size={12} aria-hidden="true" /> Add task
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={title}
      placeholder="Task title — Enter to add"
      className="w-full rounded-md border border-accent/50 bg-term px-2 py-1.5 font-ui text-[12px] text-ink outline-none placeholder:text-ink-3"
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => {
        if (title.trim() !== '') addCard(column, title)
        setTitle('')
        setEditing(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          addCard(column, title)
          setTitle('')
        } else if (e.key === 'Escape') {
          setTitle('')
          setEditing(false)
        }
      }}
    />
  )
}

export function KanbanBoard(): React.JSX.Element {
  const cards = useKanban((s) => s.cards)
  const search = useKanban((s) => s.search)
  const priorityFilter = useKanban((s) => s.priorityFilter)
  const tagFilter = useKanban((s) => s.tagFilter)
  const compact = useKanban((s) => s.compact)
  const setSearch = useKanban((s) => s.setSearch)
  const setPriorityFilter = useKanban((s) => s.setPriorityFilter)
  const setTagFilter = useKanban((s) => s.setTagFilter)
  const toggleCompact = useKanban((s) => s.toggleCompact)
  const moveCard = useKanban((s) => s.moveCard)
  const setOpen = useKanban((s) => s.setOpen)

  const [editing, setEditing] = useState<KanbanCard | null>(null)
  const [dragOverCol, setDragOverCol] = useState<KanbanColumnId | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  useEffect(() => {
    void useKanban.getState().load()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (editing) setEditing(null)
        else setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, setOpen])

  const allTags = [...new Set(cards.flatMap((c) => c.tags.map((t) => t.name)))].sort()

  const visible = (card: KanbanCard): boolean => {
    if (priorityFilter && card.priority !== priorityFilter) return false
    if (tagFilter && !card.tags.some((t) => t.name === tagFilter)) return false
    const q = search.trim().toLowerCase()
    if (q !== '' && !card.title.toLowerCase().includes(q) && !card.description.toLowerCase().includes(q)) {
      return false
    }
    return true
  }

  const onDropCard = (e: React.DragEvent, column: KanbanColumnId, beforeId: string | null): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCol(null)
    const id = e.dataTransfer.getData('application/x-qd-card')
    if (id !== '') moveCard(id, column, beforeId)
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-base">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-edge-2 px-4">
        <span className="flex items-center gap-2 font-ui text-[13px] font-semibold text-ink">
          <ListTodo size={15} className="text-accent" aria-hidden="true" />
          Task Board
        </span>

        <div className="flex items-center gap-1.5 rounded-md border border-edge bg-term px-2 py-1">
          <Search size={11} className="text-ink-3" aria-hidden="true" />
          <input
            value={search}
            placeholder="Search tasks…"
            className="w-40 bg-transparent font-ui text-[11.5px] text-ink outline-none placeholder:text-ink-3"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              onClick={() => setPriorityFilter(priorityFilter === p.value ? null : p.value)}
              aria-pressed={priorityFilter === p.value}
              className={`rounded-full border px-2 py-0.5 font-ui text-[10.5px] font-medium transition-colors duration-100 ${
                priorityFilter === p.value ? '' : 'border-edge text-ink-3 hover:text-ink-2'
              }`}
              style={
                priorityFilter === p.value
                  ? { borderColor: p.color, backgroundColor: `${p.color}1f`, color: p.color }
                  : undefined
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <select
            value={tagFilter ?? ''}
            aria-label="Filter by tag"
            className="rounded-md border border-edge bg-term px-1.5 py-1 font-ui text-[11px] text-ink-2 outline-none"
            onChange={(e) => setTagFilter(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">all tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        )}

        <span className="ml-auto flex items-center gap-1">
          <button
            aria-label="Toggle compact mode"
            aria-pressed={compact}
            title="Compact mode"
            onClick={toggleCompact}
            className={`rounded p-1.5 transition-colors duration-100 ${compact ? 'text-accent' : 'text-ink-3 hover:text-ink'}`}
          >
            {compact ? <Rows3 size={14} /> : <SquareStack size={14} />}
          </button>
          <button
            aria-label="Close board"
            title="Close (Ctrl+Shift+K)"
            onClick={() => setOpen(false)}
            className="rounded p-1.5 text-ink-3 transition-colors duration-100 hover:text-ink"
          >
            <X size={14} />
          </button>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.column === col.id && visible(c))
          return (
            <section
              key={col.id}
              aria-label={col.label}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverCol(col.id)
              }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => onDropCard(e, col.id, null)}
              className={`flex w-[230px] shrink-0 flex-col rounded-xl border transition-colors duration-100 ${
                dragOverCol === col.id ? 'border-accent/60 bg-raised/60' : 'border-edge-2 bg-raised/30'
              }`}
            >
              <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col.accent }} aria-hidden="true" />
                <h3 className="font-ui text-[11.5px] font-semibold tracking-[0.08em] text-ink-2 uppercase">
                  {col.label}
                </h3>
                <span className="ml-auto font-ui text-[10.5px] text-ink-3 tabular-nums">{colCards.length}</span>
              </header>

              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
                {colCards.length === 0 && (
                  <p className="px-2 py-3 text-center font-ui text-[11px] text-ink-3 italic">
                    {col.id === 'backlog' ? 'Ideas land here' : 'Nothing here'}
                  </p>
                )}
                {colCards.map((card) => {
                  const prio = priorityOf(card)
                  return (
                    <article
                      key={card.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-qd-card', card.id)
                        setDraggingId(card.id)
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onDrop={(e) => onDropCard(e, col.id, card.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => setEditing(card)}
                      className={`cursor-pointer rounded-lg border border-edge-2 bg-raised px-2.5 py-2 transition-[border-color,box-shadow,opacity] duration-100 hover:border-edge hover:shadow-md ${
                        draggingId === card.id ? 'opacity-40 shadow-xl' : ''
                      }`}
                    >
                      {compact ? (
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: prio.color }} />
                          <span className="truncate font-ui text-[11.5px] text-ink">{card.title}</span>
                          {card.targetPane !== null && (
                            <span className="ml-auto shrink-0 font-mono text-[9.5px] text-ink-3">P{card.targetPane}</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="font-ui text-[12px] leading-snug font-medium text-ink">{card.title}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span
                              className="rounded-full px-1.5 py-px font-ui text-[9.5px] font-semibold"
                              style={{ backgroundColor: `${prio.color}1f`, color: prio.color }}
                            >
                              {prio.label}
                            </span>
                            {card.tags.map((tag) => (
                              <span
                                key={tag.name}
                                className="rounded-full px-1.5 py-px font-ui text-[9.5px] font-medium"
                                style={{ backgroundColor: `${tag.color}26`, color: tag.color }}
                              >
                                #{tag.name}
                              </span>
                            ))}
                            {card.description.trim() !== '' && (
                              <AlignLeft size={9} className="text-ink-3" aria-label="has description" />
                            )}
                            {card.targetPane !== null && (
                              <span className="ml-auto font-mono text-[9.5px] text-ink-3">P{card.targetPane}</span>
                            )}
                          </div>
                        </>
                      )}
                    </article>
                  )
                })}
              </div>

              <div className="shrink-0 px-2 pb-2">
                <QuickAdd column={col.id} />
              </div>
            </section>
          )
        })}
      </div>

      {editing && <CardEditor card={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
