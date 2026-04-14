import { promises as fs } from 'fs'
import { spawn } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { ipcMain } from 'electron'
import type {
  HookEvent,
  HookLogEntry,
  InstallWrapperResult,
  ReadLogsResult,
  TestRunResult
} from '../../shared/types'

const SAMPLE_STDIN: Record<HookEvent, object> = {
  PreToolUse: {
    tool_name: 'Bash',
    tool_input: { command: 'echo hello' }
  },
  PostToolUse: {
    tool_name: 'Bash',
    tool_input: { command: 'echo hello' },
    tool_result: { output: 'hello\n', exit_code: 0 }
  },
  PermissionRequest: {
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /tmp/test' }
  },
  UserPromptSubmit: { prompt: 'Hello Claude' },
  Stop: { reason: 'user' },
  SubagentStop: { reason: 'user' },
  SessionStart: { session_id: 'test-session' },
  SessionEnd: { session_id: 'test-session' },
  PreCompact: { trigger: 'manual' },
  Notification: { title: 'Test', message: 'sample notification' }
}

const TEST_RUN_TIMEOUT_MS = 5000

function testRun(command: string, event: HookEvent): Promise<TestRunResult> {
  return new Promise((resolve) => {
    const stdin = JSON.stringify(SAMPLE_STDIN[event], null, 2)
    const started = Date.now()
    const child = spawn('/bin/sh', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAWBENCH_TEST_RUN: '1' }
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const killTimer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, TEST_RUN_TIMEOUT_MS)
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => {
      clearTimeout(killTimer)
      resolve({ ok: false, error: err.message })
    })
    child.on('close', (code) => {
      clearTimeout(killTimer)
      resolve({
        ok: true,
        exitCode: code ?? -1,
        stdout: stdout.slice(0, 8192),
        stderr: stderr.slice(0, 8192),
        durationMs: Date.now() - started,
        timedOut
      })
    })
    child.stdin.write(stdin)
    child.stdin.end()
  })
}

function logsPath(): string {
  return join(homedir(), '.clawbench', 'logs', 'hooks.jsonl')
}

async function readLogs(maxEntries = 200): Promise<ReadLogsResult> {
  const path = logsPath()
  try {
    await fs.access(path)
  } catch {
    return { ok: true, entries: [], path, exists: false }
  }
  try {
    const raw = await fs.readFile(path, 'utf8')
    const lines = raw.split('\n').filter((l) => l.trim().length > 0)
    const tail = lines.slice(-maxEntries)
    const entries: HookLogEntry[] = []
    for (const line of tail) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // skip malformed line
      }
    }
    return { ok: true, entries, path, exists: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      path
    }
  }
}

async function clearLogs(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const path = logsPath()
    await fs.writeFile(path, '', 'utf8')
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

const WRAPPER_SCRIPT = `#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const args = process.argv.slice(2)
const sepIndex = args.indexOf('--')
if (sepIndex < 1) {
  console.error('Usage: hook-wrapper <EventName> -- <command> [args...]')
  process.exit(2)
}
const event = args[0]
const cmd = args.slice(sepIndex + 1)
if (cmd.length === 0) {
  console.error('No command specified after --')
  process.exit(2)
}

const logDir = process.env.CLAWBENCH_LOG_DIR || path.join(os.homedir(), '.clawbench', 'logs')
fs.mkdirSync(logDir, { recursive: true })
const logPath = path.join(logDir, 'hooks.jsonl')

const MAX = 8192
function clip(s) { return s.length > MAX ? s.slice(0, MAX) + '...[truncated]' : s }

let stdin = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => (stdin += d))
process.stdin.on('end', () => {
  const pid = process.pid
  const tsStart = new Date().toISOString()
  const started = Date.now()
  try {
    fs.appendFileSync(logPath, JSON.stringify({ ts: tsStart, type: 'start', event, pid, stdin: clip(stdin) }) + '\\n')
  } catch {}
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.on('data', (d) => { out += d; process.stdout.write(d) })
  child.stderr.on('data', (d) => { err += d; process.stderr.write(d) })
  child.on('error', (e) => {
    try {
      fs.appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), type: 'end', event, pid, exit: -1, stderr: String(e), durationMs: Date.now() - started }) + '\\n')
    } catch {}
    process.exit(1)
  })
  child.on('close', (code) => {
    try {
      fs.appendFileSync(logPath, JSON.stringify({
        ts: new Date().toISOString(),
        type: 'end',
        event,
        pid,
        exit: code,
        stdout: clip(out),
        stderr: clip(err),
        durationMs: Date.now() - started
      }) + '\\n')
    } catch {}
    process.exit(code || 0)
  })
  child.stdin.write(stdin)
  child.stdin.end()
})
`

async function installWrapper(): Promise<InstallWrapperResult> {
  const binDir = join(homedir(), '.clawbench', 'bin')
  const target = join(binDir, 'hook-wrapper')
  try {
    await fs.mkdir(binDir, { recursive: true })
    let alreadyInstalled = false
    try {
      const existing = await fs.readFile(target, 'utf8')
      if (existing === WRAPPER_SCRIPT) {
        alreadyInstalled = true
      }
    } catch {
      // not installed yet
    }
    if (!alreadyInstalled) {
      await fs.writeFile(target, WRAPPER_SCRIPT, { mode: 0o755 })
      await fs.chmod(target, 0o755)
    }
    return { ok: true, path: target, alreadyInstalled }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export function registerHooksIpc(): void {
  ipcMain.handle(
    'hooks:test',
    async (_e, command: string, event: HookEvent) => testRun(command, event)
  )
  ipcMain.handle('hooks:logs:read', async (_e, maxEntries?: number) =>
    readLogs(maxEntries)
  )
  ipcMain.handle('hooks:logs:clear', async () => clearLogs())
  ipcMain.handle('hooks:wrapper:install', async () => installWrapper())
  ipcMain.handle('hooks:wrapper:path', async () => ({
    path: join(homedir(), '.clawbench', 'bin', 'hook-wrapper')
  }))
}

