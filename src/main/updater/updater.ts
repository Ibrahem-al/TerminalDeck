/**
 * In-app auto-update via electron-updater.
 *
 * Feed source is the GitHub Releases of the repo configured under `publish` in
 * electron-builder.yml (Ibrahem-al/terminaldeck). electron-builder bakes an
 * `app-update.yml` into the packaged app, so `autoUpdater` finds the feed with
 * no runtime config. Everything is a no-op when unpackaged (`npm run dev`),
 * where there's no feed and electron-updater would throw.
 *
 * Flow surfaced to the renderer (see store/updater.ts + Settings → Updates):
 *   check → available → (user) download → downloaded → (user) restart & install.
 * We keep `autoDownload` off so a metered connection isn't spent without intent,
 * and `autoInstallOnAppQuit` on so a downloaded update lands on next quit anyway.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC, type UpdateStatusPayload } from '@shared/types'

let quittingForUpdate = false
let lastStatus: UpdateStatusPayload = { state: 'idle' }

/** True once quitAndInstall() has been kicked off — lets the close handler skip
 *  the confirmation prompt (the user already opted into the restart). */
export function isQuittingForUpdate(): boolean {
  return quittingForUpdate
}

function broadcast(payload: UpdateStatusPayload): void {
  lastStatus = payload
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.UpdateStatus, payload)
  }
}

/** electron-updater's releaseNotes can be a string or an array of {note} records. */
function notesToText(notes: unknown): string | undefined {
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((n) => (typeof n === 'string' ? n : (n as { note?: string })?.note ?? ''))
      .filter(Boolean)
      .join('\n\n')
  }
  return undefined
}

export function registerUpdaterIpc(): void {
  // Manual, unattended downloads only — the renderer drives each step.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    broadcast({ state: 'available', version: info.version, notes: notesToText(info.releaseNotes) })
  )
  autoUpdater.on('update-not-available', (info) =>
    broadcast({ state: 'not-available', version: info.version })
  )
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({ state: 'downloaded', version: info.version, notes: notesToText(info.releaseNotes) })
  )
  autoUpdater.on('error', (err) => {
    // A failed quitAndInstall (missing/quarantined installer, spawn failure)
    // emits 'error' without quitting. Clear the flag so the close-confirmation
    // guard isn't disabled for the rest of the session.
    quittingForUpdate = false
    broadcast({ state: 'error', error: err == null ? 'unknown error' : (err.message ?? String(err)) })
  })

  // Trigger a check. In dev there's no feed, so report a stable 'dev' state
  // instead of letting electron-updater throw.
  ipcMain.handle(IPC.UpdateCheck, async (): Promise<UpdateStatusPayload> => {
    if (!app.isPackaged) {
      broadcast({ state: 'dev' })
      return lastStatus
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      broadcast({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    }
    return lastStatus
  })

  // Catch-up for a newly opened window: return the shared state without
  // triggering a fresh check (a re-check would clobber other windows' progress).
  ipcMain.handle(IPC.UpdateGetCurrent, (): UpdateStatusPayload => lastStatus)

  ipcMain.handle(IPC.UpdateDownload, async (): Promise<void> => {
    if (!app.isPackaged) return
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      broadcast({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  })

  // Quit every window and install. The flag lets each window's close handler
  // skip the "are you sure?" prompt — the user already chose to restart.
  ipcMain.on(IPC.UpdateInstall, () => {
    if (!app.isPackaged) return
    quittingForUpdate = true
    setImmediate(() => autoUpdater.quitAndInstall())
    // Belt-and-suspenders: if quitAndInstall didn't actually quit (install
    // failed to launch), restore the close-confirmation guard so it isn't
    // silently disabled for the rest of the session.
    setTimeout(() => {
      quittingForUpdate = false
    }, 10_000)
  })
}

/** Fire a silent check shortly after launch so an update surfaces on its own. */
export function checkForUpdatesOnLaunch(): void {
  if (!app.isPackaged) {
    broadcast({ state: 'dev' })
    return
  }
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      broadcast({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    })
  }, 4000)
}
