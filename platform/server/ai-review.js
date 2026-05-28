// server/ai-review.js
import { complete } from './llm.js'
import { hasMultica, getIssueComments, postComment, updateIssueStatus, getOrCreateGTMUser } from './multica-db.js'
import { hasDB, queryOne } from './db.js'

export async function runAIReview({ issue_id, channel, workspace_slug }) {
  if (!hasMultica()) throw new Error('MULTICA_DATABASE_URL not configured')

  const comments = await getIssueComments(issue_id)
  const draftComment = [...comments].reverse().find(c =>
    c.author_type === 'agent' && c.body?.startsWith('## Draft:')
  )
  if (!draftComment) throw new Error('No draft comment found on issue ' + issue_id)

  const draftText = draftComment.body.replace(/^## Draft:[^\n]*\n\n/, '')

  let checklist = []
  if (hasDB()) {
    const cp = await queryOne(
      'SELECT review_checklist FROM channel_profiles WHERE channel = $1',
      [channel]
    )
    if (cp?.review_checklist) checklist = cp.review_checklist
  }
  if (!checklist.length) {
    checklist = [
      'Value ratio — >80% helpful, <20% product mention',
      'Native fit — reads like it belongs on this platform',
      'No spam language or karma-farming patterns',
      'Clear hook in opening line',
    ]
  }

  const checklistStr = checklist.map((c, i) => `${i + 1}. ${c}`).join('\n')

  const prompt = `You are a senior GTM content reviewer for a ${channel} channel.

DRAFT:
${draftText.slice(0, 3000)}

REVIEW CHECKLIST:
${checklistStr}

Return ONLY valid JSON (no markdown fences, no preamble):
{
  "score": <integer 0-100>,
  "recommendation": "approve" | "revise" | "reject",
  "checklist_results": [
    { "item": "<checklist item text>", "passed": true, "note": "" }
  ],
  "inline_annotations": [
    { "quote": "<verbatim text from draft, max 60 chars>", "issue": "<what is wrong>", "suggestion": "<how to fix>" }
  ],
  "summary": "<1-2 sentences overall>"
}`

  const { text } = await complete(prompt, { maxTokens: 2000 })
  let review
  try {
    const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    review = JSON.parse(clean)
  } catch {
    throw new Error('AI review returned invalid JSON: ' + text.slice(0, 200))
  }

  const checklistMd = review.checklist_results.map(r =>
    `${r.passed ? '✓' : '⚠'} ${r.item}${r.note ? ` — ${r.note}` : ''}`
  ).join('\n')

  const annotationsMd = review.inline_annotations?.map(a =>
    `> "${a.quote}"\n→ **问题:** ${a.issue}\n→ **建议:** ${a.suggestion}`
  ).join('\n\n') || ''

  const recEmoji = review.recommendation === 'approve' ? '✓ Approve'
    : review.recommendation === 'reject' ? '✗ Reject' : '✏ Revise'

  const body = `## 🤖 AI Review — ${review.score}/100 · 推荐: ${recEmoji}

**总结:** ${review.summary}

### Checklist
${checklistMd}
${annotationsMd ? `\n### 内联批注\n${annotationsMd}` : ''}`

  const botId = await getOrCreateGTMUser()
  await postComment(issue_id, { body, authorId: botId })
  await updateIssueStatus(issue_id, 'in_review')

  return { score: review.score, recommendation: review.recommendation }
}
