import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

let diagnosticsConfigured = false

/**
 * (Re)defines the 'quarterdeck' Monaco theme from the live CSS tokens.
 * Called again on every app-theme change — Monaco refreshes all editors.
 */
export function ensureMonacoTheme(base: 'vs' | 'vs-dark' = 'vs-dark'): void {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string): string => s.getPropertyValue(name).trim()
  const bare = (name: string): string => v(name).replace('#', '')

  monaco.editor.defineTheme('quarterdeck', {
    base,
    inherit: true,
    rules: [
      { token: 'comment', foreground: bare('--ansi-8'), fontStyle: 'italic' },
      { token: 'string', foreground: bare('--ansi-2') },
      { token: 'number', foreground: bare('--ansi-3') },
      { token: 'keyword', foreground: bare('--ansi-5') },
      { token: 'type', foreground: bare('--ansi-6') },
      { token: 'class', foreground: bare('--ansi-6') },
      { token: 'interface', foreground: bare('--ansi-6') },
      { token: 'function', foreground: bare('--ansi-12') },
      { token: 'variable', foreground: bare('--term-ink') },
      { token: 'constant', foreground: bare('--ansi-9') },
      { token: 'tag', foreground: bare('--ansi-1') },
      { token: 'attribute.name', foreground: bare('--ansi-3') },
      { token: 'attribute.value', foreground: bare('--ansi-2') },
      { token: 'delimiter', foreground: bare('--ink-2') },
      { token: 'operator', foreground: bare('--ansi-14') },
      { token: 'regexp', foreground: bare('--ansi-9') }
    ],
    colors: {
      'editor.background': v('--term-bg'),
      'editor.foreground': v('--term-ink'),
      'editor.lineHighlightBackground': v('--bg-raised'),
      'editor.selectionBackground': v('--term-selection'),
      'editorCursor.foreground': v('--accent'),
      'editorLineNumber.foreground': v('--ink-3'),
      'editorLineNumber.activeForeground': v('--ink-2'),
      'editorIndentGuide.background1': v('--edge-2'),
      'editorIndentGuide.activeBackground1': v('--edge'),
      'editorWidget.background': v('--bg-overlay'),
      'editorWidget.border': v('--edge'),
      'editorSuggestWidget.background': v('--bg-overlay'),
      'editorSuggestWidget.selectedBackground': v('--bg-raised'),
      'editorHoverWidget.background': v('--bg-overlay'),
      'input.background': v('--term-bg'),
      'input.border': v('--edge'),
      'scrollbarSlider.background': `${v('--edge')}99`,
      'scrollbarSlider.hoverBackground': v('--edge'),
      'minimap.background': v('--term-bg'),
      'editorGutter.background': v('--term-bg'),
      'editorBracketMatch.border': v('--accent'),
      'focusBorder': v('--accent')
    }
  })

  if (diagnosticsConfigured) return
  diagnosticsConfigured = true

  // keep TS service quiet on random project files — this is an editor, not an IDE build.
  // monaco 0.55 removed this from the public types; the runtime API still exists.
  interface TsDefaults {
    setDiagnosticsOptions(o: { noSemanticValidation?: boolean; noSyntaxValidation?: boolean }): void
  }
  const tsLang = (
    monaco.languages as unknown as {
      typescript?: { typescriptDefaults?: TsDefaults; javascriptDefaults?: TsDefaults }
    }
  ).typescript
  const quiet = { noSemanticValidation: true, noSyntaxValidation: false }
  tsLang?.typescriptDefaults?.setDiagnosticsOptions(quiet)
  tsLang?.javascriptDefaults?.setDiagnosticsOptions(quiet)
}

export { monaco }
