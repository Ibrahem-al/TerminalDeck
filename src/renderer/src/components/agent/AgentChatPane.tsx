import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Bot, Check, Loader2, RotateCcw, X } from 'lucide-react'
import type { AgentPermissionMode } from '@shared/types'
import { registerPaneWriter, unregisterPaneWriter } from '../terminal/inputBus'
import { Composer, type SlashCommand } from './Composer'
import { Markdown } from './Markdown'
import { ToolCard } from './ToolCard'
import {
  applyEvent,
  resolvePermission,
  userItem,
  type TranscriptItem
} from './transcript'

const PERMISSION_MODES: { value: AgentPermissionMode; label: string }[] = [
  { value: 'default', label: 'Ask (may deny)' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan only' },
  { value: 'bypassPermissions', label: 'Bypass — careful' }
]

interface Footer {
  model: string
  costUsd: number
  lastDurationMs: number | null
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Bot size={20} className="text-accent" aria-hidden="true" />
      <p className="font-ui text-[15px] font-medium text-ink-2">Claude is standing by</p>
      <p className="max-w-[40ch] font-ui text-[12.5px] leading-relaxed text-ink-3">
        Ask anything below. File edits, commands, and searches will show up as activity cards in
        the conversation.
      </p>
    </div>
  )
}

function ConnectingState({ slow }: { slow: boolean }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Loader2 size={20} className="animate-spin text-accent" aria-hidden="true" />
      <p className="font-ui text-[15px] font-medium text-ink-2">Connecting to Claude…</p>
      {slow && (
        <p className="max-w-[42ch] font-ui text-[12px] leading-relaxed text-ink-3">
          Still starting — the first launch can take a few seconds while Claude boots.
        </p>
      )}
    </div>
  )
}

interface AgentChatPaneProps {
  cwd?: string
  paneId?: string
}

