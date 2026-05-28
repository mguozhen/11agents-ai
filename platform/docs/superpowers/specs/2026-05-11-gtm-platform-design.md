# GTM Platform — Generalized Product Lifecycle Engine

> Spec v1.0 · 2026-05-11
> Status: design approved, pending implementation plan

## Overview

Generalize the GTM Agent Swarm from a hand-configured repo into a platform where any product can plug in and get GTM capabilities automatically. Target: internal product matrix first (Solvea, VOC AI, BTCMind, Flatkey, PairCode), architecture SaaS-ready.

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Target user | Internal product matrix first, SaaS-ready architecture | Validate model before multi-tenancy complexity |
| Product onboarding | URL input → AI analysis → founder confirmation | Reduce manual project.yaml creation to a single step |
| Iron Triangle | Shared human pool | Reuse existing people across products, no per-agent binding |
| Content engine | Shared base skeleton + async product-specific build | Ships content in 1 hour, improves over time |
| Storage | PostgreSQL (JSONB columns) | Railway-native, handles semi-structured docs, supports indexing and queries |

## Layer 1: Product Lifecycle State Machine

A product is a stateful lifecycle object, not a static YAML file.

```
onboarding  →  strategy  →  engine_building  →  active  →  (paused | archived)
```

| State | Trigger | Actions available | Artifacts |
|---|---|---|---|
| `onboarding` | Founder enters URL(s) | AI analyzes product, generates project config | workspace row, project config (auto-filled) |
| `strategy` | Founder confirms info | ContentOS 4-step wizard runs automatically | 4 strategy docs (market insight, user insight, competitor analysis, content strategy) |
| `engine_building` | Strategy complete | Shared skeleton activated immediately; product-specific engine built async in background | Base engine (instant) + custom engine (async) |
| `active` | Engine ready | Daily cron sources ideas; agents produce content; pipeline runs | Content pipeline (ideas → drafts → bank → published) |
| `paused` | Manual action | Cron stopped, data preserved | — |
| `archived` | Product sunset | Data retained, all automations disabled | — |

### Onboarding Inputs

- **Product website URL** (required): AI scrapes site, infers product category, tagline, audience, competitors
- **GitHub knowledge base URL** (optional): Repository of markdown files (organized in folders) providing product depth — docs, guides, technical specs, brand guidelines

AI presents analysis results. Founder confirms/corrects. One click to proceed.

## Layer 2: Shared Human Pool

Builders and Reviewers are platform-level resources, not per-agent bindings.

### Data Model

```yaml
# people/<handle>.yaml → migrated to people table
handle: wayne
role: builder          # builder | reviewer
channels:              # which agent channels this person can handle
  - reddit
  - social
max_workload: 3        # max agents they can be assigned to
```

### Allocation Rules

1. New agent creation: auto-assign from pool by channel match + lowest current workload
2. If no person covers a channel → flag agent as `needs_people`, show staffing ticket in Dashboard
3. All assignments stored in `agent_assignments` table, Dashboard supports drag-to-reassign
4. One person can be Builder for Product A's Reddit agent AND Product B's Reddit agent

## Layer 3: Engine Template Inheritance

Three-tier content engine resolution:

### Tier 1: Shared Base Skeleton (`engines/_base/`)

Checked into the repo, seeded into `engines` table with `workspace_id = NULL` on deploy. Contains:

```
voice/brand-voice.md       # Generic professional-but-approachable voice
voice/platform-tone.md     # Platform-specific tone differences
audience/casual.md         # Generic casual audience
audience/builders.md       # Generic builder/developer audience
platforms/x.md, linkedin.md, newsletter.md, youtube.md, tiktok.md...
```

### Tier 2: Product Overrides (`workspaces.engine_overrides` JSONB)

```json
{
  "brand_voice": "Crypto-native, talk like a trader not an analyst",
  "primary_audience": "BTC daily traders",
  "tone": "irreverent"
}
```

### Tier 3: Product-Specific Engine (async build)

After strategy is complete, ContentOS generates a full product-specific engine (the 17-file skill graph). Stored in `engines` table with `workspace_id = <product>`. When present, overrides both Tier 1 and Tier 2 for that file.

