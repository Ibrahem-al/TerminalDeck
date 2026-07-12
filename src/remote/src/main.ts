import './ui/styles.css'
import type { RemoteSessionInfo } from '@shared/types'
import { Transport, type ConnState } from './net/Transport'
import { createSession, deleteSession, getPairInfo, listPorts, listSessions, pair } from './net/api'
import { TerminalView } from './terminal/TerminalView'
import { buildKeyBar } from './terminal/KeyBar'
import { isIOS, isStandalone, registerSW } from './pwa/register-sw'
import { disablePush, enablePush, isPushEnabled, pushSupported } from './pwa/push'

const TOKEN_KEY = 'rd_token'

const app = document.getElementById('app') as HTMLElement
let transport: Transport | null = null
let sessions: RemoteSessionInfo[] = []
let activeId: string | null = null
let activeTerm: TerminalView | null = null
let connState: ConnState = 'closed'
let pushOn = false

/* ── boot ──────────────────────────────────────────────────────────── */

registerSW()
const token = localStorage.getItem(TOKEN_KEY)
if (token) startApp(token)
else renderPairing()

/* ── pairing ───────────────────────────────────────────────────────── */

function renderPairing(): void {
  const presetCode = new URLSearchParams(location.search).get('c') ?? ''
  app.innerHTML = ''
  const card = el('div', 'card')
  card.append(
    el('div', 'brand', 'RemoteDeck'),
    el('p', 'muted', 'Pair this phone with your desktop. Open RemoteDeck on the desktop, then scan its QR or enter the code shown.')
  )
  const code = input('Pairing code', 'ABCD2345')
  code.value = presetCode.toUpperCase()
  code.autocapitalize = 'characters'
  code.style.textTransform = 'uppercase'
  const name = input('This device', defaultDeviceName())
  const passcode = input('Access passcode (if one is set)', '')
  passcode.type = 'password'
  passcode.autocapitalize = 'off'
  passcode.autocomplete = 'current-password'
  const err = el('p', 'error')
  const btn = button('Pair', 'primary')

  const submit = async (): Promise<void> => {
    err.textContent = ''
    btn.disabled = true
    btn.textContent = 'Pairing…'
    try {
      const res = await pair(code.value.trim().toUpperCase(), name.value.trim(), passcode.value.trim() || undefined)
      localStorage.setItem(TOKEN_KEY, res.token)
      history.replaceState(null, '', location.pathname)
      startApp(res.token)
    } catch (e) {
      err.textContent = humanError(e)
      btn.disabled = false
      btn.textContent = 'Pair'
    }
  }
  btn.addEventListener('click', () => void submit())
  for (const inputEl of [code, passcode]) {
    inputEl.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void submit()
    })
  }

  card.append(field('Code', code), field('Name', name), field('Passcode', passcode), btn, err)
  if (isIOS() && !isStandalone()) {
    card.append(el('p', 'hint', 'Tip: tap the Share button → "Add to Home Screen" to install RemoteDeck.'))
  }
  app.append(card)

  // Auto-submit a scanned/opened pairing link — but if the desktop requires an
  // access passcode (the link never carries it), don't waste a failed attempt:
  // prompt for the passcode and let the user submit. Falls through to a plain
  // attempt if the probe is unreachable.
  if (presetCode) {
    void (async () => {
      try {
        const info = await getPairInfo()
        if (info.passcodeRequired && passcode.value.trim() === '') {
          err.textContent = 'This desktop needs an access passcode. Enter the one shown on the desktop, then tap Pair.'
          passcode.focus()
          return
        }
      } catch {
        /* probe unreachable — just try to pair */
      }
      void submit()
    })()
  }
}

/* ── app ───────────────────────────────────────────────────────────── */

function startApp(tok: string): void {
  transport = new Transport(tok, {
    onState: (s) => {
      connState = s
      updateStatusDot()
    },
    onSessions: (list) => {
      sessions = list
      if (!activeId) renderList()
    },
    onData: (id, bytes) => {
      if (id === activeId) activeTerm?.write(bytes)
    },
    onExit: (id, codeNum) => {
      if (id === activeId) activeTerm?.write(new TextEncoder().encode(`\r\n\x1b[33m[session ended: code ${codeNum}]\x1b[0m\r\n`))
      void refreshSessions(tok)
    },
    onReset: (id) => {
      if (id === activeId) activeTerm?.reset()
    }
  })
  transport.connect()

  // Reconnect the instant the phone comes back from background / lock / network
  // change. Several of these can fire together on one resume, so debounce.
  let reviveTimer: number | null = null
  const revive = (): void => {
    if (reviveTimer !== null) return
    reviveTimer = window.setTimeout(() => {
      reviveTimer = null
      transport?.reconnectNow()
    }, 150)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revive()
  })
  window.addEventListener('focus', revive)
  window.addEventListener('online', revive)
  window.addEventListener('pageshow', revive)
  document.addEventListener('resume', revive)
  window.visualViewport?.addEventListener('resize', onViewport)

  void refreshSessions(tok)
  void isPushEnabled().then((on) => {
    pushOn = on
    if (!activeId) renderList()
  })
  renderList()
}

