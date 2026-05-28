import { NextRequest, NextResponse } from 'next/server'
import { getAnalysis } from '@/server/onboarding.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = getAnalysis(id)
  if (!result) return NextResponse.json({ error: 'analysis not found' }, { status: 404 })
  return NextResponse.json(result)
}
