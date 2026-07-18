import { useEffect, useState } from 'react'
import type { TmuxPrefix } from '@shared/types'
import { useWorkspace } from '../../store/workspace'
import { useSettings } from '../../store/settings'
import { useKanban } from '../../store/kanban'
import { useKeymapUi } from '../../store/keymap'
import { TEMPLATES, type Dir4 } from './layout'

/**
 * tmux-style pane keyboard control. Two coexisting modes, both configurable in
 * Settings → Shortcuts:
 *
 *  • Direct (no prefix): Alt+Arrow moves focus to the neighbouring pane,
 *    Alt+[ / Alt+] cycle, Alt+Shift+Arrow swaps the pane with its neighbour.
 *  • tmux prefix: the prefix chord arms a one-shot command (arrows/hjkl move,
 *    o/; cycle, % / " split, x close, z zoom, { } swap, ! break out, c/n/p/1-9
 *    decks, q pane numbers, ? settings). A hint shows while armed.
 *
 * Runs on the capture phase so it intercepts before xterm — the same mechanism
 * the app's other global chords use. It deliberately stands off when a real text
 * field or Monaco editor is focused so their native keys (select-all, move-line)
 * keep working; a terminal's hidden textarea is treated as a terminal, not a
 * field, so pane control works while typing in a shell.
 */

type NavContext = 'terminal' | 'monaco' | 'field' | 'chrome'

function navContext(target: EventTarget | null): NavContext {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return 'chrome'
  if (el.closest('.xterm')) return 'terminal'
  if (el.closest('.monaco-editor')) return 'monaco'
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return 'field'
  return 'chrome'
}

function isModifier(key: string): boolean {
  return key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta' || key === 'CapsLock'
}

function matchesPrefix(e: KeyboardEvent, prefix: TmuxPrefix): boolean {
  const plain = !e.metaKey && !e.shiftKey
  switch (prefix) {
    case 'ctrl+a':
      return e.ctrlKey && !e.altKey && plain && e.key.toLowerCase() === 'a'
    case 'ctrl+space':
      return e.ctrlKey && !e.altKey && plain && e.code === 'Space'
    case 'alt+q':
      return e.altKey && !e.ctrlKey && plain && e.key.toLowerCase() === 'q'
  }
}

const PREFIX_LABEL: Record<TmuxPrefix, string> = {
  'ctrl+a': 'Ctrl+A',
  'ctrl+space': 'Ctrl+Space',
  'alt+q': 'Alt+Q'
}

function arrowDir(key: string): Dir4 | null {
  switch (key) {
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    default:
      return null
  }
}

function hjklDir(lower: string): Dir4 | null {
  switch (lower) {
    case 'h':
      return 'left'
    case 'l':
      return 'right'
    case 'k':
      return 'up'
    case 'j':
      return 'down'
    default:
      return null
  }
}

