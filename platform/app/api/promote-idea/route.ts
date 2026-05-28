import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { PROJECTS_DIR } from '@/lib/fs-api'
import { hasAnthropic } from '@/server/llm.js'
import { runAgent } from '@/server/runner.js'
import { hasMultica } from '@/server/multica-db.js'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

function agentBrief(channel: string, topic: string, angle: string, hook: string, agentId: string, agentName: string): string {
  const mention = `[@${agentName}](mention://agent/${agentId})`
  return `${mention} 请执行

## Task Brief — ${channel}

**Topic:** ${topic}${angle ? `\n**Angle:** ${angle}` : ''}${hook ? `\n**Hook:** ${hook}` : ''}

## Your Job
Produce a draft of ${channel} content for this topic. Plan it first, then write an initial version.

## Workflow Rules (strictly follow)

1. **Draft first, never publish directly.**
   Complete your draft and move the task to **"In Review"** (in_review status).
   Do NOT publish to any public platform, website, or channel before human approval.

2. **Wait for human Reviewer.**
   A human Reviewer will inspect your draft. If approved, the task moves to **"In Bank"**.
   If not approved, revise based on feedback and submit for review again.
   Repeat until the Reviewer explicitly approves.

3. **Publishing from Bank.**
   - If no publish time is specified: publish **1 hour after moving to In Bank**.
   - If a publish time is specified: follow that schedule exactly.
   - All times are in **UTC+0**. Remind the Reviewer to confirm their local timezone when scheduling.`
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { project, idea_id, agent } = body
  if (!project || !idea_id) {
    return NextResponse.json({ error: 'project and idea_id are required' }, { status: 400 })
  }

  if (hasMultica()) {
    if (!hasDB()) return NextResponse.json({ error: 'GTM_DATABASE required' }, { status: 503 })
    const gtmWs = await store.getWorkspace(project)
    if (!gtmWs?.multica_workspace_slug) return NextResponse.json({ error: 'no multica workspace bound to this project' }, { status: 400 })
    const multicaSlug = gtmWs.multica_workspace_slug

    const {
      getIssue, updateIssueStatus, getWorkspaceBySlug,
      getWorkspaceAgents, createIssue, getOrCreateGTMUser, postComment, dispatchAgentTask,
    } = await import('@/server/multica-db.js')

    const issue = await getIssue(idea_id)
    if (!issue) return NextResponse.json({ error: 'idea not found' }, { status: 404 })

    const topic = issue.title || ''
    if (!topic) return NextResponse.json({ error: 'no topic in idea' }, { status: 400 })

    // Parse angle/hook from description if present
    const descLines: string[] = (issue.description || '').split('\n')
    const angle = descLines.find((l: string) => l.startsWith('**Angle**:'))?.replace('**Angle**:', '').trim() || ''
    const hook = descLines.find((l: string) => l.startsWith('**Hook seed**:'))?.replace('**Hook seed**:', '').trim() || ''

    const ws = await getWorkspaceBySlug(multicaSlug)
    if (!ws) return NextResponse.json({ error: `multica workspace "${multicaSlug}" not found` }, { status: 404 })

    const agents = await getWorkspaceAgents(multicaSlug)
    if (!agents.length) return NextResponse.json({ error: 'no agents in workspace' }, { status: 503 })

    const creatorId = await getOrCreateGTMUser(ws.id)
    await updateIssueStatus(idea_id, 'in_progress')

    const notified: { agent: string; channel: string; issue_id: string }[] = []
    for (const agent of agents) {
      const description = agentBrief(agent.channel, topic, angle, hook, agent.id, agent.name)
      const issueId = await createIssue(ws.id, {
        title: `[${agent.channel}] ${topic}`,
        description,
        status: 'in_progress',
        creatorId,
        parentId: idea_id,
        assigneeId: agent.id,
      })
      // Post trigger comment then dispatch task directly to agent_task_queue
      const triggerComment = `[@${agent.name}](mention://agent/${agent.id}) 请执行`
      const commentId = await postComment(issueId, { body: triggerComment, authorId: creatorId, authorType: 'member', workspaceId: ws.id })
      await dispatchAgentTask(agent.id, agent.runtime_id, issueId, {
        triggerCommentId: commentId,
        triggerSummary: triggerComment,
      })
      notified.push({ agent: agent.name, channel: agent.channel, issue_id: issueId })
    }

    return NextResponse.json({ ok: true, topic, agents_notified: notified })
  }

  // Filesystem mode (no Multica) — unchanged
  if (!agent) return NextResponse.json({ error: 'project + agent + idea_id required' }, { status: 400 })
  if (!hasAnthropic()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  const ideaFile = path.join(PROJECTS_DIR, project, 'agents', agent, 'content-bank', 'new-idea', `${idea_id}.md`)
  if (!existsSync(ideaFile)) return NextResponse.json({ error: 'idea not found' }, { status: 404 })
  let topic = ''
  try { topic = matter(readFileSync(ideaFile, 'utf-8')).data.topic || '' } catch {}
  if (!topic) return NextResponse.json({ error: 'no topic in idea frontmatter' }, { status: 400 })
  const promotedDir = path.join(PROJECTS_DIR, project, 'agents', agent, 'content-bank', '.promoted')
  mkdirSync(promotedDir, { recursive: true })
  renameSync(ideaFile, path.join(promotedDir, `${idea_id}.md`))
  try {
    const out = await runAgent(agent, { project, topic } as Parameters<typeof runAgent>[1])
    return NextResponse.json({ ok: true, topic, ...out })
  } catch (e: unknown) {
    return NextResponse.json({ error: String((e as Error)?.message || e), topic }, { status: 500 })
  }
}
