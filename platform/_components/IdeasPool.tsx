'use client'
import { useState } from 'react'
import type { ContentItem } from '@/_hooks/useContent'
import './IdeasPool.css'

export function IdeasPool({
  items,
  onPromote,
  onReject,
  onCreateIdea,
}: {
  items: ContentItem[]
  onPromote: (item: ContentItem) => Promise<void> | void
  onReject: (item: ContentItem, reason: string) => Promise<void> | void
  onCreateIdea: (topic: string, angle: string, hook: string) => Promise<void>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [newAngle, setNewAngle] = useState('')
  const [newHook, setNewHook] = useState('')

  const createForm = showCreate && (
    <div className="ip-create-form">
      <input
        autoFocus
        className="ip-create-input"
        placeholder="Topic — what's the idea? (required)"
        value={newTopic}
        onChange={e => setNewTopic(e.target.value)}
      />
      <input
        className="ip-create-input"
        placeholder="Angle — framing or perspective (optional)"
        value={newAngle}
        onChange={e => setNewAngle(e.target.value)}
      />
      <input
        className="ip-create-input"
        placeholder="Hook seed — opening sentence (optional)"
        value={newHook}
        onChange={e => setNewHook(e.target.value)}
      />
      <div className="ip-create-actions">
        <button
          className="btn-ip btn-ip-cancel"
          onClick={() => { setShowCreate(false); setNewTopic(''); setNewAngle(''); setNewHook('') }}
        >Cancel</button>
        <button
          className="btn-ip btn-ip-promote"
          disabled={!newTopic.trim() || creating}
          onClick={async () => {
            setCreating(true)
            await onCreateIdea(newTopic.trim(), newAngle.trim(), newHook.trim())
            setCreating(false)
            setShowCreate(false)
            setNewTopic(''); setNewAngle(''); setNewHook('')
          }}
        >{creating ? '⟳ Creating…' : '✓ Create'}</button>
      </div>
    </div>
  )

  if (items.length === 0) {
    return (
      <div>
        <div className="ip-header" style={{ marginBottom: 16 }}>
          <h3>💡 Ideas Pool</h3>
          <button className="ip-new-btn" onClick={() => setShowCreate(v => !v)}>
            {showCreate ? '✕ Cancel' : '+ New Idea'}
          </button>
        </div>
        {createForm}
        <div className="ip-empty">
          <div className="ip-empty-icon">💡</div>
          <h3>Ideas Pool is empty</h3>
          <p>Run <code>scripts/source-ideas.py --project &lt;slug&gt;</code> or wait for the daily cron at 08:00 UTC.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ideas-pool">
      <div className="ip-header">
        <h3>💡 Ideas Pool · {items.length} fresh</h3>
        <span className="ip-hint">Promote → triggers runner with this topic · Reject → writes anti-pattern</span>
        <button className="ip-new-btn" onClick={() => setShowCreate(v => !v)}>
          {showCreate ? '✕ Cancel' : '+ New Idea'}
        </button>
      </div>
      {createForm}
      <div className="ip-grid">
        {items.map(it => {
          const fm = it.frontmatter as Record<string, string>
          const topic = fm.topic || it.preview.slice(0, 80)
          const source = fm.source || 'manual'
          const hook = fm.suggested_hook || ''
          const audience = fm.target_audience || ''
          const created = fm.created_at || ''
          const ageDays = created ? Math.floor((Date.now() - new Date(created).getTime()) / 86400000) : null
          const rationale = (() => {
            const m = it.preview.match(/\*\*Rationale\*\*[:：]?\s*([^\n]+)/i)
            return m ? m[1] : ''
          })()
          const angle = (() => {
            const m = it.preview.match(/\*\*Angle\*\*[:：]?\s*([^\n]+)/i)
            return m ? m[1] : ''
          })()
          const hookSeed = (() => {
            const m = it.preview.match(/\*\*Hook seed[^*]*\*\*[:：]?\s*([^\n]+)/i)
            return m ? m[1] : ''
          })()
          const isRejecting = rejectingId === it.id
          const isBusy = busyId === it.id

          return (
            <article key={it.id} className={`idea-card ${isBusy ? 'is-busy' : ''}`}>
              <header className="idea-head">
                <span className={`idea-source idea-source-${source}`}>{labelForSource(source)}</span>
                {ageDays !== null && <span className="idea-age">{ageDays === 0 ? 'today' : `${ageDays}d`}</span>}
              </header>
              <h4 className="idea-topic">{topic}</h4>
              <div className="idea-tags">
                <span className="idea-tag idea-tag-hook">{hook}</span>
                {audience && <span className="idea-tag idea-tag-aud">{audience}</span>}
                <span className="idea-tag idea-tag-agent">{it.agent}</span>
              </div>
              {rationale && <p className="idea-rationale">{rationale}</p>}
              {angle && <p className="idea-angle"><strong>Angle:</strong> {angle}</p>}
              {hookSeed && <p className="idea-hookseed">"{hookSeed}"</p>}
              <footer className="idea-actions">
                {isRejecting ? (
                  <>
                    <input
                      autoFocus
                      placeholder="why reject? (1 line)"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      className="idea-reason"
                    />
                    <button
                      className="btn-ip btn-ip-confirm"
                      onClick={async () => {
                        setBusyId(it.id)
                        await onReject(it, reason || 'No reason given')
                        setBusyId(null); setRejectingId(null); setReason('')
                      }}
                    >Send</button>
                    <button
                      className="btn-ip btn-ip-cancel"
                      onClick={() => { setRejectingId(null); setReason('') }}
                    >×</button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-ip btn-ip-promote"
                      disabled={isBusy}
                      onClick={async () => {
                        setBusyId(it.id)
                        await onPromote(it)
                        setBusyId(null)
                      }}
                    >{isBusy ? '⟳ Drafting…' : '🚀 Promote to Draft'}</button>
                    <button
                      className="btn-ip btn-ip-reject"
                      onClick={() => setRejectingId(it.id)}
                    >✗ Reject</button>
                  </>
                )}
              </footer>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function labelForSource(s: string): string {
  return {
    'contentos-daily': '🤖 ContentOS Daily',
    'reddit-hot': '👽 Reddit Hot',
    'x-trending': '✕ X Trending',
    'voc-data': '📊 VOC Data',
    'manual': '✋ Manual',
  }[s] || s
}
