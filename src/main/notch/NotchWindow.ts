/**
 * The notch overlay window: a fixed-size transparent always-on-top strip at the
 * top-center of the primary display. All visual states (tiny pill → alert →
 * expanded pulldown) are CSS inside the window — the transparent window's
 * bounds are NEVER resized or animated (repaint artifacts on Windows).
 *
 * Click-through: the window starts with setIgnoreMouseEvents(true) so it's
 * invisible to the mouse; the main-side cursor poll below (pollHover) decides
 * when the pointer is over visible UI and the renderer arms interactivity
 * (NotchSetIgnoreMouse). Shown with showInactive() — it must never steal focus;
 * the first real click gives it focus naturally (and enables blur-to-collapse).
 *
 * NEVER pass {forward: true} here. On Windows Electron implements forwarded
 * mouse messages with SetWindowsHookEx(WH_MOUSE_LL, …, NULL, 0) — a SYSTEM-GLOBAL
 * low-level hook serviced on this process's main thread. Windows then holds every
 * mouse event on the machine until that thread returns (or LowLevelHooksTimeout,
 * 300ms, expires), so any main-thread stall here — a node-pty spawn, a GC pause —
 * becomes desktop-wide input lag in every other application. It also bought us
 * nothing: the forwarded mousemove never fired reliably on Windows, which is why
 * hover is polled instead.
 *
 * This window must stay OUT of every app-window enumeration (session-owner
 * handoff, second-instance focus, phone open-pane, quit-on-last-window) —
 * callers filter with isNotchWindow()/isNotchWebContents().
 */
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { IPC } from '@shared/types'

const BASE_W = 760
const BASE_H = 500

let win: BrowserWindow | null = null
/** Hidden because a TerminalDeck window is focused (showWhenFocused off). */
let hiddenForFocus = false
/** Hidden because the GPU process died (transparent windows render black without it). */
let hiddenForGpu = false
/** Hidden because visibility='events' and nothing wants attention right now. */
let hiddenForEmpty = false
let enabled = false
/** Size multiplier from settings; the window is sized to fit the scaled UI. */
let scale = 1

/** The visible UI's rect within the window (renderer-reported), for hover polling. */
let uiRect: { x: number; y: number; w: number; h: number } | null = null
let hoverTimer: ReturnType<typeof setInterval> | null = null
let hoverInside = false

const winW = (): number => Math.ceil(BASE_W * scale)
const winH = (): number => Math.ceil(BASE_H * scale)

export function notchWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

export function isNotchWindow(w: BrowserWindow): boolean {
  return win !== null && w === win
}

export function isNotchWebContents(wcId: number): boolean {
  const w = notchWindow()
  return w !== null && w.webContents.id === wcId
}

/**
 * True while the user is dealing with the notch — pointer on its visible UI, or
 * it holds the keyboard (they clicked in and may be typing at the mini terminal).
 * Timed auto-dismissals check this so an alert is never yanked mid-read.
 */
export function isNotchEngaged(): boolean {
  const w = notchWindow()
  return w !== null && w.isVisible() && (hoverInside || w.isFocused())
}

function position(): void {
  const w = notchWindow()
  if (!w) return
  // workArea, not bounds: a top-docked taskbar must stay above the notch. On a
  // per-monitor-DPI change the OS can drift a fixed-size window, so the full
  // bounds are reasserted in one call. (Only settings changes alter the size —
  // never state transitions, so the transparent window still never animates.)
  const area = screen.getPrimaryDisplay().workArea
  w.setBounds({
    x: Math.round(area.x + (area.width - winW()) / 2),
    y: area.y,
    width: winW(),
    height: winH()
  })
}

function applyVisibility(): void {
  const w = notchWindow()
  if (!w) return
  if (!enabled || hiddenForFocus || hiddenForGpu || (hiddenForEmpty && !peeking)) {
    if (w.isVisible()) w.hide()
  } else if (!w.isVisible()) {
    w.showInactive()
  }
}

/**
 * Hover detection by polling the OS cursor against the renderer-reported UI
 * rect. This is the ONLY source of hover while the window is click-through —
 * setIgnoreMouseEvents' forwarded mousemove was flaky on Windows (hover simply
 * never fired in practice) and is no longer requested at all, because asking for
 * it costs a system-global mouse hook. The renderer reacts to NotchHover events
 * to grow the pill and arm real clicks; once armed, ordinary DOM hover works.
 *
 * The same poll drives the taskbar-style reveal: while the window is hidden by
 * visibility='autohide', parking the cursor on the top-center screen edge for
 * two ticks peeks the notch back in; it re-hides once the pointer leaves.
 */
let edgeTicks = 0
/** Cursor is parked on the reveal strip while auto-hidden (peek the window in). */
let peeking = false

