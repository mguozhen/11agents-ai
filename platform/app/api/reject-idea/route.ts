import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, appendFileSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { PROJECTS_DIR } from '@/lib/fs-api'
import { hasMultica } from '@/server/multica-db.js'

export async function POST(request: NextRequest) {
  const { project, agent, idea_id, reason } = await request.json()
  if (!project || !agent || !idea_id) {
    return NextResponse.json({ error: 'project + agent + idea_id required' }, { status: 400 })
  }

  if (hasMultica()) {
    const { getIssue, updateIssueStatus } = await import('@/server/multica-db.js')
    const issue = await getIssue(idea_id)
    if (!issue) return NextResponse.json({ error: 'not found' }, { status: 404 })
    await updateIssueStatus(idea_id, 'cancelled')
    return NextResponse.json({ ok: true, topic: issue.title })
  }

  const ideaFile = path.join(PROJECTS_DIR, project, 'agents', agent, 'content-bank', 'new-idea', `${idea_id}.md`)
  if (!existsSync(ideaFile)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  let topic = ''
  try { topic = matter(readFileSync(ideaFile, 'utf-8')).data.topic || '' } catch {}
  const antiFile = path.join(PROJECTS_DIR, project, 'agents', agent, 'anti-patterns.md')
  const entry = `\n### ${new Date().toISOString().slice(0,10)} · ${topic || idea_id}\n- What: idea rejected at promotion gate\n- Why rejected: ${reason || 'No reason'}\n- Avoid: TBD\n`
  appendFileSync(antiFile, entry)
  const rejDir = path.join(PROJECTS_DIR, project, 'agents', agent, 'content-bank', '.rejected-ideas')
  mkdirSync(rejDir, { recursive: true })
  renameSync(ideaFile, path.join(rejDir, `${idea_id}.md`))
  return NextResponse.json({ ok: true, topic })
}
