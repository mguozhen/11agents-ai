import { NextRequest, NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params
  if (!hasMultica()) return NextResponse.json({ error: 'MULTICA_DATABASE_URL not configured' }, { status: 503 })
  try {
    const { getIssue, getIssueComments } = await import('@/server/multica-db.js')
    const issue = await getIssue(issueId)
    if (!issue) return NextResponse.json({ error: 'issue not found' }, { status: 404 })
    const comments = await getIssueComments(issueId)
    return NextResponse.json({ issue, comments })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
