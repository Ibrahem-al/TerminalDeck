import { spawn, type ChildProcess } from 'child_process'
import { homedir } from 'os'
import type { AgentBlock, AgentEvent, AgentPermissionMode, AgentSpawnOptions } from '@shared/types'

/**
 * One persistent Claude Code process in stream-json mode. Speaks the same
 * protocol the IDE extensions use: user messages in over stdin, typed
 * events out over stdout, one JSON object per line.
 */
export class AgentSession {
  private child: ChildProcess
  private buffer = ''
  private requestCounter = 0
  private killed = false

  readonly cwd: string

  constructor(
    options: AgentSpawnOptions,
    private emit: (event: AgentEvent) => void
  ) {
    this.cwd = options.cwd ?? homedir()

    // never let a nested-session guard trip when the app itself was
    // launched from inside a Claude Code session
    const env = { ...process.env }
    delete env['CLAUDECODE']
    delete env['CLAUDE_CODE_ENTRYPOINT']

    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      // Don't boot the user's global MCP servers (Supabase, Vercel, Gmail, …) for
      // the embedded chat — loading them all is what made startup crawl. The
      // "Claude Code" terminal pane still gets the full config. Remove this flag
      // to bring MCP tools back into the embedded chat.
      '--strict-mcp-config'
    ]
    if (options.permissionMode && options.permissionMode !== 'default') {
      args.push('--permission-mode', options.permissionMode)
    }

    // shell:true resolves the npm .cmd shim on Windows
    this.child = spawn('claude', args, { cwd: this.cwd, env, shell: true, windowsHide: true })

    this.child.stdout?.on('data', (chunk: Buffer) => this.onStdout(chunk.toString()))
    this.child.stderr?.on('data', (chunk: Buffer) => {
      this.emit({ kind: 'stderr', text: chunk.toString() })
    })
    this.child.on('error', (err) => {
      this.emit({ kind: 'stderr', text: err.message })
      this.emit({ kind: 'exit', code: -1 })
    })
    this.child.on('exit', (code) => {
      if (!this.killed) this.emit({ kind: 'exit', code: code ?? -1 })
    })
  }

  send(text: string): void {
    this.writeLine({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] }
    })
  }

  interrupt(): void {
    this.writeLine({
      type: 'control_request',
      request_id: `qd-${++this.requestCounter}`,
      request: { subtype: 'interrupt' }
    })
  }

  /**
   * Change permission mode on the live session — no respawn, transcript intact.
   * Same stream-json control channel as interrupt()/permission replies; this is
   * what the Agent SDK's setPermissionMode() sends under the hood.
   */
  setPermissionMode(mode: AgentPermissionMode): void {
    this.writeLine({
      type: 'control_request',
      request_id: `qd-${++this.requestCounter}`,
      request: { subtype: 'set_permission_mode', mode }
    })
  }

  respondPermission(requestId: string, allow: boolean): void {
    this.writeLine({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: allow
          ? { behavior: 'allow', updatedInput: undefined }
          : { behavior: 'deny', message: 'Denied from Quarterdeck' }
      }
    })
  }

  kill(): void {
    this.killed = true
    const pid = this.child.pid
    if (pid !== undefined) {
      // shell:true means child.kill() would only hit the cmd shim — take the tree
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    } else {
      this.child.kill()
    }
  }

  private writeLine(obj: unknown): void {
    try {
      this.child.stdin?.write(JSON.stringify(obj) + '\n')
    } catch {
      // stdin already closed — exit event will surface the state
    }
  }

  private onStdout(text: string): void {
    this.buffer += text
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (line === '') continue
      let ev: Record<string, unknown>
      try {
        ev = JSON.parse(line)
      } catch {
        continue // non-JSON noise on stdout
      }
      this.handleEvent(ev)
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private handleEvent(ev: any): void {
    switch (ev.type) {
      case 'system':
        if (ev.subtype === 'init') {
          this.emit({
            kind: 'init',
            sessionId: String(ev.session_id ?? ''),
            model: String(ev.model ?? ''),
            cwd: String(ev.cwd ?? this.cwd),
            // user-invocable slash commands this session supports (built-ins +
            // custom + plugin commands), straight from the CLI
            slashCommands: Array.isArray(ev.slash_commands) ? ev.slash_commands.map(String) : []
          })
        }
        break

      case 'stream_event': {
        const e = ev.event
        if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
          this.emit({ kind: 'text-delta', text: String(e.delta.text ?? '') })
        }
        break
      }

      case 'assistant': {
        const content = Array.isArray(ev.message?.content) ? ev.message.content : []
        const blocks: AgentBlock[] = []
        for (const b of content) {
          if (b?.type === 'text') blocks.push({ type: 'text', text: String(b.text ?? '') })
          else if (b?.type === 'tool_use') {
            blocks.push({ type: 'tool_use', id: String(b.id), name: String(b.name), input: b.input })
          }
        }
        if (blocks.length > 0) this.emit({ kind: 'assistant-message', blocks })
        break
      }

      case 'user': {
        // tool results echo back as user messages
        const content = Array.isArray(ev.message?.content) ? ev.message.content : []
        for (const b of content) {
          if (b?.type !== 'tool_result') continue
          let preview = ''
          if (typeof b.content === 'string') preview = b.content
          else if (Array.isArray(b.content)) {
            preview = b.content
              .filter((c: any) => c?.type === 'text')
              .map((c: any) => String(c.text ?? ''))
              .join('\n')
          }
          this.emit({
            kind: 'tool-result',
            toolUseId: String(b.tool_use_id ?? ''),
            isError: b.is_error === true,
            preview: preview.slice(0, 2000)
          })
        }
        break
      }

      case 'control_request':
        if (ev.request?.subtype === 'can_use_tool') {
          this.emit({
            kind: 'permission-request',
            requestId: String(ev.request_id ?? ''),
            toolName: String(ev.request.tool_name ?? ''),
            input: ev.request.input
          })
        }
        break

      case 'result':
        this.emit({
          kind: 'result',
          isError: ev.subtype !== 'success',
          costUsd: typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : 0,
          durationMs: typeof ev.duration_ms === 'number' ? ev.duration_ms : 0,
          errorText:
            ev.subtype !== 'success'
              ? typeof ev.result === 'string'
                ? ev.result
                : String(ev.subtype)
              : undefined
        })
        break

      default:
        // rate_limit_event, system/status, future event types — ignore
        break
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