export function AgentChatPane({ cwd, paneId }: AgentChatPaneProps = {}): React.JSX.Element {
  const [items, setItems] = useState<TranscriptItem[]>([])
  const [busy, setBusy] = useState(false)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'connecting' | 'ready' | 'dead'>('connecting')
  const [slowConnect, setSlowConnect] = useState(false)
  const [agentCommands, setAgentCommands] = useState<string[]>([])
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>('acceptEdits')
  const [footer, setFooter] = useState<Footer>({ model: '', costUsd: 0, lastDurationMs: null })

  const agentIdRef = useRef<string | null>(null)
  const permissionModeRef = useRef<AgentPermissionMode>('acceptEdits')
  const lastErrRef = useRef<string>('')
  const startedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  const start = useCallback(
    async (mode: AgentPermissionMode): Promise<void> => {
      permissionModeRef.current = mode
      lastErrRef.current = ''
      setPhase('connecting')
      setSlowConnect(false)
      const info = await window.quarterdeck.agent.create({ permissionMode: mode, cwd })
      agentIdRef.current = info.agentId
      setAgentId(info.agentId)
    },
    [cwd]
  )

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true
      void start(permissionMode)
    }
    // closing the pane kills the agent process
    return () => {
      if (agentIdRef.current) {
        void window.quarterdeck.agent.kill(agentIdRef.current)
        agentIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // one global event subscription, filtered to our session
  useEffect(() => {
    const off = window.quarterdeck.agent.onEvent((id, ev) => {
      if (id !== agentIdRef.current) return
      switch (ev.kind) {
        case 'init':
          setFooter((f) => ({ ...f, model: ev.model }))
          setAgentCommands(ev.slashCommands)
          setPhase('ready')
          // reconcile in case the mode was changed during the connecting window
          if (agentIdRef.current)
            window.quarterdeck.agent.setPermissionMode(agentIdRef.current, permissionModeRef.current)
          break
        case 'result':
          setBusy(false)
          setFooter((f) => ({ ...f, costUsd: ev.costUsd, lastDurationMs: ev.durationMs }))
          setItems((prev) => applyEvent(prev, ev))
          break
        case 'exit':
          setBusy(false)
          setPhase('dead')
          setItems((prev) => {
            const next = applyEvent(prev, ev)
            if (ev.code !== 0 && lastErrRef.current) {
              next.push({
                type: 'note',
                id: `err-${Date.now()}`,
                tone: 'error',
                text: lastErrRef.current.slice(0, 300)
              })
            }
            return next
          })
          break
        case 'stderr': {
          // kept out of the transcript; surfaced in the connecting / ended states
          const t = ev.text.trim()
          if (t) lastErrRef.current = t
          break
        }
        default:
          setItems((prev) => applyEvent(prev, ev))
      }
    })
    return off
  }, [])

  // stick to bottom while content streams in, unless the user scrolled away
  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTo({ top: el.scrollHeight })
  }, [items, busy])

  // after a beat without an init event, hint that startup is just slow
  useEffect(() => {
    if (phase !== 'connecting') return
    const t = setTimeout(() => setSlowConnect(true), 9000)
    return () => clearTimeout(t)
  }, [phase])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  const send = (text: string): void => {
    if (!agentIdRef.current) return
    setItems((prev) => [...prev, userItem(text)])
    setBusy(true)
    window.quarterdeck.agent.send(agentIdRef.current, text)
  }

  // input-bus membership: Kanban "send to pane" delivers prompts here
  useEffect(() => {
    if (!paneId) return
    registerPaneWriter(paneId, (data) => {
      const text = data.replace(/\r+$/, '').trim()
      if (text !== '') send(text)
    })
    return () => unregisterPaneWriter(paneId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId])

  const stop = (): void => {
    if (agentIdRef.current) window.quarterdeck.agent.interrupt(agentIdRef.current)
  }

  const respondPermission = (requestId: string, allow: boolean): void => {
    if (!agentIdRef.current) return
    window.quarterdeck.agent.respondPermission(agentIdRef.current, requestId, allow)
    setItems((prev) => resolvePermission(prev, requestId, allow ? 'allowed' : 'denied'))
  }

  const changeMode = (mode: AgentPermissionMode): void => {
    permissionModeRef.current = mode
    setPermissionMode(mode)
    const id = agentIdRef.current
    if (id) {
      // live switch on the running session — no respawn, transcript stays intact
      window.quarterdeck.agent.setPermissionMode(id, mode)
      setItems((prev) => [
        ...prev,
        {
          type: 'note',
          id: `mode-${Date.now()}`,
          tone: 'info',
          text: `Permission mode → "${PERMISSION_MODES.find((m) => m.value === mode)?.label}"`
        }
      ])
    } else if (phase === 'dead') {
      // nothing running — bring a session up in the new mode
      void start(mode)
    }
    // still connecting: the init handler reconciles to permissionModeRef
  }

  const restart = (): void => {
    const old = agentIdRef.current
    if (old) void window.quarterdeck.agent.kill(old)
    agentIdRef.current = null
    setItems([])
    setBusy(false)
    setFooter({ model: '', costUsd: 0, lastDurationMs: null })
    void start(permissionMode)
  }

  // Local actions handled in-app, plus every slash command the live session
  // reported at init (built-ins + custom + plugin commands), passed through to
  // Claude. Local names win on collision.
  const localCommands: SlashCommand[] = [
    { name: 'clear', hint: 'New conversation — clears this one', onRun: restart },
    { name: 'ask', hint: 'Permissions: ask before each tool', onRun: () => changeMode('default') },
    { name: 'accept-edits', hint: 'Permissions: auto-accept file edits', onRun: () => changeMode('acceptEdits') },
    { name: 'plan', hint: 'Permissions: plan only, no changes', onRun: () => changeMode('plan') },
    { name: 'bypass', hint: 'Permissions: allow everything — careful', onRun: () => changeMode('bypassPermissions') }
  ]
  const localNames = new Set(localCommands.map((c) => c.name))
  const slashCommands: SlashCommand[] = [
    ...localCommands,
    ...agentCommands
      .filter((name) => !localNames.has(name))
      .sort()
      .map((name) => ({ name, hint: '' }))
  ]

  const lastItem = items[items.length - 1]
  const waitingFirstToken =
    busy && (lastItem?.type === 'user' || (lastItem?.type === 'assistant' && lastItem.segments.length === 0))

  return (
    <div className="flex h-full flex-col bg-base">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 && !busy ? (
          phase === 'connecting' ? <ConnectingState slow={slowConnect} /> : <EmptyState />
        ) : (
          <div className="mx-auto flex max-w-[820px] flex-col gap-4 px-5 py-4">
            {items.map((item) => {
              switch (item.type) {
                case 'user':
                  return (
                    <div key={item.id} className="block-enter flex justify-end">
                      <div className="max-w-[85%] rounded-xl rounded-br-sm bg-block-cmd px-3.5 py-2.5 font-ui text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink select-text">
                        {item.text}
                      </div>
                    </div>
                  )
                case 'assistant':
                  return (
                    <div key={item.id} className="block-enter flex flex-col gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rotate-45 bg-accent" aria-hidden="true" />
                        <span className="font-ui text-[10.5px] font-medium tracking-[0.12em] text-ink-3 uppercase">
                          Claude
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 pl-3.5">
                        {item.segments.map((seg, i) =>
                          seg.type === 'text' ? (
                            <Markdown key={i} text={seg.text} />
                          ) : (
                            <ToolCard key={seg.id} seg={seg} />
                          )
                        )}
                      </div>
                    </div>
                  )
                case 'permission':
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border border-warn/40 bg-raised px-3.5 py-2.5"
                    >
                      <AlertTriangle size={14} className="shrink-0 text-warn" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="font-ui text-[12.5px] text-ink">
                          Claude wants to use <span className="font-semibold">{item.toolName}</span>
                        </p>
                        <code className="block truncate font-mono text-[11px] text-ink-3">
                          {JSON.stringify(item.input)}
                        </code>
                      </div>
                      {item.resolved ? (
                        <span className="shrink-0 font-ui text-[11.5px] text-ink-3">{item.resolved}</span>
                      ) : (
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            onClick={() => respondPermission(item.requestId, true)}
                            className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 font-ui text-[11.5px] font-semibold text-ink-inverse"
                          >
                            <Check size={11} aria-hidden="true" /> Allow
                          </button>
                          <button
                            onClick={() => respondPermission(item.requestId, false)}
                            className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 font-ui text-[11.5px] font-medium text-ink-2 hover:border-danger hover:text-danger"
                          >
                            <X size={11} aria-hidden="true" /> Deny
                          </button>
                        </div>
                      )}
                    </div>
                  )
                case 'note':
                  return (
                    <p
                      key={item.id}
                      className={`text-center font-ui text-[11.5px] ${
                        item.tone === 'error' ? 'text-danger' : 'text-ink-3'
                      }`}
                    >
                      {item.text}
                    </p>
                  )
              }
            })}

            {waitingFirstToken && (
              <div className="flex items-center gap-2 pl-3.5 text-ink-3">
                <Loader2 size={13} className="animate-spin text-accent" aria-hidden="true" />
                <span className="font-ui text-[12px]">Working…</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pb-2">
        <Composer
          busy={busy}
          disabled={phase === 'dead' || agentId === null}
          commands={slashCommands}
          onSend={send}
          onStop={stop}
        />
      </div>

      <footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-edge-2 px-4">
        <div className="flex min-w-0 items-center gap-3">
          {phase === 'dead' && (
            <button
              onClick={restart}
              className="flex items-center gap-1 font-ui text-[11px] font-medium text-accent hover:underline"
            >
              <RotateCcw size={10} aria-hidden="true" /> New session
            </button>
          )}
          <span className="truncate font-ui text-[10.5px] text-ink-3">
            {phase === 'connecting' ? 'connecting…' : footer.model || '—'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {footer.costUsd > 0 && (
            <span className="font-ui text-[10.5px] text-ink-3 tabular-nums" title="Session cost">
              ${footer.costUsd.toFixed(2)}
            </span>
          )}
          <label className="flex items-center gap-1.5 font-ui text-[10.5px] text-ink-3">
            permissions
            <select
              value={permissionMode}
              onChange={(e) => changeMode(e.target.value as AgentPermissionMode)}
              className="rounded border border-edge bg-raised px-1 py-0.5 font-ui text-[10.5px] text-ink-2 outline-none focus-visible:border-accent"
            >
              {PERMISSION_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </footer>
    </div>
  )
}
