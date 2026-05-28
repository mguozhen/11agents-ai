import { NextRequest, NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'
import { runAIReview } from '@/server/ai-review.js'

export async function POST(request: NextRequest) {
  if (!hasMultica()) return NextResponse.json({ error: 'MULTICA_DATABASE_URL not configured' }, { status: 503 })
  try {
    const { issue_id, channel, workspace_slug } = await request.json()
    if (!issue_id || !channel || !workspace_slug) {
      return NextResponse.json({ error: 'issue_id, channel, workspace_slug required' }, { status: 400 })
    }
    const result = await runAIReview({ issue_id, channel, workspace_slug })
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
