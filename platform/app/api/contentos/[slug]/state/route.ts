import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PROJECTS_DIR } from '@/lib/fs-api'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const projectDir = path.join(PROJECTS_DIR, slug)
  if (hasDB()) {
    try {
      const ws = await store.getWorkspace(slug)
      if (!ws) return NextResponse.json({ error: 'not found' }, { status: 404 })
      const state = await store.getContentOSState(ws.id) || { current_step: 0, steps: {} }
      const project = existsSync(path.join(projectDir, 'project.yaml'))
        ? readFileSync(path.join(projectDir, 'project.yaml'), 'utf-8') : ''
      return NextResponse.json({ slug, state, project_yaml: project })
    } catch (e: unknown) {
      console.warn('[contentos state DB read failed]', (e as Error).message)
    }
  }
  const stateFile = path.join(projectDir, '.contentos-state.json')
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf-8'))
    : { current_step: 0, steps: {} }
  const project = existsSync(path.join(projectDir, 'project.yaml'))
    ? readFileSync(path.join(projectDir, 'project.yaml'), 'utf-8') : ''
  return NextResponse.json({ slug, state, project_yaml: project })
}
