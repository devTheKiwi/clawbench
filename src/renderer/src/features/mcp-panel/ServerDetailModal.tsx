import { useEffect, useState } from 'react'
import { clawbench } from '../../lib/ipc'

type Props = {
  name: string | null
  onClose: () => void
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; raw: string }
  | { status: 'error'; error: string }

function ServerDetailModal({ name, onClose }: Props): React.JSX.Element | null {
  const [state, setState] = useState<State>({ status: 'idle' })

  useEffect(() => {
    if (!name) {
      setState({ status: 'idle' })
      return
    }
    setState({ status: 'loading' })
    clawbench.mcp.get(name).then((r) => {
      if (r.ok) setState({ status: 'ready', raw: r.raw })
      else setState({ status: 'error', error: r.error })
    })
  }, [name])

  if (!name) return null

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
            <h2 className="text-base font-semibold">Server detail</h2>
            <p className="text-xs text-white/50 mt-0.5 font-mono">{name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 text-lg leading-none px-2"
          >
            ×
          </button>
        </div>
        <div className="overflow-auto p-5 text-xs">
          {state.status === 'loading' && <div className="text-white/60">Loading…</div>}
          {state.status === 'error' && (
            <div className="text-red-400 font-mono bg-red-500/10 border border-red-500/20 rounded p-2 whitespace-pre-wrap break-all">
              {state.error}
            </div>
          )}
          {state.status === 'ready' && (
            <pre className="font-mono bg-black/40 border border-white/5 rounded px-3 py-2 text-white/80 whitespace-pre-wrap break-all">
              {state.raw || <span className="text-white/30">(empty)</span>}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default ServerDetailModal