### Runtime Resolution

```
content generation context assembly:
  for each engine file needed:
    1. SELECT from engines WHERE workspace_id = <product> AND file_path = <path>
    2. If not found → SELECT from engines WHERE workspace_id IS NULL AND file_path = <path>
    3. If not found → use workspace.engine_overrides + workspace config as fallback
```

## Layer 4: Multi-Product Dashboard

### Pages

**Home — Product Overview**
- Card grid: one card per product, color-coded by lifecycle state
- Each card: product name, state badge, pipeline counts (ideas/drafts/published)
- Top bar: "New Product" button, pool status summary (Wayne 2/3, Ivy 1/3)
- Bottom bar: today's output summary across all products

**Product Detail** (`/<slug>`)
- Left sidebar: lifecycle progress bar + ContentOS step status
- Center: content pipeline (existing IDEAS / DRAFTS / BANK / PUBLISHED views)
- Right sidebar: assigned people + engine override summary

**Onboarding** (`/onboard` or wizard on `/new`)
- URL input(s): website (required), GitHub KB (optional)
- AI analysis preview: product name, tagline, audience, competitors
- Confirmation step: founder edits/corrects each field
- Submit → product created in `onboarding` state → auto-transitions to `strategy`

**Pool Manager** (`/pool`)
- Table: people, role, channels, current workload, assigned products
- Drag-to-reassign for agent assignments
- Highlight channels with zero coverage (staffing gaps)

## Layer 5: Channel-Specific Agent Profiles

Each channel (Reddit, X, Blog, KOL/KOC, Video, etc.) has fundamentally different content formats, review criteria, and success metrics. Channel profiles make this heterogeneity first-class — defining the template for each channel type, which product-level agent instances then customize.

### Profile Structure

Channel profiles live in code (`channel_profiles/`) and are seeded into PostgreSQL on deploy. A profile defines everything a Builder, Agent, and Reviewer need for that channel:

| Field | Purpose | Example (Reddit) |
|---|---|---|
| `review_checklist` | Reviewer's per-item audit checklist | No spam feel? Rule-compliant for target subs? Value-first or self-promo ratio? |
| `content_template` | Output format for the agent runner | Post title + body, comment vs thread type |
| `dashboard_widgets` | Metrics displayed on dashboard per agent | Karma in target subs, saved/upvoted ratio, ban warnings |
| `kpi_defaults` | Default KPI that products can override | 5 posts/week, 2 saved-posts/week, 0 ban warnings |

### Per-Channel Examples

```
channel_profiles/
  reddit/
    review_checklist:    # Ivy sees this sidebar when reviewing Reddit drafts
      - Native fit — does it read like a redditor wrote it?
      - Subreddit rule check — r/CryptoMarkets vs r/Bybit rules differ
      - Value ratio — >80% helpful, <20% product mention
      - Anti-spam — no link-dropping, no karma-farming language
    content_template:     # Agent runner uses this to structure output
      type: post | comment
      structure: "hook (1 line) → context (2-3 lines) → value body → optional tail mention"
    dashboard_widgets:
      - karma_trend: { source: metrics.karma_by_sub, chart: line }
      - ban_warnings: { source: metrics.ban_warnings, chart: count }
      - signup_attribution: { source: metrics.reddit_signups, chart: bar }
    kpi_defaults:
      weekly_target: "5 posts/comments"
      measure: "karma in target subs, saved/upvoted ratio, 0 ban warnings"

  x/
    review_checklist:
      - Hook sharpness — does line 1 stop the scroll?
      - Thread structure — is the 1/7 format clear?
      - Trending relevance — tied to current conversation?
      - Brand voice — crypto-native but not cringe
    content_template:
      type: tweet | thread
      structure: "hook → supporting data → insight → CTA or close"
    dashboard_widgets:
      - impressions: { chart: line }
      - follower_growth: { chart: bar, period: weekly }
      - thread_saves: { chart: count }
      - spaces_attendance: { chart: count }
    kpi_defaults:
      weekly_target: "14 posts (2/day)"
      measure: "impressions, follower growth >500/week, 1 viral thread/week"

  kol-koc/
    review_checklist:
      - KOL fit — audience alignment with product?
      - Personalization — does the outreach read human?
      - Schedule — conflict with other campaigns?
      - Deliverable clarity — video format, length, deadline explicit?
    content_template:
      type: outreach_dm | video_brief | collab_proposal
      structure: "personal intro → why them specifically → collab idea → deliverables → timeline"
    dashboard_widgets:
      - kol_pipeline: { stages: [contacted, negotiating, confirmed, live, completed] }
      - video_output: { chart: calendar, metric: views }
      - engagement: { chart: bar, metric: avg views + interaction rate }
    kpi_defaults:
      weekly_target: "XX videos published by 5/30"
      measure: "KOL count, video views, inbound traffic"

  blog/
    review_checklist:
      - SEO target — does the keyword appear in H1/H2/first 100 words?
      - Depth — real data/research vs thin AI summary?
      - Internal linking — 2+ links to other blog posts?
      - Competitor comparison — honest, data-backed, not FUD
    content_template:
      type: seo_post | comparison_post | case_study
      structure: "H1 + meta desc → intro hook → body (H2 sections) → conclusion + CTA"
    dashboard_widgets:
      - ranking_positions: { chart: line, source: Ahrefs/GSC }
      - organic_traffic: { chart: bar, period: weekly }
      - conversion_rate: { source: blog→signup funnel }
    kpi_defaults:
      weekly_target: "3 posts"
      measure: "Ahrefs rank, organic traffic, blog→signup conversion >2%"
```

