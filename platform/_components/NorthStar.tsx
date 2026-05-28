'use client'
import { useEffect, useState } from 'react'
import { postJson } from '@/_hooks/useToken'
import './NorthStar.css'

type Stage = 'traffic' | 'registrations' | 'payments' | 'revenue_usd'

type StageCell = { actual: number; target: number | null; pct: number | null }

type PeriodData = {
  period: string
  label: string
  from: string
  days_logged: number
  traffic: StageCell
  registrations: StageCell
  payments: StageCell
  revenue_usd: StageCell
}

type Person = {
  name: string
  agents: { id: string; role: string; activate: boolean; goal: string }[]
  builder_n: number
  reviewer_n: number
}

type Data = {
  project: string
  has_targets: boolean
  targets_meta: { data_source?: string; last_target_review?: string } | null
  periods: Record<'daily' | 'weekly' | 'monthly' | 'annual', PeriodData>
  stage_owners: Record<Stage, string[]>
  people: Record<string, Person>
  recent_actuals: { date: string; traffic?: number; registrations?: number; payments?: number; revenue_usd?: number; note?: string }[]
}

const STAGE_META: { key: Stage; label: string; emoji: string; format: (n: number) => string }[] = [
  { key: 'traffic',       label: '流量 Traffic',    emoji: '🚦', format: n => n.toLocaleString() },
  { key: 'registrations', label: '注册 Reg',        emoji: '📝', format: n => n.toLocaleString() },
  { key: 'payments',      label: '付费 Paid',       emoji: '💳', format: n => n.toFixed(0) },
  { key: 'revenue_usd',   label: '收入 Revenue',    emoji: '💰', format: n => '$' + n.toLocaleString() },
]

function pctColor(p: number | null): string {
  if (p === null) return '#bbb'
  if (p >= 100) return '#2a7a2a'
  if (p >= 70)  return '#80a800'
  if (p >= 40)  return '#d88a00'
  return '#c95400'
}

