/**
 * Shell-integration self-test: spawns PowerShell exactly the way the app
 * does (with integration.ps1) and asserts the OSC 133 lifecycle sequences
 * arrive with correct exit codes.
 *
 * Run:  npx electron scripts/integration-selftest.js
 * Exit: 0 = pass, 1 = missing sequences, 2 = timeout
 */
const { app } = require('electron')
const { spawn } = require('node-pty')
const { join } = require('path')

app.whenReady().then(() => {
  const shellPath = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  const script = join(__dirname, '..', 'resources', 'shell-integration', 'integration.ps1')

  const pty = spawn(
    shellPath,
    ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', script],
    {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: process.env.USERPROFILE,
      env: process.env
    }
  )

  let buffer = ''
  pty.onData((d) => {
    buffer += d
  })

  pty.onExit(() => {
    const checks = {
      'A (prompt start)': buffer.includes('\x1b]133;A\x07'),
      'B (input start)': buffer.includes('\x1b]133;B\x07'),
      'C (command start)': buffer.includes('\x1b]133;C\x07'),
      'D;0 (success exit)': buffer.includes('\x1b]133;D;0\x07'),
      'D nonzero (failure exit)': /\x1b\]133;D;[1-9]\d*\x07/.test(buffer),
      'command output present': buffer.includes('qd-integration-ok')
    }
    let pass = true
    for (const [name, ok] of Object.entries(checks)) {
      console.log(`[selftest] ${ok ? 'PASS' : 'FAIL'}  ${name}`)
      if (!ok) pass = false
    }
    app.exit(pass ? 0 : 1)
  })

  // success command, then a failing native command, then exit
  setTimeout(() => pty.write('echo qd-integration-ok\r'), 2500)
  setTimeout(() => pty.write('cmd /c exit 7\r'), 4500)
  setTimeout(() => pty.write('exit\r'), 6500)

  setTimeout(() => {
    console.error('[selftest] TIMEOUT')
    app.exit(2)
  }, 25000)
})