### Agent Instantiation Flow

```
1. Product completes ContentOS → hydrate agents
2. For each of the 11 agents:
   a. Copy channel_profile defaults (review_checklist, content_template, dashboard_widgets, kpi)
   b. Override with product-specific config from strategy output
   c. Assign Builder + Reviewer from shared pool by channel match
   d. Agent record in DB now has full operational config
```

### Reviewer Interaction Flow (Daily)

```
cron triggers agent → produces draft
  → Reviewer opens queue (Dashboard /review)
  → Sees draft content + channel-specific review_checklist in sidebar
  → Checks each item, writes inline comments
  → approve → moves to bank, metrics bump
  → reject → writes anti-pattern note, which field(s) failed
  → All actions recorded in audit_log
```

### Dashboard Per-Channel View

Each agent card on the product detail page renders its own `dashboard_widgets`:

```
Product: BTCMind  |  🟢 active
┌─────────────────────────────────────────────────────┐
│  📊 Overview: 12 ideas | 8 drafts | 3 published    │
│  👥 Pool: Wayne(2/3) Ivy(1/3) 张基琳(1/3)         │
├────────────┬────────────┬────────────┬──────────────┤
│ 06 Reddit  │ 07 X       │ 03 Blog    │ 02 KOL/KOC   │
│ 🟢 active  │ 🟢 active  │ 🟢 active  │ 🟡 needs_ppl │
│ karma ↑    │ impr 42k   │ rank #3    │ pipeline:    │
│ 0 bans     │ +320 fol   │ 890 org    │ 3→1→0→0      │
│ [查看队列] │ [查看队列]  │ [查看队列] │ [查看队列]    │
└────────────┴────────────┴────────────┴──────────────┘
```

## Layer 6: Database Schema

PostgreSQL on Railway.

### Tables

