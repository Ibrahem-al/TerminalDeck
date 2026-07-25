import { ipcMain } from 'electron'
import { IPC, type PtySpawnOptions, type ShellInfo } from '@shared/types'
import type { PtyManager } from '../pty/PtyManager'
import { getAvailableShells } from '../pty/shells'

/**
 * Max age of buffered pty output before it is pushed to the renderer. Under a
 * frame at 60Hz, so batching is invisible, but enough to fold a burst of small
 * ConPTY writes into a single IPC message.
 */
const PTY_FLUSH_MS = 8

export function registerPtyIpc(ptys: PtyManager): void {
  ipcMain.handle(IPC.PtyShells, (): ShellInfo[] =>
    getAvailableShells().map(({ kind, label, path }) => ({ kind, label, path }))
  )

  ipcMain.handle(IPC.PtyCreate, (event, options: PtySpawnOptions) => {
    const wc = event.sender
    // sessionId is assigned synchronously before any pty data can be delivered
    let sessionId = ''

    // A chatty shell (an agent TUI, a build log) emits many small chunks per
    // second, and one wc.send per chunk means one structured-clone + IPC hop
    // each, all on the main thread. Coalesce them into at most one message per
    // PTY_FLUSH_MS. The first chunk after a quiet spell still goes out on the
    // next tick, so keystroke echo stays immediate — the window only throttles
    // once output is actually streaming, which is exactly when it pays.
    let buffered: string[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let lastFlush = 0

    const flush = (): void => {
      flushTimer = null
      lastFlush = Date.now()
      if (buffered.length === 0) return
      const data = buffered.length === 1 ? buffered[0] : buffered.join('')
      buffered = []
      if (!wc.isDestroyed()) wc.send(IPC.PtyData, sessionId, data)
    }
    const schedule = (): void => {
      if (flushTimer) return
      flushTimer = setTimeout(flush, Math.max(0, PTY_FLUSH_MS - (Date.now() - lastFlush)))
    }
    const cancelFlush = (): void => {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = null
    }

    const session = ptys.create(options, {
      onData: (data) => {
        buffered.push(data)
        schedule()
      },
      onExit: (exitCode) => {
        // Ordering matters: everything the shell printed must reach the pane
        // before it is told the shell died, or the last output is lost.
        cancelFlush()
        flush()
        if (!wc.isDestroyed()) wc.send(IPC.PtyExit, sessionId, exitCode)
      }
    })
    sessionId = session.sessionId

    wc.once('destroyed', () => {
      cancelFlush()
      buffered = []
      ptys.kill(session.sessionId)
    })
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
