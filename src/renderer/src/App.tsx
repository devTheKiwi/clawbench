import { useState } from 'react'
import HooksEditor from './features/hooks-editor/HooksEditor'
import McpPanel from './features/mcp-panel/McpPanel'
import HealthDashboard from './features/health-dashboard/HealthDashboard'

type View = 'hooks' | 'mcp' | 'health'

const NAV: { id: View; label: string; hint: string }[] = [
  { id: 'hooks', label: 'Hooks', hint: 'Edit settings.json hooks' },
  { id: 'mcp', label: 'MCP', hint: 'Manage MCP servers' },
  { id: 'health', label: 'Health', hint: 'Run diagnostics' }
]

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('hooks')

  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-white/5 bg-black/20 flex flex-col">
        <div className="px-5 py-4 border-b border-white/5">
          <div className="text-sm font-semibold tracking-wide">Clawbench</div>
          <div className="text-[11px] text-white/40">Claude Code control center</div>
        </div>
        <nav className="flex-1 py-2">
          {NAV.map((item) => {
            const active = view === item.id
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`w-full text-left px-5 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <div>{item.label}</div>
                <div className="text-[11px] text-white/40">{item.hint}</div>
              </button>
            )
          })}
        </nav>
        <div className="px-5 py-3 text-[10px] text-white/30 border-t border-white/5">
          v0.0.1
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        {view === 'hooks' && <HooksEditor />}
        {view === 'mcp' && <McpPanel />}
        {view === 'health' && <HealthDashboard />}
      </main>
    </div>
  )
}

export default App
