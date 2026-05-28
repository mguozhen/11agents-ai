import { NextRequest, NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function POST(request: NextRequest) {
  const { project, topic, angle, hook } = await request.json()
  if (!project || !topic) {
    return NextResponse.json({ error: 'project and topic are required' }, { status: 400 })
  }
  if (!hasMultica()) return NextResponse.json({ error: 'No database configured' }, { status: 503 })
  if (!hasDB()) return NextResponse.json({ error: 'GTM_DATABASE required' }, { status: 503 })
  try {
    const gtmWs = await store.getWorkspace(project)
    if (!gtmWs?.multica_workspace_slug) return NextResponse.json({ error: 'no multica workspace bound to this project' }, { status: 400 })
    const { getWorkspaceBySlug, getOrCreateGTMUser, createIssue } = await import('@/server/multica-db.js')
    const ws = await getWorkspaceBySlug(gtmWs.multica_workspace_slug)
    if (!ws) return NextResponse.json({ error: `multica workspace "${gtmWs.multica_workspace_slug}" not found` }, { status: 404 })
    const creatorId = await getOrCreateGTMUser()
    const parts: string[] = []
    if (angle) parts.push(`**Angle**: ${angle}`)
    if (hook) parts.push(`**Hook seed**: ${hook}`)
    const description = parts.join('\n\n')
    const id = await createIssue(ws.id, { title: topic, description, status: 'backlog', creatorId })
    return NextResponse.json({ ok: true, id })
  } catch (e: unknown) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}
