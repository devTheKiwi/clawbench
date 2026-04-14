import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  HookEvent,
  InstallWrapperResult,
  ReadLogsResult,
  ReadSettingsResult,
  Settings,
  SettingsScope,
  TestRunResult,
  WriteSettingsResult
} from '../shared/types'

const api = {
  settings: {
    read: (scope: SettingsScope): Promise<ReadSettingsResult> =>
      ipcRenderer.invoke('settings:read', scope),
    write: (scope: SettingsScope, next: Settings): Promise<WriteSettingsResult> =>
      ipcRenderer.invoke('settings:write', scope, next)
  },
  hooks: {
    test: (command: string, event: HookEvent): Promise<TestRunResult> =>
      ipcRenderer.invoke('hooks:test', command, event),
    readLogs: (maxEntries?: number): Promise<ReadLogsResult> =>
      ipcRenderer.invoke('hooks:logs:read', maxEntries),
    clearLogs: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('hooks:logs:clear'),
    installWrapper: (): Promise<InstallWrapperResult> =>
      ipcRenderer.invoke('hooks:wrapper:install'),
    wrapperPath: (): Promise<{ path: string }> =>
      ipcRenderer.invoke('hooks:wrapper:path')
  }
}

export type ClawbenchAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('clawbench', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.clawbench = api
}
