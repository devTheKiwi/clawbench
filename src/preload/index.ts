import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AddServerInput,
  BackupCleanupResult,
  BackupListResult,
  BackupReadResult,
  BackupRestoreResult,
  HealthFixResult,
  HealthReport,
  HookEvent,
  InstallWrapperResult,
  MCPGetResult,
  MCPListResult,
  MCPScope,
  MCPSimpleResult,
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
  },
  mcp: {
    list: (): Promise<MCPListResult> => ipcRenderer.invoke('mcp:list'),
    get: (name: string): Promise<MCPGetResult> => ipcRenderer.invoke('mcp:get', name),
    add: (input: AddServerInput): Promise<MCPSimpleResult> =>
      ipcRenderer.invoke('mcp:add', input),
    remove: (name: string, scope?: MCPScope): Promise<MCPSimpleResult> =>
      ipcRenderer.invoke('mcp:remove', name, scope),
    cliPath: (): Promise<{ path: string | null }> => ipcRenderer.invoke('mcp:cliPath')
  },
  health: {
    run: (): Promise<HealthReport> => ipcRenderer.invoke('health:run'),
    fix: (id: string): Promise<HealthFixResult> => ipcRenderer.invoke('health:fix', id)
  },
  backups: {
    list: (): Promise<BackupListResult> => ipcRenderer.invoke('backups:list'),
    read: (file: string): Promise<BackupReadResult> =>
      ipcRenderer.invoke('backups:read', file),
    restore: (file: string): Promise<BackupRestoreResult> =>
      ipcRenderer.invoke('backups:restore', file),
    cleanup: (retention?: number): Promise<BackupCleanupResult> =>
      ipcRenderer.invoke('backups:cleanup', retention)
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
