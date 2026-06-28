import { app, ipcMain } from 'electron'
import { IPC, type AppSettings, type KanbanCard, type Project } from '@shared/types'
import {
  deleteProject,
  listProjects,
  loadKanban,
  loadSession,
  loadSettings,
  saveKanban,
  saveProject,
  saveSession,
  saveSettings
} from '../store/persist'

export function registerProjectsIpc(): void {
  ipcMain.handle(IPC.ProjectsList, (): Project[] => listProjects())
  ipcMain.handle(IPC.ProjectsSave, (_e, project: Project) => saveProject(project))
  ipcMain.handle(IPC.ProjectsDelete, (_e, id: string) => deleteProject(id))

  ipcMain.handle(IPC.KanbanLoad, (): KanbanCard[] => loadKanban())
  ipcMain.handle(IPC.KanbanSave, (_e, cards: KanbanCard[]) => saveKanban(cards))

  ipcMain.handle(IPC.SettingsLoad, (): AppSettings => loadSettings())
  ipcMain.handle(IPC.SettingsSave, (_e, settings: AppSettings) => saveSettings(settings))
  ipcMain.handle(IPC.AppVersion, (): string => app.getVersion())

  ipcMain.handle(IPC.SessionLoad, (): unknown => loadSession())
  // fire-and-forget so beforeunload saves reliably
  ipcMain.on(IPC.SessionSave, (_e, session: unknown) => saveSession(session))
}
