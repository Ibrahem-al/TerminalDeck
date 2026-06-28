import { existsSync } from 'fs'
import { join } from 'path'
import type { ShellInfo, ShellKind } from '@shared/types'

const system32 = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32')

const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
const localAppData = process.env['LOCALAPPDATA'] ?? ''

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (p && existsSync(p)) return p
  }
  return null
}

interface ShellCandidate extends ShellInfo {
  args: string[]
}

function detectShells(): ShellCandidate[] {
  const shells: ShellCandidate[] = []

  const powershell = join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  if (existsSync(powershell)) {
    shells.push({ kind: 'powershell', label: 'PowerShell', path: powershell, args: ['-NoLogo'] })
  }

  const pwsh = firstExisting([
    join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    join(localAppData, 'Microsoft', 'PowerShell', '7', 'pwsh.exe')
  ])
  if (pwsh) {
    shells.push({ kind: 'pwsh', label: 'PowerShell 7', path: pwsh, args: ['-NoLogo'] })
  }

  const cmd = join(system32, 'cmd.exe')
  if (existsSync(cmd)) {
    shells.push({ kind: 'cmd', label: 'Command Prompt', path: cmd, args: [] })
  }

  const gitBash = firstExisting([
    join(programFiles, 'Git', 'bin', 'bash.exe'),
    join(programFilesX86, 'Git', 'bin', 'bash.exe'),
    join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe')
  ])
  if (gitBash) {
    shells.push({ kind: 'gitbash', label: 'Git Bash', path: gitBash, args: ['--login', '-i'] })
  }

  return shells
}

let cache: ShellCandidate[] | null = null

export function getAvailableShells(): ShellCandidate[] {
  if (!cache) cache = detectShells()
  return cache
}

/** The system default shell: Windows PowerShell, falling back to whatever exists. */
export function resolveShell(kind?: ShellKind): ShellCandidate {
  const shells = getAvailableShells()
  if (shells.length === 0) {
    throw new Error('No usable shell found on this system')
  }
  const match = kind ? shells.find((s) => s.kind === kind) : shells.find((s) => s.kind === 'powershell')
  return match ?? shells[0]
}
