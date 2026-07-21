/**
 * The session backend the RemoteDeck Agent/WS layer depends on. Decoupling the
 * transport from the session source lets v1 mirror the DESKTOP's open terminal
 * panes (DesktopBackend over PtyManager) without the WS/auth/PWA code caring.
 */
import type { RemoteCreateOptions, RemoteSessionInfo } from '@shared/types'

export interface RemoteSubscriber {
  /** A live output chunk; `seq` is the cumulative byte count after this chunk. */
  onData: (seq: number, chunk: Buffer) => void
  onExit: (code: number) => void
  /** The owning pane resized the PTY (notch mini-terminals track the real size). */
  onResize?: (cols: number, rows: number) => void
}

export interface SubscribeResult {
  headSeq: number
  /** Buffered bytes after the requested `since`, replayed before live data. */
  replay: Buffer
  /**
   * True when `since` fell before the retained ring (output scrolled out while
   * the phone was away). The replay is then the whole ring and the client must
   * reset its terminal first to avoid a desync / garbled screen.
   */
  reset: boolean
  unsubscribe: () => void
}

export interface SessionBackend {
  /** Create a session. May resolve null (e.g. open was async/declined). */
  create(opts: RemoteCreateOptions): Promise<RemoteSessionInfo | null>
  subscribe(id: string, subscriberId: string, since: number, sub: RemoteSubscriber): SubscribeResult | null
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  end(id: string): void
  list(): RemoteSessionInfo[]
  disposeAll(): void
}
