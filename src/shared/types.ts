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
