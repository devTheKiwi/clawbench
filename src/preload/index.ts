import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ReadSettingsResult,
  Settings,
  SettingsScope,
  WriteSettingsResult
} from '../shared/types'

const api = {
  settings: {
    read: (scope: SettingsScope): Promise<ReadSettingsResult> =>
      ipcRenderer.invoke('settings:read', scope),
    write: (scope: SettingsScope, next: Settings): Promise<WriteSettingsResult> =>
      ipcRenderer.invoke('settings:write', scope, next)
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
