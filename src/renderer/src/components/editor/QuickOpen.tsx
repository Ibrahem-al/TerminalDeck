import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useExplorer } from '../../store/explorer'
import { useEditorStore } from '../../store/editor'
import { fileIcon } from '../sidebar/fileIcons'

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i >= 0 ? path.slice(i + 1) : path
}

/** startsWith-name > includes-name > includes-path */
function rank(path: string, rel: string, q: string): number {
  const name = baseName(path).toLowerCase()
  if (name.startsWith(q)) return 0
  if (name.includes(q)) return 1
  if (rel.toLowerCase().includes(q)) return 2
  return 3
}

export function QuickOpen({ onClose }: { onClose: () => void }): React.JSX.Element {
  const root = useExplorer((s) => s.root)
  const showHidden = useExplorer((s) => s.showHidden)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<string[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  useEffect(() => {
    if (!root || query.trim() === '') {
      setResults([])
      setSelected(0)
      return
    }
    const t = setTimeout(() => {
      void window.quarterdeck.fs.search(root, query.trim(), showHidden).then((paths) => {
        const q = query.trim().toLowerCase()
        const sorted = paths
          .map((p) => ({ p, rel: p.slice(root.length + 1) }))
          .sort((a, b) => rank(a.p, a.rel, q) - rank(b.p, b.rel, q) || a.rel.length - b.rel.length)
          .map((x) => x.p)
          .slice(0, 50)
        setResults(sorted)
        setSelected(0)
      })
    }, 180)
    return () => clearTimeout(t)
  }, [root, query, showHidden])

  // keep the selected row in view
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const open = (path: string): void => {
    useEditorStore.getState().openFile(path)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={onClose}
      role="dialog"
      aria-label="Quick open"
    >
      <div
        className="modal-enter w-[520px] overflow-hidden rounded-xl border border-edge bg-overlay shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-edge-2 px-3.5 py-2.5">
          <Search size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            placeholder={root ? 'Search files by name…' : 'Open a folder first (sidebar)'}
            disabled={!root}
            className="min-w-0 flex-1 bg-transparent font-ui text-[13.5px] text-ink outline-none placeholder:text-ink-3"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelected((i) => Math.min(results.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelected((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter' && results[selected]) {
                e.preventDefault()
                open(results[selected])
              }
            }}
          />
        </div>

        {query.trim() !== '' && (
          <div ref={listRef} className="max-h-[44vh] overflow-y-auto py-1">
            {results.length === 0 ? (
              <p className="px-4 py-3 font-ui text-[12px] text-ink-3">No matches</p>
            ) : (
              results.map((path, i) => {
                const name = baseName(path)
                const spec = fileIcon(name)
                const Icon = spec.icon
                const rel = root ? path.slice(root.length + 1) : path
                return (
                  <button
                    key={path}
                    data-idx={i}
                    onClick={() => open(path)}
                    onMouseEnter={() => setSelected(i)}
                    className={`flex w-full items-center gap-2 px-3.5 py-1.5 text-left ${
                      i === selected ? 'bg-raised text-ink' : 'text-ink-2'
                    }`}
                  >
                    <Icon size={13} className="shrink-0" style={{ color: spec.color }} aria-hidden="true" />
                    <span className="shrink-0 font-ui text-[12.5px]">{name}</span>
                    <span className="min-w-0 truncate font-ui text-[11px] text-ink-3">{rel}</span>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
