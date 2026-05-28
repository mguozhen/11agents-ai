import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

export { REPO_ROOT, PROJECTS_DIR, REVIEWS_DIR } from '../server/paths.js'

import { PROJECTS_DIR, REVIEWS_DIR } from '../server/paths.js'

export type State = 'new-idea' | 'draft' | 'bank' | 'published'

export type ContentItem = {
  id: string
  project: string
  agent: string
  state: State
  file: string
  size: number
  mtime: number
  frontmatter: Record<string, unknown>
  preview: string
}

export function listProjects(): string[] {
  if (!existsSync(PROJECTS_DIR)) return []
  return readdirSync(PROJECTS_DIR).filter(n => {
    if (n.startsWith('_') || n.startsWith('.')) return false
    const p = path.join(PROJECTS_DIR, n)
    return statSync(p).isDirectory() && existsSync(path.join(p, 'project.yaml'))
  }).sort()
}

export function listAgents(project: string): string[] {
  const dir = path.join(PROJECTS_DIR, project, 'agents')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(n => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() && existsSync(path.join(p, 'agent.yaml'))
  }).sort()
}

export function walkAgentState(project: string, agent: string, state: State): ContentItem[] {
  const dir = path.join(PROJECTS_DIR, project, 'agents', agent, 'content-bank', state)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep')
    .map(f => {
      const filePath = path.join(dir, f)
      const stat = statSync(filePath)
      const raw = readFileSync(filePath, 'utf-8')
      let data: Record<string, unknown> = {}
      let body = raw
      try { const parsed = matter(raw); data = parsed.data; body = parsed.content } catch {}
      return {
        id: f.replace(/\.md$/, ''),
        project, agent, state,
        file: path.relative(PROJECTS_DIR, filePath),
        size: stat.size,
        mtime: stat.mtimeMs,
        frontmatter: data,
        preview: body.trim().split('\n').slice(0, 6).join('\n').slice(0, 400),
      }
    })
}

export function collect(opts: { project?: string; state?: State; agent?: string }): ContentItem[] {
  const projects = opts.project ? [opts.project] : listProjects()
  const states: State[] = opts.state ? [opts.state] : ['new-idea', 'draft', 'bank', 'published']
  const out: ContentItem[] = []
  for (const p of projects) {
    const agents = opts.agent ? [opts.agent] : listAgents(p)
    for (const a of agents) for (const s of states) out.push(...walkAgentState(p, a, s))
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

export function countsFor(project?: string) {
  return {
    'new-idea': collect({ project, state: 'new-idea' }).length,
    'draft': collect({ project, state: 'draft' }).length,
    'bank': collect({ project, state: 'bank' }).length,
    'published': collect({ project, state: 'published' }).length,
  }
}

export function reviewerQueueCount(): Record<string, number> {
  if (!existsSync(REVIEWS_DIR)) return {}
  const out: Record<string, number> = {}
  for (const name of readdirSync(REVIEWS_DIR)) {
    const p = path.join(REVIEWS_DIR, name)
    if (!statSync(p).isDirectory()) continue
    out[name] = readdirSync(p).filter(f => f.endsWith('.md') && f !== '.gitkeep').length
  }
  return out
}

export function readRegistry() {
  const f = path.join(PROJECTS_DIR, '_registry.json')
  if (!existsSync(f)) return null
  try { return JSON.parse(readFileSync(f, 'utf-8')) } catch { return null }
}
