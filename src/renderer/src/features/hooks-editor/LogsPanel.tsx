import { useEffect, useMemo, useState } from 'react'
import { clawbench } from '../../lib/ipc'
import type { HookLogEntry } from '../../../../shared/types'

type Pair = {
  event: string
  pid: number
  startedAt?: string
  endedAt?: string
  exit?: number
  durationMs?: number
  stdin?: string
  stdout?: string
  stderr?: string
}

function pairEntries(entries: HookLogEntry[]): Pair[] {
  const byPid = new Map<number, Pair>()
  for (const e of entries) {
    const pair =
      byPid.get(e.pid) ?? ({ event: e.event, pid: e.pid } as Pair)
    if (e.type === 'start') {
      pair.startedAt = e.ts
      pair.stdin = e.stdin
    } else {
      pair.endedAt = e.ts
      pair.exit = e.exit
      pair.durationMs = e.durationMs
      pair.stdout = e.stdout
      pair.stderr = e.stderr
    }
    byPid.set(e.pid, pair)
  }
  return Array.from(byPid.values()).sort((a, b) => {
    const at = a.endedAt || a.startedAt || ''
    const bt = b.endedAt || b.startedAt || ''
    return bt.localeCompare(at)
  })
}

function fmtTime(iso?: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString(undefined, { hour12: false })
  } catch {
    return iso
  }
}

function LogsPanel(): React.JSX.Element {
  const [entries, setEntries] = useState<HookLogEntry[]>([])
  const [path, setPath] = useState<string>('')
  const [exists, setExists] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wrapperPath, setWrapperPath] = useState<string>('')
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const pairs = useMemo(() => pairEntries(entries), [entries])

  const refresh = async (): Promise<void> => {
    const r = await clawbench.hooks.readLogs(200)
    if (r.ok) {
      setEntries(r.entries)
      setPath(r.path)
      setExists(r.exists)
      setError(null)
    } else {
      setError(r.error)
    }
  }

  useEffect(() => {
    refresh()
    clawbench.hooks.wrapperPath().then((r) => setWrapperPath(r.path))
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [])

  const install = async (): Promise<void> => {
    setInstalling(true)
    const r = await clawbench.hooks.installWrapper()
    setInstalling(false)
    if (r.ok) {
      setWrapperPath(r.path)
      setInstalled(true)
    } else {
      setError(r.error)
    }
  }

  const clear = async (): Promise<void> => {
    await clawbench.hooks.clearLogs()
    refresh()
  }

  return (
    <div className="space-y-5">
      <section className="border border-white/5 rounded-lg p-4 bg-white/[0.02]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium">Logging wrapper</div>
            <p className="text-xs text-white/50 mt-1">
              Hook 명령을{' '}
              <code className="px-1 py-0.5 rounded bg-white/5 text-white/80">
                {wrapperPath || '~/.clawbench/bin/hook-wrapper'}
              </code>
              로 감싸면 stdin/stdout/exit가{' '}
              <code className="px-1 py-0.5 rounded bg-white/5 text-white/80">
                ~/.clawbench/logs/hooks.jsonl
              </code>
              에 기록돼요.
            </p>
            <div className="mt-2 font-mono text-[11px] text-white/60 bg-black/40 border border-white/5 rounded px-2 py-1.5 break-all">
              {wrapperPath
                ? `${wrapperPath} PreToolUse -- ~/.claude/hooks/your-hook.sh`
                : '~/.clawbench/bin/hook-wrapper PreToolUse -- ~/.claude/hooks/your-hook.sh'}
            </div>
          </div>
          <button
            onClick={install}
            disabled={installing}
            className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/80 shrink-0"
          >
            {installing
              ? 'Installing…'
              : installed
                ? 'Reinstall'
                : 'Install wrapper'}
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-medium">Recent executions</div>
            <div className="text-[11px] text-white/40 font-mono truncate">
              {path}
              {!exists && ' (no logs yet)'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="text-xs px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/70"
            >
              Refresh
            </button>
            {exists && (
              <button
                onClick={clear}
                className="text-xs px-2.5 py-1 rounded-md bg-white/5 hover:bg-red-500/20 text-white/70"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
        {pairs.length === 0 && (
          <div className="text-xs text-white/50 border border-dashed border-white/10 rounded-lg px-3 py-6 text-center">
            No log entries yet. Wrap a hook command with the wrapper above to
            start recording.
          </div>
        )}
        <div className="space-y-1">
          {pairs.map((p, idx) => {
            const statusColor =
              p.exit === undefined
                ? 'text-white/40'
                : p.exit === 0
                  ? 'text-emerald-400'
                  : 'text-red-400'
            const isOpen = expanded === idx
            return (
              <div
                key={`${p.pid}-${p.startedAt}-${idx}`}
                className="border border-white/5 rounded-md bg-white/[0.02]"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : idx)}
                  className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-white/[0.04]"
                >
                  <span className="font-mono text-[11px] text-white/50 w-16">
                    {fmtTime(p.endedAt || p.startedAt)}
                  </span>
                  <span className="font-mono text-[11px] text-white/80 w-32 truncate">
                    {p.event}
                  </span>
                  <span className={`font-mono text-[11px] w-12 ${statusColor}`}>
                    {p.exit === undefined ? 'running' : `exit ${p.exit}`}
                  </span>
                  <span className="font-mono text-[11px] text-white/40 w-16">
                    {p.durationMs !== undefined ? `${p.durationMs}ms` : '—'}
                  </span>
                  <span className="font-mono text-[11px] text-white/30 ml-auto">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2 text-[11px]">
                    <LogSection title="stdin" body={p.stdin} />
                    <LogSection title="stdout" body={p.stdout} />
                    <LogSection title="stderr" body={p.stderr} tone="error" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function LogSection({
  title,
  body,
  tone
}: {
  title: string
  body?: string
  tone?: 'error'
}): React.JSX.Element {
  return (
    <div>
      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
        {title}
      </div>
      <pre
        className={`font-mono bg-black/40 border border-white/5 rounded px-2 py-1.5 whitespace-pre-wrap break-all min-h-[1.5rem] ${
          tone === 'error' ? 'text-red-300/90' : 'text-white/80'
        }`}
      >
        {body || <span className="text-white/30">(empty)</span>}
      </pre>
    </div>
  )
}

export default LogsPanel
