import { promises as fs, constants as fsConstants } from 'fs'
import { spawn } from 'child_process'
import { homedir } from 'os'
import { join, isAbsolute } from 'path'
import { ipcMain } from 'electron'
import type {
  HealthCheck,
  HealthFixResult,
  HealthReport,
  HealthStatus,
  HooksConfig,
  Settings
} from '../../shared/types'

const MIN_NODE_MAJOR = 18

type ShellRun = { stdout: string; stderr: string; code: number } | { error: string }

function shellRun(cmd: string, timeoutMs = 10_000): Promise<ShellRun> {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-l', '-c', cmd], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const t = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => {
      clearTimeout(t)
      resolve({ error: err.message })
    })
    child.on('close', (code) => {
      clearTimeout(t)
      if (timedOut) resolve({ error: `Timed out after ${timeoutMs}ms` })
      else resolve({ stdout, stderr, code: code ?? -1 })
    })
  })
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function isWritable(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.W_OK)
    return true
  } catch {
    return false
  }
}

async function checkCliInstalled(): Promise<HealthCheck> {
  const which = await shellRun('command -v claude')
  if ('error' in which || which.code !== 0 || which.stdout.trim().length === 0) {
    return {
      id: 'cli-installed',
      title: 'Claude Code CLI',
      status: 'error',
      detail: 'claude binary not found in PATH.',
      hint: 'Install via npm: npm install -g @anthropic-ai/claude-code'
    }
  }
  const cliPath = which.stdout.trim().split('\n').pop() || ''
  const ver = await shellRun('claude --version')
  if ('error' in ver || ver.code !== 0) {
    return {
      id: 'cli-installed',
      title: 'Claude Code CLI',
      status: 'warn',
      detail: `Found at ${cliPath}, but --version failed.`,
      hint: 'error' in ver ? ver.error : ver.stderr.trim()
    }
  }
  return {
    id: 'cli-installed',
    title: 'Claude Code CLI',
    status: 'ok',
    detail: `${ver.stdout.trim()} (${cliPath})`
  }
}

function checkNodeVersion(): HealthCheck {
  const raw = process.versions.node
  const major = parseInt(raw.split('.')[0], 10)
  if (Number.isNaN(major)) {
    return {
      id: 'node-version',
      title: 'Node.js runtime',
      status: 'unknown',
      detail: `Could not parse Node.js version (${raw}).`
    }
  }
  if (major < MIN_NODE_MAJOR) {
    return {
      id: 'node-version',
      title: 'Node.js runtime',
      status: 'error',
      detail: `Electron is bundling Node ${raw}; Claude Code needs ${MIN_NODE_MAJOR}+.`,
      hint: 'Reinstall clawbench with a newer Electron build.'
    }
  }
  return {
    id: 'node-version',
    title: 'Node.js runtime',
    status: 'ok',
    detail: `Node.js ${raw} (Electron embed)`
  }
}

async function checkClaudeDir(): Promise<HealthCheck> {
  const dir = join(homedir(), '.claude')
  const exists = await pathExists(dir)
  if (!exists) {
    return {
      id: 'claude-dir',
      title: '~/.claude directory',
      status: 'warn',
      detail: `${dir} does not exist yet.`,
      hint: 'Will be created automatically on first save.',
      fixes: [{ id: 'create-claude-dir', label: 'Create directory' }]
    }
  }
  const writable = await isWritable(dir)
  if (!writable) {
    return {
      id: 'claude-dir',
      title: '~/.claude directory',
      status: 'error',
      detail: `${dir} is not writable.`,
      hint: 'Check filesystem permissions.'
    }
  }
  return {
    id: 'claude-dir',
    title: '~/.claude directory',
    status: 'ok',
    detail: dir
  }
}

