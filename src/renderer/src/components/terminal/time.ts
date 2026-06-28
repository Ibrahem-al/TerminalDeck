/** "just now" / "42s ago" / "5m ago" / "14:32" */
export function relativeTime(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function absoluteTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/** "3s" / "1m 12s" elapsed duration */
export function elapsed(fromTs: number, now: number): string {
  const s = Math.max(0, Math.floor((now - fromTs) / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}
