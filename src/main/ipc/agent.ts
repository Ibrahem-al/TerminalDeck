import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { IPC, type AgentPermissionMode, type AgentSessionInfo, type AgentSpawnOptions } from '@shared/types'
import { AgentSession } from '../agent/AgentSession'
import { aiKeepAwake } from '../power/keepAwake'

const sessions = new Map<string, AgentSession>()

export function registerAgentIpc(): void {
  ipcMain.handle(IPC.AgentCreate, (event, options: AgentSpawnOptions): AgentSessionInfo => {
    const wc = event.sender
    const agentId = randomUUID()

    const session = new AgentSession(options, (ev) => {
      if (!wc.isDestroyed()) wc.send(IPC.AgentEvent, agentId, ev)
      // Keep-awake follows the turn lifecycle: a `result` ends the turn (idle),
      // an `exit` ends the session for good.
      if (ev.kind === 'result') aiKeepAwake.markIdle(agentId)
      else if (ev.kind === 'exit') {
        aiKeepAwake.remove(agentId)
        sessions.delete(agentId)
      }
    })

    sessions.set(agentId, session)
    wc.once('destroyed', () => {
      sessions.get(agentId)?.kill()
      sessions.delete(agentId)
      aiKeepAwake.remove(agentId)
    })

    return { agentId, cwd: session.cwd }
  })

  ipcMain.on(IPC.AgentSend, (_e, agentId: string, text: string) => {
    const session = sessions.get(agentId)
    if (!session) return
    session.send(text)
    // Busy until the matching `result` (or the session exits) — this is what
    // holds the machine awake when the setting is on.
    aiKeepAwake.markBusy(agentId)
  })

  ipcMain.on(IPC.AgentInterrupt, (_e, agentId: string) => {
    sessions.get(agentId)?.interrupt()
  })

  ipcMain.on(IPC.AgentRespondPermission, (_e, agentId: string, requestId: string, allow: boolean) => {
    sessions.get(agentId)?.respondPermission(requestId, allow)
  })

  ipcMain.on(IPC.AgentSetPermissionMode, (_e, agentId: string, mode: AgentPermissionMode) => {
    sessions.get(agentId)?.setPermissionMode(mode)
  })

  ipcMain.handle(IPC.AgentKill, (_e, agentId: string) => {
    sessions.get(agentId)?.kill()
    sessions.delete(agentId)
    aiKeepAwake.remove(agentId)
  })
}

export function disposeAllAgents(): void {
  for (const [, session] of sessions) session.kill()
  sessions.clear()
  aiKeepAwake.reset()
}
