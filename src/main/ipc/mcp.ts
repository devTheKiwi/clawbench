import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { ipcMain } from 'electron'
import type {
  AddServerInput,
  DisabledListResult,
  DisabledMCPEntry,
  MCPGetResult,
  MCPListResult,
  MCPScope,
  MCPServer,
  MCPSimpleResult,
  MCPStatus,
  MCPTransport
} from '../../shared/types'

let cliPathCache: string | null = null
let cliPathResolved = false

function resolveCliPath(): Promise<string | null> {
  if (cliPathResolved) return Promise.resolve(cliPathCache)
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-l', '-c', 'command -v claude'], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.on('close', () => {
      const p = out.trim().split('\n').pop() || ''
      cliPathCache = p.length > 0 ? p : null
      cliPathResolved = true
      resolve(cliPathCache)
    })
    child.on('error', () => {
      cliPathCache = null
      cliPathResolved = true
      resolve(null)
    })
  })
}

type RunResult = { ok: true; stdout: string; stderr: string; code: number } | { ok: false; error: string }

function runCli(args: string[], timeoutMs = 20_000): Promise<RunResult> {
  return new Promise(async (resolve) => {
    const cli = await resolveCliPath()
    if (!cli) {
      resolve({ ok: false, error: 'claude CLI not found in PATH. Install Claude Code first.' })
      return
    }
    const child = spawn(cli, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
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
      resolve({ ok: false, error: err.message })
    })
    child.on('close', (code) => {
      clearTimeout(t)
      if (timedOut) {
        resolve({ ok: false, error: `Timed out after ${timeoutMs}ms` })
      } else {
        resolve({ ok: true, stdout, stderr, code: code ?? -1 })
      }
    })
  })
}

function classifyStatus(icon: string, text: string): { status: MCPStatus; detail?: string } {
  const t = text.trim()
  if (icon === '✓') return { status: 'connected', detail: t || 'Connected' }
  if (icon === '!') return { status: 'needs-auth', detail: t || 'Needs authentication' }
  if (icon === '✗') return { status: 'failed', detail: t || 'Failed' }
  return { status: 'unknown', detail: t }
}

function inferTransport(endpoint: string): MCPTransport {
  const e = endpoint.trim()
  if (/^https?:\/\//i.test(e)) return 'http'
  if (e.length === 0) return 'unknown'
  return 'stdio'
}

function parseListOutput(raw: string): MCPServer[] {
  const lines = raw.split('\n')
  const servers: MCPServer[] = []
  const iconRe = /\s-\s([✓!✗])\s+(.*)$/
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.length === 0) continue
    if (line.startsWith('Checking')) continue
    const colonIdx = line.indexOf(':')
    if (colonIdx < 0) continue
    const name = line.slice(0, colonIdx).trim()
    const rest = line.slice(colonIdx + 1).trim()
    if (name.length === 0 || rest.length === 0) continue
    const m = rest.match(iconRe)
    let endpoint = rest
    let status: MCPStatus = 'unknown'
    let detail: string | undefined
    if (m) {
      endpoint = rest.slice(0, m.index).trim()
      const cls = classifyStatus(m[1], m[2])
      status = cls.status
      detail = cls.detail
    }
    servers.push({
      name,
      endpoint,
      status,
      statusDetail: detail,
      transport: inferTransport(endpoint)
    })
  }
  return servers
}

async function listServers(): Promise<MCPListResult> {
  const cli = await resolveCliPath()
  if (!cli) {
    return { ok: false, error: 'claude CLI not found in PATH. Install Claude Code first.' }
  }
  const r = await runCli(['mcp', 'list'], 20_000)
  if (!r.ok) return { ok: false, error: r.error, cliPath: cli }
  if (r.code !== 0) {
    return {
      ok: false,
      error: r.stderr.trim() || `claude mcp list exited with code ${r.code}`,
      cliPath: cli
    }
  }
  return { ok: true, servers: parseListOutput(r.stdout), cliPath: cli }
}

async function getServer(name: string): Promise<MCPGetResult> {
  const r = await runCli(['mcp', 'get', name], 10_000)
  if (!r.ok) return { ok: false, error: r.error }
  if (r.code !== 0) {
    return { ok: false, error: r.stderr.trim() || `claude mcp get exited with code ${r.code}` }
  }
  return { ok: true, name, raw: r.stdout.trim() }
}

function validName(name: string): boolean {
  return /^[A-Za-z0-9_.-]{1,64}$/.test(name)
}

function validScope(scope?: MCPScope): boolean {
  return !scope || scope === 'user' || scope === 'project' || scope === 'local'
}

