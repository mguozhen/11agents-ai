import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readlinkSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { REVIEWS_DIR, REPO_ROOT } from '@/lib/fs-api'

export async function POST(request: NextRequest) {
  const { reviewer, id, action, reason } = await request.json()
  if (!reviewer || !id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'reviewer/id/action required (action=approve|reject)' }, { status: 400 })
  }
  const link = path.join(REVIEWS_DIR, reviewer, `${id}.md`)
  if (!existsSync(link)) return NextResponse.json({ error: 'not in queue' }, { status: 404 })

  return new Promise<NextResponse>(resolve => {
    const args = [path.join(REPO_ROOT, 'scripts/review-queue.sh'), reviewer, action, id]
    if (action === 'reject') args.push(reason || 'No reason given')
    const child = spawn('bash', args, { cwd: REPO_ROOT })
    let out = '', err = ''
    child.stdout.on('data', (d: Buffer) => out += d.toString())
    child.stderr.on('data', (d: Buffer) => err += d.toString())
    child.on('close', (code: number) => {
      resolve(NextResponse.json(
        { code, stdout: out.trim(), stderr: err.trim() },
        { status: code === 0 ? 200 : 500 }
      ))
    })
  })
}