```sql
-- Channel profiles (seeded from code on deploy, NOT user-editable)
CREATE TABLE channel_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT UNIQUE NOT NULL,      -- reddit, x, kol-koc, blog, video, etc.
  review_checklist JSONB DEFAULT '[]',
  content_template JSONB DEFAULT '{}',
  dashboard_widgets JSONB DEFAULT '[]',
  kpi_defaults JSONB DEFAULT '{}'
);

-- Workspaces (formerly projects/)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'onboarding',
  -- onboarding
  urls JSONB DEFAULT '{}',        -- {website, github_kb}
  project_config JSONB DEFAULT '{}', -- the full project.yaml as JSONB
  engine_overrides JSONB DEFAULT '{}',
  -- timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Strategy docs (one row per doc per version)
CREATE TABLE strategy_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  step_key TEXT NOT NULL,  -- 01-market-insight, etc.
  version INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  usage JSONB,             -- LLM token usage
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ContentOS state (per workspace, mutable)
CREATE TABLE contentos_states (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id),
  current_step INT DEFAULT 0,
  steps JSONB DEFAULT '{}',
  last_updated TIMESTAMPTZ
);

-- People (shared pool)
CREATE TABLE people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,          -- builder | reviewer
  channels JSONB DEFAULT '[]',
  max_workload INT DEFAULT 3,
  active BOOLEAN DEFAULT true
);

-- Agent instances (per product per channel)
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  channel TEXT NOT NULL,       -- reddit, blog, kol, video, etc.
  channel_profile_id UUID REFERENCES channel_profiles(id),
  status TEXT DEFAULT 'active',
  config JSONB DEFAULT '{}',  -- agent.yaml as JSONB
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent-to-people assignments
CREATE TABLE agent_assignments (
  agent_id UUID REFERENCES agents(id),
  person_id UUID REFERENCES people(id),
  role TEXT NOT NULL,           -- builder | reviewer
  PRIMARY KEY (agent_id, role)
);

-- Content items (pipeline)
CREATE TABLE content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  agent_id UUID REFERENCES agents(id),
  state TEXT NOT NULL DEFAULT 'new-idea',  -- new-idea | draft | bank | published
  frontmatter JSONB DEFAULT '{}',
  body TEXT DEFAULT '',
  mtime TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Engine files
CREATE TABLE engines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),  -- NULL = base skeleton
  file_path TEXT NOT NULL,
  content TEXT DEFAULT '',
  UNIQUE (workspace_id, file_path)
);

-- Audit log
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id),
  actor TEXT,
  action TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_content_items_workspace_state ON content_items(workspace_id, state);
CREATE INDEX idx_agents_workspace ON agents(workspace_id);
CREATE INDEX idx_engines_lookup ON engines(workspace_id, file_path);
CREATE INDEX idx_audit_log_workspace ON audit_log(workspace_id, created_at DESC);
```

### Migration from file-based

One-time script: read all `projects/*/project.yaml`, `projects/*/agents/*/agent.yaml`, `projects/*/strategy/*.md`, `projects/*/agents/*/content-bank/**/*.md` → INSERT into corresponding tables. `_registry.json` → merged into `workspaces.project_config`.

Channel profiles: seeded from `channel_profiles/` directory in the repo on first deploy. No existing file data to migrate — this is new capability.

## Layer 7: API Changes

### New endpoints

```
POST   /api/workspaces              # create workspace (onboarding submit)
PATCH  /api/workspaces/:slug        # update workspace config/state
GET    /api/workspaces/:slug        # full workspace detail
GET    /api/workspaces              # list all workspaces (dashboard home)

POST   /api/onboarding/analyze      # submit URL(s) → AI analysis preview
GET    /api/onboarding/analysis/:id # fetch analysis result

GET    /api/pool                    # list all people + their assignments
POST   /api/pool                    # add person
PATCH  /api/pool/:id                # update person (channels, workload)
POST   /api/assignments             # assign/reassign person to agent

GET    /api/engines/:ws/file/*path  # read engine file (with inheritance)
PUT    /api/engines/:ws/file/*path  # write/edit engine file
```

### Changed endpoints

Existing `/api/projects`, `/api/agents`, `/api/content`, `/api/contentos/:slug/*` → adapt to read from PostgreSQL instead of filesystem.

## Scope Boundaries

**In scope for v1:**
- PostgreSQL migration (all data)
- Product lifecycle state machine
- Onboarding wizard (URL input + AI analysis + confirmation)
- Shared human pool with auto-assignment
- Engine inheritance (base skeleton + product overrides, async product-specific generation)
- Channel-specific agent profiles (review checklists, content templates, dashboard widgets per channel)
- Multi-product dashboard (home overview + per-product detail with per-channel widgets)
- Adapted existing API endpoints

**Out of scope for v1:**
- SaaS multi-tenancy (workspaces isolation, billing, user auth)
- Template marketplace for engines
- External API tokens / webhooks
