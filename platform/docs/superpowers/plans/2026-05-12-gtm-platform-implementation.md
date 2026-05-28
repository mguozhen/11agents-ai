# GTM Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the GTM Agent Swarm data layer from filesystem to PostgreSQL and ship a multi-product lifecycle platform with channel-specific agent profiles, shared human pool, engine inheritance, and onboarding wizard.

**Architecture:** 5-phase migration. Phase 1 establishes DB + schema + seed data. Phase 2 creates the store abstraction layer. Phase 3 adapts existing server modules to dual-read (DB when DATABASE_URL set, filesystem fallback). Phase 4 adds new API endpoints. Phase 5 updates the dashboard for multi-product management.

**Tech Stack:** Node.js + Express (existing), React + Vite + TypeScript (existing), PostgreSQL (new, `pg` driver), no ORM — parameterized SQL directly.

**Dual-read contract:** Every server function checks `hasDB()` from `server/db.js`. If true, read/write PostgreSQL. If false, fall back to existing filesystem logic. This preserves dev-without-DB compatibility.

---

## Phase 1: PostgreSQL Infrastructure

### Task 1: Add `pg`, create `server/db.js`

- [ ] In `package.json`, add `"pg": "^8.13.3"` to `dependencies`
- [ ] Run `npm install`
- [ ] Create `server/db.js`:

```js
// server/db.js
import pg from 'pg'
const { Pool } = pg

let pool = null

export function hasDB() {
  return Boolean(process.env.DATABASE_URL)
}

export function getPool() {
  if (!pool && hasDB()) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  }
  return pool
}

export async function query(sql, params = []) {
  const p = getPool()
  if (!p) throw new Error('No DATABASE_URL set')
  const { rows } = await p.query(sql, params)
  return rows
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params)
  return rows[0] || null
}
```

- [ ] **Verify:** `node -e "import('./server/db.js').then(m => console.log('hasDB:', m.hasDB()))"` prints `hasDB: false` (no DATABASE_URL).

---

### Task 2: Create `migrations/001-initial.sql` and `scripts/db-migrate.js`

- [ ] Create `migrations/001-initial.sql`:

```sql
-- migrations/001-initial.sql

CREATE TABLE IF NOT EXISTS channel_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT UNIQUE NOT NULL,
  review_checklist JSONB DEFAULT '[]',
  content_template JSONB DEFAULT '{}',
  dashboard_widgets JSONB DEFAULT '[]',
  kpi_defaults JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'onboarding',
  urls JSONB DEFAULT '{}',
  project_config JSONB DEFAULT '{}',
  engine_overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  usage JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contentos_states (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  current_step INT DEFAULT 0,
  steps JSONB DEFAULT '{}',
  last_updated TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  channels JSONB DEFAULT '[]',
  max_workload INT DEFAULT 3,
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  channel_profile_id UUID REFERENCES channel_profiles(id),
  status TEXT DEFAULT 'active',
  config JSONB DEFAULT '{}',
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_assignments (
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  PRIMARY KEY (agent_id, role)
);

CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),
  state TEXT NOT NULL DEFAULT 'new-idea',
  frontmatter JSONB DEFAULT '{}',
  body TEXT DEFAULT '',
  mtime TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT DEFAULT '',
  UNIQUE (workspace_id, file_path)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  actor TEXT,
  action TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_items_workspace_state ON content_items(workspace_id, state);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_engines_lookup ON engines(workspace_id, file_path);
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON audit_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_docs_workspace ON strategy_docs(workspace_id, step_key);
```

- [ ] Create `scripts/db-migrate.js`:

```js
// scripts/db-migrate.js
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
const sql = readFileSync(path.join(__dirname, '../migrations/001-initial.sql'), 'utf-8')
await pool.query(sql)
await pool.end()
console.log('Migration complete.')
```

- [ ] **Verify (with DB):** `DATABASE_URL=<url> node scripts/db-migrate.js` prints `Migration complete.` and running it a second time is idempotent (no errors, due to `IF NOT EXISTS`).

---

### Task 3: Create channel profiles JSON and `scripts/db-seed.js`

- [ ] Create `channel_profiles/reddit.json`:

```json
{
  "channel": "reddit",
  "review_checklist": [
    "Native fit — does it read like a redditor wrote it?",
    "Subreddit rule check — target sub rules reviewed",
    "Value ratio — >80% helpful, <20% product mention",
    "Anti-spam — no link-dropping, no karma-farming language"
  ],
  "content_template": {
    "type": "post | comment",
    "structure": "hook (1 line) → context (2-3 lines) → value body → optional tail mention"
  },
  "dashboard_widgets": [
    { "id": "karma_trend", "source": "metrics.karma_by_sub", "chart": "line" },
    { "id": "ban_warnings", "source": "metrics.ban_warnings", "chart": "count" },
    { "id": "signup_attribution", "source": "metrics.reddit_signups", "chart": "bar" }
  ],
  "kpi_defaults": {
    "weekly_target": "5 posts/comments",
    "measure": "karma in target subs, saved/upvoted ratio, 0 ban warnings"
  }
}
```

- [ ] Create `channel_profiles/x.json`:

```json
{
  "channel": "x",
  "review_checklist": [
    "Hook sharpness — does line 1 stop the scroll?",
    "Thread structure — is the 1/7 format clear?",
    "Trending relevance — tied to current conversation?",
    "Brand voice — authentic but not cringe"
  ],
  "content_template": {
    "type": "tweet | thread",
    "structure": "hook → supporting data → insight → CTA or close"
  },
  "dashboard_widgets": [
    { "id": "impressions", "chart": "line" },
    { "id": "follower_growth", "chart": "bar", "period": "weekly" },
    { "id": "thread_saves", "chart": "count" }
  ],
  "kpi_defaults": {
    "weekly_target": "14 posts (2/day)",
    "measure": "impressions, follower growth >500/week, 1 viral thread/week"
  }
}
```

- [ ] Create `channel_profiles/blog.json`:

```json
{
  "channel": "blog",
  "review_checklist": [
    "SEO target — keyword in H1/H2/first 100 words?",
    "Depth — real data/research vs thin AI summary?",
    "Internal linking — 2+ links to other blog posts?",
    "Competitor comparison — honest, data-backed, not FUD"
  ],
  "content_template": {
    "type": "seo_post | comparison_post | case_study",
    "structure": "H1 + meta desc → intro hook → body (H2 sections) → conclusion + CTA"
  },
  "dashboard_widgets": [
    { "id": "ranking_positions", "chart": "line", "source": "Ahrefs/GSC" },
    { "id": "organic_traffic", "chart": "bar", "period": "weekly" },
    { "id": "conversion_rate", "source": "blog→signup funnel" }
  ],
  "kpi_defaults": {
    "weekly_target": "3 posts",
    "measure": "Ahrefs rank, organic traffic, blog→signup conversion >2%"
  }
}
```

- [ ] Create `channel_profiles/kol-koc.json`:

```json
{
  "channel": "kol-koc",
  "review_checklist": [
    "KOL fit — audience alignment with product?",
    "Personalization — does the outreach read human?",
    "Schedule — conflict with other campaigns?",
    "Deliverable clarity — video format, length, deadline explicit?"
  ],
  "content_template": {
    "type": "outreach_dm | video_brief | collab_proposal",
    "structure": "personal intro → why them specifically → collab idea → deliverables → timeline"
  },
  "dashboard_widgets": [
    { "id": "kol_pipeline", "stages": ["contacted", "negotiating", "confirmed", "live", "completed"] },
    { "id": "video_output", "chart": "calendar", "metric": "views" },
    { "id": "engagement", "chart": "bar", "metric": "avg views + interaction rate" }
  ],
  "kpi_defaults": {
    "weekly_target": "XX videos published per milestone",
    "measure": "KOL count, video views, inbound traffic"
  }
}
```

