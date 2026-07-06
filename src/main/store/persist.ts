import Store from 'electron-store'
import { app, safeStorage } from 'electron'
import { createHash, randomUUID, timingSafeEqual } from 'crypto'
import { homedir } from 'os'
import {
  DEFAULT_NOTIFY_CONFIG,
  DEFAULT_SETTINGS,
  REMOTE_DEFAULT_PORT,
  type AppSettings,
  type KanbanCard,
  type NotifyConfig,
  type PairedDevice,
  type Project,
  type ProjectEnvVar,
  type RemoteConfig,
  type WebPushSubscription
} from '@shared/types'

interface PersistedEnvVar {
  key: string
  valueEnc: string
}

type PersistedProject = Omit<Project, 'env'> & { env: PersistedEnvVar[] }

/** A paired phone, with the SHA-256 of its device token (never the raw token). */
interface StoredDevice extends PairedDevice {
  tokenHash: string
}

interface Schema {
  projects: PersistedProject[]
  kanban: KanbanCard[]
  settings: AppSettings
  /** Opaque renderer-owned session snapshot (no secrets — env vars excluded). */
  session: unknown
  /** RemoteDeck paired phones. */
  devices: StoredDevice[]
  /** Filesystem roots the phone may browse / open sessions in. */
  allowedRoots: string[]
  /** RemoteDeck Agent config. (keepAwake added later; absent in old stores.) */
  remote: { autoStart: boolean; port: number; keepAwake?: boolean }
  /** Task-complete notification routing. */
  notify: NotifyConfig
  /** VAPID keypair for Web Push (generated once). */
  vapid: { publicKey: string; privateKey: string } | null
  /** Web Push subscriptions, keyed to the paired device that registered them. */
  pushSubs: { deviceId: string; sub: WebPushSubscription }[]
}

// Dev (`npm run dev`) and the packaged app otherwise share one userData folder,
// which lets a developer's test session bleed into the installed app. Keep them
// in separate store files so a fresh install always starts clean.
const store = new Store<Schema>({
  name: app.isPackaged ? 'quarterdeck' : 'quarterdeck-dev',
  defaults: {
    projects: [],
    kanban: [],
    settings: DEFAULT_SETTINGS,
    session: null,
    devices: [],
    allowedRoots: [homedir()],
    remote: { autoStart: false, port: REMOTE_DEFAULT_PORT, keepAwake: true },
    notify: DEFAULT_NOTIFY_CONFIG,
    vapid: null,
    pushSubs: []
  }
})

function encryptValue(value: string): string {
  if (value === '') return ''
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }
  // no DPAPI (headless session) — still avoid trivially-readable plaintext
  return Buffer.from(value, 'utf8').toString('base64')
}

function decryptValue(valueEnc: string): string {
  if (valueEnc === '') return ''
  const buf = Buffer.from(valueEnc, 'base64')
  try {
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf)
    return buf.toString('utf8')
  } catch {
    // value was written without encryption (or by another machine)
    return buf.toString('utf8')
  }
}

function toPersisted(project: Project): PersistedProject {
  return {
    ...project,
    env: project.env
      .filter((v) => v.key.trim() !== '')
      .map((v): PersistedEnvVar => ({ key: v.key, valueEnc: encryptValue(v.value) }))
  }
}

function fromPersisted(p: PersistedProject): Project {
  return {
    ...p,
    color: p.color ?? '#d8a956', // projects saved before colors existed
    env: p.env.map((v): ProjectEnvVar => ({ key: v.key, value: decryptValue(v.valueEnc) }))
  }
}

export function listProjects(): Project[] {
  return store.get('projects').map(fromPersisted)
}

export function saveProject(project: Project): void {
  const projects = store.get('projects')
  const idx = projects.findIndex((p) => p.id === project.id)
  const persisted = toPersisted(project)
  if (idx >= 0) projects[idx] = persisted
  else projects.push(persisted)
  store.set('projects', projects)
}

export function deleteProject(id: string): void {
  store.set(
    'projects',
    store.get('projects').filter((p) => p.id !== id)
  )
}

export function loadKanban(): KanbanCard[] {
  return store.get('kanban')
}

export function saveKanban(cards: KanbanCard[]): void {
  store.set('kanban', cards)
}

/** Deep-merged with defaults so new settings keys never read undefined. */
export function loadSettings(): AppSettings {
  const stored = store.get('settings')
  return {
    general: { ...DEFAULT_SETTINGS.general, ...stored.general },
    editor: { ...DEFAULT_SETTINGS.editor, ...stored.editor },
    terminal: { ...DEFAULT_SETTINGS.terminal, ...stored.terminal }
  }
}

export function saveSettings(settings: AppSettings): void {
  store.set('settings', settings)
}

export function loadSession(): unknown {
  return store.get('session')
}

