import { useEffect, useRef, useState } from 'react'

/* ── color math (HSV ⇄ RGB ⇄ hex) ─────────────────────────────────── */

/** h ∈ [0,360), s,v ∈ [0,1] → [r,g,b] each 0–255. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** [r,g,b] 0–255 → [h(0–360), s(0–1), v(0–1)]. */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const hex = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/* ── component ─────────────────────────────────────────────────────── */

interface Props {
  /** Current color as a #rrggbb hex string. */
  value: string
  onChange: (hex: string) => void
  /** Diameter of the wheel in px. */
  size?: number
}

/**
 * An HSV color wheel: hue runs around the ring, saturation from the white
 * center outward, with a brightness slider and hex field beneath. Emits
 * #rrggbb on every change.
 */
export function ColorWheel({ value, onChange, size = 152 }: Props): React.JSX.Element {
  const [r, g, b] = hexToRgb(value) ?? [216, 169, 86]
  const [h, s, v] = rgbToHsv(r, g, b)
  const radius = size / 2

  const wheelRef = useRef<HTMLDivElement>(null)
  const [hexText, setHexText] = useState(value)
  useEffect(() => setHexText(value), [value])

  const pickFromPointer = (clientX: number, clientY: number): void => {
    const el = wheelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = clientX - (rect.left + radius)
    const dy = clientY - (rect.top + radius)
    const sat = Math.min(1, Math.hypot(dx, dy) / radius)
    const hue = (Math.atan2(dx, -dy) * (180 / Math.PI) + 360) % 360
    const [nr, ng, nb] = hsvToRgb(hue, sat, v === 0 ? 1 : v)
    onChange(rgbToHex(nr, ng, nb))
  }

  // thumb sits at angle = hue (clockwise from top), distance = saturation
  const rad = (h * Math.PI) / 180
  const thumbX = radius + Math.sin(rad) * s * radius
  const thumbY = radius - Math.cos(rad) * s * radius

  const setValue = (nv: number): void => {
    const [nr, ng, nb] = hsvToRgb(h, s, nv)
    onChange(rgbToHex(nr, ng, nb))
  }

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div
        ref={wheelRef}
        onPointerDown={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          pickFromPointer(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) pickFromPointer(e.clientX, e.clientY)
        }}
        className="relative shrink-0 cursor-crosshair rounded-full"
        style={{
          width: size,
          height: size,
          background:
            'radial-gradient(circle closest-side, #ffffff, rgba(255,255,255,0)), ' +
            'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
          boxShadow: 'inset 0 0 0 1px var(--edge)'
        }}
        role="slider"
        aria-label="Color wheel"
        aria-valuetext={value}
      >
        {/* brightness darkening */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ backgroundColor: '#000', opacity: 1 - v }}
        />
        {/* selection thumb */}
        <div
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{
            left: thumbX,
            top: thumbY,
            backgroundColor: value,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.45)'
          }}
        />
      </div>

      <label className="flex w-full items-center gap-2">
        <span className="shrink-0 font-ui text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
          Lvl
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(v * 100)}
          onChange={(e) => setValue(Number(e.target.value) / 100)}
          aria-label="Brightness"
          className="h-1.5 w-full cursor-pointer"
          style={{ accentColor: value }}
        />
      </label>

      <div className="flex w-full items-center gap-2">
        <span
          className="h-5 w-5 shrink-0 rounded-md"
          style={{ backgroundColor: value, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.3)' }}
          aria-hidden="true"
        />
        <input
          value={hexText}
          spellCheck={false}
          aria-label="Hex color"
          onChange={(e) => {
            setHexText(e.target.value)
            const rgb = hexToRgb(e.target.value)
            if (rgb) onChange(rgbToHex(...rgb))
          }}
          className="w-full rounded border border-edge bg-term px-2 py-1 font-mono text-[11.5px] tracking-wide text-ink uppercase outline-none focus-visible:border-accent"
        />
      </div>
    </div>
  )
}
