import { useCallback, useEffect, useState } from 'react'
import { clawbench } from '../../lib/ipc'
import type {
  DisabledMCPEntry,
  MCPScope,
  MCPServer,
  MCPStatus
} from '../../../../shared/types'
import AddServerModal from './AddServerModal'
import ServerDetailModal from './ServerDetailModal'

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; servers: MCPServer[]; cliPath: string }
  | { status: 'error'; error: string; cliPath?: string }

type Confirm = { name: string; scope: MCPScope | undefined } | null

const STATUS_META: Record<MCPStatus, { dot: string; label: string; text: string }> = {
  connected: { dot: 'bg-emerald-400', label: 'Connected', text: 'text-emerald-400' },
  'needs-auth': { dot: 'bg-amber-400', label: 'Needs auth', text: 'text-amber-400' },
  failed: { dot: 'bg-red-400', label: 'Failed', text: 'text-red-400' },
  unknown: { dot: 'bg-white/30', label: 'Unknown', text: 'text-white/40' }
}

function McpPanel(): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [disabled, setDisabled] = useState<DisabledMCPEntry[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [detailName, setDetailName] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [busyName, setBusyName] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' })
    const [list, disabledRes] = await Promise.all([
      clawbench.mcp.list(),
      clawbench.mcp.listDisabled()
    ])
    if (list.ok) {
      setState({ status: 'ready', servers: list.servers, cliPath: list.cliPath })
    } else {
      setState({ status: 'error', error: list.error, cliPath: list.cliPath })
    }
    setDisabled(disabledRes.ok ? disabledRes.entries : [])
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const disableServer = async (name: string): Promise<void> => {
    setBusyName(name)
    setActionError(null)
    setActionNotice(null)
    const r = await clawbench.mcp.disable(name)
    setBusyName(null)
    if (r.ok) {
      setActionNotice(`Disabled “${name}”. Saved for re-enabling later.`)
      await refresh()
    } else {
      setActionError(r.error)
    }
  }

  const enableServer = async (name: string): Promise<void> => {
    setBusyName(name)
    setActionError(null)
    setActionNotice(null)
    const r = await clawbench.mcp.enable(name)
    setBusyName(null)
    if (r.ok) {
      setActionNotice(`Enabled “${name}”.`)
      await refresh()
    } else {
      setActionError(r.error)
    }
  }

  const forgetDisabled = async (name: string): Promise<void> => {
    setBusyName(name)
    setActionError(null)
    setActionNotice(null)
    const r = await clawbench.mcp.forgetDisabled(name)
    setBusyName(null)
    if (r.ok) {
      setActionNotice(`Forgot disabled entry for “${name}”.`)
      await refresh()
    } else {
      setActionError(r.error)
    }
  }

  const onAdded = async (): Promise<void> => {
    setAddOpen(false)
    setActionNotice('Server added.')
    await refresh()
  }

  const performRemove = async (): Promise<void> => {
    if (!confirm) return
    setRemoving(true)
    setActionError(null)
    const r = await clawbench.mcp.remove(confirm.name, confirm.scope)
    setRemoving(false)
    if (r.ok) {
      setConfirm(null)
      setActionNotice(`Removed “${confirm.name}”.`)
      await refresh()
    } else {
      setActionError(r.error)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">MCP Servers</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Manage Claude Code MCP servers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/70"
          >
            Refresh
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/80 hover:bg-emerald-500 text-white"
          >
            Add server
          </button>
        </div>
      </header>

      {state.status === 'ready' && (
        <div className="text-[11px] text-white/40 font-mono mb-4 truncate">
          {state.cliPath}
        </div>
      )}

      {actionNotice && (
        <div className="mb-3 text-xs text-emerald-400">{actionNotice}</div>
      )}

      {state.status === 'loading' && (
        <div className="text-sm text-white/50">Loading servers…</div>
      )}

      {state.status === 'error' && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <div className="font-medium mb-1">Failed to list MCP servers</div>
          <div className="font-mono text-[11px] whitespace-pre-wrap break-all">
            {state.error}
          </div>
          {!state.cliPath && (
            <div className="mt-2 text-white/60">
              Make sure the <code className="px-1 py-0.5 bg-white/5 rounded">claude</code> CLI
              is installed and on your PATH.
            </div>
          )}
        </div>
      )}

      {state.status === 'ready' && state.servers.length === 0 && (
        <div className="text-xs text-white/50 border border-dashed border-white/10 rounded-lg px-3 py-10 text-center">
          No MCP servers configured yet. Click “Add server” to register one.
        </div>
      )}

      {state.status === 'ready' && state.servers.length > 0 && (
        <div className="space-y-2">
          {state.servers.map((s) => (
            <ServerCard
              key={s.name}
              server={s}
              busy={busyName === s.name}
              onInspect={() => setDetailName(s.name)}
              onDisable={() => disableServer(s.name)}
              onRemove={() => {
                setActionError(null)
                setConfirm({ name: s.name, scope: undefined })
              }}
            />
          ))}
        </div>
      )}

      {disabled.length > 0 && (
        <div className="mt-8">
          <div className="text-xs text-white/40 mb-2 uppercase tracking-wider">
            Disabled ({disabled.length})
          </div>
          <div className="space-y-2">
            {disabled.map((d) => (
              <DisabledCard
                key={d.name}
                entry={d}
                busy={busyName === d.name}
                onEnable={() => enableServer(d.name)}
                onForget={() => forgetDisabled(d.name)}
              />
            ))}
          </div>
        </div>
      )}

      <AddServerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={onAdded}
      />

      <ServerDetailModal
        name={detailName}
        onClose={() => setDetailName(null)}
      />

      {confirm && (
        <ConfirmRemove
          name={confirm.name}
          scope={confirm.scope}
          onChangeScope={(s) => setConfirm({ ...confirm, scope: s })}
          onCancel={() => setConfirm(null)}
          onConfirm={performRemove}
          loading={removing}
          error={actionError}
        />
      )}
    </div>
  )
}