async function addServer(input: AddServerInput): Promise<MCPSimpleResult> {
  if (!validName(input.name)) {
    return { ok: false, error: 'Invalid server name. Use letters, digits, dot, dash, underscore.' }
  }
  if (!validScope(input.scope)) {
    return { ok: false, error: 'Invalid scope.' }
  }
  const scopeArgs = input.scope ? ['-s', input.scope] : []
  if (input.kind === 'stdio') {
    if (!input.command.trim()) return { ok: false, error: 'Command is required for stdio.' }
    const envArgs: string[] = []
    if (input.env) {
      for (const [k, v] of Object.entries(input.env)) {
        if (!k.trim()) continue
        envArgs.push('-e', `${k}=${v}`)
      }
    }
    const args = [
      'mcp',
      'add',
      ...scopeArgs,
      ...envArgs,
      input.name,
      '--',
      input.command,
      ...(input.args ?? [])
    ]
    const r = await runCli(args, 30_000)
    if (!r.ok) return { ok: false, error: r.error }
    if (r.code !== 0) {
      return { ok: false, error: r.stderr.trim() || r.stdout.trim() || `exit ${r.code}` }
    }
    return { ok: true }
  }
  if (!input.url.trim()) return { ok: false, error: 'URL is required.' }
  const headerArgs: string[] = []
  if (input.headers) {
    for (const [k, v] of Object.entries(input.headers)) {
      if (!k.trim()) continue
      headerArgs.push('-H', `${k}: ${v}`)
    }
  }
  const args = [
    'mcp',
    'add',
    ...scopeArgs,
    '--transport',
    input.kind,
    ...headerArgs,
    input.name,
    input.url
  ]
  const r = await runCli(args, 30_000)
  if (!r.ok) return { ok: false, error: r.error }
  if (r.code !== 0) {
    return { ok: false, error: r.stderr.trim() || r.stdout.trim() || `exit ${r.code}` }
  }
  return { ok: true }
}

async function removeServer(name: string, scope?: MCPScope): Promise<MCPSimpleResult> {
  if (!validName(name)) return { ok: false, error: 'Invalid server name.' }
  if (!validScope(scope)) return { ok: false, error: 'Invalid scope.' }
  const args = ['mcp', 'remove', name, ...(scope ? ['-s', scope] : [])]
  const r = await runCli(args, 15_000)
  if (!r.ok) return { ok: false, error: r.error }
  if (r.code !== 0) {
    return { ok: false, error: r.stderr.trim() || r.stdout.trim() || `exit ${r.code}` }
  }
  return { ok: true }
}

function disabledPath(): string {
  return join(homedir(), '.clawbench', 'mcp-disabled.json')
}

async function readDisabled(): Promise<DisabledMCPEntry[]> {
  try {
    const raw = await fs.readFile(disabledPath(), 'utf8')
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data as DisabledMCPEntry[]
  } catch {
    return []
  }
}

async function writeDisabled(entries: DisabledMCPEntry[]): Promise<void> {
  const path = disabledPath()
  await fs.mkdir(join(homedir(), '.clawbench'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(entries, null, 2) + '\n', 'utf8')
}

function parseScopeLine(raw: string): MCPScope | null {
  const s = raw.toLowerCase()
  if (s.includes('user config')) return 'user'
  if (s.includes('project config')) return 'project'
  if (s.includes('local config')) return 'local'
  return null
}

function parseGetOutput(
  name: string,
  raw: string
):
  | { ok: true; entry: DisabledMCPEntry }
  | { ok: false; error: string } {
  const lines = raw.split('\n')
  let scope: MCPScope | null = null
  let type: 'stdio' | 'http' | 'sse' | null = null
  let command = ''
  let argsStr = ''
  let url = ''
  const env: Record<string, string> = {}
  const headers: Record<string, string> = {}
  let section: 'env' | 'headers' | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue

    const m = /^([A-Za-z ]+):\s*(.*)$/.exec(trimmed)
    if (m) {
      const key = m[1].trim().toLowerCase()
      const val = m[2].trim()
      section = null
      switch (key) {
        case 'scope':
          scope = parseScopeLine(val)
          break
        case 'type': {
          const v = val.toLowerCase()
          if (v === 'stdio' || v === 'http' || v === 'sse') type = v
          break
        }
        case 'command':
          command = val
          break
        case 'args':
          argsStr = val
          break
        case 'url':
          url = val
          break
        case 'environment':
          section = 'env'
          if (val) {
            const kv = val.split('=')
            if (kv.length >= 2) env[kv[0]] = kv.slice(1).join('=')
          }
          break
        case 'headers':
          section = 'headers'
          if (val) {
            const [hk, ...rest] = val.split(':')
            if (hk && rest.length > 0) headers[hk.trim()] = rest.join(':').trim()
          }
          break
        default:
          break
      }
      continue
    }
    if (section === 'env') {
      const kv = trimmed.split('=')
      if (kv.length >= 2) env[kv[0]] = kv.slice(1).join('=')
    } else if (section === 'headers') {
      const [hk, ...rest] = trimmed.split(':')
      if (hk && rest.length > 0) headers[hk.trim()] = rest.join(':').trim()
    }
  }

  if (!scope) return { ok: false, error: 'Could not determine server scope.' }
  if (!type) return { ok: false, error: 'Could not determine server transport type.' }

  const disabledAt = new Date().toISOString()
  if (type === 'stdio') {
    if (!command) return { ok: false, error: 'stdio server has no command.' }
    const args = argsStr.length > 0 ? argsStr.split(/\s+/) : []
    return {
      ok: true,
      entry: { kind: 'stdio', name, scope, command, args, env, disabledAt }
    }
  }
  if (!url) return { ok: false, error: `${type} server has no URL.` }
  return {
    ok: true,
    entry: { kind: type, name, scope, url, headers, disabledAt }
  }
}

