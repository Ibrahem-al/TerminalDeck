import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/** xterm wrapped for the phone: fits its container and reports cols/rows. */
export class TerminalView {
  readonly term: Terminal
  private readonly fit = new FitAddon()

  constructor(container: HTMLElement, onInput: (data: string) => void) {
    this.term = new Terminal({
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      convertEol: false,
      theme: {
        background: '#0b0f16',
        foreground: '#e8ecf4',
        cursor: '#d8a956',
        selectionBackground: '#5b9dd94d'
      }
    })
    this.term.loadAddon(this.fit)
    this.term.open(container)
    this.term.onData(onInput)
    this.refit()
  }

  write(bytes: Uint8Array): void {
    this.term.write(bytes)
  }

  reset(): void {
    this.term.reset()
  }

  /** Refit to the container and return the new dimensions. */
  refit(): { cols: number; rows: number } {
    try {
      this.fit.fit()
    } catch {
      /* container not laid out yet */
    }
    return { cols: this.term.cols, rows: this.term.rows }
  }

  focus(): void {
    this.term.focus()
  }

  dispose(): void {
    this.term.dispose()
  }
}
