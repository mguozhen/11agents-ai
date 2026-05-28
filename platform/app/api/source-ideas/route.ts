import { NextRequest, NextResponse } from 'next/server'
import { hasAnthropic } from '@/server/llm.js'
import { sourceIdeas } from '@/server/source-ideas.js'

export async function POST(request: NextRequest) {
  const { project, agent, n } = await request.json()
  if (!project) return NextResponse.json({ error: 'project required' }, { status: 400 })
  if (!hasAnthropic()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  try {
    const out = await sourceIdeas({ project, agent, n: n || 5 })
    return NextResponse.json({ ok: true, ...out })
  } catch (e: unknown) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}
