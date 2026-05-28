import { NextRequest, NextResponse } from 'next/server'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function POST(request: NextRequest) {
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const { agent_id, person_id, role } = await request.json()
    if (!agent_id || !person_id || !role) {
      return NextResponse.json({ error: 'agent_id, person_id, role required' }, { status: 400 })
    }
    const result = await store.assign(agent_id, person_id, role)
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
