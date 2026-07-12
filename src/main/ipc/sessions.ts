import { ipcMain } from 'electron'
import { IPC, type RemoteSessionInfo } from '@shared/types'
import { setReportedSessions } from '../remote/sessionRegistry'

export function registerSessionsIpc(): void {
  // Key each report by the sending window so multiple windows' panes merge
  // rather than clobber one another (removeWindowSessions clears them on close).
  ipcMain.on(IPC.SessionsReport, (e, list: RemoteSessionInfo[]) =>
    setReportedSessions(e.sender.id, list)
  )
}
