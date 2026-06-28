import { ipcMain } from 'electron'
import { IPC, type RemoteSessionInfo } from '@shared/types'
import { setReportedSessions } from '../remote/sessionRegistry'

export function registerSessionsIpc(): void {
  ipcMain.on(IPC.SessionsReport, (_e, list: RemoteSessionInfo[]) => setReportedSessions(list))
}