function ServerCard({
  server,
  busy,
  onInspect,
  onDisable,
  onRemove
}: {
  server: MCPServer
  busy: boolean
  onInspect: () => void
  onDisable: () => void
  onRemove: () => void
}): React.JSX.Element {
  const meta = STATUS_META[server.status]
  return (
    <div className="border border-white/5 rounded-lg px-4 py-3 bg-white/[0.02] flex items-center gap-4">
      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-white/90">{server.name}</span>
          <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/50">
            {server.transport}
          </span>
          <span className={`text-[11px] ${meta.text}`}>{meta.label}</span>
        </div>
        <div className="text-[11px] text-white/40 mt-0.5 font-mono truncate">
          {server.endpoint}
        </div>
        {server.statusDetail && server.status !== 'connected' && (
          <div className={`text-[11px] mt-0.5 ${meta.text}`}>
            {server.statusDetail}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onInspect}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-50"
        >
          Details
        </button>
        <button
          onClick={onDisable}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-50"
          title="Save config and remove from CC; re-enable later"
        >
          {busy ? '…' : 'Disable'}
        </button>
        <button
          onClick={onRemove}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-red-500/20 text-white/70 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function DisabledCard({
  entry,
  busy,
  onEnable,
  onForget
}: {
  entry: DisabledMCPEntry
  busy: boolean
  onEnable: () => void
  onForget: () => void
}): React.JSX.Element {
  const endpoint =
    entry.kind === 'stdio'
      ? `${entry.command}${entry.args.length > 0 ? ' ' + entry.args.join(' ') : ''}`
      : entry.url
  return (
    <div className="border border-white/5 rounded-lg px-4 py-3 bg-white/[0.01] flex items-center gap-4 opacity-80">
      <span className="inline-block w-2 h-2 rounded-full shrink-0 bg-white/20" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-white/70">{entry.name}</span>
          <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40">
            {entry.kind}
          </span>
          <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40">
            {entry.scope}
          </span>
          <span className="text-[11px] text-white/40">Disabled</span>
        </div>
        <div className="text-[11px] text-white/30 mt-0.5 font-mono truncate">
          {endpoint}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEnable}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded bg-emerald-500/70 hover:bg-emerald-500 text-white disabled:opacity-50"
        >
          {busy ? '…' : 'Enable'}
        </button>
        <button
          onClick={onForget}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-red-500/20 text-white/60 disabled:opacity-50"
          title="Drop the stored config without restoring"
        >
          Forget
        </button>
      </div>
    </div>
  )
}

function ConfirmRemove({
  name,
  scope,
  onChangeScope,
  onCancel,
  onConfirm,
  loading,
  error
}: {
  name: string
  scope: MCPScope | undefined
  onChangeScope: (s: MCPScope | undefined) => void
  onCancel: () => void
  onConfirm: () => void
  loading: boolean
  error: string | null
}): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="bg-[#15171d] border border-white/10 rounded-xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-base font-semibold">Remove server</h2>
          <p className="text-xs text-white/60 mt-1">
            This will run{' '}
            <code className="font-mono text-white/80">
              claude mcp remove {name}
              {scope ? ` -s ${scope}` : ''}
            </code>
            .
          </p>
        </div>
        <div className="p-5 space-y-3 text-xs">
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-1">
              Scope
            </div>
            <div className="flex gap-1">
              {([undefined, 'local', 'user', 'project'] as (MCPScope | undefined)[]).map(
                (s) => (
                  <button
                    key={s ?? 'auto'}
                    onClick={() => onChangeScope(s)}
                    className={`text-[11px] px-2.5 py-1 rounded-md ${
                      scope === s
                        ? 'bg-white/10 text-white'
                        : 'bg-transparent text-white/50 hover:text-white'
                    }`}
                  >
                    {s ?? 'auto'}
                  </button>
                )
              )}
            </div>
            <p className="text-[11px] text-white/40 mt-1">
              “auto” lets the CLI pick — works if the server exists in only one scope.
            </p>
          </div>
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 font-mono whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-white/5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/70"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-md bg-red-500/80 hover:bg-red-500 text-white disabled:opacity-50"
          >
            {loading ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default McpPanel
