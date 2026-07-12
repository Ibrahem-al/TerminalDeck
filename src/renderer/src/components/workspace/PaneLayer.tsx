import { useMemo, useRef, useState } from 'react'
import { Bot, EyeOff, FileCode2, Terminal, X } from 'lucide-react'
import { useWorkspace, type PaneMeta } from '../../store/workspace'
import { FloatingMenu } from '../common/FloatingMenu'
import { layoutGeometry, MIN_RATIO, MAX_RATIO, type DividerInfo, type Geometry, type Rect } from './layout'
import { PaneFrame } from './PaneFrame'

function Divider({
  divider,
  tabId,
  containerRef
}: {
  divider: DividerInfo
  tabId: string
  containerRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const setSplitRatio = useWorkspace((s) => s.setSplitRatio)
  const isRow = divider.direction === 'row'

  const onPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    // Keep the resize cursor and suppress text selection for the whole drag, so
    // sweeping across a terminal pane doesn't flip the cursor or select its text.
    document.body.style.cursor = isRow ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent): void => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const pct = isRow
        ? ((ev.clientX - rect.left) / rect.width) * 100
        : ((ev.clientY - rect.top) / rect.height) * 100
      setSplitRatio(tabId, divider.splitId, (pct - divider.start) / divider.size)
    }
    // Clear the overrides back to their unset defaults on ANY drag end —
    // pointerup or a pointercancel (touch/pen/OS interruption). Resetting to ''
    // (not a captured snapshot) means a missed cleanup can't get re-frozen by the
    // next drag, so the body can never end up stuck with selection disabled.
    const finish = (): void => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', finish)
      el.removeEventListener('pointercancel', finish)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', finish)
    el.addEventListener('pointercancel', finish)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const grow = isRow ? 'ArrowRight' : 'ArrowDown'
    const shrink = isRow ? 'ArrowLeft' : 'ArrowUp'
    if (e.key !== grow && e.key !== shrink) return
    e.preventDefault()
    const current = ((isRow ? divider.x : divider.y) - divider.start) / divider.size
    const delta = e.key === grow ? 0.02 : -0.02
    setSplitRatio(tabId, divider.splitId, Math.min(MAX_RATIO, Math.max(MIN_RATIO, current + delta)))
  }

  return (
    <div
      role="separator"
      aria-orientation={isRow ? 'vertical' : 'horizontal'}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => setSplitRatio(tabId, divider.splitId, 0.5)}
      onKeyDown={onKeyDown}
      // A wide, invisible grab zone (14px) centered on the divider line makes the
      // edge easy to catch; the visible hairline stays thin until hover/drag.
      style={{
        left: `${divider.x}%`,
        top: `${divider.y}%`,
        touchAction: 'none',
        ...(isRow ? { height: `${divider.length}%` } : { width: `${divider.length}%` })
      }}
      className={`group absolute z-10 flex items-center justify-center outline-none ${
        isRow ? 'w-[14px] -translate-x-1/2 cursor-col-resize' : 'h-[14px] -translate-y-1/2 cursor-row-resize'
      }`}
    >
      <div
        className={`rounded-full bg-transparent transition-all duration-100 group-hover:bg-accent/70 group-focus-visible:bg-accent/70 group-active:bg-accent ${
          isRow ? 'h-full w-px group-hover:w-[3px] group-active:w-[3px]' : 'h-px w-full group-hover:h-[3px] group-active:h-[3px]'
        }`}
      />
    </div>
  )
}

