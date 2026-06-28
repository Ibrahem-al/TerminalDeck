/**
 * Quarterdeck themes — all original, designed from scratch.
 * Each theme defines every design token including a full 16-color ANSI
 * palette. Light themes use re-derived dark ANSI colors, never inversions.
 */

export interface ThemeSpec {
  id: string
  name: string
  tagline: string
  kind: 'dark' | 'light'
  /** base, raised, overlay */
  bg: [string, string, string]
  /** primary, secondary, muted, inverse */
  ink: [string, string, string, string]
  accent: string
  danger: string
  dangerEdge: string
  ok: string
  warn: string
  /** edge, edge-2 */
  edge: [string, string]
  term: { bg: string; ink: string; selection: string; blockCmd: string }
  /** exactly 16 entries */
  ansi: string[]
}

export const THEMES: ThemeSpec[] = [
  {
    id: 'deepwater',
    name: 'Deepwater',
    tagline: 'The bridge of a ship at night — ink and brass',
    kind: 'dark',
    bg: ['#0b0f16', '#11161f', '#161d29'],
    ink: ['#e8ecf4', '#9aa4b8', '#5c677c', '#0b0f16'],
    accent: '#d8a956',
    danger: '#ed5d5d',
    dangerEdge: '#4a2025',
    ok: '#4cc38a',
    warn: '#e8b130',
    edge: ['#232b3a', '#1a212e'],
    term: { bg: '#0d121b', ink: '#c7cfdd', selection: '#5b9dd94d', blockCmd: '#131a26' },
    ansi: [
      '#1a212e', '#ed5d5d', '#4cc38a', '#e8b130', '#5b9dd9', '#b583d9', '#4fb8c9', '#c7cfdd',
      '#4a5568', '#f2807f', '#6fd9a8', '#f5c95c', '#82b8e8', '#cca3e8', '#72d0de', '#eff3f9'
    ]
  },
  {
    id: 'midnight-slate',
    name: 'Midnight Slate',
    tagline: 'Deep cool gray, blue undertones, no noise',
    kind: 'dark',
    bg: ['#14161b', '#1a1d23', '#20242c'],
    ink: ['#dfe2e8', '#9aa1ad', '#5f6672', '#14161b'],
    accent: '#7d9bc4',
    danger: '#d96a6a',
    dangerEdge: '#45272b',
    ok: '#6fae8f',
    warn: '#cfa35c',
    edge: ['#2a2e37', '#21242b'],
    term: { bg: '#16191f', ink: '#c3c8d1', selection: '#7d9bc440', blockCmd: '#1d2129' },
    ansi: [
      '#21242b', '#d96a6a', '#6fae8f', '#cfa35c', '#7d9bc4', '#a58fc0', '#6fa8b5', '#c3c8d1',
      '#565d69', '#e28a8a', '#8cc4a8', '#ddb877', '#9bb4d6', '#bba8d4', '#8dc0cc', '#eceef2'
    ]
  },
  {
    id: 'ember',
    name: 'Ember',
    tagline: 'Firelight in a dark room',
    kind: 'dark',
    bg: ['#120e0b', '#1a1410', '#221a14'],
    ink: ['#f0e6dc', '#b3a698', '#6e6358', '#120e0b'],
    accent: '#e8853c',
    danger: '#e25548',
    dangerEdge: '#4a221c',
    ok: '#97b069',
    warn: '#d9c25c',
    edge: ['#322820', '#281f18'],
    term: { bg: '#16110d', ink: '#ddd0c2', selection: '#e8853c33', blockCmd: '#211912' },
    ansi: [
      '#281f18', '#e25548', '#97b069', '#e8a93c', '#7f97bd', '#c97f8e', '#8fb5a3', '#ddd0c2',
      '#5c5147', '#f07b6e', '#b1c987', '#f5c963', '#9fb4d6', '#dfa0ad', '#aacfbd', '#f7efe6'
    ]
  },
  {
    id: 'ghost',
    name: 'Ghost',
    tagline: 'Near-white surfaces, dark text — not a light mode',
    kind: 'light',
    bg: ['#d6d8dc', '#dee0e4', '#e6e8ec'],
    ink: ['#26282c', '#4d5158', '#7d828a', '#f2f3f5'],
    accent: '#50708f',
    danger: '#c04848',
    dangerEdge: '#e3b9b9',
    ok: '#3f8a64',
    warn: '#a8842e',
    edge: ['#b8bcc3', '#c6c9cf'],
    term: { bg: '#cfd2d7', ink: '#2e3138', selection: '#50708f33', blockCmd: '#c5c9d0' },
    ansi: [
      '#c6c9cf', '#b03a3a', '#2f7a52', '#93702a', '#38628c', '#7a4f96', '#2e7585', '#5d626a',
      '#9ba0a8', '#c75050', '#3a9465', '#ab8332', '#4a76a8', '#9166ad', '#3a8a9c', '#353a42'
    ]
  },
  {
    id: 'obsidian-sharp',
    name: 'Obsidian Sharp',
    tagline: 'Pure black, electric accents, maximum contrast',
    kind: 'dark',
    bg: ['#000000', '#0a0a0c', '#121216'],
    ink: ['#f2f2f6', '#9d9da8', '#5a5a66', '#000000'],
    accent: '#ffc940',
    danger: '#ff5c5c',
    dangerEdge: '#531a1a',
    ok: '#2ee68a',
    warn: '#ffaa2b',
    edge: ['#232328', '#19191d'],
    term: { bg: '#050507', ink: '#e6e6ec', selection: '#ffc94038', blockCmd: '#121216' },
    ansi: [
      '#19191d', '#ff5c5c', '#2ee68a', '#ffc940', '#4da6ff', '#d966ff', '#33e0e0', '#e6e6ec',
      '#55555f', '#ff8585', '#66f0aa', '#ffd970', '#80bfff', '#e699ff', '#73eaea', '#ffffff'
    ]
  },
  {
    id: 'daylight',
    name: 'Daylight',
    tagline: 'Clean, bright, built for daytime work',
    kind: 'light',
    bg: ['#ffffff', '#f4f5f7', '#eef0f3'],
    ink: ['#1a1d23', '#495059', '#6e7682', '#ffffff'],
    accent: '#2563c4',
    danger: '#c03434',
    dangerEdge: '#ecc8c8',
    ok: '#1f7a4d',
    warn: '#946800',
    edge: ['#d9dce2', '#e6e8ed'],
    term: { bg: '#f7f8fa', ink: '#23272e', selection: '#2563c42e', blockCmd: '#eceef2' },
    ansi: [
      '#e6e8ed', '#b42c2c', '#1f7a4d', '#946800', '#2563c4', '#7c3fae', '#11718a', '#525a64',
      '#98a0ab', '#d04545', '#2c9663', '#b58211', '#4a82d8', '#9a5fc9', '#2390ad', '#23272e'
    ]
  },
  {
    id: 'parchment',
    name: 'Parchment',
    tagline: 'Warm sepia for long sessions',
    kind: 'light',
    bg: ['#f3ead9', '#ece1cc', '#e4d7bf'],
    ink: ['#3d3122', '#6b5c44', '#93836a', '#f8f3e8'],
    accent: '#9a6a28',
    danger: '#ab4030',
    dangerEdge: '#ddbdb2',
    ok: '#5d7a3a',
    warn: '#8f6c14',
    edge: ['#d4c5a8', '#e0d3ba'],
    term: { bg: '#ede3cf', ink: '#443723', selection: '#9a6a2833', blockCmd: '#e5d9c2' },
    ansi: [
      '#e0d3ba', '#a13a2c', '#586f35', '#8f6c14', '#4a648f', '#7d5183', '#3e7a72', '#5c4f39',
      '#a89878', '#bc5240', '#6d8a44', '#a8851f', '#5f7cab', '#95689c', '#4f928a', '#352b1d'
    ]
  },
  {
    id: 'verdigris',
    name: 'Verdigris',
    tagline: 'Sea-green patina on old ship bronze',
    kind: 'dark',
    bg: ['#101614', '#16201c', '#1c2a24'],
    ink: ['#dcebe2', '#94a89d', '#5b6f64', '#101614'],
    accent: '#46c79c',
    danger: '#d95f50',
    dangerEdge: '#44251f',
    ok: '#7fcf6a',
    warn: '#cfa33c',
    edge: ['#27362f', '#1e2b25'],
    term: { bg: '#131b17', ink: '#c2d4c9', selection: '#46c79c33', blockCmd: '#19251f' },
    ansi: [
      '#1e2b25', '#d95f50', '#5fbf7f', '#cfa33c', '#5e9eb8', '#a07fb8', '#46c79c', '#c2d4c9',
      '#4d6055', '#e88172', '#82d49e', '#ddb968', '#82b8cc', '#b89cce', '#6fd9b8', '#ecf5ef'
    ]
  },
  {
    id: 'abyssal',
    name: 'Abyssal',
    tagline: 'Hadal black-blue lit by bioluminescence',
    kind: 'dark',
    bg: ['#05070d', '#0a0e18', '#101627'],
    ink: ['#d8e4f2', '#8295b3', '#4a5876', '#05070d'],
    accent: '#2de0d2',
    danger: '#ff4f7d',
    dangerEdge: '#461a2c',
    ok: '#41e0a3',
    warn: '#e0c23e',
    edge: ['#1b2440', '#131a2e'],
    term: { bg: '#070b14', ink: '#b8c8de', selection: '#2de0d233', blockCmd: '#0e1424' },
    ansi: [
      '#131a2e', '#ff4f7d', '#41e0a3', '#e0c23e', '#4f8fff', '#c258ff', '#2de0d2', '#b8c8de',
      '#3c4a68', '#ff7d9e', '#74ecbf', '#ecd470', '#82b0ff', '#d68aff', '#6eeae0', '#e8f0fa'
    ]
  }
]

export function themeById(id: string): ThemeSpec {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** Flattens a theme into its CSS custom-property map. */
export function cssTokens(t: ThemeSpec): Record<string, string> {
  const tokens: Record<string, string> = {
    '--bg-base': t.bg[0],
    '--bg-raised': t.bg[1],
    '--bg-overlay': t.bg[2],
    '--ink': t.ink[0],
    '--ink-2': t.ink[1],
    '--ink-3': t.ink[2],
    '--ink-inverse': t.ink[3],
    '--accent': t.accent,
    '--accent-soft': `${t.accent}26`,
    '--danger': t.danger,
    '--danger-soft': `${t.danger}1f`,
    '--danger-edge': t.dangerEdge,
    '--ok': t.ok,
    '--ok-soft': `${t.ok}1f`,
    '--warn': t.warn,
    '--edge': t.edge[0],
    '--edge-2': t.edge[1],
    '--term-bg': t.term.bg,
    '--term-ink': t.term.ink,
    '--term-selection': t.term.selection,
    '--block-cmd-bg': t.term.blockCmd
  }
  t.ansi.forEach((color, i) => {
    tokens[`--ansi-${i}`] = color
  })
  return tokens
}
