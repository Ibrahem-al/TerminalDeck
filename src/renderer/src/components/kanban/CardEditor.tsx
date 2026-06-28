import { useState } from 'react'
import { Eye, EyeOff, Plus, Send, Trash2, X } from 'lucide-react'
import type { KanbanCard, KanbanPriority, KanbanTag } from '@shared/types'
import { useKanban } from '../../store/kanban'
import { useWorkspace } from '../../store/workspace'
import { paneIdsIn } from '../workspace/layout'
import { sendToPane } from '../terminal/inputBus'
import { Markdown } from '../agent/Markdown'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { absoluteTime } from '../terminal/time'
import { toast } from '../../store/toasts'

const TAG_COLORS = ['#d8a956', '#5b9dd9', '#4cc38a', '#ed5d5d', '#b583d9', '#4fb8c9', '#e8b130', '#9aa4b8']

export const PRIORITIES: { value: KanbanPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: '#9aa4b8' },
  { value: 'medium', label: 'Medium', color: '#5b9dd9' },
  { value: 'high', label: 'High', color: '#e8913a' },
  { value: 'critical', label: 'Critical', color: '#ed5d5d' }
]

const inputCls =
  'w-full rounded-md border border-edge bg-term px-2.5 py-1.5 font-ui text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus-visible:border-accent'
const labelCls = 'mb-1 block font-ui text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase'