- [ ] Create `channel_profiles/video.json`:

```json
{
  "channel": "video",
  "review_checklist": [
    "Hook — first 3 seconds compelling?",
    "Script length — matches platform (60s TikTok vs 10min YouTube)?",
    "CTA clarity — one clear action at end?",
    "Brand consistency — logo, colors, voice correct?"
  ],
  "content_template": {
    "type": "short | long",
    "structure": "hook → demo/story → insight → CTA"
  },
  "dashboard_widgets": [
    { "id": "views", "chart": "line" },
    { "id": "watch_time", "chart": "bar" },
    { "id": "subscriber_growth", "chart": "line" }
  ],
  "kpi_defaults": {
    "weekly_target": "2 videos",
    "measure": "views, watch time, subscriber growth"
  }
}
```

- [ ] Create `scripts/db-seed.js`:

```js
// scripts/db-seed.js
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

// Seed channel profiles
const cpDir = path.join(ROOT, 'channel_profiles')
const cpFiles = readdirSync(cpDir).filter(f => f.endsWith('.json'))
for (const f of cpFiles) {
  const data = JSON.parse(readFileSync(path.join(cpDir, f), 'utf-8'))
  await pool.query(
    `INSERT INTO channel_profiles (channel, review_checklist, content_template, dashboard_widgets, kpi_defaults)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (channel) DO UPDATE SET
       review_checklist = EXCLUDED.review_checklist,
       content_template = EXCLUDED.content_template,
       dashboard_widgets = EXCLUDED.dashboard_widgets,
       kpi_defaults = EXCLUDED.kpi_defaults`,
    [data.channel, JSON.stringify(data.review_checklist), JSON.stringify(data.content_template),
     JSON.stringify(data.dashboard_widgets), JSON.stringify(data.kpi_defaults)]
  )
  console.log(`seeded channel_profile: ${data.channel}`)
}

// Seed base engine files (workspace_id = NULL)
const baseEngineDir = path.join(ROOT, 'engines', '_base')
if (existsSync(baseEngineDir)) {
  function walk(dir, rel = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(full, relPath)
      else if (entry.name.endsWith('.md')) {
        const content = readFileSync(full, 'utf-8')
        pool.query(
          `INSERT INTO engines (workspace_id, file_path, content) VALUES (NULL, $1, $2)
           ON CONFLICT (workspace_id, file_path) DO UPDATE SET content = EXCLUDED.content`,
          [relPath, content]
        ).then(() => console.log(`seeded engine base: ${relPath}`))
      }
    }
  }
  walk(baseEngineDir)
}

await pool.end()
console.log('Seed complete.')
```

- [ ] **Verify (with DB):** `DATABASE_URL=<url> node scripts/db-seed.js` prints one line per channel profile and exits with `Seed complete.` Re-running is idempotent.

---

## Phase 2: Data Store Layer

### Task 4: Create `server/store.js`

- [ ] Create `server/store.js` with all DB CRUD functions:

```js
// server/store.js
import { query, queryOne } from './db.js'

// ── Workspaces ──────────────────────────────────────────────────────────────

export async function listWorkspaces() {
  return query('SELECT * FROM workspaces ORDER BY created_at DESC')
}

export async function getWorkspace(slug) {
  return queryOne('SELECT * FROM workspaces WHERE slug = $1', [slug])
}

export async function createWorkspace({ slug, name, lifecycle_state = 'onboarding', urls = {}, project_config = {}, engine_overrides = {} }) {
  return queryOne(
    `INSERT INTO workspaces (slug, name, lifecycle_state, urls, project_config, engine_overrides)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [slug, name, lifecycle_state, JSON.stringify(urls), JSON.stringify(project_config), JSON.stringify(engine_overrides)]
  )
}

export async function updateWorkspace(slug, patch) {
  const fields = []
  const vals = []
  let i = 1
  const allowed = ['name', 'lifecycle_state', 'urls', 'project_config', 'engine_overrides']
  for (const k of allowed) {
    if (patch[k] !== undefined) {
      fields.push(`${k} = $${i++}`)
      vals.push(typeof patch[k] === 'object' ? JSON.stringify(patch[k]) : patch[k])
    }
  }
  if (!fields.length) return getWorkspace(slug)
  fields.push(`updated_at = now()`)
  vals.push(slug)
  return queryOne(`UPDATE workspaces SET ${fields.join(', ')} WHERE slug = $${i} RETURNING *`, vals)
}

// ── People ───────────────────────────────────────────────────────────────────

export async function listPeople() {
  return query('SELECT * FROM people WHERE active = true ORDER BY handle')
}

export async function getPerson(id) {
  return queryOne('SELECT * FROM people WHERE id = $1', [id])
}

export async function createPerson({ handle, name, role, channels = [], max_workload = 3 }) {
  return queryOne(
    `INSERT INTO people (handle, name, role, channels, max_workload)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [handle, name, role, JSON.stringify(channels), max_workload]
  )
}

export async function updatePerson(id, patch) {
  const fields = []
  const vals = []
  let i = 1
  for (const k of ['name', 'role', 'channels', 'max_workload', 'active']) {
    if (patch[k] !== undefined) {
      fields.push(`${k} = $${i++}`)
      vals.push(Array.isArray(patch[k]) ? JSON.stringify(patch[k]) : patch[k])
    }
  }
  if (!fields.length) return getPerson(id)
  vals.push(id)
  return queryOne(`UPDATE people SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, vals)
}

// ── Agents ───────────────────────────────────────────────────────────────────

export async function listAgentsForWorkspace(workspaceId) {
  return query(
    `SELECT a.*, cp.review_checklist, cp.content_template, cp.dashboard_widgets, cp.kpi_defaults
     FROM agents a
     LEFT JOIN channel_profiles cp ON a.channel_profile_id = cp.id
     WHERE a.workspace_id = $1 ORDER BY a.channel`,
    [workspaceId]
  )
}

