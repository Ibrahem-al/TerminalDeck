import { app } from 'electron'
import { join } from 'path'
import type { ShellKind } from '@shared/types'
import { resolveShell } from './shells'

export interface ShellLaunch {
  kind: ShellKind
  path: string
  args: string[]
  /** Whether OSC 133 shell integration is active (enables command blocks). */
  integrated: boolean
}

function scriptsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'shell-integration')
    : join(app.getAppPath(), 'resources', 'shell-integration')
}

export function buildShellLaunch(kind?: ShellKind): ShellLaunch {
  const shell = resolveShell(kind)

  switch (shell.kind) {
    case 'powershell':
    case 'pwsh':
      return {
        kind: shell.kind,
        path: shell.path,
        integrated: true,
        args: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', join(scriptsDir(), 'integration.ps1')]
      }
    case 'gitbash':
      return {
        kind: shell.kind,
        path: shell.path,
        integrated: true,
        // bash on Windows is happier with forward slashes
        args: ['--init-file', join(scriptsDir(), 'integration.bash').replace(/\\/g, '/'), '-i']
      }
    default:
      return { kind: shell.kind, path: shell.path, args: shell.args, integrated: false }
  }
}