export function PaneShortcuts(): React.JSX.Element {
  const [prefixLabel, setPrefixLabel] = useState<string | null>(null)

  useEffect(() => {
    let armed = false
    let numbers = false
    let armTimer: ReturnType<typeof setTimeout> | undefined
    let numbersTimer: ReturnType<typeof setTimeout> | undefined
    const setPaneNumbers = useKeymapUi.getState().setPaneNumbers

    const disarm = (): void => {
      armed = false
      clearTimeout(armTimer)
      setPrefixLabel(null)
    }
    const arm = (label: string): void => {
      armed = true
      clearTimeout(armTimer)
      setPrefixLabel(label)
      armTimer = setTimeout(disarm, 3000)
    }
    const hideNumbers = (): void => {
      numbers = false
      clearTimeout(numbersTimer)
      setPaneNumbers(false)
    }
    const showNumbers = (): void => {
      numbers = true
      clearTimeout(numbersTimer)
      setPaneNumbers(true)
      numbersTimer = setTimeout(hideNumbers, 3000)
    }

    const cycleDeck = (delta: 1 | -1): void => {
      const ws = useWorkspace.getState()
      const i = ws.tabs.findIndex((t) => t.id === ws.activeTabId)
      const len = ws.tabs.length
      if (len > 1) ws.setActiveTab(ws.tabs[(i + delta + len) % len].id)
    }

    // Interpret the command key pressed after the prefix (already consumed).
    const runCommand = (e: KeyboardEvent): void => {
      const ws = useWorkspace.getState()
      const k = e.key
      const lo = k.toLowerCase()
      const dir = arrowDir(k) ?? hjklDir(lo)
      if (dir) {
        ws.focusPaneInDirection(dir)
        return
      }
      const activePaneId = ws.tabs.find((t) => t.id === ws.activeTabId)?.activePaneId
      if (lo === 'o') ws.focusAdjacentPane(1)
      else if (k === ';') ws.focusLastPane()
      else if (k === '%') {
        if (activePaneId) ws.splitPane(activePaneId, 'row', { kind: 'terminal' })
      } else if (k === '"') {
        if (activePaneId) ws.splitPane(activePaneId, 'column', { kind: 'terminal' })
      } else if (lo === 'x') {
        if (activePaneId) ws.closePane(activePaneId)
      } else if (lo === 'z') ws.toggleZoomActivePane()
      else if (k === '{') ws.swapAdjacentPane(-1)
      else if (k === '}') ws.swapAdjacentPane(1)
      else if (k === '!') {
        if (activePaneId) ws.movePaneToNewTab(activePaneId)
      } else if (lo === 'c') ws.addTab(TEMPLATES.find((t) => t.id === 'single') ?? TEMPLATES[0])
      else if (lo === 'n') cycleDeck(1)
      else if (lo === 'p') cycleDeck(-1)
      else if (k === '&') ws.closeTab(ws.activeTabId)
      else if (k >= '1' && k <= '9') {
        const i = Number(k) - 1
        if (i < ws.tabs.length) ws.setActiveTab(ws.tabs[i].id)
      } else if (lo === 'q') {
        // Pane numbers only make sense with the split visible; while zoomed the
        // overlay is suppressed, so don't arm an invisible picker that would eat
        // the next keystroke — no-op instead.
        const zoomed = !!ws.tabs.find((t) => t.id === ws.activeTabId)?.zoomedPaneId
        if (!zoomed) showNumbers()
      } else if (k === '?') useSettings.getState().setPanelOpen(true)
      // anything else: no-op (already disarmed)
    }

    const onKey = (e: KeyboardEvent): void => {
      const keys = useSettings.getState().settings.keys

      // Pane-number picker up: the next digit jumps, any other key cancels.
      if (numbers) {
        if (isModifier(e.key)) return
        // Focus slipped into a real field/editor — cancel without eating the key.
        if (navContext(e.target) === 'field' || navContext(e.target) === 'monaco') {
          hideNumbers()
          return
        }
        e.preventDefault()
        e.stopImmediatePropagation()
        hideNumbers()
        if (e.key >= '1' && e.key <= '9') useWorkspace.getState().focusPaneByOrdinal(Number(e.key))
        return
      }

      // Prefix armed: the next non-modifier key is the command.
      if (armed) {
        if (isModifier(e.key)) return // wait for the real key (e.g. Shift before %)
        // If focus moved into a real editable field/editor after arming, abandon
        // the chord and let the key through natively (select-all, typing, …) —
        // don't swallow it as a pane command.
        if (navContext(e.target) === 'field' || navContext(e.target) === 'monaco') {
          disarm()
          return
        }
        e.preventDefault()
        e.stopImmediatePropagation()
        disarm()
        runCommand(e)
        return
      }

      // Don't start a new sequence while a full-screen overlay owns the screen.
      if (useSettings.getState().panelOpen || useKanban.getState().open) return

      // Arm the tmux prefix.
      if (keys.tmuxPrefixEnabled && matchesPrefix(e, keys.tmuxPrefix)) {
        const ctx = navContext(e.target)
        if (ctx === 'terminal' || ctx === 'chrome') {
          e.preventDefault()
          e.stopImmediatePropagation()
          arm(PREFIX_LABEL[keys.tmuxPrefix])
        }
        // In a real text field / Monaco: let the chord do its native thing (select-all).
        return
      }

      // Direct Alt navigation (no prefix). Suppressed inside Monaco, which owns Alt.
      if (keys.directPaneNav && e.altKey && !e.ctrlKey && !e.metaKey) {
        if (navContext(e.target) === 'monaco') return
        const dir = arrowDir(e.key)
        if (dir) {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (e.shiftKey) useWorkspace.getState().swapActivePaneInDirection(dir)
          else useWorkspace.getState().focusPaneInDirection(dir)
          return
        }
        if (!e.shiftKey && e.key === '[') {
          e.preventDefault()
          e.stopImmediatePropagation()
          useWorkspace.getState().focusAdjacentPane(-1)
          return
        }
        if (!e.shiftKey && e.key === ']') {
          e.preventDefault()
          e.stopImmediatePropagation()
          useWorkspace.getState().focusAdjacentPane(1)
        }
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      clearTimeout(armTimer)
      clearTimeout(numbersTimer)
      if (numbers) setPaneNumbers(false)
    }
  }, [])

  if (!prefixLabel) return <></>

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-overlay/95 px-3 py-1.5 font-ui text-[11.5px] text-ink-2 shadow-xl backdrop-blur">
        <kbd className="rounded border border-edge bg-raised px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-accent">
          {prefixLabel}
        </kbd>
        <span className="text-ink-3">
          <span className="text-ink-2">←↑↓→</span> move ·{' '}
          <span className="text-ink-2">o&nbsp;/&nbsp;;</span> cycle ·{' '}
          <span className="text-ink-2">%&nbsp;&quot;</span> split ·{' '}
          <span className="text-ink-2">x</span> close ·{' '}
          <span className="text-ink-2">z</span> zoom ·{' '}
          <span className="text-ink-2">{'{ }'}</span> swap ·{' '}
          <span className="text-ink-2">c&nbsp;n&nbsp;p&nbsp;1–9</span> decks ·{' '}
          <span className="text-ink-2">q</span> numbers
        </span>
      </div>
    </div>
  )
}
