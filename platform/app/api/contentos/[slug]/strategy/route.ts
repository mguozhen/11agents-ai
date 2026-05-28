import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PROJECTS_DIR, REPO_ROOT } from '@/lib/fs-api'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

const STEP_KEYS: Record<string, string> = {
  '1': '01-market-insight', '2': '02-user-insight',
  '3': '03-competitor-analysis', '4': '04-content-strategy',
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const step = request.nextUrl.searchParams.get('step')
  if (!step || !STEP_KEYS[step]) return NextResponse.json({ error: 'step 1..4 required' }, { status: 400 })
  const fname = STEP_KEYS[step]

  if (hasDB()) {
    try {
      const ws = await store.getWorkspace(slug)
      if (ws) {
        const doc = await store.getStrategyDoc(ws.id, fname)
        if (doc) return NextResponse.json({ step, content: doc.content })
      }
    } catch {}
  }

  const f = path.join(PROJECTS_DIR, slug, 'strategy', `${fname}.md`)
  const exists = existsSync(f)
  return NextResponse.json({
    step, file: path.relative(REPO_ROOT, f), exists,
    content: exists ? readFileSync(f, 'utf-8') : '',
  })
}
