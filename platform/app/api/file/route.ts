import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { REPO_ROOT } from '@/lib/fs-api'

export async function GET(request: NextRequest) {
  const rel = request.nextUrl.searchParams.get('path') || ''
  const abs = path.resolve(REPO_ROOT, rel)
  if (!abs.startsWith(REPO_ROOT) || !existsSync(abs)) {
    return new NextResponse('not found', { status: 404 })
  }
  const raw = readFileSync(abs, 'utf-8')
  let data: Record<string, unknown> = {}; let body = raw
  try { const parsed = matter(raw); data = parsed.data; body = parsed.content } catch {}
  return NextResponse.json({ frontmatter: data, body, file: rel })
}
