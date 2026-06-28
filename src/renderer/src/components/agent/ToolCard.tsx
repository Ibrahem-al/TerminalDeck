import { memo, useState } from 'react'
import {
  Check,
  ChevronDown,
  FilePen,
  FileText,
  Globe,
  Loader2,
  Search,
  Terminal,
  Wrench,
  X,
  type LucideIcon
} from 'lucide-react'
import type { ToolSegment } from './transcript'

const TOOL_ICONS: Record<string, LucideIcon> = {
  Bash: Terminal,
  Read: FileText,
  Write: FilePen,
  Edit: FilePen,
  NotebookEdit: FilePen,
  Glob: Search,
  Grep: Search,
  WebFetch: Globe,
  WebSearch: Globe
}

function summarize(name: string, input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const o = input as Record<string, unknown>
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      if (typeof o[k] === 'string' && o[k] !== '') return o[k] as string
    }
    return ''
  }
  switch (name) {
    case 'Bash':
      return pick('command')
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return pick('file_path', 'notebook_path')
    case 'Glob':
    case 'Grep':
      return pick('pattern')
    case 'WebFetch':
      return pick('url')
    case 'WebSearch':
      return pick('query')
    case 'Task':
      return pick('description')
    case 'TodoWrite':
      return 'update task list'
    default: {
      const firstString = Object.values(o).find((v) => typeof v === 'string') as string | undefined
      return firstString ?? ''
    }
  }
}

export const ToolCard = memo(function ToolCard({ seg }: { seg: ToolSegment }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const Icon = TOOL_ICONS[seg.name] ?? Wrench
  const summary = summarize(seg.name, seg.input)

  return (
    <div
      className={`overflow-hidden rounded-md border ${
        seg.status === 'error' ? 'border-danger-edge' : 'border-edge-2'
      } bg-raised`}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-100 hover:bg-overlay"
      >
        <Icon size={13} className="shrink-0 text-ink-3" aria-hidden="true" />
        <span className="shrink-0 font-ui text-[12px] font-medium text-ink-2">{seg.name}</span>
        {summary !== '' && (
          <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-3">{summary}</code>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {seg.status === 'running' && (
            <Loader2 size={13} className="animate-spin text-accent" aria-label="running" />
          )}
          {seg.status === 'ok' && <Check size={13} className="text-ok" aria-label="done" />}
          {seg.status === 'error' && <X size={13} className="text-danger" aria-label="failed" />}
          <ChevronDown
            size={12}
            className={`text-ink-3 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t border-edge-2 px-2.5 py-2">
          <pre className="max-h-40 overflow-auto font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap text-ink-3 select-text">
            {JSON.stringify(seg.input, null, 2)}
          </pre>
          {seg.preview !== undefined && seg.preview !== '' && (
            <pre
              className={`max-h-48 overflow-auto rounded border border-edge-2 bg-term p-2 font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap select-text ${
                seg.status === 'error' ? 'text-danger' : 'text-term-ink'
              }`}
            >
              {seg.preview}
            </pre>
          )}
        </div>
      )}
    </div>
  )
})
