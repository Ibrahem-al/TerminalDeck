import { ipcMain, BrowserWindow } from 'electron'
import { IPC, type RemoteConfig } from '@shared/types'
import type { RemoteServer } from '../remote/RemoteServer'
import { listDevices, loadRemoteConfig, revokeDevice, saveRemoteConfig } from '../store/persist'
import { tailscaleServe, tailscaleStatus, tailscaleUp } from '../remote/tailscale'
import { listListeningPorts } from '../preview/listPorts'

export function registerRemoteIpc(server: RemoteServer): void {
  // Push live status to every window whenever the Agent changes.
  server.setOnChange(() => {
    const status = server.status()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.RemoteStatusChanged, status)
    }
  })

  ipcMain.handle(IPC.RemoteStatus, () => server.status())
  ipcMain.handle(IPC.RemoteStart, async () => {
    await server.start(loadRemoteConfig().port)
    return server.status()
  })
  ipcMain.handle(IPC.RemoteStop, async () => {
    await server.stop()
    return server.status()
  })

  ipcMain.handle(IPC.RemoteGetConfig, () => loadRemoteConfig())
  ipcMain.handle(IPC.RemoteSetConfig, (_e, cfg: RemoteConfig) => {
    saveRemoteConfig(cfg)
    return loadRemoteConfig()
  })

  ipcMain.handle(IPC.RemotePairingNew, () => server.pairingPayload())
  ipcMain.handle(IPC.RemoteDevicesList, () => listDevices())
  ipcMain.handle(IPC.RemoteDeviceRevoke, (_e, id: string) => {
    const next = revokeDevice(id)
    server.dropDevice(id)
    return next
  })

  ipcMain.handle(IPC.RemoteTailscale, () => tailscaleStatus(loadRemoteConfig().port))
  ipcMain.handle(IPC.RemoteTailscaleUp, async () => {
    await tailscaleUp()
    return tailscaleStatus(loadRemoteConfig().port)
  })
  ipcMain.handle(IPC.RemoteTailscaleServe, async (_e, enable: boolean) => {
    await tailscaleServe(loadRemoteConfig().port, enable)
    return tailscaleStatus(loadRemoteConfig().port)
  })

  ipcMain.handle(IPC.RemotePorts, () => listListeningPorts())
}
