import { create } from 'zustand'
import type { KanbanCard, KanbanColumnId, KanbanPriority } from '@shared/types'
import { useWorkspace } from './workspace'
import { paneIdsIn } from '../components/workspace/layout'
import { toast } from './toasts'

interface KanbanStore {
  cards: KanbanCard[]
  open: boolean
  loaded: boolean
  search: string
  priorityFilter: KanbanPriority | null
  tagFilter: string | null
  compact: boolean

  load: () => Promise<void>
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setSearch: (q: string) => void
  setPriorityFilter: (p: KanbanPriority | null) => void
  setTagFilter: (tag: string | null) => void
  toggleCompact: () => void

  addCard: (column: KanbanColumnId, title: string) => void
  updateCard: (card: KanbanCard) => void
  deleteCard: (id: string) => void
  /** Move to a column; insert before `beforeId` or append when null. */
  moveCard: (id: string, column: KanbanColumnId, beforeId: string | null) => void

  /** Terminal hook: command finished in a pane → offer In Progress cards a move. */
  onPaneCommandExit: (paneId: string, exitCode: number) => void
}

let persistTimer: ReturnType<typeof setTimeout> | undefined
function persist(cards: KanbanCard[]): void {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void window.quarterdeck.kanban.save(cards)
  }, 400)
}

/** One offer per card per minute — repeated commands shouldn't spam toasts. */
const lastOffered = new Map<string, number>()

export const useKanban = create<KanbanStore>((set, get) => ({
  cards: [],
  open: false,
  loaded: false,
  search: '',
  priorityFilter: null,
  tagFilter: null,
  compact: false,

  load: async () => {
    if (get().loaded) return
    const cards = await window.quarterdeck.kanban.load()
    set({ cards, loaded: true })
  },

  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  setSearch: (search) => set({ search }),
  setPriorityFilter: (priorityFilter) => set({ priorityFilter }),
  setTagFilter: (tagFilter) => set({ tagFilter }),
  toggleCompact: () => set((s) => ({ compact: !s.compact })),

  addCard: (column, title) => {
    if (title.trim() === '') return
    const card: KanbanCard = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: '',
      priority: 'medium',
      tags: [],
      targetPane: null,
      column,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    set((s) => {
      const cards = [...s.cards, card]
      persist(cards)
      return { cards }
    })
  },

  updateCard: (card) =>
    set((s) => {
      const cards = s.cards.map((c) => (c.id === card.id ? { ...card, updatedAt: Date.now() } : c))
      persist(cards)
      return { cards }
    }),

  deleteCard: (id) =>
    set((s) => {
      const cards = s.cards.filter((c) => c.id !== id)
      persist(cards)
      return { cards }
    }),

  moveCard: (id, column, beforeId) =>
    set((s) => {
      const card = s.cards.find((c) => c.id === id)
      if (!card) return s
      const rest = s.cards.filter((c) => c.id !== id)
      const moved: KanbanCard = { ...card, column, updatedAt: Date.now() }
      let cards: KanbanCard[]
      if (beforeId) {
        const idx = rest.findIndex((c) => c.id === beforeId)
        cards = idx >= 0 ? [...rest.slice(0, idx), moved, ...rest.slice(idx)] : [...rest, moved]
      } else {
        cards = [...rest, moved]
      }
      persist(cards)
      return { cards }
    }),

  onPaneCommandExit: (paneId, exitCode) => {
    if (exitCode !== 0) return
    const ws = useWorkspace.getState()
    const tab = ws.tabs.find((t) => paneIdsIn(t.layout).includes(paneId))
    if (!tab) return
    const paneNumber = paneIdsIn(tab.layout).indexOf(paneId) + 1

    const matches = get().cards.filter(
      (c) => c.column === 'inprogress' && c.targetPane === paneNumber
    )
    const now = Date.now()
    for (const card of matches) {
      const last = lastOffered.get(card.id) ?? 0
      if (now - last < 60_000) continue
      lastOffered.set(card.id, now)
      toast(
        'info',
        `Pane ${paneNumber} finished (exit 0)`,
        card.title,
        { label: 'Move to In Review', onClick: () => get().moveCard(card.id, 'inreview', null) }
      )
    }
  }
}))
