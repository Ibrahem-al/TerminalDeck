import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useToasts, type ToastTone } from '../../store/toasts'

const TONE_ICON: Record<ToastTone, React.JSX.Element> = {
  success: <CheckCircle2 size={14} className="text-ok" aria-hidden="true" />,
  error: <AlertCircle size={14} className="text-danger" aria-hidden="true" />,
  info: <Info size={14} className="text-accent" aria-hidden="true" />
}

export function Toaster(): React.JSX.Element {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[320px] flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-enter pointer-events-auto flex items-start gap-2.5 rounded-lg border border-edge bg-overlay px-3 py-2.5 shadow-xl"
        >
          <span className="mt-0.5 shrink-0">{TONE_ICON[t.tone]}</span>
          <div className="min-w-0 flex-1">
            <p className="font-ui text-[12.5px] font-medium text-ink">{t.title}</p>
            {t.detail && (
              <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3" title={t.detail}>
                {t.detail}
              </p>
            )}
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
                className="mt-1.5 rounded-md bg-accent px-2 py-1 font-ui text-[11px] font-semibold text-ink-inverse"
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
            className="shrink-0 rounded p-0.5 text-ink-3 transition-colors duration-100 hover:text-ink"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
