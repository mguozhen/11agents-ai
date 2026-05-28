'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useToken, authHeaders } from '@/_hooks/useToken'

type Person = {
  id: string
  handle: string
  name: string
  role: 'builder' | 'reviewer'
  channels: string[]
  max_workload: number
  current_workload: number
  assignments: { workspace_slug: string; channel: string }[]
}

const CHANNELS = ['reddit', 'x', 'blog', 'kol-koc', 'video', 'social', 'ads', 'edm', 'yelp']

export default function Pool() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newPerson, setNewPerson] = useState({ handle: '', name: '', role: 'builder', channels: [] as string[], max_workload: 3 })
  const [token] = useToken()

  const refresh = async () => {
    setLoading(true)
    const data = await fetch('/api/pool').then(r => r.json())
    setPeople(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const addPerson = async () => {
    const r = await fetch('/api/pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(newPerson),
    }).then(r => r.json())
    if (r.error) { alert(r.error); return }
    setShowAdd(false)
    setNewPerson({ handle: '', name: '', role: 'builder', channels: [], max_workload: 3 })
    await refresh()
  }

  const toggleChannel = (ch: string) => {
    setNewPerson(p => ({
      ...p,
      channels: p.channels.includes(ch) ? p.channels.filter(c => c !== ch) : [...p.channels, ch],
    }))
  }

  const coveredBuilders = new Set(people.filter(p => p.role === 'builder').flatMap(p => p.channels))
  const coveredReviewers = new Set(people.filter(p => p.role === 'reviewer').flatMap(p => p.channels))
  const gaps = CHANNELS.filter(ch => !coveredBuilders.has(ch) || !coveredReviewers.has(ch))

  if (loading) return <div style={{ padding: 32 }}>Loading pool...</div>

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link href="/" style={{ color: '#9ca3af', textDecoration: 'none' }}>← projects</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>People Pool</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)} style={{ marginLeft: 'auto' }}>
          + Add Person
        </button>
      </div>

      {gaps.length > 0 && (
        <div style={{ background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: 8, padding: '12px 16px', marginBottom: 24 }}>
          <strong>Coverage gaps:</strong> {gaps.join(', ')} — no builder or reviewer assigned
        </div>
      )}

      {showAdd && (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px' }}>Add Person</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Handle</label>
              <input value={newPerson.handle} onChange={e => setNewPerson(p => ({ ...p, handle: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #374151', background: '#111827', color: '#f9fafb', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Full Name</label>
              <input value={newPerson.name} onChange={e => setNewPerson(p => ({ ...p, name: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #374151', background: '#111827', color: '#f9fafb', boxSizing: 'border-box' as const }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Role</label>
            <select value={newPerson.role} onChange={e => setNewPerson(p => ({ ...p, role: e.target.value }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #374151', background: '#111827', color: '#f9fafb' }}>
              <option value="builder">Builder</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: '#9ca3af' }}>Channels</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CHANNELS.map(ch => (
                <button key={ch}
                  onClick={() => toggleChannel(ch)}
                  style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid #374151', cursor: 'pointer', fontSize: 12,
                    background: newPerson.channels.includes(ch) ? '#3b82f6' : '#374151', color: '#fff' }}>
                  {ch}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" onClick={addPerson}>Save Person</button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #374151', color: '#9ca3af', textAlign: 'left' as const }}>
            <th style={{ padding: '8px 12px' }}>Handle</th>
            <th style={{ padding: '8px 12px' }}>Name</th>
            <th style={{ padding: '8px 12px' }}>Role</th>
            <th style={{ padding: '8px 12px' }}>Channels</th>
            <th style={{ padding: '8px 12px' }}>Workload</th>
            <th style={{ padding: '8px 12px' }}>Assigned</th>
          </tr>
        </thead>
        <tbody>
          {people.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #1f2937' }}>
              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.handle}</td>
              <td style={{ padding: '8px 12px' }}>{p.name}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ background: p.role === 'builder' ? '#1d4ed8' : '#065f46', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: '#fff' }}>
                  {p.role}
                </span>
              </td>
              <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{p.channels.join(', ')}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ color: p.current_workload >= p.max_workload ? '#ef4444' : '#10b981' }}>
                  {p.current_workload}/{p.max_workload}
                </span>
              </td>
              <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 11 }}>
                {p.assignments?.map(a => `${a.workspace_slug}/${a.channel}`).join(', ') || '—'}
              </td>
            </tr>
          ))}
          {people.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center' as const, color: '#6b7280' }}>No people in pool yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
