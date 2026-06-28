/**
 * Confines every phone-driven filesystem operation and new-session cwd to a
 * configurable set of root directories, defeating `..` traversal and symlink
 * escape. Single chokepoint: callers must run paths through ensureAllowedPath.
 */
import { realpathSync } from 'fs'
import { resolve, sep } from 'path'
import { getAllowedRoots } from '../store/persist'

/** Windows paths are case-insensitive; normalize for comparison only. */
function key(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p
}

/** Resolve symlinks where possible; fall back to a plain resolve for paths that
 *  don't exist yet (e.g. a folder about to be created). */
function canonical(p: string): string {
  const abs = resolve(p)
  try {
    return realpathSync(abs)
  } catch {
    return abs
  }
}

export function isInsideRoot(target: string, root: string): boolean {
  const t = key(canonical(target))
  const r = key(canonical(root))
  return t === r || t.startsWith(r.endsWith(sep) ? r : r + sep)
}

/** Returns the resolved path if it sits within an allowed root; else throws. */
export function ensureAllowedPath(target: string): string {
  const resolved = resolve(target)
  for (const root of getAllowedRoots()) {
    if (isInsideRoot(resolved, root)) return resolved
  }
  throw new Error('Path is outside the allowed roots')
}