/** Floating control (bottom-left) listing the active tab's hidden panes. */
function HiddenPanesMenu({ hidden, panes }: { hidden: string[]; panes: Record<string, PaneMeta> }): React.JSX.Element {
  const restorePane = useWorkspace((s) => s.restorePane)
  const closePane = useWorkspace((s) => s.closePane)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const iconFor = (kind: PaneMeta['kind']): typeof Terminal =>
    kind === 'agent' ? Bot : kind === 'editor' ? FileCode2 : Terminal

  return (
    <div className="absolute bottom-2 left-2 z-20">
      <button
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          // Anchor above the button; FloatingMenu clamps into the viewport.
          setMenu({ x: r.left, y: r.top - 240 })
        }}
        title="Hidden panes — click to restore"
        className="flex items-center gap-1.5 rounded-md border border-edge bg-overlay/90 px-2 py-1 font-ui text-[11px] font-medium text-ink-2 shadow-lg backdrop-blur transition-colors duration-100 hover:text-ink"
      >
        <EyeOff size={12} className="text-ink-3" aria-hidden="true" />
        {hidden.length} hidden
      </button>

      {menu && (
        <FloatingMenu anchor={menu} onClose={() => setMenu(null)} minWidth={220}>

          <p className="px-3 pt-2 pb-1 font-ui text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
            Hidden panes
          </p>
          {hidden.map((id) => {
            const pane = panes[id]
            if (!pane) return null
            const Icon = iconFor(pane.kind)
            return (
              <div
                key={id}
                className="group flex items-center gap-2 px-2 py-1 transition-colors duration-75 hover:bg-raised"
              >
                <button
                  onClick={() => {
                    restorePane(id)
                    setMenu(null)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  title="Restore this pane"
                >
                  <Icon size={13} className="shrink-0 text-ink-3" aria-hidden="true" />
                  <span className="truncate font-ui text-[12.5px] text-ink-2 group-hover:text-ink">{pane.name}</span>
                </button>
                <button
                  onClick={() => closePane(id)}
                  aria-label={`Close ${pane.name}`}
                  title="Close this pane"
                  className="shrink-0 rounded p-1 text-ink-3 transition-colors duration-100 hover:text-danger"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </FloatingMenu>
      )}
    </div>
  )
}

interface Placement {
  rect: Rect
  tabId: string
  isTabActive: boolean
  isActivePane: boolean
  isOnlyPane: boolean
  hidden: boolean
}

/**
 * Renders EVERY pane across all tabs exactly once, positioned by its owning
 * tab's geometry. Panes whose tab isn't active — and hidden panes — stay mounted
 * but invisible, so their sessions never die when a pane is switched away from,
 * moved to another tab, or hidden. Only the active tab's dividers are shown.
 */
export function PaneLayer(): React.JSX.Element {
  const tabs = useWorkspace((s) => s.tabs)
  const panes = useWorkspace((s) => s.panes)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  const containerRef = useRef<HTMLDivElement>(null)

  const { placement, activeGeometry, activeHidden } = useMemo(() => {
    const placement = new Map<string, Placement>()
    let activeGeometry: Geometry | null = null
    let activeHidden: string[] = []
    const offscreen: Rect = { x: 0, y: 0, w: 100, h: 100 }

    for (const tab of tabs) {
      const geo = layoutGeometry(tab.layout)
      const isTabActive = tab.id === activeTabId
      const onlyPane = geo.rects.size === 1 && (tab.hidden?.length ?? 0) === 0
      if (isTabActive) {
        activeGeometry = geo
        activeHidden = tab.hidden ?? []
      }
      for (const [paneId, rect] of geo.rects) {
        placement.set(paneId, {
          rect,
          tabId: tab.id,
          isTabActive,
          isActivePane: tab.activePaneId === paneId,
          isOnlyPane: onlyPane,
          hidden: false
        })
      }
      for (const id of tab.hidden ?? []) {
        placement.set(id, {
          rect: offscreen,
          tabId: tab.id,
          isTabActive,
          isActivePane: false,
          isOnlyPane: false,
          hidden: true
        })
      }
    }
    return { placement, activeGeometry, activeHidden }
  }, [tabs, activeTabId])

  return (
    <div ref={containerRef} className="relative h-full w-full p-1">
      {Object.values(panes).map((meta) => {
        const p = placement.get(meta.id)
        if (!p) return null
        const visible = p.isTabActive && !p.hidden
        return (
          <div
            key={meta.id}
            style={{
              left: `${p.rect.x}%`,
              top: `${p.rect.y}%`,
              width: `${p.rect.w}%`,
              height: `${p.rect.h}%`
            }}
            aria-hidden={!visible}
            className={`absolute p-1 ${visible ? '' : 'invisible opacity-0'} ${p.hidden || !p.isTabActive ? 'pointer-events-none' : ''}`}
          >
            <PaneFrame
              pane={meta}
              tabId={p.tabId}
              isActive={p.isActivePane}
              isTabActive={p.isTabActive}
              isOnlyPane={p.isOnlyPane}
            />
          </div>
        )
      })}

      {activeGeometry?.dividers.map((d) => (
        <Divider key={d.splitId} divider={d} tabId={activeTabId} containerRef={containerRef} />
      ))}

      {activeHidden.length > 0 && <HiddenPanesMenu hidden={activeHidden} panes={panes} />}
    </div>
  )
}
