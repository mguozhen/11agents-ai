import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { REPO_ROOT } from '@/lib/fs-api'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return new Promise<NextResponse>(resolve => {
    const child = spawn('python3',
      [path.join(REPO_ROOT, 'scripts/hydrate-agents.py'), '--project', slug],
      { cwd: REPO_ROOT, env: process.env })
    let out = '', err = ''
    child.stdout.on('data', (d: Buffer) => out += d.toString())
    child.stderr.on('data', (d: Buffer) => err += d.toString())
    child.on('close', (code: number) => {
      resolve(NextResponse.json({ code, stdout: out, stderr: err }, { status: code === 0 ? 200 : 500 }))
    })
  })
}
