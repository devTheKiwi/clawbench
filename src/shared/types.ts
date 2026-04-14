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
