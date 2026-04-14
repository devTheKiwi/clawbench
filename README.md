# Clawbench

Claude Code 사용자를 위한 범용 컨트롤 센터.

## 기능

- **Hook Editor** — `settings.json`의 hooks 블록을 GUI로 편집 (v0.1)
- **MCP Panel** — MCP 서버 리스트/토글/인증 (v0.2 예정)
- **Health Dashboard** — CC 설치/설정 진단 + 자동 수정 (v0.3 예정)

## 개발

```bash
npm install
npm run dev        # Electron 앱 실행 (HMR)
npm run typecheck  # 타입 검사
npm run build:mac  # macOS 빌드
```

## 구조

```
src/
  main/            Electron main process
    ipc/           IPC handlers (settings, mcp, health)
  preload/         contextBridge for renderer
  renderer/src/
    features/      기능 단위 폴더
      hooks-editor/
      mcp-panel/
      health-dashboard/
    lib/           renderer 공용 유틸
    components/    공용 UI 컴포넌트
  shared/          main/renderer 공유 타입
```

## 안전한 파일 쓰기

`~/.claude/settings.json` 수정 시 원본을 `~/.clawbench/backups/<timestamp>-<scope>-settings.json`에 먼저 백업한 뒤, tmp 파일 작성 → atomic rename. 크래시나 전원 차단 시에도 원본 유실 없음.

## 스택

Electron + Vite + React 19 + TypeScript + Tailwind v4 (electron-vite 기반).
