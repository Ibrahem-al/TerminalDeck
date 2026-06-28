/**
 * Standalone PTY self-test: proves node-pty loads inside Electron's main
 * process and a full round trip works (spawn → write → read → exit).
 *
 * Run:  npx electron scripts/pty-selftest.js
 * Exit codes: 0 = pass, 1 = output marker never seen, 2 = timeout
 */
const { app } = require('electron')
const { spawn } = require('node-pty')
const { join } = require('path')

const MARKER = 'hello-from-quarterdeck-pty'

app.whenReady().then(() => {
  const shellPath = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )

  console.log('[selftest] spawning', shellPath)
  const pty = spawn(shellPath, ['-NoLogo'], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: process.env.USERPROFILE,
    env: process.env
  })

  let buffer = ''
  pty.onData((data) => {
    buffer += data
  })

  pty.onExit(({ exitCode }) => {
    const sawMarker = buffer.includes(MARKER)
    console.log('[selftest] shell exit code:', exitCode)
    console.log('[selftest] marker echoed back:', sawMarker)
    console.log('[selftest] bytes received:', buffer.length)
    app.exit(sawMarker ? 0 : 1)
  })

  setTimeout(() => pty.write(`echo ${MARKER}\r`), 2000)
  setTimeout(() => pty.write('exit\r'), 4000)

  setTimeout(() => {
    console.error('[selftest] TIMEOUT — shell never exited')
    app.exit(2)
  }, 20000)
})
