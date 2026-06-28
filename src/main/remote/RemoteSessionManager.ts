/**
 * Superseded by DesktopBackend — the Agent now mirrors the desktop's own open
 * terminal panes (via PtyManager fan-out) instead of owning a separate pool.
 * Kept as a re-export so the backend types have one definition (./backend).
 */
export type { SessionBackend, RemoteSubscriber, SubscribeResult } from './backend'
