/**
 * Read-write mini terminal attached to a live PTY through the notch attach API
 * (a PtyManager subscriber, like the RemoteDeck phone — never IPC.PtyData,
 * which only reaches the pane's owning window).
 *
 * Sizing contract: the PTY is SHARED with the real pane, so this view must
 * never resize it (no fit addon). The terminal is created at the PTY's exact
 * cols/rows (replayed frames were emitted for that width), the font is scaled
 * down to fit the panel, and anything still wider scrolls horizontally.
 * DOM renderer only — WebGL contexts are a scarce resource in this app.
 */
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

const DARK_THEME = {
  background: '#0a0c10',
  foreground: '#dfe3ea',
  cursor: '#d8a956',
  selectionBackground: 'rgba(216, 169, 86, 0.3)'
}

export function MiniTerminal({ sessionId }: { sessionId: string }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [dead, setDead] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    setDead(null)
    let disposed = false
    let term: Terminal | null = null
    let offStream: (() => void) | null = null

    void (async () => {
      const res = await window.quarterdeck.notch.attach(sessionId, 0)
      // No detach here: the effect cleanup already sent one at unmount, and a
      // late duplicate from this stale continuation could land AFTER a newer
      // mount's attach for the same session and kill its live stream.
      if (disposed) return
      if (!res.ok) {
        setDead('This session has ended.')
        return
      }
      // Fit by font, not by cols: ~0.62 width/height ratio for IBM Plex Mono.
      const avail = host.clientWidth || 690
      const fontSize = Math.max(8, Math.min(13, Math.floor(avail / (res.cols * 0.62))))
      term = new Terminal({
        cols: res.cols,
        rows: res.rows,
        fontSize,
        fontFamily: '"IBM Plex Mono", Consolas, monospace',
        lineHeight: 1.25,
        scrollback: 3000,
        cursorBlink: true,
        cursorStyle: 'bar',
        theme: DARK_THEME,
        allowProposedApi: true,
        ...(window.quarterdeck.platform === 'win32'
          ? {
              windowsPty: {
                backend: 'conpty' as const,
                buildNumber: window.quarterdeck.windowsBuild || undefined
              }
            }
          : {})
      })
      term.open(host)
      // Plain Esc must keep reaching the PTY (interrupt in claude/TUIs), but
      // Shift+Esc skips xterm entirely — it bubbles to NotchApp's window
      // listener and collapses the panel even while the terminal has focus.
      term.attachCustomKeyEventHandler((e) => !(e.key === 'Escape' && e.shiftKey))
      term.onData((data) => window.quarterdeck.pty.write(sessionId, data))
      if (res.replayB64 !== '') term.write(b64ToBytes(res.replayB64))
      term.scrollToBottom()

      offStream = window.quarterdeck.notch.onStream((frame) => {
        if (!term || frame.sessionId !== sessionId) return
        if (frame.t === 'data') {
          term.write(b64ToBytes(frame.b64))
        } else if (frame.t === 'resize') {
          term.resize(frame.cols, frame.rows)
        } else if (frame.t === 'exit') {
          term.write(`\r\n\x1b[2m[session ended · exit ${frame.code}]\x1b[0m\r\n`)
        }
      })
      term.focus()
    })()

    // Auto-focus / click-focus: whenever the notch WINDOW gains keyboard focus
    // (main's question auto-focus, or the user clicking in), route it straight
    // into the terminal so typing works with zero extra clicks.
    const onWindowFocus = (): void => term?.focus()
    window.addEventListener('focus', onWindowFocus)

    return () => {
      disposed = true
      window.removeEventListener('focus', onWindowFocus)
      offStream?.()
      window.quarterdeck.notch.detach(sessionId)
      term?.dispose()
      term = null
    }
  }, [sessionId])

  return (
    <div className="notch-term-wrap">
      {dead !== null ? <div className="notch-term-dead">{dead}</div> : <div className="notch-term-host" ref={hostRef} />}
    </div>
  )
}
