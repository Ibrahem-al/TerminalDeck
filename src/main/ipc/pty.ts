import { ipcMain } from 'electron'
import { IPC, type PtySpawnOptions, type ShellInfo } from '@shared/types'
import type { PtyManager } from '../pty/PtyManager'
import { getAvailableShells } from '../pty/shells'

export function registerPtyIpc(ptys: PtyManager): void {
  ipcMain.handle(IPC.PtyShells, (): ShellInfo[] =>
    getAvailableShells().map(({ kind, label, path }) => ({ kind, label, path }))
  )

  ipcMain.handle(IPC.PtyCreate, (event, options: PtySpawnOptions) => {
    const wc = event.sender
    // sessionId is assigned synchronously before any pty data can be delivered
    let sessionId = ''
    const session = ptys.create(options, {
      onData: (data) => {
        if (!wc.isDestroyed()) wc.send(IPC.PtyData, sessionId, data)
      },
      onExit: (exitCode) => {
        if (!wc.isDestroyed()) wc.send(IPC.PtyExit, sessionId, exitCode)
      }
    })
    sessionId = session.sessionId

    wc.once('destroyed', () => ptys.kill(session.sessionId))
    return session
  })

  ipcMain.on(IPC.PtyWrite, (_event, sessionId: string, data: string) => {
    ptys.write(sessionId, data)
  })

  ipcMain.on(IPC.PtyResize, (_event, sessionId: string, cols: number, rows: number) => {
    ptys.resize(sessionId, cols, rows)
  })

  ipcMain.handle(IPC.PtyKill, (_event, sessionId: string) => {
    ptys.kill(sessionId)
  })
}
