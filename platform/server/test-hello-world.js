// server/test-hello-world.js
// Hello World test agent — validates the full GTM×Multica control loop
// POST /api/test/hello-world  → creates issue + "Hello World" draft + AI review
// POST /api/test/retry/:id    → reads reviewer comments, regenerates via LLM

import {
  hasMultica, getOrCreateWorkspace, getOrCreateGTMUser, getOrCreateLabel,
  createIssue, addIssueLabel, postComment, updateIssueStatus,
  getIssue, getIssueComments,
} from './multica-db.js'
import { complete, hasAnthropic } from './llm.js'

const WS_SLUG = 'voc-ai'

export async function initHelloWorld() {
  if (!hasMultica()) throw new Error('MULTICA_DATABASE_URL not configured')

  const multicaWsId = await getOrCreateWorkspace(WS_SLUG, 'VOC AI')
  const botId = await getOrCreateGTMUser()
  const contentLabel = await getOrCreateLabel(multicaWsId, 'gtm-content', '#10b981')

  // Create test issue
  const issueId = await createIssue(multicaWsId, {
    title: '[TEST] Hello World Agent',
    description: '## Test Issue\n\nThis is a hello-world test of the GTM×Multica control loop.',
    status: 'in_progress',
    priority: 'medium',
    creatorId: botId,
  })
  await addIssueLabel(issueId, contentLabel)

  // Post Hello World draft
  const draftBody = `## Draft: test\n\nHello World\n\n这是一条测试草稿，内容为 Hello World。本文验证 GTM Agent 的内容生成和 Review 控制链路。`
  await postComment(issueId, { body: draftBody, authorId: botId })
  await updateIssueStatus(issueId, 'in_review')

  return { issue_id: issueId, workspace_slug: WS_SLUG, multica_workspace_id: multicaWsId }
}

export async function retryWithFeedback(issueId) {
  if (!hasMultica()) throw new Error('MULTICA_DATABASE_URL not configured')
  if (!hasAnthropic()) throw new Error('ANTHROPIC_API_KEY not configured')

  const comments = await getIssueComments(issueId)

  // Get original draft
  const draftComment = [...comments].find(c =>
    c.author_type === 'agent' && c.body?.startsWith('## Draft:')
  )
  if (!draftComment) throw new Error('No draft comment found')

  // Get reviewer instructions (comments from non-agent, or agent review skipped, last human comment)
  const humanComments = comments.filter(c =>
    c.author_type === 'member' ||
    (c.author_type === 'agent' && !c.body?.startsWith('## 🤖 AI Review') && !c.body?.startsWith('## Draft:'))
  )
  const lastInstruction = humanComments.slice(-1)[0]?.body || ''

  if (!lastInstruction) throw new Error('No reviewer instruction found — add a comment first')

  const originalDraft = draftComment.body.replace(/^## Draft:[^\n]*\n\n/, '')

  const prompt = `You are a GTM content agent. The reviewer gave you feedback on your draft.

ORIGINAL DRAFT:
${originalDraft}

REVIEWER INSTRUCTION:
${lastInstruction}

Rewrite the content following the reviewer's instruction exactly. Keep it concise (2-3 sentences).
Output ONLY the new content, no preamble.`

  const { text } = await complete(prompt, { maxTokens: 500 })

  const botId = await getOrCreateGTMUser()
  const newDraftBody = `## Draft: test (revised)\n\n${text.trim()}`
  await postComment(issueId, { body: newDraftBody, authorId: botId })
  await updateIssueStatus(issueId, 'in_review')

  return { issue_id: issueId, new_draft: text.trim() }
}
