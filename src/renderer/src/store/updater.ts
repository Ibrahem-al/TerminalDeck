import { create } from 'zustand'
import type { UpdateStatusPayload } from '@shared/types'
import { toast } from './toasts'

interface UpdaterStore {
  status: UpdateStatusPayload
  /** The running app version (from the main process). */
  version: string
  initialized: boolean

  /** Subscribe to update events and kick off an initial silent check. Idempotent. */
  init: () => void
  /** Manually re-check for updates. */
  check: () => void
  /** Download an available update. */
  download: () => void
  /** Quit and install a downloaded update. */
  install: () => void
}

export const useUpdater = create<UpdaterStore>((set, get) => ({
  status: { state: 'idle' },
  version: '',
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    void window.quarterdeck.app.version().then((version) => set({ version }))

    const apply = (status: UpdateStatusPayload): void => {
      const prev = get().status
      // Updater state is process-wide (broadcast to every window). Don't let a
      // re-check (another window opening, or a manual check) knock a ready/
      // in-progress download of the same version back to an earlier state.
      const inFlight = prev.state === 'downloaded' || prev.state === 'downloading'
      const isSameVersionRecheck =
        status.state === 'checking' ||
        status.state === 'not-available' ||
        (status.state === 'available' && (!status.version || status.version === prev.version))
      if (inFlight && isSameVersionRecheck) return

      set({ status })
      // Nudge the user once an update finishes downloading, from any screen.
      if (status.state === 'downloaded' && prev.state !== 'downloaded') {
        toast(
          'success',
          `Update ${status.version ? `v${status.version} ` : ''}ready`,
          'restart to install',
          { label: 'Restart', onClick: () => window.quarterdeck.updater.install() }
        )
      }
    }

    window.quarterdeck.updater.onStatus(apply)

    // Catch up to the shared state set by another window / the launch check.
    void window.quarterdeck.updater.current().then(apply)

    // Only the session-owning window kicks off a fresh check on launch, so
    // opening extra windows never re-checks and clobbers a download in progress.
    if (window.quarterdeck.window.isPrimary) void window.quarterdeck.updater.check()
  },

  check: () => void window.quarterdeck.updater.check(),
  download: () => void window.quarterdeck.updater.download(),
  install: () => window.quarterdeck.updater.install()
}))
