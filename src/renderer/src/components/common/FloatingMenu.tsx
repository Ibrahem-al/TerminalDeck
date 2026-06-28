import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Props {
  /** Preferred top-left position; clamped so the menu is always fully visible. */
  anchor: { x: number; y: number }
  onClose: () => void
  children: React.ReactNode
  minWidth?: number
}

/**
 * A popover menu anchored near a trigger, with a click-away backdrop and
 * viewport clamping so it never opens off-screen (e.g. when the trigger sits
 * against the right or bottom edge).
 */
export function FloatingMenu({ anchor, onClose, children, minWidth = 170 }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(anchor)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 8
    const x = Math.max(margin, Math.min(anchor.x, window.innerWidth - margin - r.width))
    const y = Math.max(margin, Math.min(anchor.y, window.innerHeight - margin - r.height))
    setPos({ x, y })
  }, [anchor.x, anchor.y])

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
        ref={ref}
        role="menu"
        style={{ left: pos.x, top: pos.y, minWidth }}
        className="fixed z-50 rounded-lg border border-edge bg-overlay py-1 shadow-xl"
      >
        {children}
      </div>
    </>
  )
}
