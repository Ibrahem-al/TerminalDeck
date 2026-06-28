import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, FileCode2, Map as MapIcon, WrapText, X } from 'lucide-react'
import { monaco, ensureMonacoTheme } from './monacoSetup'
import { acquireModel, keepBuffer, releaseModel, reloadFromDisk, saveModel } from './models'
import { useEditorStore } from '../../store/editor'
import { useSettings } from '../../store/settings'
import { useTheme } from '../../store/theme'
import { themeById } from '../../styles/themes'
import { fileIcon } from '../sidebar/fileIcons'
import { ConfirmDialog } from '../common/ConfirmDialog'

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return i >= 0 ? path.slice(i + 1) : path
}

interface Props {
  paneId: string
}

export function EditorPane({ paneId }: Props): React.JSX.Element {
  const files = useEditorStore((s) => s.filesByPane[paneId]) ?? []
  const active = useEditorStore((s) => s.activeByPane[paneId]) ?? null
  const dirty = useEditorStore((s) => s.dirty)
  const conflict = useEditorStore((s) => s.conflict)
  const closeFile = useEditorStore((s) => s.closeFile)
  const activateFile = useEditorStore((s) => s.activateFile)

  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>())
  const shownPathRef = useRef<string | null>(null)
  const activeRef = useRef<string | null>(null)
  activeRef.current = active

  const [minimap, setMinimap] = useState(() => useSettings.getState().settings.editor.minimap)
  const [wordWrap, setWordWrap] = useState(() => useSettings.getState().settings.editor.wordWrap)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)

  // create the editor once
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    ensureMonacoTheme()
    const es = useSettings.getState().settings.editor
    const editor = monaco.editor.create(host, {
      theme: 'quarterdeck',
      automaticLayout: true,
      fontFamily: '"IBM Plex Mono", Consolas, monospace',
      fontSize: es.fontSize,
      lineHeight: 1.55,
      minimap: { enabled: es.minimap },
      wordWrap: es.wordWrap ? 'on' : 'off',
      scrollBeyondLastLine: false,
      padding: { top: 8 },
      renderLineHighlight: 'all',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      bracketPairColorization: { enabled: true }
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const path = activeRef.current
      if (!path) return
      void (async () => {
        if (useSettings.getState().settings.editor.formatOnSave) {
          try {
            await editor.getAction('editor.action.formatDocument')?.run()
          } catch {
            // no formatter for this language — save as-is
          }
        }
        void saveModel(path)
      })()
    })
    editorRef.current = editor

    return () => {
      editor.dispose()
      editorRef.current = null
      // release every file this pane still holds
      const held = useEditorStore.getState().dropPane(paneId)
      for (const path of held) releaseModel(path)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // swap models when the active file changes
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    if (shownPathRef.current && shownPathRef.current !== active) {
      viewStates.current.set(shownPathRef.current, editor.saveViewState())
    }

    if (!active) {
      editor.setModel(null)
      shownPathRef.current = null
      return
    }

    let cancelled = false
    void acquireModelOnce(active).then((model) => {
      if (cancelled || !editorRef.current || !model) return
      model.updateOptions({ tabSize: useSettings.getState().settings.editor.tabSize })
      editorRef.current.setModel(model)
      const vs = viewStates.current.get(active)
      if (vs) editorRef.current.restoreViewState(vs)
      shownPathRef.current = active
      editorRef.current.focus()
    })
    return () => {
      cancelled = true
    }
  }, [active])

  // acquire each model exactly once per pane membership
  const acquired = useRef(new Set<string>())
  const acquireModelOnce = useCallback(
    async (path: string): Promise<monaco.editor.ITextModel | null> => {
      try {
        if (!acquired.current.has(path)) {
          acquired.current.add(path)
          return await acquireModel(path)
        }
        return await acquireModel(path).then((m) => {
          releaseModel(path) // balance the double acquire
          return m
        })
      } catch {
        acquired.current.delete(path)
        useEditorStore.getState().closeFile(paneId, path)
        return null
      }
    },
    [paneId]
  )

  // re-derive the Monaco theme when the app theme changes
  const themeVersion = useTheme((s) => s.version)
  useEffect(() => {
    const state = useTheme.getState()
    const spec = themeById(state.previewId ?? state.activeId)
    ensureMonacoTheme(spec.kind === 'light' ? 'vs' : 'vs-dark')
  }, [themeVersion])

  // live-apply editor settings
  const editorSettings = useSettings((s) => s.settings.editor)
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.updateOptions({
      fontSize: editorSettings.fontSize,
      wordWrap: editorSettings.wordWrap ? 'on' : 'off',
      minimap: { enabled: editorSettings.minimap }
    })
    editor.getModel()?.updateOptions({ tabSize: editorSettings.tabSize })
    setMinimap(editorSettings.minimap)
    setWordWrap(editorSettings.wordWrap)
  }, [editorSettings])

  const requestClose = (path: string): void => {
    if (dirty[path]) setConfirmClose(path)
    else doClose(path)
  }

  const doClose = (path: string): void => {
    closeFile(paneId, path)
    if (acquired.current.has(path)) {
      acquired.current.delete(path)
      releaseModel(path)
    }
    viewStates.current.delete(path)
  }

  const activeConflict = active !== null && conflict[active] === true

  return (
    <div className="flex h-full flex-col bg-term">
      {files.length > 0 && (
        <div className="flex h-8 shrink-0 items-stretch gap-px overflow-x-auto border-b border-edge-2 bg-base">
          {files.map((path) => {
            const name = baseName(path)
            const spec = fileIcon(name)
            const Icon = spec.icon
            const isActive = path === active
            const isDirty = dirty[path] === true
            return (
              <div
                key={path}
                className={`group flex min-w-0 cursor-default items-center gap-1.5 px-2.5 transition-colors duration-100 ${
                  isActive ? 'bg-term text-ink' : 'bg-base text-ink-3 hover:text-ink-2'
                }`}
                onClick={() => activateFile(paneId, path)}
                onAuxClick={(e) => {
                  if (e.button === 1) requestClose(path)
                }}
                title={path}
              >
                <Icon size={12} className="shrink-0" style={{ color: spec.color }} aria-hidden="true" />
                <span className="truncate font-ui text-[11.5px]">{name}</span>
                <button
                  aria-label={isDirty ? `${name} has unsaved changes — close` : `Close ${name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    requestClose(path)
                  }}
                  className="shrink-0 rounded p-0.5 text-ink-3 hover:text-ink"
                >
                  {isDirty ? (
                    <span className="block group-hover:hidden">
                      <span className="block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                    </span>
                  ) : null}
                  <X size={11} className={isDirty ? 'hidden group-hover:block' : ''} />
                </button>
              </div>
            )
          })}

          <span className="ml-auto flex shrink-0 items-center gap-0.5 pr-1.5">
            <button
              aria-label="Toggle minimap"
              aria-pressed={minimap}
              title="Toggle minimap"
              onClick={() => {
                setMinimap((m) => {
                  editorRef.current?.updateOptions({ minimap: { enabled: !m } })
                  return !m
                })
              }}
              className={`rounded p-1 transition-colors duration-100 ${minimap ? 'text-accent' : 'text-ink-3 hover:text-ink'}`}
            >
              <MapIcon size={12} />
            </button>
            <button
              aria-label="Toggle word wrap"
              aria-pressed={wordWrap}
              title="Toggle word wrap"
              onClick={() => {
                setWordWrap((w) => {
                  editorRef.current?.updateOptions({ wordWrap: w ? 'off' : 'on' })
                  return !w
                })
              }}
              className={`rounded p-1 transition-colors duration-100 ${wordWrap ? 'text-accent' : 'text-ink-3 hover:text-ink'}`}
            >
              <WrapText size={12} />
            </button>
          </span>
        </div>
      )}

      {activeConflict && active && (
        <div className="flex shrink-0 items-center gap-2 border-b border-warn/40 bg-raised px-3 py-1.5">
          <AlertTriangle size={13} className="shrink-0 text-warn" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-ui text-[12px] text-ink-2">
            File changed on disk while you have unsaved edits.
          </span>
          <button
            onClick={() => void reloadFromDisk(active)}
            className="rounded-md border border-edge px-2 py-0.5 font-ui text-[11.5px] font-medium text-ink-2 hover:border-accent hover:text-ink"
          >
            Reload from disk
          </button>
          <button
            onClick={() => keepBuffer(active)}
            className="rounded-md border border-edge px-2 py-0.5 font-ui text-[11.5px] font-medium text-ink-2 hover:text-ink"
          >
            Keep mine
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0" />
        {files.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-term text-center">
            <FileCode2 size={20} className="text-ink-3" aria-hidden="true" />
            <p className="font-ui text-[13px] font-medium text-ink-2">No file open</p>
            <p className="font-ui text-[11.5px] text-ink-3">
              Click a file in the sidebar, or press <kbd className="rounded border border-edge bg-raised px-1 font-mono text-[10.5px]">Ctrl+P</kbd>
            </p>
          </div>
        )}
      </div>

      {confirmClose && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body={`${baseName(confirmClose)} has changes that haven't been saved.`}
          confirmLabel="Discard"
          danger
          onConfirm={() => {
            doClose(confirmClose)
            setConfirmClose(null)
          }}
          onCancel={() => setConfirmClose(null)}
        />
      )}
    </div>
  )
}
