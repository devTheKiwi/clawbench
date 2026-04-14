export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PermissionRequest'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreCompact'
  | 'Notification'

export const HOOK_EVENTS: HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'PreCompact',
  'Notification'
]

export const MATCHER_SUPPORTED_EVENTS: HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest'
]

export type HookEntry = {
  type: 'command'
  command: string
}

export type HookGroup = {
  matcher?: string
  hooks: HookEntry[]
}

export type HooksConfig = Partial<Record<HookEvent, HookGroup[]>>

export type SettingsScope = 'user' | 'local'

export type Settings = {
  hooks?: HooksConfig
  [key: string]: unknown
}

export type ReadSettingsResult =
  | { ok: true; settings: Settings; path: string; exists: boolean }
  | { ok: false; error: string; path: string }

export type WriteSettingsResult =
  | { ok: true; path: string; backupPath: string }
  | { ok: false; error: string; path: string }

export type HookTemplate = {
  id: string
  name: string
  description: string
  event: HookEvent
  matcher?: string
  command: string
  platform?: 'mac' | 'cross'
}

export type TestRunResult =
  | {
      ok: true
      exitCode: number
      stdout: string
      stderr: string
      durationMs: number
      timedOut: boolean
    }
  | { ok: false; error: string }

export type HookLogEntry = {
  ts: string
  type: 'start' | 'end'
  event: string
  pid: number
  stdin?: string
  exit?: number
  stdout?: string
  stderr?: string
  durationMs?: number
}

export type ReadLogsResult =
  | { ok: true; entries: HookLogEntry[]; path: string; exists: boolean }
  | { ok: false; error: string; path: string }

export type InstallWrapperResult =
  | { ok: true; path: string; alreadyInstalled: boolean }
  | { ok: false; error: string }

export type MCPStatus = 'connected' | 'needs-auth' | 'failed' | 'unknown'
export type MCPTransport = 'stdio' | 'http' | 'sse' | 'unknown'
export type MCPScope = 'user' | 'project' | 'local'

export type MCPServer = {
  name: string
  endpoint: string
  status: MCPStatus
  statusDetail?: string
  transport: MCPTransport
  disabled?: boolean
}

export type MCPListResult =
  | { ok: true; servers: MCPServer[]; cliPath: string }
  | { ok: false; error: string; cliPath?: string }

export type MCPGetResult =
  | { ok: true; name: string; raw: string }
  | { ok: false; error: string }

export type MCPSimpleResult = { ok: true } | { ok: false; error: string }

export type AddStdioServer = {
  kind: 'stdio'
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  scope?: MCPScope
}

export type AddRemoteServer = {
  kind: 'http' | 'sse'
  name: string
  url: string
  headers?: Record<string, string>
  scope?: MCPScope
}

export type AddServerInput = AddStdioServer | AddRemoteServer

export type DisabledStdioEntry = {
  kind: 'stdio'
  name: string
  scope: MCPScope
  command: string
  args: string[]
  env: Record<string, string>
  disabledAt: string
}

export type DisabledRemoteEntry = {
  kind: 'http' | 'sse'
  name: string
  scope: MCPScope
  url: string
  headers: Record<string, string>
  disabledAt: string
}

export type DisabledMCPEntry = DisabledStdioEntry | DisabledRemoteEntry

export type DisabledListResult =
  | { ok: true; entries: DisabledMCPEntry[] }
  | { ok: false; error: string }

export type HealthStatus = 'ok' | 'warn' | 'error' | 'unknown'

export type HealthFix = {
  id: string
  label: string
}

export type HealthCheck = {
  id: string
  title: string
  status: HealthStatus
  detail: string
  hint?: string
  fixes?: HealthFix[]
}

export type HealthReport = {
  generatedAt: string
  checks: HealthCheck[]
}

export type HealthFixResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

export type BackupEntry = {
  file: string
  path: string
  scope: SettingsScope | 'unknown'
  timestamp: string
  sizeBytes: number
}

export type BackupListResult =
  | { ok: true; entries: BackupEntry[]; dir: string }
  | { ok: false; error: string; dir: string }

export type BackupReadResult =
  | { ok: true; content: string }
  | { ok: false; error: string }

export type BackupRestoreResult =
  | { ok: true; restoredPath: string; preRestoreBackup: string }
  | { ok: false; error: string }

export type BackupCleanupResult =
  | { ok: true; removed: number; kept: number }
  | { ok: false; error: string }
