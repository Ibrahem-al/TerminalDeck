import { ipcMain } from 'electron'
import { IPC, type NotifyConfig, type TaskCompletePayload } from '@shared/types'
import { loadNotifyConfig, saveNotifyConfig } from '../store/persist'
import { dispatchTaskComplete } from '../remote/notify'

export function registerNotifyIpc(): void {
  ipcMain.handle(IPC.NotifyGetConfig, () => loadNotifyConfig())
  ipcMain.handle(IPC.NotifySetConfig, (_e, cfg: NotifyConfig) => {
    saveNotifyConfig(cfg)
    return loadNotifyConfig()
  })
  // Fired by a pane when a real shell command finishes; main filters + routes.
  ipcMain.on(IPC.NotifyTaskComplete, (_e, payload: TaskCompletePayload) => {
    void dispatchTaskComplete(payload)
  })
}
