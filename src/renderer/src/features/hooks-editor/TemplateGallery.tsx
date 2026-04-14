import { HOOK_TEMPLATES } from './templates'
import type { HookTemplate } from '../../../../shared/types'

type Props = {
  open: boolean
  onClose: () => void
  onInsert: (template: HookTemplate) => void
}

function TemplateGallery({ open, onClose, onInsert }: Props): React.JSX.Element | null {
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
            <h2 className="text-base font-semibold">Template Gallery</h2>
            <p className="text-xs text-white/50 mt-0.5">
              Click to insert. You can edit the command afterwards.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 text-lg leading-none px-2"
          >
            ×
          </button>
        </div>
        <div className="overflow-auto p-4 space-y-2">
          {HOOK_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onInsert(t)
                onClose()
              }}
              className="w-full text-left p-3 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/10 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    <span className="text-[10px] font-mono text-white/40 uppercase">
                      {t.event}
                    </span>
                    {t.matcher && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/60">
                        {t.matcher}
                      </span>
                    )}
                    {t.platform === 'mac' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                        macOS
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/50 mt-1">{t.description}</div>
                  <div className="mt-2 font-mono text-[11px] text-white/70 bg-black/40 px-2 py-1 rounded truncate">
                    {t.command}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TemplateGallery
