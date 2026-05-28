import { NextRequest, NextResponse } from 'next/server'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params
  try {
    const { retryWithFeedback } = await import('@/server/test-hello-world.js')
    const result = await retryWithFeedback(issueId)
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
