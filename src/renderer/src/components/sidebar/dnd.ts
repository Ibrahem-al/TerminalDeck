import { PANE_DRAG_TYPE } from '../workspace/paneDrag'

/** MIME type the file tree's own draggable rows carry (an internal move). */
export const QD_PATH_MIME = 'application/x-quarterdeck-path'

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
