import { useCallback, useEffect, useState } from 'react'
import { clawbench } from '../../lib/ipc'
import type { HealthCheck, HealthReport, HealthStatus } from '../../../../shared/types'

type State =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; report: HealthReport }

const STATUS_META: Record<HealthStatus, { dot: string; label: string; text: string }> = {
  ok: { dot: 'bg-emerald-400', label: 'OK', text: 'text-emerald-400' },
  warn: { dot: 'bg-amber-400', label: 'Warn', text: 'text-amber-400' },
  error: { dot: 'bg-red-400', label: 'Error', text: 'text-red-400' },
  unknown: { dot: 'bg-white/30', label: 'Unknown', text: 'text-white/40' }
}

function summarize(checks: HealthCheck[]): {
  overall: HealthStatus
  counts: Record<HealthStatus, number>
} {
  const counts: Record<HealthStatus, number> = { ok: 0, warn: 0, error: 0, unknown: 0 }
  for (const c of checks) counts[c.status] += 1
  const overall: HealthStatus =
    counts.error > 0
      ? 'error'
      : counts.warn > 0
        ? 'warn'
        : counts.unknown > 0
          ? 'unknown'
          : 'ok'
  return { overall, counts }
}

function HealthDashboard(): React.JSX.Element {
  const [state, setState] = useState<State>({ status: 'idle' })
  const [busyFix, setBusyFix] = useState<string | null>(null)
  const [fixMessage, setFixMessage] = useState<string | null>(null)
  const [fixError, setFixError] = useState<string | null>(null)

  const run = useCallback(async (): Promise<void> => {
    setState({ status: 'running' })
    setFixError(null)
    const report = await clawbench.health.run()
    setState({ status: 'ready', report })
  }, [])

  useEffect(() => {
    run()
  }, [run])

  const applyFix = async (id: string): Promise<void> => {
    setBusyFix(id)
    setFixError(null)
    setFixMessage(null)
    const r = await clawbench.health.fix(id)
    setBusyFix(null)
    if (r.ok) {
      setFixMessage(r.message)
      await run()
    } else {
      setFixError(r.error)
    }
  }

  const report = state.status === 'ready' ? state.report : null
  const summary = report ? summarize(report.checks) : null

  return (
    <div className="p-8 max-w-4xl">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">Health</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Diagnostics for Claude Code on this machine
          </p>
        </div>
        <button
          onClick={run}
          disabled={state.status === 'running'}
          className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-50"
        >
          {state.status === 'running' ? 'Running…' : 'Run again'}
        </button>
      </header>

      {summary && (
        <div className="mb-5 flex items-center gap-3 border border-white/5 rounded-lg px-4 py-3 bg-white/[0.02]">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_META[summary.overall].dot}`}
          />
          <div className="flex-1">
            <div className="text-sm">
              <span className={STATUS_META[summary.overall].text}>
                {summary.overall === 'ok'
                  ? 'All checks passing'
                  : summary.overall === 'warn'
                    ? 'Some warnings'
                    : summary.overall === 'error'
                      ? 'Problems detected'
                      : 'Unknown state'}
              </span>
              <span className="text-white/40 ml-2">
                · {summary.counts.ok} ok · {summary.counts.warn} warn · {summary.counts.error} error
                {summary.counts.unknown > 0 ? ` · ${summary.counts.unknown} unknown` : ''}
              </span>
            </div>
            <div className="text-[11px] text-white/40 font-mono mt-0.5">
              {new Date(report!.generatedAt).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {fixMessage && (
        <div className="mb-3 text-xs text-emerald-400">{fixMessage}</div>
      )}
      {fixError && (
        <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 font-mono whitespace-pre-wrap break-all">
          {fixError}
        </div>
      )}

      {state.status === 'running' && !report && (
        <div className="text-sm text-white/50">Running checks…</div>
      )}

      {report && (
        <div className="space-y-2">
          {report.checks.map((c) => (
            <CheckRow
              key={c.id}
              check={c}
              onFix={applyFix}
              busyFix={busyFix}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CheckRow({
  check,
  onFix,
  busyFix
}: {
  check: HealthCheck
  onFix: (id: string) => void
  busyFix: string | null
}): React.JSX.Element {
  const meta = STATUS_META[check.status]
  return (
    <div className="border border-white/5 rounded-lg px-4 py-3 bg-white/[0.02] flex items-start gap-3">
      <span className={`inline-block w-2 h-2 rounded-full shrink-0 mt-1.5 ${meta.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/90">{check.title}</span>
          <span className={`text-[11px] ${meta.text}`}>{meta.label}</span>
        </div>
        <div className="text-[11px] text-white/60 mt-0.5 font-mono break-all">
          {check.detail}
        </div>
        {check.hint && (
          <div className="text-[11px] text-white/40 mt-1 break-all">{check.hint}</div>
        )}
      </div>
      {check.fixes && check.fixes.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {check.fixes.map((f) => (
            <button
              key={f.id}
              onClick={() => onFix(f.id)}
              disabled={busyFix !== null}
              className="text-[11px] px-2 py-1 rounded bg-emerald-500/80 hover:bg-emerald-500 text-white disabled:opacity-50"
            >
              {busyFix === f.id ? '…' : f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default HealthDashboard
