import type { ITheme } from '@xterm/xterm'

/** Builds an xterm theme from the live CSS design tokens. */
export function readXtermTheme(): ITheme {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string): string => s.getPropertyValue(name).trim()

  return {
    background: v('--term-bg'),
    foreground: v('--term-ink'),
    cursor: v('--accent'),
    cursorAccent: v('--bg-base'),
    selectionBackground: v('--term-selection'),
    black: v('--ansi-0'),
    red: v('--ansi-1'),
    green: v('--ansi-2'),
    yellow: v('--ansi-3'),
    blue: v('--ansi-4'),
    magenta: v('--ansi-5'),
    cyan: v('--ansi-6'),
    white: v('--ansi-7'),
    brightBlack: v('--ansi-8'),
    brightRed: v('--ansi-9'),
    brightGreen: v('--ansi-10'),
    brightYellow: v('--ansi-11'),
    brightBlue: v('--ansi-12'),
    brightMagenta: v('--ansi-13'),
    brightCyan: v('--ansi-14'),
    brightWhite: v('--ansi-15')
  }
}
