/**
 * Pure layout-tree logic for the multi-pane workspace.
 *
 * The layout is a binary split tree, but panes are RENDERED flat from
 * computed rectangles — component identity stays stable when the tree
 * changes shape, so splitting never remounts (and never kills) a session.
 */

export type Direction = 'row' | 'column'

export type LayoutNode =
  | { type: 'pane'; paneId: string }
  | { type: 'split'; id: string; direction: Direction; ratio: number; a: LayoutNode; b: LayoutNode }

let splitCounter = 0
const nextSplitId = (): string => `s${++splitCounter}-${Date.now().toString(36)}`

export const MIN_RATIO = 0.15
export const MAX_RATIO = 0.85

export function paneIdsIn(node: LayoutNode): string[] {
  if (node.type === 'pane') return [node.paneId]
  return [...paneIdsIn(node.a), ...paneIdsIn(node.b)]
}

/** Replaces the target pane with a split holding it and a new pane. */
export function splitPaneInLayout(
  node: LayoutNode,
  targetPaneId: string,
  direction: Direction,
  newPaneId: string
): LayoutNode {
  if (node.type === 'pane') {
    if (node.paneId !== targetPaneId) return node
    return {
      type: 'split',
      id: nextSplitId(),
      direction,
      ratio: 0.5,
      a: node,
      b: { type: 'pane', paneId: newPaneId }
    }
  }
  return {
    ...node,
    a: splitPaneInLayout(node.a, targetPaneId, direction, newPaneId),
    b: splitPaneInLayout(node.b, targetPaneId, direction, newPaneId)
  }
}

/** Removes a pane; the sibling takes the parent's place. Null if tree empties. */
export function removePaneFromLayout(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.type === 'pane') {
    return node.paneId === paneId ? null : node
  }
  const a = removePaneFromLayout(node.a, paneId)
  const b = removePaneFromLayout(node.b, paneId)
  if (a === null) return b
  if (b === null) return a
  return { ...node, a, b }
}

/** Swaps two panes' positions in the tree by exchanging their ids in place. */
export function swapPanesInLayout(node: LayoutNode, a: string, b: string): LayoutNode {
  if (node.type === 'pane') {
    if (node.paneId === a) return { ...node, paneId: b }
    if (node.paneId === b) return { ...node, paneId: a }
    return node
  }
  return { ...node, a: swapPanesInLayout(node.a, a, b), b: swapPanesInLayout(node.b, a, b) }
}

export function updateRatio(node: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (node.type === 'pane') return node
  if (node.id === splitId) {
    return { ...node, ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)) }
  }
  return { ...node, a: updateRatio(node.a, splitId, ratio), b: updateRatio(node.b, splitId, ratio) }
}

/* ── Geometry ─────────────────────────────────────────────────────── */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface DividerInfo {
  splitId: string
  direction: Direction
  /** Position of the divider line, in container percent. */
  x: number
  y: number
  /** Length of the divider along its axis, in percent. */
  length: number
  /** The split's own extent along the drag axis (for ratio math). */
  start: number
  size: number
}

export interface Geometry {
  rects: Map<string, Rect>
  dividers: DividerInfo[]
}

export function layoutGeometry(node: LayoutNode, rect: Rect = { x: 0, y: 0, w: 100, h: 100 }): Geometry {
  const rects = new Map<string, Rect>()
  const dividers: DividerInfo[] = []

  const walk = (n: LayoutNode, r: Rect): void => {
    if (n.type === 'pane') {
      rects.set(n.paneId, r)
      return
    }
    if (n.direction === 'row') {
      const aw = r.w * n.ratio
      dividers.push({
        splitId: n.id,
        direction: 'row',
        x: r.x + aw,
        y: r.y,
        length: r.h,
        start: r.x,
        size: r.w
      })
      walk(n.a, { x: r.x, y: r.y, w: aw, h: r.h })
      walk(n.b, { x: r.x + aw, y: r.y, w: r.w - aw, h: r.h })
    } else {
      const ah = r.h * n.ratio
      dividers.push({
        splitId: n.id,
        direction: 'column',
        x: r.x,
        y: r.y + ah,
        length: r.w,
        start: r.y,
        size: r.h
      })
      walk(n.a, { x: r.x, y: r.y, w: r.w, h: ah })
      walk(n.b, { x: r.x, y: r.y + ah, w: r.w, h: r.h - ah })
    }
  }

  walk(node, rect)
  return { rects, dividers }
}

