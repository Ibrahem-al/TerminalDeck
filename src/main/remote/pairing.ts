/**
 * Pairing codes + device-token minting for RemoteDeck.
 *
 * A single short-lived, single-use pairing code is active at a time. The desktop
 * wizard shows it (as text + QR); the phone POSTs it to /api/pair and receives a
 * long-lived random device token. Codes live only in memory.
 */
import { randomBytes } from 'crypto'
import { PAIR_CODE_TTL_MS } from '@shared/types'

// Crockford-ish base32 minus easily-confused glyphs (0/O/1/I/L).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LEN = 8

interface ActiveCode {
  code: string
  expiresAt: number
}

let active: ActiveCode | null = null

/** Uniform pick from ALPHABET via rejection sampling (no modulo bias). */
function genCode(): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  let out = ''
  while (out.length < CODE_LEN) {
    for (const b of randomBytes(CODE_LEN * 2)) {
      if (b < max) {
        out += ALPHABET[b % ALPHABET.length]
        if (out.length === CODE_LEN) break
      }
    }
  }
  return out
}

/** Creates (and replaces) the single active pairing code. */
export function newPairingCode(): ActiveCode {
  active = { code: genCode(), expiresAt: Date.now() + PAIR_CODE_TTL_MS }
  return active
}

export function currentPairingCode(): ActiveCode | null {
  if (active && active.expiresAt > Date.now()) return active
  active = null
  return null
}

export function clearPairingCode(): void {
  active = null
}

/** Consumes the code if valid (single-use, case-insensitive). */
export function consumePairingCode(code: string): boolean {
  const a = active
  if (!a) return false
  if (a.expiresAt <= Date.now()) {
    active = null
    return false
  }
  if (a.code !== code.trim().toUpperCase()) return false
  active = null
  return true
}

/** A fresh 256-bit device token, base64url. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url')
}