export async function createAgent({ workspace_id, channel, config = {}, metrics = {} }) {
  const cp = await queryOne('SELECT id FROM channel_profiles WHERE channel = $1', [channel])
  return queryOne(
    `INSERT INTO agents (workspace_id, channel, channel_profile_id, config, metrics)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [workspace_id, channel, cp?.id || null, JSON.stringify(config), JSON.stringify(metrics)]
  )
}

export async function updateAgentMetrics(agentId, metrics) {
  return queryOne(
    'UPDATE agents SET metrics = metrics || $1::jsonb WHERE id = $2 RETURNING *',
    [JSON.stringify(metrics), agentId]
  )
}

// ── Assignments ──────────────────────────────────────────────────────────────

export async function getAssignments(agentId) {
  return query(
    `SELECT aa.role, p.* FROM agent_assignments aa JOIN people p ON aa.person_id = p.id WHERE aa.agent_id = $1`,
    [agentId]
  )
}

export async function assign(agentId, personId, role) {
  return queryOne(
    `INSERT INTO agent_assignments (agent_id, person_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (agent_id, role) DO UPDATE SET person_id = EXCLUDED.person_id RETURNING *`,
    [agentId, personId, role]
  )
}

export async function autoAssignPeople(agentId, channel) {
  const candidates = await query(
    `SELECT p.id, p.role,
       COUNT(aa.agent_id) AS current_load
     FROM people p
     LEFT JOIN agent_assignments aa ON aa.person_id = p.id
     WHERE p.active = true
       AND p.channels @> $1::jsonb
     GROUP BY p.id
     HAVING COUNT(aa.agent_id) < p.max_workload
     ORDER BY current_load ASC`,
    [JSON.stringify([channel])]
  )
  const builder = candidates.find(c => c.role === 'builder')
  const reviewer = candidates.find(c => c.role === 'reviewer')
  if (builder) await assign(agentId, builder.id, 'builder')
  if (reviewer) await assign(agentId, reviewer.id, 'reviewer')
  return { builder: builder || null, reviewer: reviewer || null }
}

// ── ContentOS State ──────────────────────────────────────────────────────────

export async function getContentOSState(workspaceId) {
  return queryOne('SELECT * FROM contentos_states WHERE workspace_id = $1', [workspaceId])
}

export async function saveContentOSState(workspaceId, { current_step, steps }) {
  return queryOne(
    `INSERT INTO contentos_states (workspace_id, current_step, steps, last_updated)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (workspace_id) DO UPDATE SET
       current_step = EXCLUDED.current_step,
       steps = EXCLUDED.steps,
       last_updated = now()
     RETURNING *`,
    [workspaceId, current_step, JSON.stringify(steps)]
  )
}

// ── Strategy Docs ────────────────────────────────────────────────────────────

export async function getStrategyDoc(workspaceId, stepKey) {
  return queryOne(
    'SELECT * FROM strategy_docs WHERE workspace_id = $1 AND step_key = $2 ORDER BY version DESC LIMIT 1',
    [workspaceId, stepKey]
  )
}

export async function saveStrategyDoc(workspaceId, stepKey, content, usage = null) {
  const existing = await getStrategyDoc(workspaceId, stepKey)
  const version = existing ? existing.version + 1 : 1
  return queryOne(
    `INSERT INTO strategy_docs (workspace_id, step_key, version, content, usage)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [workspaceId, stepKey, version, content, usage ? JSON.stringify(usage) : null]
  )
}

// ── Engine Files ─────────────────────────────────────────────────────────────

export async function getEngineFile(workspaceId, filePath) {
  // Tier 1: product-specific
  const row = await queryOne(
    'SELECT content FROM engines WHERE workspace_id = $1 AND file_path = $2',
    [workspaceId, filePath]
  )
  if (row) return row.content
  // Tier 2: base skeleton (workspace_id IS NULL)
  const base = await queryOne(
    'SELECT content FROM engines WHERE workspace_id IS NULL AND file_path = $1',
    [filePath]
  )
  return base?.content || null
}

export async function upsertEngineFile(workspaceId, filePath, content) {
  return queryOne(
    `INSERT INTO engines (workspace_id, file_path, content) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, file_path) DO UPDATE SET content = EXCLUDED.content RETURNING *`,
    [workspaceId, filePath, content]
  )
}

export async function listEngineFiles(workspaceId) {
  return query(
    `SELECT file_path, LENGTH(content) AS size FROM engines
     WHERE workspace_id = $1 OR workspace_id IS NULL
     ORDER BY file_path`,
    [workspaceId]
  )
}

// ── Content Items ─────────────────────────────────────────────────────────────

export async function listContentItems(workspaceId, state = null) {
  if (state) {
    return query(
      'SELECT * FROM content_items WHERE workspace_id = $1 AND state = $2 ORDER BY mtime DESC',
      [workspaceId, state]
    )
  }
  return query('SELECT * FROM content_items WHERE workspace_id = $1 ORDER BY mtime DESC', [workspaceId])
}

export async function createContentItem({ workspace_id, agent_id, state = 'new-idea', frontmatter = {}, body = '' }) {
  return queryOne(
    `INSERT INTO content_items (workspace_id, agent_id, state, frontmatter, body)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [workspace_id, agent_id, state, JSON.stringify(frontmatter), body]
  )
}

export async function updateContentItemState(id, state) {
  return queryOne(
    'UPDATE content_items SET state = $1, mtime = now() WHERE id = $2 RETURNING *',
    [state, id]
  )
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export async function auditLog(workspaceId, actor, action, detail = {}) {
  return query(
    'INSERT INTO audit_log (workspace_id, actor, action, detail) VALUES ($1, $2, $3, $4)',
    [workspaceId, actor, action, JSON.stringify(detail)]
  )
}
```

- [ ] **Verify:** `node -e "import('./server/store.js').then(() => console.log('store.js ok'))"` (no DATABASE_URL → no pool init, just module loads cleanly).

---

### Task 5: Update `server/bootstrap.js` to run migrations + seed on DB boot

- [ ] Read existing `server/bootstrap.js` first. After the existing `bootstrapProjectsDir()` call, add DB bootstrap:

In `server/bootstrap.js`, add at the top:
```js
import { hasDB } from './db.js'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import pg from 'pg'
const { Pool } = pg
```

Add new exported function after existing code:
```js
export async function bootstrapDB() {
  if (!hasDB()) return
  const { default: path } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const ROOT = path.join(__dirname, '..')

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

  // Run migration
  const migrationSql = readFileSync(path.join(ROOT, 'migrations/001-initial.sql'), 'utf-8')
  await pool.query(migrationSql)
  console.log('[bootstrap] DB migrations run')

  // Seed channel profiles
  const cpDir = path.join(ROOT, 'channel_profiles')
  if (existsSync(cpDir)) {
    for (const f of readdirSync(cpDir).filter(f => f.endsWith('.json'))) {
      const data = JSON.parse(readFileSync(path.join(cpDir, f), 'utf-8'))
      await pool.query(
        `INSERT INTO channel_profiles (channel, review_checklist, content_template, dashboard_widgets, kpi_defaults)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (channel) DO UPDATE SET
           review_checklist=EXCLUDED.review_checklist,
           content_template=EXCLUDED.content_template,
           dashboard_widgets=EXCLUDED.dashboard_widgets,
           kpi_defaults=EXCLUDED.kpi_defaults`,
        [data.channel, JSON.stringify(data.review_checklist), JSON.stringify(data.content_template),
         JSON.stringify(data.dashboard_widgets), JSON.stringify(data.kpi_defaults)]
      )
    }
    console.log('[bootstrap] channel profiles seeded')
  }

  await pool.end()
}
```

In `server/index.js`, import and call `bootstrapDB` alongside existing `bootstrap()`:
```js
import { bootstrap, bootstrapDB } from './bootstrap.js'
// ...
await bootstrap()
await bootstrapDB()
```

- [ ] **Verify:** Start server without DATABASE_URL, confirm `bootstrapDB` is a no-op (no error, no log line).

---

### Task 6: Create `scripts/db-migrate-data.js` (filesystem → DB one-time migration)

- [ ] Create `scripts/db-migrate-data.js`:

```js
// scripts/db-migrate-data.js
// One-time migration: reads filesystem projects/ → inserts into PostgreSQL
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import matter from 'gray-matter'
import pg from 'pg'
const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

const PROJECTS_DIR = path.join(ROOT, 'projects')
const entries = readdirSync(PROJECTS_DIR)

for (const slug of entries) {
  if (slug.startsWith('_')) continue
  const projectDir = path.join(PROJECTS_DIR, slug)
  const yamlPath = path.join(projectDir, 'project.yaml')
  if (!existsSync(yamlPath)) continue

  const cfg = yaml.load(readFileSync(yamlPath, 'utf-8')) || {}
  const name = cfg.name || slug

  // Determine lifecycle_state from contentos state file
  let lifecycle_state = 'onboarding'
  const stateFile = path.join(projectDir, '.contentos-state.json')
  if (existsSync(stateFile)) {
    const st = JSON.parse(readFileSync(stateFile, 'utf-8'))
    if (st.current_step >= 4) lifecycle_state = 'active'
    else if (st.current_step > 0) lifecycle_state = 'strategy'
  }

  const ws = await pool.query(
    `INSERT INTO workspaces (slug, name, lifecycle_state, project_config)
     VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO UPDATE SET
       name=EXCLUDED.name, lifecycle_state=EXCLUDED.lifecycle_state,
       project_config=EXCLUDED.project_config
     RETURNING id`,
    [slug, name, lifecycle_state, JSON.stringify(cfg)]
  )
  const wsId = ws.rows[0].id
  console.log(`workspace: ${slug} (${wsId})`)

  // Migrate contentos state
  if (existsSync(stateFile)) {
    const st = JSON.parse(readFileSync(stateFile, 'utf-8'))
    await pool.query(
      `INSERT INTO contentos_states (workspace_id, current_step, steps, last_updated)
       VALUES ($1,$2,$3,now()) ON CONFLICT (workspace_id) DO UPDATE SET
         current_step=EXCLUDED.current_step, steps=EXCLUDED.steps, last_updated=now()`,
      [wsId, st.current_step || 0, JSON.stringify(st.steps || {})]
    )
  }

  // Migrate strategy docs
  const strategyDir = path.join(projectDir, 'strategy')
  if (existsSync(strategyDir)) {
    for (const f of readdirSync(strategyDir).filter(f => f.endsWith('.md'))) {
      const stepKey = f.replace('.md', '')
      const content = readFileSync(path.join(strategyDir, f), 'utf-8')
      await pool.query(
        `INSERT INTO strategy_docs (workspace_id, step_key, version, content)
         VALUES ($1,$2,1,$3)`,
        [wsId, stepKey, content]
      )
      console.log(`  strategy: ${stepKey}`)
    }
  }

  // Migrate agents
  const agentsDir = path.join(projectDir, 'agents')
  if (existsSync(agentsDir)) {
    for (const agId of readdirSync(agentsDir)) {
      const agDir = path.join(agentsDir, agId)
      const agYaml = path.join(agDir, 'agent.yaml')
      if (!existsSync(agYaml)) continue
      const agCfg = yaml.load(readFileSync(agYaml, 'utf-8')) || {}
      const channel = (agCfg.platform || agId).split(/[·, /]/)[0].toLowerCase().trim()

      const cpRow = await pool.query('SELECT id FROM channel_profiles WHERE channel = $1', [channel])
      const cpId = cpRow.rows[0]?.id || null

      let metricsJson = '{}'
      const metricsFile = path.join(agDir, 'metrics.json')
      if (existsSync(metricsFile)) metricsJson = readFileSync(metricsFile, 'utf-8')

      const agRow = await pool.query(
        `INSERT INTO agents (workspace_id, channel, channel_profile_id, config, metrics)
         VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING RETURNING id`,
        [wsId, channel, cpId, JSON.stringify(agCfg), metricsJson]
      )
      const agDbId = agRow.rows[0]?.id
      if (!agDbId) continue
      console.log(`  agent: ${agId} (channel: ${channel})`)

      // Migrate content items
      function walkContentBank(state, stateDir) {
        if (!existsSync(stateDir)) return
        for (const f of readdirSync(stateDir).filter(f => f.endsWith('.md') && f !== '.gitkeep')) {
          try {
            const parsed = matter(readFileSync(path.join(stateDir, f), 'utf-8'))
            pool.query(
              `INSERT INTO content_items (workspace_id, agent_id, state, frontmatter, body, mtime)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [wsId, agDbId, state, JSON.stringify(parsed.data), parsed.content,
               new Date(statSync(path.join(stateDir, f)).mtimeMs).toISOString()]
            )
          } catch (e) { console.warn(`  skip ${f}:`, e.message) }
        }
      }
      const bankDir = path.join(agDir, 'content-bank')
      walkContentBank('new-idea', path.join(bankDir, 'new-idea'))
      walkContentBank('draft', path.join(bankDir, 'draft'))
      walkContentBank('bank', path.join(bankDir, 'bank'))
      walkContentBank('published', path.join(bankDir, 'published'))
    }
  }
}

