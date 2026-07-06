import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC } from '@shared/types'
import * as fsService from '../fs/fsService'

export function registerFsIpc(): void {
  ipcMain.handle(IPC.FsPickRoot, async (e, defaultPath?: string): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Open Folder',
      properties: ['openDirectory'],
      defaultPath: defaultPath && defaultPath.trim() !== '' ? defaultPath : undefined
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.FsReadDir, (_e, dir: string) => fsService.readDir(dir))
  ipcMain.handle(IPC.FsCreateFile, (_e, path: string) => fsService.createFile(path))
  ipcMain.handle(IPC.FsCreateDir, (_e, path: string) => fsService.createDir(path))
  ipcMain.handle(IPC.FsRename, (_e, oldPath: string, newPath: string) =>
    fsService.rename(oldPath, newPath)
  )
  ipcMain.handle(IPC.FsCopy, (_e, src: string, destDir: string) =>
    fsService.copyEntry(src, destDir)
  )
  ipcMain.handle(IPC.FsMove, (_e, src: string, destDir: string) =>
    fsService.moveEntry(src, destDir)
  )
  ipcMain.handle(IPC.FsDelete, (_e, path: string) => fsService.moveToTrash(path))
  ipcMain.handle(IPC.FsSearch, (_e, root: string, query: string, showHidden: boolean) =>
    fsService.search(root, query, showHidden)
  )

  ipcMain.handle(IPC.FsReadFile, (_e, path: string) => fsService.readFile(path))
  ipcMain.handle(IPC.FsWriteFile, (_e, path: string, content: string) =>
    fsService.writeFile(path, content)
  )

  ipcMain.handle(IPC.FsImportPaths, (_e, destDir: string, srcPaths: string[]) =>
    fsService.importExternalPaths(destDir, srcPaths)
  )
  ipcMain.handle(IPC.FsWriteBlob, (_e, destDir: string, name: string, data: Uint8Array) =>
    fsService.writeIncomingFile(destDir, name, data)
  )
  ipcMain.handle(IPC.FsDownloadUrl, (_e, destDir: string, url: string) =>
    fsService.downloadInto(destDir, url)
  )
  ipcMain.handle(IPC.FsPasteClipboard, (_e, destDir: string) =>
    fsService.pasteClipboardInto(destDir)
  )
  ipcMain.handle(IPC.FsCopyToClipboard, (_e, paths: string[]) => fsService.copyToClipboard(paths))

  ipcMain.on(IPC.FsWatchFile, (e, path: string) => fsService.watchFile(e.sender, path))
  ipcMain.on(IPC.FsUnwatchFile, (e, path: string) => fsService.unwatchFile(e.sender.id, path))

  ipcMain.on(IPC.FsReveal, (_e, path: string) => shell.showItemInFolder(path))

  ipcMain.on(IPC.FsWatch, (e, root: string) => {
    fsService.watchRoot(e.sender, root)
    e.sender.once('destroyed', () => fsService.unwatchRoot(e.sender.id))
  })
  ipcMain.on(IPC.FsUnwatch, (e) => fsService.unwatchRoot(e.sender.id))
}
