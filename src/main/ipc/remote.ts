import { ipcMain, BrowserWindow } from 'electron'
import { IPC, type RemoteConfig } from '@shared/types'
import type { RemoteServer } from '../remote/RemoteServer'
import {
  hasRemotePasscode,
  listDevices,
  loadRemoteConfig,
  revokeDevice,
  saveRemoteConfig,
  setRemotePasscode
} from '../store/persist'
import { tailscaleFunnel, tailscaleServe, tailscaleStatus, tailscaleUp } from '../remote/tailscale'
import { listListeningPorts } from '../preview/listPorts'

/** Minimum access-passcode length, enforced in main so the renderer can't bypass it. */
const MIN_PASSCODE_LEN = 6

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
    const next = loadRemoteConfig()
    // Apply keep-awake live so toggling it takes effect without a restart.
    server.setKeepAwake(next.keepAwake)
    return next
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
  ipcMain.handle(IPC.RemoteTailscaleFunnel, async (_e, enable: boolean) => {
    // Public exposure demands the second factor: refuse to funnel without one.
    if (enable && !hasRemotePasscode()) {
      throw new Error('Set an access passcode before publishing to the public internet (Funnel).')
    }
    await tailscaleFunnel(loadRemoteConfig().port, enable)
    return tailscaleStatus(loadRemoteConfig().port)
  })

  ipcMain.handle(IPC.RemoteSetPasscode, async (_e, passcode: string | null) => {
    const trimmed = typeof passcode === 'string' ? passcode.trim() : ''
    if (trimmed !== '' && trimmed.length < MIN_PASSCODE_LEN) {
      throw new Error(`Passcode must be at least ${MIN_PASSCODE_LEN} characters.`)
    }
    if (trimmed === '') {
      // Enforce the core invariant in main (not just the wizard): the Agent must
      // never stay exposed to the public internet without the second factor. Tear
      // Funnel down BEFORE clearing, and fail closed (keep the passcode) if it
      // can't be confirmed off — so we never land in "public + no passcode".
      const port = loadRemoteConfig().port
      if ((await tailscaleStatus(port)).funnel) {
        await tailscaleFunnel(port, false)
        if ((await tailscaleStatus(port)).funnel) {
          throw new Error(
            'Could not turn off public Funnel — passcode kept so the Agent is never exposed without it. Stop Funnel first, then clear the passcode.'
          )
        }
      }
      setRemotePasscode(null)
    } else {
      setRemotePasscode(trimmed)
    }
    return loadRemoteConfig()
  })

  ipcMain.handle(IPC.RemotePorts, () => listListeningPorts())
}
