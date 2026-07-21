import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'
import { hostname, release } from 'os'
import { existsSync } from 'fs'
import { IPC } from '@shared/types'
import { PtyManager } from './pty/PtyManager'
import { registerPtyIpc } from './ipc/pty'
import { registerAgentIpc, disposeAllAgents } from './ipc/agent'
import { registerFsIpc } from './ipc/fs'
import { registerProjectsIpc } from './ipc/projects'
import { registerRemoteIpc } from './ipc/remote'
import { registerNotifyIpc } from './ipc/notify'
import { registerSessionsIpc } from './ipc/sessions'
import { disposeAllWatchers } from './fs/fsService'
import { DesktopBackend } from './remote/DesktopBackend'
import { onReportedSessionsChange, removeWindowSessions } from './remote/sessionRegistry'
import { RemoteServer } from './remote/RemoteServer'
import { loadRemoteConfig, loadSettings } from './store/persist'
import { aiKeepAwake } from './power/keepAwake'
import { registerUpdaterIpc, checkForUpdatesOnLaunch, isQuittingForUpdate } from './updater/updater'
import { registerNotchIpc } from './notch/ipc'
import { notch } from './notch/NotchController'
import { destroyNotchWindow, isNotchWindow, notchGpuGone, setHiddenForFocus } from './notch/NotchWindow'
import { hookEnv, onHookEvent, startHookServer, stopHookServer } from './notch/hookServer'

const ptys = new PtyManager()

// Dev-only escape hatch: the single-instance lock is keyed on the userData
// directory, so pointing a dev run at its own dir (QD_USER_DATA) lets it launch
// BESIDE the installed app instead of quitting on the lock. The persisted store
// is untouched (electron-store resolved its path at import, and dev already
// uses a separate `quarterdeck-dev` file); only the lock, cache, and
// notch-hook scripts move. Never active in packaged builds.
if (!app.isPackaged && process.env.QD_USER_DATA) {
  app.setPath('userData', process.env.QD_USER_DATA)
}

// Real app windows only — the notch overlay must never be picked up by session
// handoff, second-instance focus, phone open-pane, or quit-on-last-window.
const appWindows = new Set<BrowserWindow>()
const firstAppWindow = (): BrowserWindow | null =>
  [...appWindows].find((w) => !w.isDestroyed()) ?? null

// Windows build number (e.g. 26200), forwarded to the renderer via argv so xterm's
// ConPTY reflow heuristics (`windowsPty`) are accurate. The sandboxed preload can't
// read `os`, so we resolve it here. 0 on non-Windows.
const WIN_BUILD =
  process.platform === 'win32' ? Number(/^\d+\.\d+\.(\d+)/.exec(release())?.[1] ?? 0) : 0

// A small semi-transparent square used as the cursor image for native file
// drag-out. Built from a raw bitmap so it's guaranteed non-empty (startDrag
// rejects an empty icon) without shipping/resolving an image file at runtime.
const DRAG_ICON = (() => {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 0x9a // B
    buf[i + 1] = 0x9a // G
    buf[i + 2] = 0x9a // R
    buf[i + 3] = 0xcc // A
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
})()

// RemoteDeck Agent: phone control over Tailscale. Mirrors the desktop's own
// open terminal panes (DesktopBackend over PtyManager). Defaults off.
const remoteBackend = new DesktopBackend(ptys, firstAppWindow)
const remoteServer = new RemoteServer(remoteBackend, {
  port: loadRemoteConfig().port,
  serverName: hostname(),
  keepAwake: loadRemoteConfig().keepAwake
})

// Windows the user has confirmed closing (or that are closing for an update):
// their `close` event is allowed through instead of prompting again.
const allowClose = new WeakSet<BrowserWindow>()

// The single window that owns the persisted session (restores + autosaves).
// When it closes with others still open, ownership is handed to a survivor so
// persistence never silently stops. Tracked by webContents id.
let primaryWcId: number | null = null

