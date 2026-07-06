/**
 * Thin wrapper around the Tailscale CLI on Windows, used by the connect-phone
 * wizard to detect state and publish the Agent over HTTPS on the tailnet.
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import type { TailscaleStatus } from '@shared/types'

const exec = promisify(execFile)

const CLI_CANDIDATES = [
  'C:\\Program Files\\Tailscale\\tailscale.exe',
  'C:\\Program Files\\Tailscale IPN\\tailscale.exe'
]

function findCli(): string | null {
  return CLI_CANDIDATES.find((p) => existsSync(p)) ?? null
}

async function run(cli: string, args: string[], timeout = 10_000): Promise<string> {
  const { stdout } = await exec(cli, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 })
  return stdout
}

interface RawStatus {
  BackendState?: string
  Self?: { DNSName?: string; TailscaleIPs?: string[] }
  CurrentTailnet?: { MagicDNSEnabled?: boolean }
}

export async function tailscaleStatus(port: number): Promise<TailscaleStatus> {
  const cli = findCli()
  if (!cli) {
    return {
      installed: false,
      running: false,
      needsLogin: false,
      fqdn: null,
      ipv4: null,
      magicDnsEnabled: false,
      serving: false,
      error: 'Tailscale is not installed'
    }
  }

  try {
    const raw = JSON.parse(await run(cli, ['status', '--json'])) as RawStatus
    const state = raw.BackendState ?? ''
    const dns = raw.Self?.DNSName
    const fqdn = typeof dns === 'string' && dns ? dns.replace(/\.$/, '') : null
    const ipv4 = (raw.Self?.TailscaleIPs ?? []).find((ip) => ip.includes('.')) ?? null

    let serving = false
    try {
      serving = (await run(cli, ['serve', 'status'])).includes(String(port))
    } catch {
      /* `serve status` exits non-zero when nothing is served */
    }

    return {
      installed: true,
      running: state === 'Running',
      needsLogin: state === 'NeedsLogin' || state === 'NoState' || state === 'Stopped',
      fqdn,
      ipv4,
      magicDnsEnabled: raw.CurrentTailnet?.MagicDNSEnabled === true,
      serving
    }
  } catch (e) {
    return {
      installed: true,
      running: false,
      needsLogin: true,
      fqdn: null,
      ipv4: null,
      magicDnsEnabled: false,
      serving: false,
      error: e instanceof Error ? e.message : 'tailscale status failed'
    }
  }
}

/** Brings Tailscale up (opens browser SSO if needed). */
export async function tailscaleUp(): Promise<void> {
  const cli = findCli()
  if (!cli) throw new Error('Tailscale is not installed')
  await run(cli, ['up'], 90_000)
}

/** Publishes (or tears down) https://<fqdn> → http://127.0.0.1:<port> on the tailnet.
 *  Throws an Error whose message is whatever Tailscale reported — which, when the
 *  tailnet's Serve or HTTPS-certificate features aren't enabled yet, includes the
 *  exact admin URL to enable them. The wizard surfaces this to the user. */
export async function tailscaleServe(port: number, enable: boolean): Promise<void> {
  const cli = findCli()
  if (!cli) throw new Error('Tailscale is not installed')

  if (!enable) {
    await run(cli, ['serve', 'reset'], 15_000).catch(() => undefined)
    return
  }

  // `serve` can fail (or stall, then fail) the first time if "Serve" or HTTPS
  // certificates aren't enabled for the tailnet. Capture whatever it reports.
  let reported = ''
  try {
    const r = await exec(cli, ['serve', '--bg', String(port)], {
      windowsHide: true,
      timeout: 25_000,
      maxBuffer: 8 * 1024 * 1024
    })
    reported = `${r.stdout}\n${r.stderr}`.trim()
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; killed?: boolean; message?: string }
    const captured = `${err.stderr ?? ''}\n${err.stdout ?? ''}`.trim()
    if (captured) {
      reported = captured // e.g. "Serve is not enabled on your tailnet. To enable, visit: …"
    } else if (err.killed) {
      throw new Error(
        "Publishing timed out — Tailscale couldn't set up HTTPS. Enable HTTPS Certificates for your tailnet (admin console → DNS), then try again."
      )
    } else {
      throw new Error(err.message ?? 'tailscale serve failed')
    }
  }

  // Confirm it took effect; if the port isn't actually served, surface the report.
  const status = await run(cli, ['serve', 'status']).catch(() => '')
  if (!status.includes(String(port))) {
    throw new Error(
      reported ||
        'Tailscale could not publish. Make sure Serve and HTTPS Certificates are enabled for your tailnet.'
    )
  }
}
