'use client'
import './StateFilter.css'

type PipelineState = 'new-idea' | 'draft' | 'bank' | 'published'

type Counts = Record<PipelineState, number>

const STATES: { key: PipelineState; emoji: string; label: string }[] = [
  { key: 'new-idea',  emoji: '💡', label: 'New Idea' },
  { key: 'draft',     emoji: '📝', label: 'Draft (WIP)' },
  { key: 'bank',      emoji: '🎯', label: 'Content Bank' },
  { key: 'published', emoji: '📰', label: 'Published' },
]

export function StateFilter({
  active,
  onChange,
  counts,
}: {
  active: PipelineState
  onChange: (s: PipelineState) => void
  counts: Counts
}) {
  return (
    <div className="dj-states">
      {STATES.map(s => {
        const isActive = active === s.key
        return (
          <button
            key={s.key}
            type="button"
            className={`dj-state ${isActive ? 'is-active' : ''} dj-state-${s.key}`}
            onClick={() => onChange(s.key)}
          >
            <span className="dj-state-emoji">{s.emoji}</span>
            <span className="dj-state-label">{s.label}</span>
            <span className="dj-state-count">({counts[s.key]})</span>
          </button>
        )
      })}
    </div>
  )
}
