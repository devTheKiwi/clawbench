import { useEffect, useMemo, useState } from 'react'
import { clawbench } from '../../lib/ipc'
import {
  HOOK_EVENTS,
  MATCHER_SUPPORTED_EVENTS,
  type HookEvent,
  type HookGroup,
  type HooksConfig,
  type HookTemplate,
  type Settings,
  type SettingsScope
} from '../../../../shared/types'
import TemplateGallery from './TemplateGallery'
import TestRunModal from './TestRunModal'
import LogsPanel from './LogsPanel'

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; settings: Settings; path: string; exists: boolean }
  | { status: 'error'; error: string; path: string }

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; path: string; backupPath: string }
  | { status: 'error'; error: string }

type Tab = 'editor' | 'logs'

type TestTarget = { event: HookEvent; command: string } | null

function cloneHooks(hooks: HooksConfig | undefined): HooksConfig {
  return hooks ? JSON.parse(JSON.stringify(hooks)) : {}
}

function HooksEditor(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('editor')
  const [scope, setScope] = useState<SettingsScope>('user')
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' })
  const [draft, setDraft] = useState<HooksConfig>({})
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [testTarget, setTestTarget] = useState<TestTarget>(null)

  useEffect(() => {
    let cancelled = false
    setLoadState({ status: 'loading' })
    setSaveState({ status: 'idle' })
    clawbench.settings.read(scope).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setLoadState({
          status: 'ready',
          settings: res.settings,
          path: res.path,
          exists: res.exists
        })
        setDraft(cloneHooks(res.settings.hooks))
        setDirty(false)
      } else {
        setLoadState({ status: 'error', error: res.error, path: res.path })
      }
    })
    return () => {
      cancelled = true
    }
  }, [scope])

  const updateDraft = (next: HooksConfig): void => {
    setDraft(next)
    setDirty(true)
    setSaveState({ status: 'idle' })
  }

  const addHook = (event: HookEvent, overrides?: Partial<HookGroup>): void => {
    const groups = draft[event] ? [...draft[event]!] : []
    const supportsMatcher = MATCHER_SUPPORTED_EVENTS.includes(event)
    groups.push({
      ...(supportsMatcher ? { matcher: overrides?.matcher ?? '*' } : {}),
      ...(!supportsMatcher && overrides?.matcher
        ? { matcher: overrides.matcher }
        : {}),
      hooks: overrides?.hooks ?? [{ type: 'command', command: '' }]
    })
    updateDraft({ ...draft, [event]: groups })
  }

  const insertTemplate = (t: HookTemplate): void => {
    addHook(t.event, {
      matcher: t.matcher,
      hooks: [{ type: 'command', command: t.command }]
    })
  }

  const updateGroup = (
    event: HookEvent,
    index: number,
    patch: Partial<HookGroup>
  ): void => {
    const groups = [...(draft[event] ?? [])]
    groups[index] = { ...groups[index], ...patch }
    updateDraft({ ...draft, [event]: groups })
  }

  const updateCommand = (
    event: HookEvent,
    groupIndex: number,
    hookIndex: number,
    command: string
  ): void => {
    const groups = [...(draft[event] ?? [])]
    const group = { ...groups[groupIndex] }
    const hooks = [...group.hooks]
    hooks[hookIndex] = { ...hooks[hookIndex], command }
    group.hooks = hooks
    groups[groupIndex] = group
    updateDraft({ ...draft, [event]: groups })
  }

  const removeGroup = (event: HookEvent, index: number): void => {
    const groups = [...(draft[event] ?? [])]
    groups.splice(index, 1)
    const nextDraft = { ...draft }
    if (groups.length === 0) {
      delete nextDraft[event]
    } else {
      nextDraft[event] = groups
    }
    updateDraft(nextDraft)
  }

  const reload = async (): Promise<void> => {
    const res = await clawbench.settings.read(scope)
    if (res.ok) {
      setLoadState({
        status: 'ready',
        settings: res.settings,
        path: res.path,
        exists: res.exists
      })
      setDraft(cloneHooks(res.settings.hooks))
      setDirty(false)
      setSaveState({ status: 'idle' })
    }
  }

  const save = async (): Promise<void> => {
    if (loadState.status !== 'ready') return
    setSaveState({ status: 'saving' })
    const next: Settings = { ...loadState.settings }
    const hasAnyHooks = Object.keys(draft).length > 0
    if (hasAnyHooks) {
      next.hooks = draft
    } else {
      delete next.hooks
    }
    const res = await clawbench.settings.write(scope, next)
    if (res.ok) {
      setSaveState({ status: 'saved', path: res.path, backupPath: res.backupPath })
      setLoadState({ ...loadState, settings: next })
      setDirty(false)
    } else {
      setSaveState({ status: 'error', error: res.error })
    }
  }

  const activeEvents = useMemo(
    () => HOOK_EVENTS.filter((e) => draft[e] && draft[e]!.length > 0),
    [draft]
  )
  const emptyEvents = useMemo(
    () => HOOK_EVENTS.filter((e) => !draft[e] || draft[e]!.length === 0),
    [draft]
  )

  return (
    <div className="p-8 max-w-4xl">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold">Hook Editor</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Edit Claude Code hooks in settings.json
          </p>
        </div>
        {tab === 'editor' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGalleryOpen(true)}
              className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/70"
            >
              Templates
            </button>
            <button
              onClick={reload}
              className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/70"
            >
              Reload
            </button>
            <button
              onClick={save}
              disabled={!dirty || saveState.status === 'saving'}
              className={`text-xs px-3 py-1.5 rounded-md ${
                dirty
                  ? 'bg-emerald-500/80 hover:bg-emerald-500 text-white'
                  : 'bg-white/5 text-white/30 cursor-not-allowed'
              }`}
            >
              {saveState.status === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </header>

      <div className="flex gap-1 mb-4 text-xs border-b border-white/5">
        {(['editor', 'logs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 -mb-px border-b-2 transition-colors ${
              tab === t
                ? 'border-white text-white'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            {t === 'editor' ? 'Editor' : 'Logs'}
          </button>
        ))}
      </div>

      {tab === 'editor' && (
        <>
          <div className="flex gap-1 mb-5 text-xs">
            {(['user', 'local'] as SettingsScope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1.5 rounded-md ${
                  scope === s
                    ? 'bg-white/10 text-white'
                    : 'bg-transparent text-white/50 hover:text-white'
                }`}
              >
                {s === 'user' ? 'User (settings.json)' : 'Local (settings.local.json)'}
              </button>
            ))}
          </div>

          {loadState.status === 'loading' && (
            <div className="text-sm text-white/50">Loading…</div>
          )}
          {loadState.status === 'error' && (
            <div className="text-sm text-red-400">
              Failed to read {loadState.path}: {loadState.error}
            </div>
          )}

          {loadState.status === 'ready' && (
            <>
              <div className="text-[11px] text-white/40 mb-4 font-mono truncate">
                {loadState.path}
                {!loadState.exists && ' (will be created on save)'}
              </div>

              {saveState.status === 'saved' && (
                <div className="mb-4 text-xs text-emerald-400">
                  Saved. Backup: {saveState.backupPath || '(no prior file)'}
                </div>
              )}
              {saveState.status === 'error' && (
                <div className="mb-4 text-xs text-red-400">
                  Save failed: {saveState.error}
                </div>
              )}

              <div className="space-y-5">
                {activeEvents.map((event) => (
                  <EventSection
                    key={event}
                    event={event}
                    groups={draft[event] ?? []}
                    onAdd={() => addHook(event)}
                    onGroupChange={(i, patch) => updateGroup(event, i, patch)}
                    onCommandChange={(g, h, cmd) =>
                      updateCommand(event, g, h, cmd)
                    }
                    onRemove={(i) => removeGroup(event, i)}
                    onTest={(cmd) => setTestTarget({ event, command: cmd })}
                  />
                ))}
              </div>

              {emptyEvents.length > 0 && (
                <div className="mt-8">
                  <div className="text-xs text-white/40 mb-2 uppercase tracking-wider">
                    Add hook for event
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {emptyEvents.map((e) => (
                      <button
                        key={e}
                        onClick={() => addHook(e)}
                        className="text-xs px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/70"
                      >
                        + {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'logs' && <LogsPanel />}

      <TemplateGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onInsert={insertTemplate}
      />
      <TestRunModal
        open={testTarget !== null}
        event={testTarget?.event ?? 'PreToolUse'}
        command={testTarget?.command ?? ''}
        onClose={() => setTestTarget(null)}
      />
    </div>
  )
}

function EventSection({
  event,
  groups,
  onAdd,
  onGroupChange,
  onCommandChange,
  onRemove,
  onTest
}: {
  event: HookEvent
  groups: HookGroup[]
  onAdd: () => void
  onGroupChange: (index: number, patch: Partial<HookGroup>) => void
  onCommandChange: (groupIndex: number, hookIndex: number, command: string) => void
  onRemove: (index: number) => void
  onTest: (command: string) => void
}): React.JSX.Element {
  const supportsMatcher = MATCHER_SUPPORTED_EVENTS.includes(event)
  return (
    <section className="border border-white/5 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03]">
        <div className="font-mono text-xs text-white/80">{event}</div>
        <button
          onClick={onAdd}
          className="text-[11px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60"
        >
          + Add
        </button>
      </div>
      <div className="divide-y divide-white/5">
        {groups.map((group, i) => (
          <div key={i} className="px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              {supportsMatcher ? (
                <>
                  <label className="text-[11px] text-white/40 w-16">matcher</label>
                  <input
                    value={group.matcher ?? ''}
                    onChange={(e) =>
                      onGroupChange(i, { matcher: e.target.value || undefined })
                    }
                    placeholder="* or Bash or Bash(git commit.*)"
                    className="flex-1 text-xs bg-black/30 border border-white/5 rounded px-2 py-1 font-mono text-white/90 focus:outline-none focus:border-white/20"
                  />
                </>
              ) : (
                <div className="flex-1" />
              )}
              <button
                onClick={() => onRemove(i)}
                className="text-[11px] text-white/40 hover:text-red-400 px-2"
              >
                remove
              </button>
            </div>
            {group.hooks.map((h, hi) => (
              <div key={hi} className="flex items-start gap-2">
                <label className="text-[11px] text-white/40 w-16 pt-1.5">
                  command
                </label>
                <textarea
                  value={h.command}
                  onChange={(e) => onCommandChange(i, hi, e.target.value)}
                  rows={1}
                  className="flex-1 text-xs bg-black/30 border border-white/5 rounded px-2 py-1.5 font-mono text-white/90 resize-y focus:outline-none focus:border-white/20"
                  placeholder="~/.claude/hooks/my-hook.sh"
                />
                <button
                  onClick={() => onTest(h.command)}
                  disabled={!h.command.trim()}
                  className="text-[11px] px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Test
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

export default HooksEditor
