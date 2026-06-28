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
