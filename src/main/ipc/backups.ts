import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { randomBytes } from 'crypto'
import { ipcMain } from 'electron'
import type {
  BackupCleanupResult,
  BackupEntry,
  BackupListResult,
  BackupReadResult,
  BackupRestoreResult,
  SettingsScope
} from '../../shared/types'

const DEFAULT_RETENTION = 40

function backupDir(): string {
  return join(homedir(), '.clawbench', 'backups')
}

function settingsPathFor(scope: SettingsScope): string {
  const base = join(homedir(), '.claude')
  return scope === 'user'
    ? join(base, 'settings.json')
    : join(base, 'settings.local.json')
}

function parseEntry(file: string): BackupEntry | null {
  const match = file.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-(user|local)-settings\.json$/
  )
  if (!match) return null
  return {
    file,
    path: join(backupDir(), file),
    scope: match[2] as SettingsScope,
    timestamp: match[1],
    sizeBytes: 0
  }
}

async function listBackups(): Promise<BackupListResult> {
  const dir = backupDir()
  try {
    await fs.access(dir)
  } catch {
    return { ok: true, entries: [], dir }
  }
  try {
    const files = await fs.readdir(dir)
    const entries: BackupEntry[] = []
    for (const f of files) {
      const parsed = parseEntry(f)
      if (!parsed) continue
      try {
        const stat = await fs.stat(parsed.path)
        parsed.sizeBytes = stat.size
      } catch {
        continue
      }
      entries.push(parsed)
    }
    entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    return { ok: true, entries, dir }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      dir
    }
  }
}

async function readBackup(file: string): Promise<BackupReadResult> {
  const parsed = parseEntry(file)
  if (!parsed) return { ok: false, error: 'Invalid backup file name.' }
  try {
    const content = await fs.readFile(parsed.path, 'utf8')
    return { ok: true, content }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

async function restoreBackup(file: string): Promise<BackupRestoreResult> {
  const parsed = parseEntry(file)
  if (!parsed || parsed.scope === 'unknown') {
    return { ok: false, error: 'Invalid or unrecognized backup file.' }
  }
  const scope = parsed.scope as SettingsScope
  const target = settingsPathFor(scope)
  try {
    const content = await fs.readFile(parsed.path, 'utf8')
    JSON.parse(content)

    await fs.mkdir(dirname(target), { recursive: true })
    await fs.mkdir(backupDir(), { recursive: true })

    let preRestore = ''
    try {
      const existing = await fs.readFile(target, 'utf8')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      preRestore = join(backupDir(), `${stamp}-${scope}-settings.json`)
      await fs.writeFile(preRestore, existing, 'utf8')
    } catch {
      preRestore = ''
    }

    const tmp = `${target}.clawbench-${randomBytes(4).toString('hex')}.tmp`
    await fs.writeFile(tmp, content, 'utf8')
    await fs.rename(tmp, target)
    return { ok: true, restoredPath: target, preRestoreBackup: preRestore }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

async function cleanupBackups(
  retention = DEFAULT_RETENTION
): Promise<BackupCleanupResult> {
  const list = await listBackups()
  if (!list.ok) return { ok: false, error: list.error }
  const byScope: Record<string, BackupEntry[]> = { user: [], local: [] }
  for (const e of list.entries) {
    if (e.scope === 'user' || e.scope === 'local') byScope[e.scope].push(e)
  }
  let removed = 0
  let kept = 0
  for (const scope of ['user', 'local'] as const) {
    const entries = byScope[scope]
    const keep = entries.slice(0, retention)
    const drop = entries.slice(retention)
    kept += keep.length
    for (const d of drop) {
      try {
        await fs.unlink(d.path)
        removed += 1
      } catch {
        // ignore individual failures
      }
    }
  }
  return { ok: true, removed, kept }
}

export function registerBackupsIpc(): void {
  ipcMain.handle('backups:list', async () => listBackups())
  ipcMain.handle('backups:read', async (_e, file: string) => readBackup(file))
  ipcMain.handle('backups:restore', async (_e, file: string) =>
    restoreBackup(file)
  )
  ipcMain.handle('backups:cleanup', async (_e, retention?: number) =>
    cleanupBackups(retention ?? DEFAULT_RETENTION)
  )
}
