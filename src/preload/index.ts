import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type AgentEvent,
  type AgentPermissionMode,
  type AgentSessionInfo,
  type AgentSpawnOptions,
  type AppSettings,
  type FsEntry,
  type ImportResult,
  type KanbanCard,
  type ListeningPort,
  type NotifyConfig,
  type PairedDevice,
  type PairQrPayload,
  type Project,
  type PtySession,
  type PtySpawnOptions,
  type RemoteConfig,
  type RemoteSessionInfo,
  type RemoteServerStatus,
  type ShellInfo,
  type TailscaleStatus,
  type TaskCompletePayload,
  type UpdateStatusPayload
} from '@shared/types'

const api = {
  platform: process.platform,

  files: {
    /** Absolute filesystem path for a dropped File object. */
    getPathForFile: (file: File): string => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  },

  shell: {
    /** Open an http(s) URL in the OS default app (validated in main). */
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.ShellOpenExternal, url),
    /** Begin a native OS drag of a file/folder (drag a tree item out to Explorer). */
    startDrag: (filePath: string): void => {
      ipcRenderer.send(IPC.ShellStartDrag, filePath)
    }
  },

  window: {
    minimize: (): void => ipcRenderer.send(IPC.WindowMinimize),
    maximize: (): void => ipcRenderer.send(IPC.WindowMaximize),
    close: (): void => ipcRenderer.send(IPC.WindowClose),
    /** Open another independent app window. */
    newWindow: (): void => ipcRenderer.send(IPC.WindowNew),
    /** True for the launch window — only it restores/persists the saved session. */
    isPrimary:
      process.argv.find((a) => a.startsWith('--qd-window-role='))?.split('=')[1] !== 'secondary',
    /** Confirm a pending close (after the user OKs the "close?" prompt). */
    confirmClose: (): void => ipcRenderer.send(IPC.WindowConfirmClose),
    /** Main asks the renderer to confirm before the window actually closes. */
    onCloseRequest: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC.WindowCloseRequest, listener)
      return () => {
        ipcRenderer.removeListener(IPC.WindowCloseRequest, listener)
      }
    },
    /** Main promotes this window to session owner (the primary window closed). */
    onBecomePrimary: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC.WindowSetPrimary, listener)
      return () => {
        ipcRenderer.removeListener(IPC.WindowSetPrimary, listener)
      }
    },
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const listener = (_event: unknown, maximized: boolean): void => callback(maximized)
      ipcRenderer.on(IPC.WindowMaximized, listener)
      return () => {
        ipcRenderer.removeListener(IPC.WindowMaximized, listener)
      }
    }
  },

  updater: {
    /** Current updater state without triggering a check (catch-up for new windows). */
    current: (): Promise<UpdateStatusPayload> => ipcRenderer.invoke(IPC.UpdateGetCurrent),
    /** Trigger an update check; resolves with the latest known status. */
    check: (): Promise<UpdateStatusPayload> => ipcRenderer.invoke(IPC.UpdateCheck),
    /** Download the available update (progress arrives via onStatus). */
    download: (): Promise<void> => ipcRenderer.invoke(IPC.UpdateDownload),
    /** Quit and install a downloaded update. */
    install: (): void => ipcRenderer.send(IPC.UpdateInstall),
    onStatus: (callback: (status: UpdateStatusPayload) => void): (() => void) => {
      const listener = (_e: unknown, status: UpdateStatusPayload): void => callback(status)
      ipcRenderer.on(IPC.UpdateStatus, listener)
      return () => {
        ipcRenderer.removeListener(IPC.UpdateStatus, listener)
      }
    }
  },

  pty: {
    listShells: (): Promise<ShellInfo[]> => ipcRenderer.invoke(IPC.PtyShells),
    create: (options: PtySpawnOptions): Promise<PtySession> => ipcRenderer.invoke(IPC.PtyCreate, options),
    write: (sessionId: string, data: string): void => {
      ipcRenderer.send(IPC.PtyWrite, sessionId, data)
    },
    resize: (sessionId: string, cols: number, rows: number): void => {
      ipcRenderer.send(IPC.PtyResize, sessionId, cols, rows)
    },
    kill: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.PtyKill, sessionId),
    onData: (callback: (sessionId: string, data: string) => void): (() => void) => {
      const listener = (_event: unknown, sessionId: string, data: string): void => callback(sessionId, data)
      ipcRenderer.on(IPC.PtyData, listener)
      return () => {
        ipcRenderer.removeListener(IPC.PtyData, listener)
      }
    },
    onExit: (callback: (sessionId: string, exitCode: number) => void): (() => void) => {
      const listener = (_event: unknown, sessionId: string, exitCode: number): void => callback(sessionId, exitCode)
      ipcRenderer.on(IPC.PtyExit, listener)
      return () => {
        ipcRenderer.removeListener(IPC.PtyExit, listener)
      }
    }
  },

  fs: {
    pickRoot: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.FsPickRoot, defaultPath),
    readDir: (dir: string): Promise<FsEntry[]> => ipcRenderer.invoke(IPC.FsReadDir, dir),
    createFile: (path: string): Promise<void> => ipcRenderer.invoke(IPC.FsCreateFile, path),
    createDir: (path: string): Promise<void> => ipcRenderer.invoke(IPC.FsCreateDir, path),
    rename: (oldPath: string, newPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.FsRename, oldPath, newPath),
    copy: (src: string, destDir: string): Promise<string> =>
      ipcRenderer.invoke(IPC.FsCopy, src, destDir),
    move: (src: string, destDir: string): Promise<string> =>
      ipcRenderer.invoke(IPC.FsMove, src, destDir),
    delete: (path: string): Promise<void> => ipcRenderer.invoke(IPC.FsDelete, path),
    search: (root: string, query: string, showHidden: boolean): Promise<string[]> =>
      ipcRenderer.invoke(IPC.FsSearch, root, query, showHidden),
    reveal: (path: string): void => ipcRenderer.send(IPC.FsReveal, path),
    watch: (root: string): void => ipcRenderer.send(IPC.FsWatch, root),
    unwatch: (): void => ipcRenderer.send(IPC.FsUnwatch),
    readFile: (path: string): Promise<string> => ipcRenderer.invoke(IPC.FsReadFile, path),
    writeFile: (path: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC.FsWriteFile, path, content),
    /** Copy external files/folders (dragged or OS-copied) into a destination folder. */
    importPaths: (destDir: string, srcPaths: string[]): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.FsImportPaths, destDir, srcPaths),
    /** Write raw bytes from a dropped/pasted browser blob into a folder. */
    writeBlob: (destDir: string, name: string, data: Uint8Array): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.FsWriteBlob, destDir, name, data),
    /** Download an http(s) link (dragged from a browser) into a folder. */
    downloadUrl: (destDir: string, url: string): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.FsDownloadUrl, destDir, url),
    /** Paste copied files (or a copied image) from the OS clipboard into a folder. */
    pasteClipboard: (destDir: string): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.FsPasteClipboard, destDir),
    /** Put file/folder paths on the OS clipboard (for pasting into Explorer). */
    copyToClipboard: (paths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.FsCopyToClipboard, paths),
    watchFile: (path: string): void => ipcRenderer.send(IPC.FsWatchFile, path),
    unwatchFile: (path: string): void => ipcRenderer.send(IPC.FsUnwatchFile, path),
    onFileChanged: (callback: (path: string) => void): (() => void) => {
      const listener = (_e: unknown, path: string): void => callback(path)
      ipcRenderer.on(IPC.FsFileChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC.FsFileChanged, listener)
      }
    },
    onChanged: (callback: (dirs: string[]) => void): (() => void) => {
      const listener = (_e: unknown, dirs: string[]): void => callback(dirs)
      ipcRenderer.on(IPC.FsChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC.FsChanged, listener)
      }
    }
  },

  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke(IPC.ProjectsList),
    save: (project: Project): Promise<void> => ipcRenderer.invoke(IPC.ProjectsSave, project),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.ProjectsDelete, id)
  },

  kanban: {
    load: (): Promise<KanbanCard[]> => ipcRenderer.invoke(IPC.KanbanLoad),
    save: (cards: KanbanCard[]): Promise<void> => ipcRenderer.invoke(IPC.KanbanSave, cards)
  },

  settings: {
    load: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SettingsLoad),
    save: (settings: AppSettings): Promise<void> => ipcRenderer.invoke(IPC.SettingsSave, settings)
  },

  app: {
    version: (): Promise<string> => ipcRenderer.invoke(IPC.AppVersion)
  },

  session: {
    load: (): Promise<unknown> => ipcRenderer.invoke(IPC.SessionLoad),
    save: (session: unknown): void => {
      ipcRenderer.send(IPC.SessionSave, session)
    }
  },

  agent: {
    create: (options: AgentSpawnOptions): Promise<AgentSessionInfo> =>
      ipcRenderer.invoke(IPC.AgentCreate, options),
    send: (agentId: string, text: string): void => {
      ipcRenderer.send(IPC.AgentSend, agentId, text)
    },
    interrupt: (agentId: string): void => {
      ipcRenderer.send(IPC.AgentInterrupt, agentId)
    },
    respondPermission: (agentId: string, requestId: string, allow: boolean): void => {
      ipcRenderer.send(IPC.AgentRespondPermission, agentId, requestId, allow)
    },
    setPermissionMode: (agentId: string, mode: AgentPermissionMode): void => {
      ipcRenderer.send(IPC.AgentSetPermissionMode, agentId, mode)
    },
    kill: (agentId: string): Promise<void> => ipcRenderer.invoke(IPC.AgentKill, agentId),
    onEvent: (callback: (agentId: string, event: AgentEvent) => void): (() => void) => {
      const listener = (_e: unknown, agentId: string, event: AgentEvent): void => callback(agentId, event)
      ipcRenderer.on(IPC.AgentEvent, listener)
      return () => {
        ipcRenderer.removeListener(IPC.AgentEvent, listener)
      }
    }
  },

  remote: {
    status: (): Promise<RemoteServerStatus> => ipcRenderer.invoke(IPC.RemoteStatus),
    start: (): Promise<RemoteServerStatus> => ipcRenderer.invoke(IPC.RemoteStart),
    stop: (): Promise<RemoteServerStatus> => ipcRenderer.invoke(IPC.RemoteStop),
    getConfig: (): Promise<RemoteConfig> => ipcRenderer.invoke(IPC.RemoteGetConfig),
    setConfig: (cfg: RemoteConfig): Promise<RemoteConfig> => ipcRenderer.invoke(IPC.RemoteSetConfig, cfg),
    newPairing: (): Promise<PairQrPayload> => ipcRenderer.invoke(IPC.RemotePairingNew),
    listDevices: (): Promise<PairedDevice[]> => ipcRenderer.invoke(IPC.RemoteDevicesList),
    revokeDevice: (id: string): Promise<PairedDevice[]> => ipcRenderer.invoke(IPC.RemoteDeviceRevoke, id),
    tailscale: (): Promise<TailscaleStatus> => ipcRenderer.invoke(IPC.RemoteTailscale),
    tailscaleUp: (): Promise<TailscaleStatus> => ipcRenderer.invoke(IPC.RemoteTailscaleUp),
    tailscaleServe: (enable: boolean): Promise<TailscaleStatus> =>
      ipcRenderer.invoke(IPC.RemoteTailscaleServe, enable),
    tailscaleFunnel: (enable: boolean): Promise<TailscaleStatus> =>
      ipcRenderer.invoke(IPC.RemoteTailscaleFunnel, enable),
    /** Set (or clear, with null) the access passcode; returns the refreshed config. */
    setPasscode: (passcode: string | null): Promise<RemoteConfig> =>
      ipcRenderer.invoke(IPC.RemoteSetPasscode, passcode),
    ports: (): Promise<ListeningPort[]> => ipcRenderer.invoke(IPC.RemotePorts),
    onStatusChanged: (callback: (status: RemoteServerStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: RemoteServerStatus): void => callback(status)
      ipcRenderer.on(IPC.RemoteStatusChanged, listener)
      return () => {
        ipcRenderer.removeListener(IPC.RemoteStatusChanged, listener)
      }
    }
  },

  notify: {
    getConfig: (): Promise<NotifyConfig> => ipcRenderer.invoke(IPC.NotifyGetConfig),
    setConfig: (cfg: NotifyConfig): Promise<NotifyConfig> => ipcRenderer.invoke(IPC.NotifySetConfig, cfg),
    taskComplete: (payload: TaskCompletePayload): void => {
      ipcRenderer.send(IPC.NotifyTaskComplete, payload)
    }
  },

  sessions: {
    /** Report the desktop's open terminal sessions so the phone can mirror them. */
    report: (list: RemoteSessionInfo[]): void => {
      ipcRenderer.send(IPC.SessionsReport, list)
    },
    /** The Agent asks the desktop to open a new terminal pane (phone "New session"). */
    onOpenPane: (callback: (opts: { cwd?: string; command?: string }) => void): (() => void) => {
      const listener = (_e: unknown, opts: { cwd?: string; command?: string }): void => callback(opts)
      ipcRenderer.on(IPC.RemoteOpenPane, listener)
      return () => {
        ipcRenderer.removeListener(IPC.RemoteOpenPane, listener)
      }
    }
  }
}

export type QuarterdeckApi = typeof api

contextBridge.exposeInMainWorld('quarterdeck', api)
