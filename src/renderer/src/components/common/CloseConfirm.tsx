import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useSettings } from '../../store/settings'

interface Props {
  /** Running terminal panes that would be killed. */
  terminals: number
  /** Running agent (Claude Code) panes that would be killed. */
  agents: number
  /** Open editor files with unsaved changes. */
  dirtyFiles: number
  onCancel: () => void
}

/** Confirmation shown when a window is about to close with live work in it.
 *  Confirming actually closes the window (via the main process). */
export function CloseConfirm({ terminals, agents, dirtyFiles, onCancel }: Props): React.JSX.Element {
  const [dontAsk, setDontAsk] = useState(false)

  const confirm = (): void => {
    if (dontAsk) {
      useSettings.getState().update('general', { confirmOnClose: false })
      useSettings.getState().flush()
    }
    window.quarterdeck.window.confirmClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') confirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel, dontAsk])

  const parts: string[] = []
  if (terminals > 0) parts.push(`${terminals} terminal${terminals === 1 ? '' : 's'}`)
  if (agents > 0) parts.push(`${agents} agent${agents === 1 ? '' : 's'}`)
  const running = parts.join(' and ')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
      role="alertdialog"
      aria-label="Close this window?"
    >
      <div
        className="modal-enter w-[380px] rounded-xl border border-edge bg-overlay p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="font-ui text-[13.5px] font-semibold text-ink">Close this window?</h2>
            <p className="mt-1.5 font-ui text-[12.5px] leading-relaxed text-ink-2">
              {running && (
                <>
                  Closing will end <span className="font-medium text-ink">{running}</span> in this
                  window.{' '}
                </>
              )}
              {dirtyFiles > 0 && (
                <>
                  <span className="font-medium text-danger">
                    {dirtyFiles} file{dirtyFiles === 1 ? ' has' : 's have'} unsaved changes
                  </span>{' '}
                  that will be lost.{' '}
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
            onClick={onCancel}
            className="rounded-md border border-edge px-3 py-1.5 font-ui text-[12px] font-medium text-ink-2 transition-colors duration-100 hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            autoFocus
            className="rounded-md bg-danger px-3 py-1.5 font-ui text-[12px] font-semibold text-white transition-opacity duration-100 hover:opacity-90"
          >
            Close window
          </button>
        </div>
      </div>
    </div>
  )
}
