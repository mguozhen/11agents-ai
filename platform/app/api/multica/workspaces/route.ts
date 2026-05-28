import { NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'

export async function GET() {
  if (!hasMultica()) return NextResponse.json({ error: 'multica not configured' }, { status: 503 })
  const { listAllWorkspaces } = await import('@/server/multica-db.js')
  const workspaces = await listAllWorkspaces()
  return NextResponse.json({ workspaces })
}
