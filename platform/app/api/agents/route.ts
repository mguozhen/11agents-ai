import { NextRequest, NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get('project') || ''
  if (!project) return NextResponse.json({ error: 'project required' }, { status: 400 })

  if (!hasMultica()) return NextResponse.json({ error: 'multica not configured' }, { status: 503 })
  if (!hasDB()) return NextResponse.json({ error: 'GTM_DATABASE required' }, { status: 503 })

  const ws = await store.getWorkspace(project)
  if (!ws?.multica_workspace_slug) return NextResponse.json({ error: 'no multica workspace bound to this project' }, { status: 400 })

  const { getWorkspaceAgents } = await import('@/server/multica-db.js')
  const agents = await getWorkspaceAgents(ws.multica_workspace_slug)
  return NextResponse.json({ project, agents })
}
