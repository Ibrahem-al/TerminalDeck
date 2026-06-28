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
  type TaskCompletePayload
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

  window: {
    minimize: (): void => ipcRenderer.send(IPC.WindowMinimize),
    maximize: (): void => ipcRenderer.send(IPC.WindowMaximize),
    close: (): void => ipcRenderer.send(IPC.WindowClose),
    onMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
      const listener = (_event: unknown, maximized: boolean): void => callback(maximized)
      ipcRenderer.on(IPC.WindowMaximized, listener)
      return () => {
        ipcRenderer.removeListener(IPC.WindowMaximized, listener)
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
