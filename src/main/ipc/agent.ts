import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { IPC, type AgentPermissionMode, type AgentSessionInfo, type AgentSpawnOptions } from '@shared/types'
import { AgentSession } from '../agent/AgentSession'
import { aiKeepAwake } from '../power/keepAwake'
import { notch } from '../notch/NotchController'

const sessions = new Map<string, AgentSession>()
// Owning window per agent, so answers arriving from another surface (the
// notch's Allow/Deny) can be echoed back to the pane that shows the card.
const owners = new Map<string, Electron.WebContents>()

export function registerAgentIpc(): void {
  ipcMain.handle(IPC.AgentCreate, (event, options: AgentSpawnOptions): AgentSessionInfo => {
    const wc = event.sender
    const agentId = randomUUID()
    const paneId = options.paneId

    const session = new AgentSession(options, (ev) => {
      if (!wc.isDestroyed()) wc.send(IPC.AgentEvent, agentId, ev)
      // Keep-awake follows the turn lifecycle: a `result` ends the turn (idle),
      // an `exit` ends the session for good.
      if (ev.kind === 'result') {
        aiKeepAwake.markIdle(agentId)
        notch.agentResult(agentId, wc.id, paneId, ev.isError)
      } else if (ev.kind === 'permission-request') {
        notch.agentQuestion(agentId, wc.id, paneId, ev.requestId, ev.toolName, ev.input)
      } else if (ev.kind === 'exit') {
        aiKeepAwake.remove(agentId)
        sessions.delete(agentId)
        owners.delete(agentId)
        notch.agentGone(agentId)
      }
    })

    sessions.set(agentId, session)
    owners.set(agentId, wc)
    wc.once('destroyed', () => {
      sessions.get(agentId)?.kill()
      sessions.delete(agentId)
      owners.delete(agentId)
      aiKeepAwake.remove(agentId)
      notch.agentGone(agentId)
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
    notch.agentEngaged(agentId, true)
  })

  ipcMain.on(IPC.AgentInterrupt, (_e, agentId: string) => {
    sessions.get(agentId)?.interrupt()
  })

  ipcMain.on(IPC.AgentRespondPermission, (_e, agentId: string, requestId: string, allow: boolean) => {
    const session = sessions.get(agentId)
    if (!session) return
    session.respondPermission(requestId, allow)
    // Answered (from the pane OR the notch) — the question alert is stale now.
    notch.agentEngaged(agentId, false)
    // Echo the resolution to the owning pane so its Allow/Deny card settles
    // even when the answer came from the notch. (The pane's transcript reducer
    // is idempotent, so its own click resolving locally first is harmless.)
    const owner = owners.get(agentId)
    if (owner && !owner.isDestroyed()) {
      owner.send(IPC.AgentEvent, agentId, { kind: 'permission-resolved', requestId, allow })
    }
  })

  ipcMain.on(IPC.AgentSetPermissionMode, (_e, agentId: string, mode: AgentPermissionMode) => {
    sessions.get(agentId)?.setPermissionMode(mode)
  })

  ipcMain.handle(IPC.AgentKill, (_e, agentId: string) => {
    sessions.get(agentId)?.kill()
    sessions.delete(agentId)
    owners.delete(agentId)
    aiKeepAwake.remove(agentId)
    // kill() suppresses the exit event, so this is the only cleanup path when
    // a chat pane closes — without it the pill's working count leaks forever.
    notch.agentGone(agentId)
  })
}

export function disposeAllAgents(): void {
  for (const [, session] of sessions) session.kill()
  sessions.clear()
  owners.clear()
  aiKeepAwake.reset()
}
