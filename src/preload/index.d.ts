import { ElectronAPI } from '@electron-toolkit/preload'
import type { ClawbenchAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    clawbench: ClawbenchAPI
  }
}
