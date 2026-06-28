import { useEffect, useRef, useState } from 'react'
import { CornerDownLeft, Square } from 'lucide-react'

export interface SlashCommand {
  /** Typed after the leading slash, e.g. 'plan' for "/plan". */
  name: string
  hint: string
  /**
   * Local action handled in-app (e.g. switch permission mode). When omitted the
   * command is a passthrough: picking it fills the composer with "/name " so args
   * can be added, and Enter sends it to Claude.
   */
  onRun?: () => void
}

interface Props {
  busy: boolean
  disabled: boolean
  commands: SlashCommand[]
  onSend: (text: string) => void
  onStop: () => void
}

export function Composer({ busy, disabled, commands, onSend, onStop }: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [sel, setSel] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const selRef = useRef<HTMLButtonElement>(null)

  // The menu shows while typing a bare "/command" token (no space yet). Once a
  // space or unmatched name is typed it closes, so a full "/cmd args" line still
  // sends straight through to Claude on Enter.
  const query = /^\/(\S*)$/.exec(text)?.[1]
  const matches =
    query !== undefined
      ? commands.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
      : []
  const menuOpen = matches.length > 0 && !dismissed
  const selClamped = Math.max(0, Math.min(sel, matches.length - 1))

  // keep the highlighted row visible when arrowing through a long list
  useEffect(() => {
    if (menuOpen) selRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selClamped, menuOpen])

  const resetHeight = (): void => {
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  const clearInput = (): void => {
    setText('')
    setSel(0)
    setDismissed(false)
    resetHeight()
  }

  const autoGrow = (): void => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }

  const pick = (cmd: SlashCommand): void => {
    if (cmd.onRun) {
      cmd.onRun()
      clearInput()
      return
    }
    // passthrough Claude command — drop "/name " into the line so args can be
    // added; the trailing space closes the menu. Enter then sends it.
    setText(`/${cmd.name} `)
    setSel(0)
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      ta.selectionStart = ta.selectionEnd = ta.value.length
      autoGrow()
    })
  }

  const submit = (): void => {
    const trimmed = text.trim()
    if (trimmed === '' || busy || disabled) return
    onSend(trimmed)
    clearInput()
  }

  return (
    <div className="relative rounded-xl border border-edge bg-term transition-colors duration-150 focus-within:border-accent/50">
      {menuOpen && (
        <div className="absolute right-0 bottom-full left-0 mb-1.5 max-h-72 overflow-y-auto rounded-lg border border-edge bg-overlay py-1 shadow-xl">
          <p className="px-3 pt-0.5 pb-1 font-ui text-[10px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
            Commands
          </p>
          {matches.map((cmd, i) => (
            <button
              key={cmd.name}
              ref={i === selClamped ? selRef : undefined}
              // mousedown (not click) so it fires before the textarea blurs
              onMouseDown={(e) => {
                e.preventDefault()
                pick(cmd)
              }}
              onMouseEnter={() => setSel(i)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-75 ${
                i === selClamped ? 'bg-raised' : ''
              }`}
            >
              <span className="shrink-0 font-mono text-[12px] font-medium text-accent">/{cmd.name}</span>
              {cmd.hint && (
                <span className="truncate font-ui text-[11.5px] text-ink-3">{cmd.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
        value={text}
        rows={1}
        disabled={disabled}
        placeholder={disabled ? 'Session unavailable' : 'Message Claude — / for commands, Enter to send'}
        className="block max-h-40 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 font-ui text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3 disabled:opacity-50"
        onChange={(e) => {
          setText(e.target.value)
          setDismissed(false)
          setSel(0)
          autoGrow()
        }}
        onKeyDown={(e) => {
          if (menuOpen) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => (Math.max(0, Math.min(s, matches.length - 1)) + 1) % matches.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => (Math.max(0, Math.min(s, matches.length - 1)) + matches.length - 1) % matches.length)
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              pick(matches[selClamped])
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setDismissed(true)
              return
            }
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="flex items-center justify-between px-2.5 pb-2">
        <span className="pl-1 font-ui text-[10.5px] text-ink-3">
          {busy ? 'Claude is working…' : ' '}
        </span>
        {busy ? (
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 font-ui text-[11.5px] font-medium text-ink-2 transition-colors duration-100 hover:border-danger hover:text-danger"
          >
            <Square size={11} aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={text.trim() === '' || disabled}
            aria-label="Send message"
            className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 font-ui text-[11.5px] font-semibold text-ink-inverse transition-opacity duration-100 disabled:opacity-30"
          >
            <CornerDownLeft size={11} aria-hidden="true" />
            Send
          </button>
        )}
      </div>
    </div>
  )
}