async function disableServer(name: string): Promise<MCPSimpleResult> {
  if (!validName(name)) return { ok: false, error: 'Invalid server name.' }
  const getRes = await runCli(['mcp', 'get', name], 10_000)
  if (!getRes.ok) return { ok: false, error: getRes.error }
  if (getRes.code !== 0) {
    return {
      ok: false,
      error: getRes.stderr.trim() || `claude mcp get exited ${getRes.code}`
    }
  }
  const parsed = parseGetOutput(name, getRes.stdout)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const existing = await readDisabled()
  const filtered = existing.filter((e) => e.name !== name)
  filtered.push(parsed.entry)

  try {
    await writeDisabled(filtered)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }

  const removeRes = await runCli(
    ['mcp', 'remove', name, '-s', parsed.entry.scope],
    15_000
  )
  if (!removeRes.ok) {
    await writeDisabled(existing)
    return { ok: false, error: removeRes.error }
  }
  if (removeRes.code !== 0) {
    await writeDisabled(existing)
    return {
      ok: false,
      error: removeRes.stderr.trim() || `claude mcp remove exited ${removeRes.code}`
    }
  }
  return { ok: true }
}

async function enableServer(name: string): Promise<MCPSimpleResult> {
  if (!validName(name)) return { ok: false, error: 'Invalid server name.' }
  const entries = await readDisabled()
  const entry = entries.find((e) => e.name === name)
  if (!entry) return { ok: false, error: `No disabled entry for ${name}.` }

  const payload =
    entry.kind === 'stdio'
      ? {
          type: 'stdio',
          command: entry.command,
          args: entry.args,
          env: entry.env
        }
      : {
          type: entry.kind,
          url: entry.url,
          headers: entry.headers
        }

  const r = await runCli(
    ['mcp', 'add-json', '-s', entry.scope, entry.name, JSON.stringify(payload)],
    30_000
  )
  if (!r.ok) return { ok: false, error: r.error }
  if (r.code !== 0) {
    return {
      ok: false,
      error: r.stderr.trim() || r.stdout.trim() || `claude mcp add-json exited ${r.code}`
    }
  }

  const remaining = entries.filter((e) => e.name !== name)
  try {
    await writeDisabled(remaining)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
  return { ok: true }
}

async function forgetDisabled(name: string): Promise<MCPSimpleResult> {
  const entries = await readDisabled()
  const remaining = entries.filter((e) => e.name !== name)
  try {
    await writeDisabled(remaining)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
  return { ok: true }
}

async function listDisabled(): Promise<DisabledListResult> {
  try {
    return { ok: true, entries: await readDisabled() }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export function registerMcpIpc(): void {
  ipcMain.handle('mcp:list', async () => listServers())
  ipcMain.handle('mcp:get', async (_e, name: string) => getServer(name))
  ipcMain.handle('mcp:add', async (_e, input: AddServerInput) => addServer(input))
  ipcMain.handle('mcp:remove', async (_e, name: string, scope?: MCPScope) =>
    removeServer(name, scope)
  )
  ipcMain.handle('mcp:disable', async (_e, name: string) => disableServer(name))
  ipcMain.handle('mcp:enable', async (_e, name: string) => enableServer(name))
  ipcMain.handle('mcp:forgetDisabled', async (_e, name: string) =>
    forgetDisabled(name)
  )
  ipcMain.handle('mcp:listDisabled', async () => listDisabled())
  ipcMain.handle('mcp:cliPath', async () => ({ path: await resolveCliPath() }))
}
