import { BrowserWindow } from 'electron'
import { IPC, type RemoteCreateOptions, type RemoteSessionInfo } from '@shared/types'
import type { PtyManager } from '../pty/PtyManager'
import type { RemoteSubscriber, SessionBackend, SubscribeResult } from './backend'
import { reportedSessions } from './sessionRegistry'
import { ensureAllowedPath } from '../net/allowlist'

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Backs the Agent onto the desktop's OWN terminal panes: the phone lists,
 * attaches to, and types into the exact same PTYs the renderer shows. Sessions
 * are reported by the renderer (sessionRegistry); live data + scrollback replay
 * come from PtyManager's fan-out. Stopping the Agent never touches these PTYs.
 */
export class DesktopBackend implements SessionBackend {
  /**
   * @param targetWindow Supplies the app window that should host phone-opened
   * panes. Injected so this pick can exclude the notch overlay window (which
   * has no RemoteOpenPane handler — sending there would time out the phone).
   */
  constructor(
    private readonly ptys: PtyManager,
    private readonly targetWindow: () => BrowserWindow | null = () =>
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null
  ) {}

  list(): RemoteSessionInfo[] {
    return reportedSessions().filter((s) => this.ptys.has(s.id))
  }

  subscribe(id: string, subscriberId: string, since: number, sub: RemoteSubscriber): SubscribeResult | null {
    return this.ptys.subscribe(id, subscriberId, since, sub)
  }

  write(id: string, data: string): void {
    this.ptys.write(id, data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.ptys.resize(id, cols, rows)
  }

  end(id: string): void {
    this.ptys.kill(id)
  }

  /** Phone "New session": ask the desktop UI to open a pane so it stays synced,
   *  then return the session once the new pane reports in. */
  async create(opts: RemoteCreateOptions): Promise<RemoteSessionInfo | null> {
    const win = this.targetWindow()
    if (!win) return null

    let cwd = opts.cwd
    if (cwd) {
      try {
        cwd = ensureAllowedPath(cwd)
      } catch {
        return null
      }
    }

    const before = new Set(reportedSessions().map((s) => s.id))
    win.webContents.send(IPC.RemoteOpenPane, { cwd, command: opts.command })

    for (let i = 0; i < 30; i++) {
      await delay(150)
      const fresh = this.list().find((s) => !before.has(s.id))
      if (fresh) return fresh
    }
    return null
  }

  /** The desktop owns these PTYs — the Agent must not kill them on shutdown. */
  disposeAll(): void {
    /* no-op: PtyManager lifecycle is owned by the app, not the Agent */
  }
}
