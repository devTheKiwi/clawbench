import { useEffect, useState } from 'react'
import { clawbench } from '../../lib/ipc'
import type { BackupEntry, SettingsScope } from '../../../../shared/types'

type Props = {
  open: boolean
  scope: SettingsScope
  onClose: () => void
  onRestored: () => void
}

type ListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; entries: BackupEntry[]; dir: string }
  | { status: 'error'; error: string }

function fmtTime(ts: string): string {
  const iso = ts.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    '$1T$2:$3:$4.$5Z'
  )
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return ts
  }
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function BackupsModal({
  open,
  scope,
  onClose,
  onRestored
}: Props): React.JSX.Element | null {
  const [state, setState] = useState<ListState>({ status: 'idle' })
  const [selected, setSelected] = useState<BackupEntry | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [previewing, setPreviewing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)

  const refresh = async (): Promise<void> => {
    setState({ status: 'loading' })
    const r = await clawbench.backups.list()
    if (r.ok) setState({ status: 'ready', entries: r.entries, dir: r.dir })
    else setState({ status: 'error', error: r.error })
  }

  useEffect(() => {
    if (open) {
      refresh()
      setSelected(null)
      setPreview('')
      setMessage(null)
      setError(null)
      setConfirmRestore(false)
    }
  }, [open])

  useEffect(() => {
    if (!selected) {
      setPreview('')
      return
    }
    let cancelled = false
    setPreviewing(true)
    clawbench.backups.read(selected.file).then((r) => {
      if (cancelled) return
      setPreviewing(false)
      if (r.ok) setPreview(r.content)
      else setPreview(`// Failed to read: ${r.error}`)
    })
    return () => {
      cancelled = true
    }
  }, [selected])

  if (!open) return null

  const filtered =
    state.status === 'ready'
      ? state.entries.filter((e) => e.scope === scope)
      : []
  const otherScope =
    state.status === 'ready'
      ? state.entries.filter((e) => e.scope !== scope).length
      : 0

  const doRestore = async (): Promise<void> => {
    if (!selected) return
    setRestoring(true)
    setError(null)
    const r = await clawbench.backups.restore(selected.file)
    setRestoring(false)
    setConfirmRestore(false)
    if (r.ok) {
      setMessage(
        `Restored to ${r.restoredPath}${r.preRestoreBackup ? ` (prior saved as ${r.preRestoreBackup.split('/').pop()})` : ''}`
      )
      await refresh()
      onRestored()
    } else {
      setError(r.error)
    }
  }

  const doCleanup = async (): Promise<void> => {
    setMessage(null)
    setError(null)
    const r = await clawbench.backups.cleanup()
    if (r.ok) {
      setMessage(`Cleanup done — removed ${r.removed}, kept ${r.kept} per scope.`)
      await refresh()
    } else {
      setError(r.error)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#15171d] border border-white/10 rounded-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Backups — {scope}</h2>
            <p className="text-xs text-white/50 mt-0.5">
              Snapshots of settings taken before each save.
              {otherScope > 0 && ` ${otherScope} more in the other scope.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={doCleanup}
              className="text-xs px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/70"
            >
              Cleanup
            </button>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white/80 text-lg leading-none px-2"
            >
              ×
            </button>
          </div>
        </div>

        {state.status === 'ready' && (
          <div className="px-5 pt-3 text-[11px] text-white/40 font-mono truncate">
            {state.dir}
          </div>
        )}
        {message && (
          <div className="px-5 pt-3 text-xs text-emerald-400 break-all">{message}</div>
        )}
        {error && (
          <div className="px-5 pt-3 text-xs text-red-400 font-mono break-all">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <aside className="w-72 shrink-0 overflow-y-auto border-r border-white/5 py-2">
            {state.status === 'loading' && (
              <div className="px-4 py-3 text-xs text-white/50">Loading…</div>
            )}
            {state.status === 'ready' && filtered.length === 0 && (
              <div className="px-4 py-6 text-xs text-white/50 text-center">
                No backups for this scope yet.
              </div>
            )}
            {state.status === 'ready' &&
              filtered.map((e) => {
                const active = selected?.file === e.file
                return (
                  <button
                    key={e.file}
                    onClick={() => setSelected(e)}
                    className={`w-full text-left px-4 py-2 text-xs border-l-2 transition-colors ${
                      active
                        ? 'border-emerald-400 bg-white/5'
                        : 'border-transparent hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="text-white/80">{fmtTime(e.timestamp)}</div>
                    <div className="text-[10px] text-white/40 font-mono truncate">
                      {fmtSize(e.sizeBytes)}
                    </div>
                  </button>
                )
              })}
          </aside>
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 overflow-auto p-4 text-xs">
              {!selected && (
                <div className="text-white/40 text-xs">
                  Pick a backup on the left to preview it.
                </div>
              )}
              {selected && previewing && (
                <div className="text-white/50 text-xs">Loading preview…</div>
              )}
              {selected && !previewing && (
                <pre className="font-mono bg-black/40 border border-white/5 rounded px-3 py-2 text-white/80 whitespace-pre-wrap break-all">
                  {preview}
                </pre>
              )}
            </div>
            {selected && (
              <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between gap-2">
                <div className="text-[11px] text-white/50 font-mono truncate flex-1">
                  {selected.path}
                </div>
                {confirmRestore ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-amber-300">
                      Overwrite current {scope} settings?
                    </span>
                    <button
                      onClick={() => setConfirmRestore(false)}
                      className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={doRestore}
                      disabled={restoring}
                      className="text-[11px] px-2 py-1 rounded bg-amber-500/80 hover:bg-amber-500 text-white disabled:opacity-50"
                    >
                      {restoring ? 'Restoring…' : 'Confirm restore'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRestore(true)}
                    className="text-[11px] px-3 py-1 rounded bg-emerald-500/80 hover:bg-emerald-500 text-white"
                  >
                    Restore this backup
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BackupsModal