/* ── Spatial pane navigation ──────────────────────────────────────── */

export type Dir4 = 'left' | 'right' | 'up' | 'down'

/** 1-D overlap length between [a, a+al] and [b, b+bl], in container percent. */
function overlap1d(a: number, al: number, b: number, bl: number): number {
  return Math.min(a + al, b + bl) - Math.max(a, b)
}

/**
 * The pane spatially adjacent to `fromPaneId` in a direction, or null when the
 * tree has no neighbour that way. Uses computed rectangles, so it follows what
 * the user actually sees regardless of how the split tree is nested: it prefers
 * the closest pane whose edge faces `fromPaneId` and that overlaps it on the
 * perpendicular axis, falling back to the nearest-by-centre pane in that
 * direction when nothing overlaps (offset grids).
 */
export function paneInDirection(node: LayoutNode, fromPaneId: string, dir: Dir4): string | null {
  const { rects } = layoutGeometry(node)
  const from = rects.get(fromPaneId)
  if (!from) return null
  const fcx = from.x + from.w / 2
  const fcy = from.y + from.h / 2
  const EPS = 0.5

  let best: string | null = null
  let bestScore = Infinity
  let bestFallback: string | null = null
  let bestFallbackScore = Infinity

  for (const [id, r] of rects) {
    if (id === fromPaneId) continue
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2

    let inDir: boolean
    let along: number
    let perp: number
    let hasOverlap: boolean
    if (dir === 'left') {
      inDir = cx < fcx - EPS
      along = fcx - cx
      perp = Math.abs(cy - fcy)
      hasOverlap = overlap1d(from.y, from.h, r.y, r.h) > 1
    } else if (dir === 'right') {
      inDir = cx > fcx + EPS
      along = cx - fcx
      perp = Math.abs(cy - fcy)
      hasOverlap = overlap1d(from.y, from.h, r.y, r.h) > 1
    } else if (dir === 'up') {
      inDir = cy < fcy - EPS
      along = fcy - cy
      perp = Math.abs(cx - fcx)
      hasOverlap = overlap1d(from.x, from.w, r.x, r.w) > 1
    } else {
      inDir = cy > fcy + EPS
      along = cy - fcy
      perp = Math.abs(cx - fcx)
      hasOverlap = overlap1d(from.x, from.w, r.x, r.w) > 1
    }
    if (!inDir) continue

    const score = along + perp * 3
    if (hasOverlap) {
      if (score < bestScore) {
        bestScore = score
        best = id
      }
    } else if (score < bestFallbackScore) {
      bestFallbackScore = score
      bestFallback = id
    }
  }

  return best ?? bestFallback
}

/* ── Templates ────────────────────────────────────────────────────── */

export interface Template {
  id: string
  label: string
  rows: number
  cols: number
}

export const TEMPLATES: Template[] = [
  { id: 'single', label: 'Single', rows: 1, cols: 1 },
  { id: 'split', label: 'Split', rows: 1, cols: 2 },
  { id: 'quad', label: 'Quad', rows: 2, cols: 2 },
  { id: 'six', label: 'Six', rows: 2, cols: 3 },
  { id: 'eight', label: 'Eight', rows: 2, cols: 4 }
]

/** Evenly divides k nodes along a direction using nested ratios (1/k, 1/(k-1)…). */
function evenSplit(nodes: LayoutNode[], direction: Direction): LayoutNode {
  if (nodes.length === 1) return nodes[0]
  const [first, ...rest] = nodes
  return {
    type: 'split',
    id: nextSplitId(),
    direction,
    ratio: 1 / nodes.length,
    a: first,
    b: evenSplit(rest, direction)
  }
}

export function buildGrid(rows: number, cols: number, makePaneId: () => string): LayoutNode {
  const rowNodes: LayoutNode[] = []
  for (let r = 0; r < rows; r++) {
    const cells: LayoutNode[] = []
    for (let c = 0; c < cols; c++) {
      cells.push({ type: 'pane', paneId: makePaneId() })
    }
    rowNodes.push(evenSplit(cells, 'row'))
  }
  return evenSplit(rowNodes, 'column')
}
