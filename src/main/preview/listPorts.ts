/**
 * Enumerates listening TCP ports + owning process on Windows for the phone's
 * "what's running" view. WSL2 dev servers show up here via localhost forwarding.
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ListeningPort } from '@shared/types'

const exec = promisify(execFile)

const PS = `Get-NetTCPConnection -State Listen | ForEach-Object {
  $name = (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName
  [PSCustomObject]@{ Address = $_.LocalAddress; Port = $_.LocalPort; Pid = $_.OwningProcess; Name = $name }
} | ConvertTo-Json -Compress`

interface Row {
  Address?: string
  Port?: number
  Pid?: number
  Name?: string
}

export async function listListeningPorts(): Promise<ListeningPort[]> {
  try {
    const { stdout } = await exec(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS],
      { windowsHide: true, timeout: 8000, maxBuffer: 16 * 1024 * 1024 }
    )
    const parsed: unknown = JSON.parse(stdout || '[]')
    const rows: Row[] = Array.isArray(parsed) ? (parsed as Row[]) : [parsed as Row]

    const byPort = new Map<number, ListeningPort>()
    for (const r of rows) {
      const port = Number(r.Port)
      if (!port || byPort.has(port)) continue
      const address = String(r.Address ?? '')
      byPort.set(port, {
        port,
        pid: Number(r.Pid ?? 0),
        process: r.Name ? String(r.Name) : '(unknown)',
        address,
        // WSL relay listens on all interfaces under wslrelay/svchost; rough hint
        wsl: /wslrelay|wslhost/i.test(r.Name ?? '')
      })
    }
    return [...byPort.values()].sort((a, b) => a.port - b.port)
  } catch {
    return []
  }
}
