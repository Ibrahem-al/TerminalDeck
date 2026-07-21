/**
 * IPC surface for the notch: state catch-up + actions from the notch renderer,
 * PTY attach/stream (the notch is a PtyManager SUBSCRIBER, like the phone —
 * IPC.PtyData only ever goes to a pane's owning window), agent signals from the
 * main windows' renderers, and the Claude Code hooks install flow for Settings.
 */
import { ipcMain } from 'electron'
import {
  IPC,
  type NotchAgentSignal,
  type NotchAttachResult,
  type NotchJumpTarget,
  type NotchStreamFrame
} from '@shared/types'
import type { PtyManager } from '../pty/PtyManager'
import { notch } from './NotchController'
import { notchWindow, setNotchIgnoreMouse, setNotchUiRect } from './NotchWindow'
import { hooksStatus, installHooks, uninstallHooks } from './hooks'

export function registerNotchIpc(ptys: PtyManager): void {
  // One live attachment per session; re-attach replaces (unsubscribing first).
  const attached = new Map<string, () => void>()

  const detach = (sessionId: string): void => {
    attached.get(sessionId)?.()
    attached.delete(sessionId)
  }

  ipcMain.handle(IPC.NotchGetState, () => notch.state())
  ipcMain.on(IPC.NotchDismiss, (_e, attentionId: string) => notch.dismiss(attentionId))
  ipcMain.on(IPC.NotchJump, (_e, target: NotchJumpTarget) => {
    if (target && typeof target === 'object') notch.jump(target)
  })
  ipcMain.on(IPC.NotchSetIgnoreMouse, (_e, ignore: boolean) => setNotchIgnoreMouse(Boolean(ignore)))
  // The visible UI's rect (window-relative), driving the main-side hover poll.
  ipcMain.on(IPC.NotchUiRect, (_e, rect: { x: number; y: number; w: number; h: number } | null) => {
    setNotchUiRect(
      rect && typeof rect === 'object'
        ? { x: Number(rect.x) || 0, y: Number(rect.y) || 0, w: Number(rect.w) || 0, h: Number(rect.h) || 0 }
        : null
    )
  })

  ipcMain.handle(IPC.NotchAttach, (e, sessionId: string, since: number): NotchAttachResult => {
    detach(sessionId)
    // If the notch window goes away (settings toggle, last-window teardown)
    // without detaching, drop the subscription with it — otherwise it lingers
    // in PtyManager until the session exits.
    e.sender.once('destroyed', () => detach(sessionId))
    const dims = ptys.dims(sessionId)
    const send = (frame: NotchStreamFrame): void => {
      const w = notchWindow()
      if (w) w.webContents.send(IPC.NotchStream, frame)
    }
    const result = ptys.subscribe(sessionId, `notch:${sessionId}`, Math.max(0, Number(since) || 0), {
      onData: (seq, chunk) => send({ t: 'data', sessionId, seq, b64: chunk.toString('base64') }),
      onExit: (code) => {
        detach(sessionId)
        send({ t: 'exit', sessionId, code })
      },
      onResize: (cols, rows) => send({ t: 'resize', sessionId, cols, rows })
    })
    if (!result || !dims) {
      return { ok: false, cols: 0, rows: 0, headSeq: 0, reset: false, replayB64: '' }
    }
    attached.set(sessionId, result.unsubscribe)
    return {
      ok: true,
      cols: dims.cols,
      rows: dims.rows,
      headSeq: result.headSeq,
      reset: result.reset,
      replayB64: result.replay.toString('base64')
    }
  })

  ipcMain.on(IPC.NotchDetach, (_e, sessionId: string) => detach(sessionId))

  // Per-session detection signals from the main windows (heuristics, bell,
  // OSC 9 toasts, OSC-133 command state).
  ipcMain.on(IPC.NotchAgentSignal, (_e, sessionId: string, signal: NotchAgentSignal) => {
    if (typeof sessionId !== 'string' || sessionId === '' || !signal) return
    notch.agentSignal(sessionId, signal)
  })

  // Claude Code hooks consent flow (Settings → Notch in the main windows).
  ipcMain.handle(IPC.NotchHooksStatus, () => hooksStatus())
  ipcMain.handle(IPC.NotchHooksInstall, () => installHooks())
  ipcMain.handle(IPC.NotchHooksUninstall, () => uninstallHooks())
}
