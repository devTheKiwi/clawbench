import { spawn } from 'child_process'
import { ipcMain } from 'electron'
import type {
  AddServerInput,
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

export function registerMcpIpc(): void {
  ipcMain.handle('mcp:list', async () => listServers())
  ipcMain.handle('mcp:get', async (_e, name: string) => getServer(name))
  ipcMain.handle('mcp:add', async (_e, input: AddServerInput) => addServer(input))
  ipcMain.handle('mcp:remove', async (_e, name: string, scope?: MCPScope) =>
    removeServer(name, scope)
  )
  ipcMain.handle('mcp:cliPath', async () => ({ path: await resolveCliPath() }))
}
