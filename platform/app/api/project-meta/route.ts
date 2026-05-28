import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { PROJECTS_DIR, REPO_ROOT } from '@/lib/fs-api'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get('project') || ''
  const projectDir = path.join(PROJECTS_DIR, project)
  if (!project || !existsSync(projectDir)) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }
  const projectYamlPath = path.join(projectDir, 'project.yaml')
  const stateFile = path.join(projectDir, '.contentos-state.json')
  const strategyDir = path.join(projectDir, 'strategy')
  let projectYaml: Record<string, unknown> = {}
  if (existsSync(projectYamlPath)) {
    try { projectYaml = (matter('---\n' + readFileSync(projectYamlPath, 'utf-8') + '\n---\n').data) as Record<string, unknown> } catch {}
  }

  let state = { current_step: 0, steps: {} }
  if (hasDB()) {
    try {
      const ws = await store.getWorkspace(project)
      if (ws) state = await store.getContentOSState(ws.id) || state
    } catch {}
  } else if (existsSync(stateFile)) {
    try { state = JSON.parse(readFileSync(stateFile, 'utf-8')) } catch {}
  }

  const map: Array<[number, string]> = [
    [1, '01-market-insight'], [2, '02-user-insight'],
    [3, '03-competitor-analysis'], [4, '04-content-strategy'],
  ]
  const briefs = map.map(([step, key]) => {
    const f = path.join(strategyDir, `${key}.md`)
    const exists = existsSync(f)
    return { step, key, exists, size: exists ? statSync(f).size : 0 }
  })
  return NextResponse.json({ project, project_yaml: projectYaml, state, briefs })
}