export function saveSession(session: unknown): void {
  store.set('session', session ?? null)
}

/* ── RemoteDeck: paired devices, config, token auth ───────────────── */

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Renderer-facing device list — token hashes stripped. */
export function listDevices(): PairedDevice[] {
  return store.get('devices').map((d) => ({
    id: d.id,
    name: d.name,
    userAgent: d.userAgent,
    createdAt: d.createdAt,
    lastSeen: d.lastSeen
  }))
}

/** Mints a device row for a freshly paired phone. Stores only the token hash. */
export function registerDevice(name: string, userAgent: string, token: string): PairedDevice {
  const now = Date.now()
  const device: StoredDevice = {
    id: randomUUID(),
    name: name.trim() || 'Phone',
    userAgent,
    createdAt: now,
    lastSeen: now,
    tokenHash: hashToken(token)
  }
  store.set('devices', [...store.get('devices'), device])
  return { id: device.id, name: device.name, userAgent, createdAt: now, lastSeen: now }
}

// Bump a device's lastSeen to disk at most once per this window. Without it,
// high-frequency authed traffic (notably the preview proxy fanning one page into
// many asset/HMR requests) would force a full synchronous store write per
// request, stalling the main process. In-memory only — fine to reset on restart.
const TOUCH_THROTTLE_MS = 60_000
const lastTouchAt = new Map<string, number>()

export function touchDevice(id: string): void {
  const now = Date.now()
  if (now - (lastTouchAt.get(id) ?? 0) < TOUCH_THROTTLE_MS) return
  lastTouchAt.set(id, now)
  store.set(
    'devices',
    store.get('devices').map((d) => (d.id === id ? { ...d, lastSeen: now } : d))
  )
}

export function revokeDevice(id: string): PairedDevice[] {
  store.set(
    'devices',
    store.get('devices').filter((d) => d.id !== id)
  )
  store.set(
    'pushSubs',
    store.get('pushSubs').filter((p) => p.deviceId !== id)
  )
  return listDevices()
}

/**
 * Returns the matching device id for a presented token, comparing against
 * EVERY stored hash in constant time (no early exit) so timing can't reveal
 * which device — or whether any — matched.
 */
export function deviceForToken(token: string): string | null {
  const presented = Buffer.from(hashToken(token), 'hex')
  let matchId: string | null = null
  for (const d of store.get('devices')) {
    const stored = Buffer.from(d.tokenHash, 'hex')
    if (stored.length === presented.length && timingSafeEqual(stored, presented)) {
      matchId = d.id
    }
  }
  return matchId
}

export function loadRemoteConfig(): RemoteConfig {
  const r = store.get('remote')
  return {
    autoStart: r.autoStart,
    port: r.port,
    // Default on for stores written before keep-awake existed.
    keepAwake: r.keepAwake ?? true,
    allowedRoots: store.get('allowedRoots')
  }
}

export function saveRemoteConfig(cfg: RemoteConfig): void {
  store.set('remote', { autoStart: cfg.autoStart, port: cfg.port, keepAwake: cfg.keepAwake })
  store.set('allowedRoots', cfg.allowedRoots)
}

export function getAllowedRoots(): string[] {
  return store.get('allowedRoots')
}

/* ── Notifications + Web Push ─────────────────────────────────────── */

export function loadNotifyConfig(): NotifyConfig {
  return { ...DEFAULT_NOTIFY_CONFIG, ...store.get('notify') }
}

export function saveNotifyConfig(cfg: NotifyConfig): void {
  store.set('notify', cfg)
}

export function getVapid(): { publicKey: string; privateKey: string } | null {
  return store.get('vapid')
}

export function setVapid(keys: { publicKey: string; privateKey: string }): void {
  store.set('vapid', keys)
}

export function listPushSubs(): { deviceId: string; sub: WebPushSubscription }[] {
  return store.get('pushSubs')
}

/** Replaces a device's subscription (one per device, latest wins). */
export function setPushSubForDevice(deviceId: string, sub: WebPushSubscription): void {
  const others = store.get('pushSubs').filter((p) => p.deviceId !== deviceId && p.sub.endpoint !== sub.endpoint)
  store.set('pushSubs', [...others, { deviceId, sub }])
}

export function removePushSubsForDevice(deviceId: string): void {
  store.set(
    'pushSubs',
    store.get('pushSubs').filter((p) => p.deviceId !== deviceId)
  )
}

/** Drops a subscription whose endpoint the push service reported as gone (404/410). */
export function removePushSubByEndpoint(endpoint: string): void {
  store.set(
    'pushSubs',
    store.get('pushSubs').filter((p) => p.sub.endpoint !== endpoint)
  )
}

/** True when a paired device currently has notifications enabled. */
export function deviceHasPush(deviceId: string): boolean {
  return store.get('pushSubs').some((p) => p.deviceId === deviceId)
}