export function NorthStar({ slug, token }: { slug: string; token: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'annual'>('weekly')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), traffic: '', registrations: '', payments: '', revenue_usd: '', note: '' })
  const [busy, setBusy] = useState(false)

  function load() {
    fetch(`/api/north-star?project=${slug}`)
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d) })
      .catch(e => setErr(String(e)))
  }
  useEffect(() => { setErr(''); setData(null); load() }, [slug])

  if (err) return <div className="ns-err">Error: {err}</div>
  if (!data) return <div className="ns-loading">Loading North Star…</div>

  const p = data.periods[period]

  async function submitActual() {
    setBusy(true)
    const r = await postJson<{ ok?: boolean; error?: string }>('/api/north-star/actual', {
      project: slug,
      date: form.date,
      traffic: Number(form.traffic) || 0,
      registrations: Number(form.registrations) || 0,
      payments: Number(form.payments) || 0,
      revenue_usd: Number(form.revenue_usd) || 0,
      note: form.note || '',
    }, token)
    setBusy(false)
    if (r.error) { alert('Submit failed: ' + r.error); return }
    setShowForm(false)
    setForm({ date: new Date().toISOString().slice(0, 10), traffic: '', registrations: '', payments: '', revenue_usd: '', note: '' })
    load()
  }

  return (
    <div className="ns">
      <div className="ns-header">
        <div className="ns-title">
          <span>📊 North Star — {data.project}</span>
          <span className="ns-meta">
            {data.has_targets ? `targets v ${data.targets_meta?.last_target_review || '—'} · ${data.targets_meta?.data_source || 'manual'}` : '⚠ no targets.yaml yet'}
          </span>
        </div>
        <div className="ns-actions">
          <div className="ns-period-toggle">
            {(['daily', 'weekly', 'monthly', 'annual'] as const).map(k => (
              <button key={k} className={period === k ? 'is-active' : ''} onClick={() => setPeriod(k)}>
                {k === 'daily' ? '今日' : k === 'weekly' ? '本周' : k === 'monthly' ? '本月' : '本年'}
              </button>
            ))}
          </div>
          <button className="ns-log-btn" onClick={() => setShowForm(s => !s)}>
            {showForm ? '取消' : '📝 录入数据'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="ns-form">
          <div className="ns-form-grid">
            <label>日期<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
            <label>流量<input type="number" min="0" value={form.traffic} onChange={e => setForm({ ...form, traffic: e.target.value })} placeholder="0" /></label>
            <label>注册<input type="number" min="0" value={form.registrations} onChange={e => setForm({ ...form, registrations: e.target.value })} placeholder="0" /></label>
            <label>付费数<input type="number" min="0" value={form.payments} onChange={e => setForm({ ...form, payments: e.target.value })} placeholder="0" /></label>
            <label>收入 (USD)<input type="number" min="0" value={form.revenue_usd} onChange={e => setForm({ ...form, revenue_usd: e.target.value })} placeholder="0" /></label>
            <label className="ns-note">备注<input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="optional" /></label>
          </div>
          <button className="ns-submit" onClick={submitActual} disabled={busy}>{busy ? '提交中…' : '提交本日数据'}</button>
        </div>
      )}

      <div className="ns-stage-row">
        {STAGE_META.map(s => {
          const cell = p[s.key]
          const ratio = cell.target ? Math.min(100, cell.actual / cell.target * 100) : 0
          const owners = data.stage_owners[s.key] || []
          return (
            <div key={s.key} className="ns-stage">
              <div className="ns-stage-head">
                <span className="ns-stage-emoji">{s.emoji}</span>
                <span className="ns-stage-label">{s.label}</span>
              </div>
              <div className="ns-stage-value">
                <span className="ns-actual">{s.format(cell.actual)}</span>
                <span className="ns-target">/ {cell.target !== null ? s.format(cell.target) : '—'}</span>
              </div>
              <div className="ns-bar">
                <div className="ns-bar-fill" style={{ width: ratio + '%', background: pctColor(cell.pct) }} />
              </div>
              <div className="ns-stage-pct" style={{ color: pctColor(cell.pct) }}>
                {cell.pct !== null ? `${cell.pct}%` : 'no target'}
              </div>
              {owners.length > 0 && (
                <div className="ns-owners">
                  <span className="ns-owners-label">负责</span>
                  {owners.map(o => <span key={o} className="ns-owner-chip">{o}</span>)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="ns-people-section">
        <div className="ns-section-title">人员拆分 — Iron Triangle 责任分布</div>
        <table className="ns-people-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>Builder</th>
              <th>Reviewer</th>
              <th>负责 agent</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(data.people)
              .sort((a, b) => (b.builder_n + b.reviewer_n) - (a.builder_n + a.reviewer_n))
              .map(person => (
                <tr key={person.name}>
                  <td className="ns-person-name">{person.name}</td>
                  <td className="ns-n">{person.builder_n}</td>
                  <td className="ns-n">{person.reviewer_n}</td>
                  <td className="ns-person-agents">
                    {person.agents.map(a => (
                      <span key={a.id + a.role} className={`ns-agent-chip ${a.role}`} title={a.goal.slice(0, 100)}>
                        {a.id.split('-')[0]} {a.role === 'builder' ? '🧱' : '👁'}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="ns-history">
        <div className="ns-section-title">最近 14 天录入</div>
        {data.recent_actuals.length === 0 ? (
          <div className="ns-empty">还没有数据。点上面"📝 录入数据"开始。</div>
        ) : (
          <table className="ns-history-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>流量</th>
                <th>注册</th>
                <th>付费</th>
                <th>收入</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_actuals.slice().reverse().map((r, i) => (
                <tr key={r.date + i}>
                  <td>{r.date}</td>
                  <td className="ns-n">{r.traffic || ''}</td>
                  <td className="ns-n">{r.registrations || ''}</td>
                  <td className="ns-n">{r.payments || ''}</td>
                  <td className="ns-n">{r.revenue_usd ? '$' + r.revenue_usd : ''}</td>
                  <td className="ns-note-cell">{r.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