async function togglePush(): Promise<void> {
  const tok = localStorage.getItem(TOKEN_KEY)
  if (!tok) return
  try {
    if (pushOn) {
      await disablePush(tok)
      pushOn = false
    } else {
      await enablePush(tok)
      pushOn = true
    }
  } catch (e) {
    console.warn('[remote] notifications toggle failed', e)
  }
  if (!activeId) renderList()
}

async function refreshSessions(tok: string): Promise<void> {
  try {
    sessions = await listSessions(tok)
    if (!activeId) renderList()
  } catch (e) {
    if (e instanceof Error && e.message.includes('unauthorized')) {
      localStorage.removeItem(TOKEN_KEY)
      transport?.close()
      transport = null
      renderPairing()
    }
    /* otherwise the transport list refreshes once connected */
  }
}

function renderList(): void {
  activeId = null
  activeTerm?.dispose()
  activeTerm = null
  app.innerHTML = ''

  const header = el('header', 'bar')
  const dot = el('span', 'dot')
  dot.id = 'status-dot'
  header.append(dot, el('span', 'title', 'Sessions'), spacer())
  if (pushSupported()) {
    const bell = button('\u{1F514}', 'icon')
    bell.style.opacity = pushOn ? '1' : '0.45'
    bell.title = pushOn ? 'Task notifications on — tap to turn off' : 'Enable task notifications'
    bell.addEventListener('click', () => void togglePush())
    header.append(bell)
  }
  const preview = button('\u{1F310}', 'icon')
  preview.title = 'Preview a local server'
  preview.addEventListener('click', () => void renderPorts())
  header.append(preview)
  const add = button('+', 'icon')
  add.title = 'New session'
  add.addEventListener('click', renderNewSession)
  header.append(add)
  app.append(header)
  updateStatusDot()

  const list = el('div', 'list')
  if (sessions.length === 0) {
    list.append(el('p', 'empty', 'No sessions yet. Tap + to start one (run Claude Code or a shell).'))
  }
  for (const s of sessions) {
    const card = el('button', 'session')
    card.append(
      el('span', `sdot ${s.busy ? 'busy' : s.alive ? 'idle' : 'dead'}`),
      (() => {
        const meta = el('span', 'smeta')
        meta.append(el('span', 'sname', s.title || s.shell), el('span', 'scwd', s.cwd))
        return meta
      })()
    )
    card.addEventListener('click', () => openTerminal(s))
    list.append(card)
  }
  app.append(list)
}

function renderNewSession(): void {
  app.innerHTML = ''
  const header = el('header', 'bar')
  const back = button('‹', 'icon')
  back.addEventListener('click', renderList)
  header.append(back, el('span', 'title', 'New session'), spacer())
  app.append(header)

  const card = el('div', 'card')
  const dir = input('Directory (optional — defaults to home)', '')
  dir.autocapitalize = 'off'
  dir.autocomplete = 'off'
  const claude = checkbox('Start Claude Code')
  const err = el('p', 'error')
  const create = button('Create session', 'primary')
  create.addEventListener('click', async () => {
    err.textContent = ''
    create.disabled = true
    try {
      const tok = localStorage.getItem(TOKEN_KEY)!
      const s = await createSession(tok, {
        cwd: dir.value.trim() || undefined,
        command: claude.checked ? 'claude' : undefined
      })
      if (s && s.id) {
        sessions = [...sessions, s]
        openTerminal(s)
      } else {
        // pane is opening on the desktop; it'll arrive via the live session feed
        renderList()
      }
    } catch (e) {
      err.textContent = humanError(e)
      create.disabled = false
    }
  })
  card.append(field('Directory', dir), claude.parentElement as HTMLElement, create, err)
  app.append(card)
}

function renderPorts(): void {
  const tok = localStorage.getItem(TOKEN_KEY)
  if (!tok) return
  app.innerHTML = ''
  const header = el('header', 'bar')
  const back = button('‹', 'icon')
  back.addEventListener('click', renderList)
  const refresh = button('⟳', 'icon')
  refresh.title = 'Refresh'
  header.append(back, el('span', 'title', 'Preview a server'), spacer(), refresh)
  app.append(header)

  const list = el('div', 'list')
  app.append(list)

  const load = async (): Promise<void> => {
    list.innerHTML = ''
    list.append(el('p', 'empty', 'Looking for local servers…'))
    try {
      const ports = await listPorts(tok)
      list.innerHTML = ''
      if (ports.length === 0) {
        list.append(el('p', 'empty', 'No local servers found. Start your dev/test server, then refresh.'))
        return
      }
      list.append(
        el('p', 'empty', 'Tap a server to open it in your browser. Best with dev servers; some HMR may vary.')
      )
      for (const p of ports) {
        const card = el('button', 'session')
        const meta = el('span', 'smeta')
        meta.append(
          el('span', 'sname', `:${p.port}  ${p.process}`),
          el('span', 'scwd', `${p.address}${p.wsl ? ' · wsl' : ''}`)
        )
        card.append(el('span', 'sdot idle'), meta)
        card.addEventListener('click', () => {
          window.open(`/__preview/${p.port}/?__t=${encodeURIComponent(tok)}`, '_blank')
        })
        list.append(card)
      }
    } catch (e) {
      list.innerHTML = ''
      list.append(el('p', 'error', humanError(e)))
    }
  }
  refresh.addEventListener('click', () => void load())
  void load()
}

