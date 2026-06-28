import {
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileJson2,
  FileLock2,
  FileTerminal,
  FileText,
  FileType2,
  Settings2,
  type LucideIcon
} from 'lucide-react'

interface IconSpec {
  icon: LucideIcon
  /** CSS color — leans on the ANSI palette so themes restyle the tree. */
  color: string
}

const BY_EXT: Record<string, IconSpec> = {
  ts: { icon: FileCode2, color: 'var(--ansi-4)' },
  tsx: { icon: FileCode2, color: 'var(--ansi-4)' },
  js: { icon: FileCode2, color: 'var(--ansi-3)' },
  jsx: { icon: FileCode2, color: 'var(--ansi-3)' },
  mjs: { icon: FileCode2, color: 'var(--ansi-3)' },
  cjs: { icon: FileCode2, color: 'var(--ansi-3)' },
  py: { icon: FileCode2, color: 'var(--ansi-2)' },
  rs: { icon: FileCode2, color: 'var(--ansi-1)' },
  go: { icon: FileCode2, color: 'var(--ansi-6)' },
  c: { icon: FileCode2, color: 'var(--ansi-12)' },
  cpp: { icon: FileCode2, color: 'var(--ansi-12)' },
  cs: { icon: FileCode2, color: 'var(--ansi-5)' },
  java: { icon: FileCode2, color: 'var(--ansi-1)' },
  rb: { icon: FileCode2, color: 'var(--ansi-9)' },
  php: { icon: FileCode2, color: 'var(--ansi-13)' },
  css: { icon: FileType2, color: 'var(--ansi-12)' },
  scss: { icon: FileType2, color: 'var(--ansi-13)' },
  html: { icon: FileCode2, color: 'var(--ansi-9)' },
  vue: { icon: FileCode2, color: 'var(--ansi-10)' },
  svelte: { icon: FileCode2, color: 'var(--ansi-9)' },
  json: { icon: FileJson2, color: 'var(--ansi-11)' },
  jsonc: { icon: FileJson2, color: 'var(--ansi-11)' },
  yaml: { icon: Settings2, color: 'var(--ansi-13)' },
  yml: { icon: Settings2, color: 'var(--ansi-13)' },
  toml: { icon: Settings2, color: 'var(--ansi-13)' },
  md: { icon: FileText, color: 'var(--ansi-12)' },
  txt: { icon: FileText, color: 'var(--ink-3)' },
  pdf: { icon: FileText, color: 'var(--ansi-1)' },
  png: { icon: FileImage, color: 'var(--ansi-5)' },
  jpg: { icon: FileImage, color: 'var(--ansi-5)' },
  jpeg: { icon: FileImage, color: 'var(--ansi-5)' },
  gif: { icon: FileImage, color: 'var(--ansi-5)' },
  svg: { icon: FileImage, color: 'var(--ansi-3)' },
  ico: { icon: FileImage, color: 'var(--ansi-5)' },
  webp: { icon: FileImage, color: 'var(--ansi-5)' },
  zip: { icon: FileArchive, color: 'var(--ansi-3)' },
  rar: { icon: FileArchive, color: 'var(--ansi-3)' },
  '7z': { icon: FileArchive, color: 'var(--ansi-3)' },
  gz: { icon: FileArchive, color: 'var(--ansi-3)' },
  ps1: { icon: FileTerminal, color: 'var(--ansi-4)' },
  sh: { icon: FileTerminal, color: 'var(--ansi-2)' },
  bash: { icon: FileTerminal, color: 'var(--ansi-2)' },
  bat: { icon: FileTerminal, color: 'var(--ansi-2)' },
  cmd: { icon: FileTerminal, color: 'var(--ansi-2)' },
  lock: { icon: FileLock2, color: 'var(--ink-3)' },
  env: { icon: FileLock2, color: 'var(--ansi-3)' }
}

const BY_NAME: Record<string, IconSpec> = {
  'package.json': { icon: FileJson2, color: 'var(--ansi-2)' },
  'tsconfig.json': { icon: FileJson2, color: 'var(--ansi-4)' },
  '.gitignore': { icon: FileLock2, color: 'var(--ink-3)' },
  '.env': { icon: FileLock2, color: 'var(--ansi-3)' },
  readme: { icon: FileText, color: 'var(--accent)' },
  'readme.md': { icon: FileText, color: 'var(--accent)' }
}

export function fileIcon(name: string): IconSpec {
  const lower = name.toLowerCase()
  const byName = BY_NAME[lower]
  if (byName) return byName
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''
  return BY_EXT[ext] ?? { icon: File, color: 'var(--ink-3)' }
}
