import { KEYS } from './keymap'

const ROW: string[] = ['Esc', 'Tab', '^C', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', '^L', '^R', '^D', '^Z', 'PgUp', 'PgDn', 'Del']

/**
 * Scrollable bar of the keys Claude Code and shells need that a phone keyboard
 * lacks. Each tap sends the mapped bytes; Paste sends clipboard text as input.
 */
export function buildKeyBar(onSend: (data: string) => void, onPaste: () => void): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'keybar'

  const paste = document.createElement('button')
  paste.type = 'button'
  paste.className = 'key key-accent'
  paste.textContent = 'Paste'
  paste.addEventListener('click', onPaste)
  bar.appendChild(paste)

  for (const label of ROW) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'key'
    b.textContent = label
    const bytes = KEYS[label] ?? ''
    b.addEventListener('click', () => onSend(bytes))
    bar.appendChild(b)
  }
  return bar
}
