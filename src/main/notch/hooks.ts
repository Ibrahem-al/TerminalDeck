/**
 * Installs / removes the TerminalDeck notch hook in the user's global Claude
 * Code settings (~/.claude/settings.json), with explicit in-app consent.
 *
 * The hook entries all point at the env-gated wrapper script (hookServer.ts),
 * so `claude` outside TerminalDeck is unaffected. Claude Code snapshots hook
 * config at session start — the Settings UI tells the user that already-running
 * claude sessions must be restarted before hooks fire.
 *
 * Safety rules for a file we don't own:
 * - settings.json is also written by Claude Code and hand-edited by users, so a
 *   read failure other than "doesn't exist" ABORTS install/uninstall — we must
 *   never rename our reconstruction over config we couldn't read.
 * - Writes are read-modify-write against a fresh read, land atomically
 *   (tmp + rename), and target the REAL file so a dotfiles symlink survives.
 * - Unrecognized shapes (a non-array hooks event from a hand edit) are passed
 *   through untouched wherever possible.
 */
import { homedir } from 'os'
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { randomBytes } from 'crypto'
import type { NotchHooksStatus } from '@shared/types'
import { hookScriptPath } from './hookServer'

/** Substring that identifies our entries — uninstall filters on it. */
const HOOK_MARK = 'notch-hook'
/** SessionStart tracks coverage, Notification/Stop carry the actual signals. */
const HOOK_EVENTS = ['SessionStart', 'Notification', 'Stop', 'SessionEnd'] as const

interface HookCommand {
  type: string
  command: string
  timeout?: number
  [k: string]: unknown
}
interface HookGroup {
  matcher?: string
  hooks?: HookCommand[]
  [k: string]: unknown
}
type ClaudeSettings = Record<string, unknown> & { hooks?: Record<string, unknown> }

type ReadResult = { ok: true; settings: ClaudeSettings } | { ok: false; error: string }

export function claudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json')
}

/** Missing file → fresh start; anything else unreadable/unparseable → refuse,
 *  so a malformed settings.json can never be silently replaced. */
function readClaudeSettings(): ReadResult {
  let raw: string
  try {
    raw = readFileSync(claudeSettingsPath(), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return { ok: true, settings: {} }
    return { ok: false, error: `cannot read the file (${e instanceof Error ? e.message : String(e)})` }
  }
  try {
    // Strip a UTF-8 BOM (Windows editors add them; strict JSON.parse rejects them).
    const parsed = JSON.parse(raw.replace(/^﻿/, '')) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'the file is not a JSON object' }
    }
    return { ok: true, settings: parsed as ClaudeSettings }
  } catch {
    return { ok: false, error: 'the file is not valid JSON — fix or remove it, then retry' }
  }
}

/** Where the write must land: through a symlink to its real target (so a
 *  dotfiles-managed settings.json keeps being a symlink), same volume as tmp. */
function resolveWriteTarget(): string {
  const path = claudeSettingsPath()
  try {
    return realpathSync(path)
  } catch {
    try {
      return join(realpathSync(dirname(path)), basename(path))
    } catch {
      mkdirSync(dirname(path), { recursive: true })
      return path
    }
  }
}

function writeClaudeSettings(settings: ClaudeSettings): void {
  const target = resolveWriteTarget()
  const tmp = join(dirname(target), `.${basename(target)}.${randomBytes(4).toString('hex')}.tmp`)
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf8')
  renameSync(tmp, target)
}

/** A hooks event value from disk, tolerating hand-edited shapes. */
function eventGroups(hooks: Record<string, unknown> | undefined, ev: string): HookGroup[] {
  const value = hooks?.[ev]
  if (!Array.isArray(value)) return []
  return value.filter((g): g is HookGroup => g !== null && typeof g === 'object')
}

function groupIsOurs(group: HookGroup): boolean {
  const cmds = Array.isArray(group.hooks) ? group.hooks : []
  return cmds.some((h) => typeof h?.command === 'string' && h.command.includes(HOOK_MARK))
}

function statusOf(read: ReadResult): NotchHooksStatus {
  if (!read.ok) return { installed: false, settingsPath: claudeSettingsPath(), error: read.error }
  const installed = HOOK_EVENTS.some((ev) => eventGroups(read.settings.hooks, ev).some(groupIsOurs))
  return { installed, settingsPath: claudeSettingsPath() }
}

export function hooksStatus(): NotchHooksStatus {
  return statusOf(readClaudeSettings())
}

export function installHooks(): NotchHooksStatus {
  const read = readClaudeSettings()
  if (!read.ok) return statusOf(read)
  try {
    const settings = read.settings
    const hooks: Record<string, unknown> = { ...(settings.hooks ?? {}) }
    // Quoted — the userData path contains spaces on most Windows machines. No
    // matcher field: matchers apply to tool events, not lifecycle events.
    const entry: HookGroup = { hooks: [{ type: 'command', command: `"${hookScriptPath()}"`, timeout: 10 }] }
    for (const ev of HOOK_EVENTS) {
      const existing = hooks[ev]
      // A defined non-array value is a hand-edit we can't merge into — leave
      // that event alone rather than destroy it (partial coverage beats loss).
      if (existing !== undefined && !Array.isArray(existing)) continue
      hooks[ev] = [...eventGroups(hooks, ev).filter((g) => !groupIsOurs(g)), entry]
    }
    writeClaudeSettings({ ...settings, hooks })
    return hooksStatus()
  } catch (e) {
    return {
      installed: false,
      settingsPath: claudeSettingsPath(),
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export function uninstallHooks(): NotchHooksStatus {
  const read = readClaudeSettings()
  if (!read.ok) return statusOf(read)
  try {
    const settings = read.settings
    if (!settings.hooks) return statusOf(read)
    const hooks: Record<string, unknown> = {}
    for (const [ev, value] of Object.entries(settings.hooks)) {
      if (!Array.isArray(value)) {
        hooks[ev] = value // unknown shape — pass through untouched
        continue
      }
      const kept = value.filter((g) => !(g !== null && typeof g === 'object' && groupIsOurs(g as HookGroup)))
      if (kept.length > 0) hooks[ev] = kept
    }
    writeClaudeSettings({ ...settings, hooks })
    return hooksStatus()
  } catch (e) {
    return {
      installed: false,
      settingsPath: claudeSettingsPath(),
      error: e instanceof Error ? e.message : String(e)
    }
  }
}
