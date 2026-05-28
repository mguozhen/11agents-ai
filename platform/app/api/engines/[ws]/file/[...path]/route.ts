import { NextRequest, NextResponse } from 'next/server'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ws: string; path: string[] }> }) {
  const { ws, path: pathParts } = await params
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const workspace = await store.getWorkspace(ws)
    if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
    const filePath = pathParts.join('/')
    const content = await store.getEngineFile(workspace.id, filePath)
    if (content === null) return NextResponse.json({ error: 'file not found' }, { status: 404 })
    return NextResponse.json({ file_path: filePath, content, workspace: workspace.slug })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ ws: string; path: string[] }> }) {
  const { ws, path: pathParts } = await params
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const workspace = await store.getWorkspace(ws)
    if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
    const filePath = pathParts.join('/')
    const { content } = await request.json()
    if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 })
    const result = await store.upsertEngineFile(workspace.id, filePath, content)
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
