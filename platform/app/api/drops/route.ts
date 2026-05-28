import { NextRequest, NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'
import { createContentDrop } from '@/server/drops.js'

export async function POST(request: NextRequest) {
  if (!hasMultica()) return NextResponse.json({ error: 'MULTICA_DATABASE_URL not configured' }, { status: 503 })
  try {
    const { workspace_slug, angle, context, channels, priority } = await request.json()
    if (!workspace_slug || !angle) {
      return NextResponse.json({ error: 'workspace_slug and angle required' }, { status: 400 })
    }
    const result = await createContentDrop({ workspace_slug, angle, context, channels, priority })
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