function createWindow(isPrimary: boolean): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 820,
    minHeight: 560,
    show: false,
    frame: false,
    backgroundColor: '#0a0c10',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      // The renderer reads its role from argv: only the primary window restores
      // and persists the saved session, so extra windows can't clobber it.
      additionalArguments: [
        `--qd-window-role=${isPrimary ? 'primary' : 'secondary'}`,
        `--qd-win-build=${WIN_BUILD}`
      ]
    }
  })
  // webContents.id is stable for the window's life; capture it now so the
  // `closed` handler (where webContents may be gone) can still clean up.
  const wcId = win.webContents.id
  if (isPrimary) primaryWcId = wcId
  appWindows.add(win)

  win.on('ready-to-show', () => win.show())

  win.on('maximize', () => win.webContents.send(IPC.WindowMaximized, true))
  win.on('unmaximize', () => win.webContents.send(IPC.WindowMaximized, false))

  // Every close path (✕ button, Alt+F4, taskbar, app quit) funnels through here.
  // Ask the renderer to confirm first; it decides whether anything is at risk
  // (live terminals/agents, unsaved edits) and calls back via WindowConfirmClose.
  // An in-progress update install and already-confirmed closes pass straight
  // through.
  win.on('close', (e) => {
    if (allowClose.has(win) || isQuittingForUpdate()) return
    e.preventDefault()
    win.webContents.send(IPC.WindowCloseRequest)
  })

  // If the renderer crashes it can never answer WindowCloseRequest, which would
  // leave the window un-closable (and block app quit). Let a dead renderer's
  // window close outright.
  win.webContents.on('render-process-gone', () => {
    allowClose.add(win)
    if (!win.isDestroyed()) win.destroy()
  })

  win.on('closed', () => {
    appWindows.delete(win)
    removeWindowSessions(wcId)
    // Hand session ownership to a surviving APP window (never the notch — it
    // has no session code, so handing it ownership would silently stop
    // persistence) so autosave continues after the primary window is closed.
    if (wcId === primaryWcId) {
      const survivor = firstAppWindow()
      if (survivor) {
        primaryWcId = survivor.webContents.id
        survivor.webContents.send(IPC.WindowSetPrimary)
      } else {
        primaryWcId = null
      }
    }
    // Last real window gone: take the notch down with it, so window-all-closed
    // can fire and the app actually quits (instead of lingering as an invisible
    // topmost pill process).
    if (appWindows.size === 0) destroyNotchWindow()
  })

  // All external links open in the system browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerWindowControls(): void {
  ipcMain.on(IPC.WindowMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on(IPC.WindowMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on(IPC.WindowClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close())

  // Open another independent app window (secondary: starts fresh, doesn't touch
  // the saved session).
  ipcMain.on(IPC.WindowNew, () => createWindow(false))

  // The renderer confirmed the close — let this window's next `close` through.
  ipcMain.on(IPC.WindowConfirmClose, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    allowClose.add(win)
    win.close()
  })

  // Open a link in the OS default app. Restricted to http(s): terminal output is
  // untrusted, so we never hand arbitrary schemes (file:, custom protocols) to
  // the shell, which could launch a local app or file.
  ipcMain.handle(IPC.ShellOpenExternal, (_e, url: unknown) => {
    if (typeof url !== 'string') return
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      void shell.openExternal(parsed.href)
    }
  })

  // Start a native OS drag for a file/folder so it can be dropped into Explorer
  // or the desktop (copies it). Must be called synchronously during the drag
  // gesture on the sender's webContents.
  ipcMain.on(IPC.ShellStartDrag, (e, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath === '') return
    try {
      if (!existsSync(filePath)) return
      e.sender.startDrag({ file: filePath, icon: DRAG_ICON })
    } catch {
      /* the drag could not be started */
    }
  })
}

app.whenReady().then(async () => {
  // Single-instance: a second launch (re-running the exe / clicking the shortcut
  // while running) must not start a rival process that fights over the shared
  // session file, the RemoteDeck port, and the updater. Focus the existing
  // window instead. Extra windows come only from WindowNew, in this process.
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    const win = firstAppWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  registerWindowControls()
  registerPtyIpc(ptys)
  registerAgentIpc()
  registerFsIpc()
  registerProjectsIpc()
  registerRemoteIpc(remoteServer)
  registerNotifyIpc()
  registerSessionsIpc()
  registerUpdaterIpc()
  registerNotchIpc(ptys)
  // Honor the persisted "keep awake while AI is working" preference from launch;
  // SettingsSave re-applies it whenever the toggle changes.
  aiKeepAwake.setEnabled(loadSettings().general.keepAwakeWhileBusy)
  // Keep phones in sync as the desktop's open terminals change.
  onReportedSessionsChange(() => remoteServer.broadcastSessions())
  // Required on Windows for native desktop notifications to display.
  app.setAppUserModelId('app.terminaldeck.desktop')

  // Notch: the hook server must be listening BEFORE the first window exists so
  // every PTY spawn carries the real port in its env (injection is
  // unconditional — behavior is gated at the server/controller, so toggling the
  // notch on later still covers panes spawned now).
  await startHookServer()
  ptys.setExtraEnv(hookEnv())
  onHookEvent((ev) => notch.hookEvent(ev))
  ptys.setActivityListener((sessionId, event, bytes) => notch.ptyActivity(sessionId, event, bytes))
  ptys.setWriteListener((sessionId, data) => notch.ptyWrite(sessionId, data))
  notch.init(loadSettings().notch, WIN_BUILD)

  // showWhenFocused=false: the pill only appears while you're in OTHER apps.
  app.on('browser-window-focus', (_e, w) => {
    if (!isNotchWindow(w) && !notch.showWhenFocused) setHiddenForFocus(true)
  })
  app.on('browser-window-blur', () => {
    // Focus may be moving between our windows — only unhide once it has
    // actually left the app (or landed on the notch itself).
    setTimeout(() => {
      const focused = BrowserWindow.getFocusedWindow()
      if (!focused || isNotchWindow(focused)) setHiddenForFocus(false)
    }, 80)
  })
  // Transparent windows render as an opaque black slab while the GPU process is
  // down — hide the notch through the crash and come back after respawn.
  app.on('child-process-gone', (_e, details) => {
    if (details.type === 'GPU') notchGpuGone()
  })

  createWindow(true)

  if (loadRemoteConfig().autoStart) {
    void remoteServer.start().catch((e) => console.error('[RemoteDeck] failed to start', e))
  }

  // Surface an available update on its own shortly after launch (packaged only).
  checkForUpdatesOnLaunch()

  app.on('activate', () => {
    if (appWindows.size === 0) createWindow(true)
  })
})

app.on('will-quit', () => {
  ptys.disposeAll()
  disposeAllAgents()
  disposeAllWatchers()
  remoteBackend.disposeAll()
  void remoteServer.stop()
  stopHookServer()
  notch.dispose()
})

app.on('window-all-closed', () => {
  app.quit()
})
