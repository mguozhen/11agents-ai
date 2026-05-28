import {
  hasMultica, getOrCreateWorkspace, getOrCreateGTMUser, upsertChannelAgent,
  getOrCreateLabel, createIssue, addIssueLabel,
} from './multica-db.js'
import { hasDB } from './db.js'
import * as store from './store.js'
import { runAgent } from './runner.js'

const CHANNEL_PRIORITY = {
  reddit: 'high', x: 'high', blog: 'medium', video: 'medium',
  'kol-koc': 'low', landing: 'low',
}

export async function createContentDrop({
  workspace_slug, angle, context = '', channels = null, priority = 'high',
}) {
  if (!hasMultica()) throw new Error('MULTICA_DATABASE_URL not configured')

  let wsName = workspace_slug
  if (hasDB()) {
    const ws = await store.getWorkspace(workspace_slug)
    if (ws) wsName = ws.name || workspace_slug
  }

  const multicaWsId = await getOrCreateWorkspace(workspace_slug, wsName)
  const botId = await getOrCreateGTMUser()

  const activeChannels = channels?.length
    ? channels
    : await resolveActiveChannels(workspace_slug)

  const parentDescription =
    `## ContentDrop\n\n**角度:** ${angle}\n\n**背景:** ${context}\n\n**渠道:** ${activeChannels.join(', ')}`

  const dropLabel = await getOrCreateLabel(multicaWsId, 'gtm-drop', '#6366f1')
  const contentLabel = await getOrCreateLabel(multicaWsId, 'gtm-content', '#10b981')

  const parentId = await createIssue(multicaWsId, {
    title: `Drop: ${angle.slice(0, 80)}`,
    description: parentDescription,
    status: 'in_progress',
    priority,
    creatorId: botId,
  })
  await addIssueLabel(parentId, dropLabel)

  const childIssues = []
  for (const channel of activeChannels) {
    const agentId = await upsertChannelAgent(multicaWsId, channel)
    const childId = await createIssue(multicaWsId, {
      title: `[${channel.toUpperCase()}] ${angle.slice(0, 60)}`,
      description: `## 产品角度\n${angle}\n\n## 背景\n${context}`,
      status: 'in_progress',
      priority: CHANNEL_PRIORITY[channel] || 'medium',
      parentId,
      creatorId: botId,
    })
    await addIssueLabel(childId, contentLabel)
    childIssues.push({ channel, issue_id: childId, agent_id: agentId })
  }

  // Fire agent runs in background (non-blocking)
  for (const { channel, issue_id } of childIssues) {
    runAgent(channel, {
      project: workspace_slug,
      topic: angle,
      multica_issue_id: issue_id,
    }).catch(e => console.warn(`[drops] runAgent ${channel} failed:`, e.message))
  }

  return {
    drop_id: parentId,
    parent_issue_id: parentId,
    workspace_slug,
    multica_workspace_id: multicaWsId,
    child_issues: childIssues,
  }
}

async function resolveActiveChannels(workspaceSlug) {
  const defaults = ['reddit', 'x', 'blog']
  if (!hasDB()) return defaults
  const ws = await store.getWorkspace(workspaceSlug)
  if (!ws) return defaults
  const agents = await store.listAgentsForWorkspace(ws.id)
  const active = agents.filter(a => a.status === 'active').map(a => a.channel)
  return active.length ? active.slice(0, 6) : defaults
}
