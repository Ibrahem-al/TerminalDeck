/** Mobile key-bar labels → the exact bytes sent to the PTY. */
export const KEYS: Record<string, string> = {
  Esc: '\x1b',
  Tab: '\x09',
  Enter: '\r',
  Backspace: '\x7f',
  Up: '\x1b[A',
  Down: '\x1b[B',
  Left: '\x1b[D',
  Right: '\x1b[C',
  Home: '\x1b[H',
  End: '\x1b[F',
  PgUp: '\x1b[5~',
  PgDn: '\x1b[6~',
  Del: '\x1b[3~',
  '^C': '\x03',
  '^D': '\x04',
  '^Z': '\x1a',
  '^L': '\x0c',
  '^R': '\x12',
  '^U': '\x15'
}

/** Ctrl + a letter → its control byte (e.g. ctrlByte('c') === '\x03'). */
export function ctrlByte(letter: string): string {
  return String.fromCharCode(letter.toUpperCase().charCodeAt(0) & 0x1f)
}