function pollHover(): void {
  const w = notchWindow()
  if (!w) return
  const pt = screen.getCursorScreenPoint()

  // Auto-hidden: watch the thin reveal strip at the top-center screen edge.
  if (!w.isVisible()) {
    if (!hiddenForEmpty || hiddenForFocus || hiddenForGpu || !enabled) return
    const area = screen.getPrimaryDisplay().workArea
    const stripHalf = Math.ceil(winW() / 2)
    const onEdge =
      pt.y <= area.y + 3 && Math.abs(pt.x - (area.x + area.width / 2)) <= stripHalf
    edgeTicks = onEdge ? edgeTicks + 1 : 0
    if (edgeTicks >= 2) {
      // ~240ms parked on the edge — deliberate, not a fly-by.
      peeking = true
      edgeTicks = 0
      applyVisibility()
    }
    return
  }

  if (uiRect === null) return
  const b = w.getBounds()
  // A generous halo around the visible UI so arming completes while the
  // pointer is still approaching (and hover doesn't flicker at the edge).
  const pad = 14
  const inside =
    pt.x >= b.x + uiRect.x - pad &&
    pt.x <= b.x + uiRect.x + uiRect.w + pad &&
    pt.y >= b.y + uiRect.y &&
    pt.y <= b.y + uiRect.y + uiRect.h + pad
  if (inside !== hoverInside) {
    hoverInside = inside
    sendToNotch(IPC.NotchHover, inside)
  }
  // A peeked notch retracts once the pointer has left it.
  if (peeking && !inside) {
    peeking = false
    applyVisibility()
  }
}

export function setNotchUiRect(rect: { x: number; y: number; w: number; h: number } | null): void {
  uiRect = rect
}

export function setNotchScale(next: number): void {
  const clamped = Math.min(1.5, Math.max(0.85, Number(next) || 1))
  if (clamped === scale) return
  scale = clamped
  position()
}

/** visibility='autohide': keep the window off-screen while nothing needs you
 *  (the hover poll's edge-reveal can still peek it in). */
export function setHiddenForEmpty(hidden: boolean): void {
  if (hidden === hiddenForEmpty) return
  hiddenForEmpty = hidden
  if (!hidden) peeking = false // a real reason to show supersedes the peek
  applyVisibility()
}

export function createNotchWindow(winBuild: number): void {
  if (notchWindow()) {
    enabled = true
    applyVisibility()
    return
  }
  enabled = true
  win = new BrowserWindow({
    width: winW(),
    height: winH(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      additionalArguments: [`--qd-window-role=notch`, `--qd-win-build=${winBuild}`]
    }
  })
  // The level argument only has z-band meaning on macOS (needed to sit beside
  // the physical notch, above the menu bar); Windows has a single TOPMOST band.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(true)
  win.setMenuBarVisibility(false)
  position()

  win.once('ready-to-show', () => applyVisibility())
  win.on('closed', () => {
    win = null
  })
  // A crashed notch renderer can't disarm click-through it had armed — that
  // would leave an invisible topmost window eating clicks at top-center with
  // no visible way to recover (skipTaskbar). Restore pass-through immediately,
  // then reload after a beat (delayed so a boot-crashing page can't hot-loop).
  win.webContents.on('render-process-gone', () => {
    setNotchIgnoreMouse(true)
    setTimeout(() => {
      const w = notchWindow()
      if (w && enabled) w.webContents.reload()
    }, 1200)
  })

  screen.on('display-metrics-changed', position)
  screen.on('display-added', position)
  screen.on('display-removed', position)

  hoverTimer = setInterval(pollHover, 120)

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/notch.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/notch.html'))
  }
}

export function destroyNotchWindow(): void {
  enabled = false
  const w = notchWindow()
  if (!w) return
  screen.removeListener('display-metrics-changed', position)
  screen.removeListener('display-added', position)
  screen.removeListener('display-removed', position)
  if (hoverTimer) clearInterval(hoverTimer)
  hoverTimer = null
  uiRect = null
  hoverInside = false
  peeking = false
  w.destroy()
  win = null
}

/** Arm/disarm click-through. No {forward} — see the header note on WH_MOUSE_LL. */
export function setNotchIgnoreMouse(ignore: boolean): void {
  notchWindow()?.setIgnoreMouseEvents(ignore)
}

export function sendToNotch(channel: string, ...args: unknown[]): void {
  const w = notchWindow()
  if (w) w.webContents.send(channel, ...args)
}

/** showWhenFocused=false: hide while a TerminalDeck app window is focused. */
export function setHiddenForFocus(hidden: boolean): void {
  hiddenForFocus = hidden
  applyVisibility()
}

/** Give the notch keyboard focus (auto-focus for questions). Visible-only —
 *  never yanks a suppressed window back onto the screen. */
export function focusNotch(): void {
  const w = notchWindow()
  if (w && w.isVisible()) w.focus()
}

/** Transparent windows paint an opaque black box without a GPU process — hide
 *  through the crash window and come back once it has respawned. */
export function notchGpuGone(): void {
  hiddenForGpu = true
  applyVisibility()
  setTimeout(() => {
    hiddenForGpu = false
    applyVisibility()
  }, 4000)
}
