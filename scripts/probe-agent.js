/**
 * Protocol probe: drives `claude -p` in stream-json mode exactly the way
 * the Agent Chat pane will, and reports which event types actually arrive
 * (streaming deltas, multi-turn persistence, permission control requests).
 *
 * Run:  node scripts/probe-agent.js
 */
const { spawn } = require('child_process')
const { mkdtempSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

const cwd = mkdtempSync(join(tmpdir(), 'qd-agent-probe-'))

const env = { ...process.env }
delete env.CLAUDECODE
delete env.CLAUDE_CODE_ENTRYPOINT

const child = spawn(
  'claude',
  [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages'
  ],
  { cwd, env, shell: true, windowsHide: true }
)

const seen = new Map() // event type -> count
let turn = 0
let buffer = ''
let controlRequest = null

function send(text) {
  const msg = {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] }
  }
  child.stdin.write(JSON.stringify(msg) + '\n')
}

function note(type) {
  seen.set(type, (seen.get(type) ?? 0) + 1)
}

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      console.log('[probe] UNPARSEABLE LINE:', line.slice(0, 120))
      continue
    }

    const label = ev.type + (ev.subtype ? `/${ev.subtype}` : '') +
      (ev.type === 'stream_event' && ev.event?.type ? `(${ev.event.type})` : '')
    note(label)

    if (ev.type === 'control_request') {
      controlRequest = ev
      console.log('[probe] CONTROL_REQUEST:', JSON.stringify(ev).slice(0, 400))
      // deny it so the probe ends cleanly
      const resp = {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: ev.request_id,
          response: { behavior: 'deny', message: 'probe deny' }
        }
      }
      child.stdin.write(JSON.stringify(resp) + '\n')
    }

    if (ev.type === 'result') {
      turn++
      console.log(`[probe] turn ${turn} result: subtype=${ev.subtype} cost=${ev.total_cost_usd} turns=${ev.num_turns}`)
      if (turn === 1) {
        send('Reply with exactly: TURN2_OK')
      } else if (turn === 2) {
        send('Use the Bash tool to run: echo probe-bash-test')
      } else {
        child.stdin.end()
      }
    }
  }
})

child.stderr.on('data', (d) => console.log('[probe][stderr]', d.toString().trim().slice(0, 300)))

child.on('exit', (code) => {
  console.log('\n[probe] exit code:', code)
  console.log('[probe] event types seen:')
  for (const [type, count] of [...seen.entries()].sort()) {
    console.log(`   ${count}× ${type}`)
  }
  console.log('[probe] control_request seen:', controlRequest !== null)
  process.exit(0)
})

setTimeout(() => {
  console.log('[probe] TIMEOUT — killing')
  child.kill()
}, 150000)

console.log('[probe] sending turn 1…')
send('Reply with exactly: TURN1_OK')
