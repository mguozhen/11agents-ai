import { NextRequest, NextResponse } from 'next/server'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const body = await request.json()
    const person = await store.updatePerson(id, body)
    if (!person) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(person)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