async function checkSettingsFile(
  id: string,
  title: string,
  path: string
): Promise<HealthCheck> {
  const exists = await pathExists(path)
  if (!exists) {
    return {
      id,
      title,
      status: 'ok',
      detail: `Not present (${path}).`,
      hint: 'Optional. Will be created when you save from the Hooks editor.'
    }
  }
  try {
    const raw = await fs.readFile(path, 'utf8')
    try {
      JSON.parse(raw)
      return {
        id,
        title,
        status: 'ok',
        detail: `Valid JSON (${raw.length} bytes).`
      }
    } catch (err) {
      return {
        id,
        title,
        status: 'error',
        detail: `Invalid JSON in ${path}.`,
        hint: err instanceof Error ? err.message : String(err)
      }
    }
  } catch (err) {
    return {
      id,
      title,
      status: 'error',
      detail: `Could not read ${path}.`,
      hint: err instanceof Error ? err.message : String(err)
    }
  }
}

async function checkClawbenchDir(): Promise<HealthCheck> {
  const dir = join(homedir(), '.clawbench')
  const exists = await pathExists(dir)
  if (!exists) {
    return {
      id: 'clawbench-dir',
      title: '~/.clawbench storage',
      status: 'ok',
      detail: 'Not yet created. Created on first save/backup/log.'
    }
  }
  const writable = await isWritable(dir)
  if (!writable) {
    return {
      id: 'clawbench-dir',
      title: '~/.clawbench storage',
      status: 'error',
      detail: `${dir} is not writable.`,
      hint: 'Check filesystem permissions.'
    }
  }
  return {
    id: 'clawbench-dir',
    title: '~/.clawbench storage',
    status: 'ok',
    detail: dir
  }
}

async function checkMcpServers(): Promise<HealthCheck> {
  const which = await shellRun('command -v claude')
  if ('error' in which || which.code !== 0 || which.stdout.trim().length === 0) {
    return {
      id: 'mcp-health',
      title: 'MCP servers',
      status: 'unknown',
      detail: 'Skipped — claude CLI not available.'
    }
  }
  const r = await shellRun('claude mcp list', 20_000)
  if ('error' in r) {
    return {
      id: 'mcp-health',
      title: 'MCP servers',
      status: 'warn',
      detail: `Could not run claude mcp list: ${r.error}`
    }
  }
  if (r.code !== 0) {
    return {
      id: 'mcp-health',
      title: 'MCP servers',
      status: 'warn',
      detail: r.stderr.trim() || `claude mcp list exited ${r.code}`
    }
  }
  const lines = r.stdout.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  let total = 0
  let connected = 0
  let needsAuth = 0
  let failed = 0
  for (const line of lines) {
    if (line.startsWith('Checking')) continue
    if (!line.includes(':')) continue
    total += 1
    if (line.includes(' - ✓ ')) connected += 1
    else if (line.includes(' - ! ')) needsAuth += 1
    else if (line.includes(' - ✗ ')) failed += 1
  }
  if (total === 0) {
    return {
      id: 'mcp-health',
      title: 'MCP servers',
      status: 'ok',
      detail: 'No MCP servers configured.'
    }
  }
  const status: HealthStatus =
    failed > 0 ? 'error' : needsAuth > 0 ? 'warn' : 'ok'
  const parts = [`${connected}/${total} connected`]
  if (needsAuth > 0) parts.push(`${needsAuth} need auth`)
  if (failed > 0) parts.push(`${failed} failed`)
  return {
    id: 'mcp-health',
    title: 'MCP servers',
    status,
    detail: parts.join(' · ')
  }
}

function firstToken(command: string): string | null {
  const trimmed = command.trim()
  if (trimmed.length === 0) return null
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quote = trimmed[0]
    const end = trimmed.indexOf(quote, 1)
    if (end > 1) return trimmed.slice(1, end)
  }
  return trimmed.split(/\s+/)[0]
}

function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

