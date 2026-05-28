'use client'
import { useEffect, useState } from 'react'
import './Ledger.css'

type TypeCount = { blog: number; video: number; reddit: number; other: number }
type CostEntry = { count: number; unit: number; total: number }
type CostEstimate = { blog: CostEntry; video: CostEntry; reddit: CostEntry; other: CostEntry; grand_total: number }
type Issue = { id: string; title: string; status: string; created_at: string; updated_at: string; agent_name: string | null }

type LedgerData = {
  counts: TypeCount
  cost_estimate: CostEstimate
  issues: Issue[]
  total_issues: number
  page: number
  page_size: number
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  done:        { label: '已完成',    color: '#166534', bg: '#dcfce7' },
  in_progress: { label: '进行中',    color: '#1d4ed8', bg: '#dbeafe' },
  in_review:   { label: '待审核',    color: '#92400e', bg: '#fef3c7' },
  cancelled:   { label: '已取消',    color: '#6b7280', bg: '#f3f4f6' },
  backlog:     { label: '待开始',    color: '#6b7280', bg: '#f3f4f6' },
}

const TYPE_META = [
  { key: 'blog',   label: '官网博客', emoji: '📝', color: '#16a34a' },
  { key: 'video',  label: '视频',     emoji: '🎬', color: '#dc2626' },
  { key: 'reddit', label: 'Reddit',   emoji: '🔴', color: '#ff4500' },
]

export function Ledger({ slug }: { slug: string }) {
  const [data, setData] = useState<LedgerData | null>(null)
  const [page, setPage] = useState(1)
  const [err, setErr] = useState('')

  function load(p: number) {
    setErr('')
    fetch(`/api/ledger?page=${p}&project=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d) })
      .catch(e => setErr(String(e)))
  }

  useEffect(() => { load(page) }, [page, slug])

  if (err) return <div className="ledger-err">Error: {err}</div>
  if (!data) return <div className="ledger-loading">Loading ledger…</div>

  const { counts, cost_estimate: cost, issues, total_issues, page_size } = data
  const totalPages = Math.ceil(total_issues / page_size)
  const totalDone = counts.blog + counts.video + counts.reddit + counts.other

  return (
    <div className="ledger">
      <div className="ledger-header">
        <div className="ledger-title">📒 Swarm Ledger</div>
      </div>

      {/* Metric cards */}
      <div className="ldg-cards">
        {TYPE_META.map(t => (
          <div key={t.key} className="ldg-card">
            <div className="ldg-card-emoji">{t.emoji}</div>
            <div className="ldg-card-count" style={{ color: t.color }}>
              {counts[t.key as keyof TypeCount]}
            </div>
            <div className="ldg-card-label">{t.label}</div>
            <div className="ldg-card-sub">已完成</div>
          </div>
        ))}
        <div className="ldg-card ldg-card-total">
          <div className="ldg-card-emoji">✅</div>
          <div className="ldg-card-count">{totalDone}</div>
          <div className="ldg-card-label">总产出</div>
          <div className="ldg-card-sub">已完成</div>
        </div>
      </div>

      {/* Cost estimate */}
      <div className="ldg-cost-card">
        <div className="ldg-cost-title">💰 费用预估</div>
        <div className="ldg-cost-rows">
          {TYPE_META.map(t => {
            const c = cost[t.key as keyof CostEstimate] as CostEntry
            return (
              <div key={t.key} className="ldg-cost-row">
                <span>{t.emoji} {t.label}</span>
                <span className="ldg-cost-calc">{c.count} × ¥{c.unit}</span>
                <span className="ldg-cost-amount">¥{c.total}</span>
              </div>
            )
          })}
          <div className="ldg-cost-divider" />
          <div className="ldg-cost-row ldg-cost-total-row">
            <span>合计</span>
            <span />
            <span className="ldg-cost-grand">¥{cost.grand_total}</span>
          </div>
        </div>
      </div>

      {/* Issues list */}
      <div className="ldg-section-title">最近任务 ({total_issues})</div>
      <table className="ledger-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>Agent</th>
            <th>状态</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          {issues.map(issue => {
            const s = STATUS_LABEL[issue.status] || { label: issue.status, color: '#888', bg: '#f4f4f4' }
            return (
              <tr key={issue.id}>
                <td className="ldg-issue-title">{issue.title}</td>
                <td><span className="dj-type-pill">{issue.agent_name || '—'}</span></td>
                <td>
                  <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                    {s.label}
                  </span>
                </td>
                <td className="ldg-issue-date">{new Date(issue.updated_at).toLocaleDateString('zh-CN')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ldg-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← 上一页</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页 →</button>
        </div>
      )}
    </div>
  )
}
