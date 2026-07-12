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
import { usePaneCwd } from './store/paneCwd'
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

/**
 * Convert a shell-reported working directory to a native Windows path we can
 * safely respawn in, or return null when it can't be trusted. PowerShell emits
 * native `C:\…`; OSC 7 yields forward slashes (`C:/…`); Git Bash emits MSYS
 * paths — drive mounts (`/c/Users/…`) map cleanly to `C:\Users\…`, but virtual
 * mounts (`/tmp`, `/usr`, `/home`, `/`) point into the Git install dir and have
 * no string-only Windows equivalent. For those we return null so the caller
 * keeps the pane's spawn dir rather than persisting a bogus drive-relative path
 * (`\tmp`) that would otherwise restore the terminal to the drive root.
 */
function toNativeCwd(cwd: string): string | null {
  if (window.quarterdeck.platform !== 'win32') return cwd
  // Already native: a drive path (`C:\…` / `C:/…`) or UNC (`\\server\…` / `//server/…`).
  if (/^[a-zA-Z]:[\\/]/.test(cwd) || /^[\\/]{2}[^\\/]/.test(cwd)) return cwd.replace(/\//g, '\\')
  // MSYS drive mount: `/c` or `/c/rest` → `C:\` or `C:\rest`.
  const drive = /^\/([a-zA-Z])(\/.*)?$/.exec(cwd)
  if (drive) return `${drive[1].toUpperCase()}:${(drive[2] ?? '/').replace(/\//g, '\\')}`
  // MSYS virtual mount, or anything else we can't confidently map — don't trust it.
  return null
}

function serialize(): SessionState {
  const ws = useWorkspace.getState()
  const liveCwd = usePaneCwd.getState().byPane
  const panes: Record<string, Omit<PaneMeta, 'env'>> = {}
  for (const [id, pane] of Object.entries(ws.panes)) {
    const { env: _env, ...rest } = pane
    // Persist the pane's *last-known* working directory (updated as the user
    // navigates, reported by the shell integration) instead of its original
    // spawn dir, so a restored/crash-recovered terminal reopens where it was.
    // Panes with no live cwd (agents, cmd.exe, editors) — or a live cwd we can't
    // map to a native path (an MSYS virtual dir) — keep their spawn dir.
    const live = liveCwd[id]
    const native = live !== undefined ? toNativeCwd(live) : null
    panes[id] = native !== null ? { ...rest, cwd: native } : rest
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

  // Panes actually referenced by a tab (visible or hidden). Anything else in the
  // snapshot is an orphan (version skew / partial write) — drop it so it can't
  // linger un-rendered and get re-serialized forever.
  const livePanes = new Set(data.tabs.flatMap((t) => [...paneIdsIn(t.layout), ...(t.hidden ?? [])]))

  const panes: Record<string, PaneMeta> = {}
  for (const [id, pane] of Object.entries(data.panes)) {
    if (!livePanes.has(id)) continue
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

  // only keep editor slices whose panes survived (incl. hidden ones)
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

let autoSaveStarted = false

/** Begin keeping the saved session in sync with this window's workspace.
 *  Idempotent. Only the session-owning window should call this — at boot the
 *  primary window does, and if the primary later closes, main promotes a
 *  survivor which calls this too. Extra (non-owning) windows never call it, so
 *  they can't overwrite the shared session. */
export function initSessionAutoSave(): void {
  if (autoSaveStarted) return
  autoSaveStarted = true
  useWorkspace.subscribe(scheduleSave)
  useEditorStore.subscribe(scheduleSave)
  // Persist working-directory changes too, so a restored terminal lands in the
  // dir it was last in even after an unclean shutdown. The equality guard in
  // usePaneCwd means this fires only on an actual `cd` (not every prompt), and
  // scheduleSave is debounced — so churn stays minimal.
  usePaneCwd.subscribe(scheduleSave)
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

/** Persist the current workspace immediately (used when a window is promoted to
 *  session owner, so its state is captured even if the app quits right after). */
export function persistSessionNow(): void {
  clearTimeout(saveTimer)
  window.quarterdeck.session.save(serialize())
}
