'use client'
import './PreviewPane.css'
import type { ContentItem } from '@/_hooks/useContent'

export function PreviewPane({ item }: { item?: ContentItem }) {
  if (!item) {
    return (
      <aside className="dj-preview">
        <div className="dj-preview-empty">
          <div className="pe-icon">▱</div>
          <p>Pick a row to preview</p>
        </div>
      </aside>
    )
  }

  const fm = item.frontmatter
  const topic = (fm.topic as string) || ''
  const hookType = (fm.hook_type as string) || '—'
  const platform = (fm.platform as string) || '—'
  const reviewer = (fm.reviewer as string) || ''
  const generated = (fm.generated_at as string) || ''

  return (
    <aside className="dj-preview">
      <div className="dj-preview-card">
        <div className="dj-preview-hero">
          <div className="dj-preview-hero-icon">
            {platform === 'reddit' ? '👽' : platform === 'x' ? '✕' : platform === 'linkedin' ? 'in' : '📝'}
          </div>
          <div className="dj-preview-hero-meta">
            <div className="dj-preview-tag">{item.agent}</div>
            <div className="dj-preview-id" title={item.id}>{item.id.slice(0, 18)}…</div>
          </div>
        </div>
        <div className="dj-preview-body">
          <div className="dj-preview-card-inner">
            <p className="dj-preview-card-eyebrow">{hookType}</p>
            <h3 className="dj-preview-card-headline">{topic}</h3>
            <p className="dj-preview-card-copy">{item.preview.slice(0, 220)}</p>
            <div className="dj-preview-card-mock-cta">{item.state.toUpperCase()} →</div>
          </div>
          <div className="dj-preview-tip">
            🎯 reviewer: <strong>{reviewer || 'unassigned'}</strong>
          </div>
        </div>
        <footer className="dj-preview-footer">
          <div className="dj-preview-handle">
            <div className="dj-preview-avatar">{platform[0]?.toUpperCase() || '·'}</div>
            <div>
              <div className="dj-preview-handle-name">{item.project}</div>
              <div className="dj-preview-handle-sub">{generated.slice(0, 19).replace('T', ' ')}</div>
            </div>
          </div>
          <div className="dj-preview-swipe">{(item.size / 1024).toFixed(1)} KB</div>
        </footer>
      </div>
    </aside>
  )
}