export function CardEditor({ card, onClose }: { card: KanbanCard; onClose: () => void }): React.JSX.Element {
  const updateCard = useKanban((s) => s.updateCard)
  const deleteCard = useKanban((s) => s.deleteCard)

  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)
  const [priority, setPriority] = useState<KanbanPriority>(card.priority)
  const [tags, setTags] = useState<KanbanTag[]>(card.tags)
  const [targetPane, setTargetPane] = useState<number | null>(card.targetPane)
  const [newTag, setNewTag] = useState('')
  const [preview, setPreview] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sendPane, setSendPane] = useState('')

  // panes of the active workspace tab, for "send to terminal"
  const ws = useWorkspace.getState()
  const activeTab = ws.tabs.find((t) => t.id === ws.activeTabId)
  const panes = activeTab
    ? paneIdsIn(activeTab.layout).map((id, i) => ({ id, number: i + 1, meta: ws.panes[id] }))
    : []

  const save = (): void => {
    if (title.trim() === '') return
    updateCard({ ...card, title: title.trim(), description, priority, tags, targetPane })
    onClose()
  }

  const send = (): void => {
    const target = panes.find((p) => p.id === sendPane)
    if (!target) return
    const text = `${title.trim()}\n${description.trim()}`.trim()
    sendToPane(target.id, text + '\r')
    toast('success', `Sent to pane ${target.number}`, target.meta?.name ?? '')
  }

  const addTag = (): void => {
    const name = newTag.trim()
    if (name === '' || tags.some((t) => t.name === name)) return
    setTags([...tags, { name, color: TAG_COLORS[tags.length % TAG_COLORS.length] }])
    setNewTag('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-label="Edit task"
    >
      <div
        className="modal-enter flex max-h-[84vh] w-[520px] flex-col overflow-hidden rounded-xl border border-edge bg-overlay shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-edge-2 px-5 py-3">
          <h2 className="font-ui text-[14px] font-semibold text-ink">Edit task</h2>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-3 hover:text-ink">
            <X size={14} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label htmlFor="ce-title" className={labelCls}>
              Title *
            </label>
            <input
              id="ce-title"
              value={title}
              className={inputCls}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <span className="flex items-center justify-between">
              <label htmlFor="ce-desc" className={labelCls}>
                Description (markdown)
              </label>
              <button
                onClick={() => setPreview((p) => !p)}
                className="flex items-center gap-1 font-ui text-[11px] text-ink-3 hover:text-ink"
              >
                {preview ? <EyeOff size={11} /> : <Eye size={11} />}
                {preview ? 'Edit' : 'Preview'}
              </button>
            </span>
            {preview ? (
              <div className="max-h-48 overflow-y-auto rounded-md border border-edge-2 bg-term px-3 py-2">
                {description.trim() === '' ? (
                  <p className="font-ui text-[12px] text-ink-3 italic">nothing to preview</p>
                ) : (
                  <Markdown text={description} />
                )}
              </div>
            ) : (
              <textarea
                id="ce-desc"
                value={description}
                rows={5}
                className={`${inputCls} resize-y`}
                placeholder="Notes, acceptance criteria, prompt text for an agent…"
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={labelCls}>Priority</span>
              <div className="flex gap-1">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPriority(p.value)}
                    aria-pressed={priority === p.value}
                    className={`rounded-md border px-2 py-1 font-ui text-[11px] font-medium transition-colors duration-100 ${
                      priority === p.value ? 'text-ink' : 'border-edge text-ink-3 hover:text-ink-2'
                    }`}
                    style={
                      priority === p.value
                        ? { borderColor: p.color, backgroundColor: `${p.color}1f`, color: p.color }
                        : undefined
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="ce-pane" className={labelCls}>
                Target pane
              </label>
              <input
                id="ce-pane"
                type="number"
                min={1}
                max={16}
                value={targetPane ?? ''}
                placeholder="none"
                className={`${inputCls} w-24 text-center`}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setTargetPane(e.target.value === '' || Number.isNaN(n) ? null : Math.max(1, Math.min(16, n)))
                }}
              />
            </div>
          </div>

          <div>
            <span className={labelCls}>Tags</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag.name}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 font-ui text-[11px] font-medium"
                  style={{ backgroundColor: `${tag.color}26`, color: tag.color }}
                >
                  <button
                    aria-label={`Change color of ${tag.name}`}
                    title="Change color"
                    onClick={() =>
                      setTags(
                        tags.map((t) =>
                          t.name === tag.name
                            ? { ...t, color: TAG_COLORS[(TAG_COLORS.indexOf(t.color) + 1) % TAG_COLORS.length] }
                            : t
                        )
                      )
                    }
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                  <button
                    aria-label={`Remove ${tag.name}`}
                    onClick={() => setTags(tags.filter((t) => t.name !== tag.name))}
                    className="opacity-60 hover:opacity-100"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                value={newTag}
                placeholder="add tag…"
                className="w-24 rounded-md border border-edge bg-term px-2 py-0.5 font-ui text-[11px] text-ink outline-none placeholder:text-ink-3 focus-visible:border-accent"
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
              />
              {newTag.trim() !== '' && (
                <button aria-label="Add tag" onClick={addTag} className="rounded p-0.5 text-accent">
                  <Plus size={12} />
                </button>
              )}
            </div>
          </div>

          <div>
            <span className={labelCls}>Send to terminal</span>
            <div className="flex gap-2">
              <select
                value={sendPane}
                aria-label="Choose pane"
                className={inputCls}
                onChange={(e) => setSendPane(e.target.value)}
              >
                <option value="">choose a pane…</option>
                {panes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} · {p.meta?.name ?? 'pane'} ({p.meta?.kind ?? '?'})
                  </option>
                ))}
              </select>
              <button
                onClick={send}
                disabled={sendPane === ''}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-edge px-2.5 font-ui text-[12px] font-medium text-ink-2 hover:border-accent hover:text-ink disabled:opacity-30"
              >
                <Send size={11} aria-hidden="true" /> Send
              </button>
            </div>
            <p className="mt-1 font-ui text-[10.5px] text-ink-3">
              Sends title + description as input — to a terminal as a command, to an Agent Chat as a prompt.
            </p>
          </div>

          <p className="font-ui text-[10.5px] text-ink-3">
            Created {absoluteTime(card.createdAt)} · updated {absoluteTime(card.updatedAt)}
          </p>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-edge-2 px-5 py-3">
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1.5 font-ui text-[12px] font-medium text-danger hover:border-danger"
          >
            <Trash2 size={12} aria-hidden="true" /> Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-edge px-3 py-1.5 font-ui text-[12px] font-medium text-ink-2 hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={title.trim() === ''}
              className="rounded-md bg-accent px-3 py-1.5 font-ui text-[12px] font-semibold text-ink-inverse disabled:opacity-30"
            >
              Save
            </button>
          </div>
        </footer>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this task?"
          body={`"${card.title}" will be removed from the board.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            deleteCard(card.id)
            onClose()
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
