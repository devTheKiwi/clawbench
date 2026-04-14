import type { HookTemplate } from '../../../../shared/types'

export const HOOK_TEMPLATES: HookTemplate[] = [
  {
    id: 'ping-on-permission',
    name: 'Ping on Permission Request',
    description: '권한 요청이 올 때 Ping 사운드 재생 (비동기).',
    event: 'PermissionRequest',
    matcher: '*',
    command: 'afplay /System/Library/Sounds/Ping.aiff &',
    platform: 'mac'
  },
  {
    id: 'glass-on-stop',
    name: 'Glass on Stop',
    description: '작업 완료/대기 시 Glass 사운드 재생.',
    event: 'Stop',
    command: 'afplay /System/Library/Sounds/Glass.aiff &',
    platform: 'mac'
  },
  {
    id: 'notify-on-stop',
    name: 'Desktop Notification on Stop',
    description: 'Stop 이벤트 시 macOS 알림 띄우기.',
    event: 'Stop',
    command:
      "osascript -e 'display notification \"Claude is waiting\" with title \"Claude Code\" sound name \"Ping\"'",
    platform: 'mac'
  },
  {
    id: 'bash-logger',
    name: 'Log Bash Commands',
    description: 'Bash 툴 호출을 JSONL 파일로 기록 (pass-through tee).',
    event: 'PreToolUse',
    matcher: 'Bash',
    command: 'tee -a ~/.clawbench/logs/bash.jsonl',
    platform: 'cross'
  },
  {
    id: 'session-banner',
    name: 'Session Start Banner',
    description: '세션 시작 시각을 로그 파일에 기록.',
    event: 'SessionStart',
    command: 'echo "$(date -u +%FT%TZ) session started" >> ~/.clawbench/logs/sessions.log',
    platform: 'cross'
  }
]
