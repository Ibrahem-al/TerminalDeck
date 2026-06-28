import { useEffect } from 'react'

interface Props {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel
}: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
      role="alertdialog"
      aria-label={title}
    >
      <div
        className="modal-enter w-[360px] rounded-xl border border-edge bg-overlay p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-ui text-[13.5px] font-semibold text-ink">{title}</h2>
        <p className="mt-1.5 font-ui text-[12.5px] leading-relaxed text-ink-2">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-edge px-3 py-1.5 font-ui text-[12px] font-medium text-ink-2 transition-colors duration-100 hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`rounded-md px-3 py-1.5 font-ui text-[12px] font-semibold transition-opacity duration-100 ${
              danger ? 'bg-danger text-white' : 'bg-accent text-ink-inverse'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
