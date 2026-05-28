# GTM × Multica Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 gtm-swarm 的内容流水线和 Multica 的 Agent 协作平台通过共享 PostgreSQL 打通，实现两层增长飞轮：ContentDrop 顶层触发全渠道扩散 + Insight 小循环持续涌现。

**Architecture:** gtm-swarm 新增 `server/multica-db.js` 直连 Multica PostgreSQL，通过共享库操作 Multica 的 `issue`、`comment`、`agent`、`workspace`、`member` 表。Multica 前端扩展 GTM Review Panel 和 Insights 视图。gtm-swarm 现有流水线完全保留——`MULTICA_DATABASE_URL` 不设置时行为不变。

**Tech Stack:** Node.js ESM (gtm-swarm backend), Next.js 16 App Router + React + TanStack Query (Multica frontend), TypeScript, PostgreSQL (`pg` driver in gtm-swarm, sqlc-generated Go in Multica), shadcn/ui components.

**Working directories:**
- gtm-swarm: `/Users/boyuangao/skills/gtm-swarm/.claude/worktrees/gtm-platform-implementation/`
- Multica: `multica/` (subfolder, separate git repo)

---

## Phase 1: Database Bridge + Bootstrap + ContentDrop Backend

### Task 1: Create `server/multica-db.js` — Multica PostgreSQL bridge

**Files:**
- Create: `server/multica-db.js`

- [ ] Create `server/multica-db.js` with the complete bridge layer:

```js
// server/multica-db.js
import pg from 'pg'
const { Pool } = pg

let pool = null

export function hasMultica() {
  return Boolean(process.env.MULTICA_DATABASE_URL)
}

function getPool() {
  if (!pool && hasMultica()) {
    const url = process.env.MULTICA_DATABASE_URL
    pool = new Pool({
      connectionString: url,
      ssl: url.includes('localhost') || url.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    })
  }
  return pool
}

async function q(sql, params = []) {
  const p = getPool()
  if (!p) throw new Error('No MULTICA_DATABASE_URL set')
  const { rows } = await p.query(sql, params)
  return rows
}

async function q1(sql, params = []) {
  return (await q(sql, params))[0] || null
}

export async function getOrCreateWorkspace(slug, name) {
  const row = await q1(
    `INSERT INTO workspace (name, slug) VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [name, slug]
  )
  return row.id
}

export async function getOrCreateGTMUser() {
  const email = 'gtm-swarm-bot@gtm-swarm.internal'
  const row = await q1(
    `INSERT INTO "user" (name, email) VALUES ('GTM Swarm', $1)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [email]
  )
  return row.id
}

export async function upsertMember(workspaceId, userId, role = 'member') {
  await q(
    `INSERT INTO member (workspace_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userId, role]
  )
}

export async function upsertChannelAgent(workspaceId, channel) {
  const name = `GTM-${channel.charAt(0).toUpperCase() + channel.slice(1)}`
  const row = await q1(
    `INSERT INTO agent (workspace_id, name, runtime_mode, runtime_config, status)
     VALUES ($1, $2, 'cloud', $3, 'idle')
     ON CONFLICT (workspace_id, name) DO UPDATE SET runtime_config = EXCLUDED.runtime_config
     RETURNING id`,
    [workspaceId, name, JSON.stringify({ gtm_channel: channel })]
  )
  // Note: agent table may not have (workspace_id, name) unique constraint — add fallback
  if (row) return row.id
  const existing = await q1(
    'SELECT id FROM agent WHERE workspace_id = $1 AND name = $2',
    [workspaceId, name]
  )
  return existing?.id
}

export async function getOrCreateLabel(workspaceId, name, color) {
  const row = await q1(
    `INSERT INTO issue_label (workspace_id, name, color) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, name) DO UPDATE SET color = EXCLUDED.color RETURNING id`,
    [workspaceId, name, color]
  )
  // fallback if no unique constraint
  if (row) return row.id
  const existing = await q1(
    'SELECT id FROM issue_label WHERE workspace_id = $1 AND name = $2',
    [workspaceId, name]
  )
  return existing?.id
}

export async function createIssue(workspaceId, {
  title, description = '', status = 'in_progress', priority = 'medium',
  parentId = null, creatorId,
}) {
  const row = await q1(
    `INSERT INTO issue
       (workspace_id, title, description, status, priority, parent_issue_id, creator_type, creator_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'agent', $7)
     RETURNING id`,
    [workspaceId, title, description, status, priority, parentId || null, creatorId]
  )
  return row.id
}

