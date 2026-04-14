# Clawbench

Claude Code 사용자를 위한 범용 컨트롤 센터. Hook 편집, MCP 서버 관리, 설치 상태 진단을
하나의 데스크톱 앱에서 수행합니다.

## 왜 Clawbench?

Claude Code는 강력하지만 설정이 모두 JSON 파일이나 CLI 명령어에 흩어져 있습니다.

- `~/.claude/settings.json`의 hook 블록은 손으로 편집해야 하고, 오타 하나에 CC 세션이 먹통이 됩니다.
- MCP 서버는 `claude mcp list/add/remove`를 외우고 있어야 하고, stdio/http/sse 전송 차이를 매번 플래그로 기억해야 합니다.
- `/doctor`는 TTY UI라 외부에서 파이프할 수 없고, 결과를 재활용하기 어렵습니다.

Clawbench는 이 세 가지를 GUI로 올려주되, 사용자 파일은 **항상 백업 + atomic write**로 건드려서
실수해도 원본이 남도록 합니다.

## 기능

### 1. Hook Editor (v0.1)

`settings.json`의 `hooks` 블록을 이벤트별 카드 UI로 편집합니다.

- 이벤트 지원: `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`,
  `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `PreCompact`, `Notification`
- 스코프 전환: **User (`~/.claude/settings.json`)** / **Local (`~/.claude/settings.local.json`)**
- **Template Gallery** — `claude stop`에 glass 사운드 재생, Bash 커맨드 로거 등
  5종 프리셋을 한 번에 삽입
- **Test Run** — 각 hook의 command를 샘플 stdin과 함께 5초 타임아웃으로 실행, stdout/stderr/exit 확인
- **Logs 탭** — `~/.clawbench/bin/hook-wrapper`를 설치하면 hook 실행이
  `~/.clawbench/logs/hooks.jsonl`에 기록됨. 패널에서 2초 폴링으로 stdin/stdout/stderr/duration 타임라인 확인
- **Backups 모달** — 저장할 때마다 쌓이는 `~/.clawbench/backups/` 스냅샷을 스코프별로 탐색,
  JSON 프리뷰 확인 후 원클릭 복원. Cleanup 버튼으로 스코프당 최근 40개만 유지

### 2. MCP Panel (v0.2)

`claude mcp` CLI를 GUI로 감싸 설치된 서버를 한눈에 봅니다.

- 서버 카드: 이름, transport(stdio/http/sse), endpoint, 상태 도트(connected/needs-auth/failed)
- **Add server** 모달: transport 탭 + 스코프(local/user/project) + stdio용 command/args/env,
  http·sse용 URL/headers 편집. args는 따옴표 파싱 지원
- **Details** — `claude mcp get <name>` 원문 표시
- **Disable / Enable** — `claude mcp get`에서 파싱한 스코프·env·헤더까지 통째로
  `~/.clawbench/mcp-disabled.json`에 저장하고 서버는 remove. 다시 Enable 누르면
  `claude mcp add-json`으로 원래 스코프에 그대로 복구. 설정 잃지 않고 잠시 꺼두기 가능
- **Remove** — 스코프(auto/local/user/project) 선택 후 `claude mcp remove` 실행
- Electron이 Dock에서 실행되어도 `/bin/sh -l -c 'command -v claude'`로 PATH를 해결

### 3. Health Dashboard (v0.3)

`/doctor`의 Ink TUI 대신 렌더러 쪽에서 직접 체크를 돌리고, 일부 항목은 원클릭 픽스를 제공합니다.

- Claude Code CLI 존재 + 버전
- Node.js 런타임 버전 (Electron 임베드 기준)
- `~/.claude` 디렉토리 존재 + 쓰기 가능 → 없으면 **Create directory** 버튼
- `settings.json` / `settings.local.json` JSON 유효성
- **Hook command 경로 체크** — 두 settings 파일의 모든 hook command를 수집해
  첫 토큰이 `command -v` 또는 절대/상대 경로로 resolve 되는지 검사. 팀 설정을
  clone했는데 필요한 스크립트가 로컬에 없을 때 바로 탐지
- MCP 서버 상태 요약 (connected / needs-auth / failed 카운트)
- `~/.clawbench` 저장소 쓰기 가능 여부

## 사용법

### 설치 & 실행 (개발 모드)

```bash
git clone https://github.com/devTheKiwi/clawbench.git
cd clawbench
npm install
npm run dev
```

### macOS 앱 빌드

```bash
npm run build:mac
# out 디렉토리의 .dmg 설치
```

### 첫 사용 플로우

1. **Health** 탭 → **Run again** — 빨간 줄이 있으면 먼저 해결 (대부분 Create directory 한 번으로 끝)
2. **Hooks** 탭 → Templates → 원하는 프리셋 추가 → 필요하면 command 편집 → **Save**
3. Logs 탭 → **Install wrapper** 클릭 → hook command를
   `~/.clawbench/bin/hook-wrapper PreToolUse -- ~/.claude/hooks/your-hook.sh` 형태로 감싸면
   실행 기록이 자동으로 쌓임
4. **MCP** 탭 → **Add server** — stdio면 command + args, http/sse면 URL + 헤더 입력 후 Add

### 복구 & 토글 플로우

- **설정이 깨졌을 때**: Hooks 탭 → **Backups** → 복원하려는 스냅샷 선택 → 프리뷰 확인 →
  **Restore this backup**. 복원 직전 현재 파일도 한 번 더 백업됩니다
- **MCP 서버를 잠시 끄고 싶을 때**: 카드의 **Disable** 클릭. 하단 Disabled 섹션에서
  **Enable**로 언제든 원상복구. 영영 지우려면 **Forget**
- **팀 설정을 clone한 뒤**: Health 탭에서 Hook command 경로 체크가 warn을 띄우면,
  누락된 스크립트를 설치하거나 hook command를 수정

### 요구사항

- macOS (Windows는 미검증, 크로스플랫폼 코드로 작성되어 있음)
- Node.js 18 이상
- Claude Code CLI 설치 (`npm install -g @anthropic-ai/claude-code`) — MCP/Health 패널 일부 기능에 필요

## 안전한 파일 쓰기

`~/.claude/settings.json`을 건드릴 때마다:

1. 기존 파일을 `~/.clawbench/backups/<ISO-timestamp>-<scope>-settings.json`에 백업
2. `.tmp` 파일에 새 내용 작성
3. `fs.rename`으로 atomic 스왑

크래시나 전원 차단 시에도 원본이 반쪽짜리로 남지 않습니다.

## 개발

```bash
npm run dev         # Electron 앱 실행 (HMR)
npm run typecheck   # tsc --noEmit (main + renderer)
npm run lint        # ESLint
npm run build:mac   # macOS dmg
npm run build:win   # Windows exe
npm run build:linux # Linux AppImage
```

## 구조

```
src/
  main/               Electron main process
    ipc/
      settings.ts     settings.json 읽기/쓰기 (백업 + atomic)
      hooks.ts        hook test run, wrapper 설치, logs 읽기
      mcp.ts          claude mcp 래핑 (list/get/add/remove/disable/enable)
      health.ts       diagnostics + 픽스 + hook command 경로 검사
      backups.ts      ~/.clawbench/backups 리스트/복원/retention
  preload/            contextBridge (window.clawbench)
  renderer/src/
    features/
      hooks-editor/   HooksEditor, TemplateGallery, TestRunModal,
                      LogsPanel, BackupsModal
      mcp-panel/      McpPanel (+Disabled section),
                      AddServerModal, ServerDetailModal
      health-dashboard/ HealthDashboard
    lib/ipc.ts        window.clawbench 프록시
  shared/types.ts     main ↔ renderer 공유 타입
```

## 스택

Electron + Vite + React 19 + TypeScript + Tailwind v4 (electron-vite 기반).

## 라이선스

[MIT](LICENSE) © 2026 kiwi (devthekiwi)
