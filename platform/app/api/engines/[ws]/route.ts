import { NextRequest, NextResponse } from 'next/server'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const workspace = await store.getWorkspace(ws)
    if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
    const files = await store.listEngineFiles(workspace.id)
    return NextResponse.json(files)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
