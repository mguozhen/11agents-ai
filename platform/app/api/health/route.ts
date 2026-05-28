import { NextResponse } from 'next/server'
import { hasAnthropic } from '@/server/llm.js'
import { hasDB } from '@/server/db.js'
import { hasMultica } from '@/server/multica-db.js'

export async function GET() {
  return NextResponse.json({
    ok: true,
    anthropic: hasAnthropic(),
    gtm_db: hasDB(),
    multica: hasMultica(),
  })
}
