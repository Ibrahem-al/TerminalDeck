import { useMemo, useRef } from 'react'
import { useWorkspace, type WorkspaceTab } from '../../store/workspace'
import { layoutGeometry, MIN_RATIO, MAX_RATIO, paneIdsIn, type DividerInfo } from './layout'
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

    const onMove = (ev: PointerEvent): void => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const pct = isRow
        ? ((ev.clientX - rect.left) / rect.width) * 100
        : ((ev.clientY - rect.top) / rect.height) * 100
      setSplitRatio(tabId, divider.splitId, (pct - divider.start) / divider.size)
    }
    const onUp = (): void => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const grow = isRow ? 'ArrowRight' : 'ArrowDown'
    const shrink = isRow ? 'ArrowLeft' : 'ArrowUp'
    if (e.key !== grow && e.key !== shrink) return
    e.preventDefault()
    // current ratio from divider geometry: (x - start) / size
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
      style={
        isRow
          ? { left: `${divider.x}%`, top: `${divider.y}%`, height: `${divider.length}%` }
          : { left: `${divider.x}%`, top: `${divider.y}%`, width: `${divider.length}%` }
      }
      className={`absolute z-10 flex items-center justify-center outline-none ${
        isRow ? 'w-0 cursor-col-resize' : 'h-0 cursor-row-resize'
      }`}
    >
      <div
        className={`${
          isRow ? 'h-full w-[7px] -translate-x-1/2' : 'h-[7px] w-full -translate-y-1/2'
        } group flex items-center justify-center`}
      >
        <div
          className={`${
            isRow ? 'h-full w-px' : 'h-px w-full'
          } bg-transparent transition-colors duration-100 group-hover:bg-accent/60 group-active:bg-accent`}
        />
      </div>
    </div>
  )
}

export function TabView({ tab, isTabActive }: { tab: WorkspaceTab; isTabActive: boolean }): React.JSX.Element {
  const panes = useWorkspace((s) => s.panes)
  const containerRef = useRef<HTMLDivElement>(null)

  const geometry = useMemo(() => layoutGeometry(tab.layout), [tab.layout])
  const onlyPane = paneIdsIn(tab.layout).length === 1

  return (
    <div ref={containerRef} className="relative h-full w-full p-1">
      {[...geometry.rects.entries()].map(([paneId, rect]) => {
        const meta = panes[paneId]
        if (!meta) return null
        return (
          <div
            key={paneId}
            style={{
              left: `${rect.x}%`,
              top: `${rect.y}%`,
              width: `${rect.w}%`,
              height: `${rect.h}%`
            }}
            className="absolute p-1"
          >
            <PaneFrame
              pane={meta}
              tabId={tab.id}
              isActive={tab.activePaneId === paneId}
              isTabActive={isTabActive}
              isOnlyPane={onlyPane}
            />
          </div>
        )
      })}

      {geometry.dividers.map((d) => (
        <Divider key={d.splitId} divider={d} tabId={tab.id} containerRef={containerRef} />
      ))}
    </div>
  )
}
