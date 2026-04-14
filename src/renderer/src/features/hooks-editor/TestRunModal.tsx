import { useEffect, useState } from 'react'
import { clawbench } from '../../lib/ipc'
import type { HookEvent, TestRunResult } from '../../../../shared/types'

type Props = {
  open: boolean
  event: HookEvent
  command: string
  onClose: () => void
}

function TestRunModal({ open, event, command, onClose }: Props): React.JSX.Element | null {
  const [result, setResult] = useState<TestRunResult | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!open) {
      setResult(null)
      setRunning(false)
      return
    }
    setRunning(true)
    clawbench.hooks.test(command, event).then((r) => {
      setResult(r)
      setRunning(false)
    })
  }, [open, command, event])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#15171d] border border-white/10 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Test Run</h2>
            <p className="text-xs text-white/50 mt-0.5 font-mono">{event}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 text-lg leading-none px-2"
          >
            ×
          </button>
        </div>
        <div className="overflow-auto p-5 space-y-4 text-xs">
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-1">
              Command
            </div>
            <div className="font-mono bg-black/40 border border-white/5 rounded px-2 py-1.5 break-all">
              {command}
            </div>
          </div>

          {running && <div className="text-white/60">Running (timeout 5s)…</div>}

          {result && result.ok && (
            <>
              <div className="flex gap-4 text-[11px]">
                <div>
                  <span className="text-white/40">exit</span>{' '}
                  <span
                    className={`font-mono font-semibold ${
                      result.exitCode === 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {result.exitCode}
                  </span>
                </div>
                <div>
                  <span className="text-white/40">duration</span>{' '}
                  <span className="font-mono">{result.durationMs}ms</span>
                </div>
                {result.timedOut && (
                  <div className="text-amber-400 font-semibold">TIMED OUT</div>
                )}
              </div>
              <div>
                <div className="text-[11px] text-white/40 uppercase tracking-wider mb-1">
                  stdout
                </div>
                <pre className="font-mono bg-black/40 border border-white/5 rounded px-2 py-1.5 text-white/80 whitespace-pre-wrap break-all min-h-[2rem]">
                  {result.stdout || <span className="text-white/30">(empty)</span>}
                </pre>
              </div>
              <div>
                <div className="text-[11px] text-white/40 uppercase tracking-wider mb-1">
                  stderr
                </div>
                <pre className="font-mono bg-black/40 border border-white/5 rounded px-2 py-1.5 text-red-300/90 whitespace-pre-wrap break-all min-h-[2rem]">
                  {result.stderr || <span className="text-white/30">(empty)</span>}
                </pre>
              </div>
            </>
          )}

          {result && !result.ok && (
            <div className="text-red-400 font-mono text-xs bg-red-500/10 border border-red-500/20 rounded p-2">
              {result.error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TestRunModal
