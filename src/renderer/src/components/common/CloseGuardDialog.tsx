import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useCloseGuard, type PendingClose } from '../../store/closeGuard'

/** "2 terminals and 1 agent", or '' when the thing being closed is empty. */
function contents(pending: PendingClose): string {
  const parts: string[] = []
  const add = (n: number, one: string, many: string): void => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`)
  }
  add(pending.terminals, 'terminal', 'terminals')
  add(pending.agents, 'agent', 'agents')
  add(pending.editors, 'editor', 'editors')
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * Accidental-close guard for decks and panes. Mounted once by the app shell; it
 * renders only while `useCloseGuard` holds a pending close (see that store for
 * how the close paths route through it).
 */
export function CloseGuardDialog(): React.JSX.Element | null {
  const pending = useCloseGuard((s) => s.pending)
  const [dontAsk, setDontAsk] = useState(false)

  // A fresh prompt always starts with the box unticked.
  useEffect(() => {
    if (pending) setDontAsk(false)
  }, [pending])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        useCloseGuard.getState().cancel()
      } else if (e.key === 'Enter') {
        e.stopPropagation()
        useCloseGuard.getState().confirm(dontAsk)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pending, dontAsk])

  if (!pending) return null

  const isTab = pending.kind === 'tab'
  const title = isTab ? `Close “${pending.name}”?` : `Close pane “${pending.name}”?`
  const running = contents(pending)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => useCloseGuard.getState().cancel()}
      role="alertdialog"
      aria-label={title}
    >
      <div
        className="modal-enter w-[380px] rounded-xl border border-edge bg-overlay p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="font-ui text-[13.5px] font-semibold text-ink">{title}</h2>
            <p className="mt-1.5 font-ui text-[12.5px] leading-relaxed text-ink-2">
              {running && (
                <>
                  Closing ends <span className="font-medium text-ink">{running}</span>
                  {isTab ? ' in this deck. ' : '. '}
                </>
              )}
              {!isTab && pending.closesTab && (
                <>
                  It’s the last pane in its deck, so <span className="font-medium text-ink">the deck closes too</span>.{' '}
                </>
              )}
              This can’t be undone.
            </p>
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 font-ui text-[11.5px] text-ink-3 select-none">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          Don’t ask again (change in Settings → General)
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => useCloseGuard.getState().cancel()}
            className="rounded-md border border-edge px-3 py-1.5 font-ui text-[12px] font-medium text-ink-2 transition-colors duration-100 hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => useCloseGuard.getState().confirm(dontAsk)}
            autoFocus
            className="rounded-md bg-danger px-3 py-1.5 font-ui text-[12px] font-semibold text-white transition-opacity duration-100 hover:opacity-90"
          >
            {isTab ? 'Close deck' : 'Close pane'}
          </button>
        </div>
      </div>
    </div>
  )
}
