import { monaco } from './monacoSetup'
import { useEditorStore } from '../../store/editor'
import { toast } from '../../store/toasts'

interface Entry {
  model: monaco.editor.ITextModel
  refs: number
  savedAltId: number
  listener: monaco.IDisposable
}

const entries = new Map<string, Entry>()
const recentlySaved = new Map<string, number>()

let watcherHooked = false
function hookWatcher(): void {
  if (watcherHooked) return
  watcherHooked = true
  window.quarterdeck.fs.onFileChanged((path) => {
    const savedAt = recentlySaved.get(path)
    if (savedAt !== undefined && Date.now() - savedAt < 800) return // our own save
    const entry = entries.get(path)
    if (!entry) return
    if (useEditorStore.getState().dirty[path]) {
      useEditorStore.getState().setConflict(path, true)
    } else {
      void reloadFromDisk(path)
    }
  })
}

function refreshDirty(path: string): void {
  const entry = entries.get(path)
  if (!entry) return
  const dirty = entry.model.getAlternativeVersionId() !== entry.savedAltId
  const store = useEditorStore.getState()
  if (store.dirty[path] !== dirty) store.setDirty(path, dirty)
}

export async function acquireModel(path: string): Promise<monaco.editor.ITextModel> {
  hookWatcher()
  const existing = entries.get(path)
  if (existing) {
    existing.refs++
    return existing.model
  }

  const content = await window.quarterdeck.fs.readFile(path)
  // re-check: a concurrent open may have won the race
  const raced = entries.get(path)
  if (raced) {
    raced.refs++
    return raced.model
  }

  const uri = monaco.Uri.file(path)
  const model =
    monaco.editor.getModel(uri) ?? monaco.editor.createModel(content, undefined, uri)

  const entry: Entry = {
    model,
    refs: 1,
    savedAltId: model.getAlternativeVersionId(),
    listener: model.onDidChangeContent(() => refreshDirty(path))
  }
  entries.set(path, entry)
  window.quarterdeck.fs.watchFile(path)
  return model
}

export function releaseModel(path: string): void {
  const entry = entries.get(path)
  if (!entry) return
  entry.refs--
  if (entry.refs > 0) return
  entries.delete(path)
  window.quarterdeck.fs.unwatchFile(path)
  entry.listener.dispose()
  entry.model.dispose()
  const store = useEditorStore.getState()
  store.setDirty(path, false)
  store.setConflict(path, false)
}

export async function saveModel(path: string): Promise<boolean> {
  const entry = entries.get(path)
  if (!entry) return false
  try {
    recentlySaved.set(path, Date.now())
    await window.quarterdeck.fs.writeFile(path, entry.model.getValue())
    entry.savedAltId = entry.model.getAlternativeVersionId()
    refreshDirty(path)
    useEditorStore.getState().setConflict(path, false)
    toast('success', 'File saved', path.slice(path.lastIndexOf('\\') + 1))
    return true
  } catch (err) {
    toast('error', 'Save failed', err instanceof Error ? err.message.split('\n')[0] : String(err))
    return false
  }
}

/** Replaces content while preserving the undo stack. */
export async function reloadFromDisk(path: string): Promise<void> {
  const entry = entries.get(path)
  if (!entry) return
  try {
    const content = await window.quarterdeck.fs.readFile(path)
    if (content !== entry.model.getValue()) {
      entry.model.pushEditOperations(
        [],
        [{ range: entry.model.getFullModelRange(), text: content }],
        () => null
      )
    }
    entry.savedAltId = entry.model.getAlternativeVersionId()
    refreshDirty(path)
    useEditorStore.getState().setConflict(path, false)
  } catch {
    // file unreadable (deleted?) — keep the buffer, flag the conflict
    useEditorStore.getState().setConflict(path, true)
  }
}

/** Marks the in-memory buffer as the version to keep (dismisses conflict). */
export function keepBuffer(path: string): void {
  useEditorStore.getState().setConflict(path, false)
}
