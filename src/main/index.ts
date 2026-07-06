import { app, shell, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'
import { hostname } from 'os'
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
import { onReportedSessionsChange } from './remote/sessionRegistry'
import { RemoteServer } from './remote/RemoteServer'
import { loadRemoteConfig } from './store/persist'

const ptys = new PtyManager()

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
const remoteBackend = new DesktopBackend(ptys)
const remoteServer = new RemoteServer(remoteBackend, {
  port: loadRemoteConfig().port,
  serverName: hostname(),
  keepAwake: loadRemoteConfig().keepAwake
})

function createWindow(): void {
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
      sandbox: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.on('maximize', () => win.webContents.send(IPC.WindowMaximized, true))
  win.on('unmaximize', () => win.webContents.send(IPC.WindowMaximized, false))

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

app.whenReady().then(() => {
  registerWindowControls()
  registerPtyIpc(ptys)
  registerAgentIpc()
  registerFsIpc()
  registerProjectsIpc()
  registerRemoteIpc(remoteServer)
  registerNotifyIpc()
  registerSessionsIpc()
  // Keep phones in sync as the desktop's open terminals change.
  onReportedSessionsChange(() => remoteServer.broadcastSessions())
  // Required on Windows for native desktop notifications to display.
  app.setAppUserModelId('app.terminaldeck.desktop')
  createWindow()

  if (loadRemoteConfig().autoStart) {
    void remoteServer.start().catch((e) => console.error('[RemoteDeck] failed to start', e))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  ptys.disposeAll()
  disposeAllAgents()
  disposeAllWatchers()
  remoteBackend.disposeAll()
  void remoteServer.stop()
})

app.on('window-all-closed', () => {
  app.quit()
})
