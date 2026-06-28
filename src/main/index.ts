import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { hostname } from 'os'
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

// RemoteDeck Agent: phone control over Tailscale. Mirrors the desktop's own
// open terminal panes (DesktopBackend over PtyManager). Defaults off.
const remoteBackend = new DesktopBackend(ptys)
const remoteServer = new RemoteServer(remoteBackend, {
  port: loadRemoteConfig().port,
  serverName: hostname()
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
