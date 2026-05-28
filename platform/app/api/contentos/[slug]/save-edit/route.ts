import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { PROJECTS_DIR, REPO_ROOT } from '@/lib/fs-api'

const STEP_KEYS: Record<string, string> = {
  '1': '01-market-insight', '2': '02-user-insight',
  '3': '03-competitor-analysis', '4': '04-content-strategy',
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const step = request.nextUrl.searchParams.get('step')
  if (!step || !STEP_KEYS[step]) return NextResponse.json({ error: 'bad step' }, { status: 400 })
  try {
    const { content } = await request.json()
    const f = path.join(PROJECTS_DIR, slug, 'strategy', `${STEP_KEYS[step]}.md`)
    writeFileSync(f, content)
    return NextResponse.json({ ok: true, file: path.relative(REPO_ROOT, f), size: content.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