export async function addIssueLabel(issueId, labelId) {
  await q(
    `INSERT INTO issue_to_label (issue_id, label_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [issueId, labelId]
  )
}

export async function postComment(issueId, { body, authorId, authorType = 'agent' }) {
  const row = await q1(
    `INSERT INTO comment (issue_id, body, author_type, author_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [issueId, body, authorType, authorId]
  )
  return row.id
}

export async function updateIssueStatus(issueId, status) {
  await q(
    'UPDATE issue SET status = $1, updated_at = now() WHERE id = $2',
    [status, issueId]
  )
}

export async function getIssue(issueId) {
  return q1('SELECT * FROM issue WHERE id = $1', [issueId])
}

export async function getIssueComments(issueId) {
  return q(
    'SELECT * FROM comment WHERE issue_id = $1 ORDER BY created_at ASC',
    [issueId]
  )
}

export async function pollIssueDone(issueId, onDone, intervalMs = 5000, maxWaitMs = 1800000) {
  const start = Date.now()
  const check = async () => {
    if (Date.now() - start > maxWaitMs) return
    const issue = await getIssue(issueId)
    if (!issue) return
    if (issue.status === 'done' || issue.status === 'cancelled') {
      onDone(issue.status)
      return
    }
    setTimeout(check, intervalMs)
  }
  setTimeout(check, intervalMs)
}
```

- [ ] Verify module loads without error:
```bash
node -e "import('./server/multica-db.js').then(m => console.log('hasMultica:', m.hasMultica()))"
```
Expected: `hasMultica: false`

- [ ] Commit:
```bash
git add server/multica-db.js
git commit -m "feat(multica): multica-db.js bridge layer"
```

---

### Task 2: Extend `server/bootstrap.js` with `bootstrapMultica()`

**Files:**
- Modify: `server/bootstrap.js`
- Modify: `server/index.js`

- [ ] Read current `server/bootstrap.js` to find the end of the file, then add after the existing `bootstrapDB` function:

```js
import {
  hasMultica, getOrCreateWorkspace, getOrCreateGTMUser, upsertMember,
  upsertChannelAgent, getOrCreateLabel,
} from './multica-db.js'

const GTM_CHANNELS = ['reddit', 'x', 'blog', 'video', 'kol-koc', 'landing']
const GTM_LABELS = [
  { name: 'gtm-content', color: '#10b981' },
  { name: 'gtm-drop', color: '#6366f1' },
  { name: 'gtm-insight', color: '#f59e0b' },
]

export async function bootstrapMultica() {
  if (!hasMultica()) return
  const botId = await getOrCreateGTMUser()

  // Collect all product slugs
  const slugs = []
  if (hasDB()) {
    const rows = await (await import('./store.js')).listWorkspaces()
    for (const ws of rows) slugs.push({ slug: ws.slug, name: ws.name || ws.slug })
  } else {
    const { readdirSync, existsSync, statSync } = await import('node:fs')
    const { PROJECTS_DIR } = await import('./paths.js')
    if (existsSync(PROJECTS_DIR)) {
      for (const n of readdirSync(PROJECTS_DIR)) {
        if (n.startsWith('_') || n.startsWith('.')) continue
        const p = path.join(PROJECTS_DIR, n)
        if (statSync(p).isDirectory()) slugs.push({ slug: n, name: n })
      }
    }
  }

  for (const { slug, name } of slugs) {
    const wsId = await getOrCreateWorkspace(slug, name)
    await upsertMember(wsId, botId, 'admin')
    for (const ch of GTM_CHANNELS) await upsertChannelAgent(wsId, ch)
    for (const lb of GTM_LABELS) await getOrCreateLabel(wsId, lb.name, lb.color)
    console.log(`[bootstrapMultica] ${slug} ready`)
  }
  console.log('[bootstrapMultica] done')
}
```

- [ ] In `server/index.js`, add `bootstrapMultica` to the import and call it in the async IIFE. Find the line:
```js
import { bootstrap, bootstrapDB } from './bootstrap.js'
```
Change to:
```js
import { bootstrap, bootstrapDB, bootstrapMultica } from './bootstrap.js'
```
And in the async IIFE, add after `await bootstrapDB()`:
```js
  await bootstrapMultica()
```

- [ ] Verify server starts without error (no MULTICA_DATABASE_URL → bootstrapMultica is no-op):
```bash
node server/index.js &
sleep 2 && curl -s http://localhost:8082/api/health | python3 -m json.tool
kill %1
```
Expected: JSON with `"ok": true`, no error logs.

- [ ] Commit:
```bash
git add server/bootstrap.js server/index.js
git commit -m "feat(multica): bootstrapMultica() — workspace/agent/label sync on boot"
```

---

### Task 3: Create `server/drops.js` — ContentDrop fan-out logic

**Files:**
- Create: `server/drops.js`

- [ ] Create `server/drops.js`:

```js
// server/drops.js
import {
  hasMultica, getOrCreateWorkspace, getOrCreateGTMUser, upsertChannelAgent,
  getOrCreateLabel, createIssue, addIssueLabel,
} from './multica-db.js'
import { hasDB } from './db.js'
import * as store from './store.js'

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
```

- [ ] Verify module loads:
```bash
node -e "import('./server/drops.js').then(() => console.log('drops ok'))"
```
Expected: `drops ok`

- [ ] Commit:
```bash
git add server/drops.js
git commit -m "feat(drops): createContentDrop() — fan-out to Multica issues"
```

---

### Task 4: Add `POST /api/drops` route to `server/api.js`

**Files:**
- Modify: `server/api.js`

- [ ] Add import at top of `server/api.js` (after existing imports):
```js
import { createContentDrop } from './drops.js'
import { hasMultica } from './multica-db.js'
```

- [ ] Add route inside `mountApi`, before the `app.use('/api', r)` line:

```js
  // ===== ContentDrop =====
  r.post('/drops', requireAuth, async (req, res) => {
    if (!hasMultica()) return res.status(503).json({ error: 'MULTICA_DATABASE_URL not configured' })
    try {
      const { workspace_slug, angle, context, channels, priority } = req.body
      if (!workspace_slug || !angle) {
        return res.status(400).json({ error: 'workspace_slug and angle required' })
      }
      const result = await createContentDrop({ workspace_slug, angle, context, channels, priority })
      res.json(result)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  r.get('/drops/status/:issueId', async (req, res) => {
    if (!hasMultica()) return res.status(503).json({ error: 'MULTICA_DATABASE_URL not configured' })
    try {
      const { getIssue, getIssueComments } = await import('./multica-db.js')
      const issue = await getIssue(req.params.issueId)
      if (!issue) return res.status(404).json({ error: 'issue not found' })
      const comments = await getIssueComments(req.params.issueId)
      res.json({ issue, comments })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })
```

- [ ] Verify server starts:
```bash
node server/index.js &
sleep 2 && curl -s http://localhost:8082/api/health | python3 -m json.tool
kill %1
```

- [ ] Commit:
```bash
git add server/api.js
git commit -m "feat(api): POST /api/drops + GET /api/drops/status/:issueId"
```

---

### Task 5: Extend `server/runner.js` — post draft as Multica issue comment

**Files:**
- Modify: `server/runner.js`

- [ ] Add import at top of `server/runner.js` (after existing imports):
```js
import { hasMultica, postComment, updateIssueStatus, getOrCreateGTMUser } from './multica-db.js'
```

- [ ] In `runAgent`, add `multica_issue_id = null` to the options destructure. Find:
```js
export async function runAgent(agentId, { project = 'voc-ai', topic, source = null } = {}) {
```
Change to:
```js
export async function runAgent(agentId, { project = 'voc-ai', topic, source = null, multica_issue_id = null } = {}) {
```

- [ ] After `bumpMetric(agentDir, 'drafted', written.length)`, add:
```js
  // Mirror draft to Multica issue if configured
  if (hasMultica() && multica_issue_id && posts.length) {
    try {
      const botId = await getOrCreateGTMUser()
      const firstPost = posts[0]
      const commentBody = `## Draft: ${agentId}\n\n${firstPost.content.trim()}`
      await postComment(multica_issue_id, { body: commentBody, authorId: botId })
      await updateIssueStatus(multica_issue_id, 'in_review')
    } catch (e) {
      console.warn('[runner] Multica comment failed (non-fatal):', e.message)
    }
  }
```

- [ ] Verify syntax:
```bash
node --check server/runner.js && echo "runner.js ok"
```
Expected: `runner.js ok`

- [ ] Commit:
```bash
git add server/runner.js
git commit -m "feat(runner): mirror draft to Multica issue comment on completion"
```

---

### Task 6: Wire ContentDrop → runAgent (fire-and-forget per channel)

**Files:**
- Modify: `server/drops.js`

- [ ] In `server/drops.js`, add import at top:
```js
import { runAgent } from './runner.js'
```

- [ ] In `createContentDrop`, after the `childIssues` loop (after `return {...}`), modify to kick off agent runs in background **before** the return. Replace the return statement with:

```js
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
```

**Note:** `runAgent` expects `agentId` matching an agent directory name (e.g., `06-reddit`). For Drop-triggered runs, channel is passed as the agent ID. Ensure agent directories in `projects/<slug>/agents/` follow `XX-<channel>` naming, or adjust: `runAgent` falls back gracefully if `agent not found`.

- [ ] Commit:
```bash
git add server/drops.js
git commit -m "feat(drops): fire runAgent per channel after Drop creation"
```

---

## Phase 2: AI Review

### Task 7: Create `server/ai-review.js` — AI-assisted review generation

**Files:**
- Create: `server/ai-review.js`

- [ ] Create `server/ai-review.js`:

```js
// server/ai-review.js
import { complete } from './llm.js'
import { hasMultica, getIssueComments, postComment, updateIssueStatus, getOrCreateGTMUser } from './multica-db.js'
import { hasDB, queryOne } from './db.js'

export async function runAIReview({ issue_id, channel, workspace_slug }) {
  if (!hasMultica()) throw new Error('MULTICA_DATABASE_URL not configured')

  const comments = await getIssueComments(issue_id)
  // Find most recent agent draft comment (starts with "## Draft:")
  const draftComment = [...comments].reverse().find(c =>
    c.author_type === 'agent' && c.body.startsWith('## Draft:')
  )
  if (!draftComment) throw new Error('No draft comment found on issue ' + issue_id)

  const draftText = draftComment.body.replace(/^## Draft:.*\n\n/, '')

  // Load channel review checklist from gtm-swarm's channel_profiles table
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
```

- [ ] Verify module loads:
```bash
node -e "import('./server/ai-review.js').then(() => console.log('ai-review ok'))"
```
Expected: `ai-review ok`

- [ ] Commit:
```bash
git add server/ai-review.js
git commit -m "feat(ai-review): AI checklist + inline annotations via Claude API"
```

---

### Task 8: Add `POST /api/ai-review` + auto-trigger wiring

**Files:**
- Modify: `server/api.js`
- Modify: `server/runner.js`

- [ ] Add import in `server/api.js`:
```js
import { runAIReview } from './ai-review.js'
```

- [ ] Add route inside `mountApi` before `app.use('/api', r)`:
```js
  // ===== AI Review =====
  r.post('/ai-review', requireAuth, async (req, res) => {
    if (!hasMultica()) return res.status(503).json({ error: 'MULTICA_DATABASE_URL not configured' })
    try {
      const { issue_id, channel, workspace_slug } = req.body
      if (!issue_id || !channel || !workspace_slug) {
        return res.status(400).json({ error: 'issue_id, channel, workspace_slug required' })
      }
      const result = await runAIReview({ issue_id, channel, workspace_slug })
      res.json(result)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })
```

- [ ] In `server/runner.js`, update the Multica comment block to also trigger AI review. Replace the existing Multica block (added in Task 5) with:

```js
  if (hasMultica() && multica_issue_id && posts.length) {
    try {
      const botId = await getOrCreateGTMUser()
      const firstPost = posts[0]
      const platform = firstPost.data?.platform || agentId
      const commentBody = `## Draft: ${platform}\n\n${firstPost.content.trim()}`
      await postComment(multica_issue_id, { body: commentBody, authorId: botId })
      console.log(`[runner] draft posted to Multica issue ${multica_issue_id}`)
      // Auto-trigger AI review (non-blocking)
      const { runAIReview } = await import('./ai-review.js')
      runAIReview({ issue_id: multica_issue_id, channel: agentId, workspace_slug: project })
        .then(r => console.log(`[runner] AI review done: ${r.score}/100 ${r.recommendation}`))
        .catch(e => console.warn('[runner] AI review failed (non-fatal):', e.message))
    } catch (e) {
      console.warn('[runner] Multica comment failed (non-fatal):', e.message)
    }
  }
```

- [ ] Commit:
```bash
git add server/api.js server/runner.js
git commit -m "feat(api): POST /api/ai-review + auto-trigger from runner"
```

---

### Task 9: Multica frontend — `GTMReviewPanel` component

**Files:**
- Create: `multica/packages/views/issues/components/gtm-review-panel.tsx`

This component reads the AI review comment from the issue's comment list and renders score, checklist, annotations, and Approve/Reject buttons.

- [ ] Create `multica/packages/views/issues/components/gtm-review-panel.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { CheckCircle, XCircle, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { Badge } from "@multica/ui/components/ui/badge";
import { useUpdateIssue } from "@multica/core/issues/mutations";
import type { Issue, TimelineEntry } from "@multica/core/types";

interface GTMReviewPanelProps {
  issue: Issue;
  timeline: TimelineEntry[];
  wsId: string;
}

interface ParsedReview {
  score: number;
  recommendation: string;
  summary: string;
  checklist: { passed: boolean; text: string; note?: string }[];
  annotations: { quote: string; issue: string; suggestion: string }[];
}

function parseReviewComment(body: string): ParsedReview | null {
  if (!body.startsWith("## 🤖 AI Review")) return null;
  try {
    // Extract score
    const scoreMatch = body.match(/— (\d+)\/100/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    // Extract recommendation
    const recMatch = body.match(/推荐: (✓ Approve|✗ Reject|✏ Revise)/);
    const recommendation = recMatch?.[1] ?? "";
    // Extract summary
    const summaryMatch = body.match(/\*\*总结:\*\* (.+)/);
    const summary = summaryMatch?.[1] ?? "";
    // Parse checklist lines
    const checklistSection = body.match(/### Checklist\n([\s\S]*?)(?:\n###|$)/)?.[1] ?? "";
    const checklist = checklistSection.trim().split("\n").filter(Boolean).map(line => ({
      passed: line.startsWith("✓"),
      text: line.replace(/^[✓⚠] /, "").split(" — ")[0],
      note: line.includes(" — ") ? line.split(" — ")[1] : undefined,
    }));
    // Parse annotations
    const annotationsSection = body.match(/### 内联批注\n([\s\S]*?)$/)?.[1] ?? "";
    const annotations: ParsedReview["annotations"] = [];
    const blocks = annotationsSection.split("\n\n").filter(b => b.includes("> "));
    for (const block of blocks) {
      const quote = block.match(/> "(.+?)"/)?.[1] ?? "";
      const issue = block.match(/→ \*\*问题:\*\* (.+)/)?.[1] ?? "";
      const suggestion = block.match(/→ \*\*建议:\*\* (.+)/)?.[1] ?? "";
      if (quote) annotations.push({ quote, issue, suggestion });
    }
    return { score, recommendation, summary, checklist, annotations };
  } catch {
    return null;
  }
}

export function GTMReviewPanel({ issue, comments, wsId }: GTMReviewPanelProps) {
  const updateIssue = useUpdateIssue();

  // Only show for gtm-content issues
  const isGTMContent = issue.labels?.some(l => l.name === "gtm-content");
  if (!isGTMContent) return null;

  // TimelineEntry.content holds the comment text; type === "comment" filters to comments only
  const reviewEntry = useMemo(
    () => [...timeline].reverse().find(e =>
      e.type === "comment" && e.content?.startsWith("## 🤖 AI Review")
    ),
    [timeline]
  );
  const review = useMemo(
    () => reviewEntry?.content ? parseReviewComment(reviewEntry.content) : null,
    [reviewEntry]
  );

  if (!review) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          AI Review
        </div>
        <p className="text-xs text-muted-foreground">
          {issue.status === "in_review" ? "正在生成审核..." : "等待草稿..."}
        </p>
      </div>
    );
  }

  const scoreColor = review.score >= 80 ? "text-green-500"
    : review.score >= 60 ? "text-yellow-500"
    : "text-red-500";

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-medium">
          <Sparkles className="size-3.5 text-violet-500" />
          AI Review
        </div>
        <span className={`text-lg font-bold tabular-nums ${scoreColor}`}>
          {review.score}<span className="text-xs text-muted-foreground font-normal">/100</span>
        </span>
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground leading-relaxed">{review.summary}</p>

      {/* Checklist */}
      <div className="space-y-1">
        {review.checklist.map((item, i) => (
          <div key={i} className="flex items-start gap-1.5">
            {item.passed
              ? <CheckCircle className="size-3.5 text-green-500 mt-0.5 shrink-0" />
              : <AlertCircle className="size-3.5 text-yellow-500 mt-0.5 shrink-0" />}
            <span className={`text-xs ${item.passed ? "text-foreground" : "text-yellow-600 dark:text-yellow-400"}`}>
              {item.text}
              {item.note && <span className="text-muted-foreground"> — {item.note}</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Annotations */}
      {review.annotations.length > 0 && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-xs font-medium text-muted-foreground">内联批注</p>
          {review.annotations.map((ann, i) => (
            <div key={i} className="rounded bg-muted/50 p-2 space-y-1">
              <p className="text-xs italic text-muted-foreground">"{ann.quote}"</p>
              <p className="text-xs text-destructive">{ann.issue}</p>
              <p className="text-xs text-green-600 dark:text-green-400">→ {ann.suggestion}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {issue.status === "in_review" && (
        <div className="flex gap-2 pt-1 border-t">
          <Button
            size="sm"
            variant="default"
            className="flex-1 h-7 text-xs"
            onClick={() => updateIssue.mutate({ id: issue.id, data: { status: "done" } })}
          >
            <CheckCircle className="size-3 mr-1" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => updateIssue.mutate({ id: issue.id, data: { status: "cancelled" } })}
          >
            <XCircle className="size-3 mr-1" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] Verify TypeScript compiles (from multica directory):
```bash
cd multica && pnpm --filter @multica/views tsc --noEmit 2>&1 | head -20
```
Expected: no errors related to `gtm-review-panel.tsx`

- [ ] Commit (from multica directory):
```bash
git add packages/views/issues/components/gtm-review-panel.tsx
git commit -m "feat(gtm): GTMReviewPanel component — AI score + checklist + approve/reject"
```

---

### Task 10: Inject `GTMReviewPanel` into Multica issue detail sidebar

**Files:**
- Modify: `multica/packages/views/issues/components/issue-detail.tsx`

The sidebar content is assembled in `const sidebarContent = (...)` starting around line 864. We inject the GTMReviewPanel at the **top** of the sidebar `<div className="space-y-5">`.

- [ ] Add import at top of `issue-detail.tsx` (after existing imports):
```tsx
import { GTMReviewPanel } from "./gtm-review-panel";
```

- [ ] Find the `sidebarContent` const assignment. The opening `<div className="space-y-5">` is the first child. Add `<GTMReviewPanel>` as the first element inside it. Find:
```tsx
  const sidebarContent = (
    <div className="space-y-5">
      {/* Properties */}
      <div>
```
Change to:
```tsx
  const sidebarContent = (
    <div className="space-y-5">
      {/* GTM Review Panel — only renders for gtm-content issues */}
      <GTMReviewPanel issue={issue} timeline={timeline} wsId={wsId} />
      {/* Properties */}
      <div>
```

**Note:** The `timeline` type and structure in issue-detail.tsx needs inspection. If `timeline` doesn't contain comments directly, use the `comments` prop if available, or the existing TanStack Query data. Check what variable holds the comments array in the file and use that instead.

- [ ] Inspect the actual comments variable in issue-detail.tsx:
```bash
grep -n "comments\|timeline\|CommentCard" multica/packages/views/issues/components/issue-detail.tsx | head -20
```
Adjust the `GTMReviewPanel` comments prop to use the correct variable name from the output.

- [ ] Verify TypeScript:
```bash
cd multica && pnpm --filter @multica/views tsc --noEmit 2>&1 | head -20
```

- [ ] Commit:
```bash
git add packages/views/issues/components/issue-detail.tsx
git commit -m "feat(gtm): inject GTMReviewPanel into issue detail sidebar"
```

---

## Phase 3: Insight Small Loop

### Task 11: Extend `server/source-ideas.js` — flag high-value insights → Multica

**Files:**
- Modify: `server/source-ideas.js`

- [ ] Add imports at top of `server/source-ideas.js` (after existing imports):
```js
import { hasMultica, getOrCreateWorkspace, getOrCreateGTMUser, getOrCreateLabel, createIssue, addIssueLabel, postComment } from './multica-db.js'
```

- [ ] After `writeFileSync(f, ...)` and `written++` in the `for (const b of blocks)` loop, add the existing DB write **plus** new Multica insight creation:

```js
      // Existing DB write (unchanged)
      if (hasDB()) {
        // ... existing block ...
      }
      // NEW: If insight_type === 'signal', create Multica insight issue
      if (hasMultica() && parsed.data.insight_type === 'signal') {
        try {
          const ws = hasDB() ? await store.getWorkspace(project) : null
          const wsName = ws?.name || project
          const multicaWsId = await getOrCreateWorkspace(project, wsName)
          const botId = await getOrCreateGTMUser()
          const insightLabel = await getOrCreateLabel(multicaWsId, 'gtm-insight', '#f59e0b')
          const issueId = await createIssue(multicaWsId, {
            title: `Insight: ${(parsed.data.topic || 'signal').slice(0, 80)}`,
            description: `## Insight Signal\n\n${parsed.content.trim()}\n\n**Agent:** ${aid}\n**Platform:** ${agentYaml.platform || ''}\n**Hook:** ${parsed.data.suggested_hook || ''}`,
            status: 'backlog',
            priority: 'medium',
            creatorId: botId,
          })
          await addIssueLabel(issueId, insightLabel)
          console.log(`[source-ideas] insight → Multica issue ${issueId}`)
        } catch (e) {
          console.warn('[source-ideas] Multica insight write failed (non-fatal):', e.message)
        }
      }
```

- [ ] Update the LLM prompt in `buildPrompt` to instruct it to mark high-value ideas. Find the `For EACH idea output exactly this block` section in the prompt and add `insight_type` field:

In the YAML frontmatter template inside `buildPrompt`, add after `status: new-idea`:
```
insight_type: <"idea" | "signal">   # "signal" = market signal discovered from real interactions, worth escalating to ContentDrop
```

And in the instructions, add: `Use insight_type: "signal" when this idea represents a newly discovered market pattern, user pain point, or competitor weakness — not just a regular content topic.`

- [ ] Verify:
```bash
node --check server/source-ideas.js && echo "source-ideas.js ok"
```

- [ ] Commit:
```bash
git add server/source-ideas.js
git commit -m "feat(insights): flag signal-type insights → Multica insight issues"
```

---

### Task 12: Multica frontend — Insights view

**Files:**
- Create: `multica/apps/web/app/[workspaceSlug]/(dashboard)/insights/page.tsx`
- Modify: `multica/packages/views/layout/app-sidebar.tsx` (add nav link)

- [ ] Create `multica/apps/web/app/[workspaceSlug]/(dashboard)/insights/page.tsx`:

```tsx
import { InsightsView } from "@multica/views/insights/insights-view";

export default function InsightsPage() {
  return <InsightsView />;
}
```

- [ ] Create `multica/packages/views/insights/insights-view.tsx`:

```tsx
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useApi } from "@multica/core/api";
import { Sparkles, TrendingUp, Trash2, Zap } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { Badge } from "@multica/ui/components/ui/badge";
import { toast } from "sonner";
import { useWorkspacePaths } from "@multica/core/paths";
import { useNavigation } from "../navigation";

export function InsightsView() {
  const wsId = useWorkspaceId();
  const qc = useQueryClient();
  const navigate = useNavigation();
  const paths = useWorkspacePaths();

  // Query backlog issues, filter client-side for gtm-insight label
  // (listIssues API has no label filter — backlog is typically small)
  const { data: insights = [], isLoading } = useQuery({
    queryKey: ["gtm-insights", wsId],
    queryFn: async () => {
      const { api } = await import("@multica/core/api");
      const res = await api.listIssues({ workspace_id: wsId, status: "backlog", limit: 200 });
      return res.issues.filter((i: { labels?: { name: string }[] }) =>
        i.labels?.some(l => l.name === "gtm-insight")
      );
    },
    refetchInterval: 30000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (issueId: string) => {
      const { api } = await import("@multica/core/api");
      return api.updateIssue(issueId, { status: "cancelled" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gtm-insights", wsId] });
      toast.success("标记为噪音");
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-6 py-4 border-b">
        <Sparkles className="size-4 text-yellow-500" />
        <h1 className="font-semibold">Insights</h1>
        <Badge variant="secondary" className="ml-auto">{insights.length}</Badge>
      </div>

      {insights.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          <div className="text-center space-y-1">
            <TrendingUp className="size-8 mx-auto opacity-30" />
            <p>暂无 Insight 信号</p>
            <p className="text-xs">Agent 持续互动中，发现高价值信号后会在这里出现</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y">
          {insights.map(insight => (
            <div key={insight.id} className="px-6 py-4 hover:bg-muted/30 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-2">{insight.title}</p>
                  {insight.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                      {insight.description.replace(/^## Insight Signal\n\n/, "").split("\n")[0]}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    {insight.labels?.map((l: { id: string; name: string; color: string }) => (
                      <Badge key={l.id} variant="outline" className="text-[10px] h-4 px-1.5" style={{ borderColor: l.color + "60", color: l.color }}>
                        {l.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs gap-1"
                    onClick={() => navigate.push(paths.dropsNew() + `?insight=${insight.id}&title=${encodeURIComponent(insight.title)}`)}
                  >
                    <Zap className="size-3" /> 升级为 Drop
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => dismissMutation.mutate(insight.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] Add `dropsNew()` to `useWorkspacePaths`. Inspect:
```bash
grep -n "dropsNew\|drops\|function.*paths\|return {" multica/packages/core/paths.ts 2>/dev/null | head -20 || grep -rn "useWorkspacePaths" multica/packages/core/ | head -5
```
Find the paths hook and add `dropsNew: () => \`/${wsSlug}/drops/new\`` to the returned object.

- [ ] Add Insights to the sidebar navigation. Inspect app-sidebar.tsx:
```bash
grep -n "issues\|agents\|inbox\|href.*slug" multica/packages/views/layout/app-sidebar.tsx | head -20
```
Find the nav items array and add:
```tsx
{ label: "Insights", href: paths.insights(), icon: Sparkles }
```
With `insights: () => \`/${wsSlug}/insights\`` added to the paths hook.

- [ ] Verify TypeScript:
```bash
cd multica && pnpm --filter @multica/views tsc --noEmit 2>&1 | head -30
```

- [ ] Commit:
```bash
git add packages/views/insights/ apps/web/app/\[workspaceSlug\]/\(dashboard\)/insights/ packages/views/layout/app-sidebar.tsx
git commit -m "feat(gtm): Insights view — signal queue with upgrade-to-Drop action"
```

---

## Phase 4: ContentDrop UI

### Task 13: Multica frontend — ContentDrop creation form

**Files:**
- Create: `multica/packages/views/drops/drops-new-view.tsx`
- Create: `multica/apps/web/app/[workspaceSlug]/(dashboard)/drops/new/page.tsx`

- [ ] Create `multica/packages/views/drops/drops-new-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Zap, ChevronLeft } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { Input } from "@multica/ui/components/ui/input";
import { Label } from "@multica/ui/components/ui/label";
import { Checkbox } from "@multica/ui/components/ui/checkbox";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@multica/core/paths";
import { useNavigation } from "../navigation";
import { useWorkspacePaths } from "@multica/core/paths";

const CHANNELS = [
  { id: "reddit", label: "Reddit", color: "#ff4500" },
  { id: "x", label: "X (Twitter)", color: "#1d9bf0" },
  { id: "blog", label: "Blog", color: "#10b981" },
  { id: "video", label: "Video / TikTok", color: "#ef4444" },
  { id: "kol-koc", label: "KOL / KOC", color: "#f59e0b" },
  { id: "landing", label: "Landing Page", color: "#8b5cf6" },
];

export function DropsNewView() {
  const workspace = useCurrentWorkspace();
  const navigate = useNavigation();
  const paths = useWorkspacePaths();
  const searchParams = useSearchParams();

  const [angle, setAngle] = useState(
    searchParams.get("title") ? decodeURIComponent(searchParams.get("title")!) : ""
  );
  const [context, setContext] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["reddit", "x", "blog"]);
  const [priority, setPriority] = useState<"high" | "medium" | "low">("high");

  const createDrop = useMutation({
    mutationFn: async () => {
      // /api/drops is a gtm-swarm endpoint — configure NEXT_PUBLIC_GTM_API_URL in .env
      const base = process.env.NEXT_PUBLIC_GTM_API_URL || "";
      const res = await fetch(`${base}/api/drops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_slug: workspace?.slug,
          angle,
          context,
          channels: selectedChannels,
          priority,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Drop creation failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`ContentDrop 已触发 — ${data.child_issues.length} 个渠道开始执行`);
      navigate.push(paths.issues());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleChannel = (id: string) => {
    setSelectedChannels(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate.back()}>
          <ChevronLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="size-4 text-violet-500" /> 新建 ContentDrop
          </h1>
          <p className="text-xs text-muted-foreground">一个角度，全渠道扩散</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>产品角度 / PMF 场景 *</Label>
        <Textarea
          placeholder='例："VOC AI 帮客服团队每周节省 40 小时 QA 审核"'
          value={angle}
          onChange={e => setAngle(e.target.value)}
          className="resize-none"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>背景上下文（可选）</Label>
        <Textarea
          placeholder="来自客户访谈 / 数据依据 / 竞品对比..."
          value={context}
          onChange={e => setContext(e.target.value)}
          className="resize-none"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>目标渠道</Label>
        <div className="grid grid-cols-2 gap-2">
          {CHANNELS.map(ch => (
            <label key={ch.id} className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/40 transition-colors has-[:checked]:border-violet-500/60 has-[:checked]:bg-violet-500/5">
              <Checkbox
                checked={selectedChannels.includes(ch.id)}
                onCheckedChange={() => toggleChannel(ch.id)}
              />
              <span className="text-sm" style={{ color: selectedChannels.includes(ch.id) ? ch.color : undefined }}>
                {ch.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <Button
        className="w-full"
        disabled={!angle.trim() || selectedChannels.length === 0 || createDrop.isPending}
        onClick={() => createDrop.mutate()}
      >
        {createDrop.isPending ? (
          "触发中..."
        ) : (
          <>
            <Zap className="size-3.5 mr-1.5" />
            触发 Drop ({selectedChannels.length} 个渠道)
          </>
        )}
      </Button>
    </div>
  );
}
```

- [ ] Create `multica/apps/web/app/[workspaceSlug]/(dashboard)/drops/new/page.tsx`:

```tsx
import { DropsNewView } from "@multica/views/drops/drops-new-view";

export default function DropsNewPage() {
  return <DropsNewView />;
}
```

- [ ] Add `drops/new` link to the sidebar navigation (reuse same pattern from Task 12 sidebar edit). Add a "New Drop" button in the sidebar or find the appropriate location by checking:
```bash
grep -n "New.*Issue\|create.*issue\|QuickCreate\|new.*issue" multica/packages/views/layout/app-sidebar.tsx | head -10
```
Add a "+ Drop" button near the top of the sidebar using the same pattern.

- [ ] Verify TypeScript:
```bash
cd multica && pnpm --filter @multica/views tsc --noEmit 2>&1 | head -30
```

- [ ] Commit:
```bash
git add packages/views/drops/ apps/web/app/\[workspaceSlug\]/\(dashboard\)/drops/
git commit -m "feat(gtm): ContentDrop creation form — angle input + channel selector + fan-out"
```

---

## Final Verification

- [ ] **gtm-swarm backend (no MULTICA_DATABASE_URL):** Start server, confirm existing `/api/projects`, `/api/health`, dashboard all work unchanged
- [ ] **gtm-swarm backend (with MULTICA_DATABASE_URL):** Start server, confirm bootstrap logs show workspace/agent/label sync
- [ ] **Drop creation:** `curl -X POST http://localhost:8082/api/drops -H 'Content-Type: application/json' -d '{"workspace_slug":"voc-ai","angle":"test angle","channels":["reddit"]}'` → returns `{ drop_id, child_issues }`
- [ ] **AI Review:** `curl -X POST http://localhost:8082/api/ai-review -H 'Content-Type: application/json' -d '{"issue_id":"<uuid>","channel":"reddit","workspace_slug":"voc-ai"}'` → returns `{ score, recommendation }`
- [ ] **Multica frontend:** `cd multica && make dev` starts without TS errors. Navigate to `/<slug>/insights` — Insights view renders. Navigate to `/<slug>/drops/new` — Drop form renders.
- [ ] **GTMReviewPanel:** Open a Multica issue tagged `gtm-content` in `in_review` state — AI Review panel appears in right sidebar with score, checklist, Approve/Reject buttons.

---

## Notes

- The `agent` table in Multica may not have a `(workspace_id, name)` UNIQUE constraint. `upsertChannelAgent` in `multica-db.js` has a fallback SELECT to handle this.
- `runAgent` in `runner.js` expects an agent directory (`XX-channel`). When a Drop fires, it passes the channel name directly. If no matching directory exists, `runner.js` throws "agent not found" which is caught non-fatally.
- The `fetch("/api/drops", ...)` call in `DropsNewView` assumes the Next.js frontend is proxied to the gtm-swarm backend. Adjust `NEXT_PUBLIC_API_URL` in Multica's `.env` to point to the gtm-swarm server if running separately.
- `paths.dropsNew()` and `paths.insights()` need to be added to the `useWorkspacePaths` hook in `multica/packages/core/paths.ts`. Check the exact return object shape before adding.
