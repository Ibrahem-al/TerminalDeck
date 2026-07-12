import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  FolderOpen,
  Globe,
  Link2,
  Loader2,
  Lock,
  Plus,
  QrCode as QrIcon,
  RefreshCw,
  Smartphone,
  Trash2,
  X
} from 'lucide-react'
import {
  DEFAULT_NOTIFY_CONFIG,
  type NotifyConfig,
  type NotifyRoute,
  type PairedDevice,
  type PairQrPayload,
  type RemoteConfig,
  type RemoteServerStatus,
  type TailscaleStatus
} from '@shared/types'
import { QrCode } from './QrCode'
import { relativeTime } from '../terminal/time'

const rd = (): typeof window.quarterdeck.remote => window.quarterdeck.remote

const labelCls = 'mb-1.5 block font-ui text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase'
const cardCls = 'rounded-xl border border-edge-2 bg-base/40 p-4'

export function RemotePanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [status, setStatus] = useState<RemoteServerStatus | null>(null)
  const [config, setConfig] = useState<RemoteConfig | null>(null)
  const [ts, setTs] = useState<TailscaleStatus | null>(null)
  const [devices, setDevices] = useState<PairedDevice[]>([])
  const [pairing, setPairing] = useState<PairQrPayload | null>(null)
  const [notify, setNotify] = useState<NotifyConfig | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [passcodeDraft, setPasscodeDraft] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    void rd().status().then(setStatus)
    void rd().getConfig().then(setConfig)
    void rd().listDevices().then(setDevices)
    void rd().tailscale().then(setTs)
    void window.quarterdeck.notify.getConfig().then(setNotify)
    return rd().onStatusChanged(setStatus)
  }, [])

  const saveNotify = async (patch: Partial<NotifyConfig>): Promise<void> => {
    const next = { ...(notify ?? DEFAULT_NOTIFY_CONFIG), ...patch }
    setNotify(await window.quarterdeck.notify.setConfig(next))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = useCallback(async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [])

  const toggleServer = (): Promise<void> =>
    run('server', async () => {
      setStatus(status?.running ? await rd().stop() : await rd().start())
    })

  const refreshTs = (): Promise<void> => run('ts', async () => setTs(await rd().tailscale()))
  const tailscaleUp = (): Promise<void> => run('ts-up', async () => setTs(await rd().tailscaleUp()))
  const tailscaleServe = (enable: boolean): Promise<void> =>
    run('ts-serve', async () => setTs(await rd().tailscaleServe(enable)))
  const tailscaleFunnel = (enable: boolean): Promise<void> =>
    run('ts-funnel', async () => {
      setTs(await rd().tailscaleFunnel(enable))
      // A code shown before publishing encodes a LAN URL; drop it so the next one
      // carries the public Funnel origin ("works from anywhere").
      if (enable) setPairing(null)
    })

  const savePasscode = (): Promise<void> =>
    run('passcode', async () => {
      const v = passcodeDraft.trim()
      if (v.length < 6) return
      setConfig(await rd().setPasscode(v))
      setPasscodeDraft('')
    })

  const clearPasscode = (): Promise<void> =>
    run('passcode', async () => {
      // Main tears down public Funnel before clearing the passcode (enforced in
      // RemoteSetPasscode), so just clear and refresh the status the row reflects.
      setConfig(await rd().setPasscode(null))
      setTs(await rd().tailscale())
      setPasscodeDraft('')
    })

  const copyLink = async (): Promise<void> => {
    if (!pairing) return
    const link = `${pairing.url.replace(/\/+$/, '')}/?c=${pairing.code}`
    try {
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 1500)
    } catch {
      setError('Could not copy the pairing link to the clipboard.')
    }
  }

  const showQr = (): Promise<void> =>
    run('pair', async () => {
      if (!status?.running) setStatus(await rd().start())
      setPairing(await rd().newPairing())
    })

  const revoke = (id: string): Promise<void> =>
    run('dev-' + id, async () => setDevices(await rd().revokeDevice(id)))

  const addRoot = (): Promise<void> =>
    run('root', async () => {
      const dir = await window.quarterdeck.fs.pickRoot()
      if (!dir || !config) return
      if (config.allowedRoots.includes(dir)) return
      const next = { ...config, allowedRoots: [...config.allowedRoots, dir] }
      setConfig(await rd().setConfig(next))
    })

  const removeRoot = (dir: string): Promise<void> =>
    run('root', async () => {
      if (!config) return
      const next = { ...config, allowedRoots: config.allowedRoots.filter((r) => r !== dir) }
      setConfig(await rd().setConfig(next))
    })

  const setAutoStart = (autoStart: boolean): Promise<void> =>
    run('cfg', async () => {
      if (!config) return
      setConfig(await rd().setConfig({ ...config, autoStart }))
    })

  const setKeepAwake = (keepAwake: boolean): Promise<void> =>
    run('cfg', async () => {
      if (!config) return
      setConfig(await rd().setConfig({ ...config, keepAwake }))
    })

  const qrValue = pairing ? `${pairing.url.replace(/\/+$/, '')}/?c=${pairing.code}` : ''
  const running = status?.running ?? false

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[8vh]"
      onClick={onClose}
      role="dialog"
      aria-label="RemoteDeck — phone control"
    >
      <div
        className="modal-enter flex max-h-[84vh] w-[560px] flex-col overflow-hidden rounded-xl border border-edge bg-overlay shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-edge-2 px-5 py-3.5">
          <Smartphone size={17} className="text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="font-ui text-[14.5px] font-semibold text-ink">RemoteDeck</h2>
            <p className="font-ui text-[11.5px] text-ink-3">Control your terminals & Claude Code from your phone</p>
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-ui text-[10.5px] font-semibold ${
              running ? 'bg-ok-soft text-ok' : 'bg-raised text-ink-3'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-ok' : 'bg-ink-3'}`} />
            {running ? `on · ${status?.port}` : 'off'}
          </span>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-3 hover:text-ink">
            <X size={15} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger-edge bg-danger-soft px-3 py-2.5">
              <span className="min-w-0 flex-1 font-ui text-[12px] leading-relaxed whitespace-pre-wrap break-words text-danger">
                {linkify(error)}
              </span>
              <button
                aria-label="Dismiss"
                onClick={() => setError(null)}
                className="shrink-0 rounded p-0.5 text-danger/70 hover:text-danger"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* server toggle */}
          <div className={cardCls}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-ui text-[13px] font-semibold text-ink">Agent server</p>
                <p className="font-ui text-[11.5px] text-ink-3">
                  {running ? status?.primaryUrl ?? 'running' : 'Off — turn on to accept phone connections'}
                </p>
              </div>
              <button
                onClick={() => void toggleServer()}
                disabled={busy === 'server'}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-ui text-[12px] font-semibold disabled:opacity-50 ${
                  running ? 'border border-edge text-ink-2 hover:text-ink' : 'bg-accent text-ink-inverse'
                }`}
              >
                {busy === 'server' && <Loader2 size={12} className="animate-spin" />}
                {running ? 'Turn off' : 'Turn on'}
              </button>
            </div>
            <label className="mt-3 flex items-center gap-2 font-ui text-[12px] text-ink-2">
              <input
                type="checkbox"
                className="accent-(--accent)"
                checked={config?.autoStart ?? false}
                onChange={(e) => void setAutoStart(e.target.checked)}
              />
              Start automatically when TerminalDeck launches
            </label>
            <label className="mt-2 flex items-center gap-2 font-ui text-[12px] text-ink-2">
              <input
                type="checkbox"
                className="accent-(--accent)"
                checked={config?.keepAwake ?? true}
                onChange={(e) => void setKeepAwake(e.target.checked)}
              />
              Keep this PC awake while running
            </label>
            <p className="mt-1 pl-6 font-ui text-[11px] text-ink-3">
              Prevents the PC from sleeping so your phone can always reconnect after you leave. The display can still
              sleep.
            </p>
          </div>

          {/* access passcode — second pairing factor, required for public Funnel */}
          <div className={cardCls}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Lock size={12} className="text-ink-3" />
              <span className={labelCls + ' mb-0'}>Access passcode</span>
              {config?.hasPasscode && (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 font-ui text-[10px] font-semibold text-ok">
                  <Check size={10} /> Set
                </span>
              )}
            </div>
            <p className="mb-2.5 font-ui text-[11.5px] text-ink-3">
              A second secret your phone enters when pairing. Required before you expose the Agent to the public
              internet, and never included in a pairing link — so a shared link alone can’t pair.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={passcodeDraft}
                onChange={(e) => setPasscodeDraft(e.target.value)}
                placeholder={config?.hasPasscode ? 'New passcode…' : 'Set a passcode (min 6 chars)…'}
                autoComplete="new-password"
                className="min-w-0 flex-1 rounded-md border border-edge bg-term px-2.5 py-1.5 font-ui text-[12.5px] text-ink outline-none focus-visible:border-accent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void savePasscode()
                }}
              />
              <button
                onClick={() => void savePasscode()}
                disabled={busy === 'passcode' || passcodeDraft.trim().length < 6}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-ui text-[12px] font-semibold text-ink-inverse disabled:opacity-50"
              >
                {busy === 'passcode' && <Loader2 size={12} className="animate-spin" />}
                {config?.hasPasscode ? 'Change' : 'Set'}
              </button>
              {config?.hasPasscode && (
                <button
                  onClick={() => void clearPasscode()}
                  disabled={busy === 'passcode'}
                  className="rounded-md border border-edge px-2.5 py-1.5 font-ui text-[12px] font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* step 1 — tailscale */}
          <div className={cardCls}>
            <div className="mb-2 flex items-center justify-between">
              <span className={labelCls + ' mb-0'}>Step 1 · Network (Tailscale)</span>
              <button
                onClick={() => void refreshTs()}
                className="rounded p-1 text-ink-3 hover:text-ink"
                title="Re-check Tailscale"
              >
                <RefreshCw size={12} className={busy === 'ts' ? 'animate-spin' : ''} />
              </button>
            </div>
            <TailscaleSteps
              ts={ts}
              busy={busy}
              hasPasscode={config?.hasPasscode ?? false}
              onUp={() => void tailscaleUp()}
              onServe={(en) => void tailscaleServe(en)}
              onFunnel={(en) => void tailscaleFunnel(en)}
            />
          </div>

          {/* step 2 — pair */}
          <div className={cardCls}>
            <span className={labelCls}>Step 2 · Pair your phone</span>
            {pairing ? (
              <div className="flex flex-col items-center gap-3 py-1">
                <QrCode value={qrValue} />
                <p className="text-center font-ui text-[12px] text-ink-2">
                  Scan with your phone camera, or open{' '}
                  <span className="font-mono text-[11px] text-ink">{pairing.url}</span> and enter code
                </p>
                <div className="rounded-lg bg-base px-4 py-2 font-mono text-[22px] font-bold tracking-[0.3em] text-accent">
                  {pairing.code}
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => void copyLink()}
                    className="flex items-center gap-1.5 font-ui text-[11.5px] font-medium text-ink-3 hover:text-ink"
                  >
                    {linkCopied ? <Check size={11} className="text-ok" /> : <Link2 size={11} />}
                    {linkCopied ? 'Link copied' : 'Copy pairing link'}
                  </button>
                  <button
                    onClick={() => void showQr()}
                    className="flex items-center gap-1.5 font-ui text-[11.5px] font-medium text-ink-3 hover:text-ink"
                  >
                    <RefreshCw size={11} /> New code
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => void showQr()}
                disabled={busy === 'pair'}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 font-ui text-[12.5px] font-semibold text-ink-inverse disabled:opacity-50"
              >
                {busy === 'pair' ? <Loader2 size={13} className="animate-spin" /> : <QrIcon size={13} />}
                Show pairing QR
              </button>
            )}
            <p className="mt-2 font-ui text-[11px] text-ink-3">
              {ts?.funnel
                ? 'Published to the internet — your phone needs no app; open the link from anywhere. '
                : 'Over your tailnet, your phone needs the free Tailscale app signed in to the same account. '}
              {config?.hasPasscode ? 'It will also ask for your access passcode. ' : ''}
              Codes expire in 5 minutes.
            </p>
          </div>

          {/* notifications */}
          <div className={cardCls}>
            <span className={labelCls}>Task-complete notifications</span>
            <p className="mb-2.5 font-ui text-[11.5px] text-ink-3">
              When a command runs longer than the threshold, get alerted when it finishes.
            </p>
            <div className="flex items-center gap-2">
              <select
                value={notify?.route ?? 'phone'}
                onChange={(e) => void saveNotify({ route: e.target.value as NotifyRoute })}
                className="min-w-0 flex-1 rounded-md border border-edge bg-term px-2 py-1.5 font-ui text-[12.5px] text-ink outline-none focus-visible:border-accent"
              >
                <option value="off">Off</option>
                <option value="phone">Phone only</option>
                <option value="desktop">Desktop only</option>
                <option value="both">Phone + desktop</option>
              </select>
              <label className="flex shrink-0 items-center gap-1.5 font-ui text-[11.5px] text-ink-3">
                only after
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={notify?.minDurationSec ?? DEFAULT_NOTIFY_CONFIG.minDurationSec}
                  onChange={(e) => void saveNotify({ minDurationSec: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-16 rounded-md border border-edge bg-term px-2 py-1.5 text-center font-ui text-[12.5px] text-ink outline-none focus-visible:border-accent"
                />
                s
              </label>
            </div>
            {(notify?.route === 'phone' || notify?.route === 'both') && (
              <p className="mt-2 font-ui text-[11px] text-ink-3">
                Phone alerts need notifications enabled inside the RemoteDeck app on your phone (tap
                <b className="text-ink-2"> Enable notifications</b> there). On iOS, install it to the home screen first.
              </p>
            )}
          </div>

          {/* paired devices */}
          <div>
            <span className={labelCls}>Paired phones ({devices.length})</span>
            <div className="space-y-1.5">
              {devices.length === 0 && (
                <p className="font-ui text-[12px] text-ink-3">No phones paired yet.</p>
              )}
              {devices.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-2.5 rounded-lg border border-edge-2 bg-base/40 px-3 py-2"
                >
                  <Smartphone size={14} className="shrink-0 text-ink-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-ui text-[12.5px] font-medium text-ink">{d.name}</p>
                    <p className="font-ui text-[10.5px] text-ink-3">
                      paired {relativeTime(d.createdAt, Date.now())} · seen {relativeTime(d.lastSeen, Date.now())}
                    </p>
                  </div>
                  <button
                    onClick={() => void revoke(d.id)}
                    disabled={busy === 'dev-' + d.id}
                    aria-label={`Revoke ${d.name}`}
                    className="rounded p-1.5 text-ink-3 hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* allowed roots */}
          <div>
            <span className={labelCls}>Folders the phone may open</span>
            <div className="space-y-1.5">
              {(config?.allowedRoots ?? []).map((root) => (
                <div
                  key={root}
                  className="flex items-center gap-2 rounded-lg border border-edge-2 bg-base/40 px-3 py-1.5"
                >
                  <FolderOpen size={13} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">{root}</span>
                  <button
                    onClick={() => void removeRoot(root)}
                    aria-label="Remove folder"
                    className="rounded p-1 text-ink-3 hover:text-danger"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => void addRoot()}
                className="flex items-center gap-1 font-ui text-[11.5px] font-medium text-accent hover:underline"
              >
                <Plus size={11} /> Add folder
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Renders text with any http(s) URLs as clickable links (open in the system browser). */
function linkify(text: string): React.ReactNode {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="font-semibold underline underline-offset-2 hover:text-ink"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

function TailscaleSteps({
  ts,
  busy,
  hasPasscode,
  onUp,
  onServe,
  onFunnel
}: {
  ts: TailscaleStatus | null
  busy: string | null
  hasPasscode: boolean
  onUp: () => void
  onServe: (enable: boolean) => void
  onFunnel: (enable: boolean) => void
}): React.JSX.Element {
  if (!ts) return <p className="font-ui text-[12px] text-ink-3">Checking…</p>

  if (!ts.installed) {
    return (
      <div className="font-ui text-[12.5px] text-ink-2">
        Tailscale isn’t installed.{' '}
        <a
          href="https://tailscale.com/download/windows"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-accent hover:underline"
        >
          Download it for Windows
        </a>
        , then re-check.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <StatusRow ok={ts.running} label={ts.running ? 'Connected to your tailnet' : 'Not connected'}>
        {!ts.running && (
          <button
            onClick={onUp}
            disabled={busy === 'ts-up'}
            className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 font-ui text-[11.5px] font-semibold text-ink-inverse disabled:opacity-50"
          >
            {busy === 'ts-up' && <Loader2 size={11} className="animate-spin" />}
            Connect
          </button>
        )}
      </StatusRow>

      {ts.running && !ts.magicDnsEnabled && (
        <p className="rounded-md bg-warn/10 px-2.5 py-1.5 font-ui text-[11px] text-warn">
          Enable <b>MagicDNS</b> + <b>HTTPS Certificates</b> in the Tailscale admin console (DNS page) so the
          phone can load over HTTPS.
        </p>
      )}

      <StatusRow
        ok={ts.serving}
        label={
          ts.funnel
            ? `On your tailnet too (via Funnel): https://${ts.fqdn}`
            : ts.serving
              ? `On your tailnet: https://${ts.fqdn}`
              : 'Publish on your tailnet (HTTPS)'
        }
      >
        {/* Hidden while funnelling: Funnel is a superset of Serve, so a "Stop"
            here would run `serve reset` and tear down Funnel too — a footgun. */}
        {ts.running && !ts.funnel && (
          <button
            onClick={() => onServe(!ts.serving)}
            disabled={busy === 'ts-serve'}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-ui text-[11.5px] font-semibold disabled:opacity-50 ${
              ts.serving ? 'border border-edge text-ink-2' : 'bg-accent text-ink-inverse'
            }`}
          >
            {busy === 'ts-serve' && <Loader2 size={11} className="animate-spin" />}
            {ts.serving ? 'Stop' : 'Publish'}
          </button>
        )}
      </StatusRow>

      <StatusRow
        ok={ts.funnel}
        label={ts.funnel ? 'Reachable from anywhere (Funnel)' : 'Allow access from anywhere (Funnel)'}
      >
        {ts.running &&
          (ts.funnel ? (
            <button
              onClick={() => onFunnel(false)}
              disabled={busy === 'ts-funnel'}
              className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1 font-ui text-[11.5px] font-semibold text-ink-2 disabled:opacity-50"
            >
              {busy === 'ts-funnel' && <Loader2 size={11} className="animate-spin" />}
              Stop
            </button>
          ) : (
            <button
              onClick={() => onFunnel(true)}
              disabled={busy === 'ts-funnel' || !hasPasscode}
              title={hasPasscode ? undefined : 'Set an access passcode first'}
              className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 font-ui text-[11.5px] font-semibold text-ink-inverse disabled:opacity-50"
            >
              {busy === 'ts-funnel' && <Loader2 size={11} className="animate-spin" />}
              <Globe size={11} />
              Publish
            </button>
          ))}
      </StatusRow>

      {ts.running && !ts.funnel && !hasPasscode && (
        <p className="pl-6 font-ui text-[11px] text-ink-3">
          Set an access passcode above to allow public (Funnel) access — your phone then needs no app at all.
        </p>
      )}
      {ts.running && ts.funnel && (
        <p className="rounded-md bg-warn/10 px-2.5 py-1.5 font-ui text-[11px] text-warn">
          Anyone on the internet can reach the sign-in — pairing still needs both a fresh code and your access
          passcode. Stop Funnel when you don’t need remote access.
        </p>
      )}
    </div>
  )
}

function StatusRow({
  ok,
  label,
  children
}: {
  ok: boolean
  label: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          ok ? 'bg-ok text-ink-inverse' : 'border border-edge text-ink-3'
        }`}
      >
        {ok && <Check size={11} />}
      </span>
      <span className="min-w-0 flex-1 truncate font-ui text-[12.5px] text-ink-2">{label}</span>
      {children}
    </div>
  )
}