await pool.end()
console.log('Data migration complete.')
```

- [ ] **Verify (with DB):** `DATABASE_URL=<url> node scripts/db-migrate-data.js` prints one line per workspace and agent. After running, `psql $DATABASE_URL -c "SELECT slug, lifecycle_state FROM workspaces;"` shows all 5 products.

---

## Phase 3: Adapt Existing Server Modules

### Task 7: Adapt `server/api.js` — dual-read for projects, agents, content

- [ ] In `server/api.js`, add at the top:

```js
import { hasDB } from './db.js'
import * as store from './store.js'
```

- [ ] Replace `listProjects()` function to use DB when available:

```js
async function listProjects() {
  if (hasDB()) {
    const rows = await store.listWorkspaces()
    return rows.map(ws => ({
      slug: ws.slug,
      name: ws.name,
      lifecycle_state: ws.lifecycle_state,
      ...ws.project_config,
    }))
  }
  // existing filesystem logic unchanged below
  const reg = existsSync(REGISTRY) ? JSON.parse(readFileSync(REGISTRY, 'utf-8')) : {}
  return Object.entries(reg).map(([slug, meta]) => ({ slug, ...meta }))
}
```

- [ ] Wrap `GET /api/projects` route to call updated `listProjects()` (no route change needed — it already calls `listProjects()`).

- [ ] Add `GET /api/workspaces` route that returns DB workspace list with contentos state summary:

```js
app.get('/api/workspaces', async (req, res) => {
  if (!hasDB()) return res.json({ error: 'no database' })
  try {
    const workspaces = await store.listWorkspaces()
    const result = []
    for (const ws of workspaces) {
      const cosState = await store.getContentOSState(ws.id)
      result.push({ ...ws, contentos_state: cosState })
    }
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
```

- [ ] Add `GET /api/workspaces/:slug` route:

```js
app.get('/api/workspaces/:slug', async (req, res) => {
  if (!hasDB()) return res.json({ error: 'no database' })
  try {
    const ws = await store.getWorkspace(req.params.slug)
    if (!ws) return res.status(404).json({ error: 'not found' })
    const cosState = await store.getContentOSState(ws.id)
    const agents = await store.listAgentsForWorkspace(ws.id)
    res.json({ ...ws, contentos_state: cosState, agents })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
```

- [ ] **Verify:** Start server with `DATABASE_URL` set. `curl http://localhost:8082/api/workspaces` returns JSON array of workspaces. Without `DATABASE_URL`, `curl http://localhost:8082/api/projects` still works (filesystem path).

---

### Task 8: Adapt `server/contentos.js` — strategy docs + contentos states to DB

- [ ] In `server/contentos.js`, add at the top:

```js
import { hasDB } from './db.js'
import * as store from './store.js'
```

- [ ] Modify `runContentOSStep(slug, n)` to save strategy doc to DB when available. After the existing `writeFileSync(outFile, text)` call, add:

```js
if (hasDB()) {
  const ws = await store.getWorkspace(slug)
  if (ws) {
    const stepKey = STEP_KEYS[n - 1]  // ['01-market-insight', '02-user-insight', '03-competitor-analysis', '04-content-strategy']
    await store.saveStrategyDoc(ws.id, stepKey, text, result.usage || null)
    const stateObj = readState(slug)
    await store.saveContentOSState(ws.id, {
      current_step: stateObj.current_step,
      steps: stateObj.steps,
    })
  }
}
```

- [ ] Add `GET /api/contentos/:slug/state` dual-read in `server/api.js`. Find the existing handler for `/api/contentos/:slug/state` and wrap it:

```js
app.get('/api/contentos/:slug/state', async (req, res) => {
  const { slug } = req.params
  if (hasDB()) {
    const ws = await store.getWorkspace(slug)
    if (ws) {
      const cosState = await store.getContentOSState(ws.id)
      return res.json({ state: cosState || { current_step: 0, steps: {} } })
    }
  }
  // existing filesystem fallback
  const stateFile = path.join(getProjectDir(slug), '.contentos-state.json')
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf-8')) : { current_step: 0, steps: {} }
  res.json({ state })
})
```

- [ ] Add `GET /api/contentos/:slug/strategy` dual-read:

```js
app.get('/api/contentos/:slug/strategy', async (req, res) => {
  const { slug } = req.params
  const step = parseInt(req.query.step || '1')
  const stepKeys = ['01-market-insight', '02-user-insight', '03-competitor-analysis', '04-content-strategy']
  const stepKey = stepKeys[step - 1]
  if (hasDB()) {
    const ws = await store.getWorkspace(slug)
    if (ws) {
      const doc = await store.getStrategyDoc(ws.id, stepKey)
      return res.json({ content: doc?.content || '' })
    }
  }
  // filesystem fallback
  const f = path.join(getProjectDir(slug), 'strategy', `${stepKey}.md`)
  res.json({ content: existsSync(f) ? readFileSync(f, 'utf-8') : '' })
})
```

- [ ] **Verify:** With DB, `curl /api/contentos/voc-ai/state` returns DB-backed state. Without DB, returns filesystem state. Both return same shape `{ state: { current_step, steps } }`.

---

### Task 9: Adapt `server/runner.js` and `server/source-ideas.js` — write content items to DB

- [ ] In `server/runner.js`, add at top: `import { hasDB } from './db.js'` and `import * as store from './store.js'`

- [ ] After writing each draft `.md` file (the loop `for (const p of posts)`), add DB write:

```js
if (hasDB()) {
  const ws = await store.getWorkspace(project)
  if (ws) {
    const agRow = await store.listAgentsForWorkspace(ws.id)
    const ag = agRow.find(a => a.channel === parsePlatforms(cfg.platform)[0])
    await store.createContentItem({
      workspace_id: ws.id,
      agent_id: ag?.id || null,
      state: status === 'rejected' ? 'draft' : 'draft',
      frontmatter: p.data,
      body: p.content,
    })
  }
}
```

- [ ] In `server/source-ideas.js`, similarly add DB write of new-idea content items after `writeFileSync`:

```js
if (hasDB()) {
  const ws = await store.getWorkspace(project)
  if (ws) {
    await store.createContentItem({
      workspace_id: ws.id,
      agent_id: null,
      state: 'new-idea',
      frontmatter: parsed.data,
      body: parsed.content,
    })
  }
}
```

- [ ] **Verify:** Run `node -e "import('./server/runner.js').then(m => console.log('runner ok'))"` — module loads without error. No DB write happens until `runAgent()` is actually called.

---

## Phase 4: New API Endpoints

### Task 10: Workspace CRUD endpoints

- [ ] In `server/api.js`, add new routes after existing workspace GET routes:

```js
// POST /api/workspaces — create new workspace
app.post('/api/workspaces', requireAuth, async (req, res) => {
  if (!hasDB()) return res.status(503).json({ error: 'DATABASE_URL required' })
  try {
    const { slug, name, urls = {}, project_config = {} } = req.body
    if (!slug || !name) return res.status(400).json({ error: 'slug and name required' })
    const ws = await store.createWorkspace({ slug, name, urls, project_config, lifecycle_state: 'onboarding' })
    await store.saveContentOSState(ws.id, { current_step: 0, steps: {} })
    await auditLog(ws.id, req.headers['x-actor'] || 'api', 'workspace.created', { slug, name })
    res.json(ws)
  } catch (e) {
    if (e.message.includes('unique')) return res.status(409).json({ error: 'slug already exists' })
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/workspaces/:slug — update workspace fields
app.patch('/api/workspaces/:slug', requireAuth, async (req, res) => {
  if (!hasDB()) return res.status(503).json({ error: 'DATABASE_URL required' })
  try {
    const ws = await store.updateWorkspace(req.params.slug, req.body)
    if (!ws) return res.status(404).json({ error: 'not found' })
    res.json(ws)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
```

- [ ] **Verify:**
  - `curl -X POST http://localhost:8082/api/workspaces -H 'Content-Type: application/json' -d '{"slug":"test-ws","name":"Test WS"}' -H 'Authorization: Bearer <token>'` → returns workspace object with `id` and `lifecycle_state: onboarding`
  - `curl -X PATCH http://localhost:8082/api/workspaces/test-ws -H 'Content-Type: application/json' -d '{"lifecycle_state":"strategy"}' -H 'Authorization: Bearer <token>'` → returns updated workspace
  - Duplicate slug returns 409.

---

### Task 11: Onboarding analyze endpoint

- [ ] Create `server/onboarding.js`:

```js
// server/onboarding.js
import { complete } from './llm.js'

const analyses = new Map()  // in-memory short-lived cache (id → result)

export function newAnalysisId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export async function analyzeProduct({ website, github_kb }) {
  const id = newAnalysisId()
  analyses.set(id, { status: 'running', started_at: new Date().toISOString() })

  const prompt = `You are a product analyst. Analyze the following product URL(s) and extract structured GTM metadata.

Website URL: ${website}
${github_kb ? `GitHub KB URL: ${github_kb}` : ''}

Return ONLY a JSON object (no markdown, no preamble) with these fields:
{
  "name": "Product name",
  "slug": "kebab-case-slug",
  "tagline": "One-sentence tagline",
  "category": "B2B SaaS | B2C | Dev tools | etc",
  "url": "${website}",
  "audience": {
    "primary": "Primary audience description",
    "secondary": "Secondary audience"
  },
  "positioning": "1-2 sentence positioning statement",
  "competitors": ["competitor1", "competitor2", "competitor3"],
  "suggested_channels": ["reddit", "x", "blog", "kol-koc"]
}`

  try {
    const { text } = await complete(prompt, { maxTokens: 2000 })
    const jsonStr = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const data = JSON.parse(jsonStr)
    analyses.set(id, { status: 'done', result: data, completed_at: new Date().toISOString() })
  } catch (e) {
    analyses.set(id, { status: 'error', error: e.message })
  }
  return id
}

export function getAnalysis(id) {
  return analyses.get(id) || null
}
```

- [ ] In `server/api.js`, import and wire up:

```js
import { analyzeProduct, getAnalysis } from './onboarding.js'

// POST /api/onboarding/analyze
app.post('/api/onboarding/analyze', requireAuth, async (req, res) => {
  const { website, github_kb } = req.body
  if (!website) return res.status(400).json({ error: 'website URL required' })
  const id = await analyzeProduct({ website, github_kb })
  res.json({ id })
})

// GET /api/onboarding/analysis/:id
app.get('/api/onboarding/analysis/:id', async (req, res) => {
  const result = getAnalysis(req.params.id)
  if (!result) return res.status(404).json({ error: 'analysis not found' })
  res.json(result)
})
```

- [ ] **Verify:**
  - `curl -X POST http://localhost:8082/api/onboarding/analyze -H 'Content-Type: application/json' -d '{"website":"https://voc.ai"}' -H 'Authorization: Bearer <token>'` → returns `{ id: "..." }`
  - `curl http://localhost:8082/api/onboarding/analysis/<id>` → returns `{ status: "done", result: {...} }` after a few seconds.

---

### Task 12: Pool CRUD + assignments endpoints

- [ ] In `server/api.js`, add pool routes:

```js
// GET /api/pool
app.get('/api/pool', async (req, res) => {
  if (!hasDB()) return res.json({ error: 'no database' })
  try {
    const people = await store.listPeople()
    // Enrich with current workload
    const result = []
    for (const p of people) {
      const rows = await query(
        `SELECT aa.agent_id, w.slug AS workspace_slug, a.channel
         FROM agent_assignments aa
         JOIN agents a ON a.id = aa.agent_id
         JOIN workspaces w ON w.id = a.workspace_id
         WHERE aa.person_id = $1`,
        [p.id]
      )
      result.push({ ...p, assignments: rows, current_workload: rows.length })
    }
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/pool — add person
app.post('/api/pool', requireAuth, async (req, res) => {
  if (!hasDB()) return res.status(503).json({ error: 'DATABASE_URL required' })
  try {
    const { handle, name, role, channels, max_workload } = req.body
    if (!handle || !name || !role) return res.status(400).json({ error: 'handle, name, role required' })
    const person = await store.createPerson({ handle, name, role, channels, max_workload })
    res.json(person)
  } catch (e) {
    if (e.message.includes('unique')) return res.status(409).json({ error: 'handle already exists' })
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/pool/:id — update person
app.patch('/api/pool/:id', requireAuth, async (req, res) => {
  if (!hasDB()) return res.status(503).json({ error: 'DATABASE_URL required' })
  try {
    const person = await store.updatePerson(req.params.id, req.body)
    if (!person) return res.status(404).json({ error: 'not found' })
    res.json(person)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/assignments — assign person to agent
app.post('/api/assignments', requireAuth, async (req, res) => {
  if (!hasDB()) return res.status(503).json({ error: 'DATABASE_URL required' })
  try {
    const { agent_id, person_id, role } = req.body
    if (!agent_id || !person_id || !role) return res.status(400).json({ error: 'agent_id, person_id, role required' })
    const result = await store.assign(agent_id, person_id, role)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
```

- [ ] Add `import { query } from './db.js'` at top of `server/api.js`.

- [ ] **Verify:**
  - `curl http://localhost:8082/api/pool` returns array (empty if no people seeded yet).
  - POST a person, then GET /api/pool shows them with `current_workload: 0`.

---

### Task 13: Engine file inheritance API

- [ ] In `server/api.js`, add engine file routes:

```js
// GET /api/engines/:ws/file/*path — read with inheritance
app.get('/api/engines/:ws/file/*', async (req, res) => {
  if (!hasDB()) return res.status(503).json({ error: 'DATABASE_URL required' })
  try {
    const ws = await store.getWorkspace(req.params.ws)
    if (!ws) return res.status(404).json({ error: 'workspace not found' })
    const filePath = req.params[0]  // everything after /file/
    const content = await store.getEngineFile(ws.id, filePath)
    if (content === null) return res.status(404).json({ error: 'file not found' })
    res.json({ file_path: filePath, content, workspace: ws.slug })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/engines/:ws/file/*path — write engine file override
app.put('/api/engines/:ws/file/*', requireAuth, async (req, res) => {
  if (!hasDB()) return res.status(503).json({ error: 'DATABASE_URL required' })
  try {
    const ws = await store.getWorkspace(req.params.ws)
    if (!ws) return res.status(404).json({ error: 'workspace not found' })
    const filePath = req.params[0]
    const { content } = req.body
    if (!content) return res.status(400).json({ error: 'content required' })
    const result = await store.upsertEngineFile(ws.id, filePath, content)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /api/engines/:ws — list all engine files
app.get('/api/engines/:ws', async (req, res) => {
  if (!hasDB()) return res.status(503).json({ error: 'DATABASE_URL required' })
  try {
    const ws = await store.getWorkspace(req.params.ws)
    if (!ws) return res.status(404).json({ error: 'workspace not found' })
    const files = await store.listEngineFiles(ws.id)
    res.json(files)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
```

- [ ] **Verify:** `curl http://localhost:8082/api/engines/voc-ai/file/voice/brand-voice.md` returns base engine file content if no product override exists. After `PUT` with custom content, same GET returns custom content.

---

## Phase 5: Dashboard

### Task 14: Update `dashboard/src/routes/Home.tsx` — lifecycle state badges + pool status

- [ ] Read `dashboard/src/routes/Home.tsx` first.

- [ ] Update Home to fetch `/api/workspaces` when DB is available, falling back to `/api/projects`:

```tsx
// In Home.tsx, add lifecycle state color mapping
const STATE_COLOR: Record<string, string> = {
  onboarding: '#f59e0b',   // amber
  strategy: '#3b82f6',     // blue
  engine_building: '#8b5cf6', // purple
  active: '#10b981',       // green
  paused: '#6b7280',       // gray
  archived: '#374151',     // dark gray
}

const STATE_LABEL: Record<string, string> = {
  onboarding: 'Onboarding',
  strategy: 'Strategy',
  engine_building: 'Building Engine',
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
}
```

- [ ] Add `LifecycleBadge` component inline in Home.tsx:

```tsx
function LifecycleBadge({ state }: { state: string }) {
  return (
    <span style={{
      background: STATE_COLOR[state] || '#6b7280',
      color: '#fff',
      fontSize: '11px',
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: '12px',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    }}>
      {STATE_LABEL[state] || state}
    </span>
  )
}
```

- [ ] In the project card render, add `<LifecycleBadge state={project.lifecycle_state || 'active'} />` next to the project name.

- [ ] Add "New Product" button linking to `/onboard` in the Home header area:

```tsx
<Link to="/onboard" className="btn btn-primary" style={{ marginLeft: 'auto' }}>
  + New Product
</Link>
```

- [ ] **Verify:** Open browser at `http://localhost:5173/`. Cards show colored lifecycle badges. "+ New Product" button appears in header.

---

### Task 15: Create `dashboard/src/routes/Onboard.tsx` — onboarding wizard

- [ ] Create `dashboard/src/routes/Onboard.tsx`:

```tsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToken, authHeaders } from '../hooks/useToken'

type Phase = 'input' | 'analyzing' | 'confirm' | 'creating' | 'done'

type Analysis = {
  name: string
  slug: string
  tagline: string
  category: string
  url: string
  audience: { primary: string; secondary: string }
  positioning: string
  competitors: string[]
  suggested_channels: string[]
}

export default function Onboard() {
  const [phase, setPhase] = useState<Phase>('input')
  const [website, setWebsite] = useState('')
  const [githubKb, setGithubKb] = useState('')
  const [analysisId, setAnalysisId] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [editedAnalysis, setEditedAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState('')
  const [token] = useToken()
  const navigate = useNavigate()

  const runAnalysis = async () => {
    if (!website.trim()) { setError('Website URL is required'); return }
    setError('')
    setPhase('analyzing')
    const r = await fetch('/api/onboarding/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({ website, github_kb: githubKb || undefined }),
    }).then(r => r.json())
    if (r.error) { setError(r.error); setPhase('input'); return }
    const id = r.id
    setAnalysisId(id)
    // Poll for result
    let tries = 0
    const poll = setInterval(async () => {
      tries++
      const res = await fetch(`/api/onboarding/analysis/${id}`).then(r => r.json())
      if (res.status === 'done') {
        clearInterval(poll)
        setAnalysis(res.result)
        setEditedAnalysis({ ...res.result })
        setPhase('confirm')
      } else if (res.status === 'error' || tries > 30) {
        clearInterval(poll)
        setError(res.error || 'Analysis timed out')
        setPhase('input')
      }
    }, 2000)
  }

  const createProduct = async () => {
    if (!editedAnalysis) return
    setPhase('creating')
    const r = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify({
        slug: editedAnalysis.slug,
        name: editedAnalysis.name,
        urls: { website, github_kb: githubKb || undefined },
        project_config: editedAnalysis,
      }),
    }).then(r => r.json())
    if (r.error) { setError(r.error); setPhase('confirm'); return }
    setPhase('done')
    setTimeout(() => navigate(`/wizard/${editedAnalysis.slug}`), 1500)
  }

  if (phase === 'done') {
    return (
      <div className="wizard wizard-success">
        <div className="success-burst">
          <div className="success-checkmark">✓</div>
          <h1>Product Created</h1>
          <p>Redirecting to ContentOS wizard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="wizard">
      <header className="wizard-header">
        <Link to="/" className="wizard-back">← projects</Link>
        <div className="wizard-title">
          <span className="wt-label">ONBOARDING</span>
          <h1>New Product</h1>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
        {phase === 'input' && (
          <div>
            <h2 style={{ marginBottom: 8 }}>Product URLs</h2>
            <p style={{ color: '#9ca3af', marginBottom: 24 }}>
              Paste your product website URL. AI will analyze it and pre-fill the product config.
            </p>
            {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Website URL *</label>
            <input
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="https://your-product.com"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #374151',
                background: '#1f2937', color: '#f9fafb', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
            />
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>GitHub KB URL (optional)</label>
            <input
              type="url"
              value={githubKb}
              onChange={e => setGithubKb(e.target.value)}
              placeholder="https://github.com/org/kb-repo"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #374151',
                background: '#1f2937', color: '#f9fafb', fontSize: 14, marginBottom: 24, boxSizing: 'border-box' }}
            />
            <button className="btn btn-primary" onClick={runAnalysis} style={{ width: '100%' }}>
              Analyze Product →
            </button>
          </div>
        )}

        {phase === 'analyzing' && (
          <div style={{ textAlign: 'center', paddingTop: 64 }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⟳</div>
            <h2>Analyzing product...</h2>
            <p style={{ color: '#9ca3af' }}>AI is scraping {website} and extracting GTM metadata.</p>
          </div>
        )}

        {phase === 'confirm' && editedAnalysis && (
          <div>
            <h2 style={{ marginBottom: 8 }}>Confirm Product Info</h2>
            <p style={{ color: '#9ca3af', marginBottom: 24 }}>Review and correct the AI's analysis.</p>
            {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}
            {[
              { key: 'name', label: 'Product Name' },
              { key: 'slug', label: 'Slug (URL-safe)' },
              { key: 'tagline', label: 'Tagline' },
              { key: 'category', label: 'Category' },
              { key: 'positioning', label: 'Positioning' },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 13 }}>{label}</label>
                <input
                  value={(editedAnalysis as any)[key] || ''}
                  onChange={e => setEditedAnalysis({ ...editedAnalysis, [key]: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #374151',
                    background: '#1f2937', color: '#f9fafb', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 13 }}>Competitors (comma-separated)</label>
              <input
                value={editedAnalysis.competitors?.join(', ') || ''}
                onChange={e => setEditedAnalysis({ ...editedAnalysis, competitors: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #374151',
                  background: '#1f2937', color: '#f9fafb', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <button className="btn btn-primary" onClick={createProduct} style={{ width: '100%' }}>
              Create Product & Start ContentOS Wizard →
            </button>
          </div>
        )}

        {phase === 'creating' && (
          <div style={{ textAlign: 'center', paddingTop: 64 }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⟳</div>
            <h2>Creating product workspace...</h2>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] In `dashboard/src/main.tsx`, add the import and route:

```tsx
import Onboard from './routes/Onboard.tsx'
// In Routes:
<Route path="/onboard" element={<Onboard />} />
```

- [ ] **Verify:** Navigate to `http://localhost:5173/onboard`. Enter a URL and click "Analyze Product". With `GTM_WRITES_TOKEN` set in env and Bearer token in browser localStorage, analysis runs and confirmation form appears.

---

### Task 16: Create `dashboard/src/routes/Pool.tsx` — people pool manager

- [ ] Create `dashboard/src/routes/Pool.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToken, authHeaders } from '../hooks/useToken'

type Person = {
  id: string
  handle: string
  name: string
  role: 'builder' | 'reviewer'
  channels: string[]
  max_workload: number
  current_workload: number
  assignments: { workspace_slug: string; channel: string }[]
}

const CHANNELS = ['reddit', 'x', 'blog', 'kol-koc', 'video', 'social', 'ads', 'edm', 'yelp']

export default function Pool() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newPerson, setNewPerson] = useState({ handle: '', name: '', role: 'builder', channels: [] as string[], max_workload: 3 })
  const [token] = useToken()

  const refresh = async () => {
    setLoading(true)
    const data = await fetch('/api/pool').then(r => r.json())
    setPeople(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const addPerson = async () => {
    const r = await fetch('/api/pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(newPerson),
    }).then(r => r.json())
    if (r.error) { alert(r.error); return }
    setShowAdd(false)
    setNewPerson({ handle: '', name: '', role: 'builder', channels: [], max_workload: 3 })
    await refresh()
  }

  const toggleChannel = (ch: string) => {
    setNewPerson(p => ({
      ...p,
      channels: p.channels.includes(ch) ? p.channels.filter(c => c !== ch) : [...p.channels, ch],
    }))
  }

  // Coverage gaps: channels with no reviewer or no builder
  const coveredBuilders = new Set(people.filter(p => p.role === 'builder').flatMap(p => p.channels))
  const coveredReviewers = new Set(people.filter(p => p.role === 'reviewer').flatMap(p => p.channels))
  const gaps = CHANNELS.filter(ch => !coveredBuilders.has(ch) || !coveredReviewers.has(ch))

  if (loading) return <div style={{ padding: 32 }}>Loading pool...</div>

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link to="/" style={{ color: '#9ca3af', textDecoration: 'none' }}>← projects</Link>
        <h1 style={{ margin: 0, fontSize: 20 }}>People Pool</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)} style={{ marginLeft: 'auto' }}>
          + Add Person
        </button>
      </div>

      {gaps.length > 0 && (
        <div style={{ background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: 8, padding: '12px 16px', marginBottom: 24 }}>
          <strong>Coverage gaps:</strong> {gaps.join(', ')} — no builder or reviewer assigned
        </div>
      )}

      {showAdd && (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px' }}>Add Person</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Handle</label>
              <input value={newPerson.handle} onChange={e => setNewPerson(p => ({ ...p, handle: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #374151', background: '#111827', color: '#f9fafb', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Full Name</label>
              <input value={newPerson.name} onChange={e => setNewPerson(p => ({ ...p, name: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #374151', background: '#111827', color: '#f9fafb', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Role</label>
            <select value={newPerson.role} onChange={e => setNewPerson(p => ({ ...p, role: e.target.value as any }))}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #374151', background: '#111827', color: '#f9fafb' }}>
              <option value="builder">Builder</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: '#9ca3af' }}>Channels</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CHANNELS.map(ch => (
                <button key={ch}
                  onClick={() => toggleChannel(ch)}
                  style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid #374151', cursor: 'pointer', fontSize: 12,
                    background: newPerson.channels.includes(ch) ? '#3b82f6' : '#374151', color: '#fff' }}>
                  {ch}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" onClick={addPerson}>Save Person</button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #374151', color: '#9ca3af', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>Handle</th>
            <th style={{ padding: '8px 12px' }}>Name</th>
            <th style={{ padding: '8px 12px' }}>Role</th>
            <th style={{ padding: '8px 12px' }}>Channels</th>
            <th style={{ padding: '8px 12px' }}>Workload</th>
            <th style={{ padding: '8px 12px' }}>Assigned</th>
          </tr>
        </thead>
        <tbody>
          {people.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #1f2937' }}>
              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.handle}</td>
              <td style={{ padding: '8px 12px' }}>{p.name}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ background: p.role === 'builder' ? '#1d4ed8' : '#065f46', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: '#fff' }}>
                  {p.role}
                </span>
              </td>
              <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{p.channels.join(', ')}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ color: p.current_workload >= p.max_workload ? '#ef4444' : '#10b981' }}>
                  {p.current_workload}/{p.max_workload}
                </span>
              </td>
              <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 11 }}>
                {p.assignments?.map(a => `${a.workspace_slug}/${a.channel}`).join(', ') || '—'}
              </td>
            </tr>
          ))}
          {people.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No people in pool yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] In `dashboard/src/main.tsx`, add import and route:

```tsx
import Pool from './routes/Pool.tsx'
// In Routes:
<Route path="/pool" element={<Pool />} />
```

- [ ] **Verify:** Navigate to `http://localhost:5173/pool`. Shows empty table with "+ Add Person" button. Gaps row shows all channels initially. After adding a person with some channels, those channels are removed from gaps.

---

### Task 17: Update `dashboard/src/App.tsx` — lifecycle sidebar + channel agent cards

- [ ] Read `dashboard/src/App.tsx` first.

- [ ] Add lifecycle progress bar in App.tsx left sidebar area. Add a `LifecycleBar` component:

```tsx
const LIFECYCLE_STEPS = ['onboarding', 'strategy', 'engine_building', 'active']
const LIFECYCLE_LABELS: Record<string, string> = {
  onboarding: 'Onboarding',
  strategy: 'Strategy',
  engine_building: 'Building Engine',
  active: 'Active',
}

function LifecycleBar({ state }: { state: string }) {
  const idx = LIFECYCLE_STEPS.indexOf(state)
  return (
    <div style={{ padding: '16px 0', borderBottom: '1px solid #1f2937', marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Lifecycle</div>
      {LIFECYCLE_STEPS.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: i < idx ? '#10b981' : i === idx ? '#3b82f6' : '#374151' }} />
          <span style={{ fontSize: 12, color: i <= idx ? '#f9fafb' : '#6b7280' }}>
            {LIFECYCLE_LABELS[s]}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] Add an `AgentChannelCard` component to render per-channel widgets:

```tsx
type AgentRow = {
  id: string
  channel: string
  status: string
  config: Record<string, any>
  metrics: Record<string, any>
  review_checklist: string[]
  dashboard_widgets: any[]
  kpi_defaults: Record<string, any>
}

function AgentChannelCard({ agent }: { agent: AgentRow }) {
  const channelColors: Record<string, string> = {
    reddit: '#ff4500', x: '#1d9bf0', blog: '#10b981',
    'kol-koc': '#f59e0b', video: '#ef4444', default: '#6b7280',
  }
  const color = channelColors[agent.channel] || channelColors.default
  return (
    <div style={{ background: '#1f2937', border: `1px solid ${color}33`, borderRadius: 12, padding: 16, minWidth: 180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: agent.status === 'active' ? '#10b981' : '#6b7280' }} />
        <span style={{ fontWeight: 700, fontSize: 13, color }}>{agent.channel}</span>
        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>{agent.status}</span>
      </div>
      {agent.kpi_defaults?.weekly_target && (
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
          Target: {agent.kpi_defaults.weekly_target}
        </div>
      )}
      {agent.metrics?.rolling_30d && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
          {Object.entries(agent.metrics.rolling_30d).map(([k, v]) => (
            <div key={k} style={{ fontSize: 10, color: '#9ca3af' }}>
              <span style={{ color: '#f9fafb', fontWeight: 600 }}>{String(v)}</span> {k}
            </div>
          ))}
        </div>
      )}
      <button style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #374151',
        background: 'transparent', color: '#9ca3af', cursor: 'pointer', width: '100%' }}>
        查看队列
      </button>
    </div>
  )
}
```

- [ ] In the main App component, fetch workspace data from `/api/workspaces/:slug` when `hasDB` (check via a new `/api/health` field or simply try the endpoint). Add agents state and render channel cards in a scrollable row below the existing tab content for the overview tab.

- [ ] **Verify:** Navigate to `http://localhost:5173/dashboard/voc-ai`. Lifecycle bar shows on left side. Channel cards appear in overview tab if DB has agents for that workspace.

---

## Final Verification Checklist

- [ ] `npm install` — no errors
- [ ] `node scripts/db-migrate.js` — migration runs, idempotent
- [ ] `node scripts/db-seed.js` — 5 channel profiles seeded
- [ ] `node scripts/db-migrate-data.js` — all 5 products + agents migrated
- [ ] Server starts: `node server/index.js` — no errors
- [ ] `GET /api/workspaces` — returns 5 workspaces with lifecycle states
- [ ] `GET /api/workspaces/voc-ai` — returns workspace with agents array
- [ ] `GET /api/pool` — returns array (empty or populated)
- [ ] `POST /api/onboarding/analyze` + poll `GET /api/onboarding/analysis/:id` — returns product analysis JSON
- [ ] `GET /api/engines/voc-ai/file/voice/brand-voice.md` — returns base engine file
- [ ] Dashboard home (`/`) — shows lifecycle badges on product cards
- [ ] `/onboard` — URL input form renders, analyze button works
- [ ] `/pool` — table renders, "+ Add Person" form works
- [ ] `/dashboard/voc-ai` — lifecycle bar shows, channel cards render (with DB)
- [ ] Without `DATABASE_URL`: existing `/api/projects`, `/api/agents`, `/api/content` routes still work

---

## Notes

- The `engines/_base/` directory must be populated with the existing engine files from `projects/voc-ai/engine/` before `db-seed.js` will seed base engine files. Copy them: `cp -r projects/voc-ai/engine/* engines/_base/` (one-time setup step before first deploy).
- `agent_assignments` uses `(agent_id, role)` as PK, so each agent has at most one builder and one reviewer — reassigning overwrites.
- The `analyzeProduct` function in `server/onboarding.js` stores analyses in-memory. They are lost on server restart. For production, persist to Redis or a short-lived DB table.
- Pool auto-assignment (`autoAssignPeople`) uses a subquery on `agent_assignments` — if no one covers a channel, both `builder` and `reviewer` will be null and the agent gets `status = 'needs_people'` (update the agent record separately after checking auto-assign result).
