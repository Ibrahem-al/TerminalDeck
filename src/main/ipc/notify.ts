import { ipcMain } from 'electron'
import { IPC, type NotifyConfig, type TaskCompletePayload } from '@shared/types'
import { loadNotifyConfig, saveNotifyConfig } from '../store/persist'
import { dispatchTaskComplete } from '../remote/notify'
import { notch } from '../notch/NotchController'

export function registerNotifyIpc(): void {
  ipcMain.handle(IPC.NotifyGetConfig, () => loadNotifyConfig())
  ipcMain.handle(IPC.NotifySetConfig, (_e, cfg: NotifyConfig) => {
    saveNotifyConfig(cfg)
    return loadNotifyConfig()
  })
  // Fired by a pane when a real shell command finishes; main filters + routes.
  // The notch is tapped BEFORE dispatch's route/duration gates — it has its own
  // settings and must not be silenced by the phone-push configuration.
  ipcMain.on(IPC.NotifyTaskComplete, (_e, payload: TaskCompletePayload) => {
    notch.commandDone(payload)
    void dispatchTaskComplete(payload)
  })
}
