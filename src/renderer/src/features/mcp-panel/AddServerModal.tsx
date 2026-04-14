import { useState } from 'react'
import { clawbench } from '../../lib/ipc'
import type { AddServerInput, MCPScope } from '../../../../shared/types'

type Kind = 'stdio' | 'http' | 'sse'

type Props = {
  open: boolean
  onClose: () => void
  onAdded: () => void
}

type KV = { key: string; value: string }

function parseArgs(input: string): string[] {
  const out: string[] = []
  let buf = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (quote) {
      if (c === quote) quote = null
      else buf += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (/\s/.test(c)) {
      if (buf.length > 0) {
        out.push(buf)
        buf = ''
      }
      continue
    }
    buf += c
  }
  if (buf.length > 0) out.push(buf)
  return out
}

function AddServerModal({ open, onClose, onAdded }: Props): React.JSX.Element | null {
  const [kind, setKind] = useState<Kind>('stdio')
  const [name, setName] = useState('')
  const [scope, setScope] = useState<MCPScope>('local')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [url, setUrl] = useState('')
  const [env, setEnv] = useState<KV[]>([])
  const [headers, setHeaders] = useState<KV[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const reset = (): void => {
    setKind('stdio')
    setName('')
    setScope('local')
    setCommand('')
    setArgsText('')
    setUrl('')
    setEnv([])
    setHeaders([])
    setError(null)
    setSubmitting(false)
  }

  const close = (): void => {
    reset()
    onClose()
  }

  const kvRecord = (arr: KV[]): Record<string, string> => {
    const rec: Record<string, string> = {}
    for (const { key, value } of arr) {
      const k = key.trim()
      if (k) rec[k] = value
    }
    return rec
  }

  const submit = async (): Promise<void> => {
    setError(null)
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    let payload: AddServerInput
    if (kind === 'stdio') {
      if (!command.trim()) {
        setError('Command is required for stdio servers.')
        return
      }
      payload = {
        kind: 'stdio',
        name: name.trim(),
        scope,
        command: command.trim(),
        args: parseArgs(argsText),
        env: kvRecord(env)
      }
    } else {
      if (!url.trim()) {
        setError('URL is required.')
        return
      }
      payload = {
        kind,
        name: name.trim(),
        scope,
        url: url.trim(),
        headers: kvRecord(headers)
      }
    }
    setSubmitting(true)
    const r = await clawbench.mcp.add(payload)
    setSubmitting(false)
    if (r.ok) {
      reset()
      onAdded()
    } else {
      setError(r.error)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={close}
    >
      <div
        className="bg-[#15171d] border border-white/10 rounded-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Add MCP server</h2>
            <p className="text-xs text-white/50 mt-0.5">
              Runs <code className="font-mono">claude mcp add</code> under the hood.
            </p>
          </div>
          <button
            onClick={close}
            className="text-white/40 hover:text-white/80 text-lg leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="overflow-auto p-5 space-y-4 text-xs">
          <div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-1.5">
              Transport
            </div>
            <div className="flex gap-1">
              {(['stdio', 'http', 'sse'] as Kind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`text-xs px-3 py-1.5 rounded-md ${
                    kind === k
                      ? 'bg-white/10 text-white'
                      : 'bg-transparent text-white/50 hover:text-white'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-server"
              className="w-full text-xs bg-black/30 border border-white/5 rounded px-2 py-1.5 font-mono text-white/90 focus:outline-none focus:border-white/20"
            />
          </Field>

          <Field label="Scope">
            <div className="flex gap-1">
              {(['local', 'user', 'project'] as MCPScope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`text-[11px] px-2.5 py-1 rounded-md ${
                    scope === s
                      ? 'bg-white/10 text-white'
                      : 'bg-transparent text-white/50 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>

          {kind === 'stdio' ? (
            <>
              <Field label="Command">
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx"
                  className="w-full text-xs bg-black/30 border border-white/5 rounded px-2 py-1.5 font-mono text-white/90 focus:outline-none focus:border-white/20"
                />
              </Field>
              <Field label="Args" hint="Space separated, quotes supported">
                <input
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  placeholder="-y my-mcp-server --flag"
                  className="w-full text-xs bg-black/30 border border-white/5 rounded px-2 py-1.5 font-mono text-white/90 focus:outline-none focus:border-white/20"
                />
              </Field>
              <KVEditor label="Environment" items={env} onChange={setEnv} keyPlaceholder="API_KEY" />
            </>
          ) : (
            <>
              <Field label="URL">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://mcp.example.com/mcp"
                  className="w-full text-xs bg-black/30 border border-white/5 rounded px-2 py-1.5 font-mono text-white/90 focus:outline-none focus:border-white/20"
                />
              </Field>
              <KVEditor
                label="Headers"
                items={headers}
                onChange={setHeaders}
                keyPlaceholder="Authorization"
              />
            </>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 font-mono whitespace-pre-wrap break-all">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/5 flex justify-end gap-2">
          <button
            onClick={close}
            className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/70"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/80 hover:bg-emerald-500 text-white disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add server'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[11px] text-white/40 uppercase tracking-wider">{label}</div>
        {hint && <div className="text-[10px] text-white/30">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function KVEditor({
  label,
  items,
  onChange,
  keyPlaceholder
}: {
  label: string
  items: KV[]
  onChange: (next: KV[]) => void
  keyPlaceholder?: string
}): React.JSX.Element {
  const updateAt = (i: number, patch: Partial<KV>): void => {
    const next = [...items]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  const remove = (i: number): void => {
    const next = [...items]
    next.splice(i, 1)
    onChange(next)
  }
  return (
    <Field label={label}>
      <div className="space-y-1">
        {items.map((kv, i) => (
          <div key={i} className="flex gap-1">
            <input
              value={kv.key}
              onChange={(e) => updateAt(i, { key: e.target.value })}
              placeholder={keyPlaceholder}
              className="flex-1 text-xs bg-black/30 border border-white/5 rounded px-2 py-1.5 font-mono text-white/90 focus:outline-none focus:border-white/20"
            />
            <input
              value={kv.value}
              onChange={(e) => updateAt(i, { value: e.target.value })}
              placeholder="value"
              className="flex-1 text-xs bg-black/30 border border-white/5 rounded px-2 py-1.5 font-mono text-white/90 focus:outline-none focus:border-white/20"
            />
            <button
              onClick={() => remove(i)}
              className="text-[11px] text-white/40 hover:text-red-400 px-2"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...items, { key: '', value: '' }])}
          className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/60"
        >
          + Add
        </button>
      </div>
    </Field>
  )
}

export default AddServerModal