async function resolveCommand(token: string): Promise<boolean> {
  const expanded = expandHome(token)
  if (isAbsolute(expanded) || expanded.startsWith('./') || expanded.startsWith('../')) {
    try {
      await fs.access(expanded)
      return true
    } catch {
      return false
    }
  }
  const r = await shellRun(`command -v ${JSON.stringify(expanded)}`, 5_000)
  if ('error' in r) return false
  return r.code === 0 && r.stdout.trim().length > 0
}

async function collectHookCommands(): Promise<
  { scope: 'user' | 'local'; event: string; command: string }[]
> {
  const files: { scope: 'user' | 'local'; path: string }[] = [
    { scope: 'user', path: join(homedir(), '.claude', 'settings.json') },
    { scope: 'local', path: join(homedir(), '.claude', 'settings.local.json') }
  ]
  const out: { scope: 'user' | 'local'; event: string; command: string }[] = []
  for (const f of files) {
    try {
      const raw = await fs.readFile(f.path, 'utf8')
      const parsed = JSON.parse(raw) as Settings
      const hooks: HooksConfig = parsed.hooks ?? {}
      for (const [event, groups] of Object.entries(hooks)) {
        if (!groups) continue
        for (const group of groups) {
          for (const h of group.hooks) {
            if (h.command && h.command.trim().length > 0) {
              out.push({ scope: f.scope, event, command: h.command })
            }
          }
        }
      }
    } catch {
      // missing or invalid — covered by other checks
    }
  }
  return out
}

async function checkHookCommands(): Promise<HealthCheck> {
  const commands = await collectHookCommands()
  if (commands.length === 0) {
    return {
      id: 'hook-commands',
      title: 'Hook commands',
      status: 'ok',
      detail: 'No hook commands configured.'
    }
  }
  const missing: string[] = []
  const seen = new Set<string>()
  for (const c of commands) {
    const token = firstToken(c.command)
    if (!token) continue
    const key = `${c.scope}:${token}`
    if (seen.has(key)) continue
    seen.add(key)
    const ok = await resolveCommand(token)
    if (!ok) missing.push(`${c.scope}/${c.event}: ${token}`)
  }
  if (missing.length === 0) {
    return {
      id: 'hook-commands',
      title: 'Hook commands',
      status: 'ok',
      detail: `All ${commands.length} hook command(s) resolve.`
    }
  }
  return {
    id: 'hook-commands',
    title: 'Hook commands',
    status: 'warn',
    detail: `${missing.length} hook command(s) do not resolve.`,
    hint: missing.slice(0, 5).join(' · ') + (missing.length > 5 ? ' …' : '')
  }
}

async function runChecks(): Promise<HealthReport> {
  const claudeDir = join(homedir(), '.claude')
  const checks: HealthCheck[] = []
  checks.push(await checkCliInstalled())
  checks.push(checkNodeVersion())
  checks.push(await checkClaudeDir())
  checks.push(
    await checkSettingsFile(
      'settings-user',
      'settings.json',
      join(claudeDir, 'settings.json')
    )
  )
  checks.push(
    await checkSettingsFile(
      'settings-local',
      'settings.local.json',
      join(claudeDir, 'settings.local.json')
    )
  )
  checks.push(await checkHookCommands())
  checks.push(await checkMcpServers())
  checks.push(await checkClawbenchDir())
  return { generatedAt: new Date().toISOString(), checks }
}

async function applyFix(id: string): Promise<HealthFixResult> {
  switch (id) {
    case 'create-claude-dir': {
      const dir = join(homedir(), '.claude')
      try {
        await fs.mkdir(dir, { recursive: true })
        return { ok: true, message: `Created ${dir}` }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        }
      }
    }
    default:
      return { ok: false, error: `Unknown fix: ${id}` }
  }
}

export function registerHealthIpc(): void {
  ipcMain.handle('health:run', async () => runChecks())
  ipcMain.handle('health:fix', async (_e, id: string) => applyFix(id))
}