function openTerminal(session: RemoteSessionInfo): void {
  app.innerHTML = ''
  activeId = session.id

  const header = el('header', 'bar')
  const back = button('‹', 'icon')
  back.addEventListener('click', () => {
    if (transport && activeId) transport.detach(activeId)
    renderList()
  })
  const dot = el('span', 'dot')
  dot.id = 'status-dot'
  header.append(back, dot, el('span', 'title', session.title || session.shell), spacer())
  const end = button('End', 'danger')
  end.addEventListener('click', async () => {
    const tok = localStorage.getItem(TOKEN_KEY)!
    await deleteSession(tok, session.id)
    if (transport && activeId) transport.detach(activeId)
    sessions = sessions.filter((s) => s.id !== session.id)
    renderList()
  })
  header.append(end)
  app.append(header)
  updateStatusDot()

  const termWrap = el('div', 'term')
  app.append(termWrap)

  activeTerm = new TerminalView(termWrap, (data) => {
    if (transport && activeId) transport.input(activeId, data)
  })
  termWrap.addEventListener('touchend', () => activeTerm?.focus(), { passive: true })

  const { cols, rows } = activeTerm.refit()
  transport?.attach(session.id, cols, rows)

  const keybar = buildKeyBar(
    (bytes) => {
      if (transport && activeId) transport.input(activeId, bytes)
      activeTerm?.focus()
    },
    async () => {
      try {
        const text = await navigator.clipboard.readText()
        if (text && transport && activeId) transport.input(activeId, text)
      } catch {
        /* clipboard blocked */
      }
    }
  )
  app.append(keybar)

  requestAnimationFrame(() => {
    const dims = activeTerm?.refit()
    if (dims && transport && activeId) transport.resize(activeId, dims.cols, dims.rows)
    activeTerm?.focus()
  })
}

function onViewport(): void {
  if (window.visualViewport) {
    document.documentElement.style.setProperty('--vh', `${window.visualViewport.height}px`)
  }
  if (activeTerm && transport && activeId) {
    const dims = activeTerm.refit()
    transport.resize(activeId, dims.cols, dims.rows)
  }
}

function updateStatusDot(): void {
  const dot = document.getElementById('status-dot')
  if (dot) dot.className = `dot ${connState}`
}

/* ── tiny DOM helpers ─────────────────────────────────────────────── */

function el(tag: string, cls = '', text = ''): HTMLElement {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text) node.textContent = text
  return node
}
function spacer(): HTMLElement {
  return el('span', 'spacer')
}
function input(placeholder: string, value: string): HTMLInputElement {
  const i = document.createElement('input')
  i.className = 'input'
  i.placeholder = placeholder
  i.value = value
  return i
}
function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', 'field')
  wrap.append(el('span', 'flabel', label), control)
  return wrap
}
function checkbox(label: string): HTMLInputElement {
  const wrap = el('label', 'check')
  const i = document.createElement('input')
  i.type = 'checkbox'
  wrap.append(i, el('span', '', label))
  return i
}
function button(text: string, kind: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = `btn ${kind}`
  b.textContent = text
  return b
}
function defaultDeviceName(): string {
  const ua = navigator.userAgent
  if (/iphone/i.test(ua)) return 'iPhone'
  if (/ipad/i.test(ua)) return 'iPad'
  if (/android/i.test(ua)) return 'Android phone'
  return 'Phone'
}
function humanError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  // The server returns one opaque error for both a wrong code and a wrong
  // passcode (so it can't be used to confirm a passcode guess), so the message
  // has to cover both.
  if (m.includes('pairing_failed'))
    return 'Pairing failed. Check the code and access passcode, or generate a new code on the desktop.'
  if (m.includes('invalid_or_expired')) return 'That code is wrong or expired. Generate a new one on the desktop.'
  if (m.includes('rate_limited')) return 'Too many attempts. Wait a few minutes and try again.'
  if (m.includes('cwd_not_allowed')) return 'That folder is outside the allowed roots.'
  if (m.includes('unauthorized')) return 'This device is no longer paired. Pair again.'
  return m
}
