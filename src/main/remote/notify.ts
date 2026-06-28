/**
 * Routes a "task complete" event (a shell command that ran long enough) to the
 * phone (Web Push) and/or the desktop (native OS notification), per the user's
 * configured route. "Phone only" lets you walk away from the desk and still get
 * pinged when a long task finishes.
 */
import { Notification } from 'electron'
import type { TaskCompletePayload } from '@shared/types'
import { loadNotifyConfig } from '../store/persist'
import { pushToAll } from './push'

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  const s = total % 60
  return s ? `${m}m ${s}s` : `${m}m`
}

export async function dispatchTaskComplete(p: TaskCompletePayload): Promise<void> {
  const cfg = loadNotifyConfig()
  if (cfg.route === 'off') return
  if (p.durationMs < cfg.minDurationSec * 1000) return

  const ok = p.exitCode === 0
  const title = ok ? `✓ ${p.title} finished` : `✗ ${p.title} — exit ${p.exitCode}`
  const body = `${p.detail ? p.detail + ' · ' : ''}took ${formatDuration(p.durationMs)}`

  if (cfg.route === 'phone' || cfg.route === 'both') {
    void pushToAll({ title, body, tag: 'task-complete' })
  }
  if (cfg.route === 'desktop' || cfg.route === 'both') {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  }
}
