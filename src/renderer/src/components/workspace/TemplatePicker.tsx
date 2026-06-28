import { useEffect } from 'react'
import { TEMPLATES, type Template } from './layout'
import { useSettings } from '../../store/settings'

function TemplateThumb({ template }: { template: Template }): React.JSX.Element {
  const cells = Array.from({ length: template.rows * template.cols })
  return (
    <div
      className="grid h-16 w-24 gap-[3px]"
      style={{
        gridTemplateRows: `repeat(${template.rows}, 1fr)`,
        gridTemplateColumns: `repeat(${template.cols}, 1fr)`
      }}
      aria-hidden="true"
    >
      {cells.map((_, i) => (
        <div key={i} className="rounded-[3px] border border-edge bg-raised" />
      ))}
    </div>
  )
}

interface Props {
  onPick: (template: Template) => void
  onClose: () => void
}

export function TemplatePicker({ onPick, onClose }: Props): React.JSX.Element {
  const defaultTemplate = useSettings((s) => s.settings.general.defaultTemplate)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-label="Choose workspace layout"
    >
      <div
        className="modal-enter rounded-xl border border-edge bg-overlay p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-ui text-[13px] font-semibold text-ink">New workspace</h2>
        <div className="flex gap-3">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              autoFocus={template.id === defaultTemplate}
              onClick={() => onPick(template)}
              className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors duration-100 hover:border-accent/60 focus-visible:border-accent ${
                template.id === defaultTemplate ? 'border-accent/40' : 'border-edge-2'
              }`}
            >
              <TemplateThumb template={template} />
              <span className="font-ui text-[11.5px] font-medium text-ink-2">{template.label}</span>
              <span className="font-ui text-[10px] text-ink-3">
                {template.rows * template.cols} pane{template.rows * template.cols > 1 ? 's' : ''}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-center font-ui text-[10.5px] text-ink-3">
          Panes start as PowerShell terminals — split any pane to add Git Bash, cmd, or Agent Chat.
        </p>
      </div>
    </div>
  )
}
