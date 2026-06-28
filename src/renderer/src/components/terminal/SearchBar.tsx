import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

interface Props {
  query: string
  matchCount: number
  activeIndex: number
  onQueryChange: (q: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export function SearchBar({
  query,
  matchCount,
  activeIndex,
  onQueryChange,
  onNext,
  onPrev,
  onClose
}: Props): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="absolute top-2 right-4 z-30 flex items-center gap-1 rounded-lg border border-edge bg-overlay py-1 pr-1 pl-2.5 shadow-xl">
      <input
        ref={inputRef}
        value={query}
        placeholder="Search output…"
        className="w-44 bg-transparent font-ui text-[12.5px] text-ink outline-none placeholder:text-ink-3"
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.shiftKey ? onPrev() : onNext()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      <span className="min-w-[44px] text-right font-ui text-[11px] text-ink-3 tabular-nums">
        {query === '' ? '' : matchCount === 0 ? '0/0' : `${activeIndex + 1}/${matchCount}`}
      </span>
      <button
        aria-label="Previous match"
        onClick={onPrev}
        disabled={matchCount === 0}
        className="rounded p-1 text-ink-3 transition-colors duration-100 hover:text-ink disabled:opacity-30"
      >
        <ChevronUp size={13} />
      </button>
      <button
        aria-label="Next match"
        onClick={onNext}
        disabled={matchCount === 0}
        className="rounded p-1 text-ink-3 transition-colors duration-100 hover:text-ink disabled:opacity-30"
      >
        <ChevronDown size={13} />
      </button>
      <button
        aria-label="Close search"
        onClick={onClose}
        className="rounded p-1 text-ink-3 transition-colors duration-100 hover:text-ink"
      >
        <X size={13} />
      </button>
    </div>
  )
}
