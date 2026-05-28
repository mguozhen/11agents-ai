import { NextRequest, NextResponse } from 'next/server'
import { analyzeProduct } from '@/server/onboarding.js'

export async function POST(request: NextRequest) {
  const { website, github_kb } = await request.json()
  if (!website) return NextResponse.json({ error: 'website URL required' }, { status: 400 })
  try {
    const id = await analyzeProduct({ website, github_kb })
    return NextResponse.json({ id })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
