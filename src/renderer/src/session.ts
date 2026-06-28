/**
 * Session persistence: serializes the workspace (tabs, panes, sizes),
 * sidebar root, active project, and open editor files. Saves debounced on
 * every change and on window close; restores on launch when enabled.
 *
 * Pane env vars are deliberately NOT serialized — they re-derive from the
 * encrypted project store on restore, so secrets never land in the
 * session file in plain text.
 */

import { useWorkspace, type PaneMeta, type SpawnDefaults, type WorkspaceTab } from './store/workspace'
import { useExplorer } from './store/explorer'
import { useProjects } from './store/projects'
import { useEditorStore } from './store/editor'
import { paneIdsIn } from './components/workspace/layout'

interface SessionState {
  v: 1
  tabs: WorkspaceTab[]
  panes: Record<string, Omit<PaneMeta, 'env'>>
  activeTabId: string
  spawnDefaults: Omit<SpawnDefaults, 'env'>
  activeProjectId: string | null
  explorerRoot: string | null
  editorFiles: Record<string, string[]>
  editorActive: Record<string, string | null>
}

function serialize(): SessionState {
  const ws = useWorkspace.getState()
  const panes: Record<string, Omit<PaneMeta, 'env'>> = {}
  for (const [id, pane] of Object.entries(ws.panes)) {
    const { env: _env, ...rest } = pane
    panes[id] = rest
  }
  const { env: _denv, ...spawnDefaults } = ws.spawnDefaults

  const editor = useEditorStore.getState()
  return {
    v: 1,
    tabs: ws.tabs,
    panes,
    activeTabId: ws.activeTabId,
    spawnDefaults,
    activeProjectId: useProjects.getState().activeProjectId,
    explorerRoot: useExplorer.getState().root,
    editorFiles: editor.filesByPane,
    editorActive: editor.activeByPane
  }
}

function isSessionState(data: unknown): data is SessionState {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as SessionState).v === 1 &&
    Array.isArray((data as SessionState).tabs) &&
    (data as SessionState).tabs.length > 0
  )
}

/** Restores a saved session. Returns true when something was restored. */
export async function restoreSession(data: unknown): Promise<boolean> {
  if (!isSessionState(data)) return false

  // re-derive project context (env vars come from the encrypted store)
  const project = data.activeProjectId
    ? useProjects.getState().projects.find((p) => p.id === data.activeProjectId)
    : undefined

  const env =
    project && project.env.length > 0
      ? Object.fromEntries(project.env.filter((v) => v.key.trim() !== '').map((v) => [v.key, v.value]))
      : undefined

  const panes: Record<string, PaneMeta> = {}
  for (const [id, pane] of Object.entries(data.panes)) {
    const inheritsEnv =
      env !== undefined && project !== undefined && pane.cwd !== undefined && pane.cwd.startsWith(project.rootDir)
    panes[id] = { ...pane, env: inheritsEnv ? env : undefined }
  }

  useWorkspace.getState().hydrate({
    tabs: data.tabs,
    panes,
    activeTabId: data.activeTabId,
    spawnDefaults: { ...data.spawnDefaults, env }
  })

  if (project) {
    useProjects.setState({ activeProjectId: project.id })
  }

  if (data.explorerRoot) {
    void useExplorer.getState().openRoot(data.explorerRoot)
  }

  // only keep editor slices whose panes survived
  const livePanes = new Set(data.tabs.flatMap((t) => paneIdsIn(t.layout)))
  const editorFiles: Record<string, string[]> = {}
  const editorActive: Record<string, string | null> = {}
  for (const [paneId, files] of Object.entries(data.editorFiles)) {
    if (livePanes.has(paneId)) {
      editorFiles[paneId] = files
      editorActive[paneId] = data.editorActive[paneId] ?? files[0] ?? null
    }
  }
  useEditorStore.setState({ filesByPane: editorFiles, activeByPane: editorActive })

  return true
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave(): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.quarterdeck.session.save(serialize())
  }, 800)
}

/** Call once after boot (and after any restore) to keep the session saved. */
export function initSessionAutoSave(): void {
  useWorkspace.subscribe(scheduleSave)
  useEditorStore.subscribe(scheduleSave)
  useExplorer.subscribe((s, prev) => {
    if (s.root !== prev.root) scheduleSave()
  })
  useProjects.subscribe((s, prev) => {
    if (s.activeProjectId !== prev.activeProjectId) scheduleSave()
  })
  window.addEventListener('beforeunload', () => {
    clearTimeout(saveTimer)
    window.quarterdeck.session.save(serialize())
  })
}
