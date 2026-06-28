import type { AgentEvent } from '@shared/types'

export interface TextSegment {
  type: 'text'
  text: string
  streaming: boolean
}

export interface ToolSegment {
  type: 'tool'
  id: string
  name: string
  input: unknown
  status: 'running' | 'ok' | 'error'
  preview?: string
}

export type Segment = TextSegment | ToolSegment

export type TranscriptItem =
  | { type: 'user'; id: string; text: string; ts: number }
  | { type: 'assistant'; id: string; segments: Segment[] }
  | {
      type: 'permission'
      id: string
      requestId: string
      toolName: string
      input: unknown
      resolved?: 'allowed' | 'denied'
    }
  | { type: 'note'; id: string; tone: 'error' | 'info'; text: string }

let counter = 0
const nextId = (): string => `t${++counter}`

export function userItem(text: string): TranscriptItem {
  return { type: 'user', id: nextId(), text, ts: Date.now() }
}

function lastAssistant(items: TranscriptItem[]): Extract<TranscriptItem, { type: 'assistant' }> | null {
  const last = items[items.length - 1]
  return last?.type === 'assistant' ? last : null
}

/**
 * Applies one agent event to the transcript, returning a new array when
 * anything changed. Streaming text deltas accumulate into a trailing
 * streaming segment, which the complete assistant message then replaces.
 */
export function applyEvent(items: TranscriptItem[], ev: AgentEvent): TranscriptItem[] {
  switch (ev.kind) {
    case 'text-delta': {
      const next = [...items]
      let item = lastAssistant(next)
      if (!item) {
        item = { type: 'assistant', id: nextId(), segments: [] }
        next.push(item)
      } else {
        next[next.length - 1] = item = { ...item, segments: [...item.segments] }
      }
      const segs = item.segments
      const last = segs[segs.length - 1]
      if (last?.type === 'text' && last.streaming) {
        segs[segs.length - 1] = { ...last, text: last.text + ev.text }
      } else {
        segs.push({ type: 'text', text: ev.text, streaming: true })
      }
      return next
    }

    case 'assistant-message': {
      const next = [...items]
      let item = lastAssistant(next)
      if (!item) {
        item = { type: 'assistant', id: nextId(), segments: [] }
        next.push(item)
      } else {
        next[next.length - 1] = item = { ...item, segments: [...item.segments] }
      }
      // the complete message supersedes whatever streamed in for it
      while (item.segments.length > 0) {
        const last = item.segments[item.segments.length - 1]
        if (last.type === 'text' && last.streaming) item.segments.pop()
        else break
      }
      for (const block of ev.blocks) {
        if (block.type === 'text') {
          item.segments.push({ type: 'text', text: block.text, streaming: false })
        } else {
          item.segments.push({
            type: 'tool',
            id: block.id,
            name: block.name,
            input: block.input,
            status: 'running'
          })
        }
      }
      return next
    }

    case 'tool-result': {
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i]
        if (item.type !== 'assistant') continue
        const idx = item.segments.findIndex((s) => s.type === 'tool' && s.id === ev.toolUseId)
        if (idx === -1) continue
        const next = [...items]
        const segments = [...item.segments]
        const seg = segments[idx] as ToolSegment
        segments[idx] = { ...seg, status: ev.isError ? 'error' : 'ok', preview: ev.preview }
        next[i] = { ...item, segments }
        return next
      }
      return items
    }

    case 'permission-request':
      return [
        ...items,
        {
          type: 'permission',
          id: nextId(),
          requestId: ev.requestId,
          toolName: ev.toolName,
          input: ev.input
        }
      ]

    case 'result': {
      if (!ev.isError) return items
      return [
        ...items,
        { type: 'note', id: nextId(), tone: 'error', text: ev.errorText ?? 'The turn ended with an error.' }
      ]
    }

    case 'exit': {
      const text =
        ev.code === 0
          ? 'Claude session ended.'
          : `Claude process exited unexpectedly (code ${ev.code}).`
      return [...items, { type: 'note', id: nextId(), tone: ev.code === 0 ? 'info' : 'error', text }]
    }

    default:
      return items
  }
}

export function resolvePermission(
  items: TranscriptItem[],
  requestId: string,
  resolved: 'allowed' | 'denied'
): TranscriptItem[] {
  return items.map((item) =>
    item.type === 'permission' && item.requestId === requestId ? { ...item, resolved } : item
  )
}
