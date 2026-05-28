import { NextRequest, NextResponse } from 'next/server'
import { runContentOSStep } from '@/server/contentos.js'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const step = _req.nextUrl.searchParams.get('step')
  if (!step || !['1', '2', '3', '4'].includes(step)) {
    return NextResponse.json({ error: 'step 1..4 required' }, { status: 400 })
  }
  try {
    const result = await runContentOSStep(slug, Number(step))
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
