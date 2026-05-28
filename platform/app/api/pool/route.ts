import { NextRequest, NextResponse } from 'next/server'
import { hasDB, query } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET() {
  if (!hasDB()) return NextResponse.json({ error: 'no database' })
  try {
    const people = await store.listPeople()
    const result = []
    for (const p of people) {
      const assignments = await query(
        `SELECT aa.agent_id, w.slug AS workspace_slug, a.channel
         FROM agent_assignments aa
         JOIN agents a ON a.id = aa.agent_id
         JOIN workspaces w ON w.id = a.workspace_id
         WHERE aa.person_id = $1`,
        [p.id]
      )
      result.push({ ...p, assignments, current_workload: assignments.length })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const { handle, name, role, channels, max_workload } = await request.json()
    if (!handle || !name || !role) return NextResponse.json({ error: 'handle, name, role required' }, { status: 400 })
    const person = await store.createPerson({ handle, name, role, channels, max_workload })
    return NextResponse.json(person)
  } catch (e: unknown) {
    const msg = (e as Error).message || ''
    if (msg.includes('unique')) return NextResponse.json({ error: 'handle already exists' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
