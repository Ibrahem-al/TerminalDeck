import { useCallback, useEffect, useState } from 'react'
import { ClipboardPaste, Copy, Eraser, RotateCcw } from 'lucide-react'
import type { ShellKind } from '@shared/types'
import { useTerminalSession } from './useTerminalSession'
import { SearchBar } from './SearchBar'
import { ContextMenu, type MenuAction } from './ContextMenu'
import { PANE_DRAG_TYPE } from '../workspace/paneDrag'
import { getTreeDragPath, setTreeDragPath } from '../sidebar/dnd'

interface Props {
  shell?: ShellKind
  cwd?: string
  env?: Record<string, string>
  paneId?: string
  /** Command auto-run once the shell is ready (e.g. 'claude'). */
  autoRun?: string
  /** Whether this pane is the visible/focused one (scopes keyboard shortcuts). */
  active?: boolean
}

export function TerminalPane({ shell, cwd, env, paneId, autoRun, active = true }: Props): React.JSX.Element {
  const { attachRef, altScreen, exitCode, searchResults, restart, focus, paste, getSelection, clear, search, clearSearch } =
    useTerminalSession({ shell, cwd, env, paneId, autoRun })

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [dragOver, setDragOver] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  // Ctrl+F opens search (passes through to full-screen apps like vim)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && !altScreen) {
        e.preventDefault()
        e.stopPropagation()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, altScreen])

  // Panes stay mounted across deck switches / moves / restore (PaneLayer just
  // toggles visibility), so nothing re-runs start()'s initial term.focus(). Pull
  // keyboard focus here whenever this becomes the active pane, so keystrokes land
  // in the terminal instead of on <body> until the user clicks it.
  useEffect(() => {
    if (!active) return
    const raf = requestAnimationFrame(() => focus())
    return () => cancelAnimationFrame(raf)
  }, [active, focus])

  const closeSearch = useCallback((): void => {
    setSearchOpen(false)
    setQuery('')
    clearSearch()
    focus()
  }, [clearSearch, focus])

  const menuActions: MenuAction[] = [
    {
      label: 'Copy',
      icon: Copy,
      disabled: getSelection() === '',
      onClick: () => {
        const text = getSelection()
        if (text !== '') void navigator.clipboard.writeText(text)
      }
    },
    {
      label: 'Paste',
      icon: ClipboardPaste,
      onClick: () => {
        void navigator.clipboard.readText().then((text) => {
          if (text !== '') paste(text)
        })
      }
    },
    { label: 'Clear terminal', icon: Eraser, onClick: clear }
  ]

  const onDrop = (e: React.DragEvent): void => {
    // a pane being dragged for swap — let it bubble to the PaneFrame
    if (e.dataTransfer.types.includes(PANE_DRAG_TYPE)) return
    e.preventDefault()
    setDragOver(0)
    const quote = (p: string): string => (/\s/.test(p) ? `"${p}"` : p)

    // drag from the file tree / search results (same window): use the stashed
    // path, since a native-drag'd file isn't reliably redelivered to our window
    const internal = getTreeDragPath()
    if (internal) {
      setTreeDragPath(null)
      paste(quote(internal))
      return
    }

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    const paths = files
      .map((f) => window.quarterdeck.files.getPathForFile(f))
      .filter((p) => p !== '')
      .map(quote)
    if (paths.length > 0) paste(paths.join(' '))
  }

  return (
    <div
      className="relative flex h-full flex-col bg-term"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PANE_DRAG_TYPE)) e.preventDefault()
      }}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes(PANE_DRAG_TYPE)) return
        e.preventDefault()
        setDragOver((c) => c + 1)
      }}
      onDragLeave={() => setDragOver((c) => Math.max(0, c - 1))}
      onDrop={onDrop}
    >
      {searchOpen && (
        <SearchBar
          query={query}
          matchCount={searchResults.count}
          activeIndex={Math.max(0, searchResults.index)}
          onQueryChange={(q) => {
            setQuery(q)
            if (q === '') clearSearch()
            else search(q, 'next')
          }}
          onNext={() => search(query, 'next')}
          onPrev={() => search(query, 'prev')}
          onClose={closeSearch}
        />
      )}

      <div className="min-h-0 flex-1 px-2 py-1.5" onClick={focus}>
        <div ref={attachRef} className="h-full w-full" />
      </div>

      {exitCode !== null && (
        <div className="flex items-center justify-between border-t border-edge-2 bg-raised px-4 py-2">
          <span className="font-ui text-[12px] text-ink-2">Session ended · exit {exitCode}</span>
          <button
            onClick={restart}
            className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 font-ui text-[12px] font-medium text-ink-2 transition-colors duration-100 hover:border-accent hover:text-ink"
          >
            <RotateCcw size={12} aria-hidden="true" />
            New session
          </button>
        </div>
      )}

      {dragOver > 0 && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-base/70">
          <p className="font-ui text-[13px] font-medium text-accent">Drop to insert path</p>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} actions={menuActions} onClose={() => setMenu(null)} />}
    </div>
  )
}
