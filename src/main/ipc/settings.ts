import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { randomBytes } from 'crypto'
import { ipcMain } from 'electron'
import type {
  ReadSettingsResult,
  Settings,
  SettingsScope,
  WriteSettingsResult
} from '../../shared/types'

function settingsPathFor(scope: SettingsScope): string {
  const base = join(homedir(), '.claude')
  return scope === 'user'
    ? join(base, 'settings.json')
    : join(base, 'settings.local.json')
}

function backupDir(): string {
  return join(homedir(), '.clawbench', 'backups')
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true })
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function readSettings(scope: SettingsScope): Promise<ReadSettingsResult> {
  const path = settingsPathFor(scope)
  try {
    const exists = await fileExists(path)
    if (!exists) {
      return { ok: true, settings: {}, path, exists: false }
    }
    const raw = await fs.readFile(path, 'utf8')
    const settings = JSON.parse(raw) as Settings
    return { ok: true, settings, path, exists: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      path
    }
  }
}

async function writeSettings(
  scope: SettingsScope,
  next: Settings
): Promise<WriteSettingsResult> {
  const path = settingsPathFor(scope)
  try {
    await ensureDir(dirname(path))
    await ensureDir(backupDir())

    const existing = (await fileExists(path))
      ? await fs.readFile(path, 'utf8')
      : null
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(backupDir(), `${stamp}-${scope}-settings.json`)
    if (existing !== null) {
      await fs.writeFile(backupPath, existing, 'utf8')
    }

    const serialized = JSON.stringify(next, null, 2) + '\n'
    const tmpPath = `${path}.clawbench-${randomBytes(4).toString('hex')}.tmp`
    await fs.writeFile(tmpPath, serialized, 'utf8')
    await fs.rename(tmpPath, path)

    return { ok: true, path, backupPath: existing !== null ? backupPath : '' }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      path
    }
  }
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:read', async (_e, scope: SettingsScope) => {
    return readSettings(scope)
  })
  ipcMain.handle(
    'settings:write',
    async (_e, scope: SettingsScope, next: Settings) => {
      return writeSettings(scope, next)
    }
  )
}
