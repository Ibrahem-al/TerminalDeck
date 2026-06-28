import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface MenuAction {
  label: string
  icon: LucideIcon
  disabled?: boolean
  danger?: boolean
  /** Insert a separator line above this item. */
  separator?: boolean
  onClick: () => void
}

interface Props {
  x: number
  y: number
  actions: MenuAction[]
  onClose: () => void
}

export function ContextMenu({ x, y, actions, onClose }: Props): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  // keep the menu inside the window
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.right > window.innerWidth) el.style.left = `${Math.max(0, x - rect.width)}px`
    if (rect.bottom > window.innerHeight) el.style.top = `${Math.max(0, y - rect.height)}px`
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div
        ref={menuRef}
        role="menu"
        style={{ left: x, top: y }}
        className="fixed z-50 min-w-[170px] rounded-lg border border-edge bg-overlay py-1 shadow-xl"
      >
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <div key={action.label}>
              {action.separator && <div className="mx-2 my-1 border-t border-edge-2" />}
              <button
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  action.onClick()
                  onClose()
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-ui text-[12.5px] transition-colors duration-75 hover:bg-raised focus-visible:bg-raised disabled:opacity-35 disabled:hover:bg-transparent ${
                  action.danger ? 'text-danger' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Icon size={13} className={action.danger ? 'text-danger' : 'text-ink-3'} aria-hidden="true" />
                {action.label}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
