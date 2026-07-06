import { PANE_DRAG_TYPE } from '../workspace/paneDrag'

/** MIME type the file tree's own draggable rows carry (an internal move). */
export const QD_PATH_MIME = 'application/x-quarterdeck-path'

/**
 * Path of a file-tree / search row being dragged from WITHIN this window. Tree
 * rows start a native OS drag (so they can be dropped into Explorer), which
 * means a same-window drop can't rely on `dataTransfer.files` being delivered
 * back reliably — so we stash the source here and resolve same-window drops
 * (move within the tree, insert into a terminal) directly from it. Null when the
 * drag came from outside (Explorer) or nothing is being dragged.
 */
let treeDragPath: string | null = null

export function setTreeDragPath(path: string | null): void {
  treeDragPath = path
}

export function getTreeDragPath(): string | null {
  return treeDragPath
}

// Clear when the drag ends (incl. a drag out to Explorer) so a leaked path can't
// be mistaken for the source of the next external drop. `dragend` fires after
// `drop`, so an in-window drop handler still reads the path first; those handlers
// also clear it explicitly (a stopPropagation'd drop wouldn't reach a bubble
// listener here).
if (typeof window !== 'undefined') {
  window.addEventListener('dragend', () => {
    treeDragPath = null
  }, true)
}

/** True when the drag started inside the file tree (a move within the sidebar). */
export function isInternalPathDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(QD_PATH_MIME)
}

/**
 * True for a drag that came from outside the app — OS files from Explorer, or a
 * link/image dragged out of a browser. Deliberately ignores plain-text-only
 * drags so internal drags (pane swaps, Kanban cards) never look external.
 */
export function isExternalFileDrag(dataTransfer: DataTransfer): boolean {
  const types = dataTransfer.types
  if (types.includes(QD_PATH_MIME) || types.includes(PANE_DRAG_TYPE)) return false
  return types.includes('Files') || types.includes('text/uri-list')
}
