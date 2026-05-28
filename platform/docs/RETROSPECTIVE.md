# GTM Swarm — Architecture Retrospective & v3 Optimization

> Written 2026-05-11 after end-to-end v2 ship. Honest assessment from the implementation work, not aspirational.

## TL;DR

**What this product is**: a multi-product Founder Build Console where, for any of 5 products (VOC AI / Solvea / BTCMind / Flatkey / PairCode), a Founder runs a 4-step ContentOS Agent discovery (Market / User / Competitor / Content Strategy), then 11 GTM agents are hydrated from the strategy YAML, then daily an Ideas Pool refreshes with N ideas per agent, then the Reviewer approves/rejects from the dashboard.

**What actually works** (Iron Triangle is real):
- ContentOS Agent 4-step discovery produces 60-100 KB of strategically usable markdown per project (verified twice — voc-ai $20-50K consulting brief equivalent; btcmind 45 KB)
- 11 agent.yaml files get hydrated automatically with project-specific goal / KPI / topics
- Reddit drafts produced via run-agent.py are platform-native (verified 5 VOC AI Reddit drafts — real data, not slop)
- Dashboard renders strategy + agents + content-bank as a single SPA
- Daily idea generation produces idea cards with rationale + angle + hook seed

**What's hacky** (be honest):
- Engine skill graph is duplicated across projects (voc-ai has copy, btcmind has copy of voc-ai's — brand voice misaligned)
- Reviewer queue is filesystem symlinks — brittle on Railway / Docker where symlinks may break
- contentos-agent.py + run-agent.py + source-ideas.py are now duplicated as Node.js ports in server/ — divergence risk
- No real authentication; whoever can hit the URL can run agents (burns API $)
- "Schedule" cron doesn't run anywhere yet (launchd plist exists but not loaded on Railway)
- Ideas Pool only refreshes via manual `/api/source-ideas` POST — no scheduled trigger on Railway

## Architecture (current, v2)

```
┌──────────────────────────────────────────────────────────┐
│  Browser                                                 │
│  React+Vite SPA · Home + Wizard + Dashboard              │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼─────────────────────────────────────┐
│  Railway container                                       │
│  Node 22 + Express + @anthropic-ai/sdk                   │
│  /api/projects · /api/agents · /api/content              │
│  /api/contentos/:slug/{state,strategy,run-step,build}    │
│  /api/promote-idea · /api/reject-idea · /api/review      │
│  /api/source-ideas · /api/health                         │
└────────────────────┬─────────────────────────────────────┘
                     │ filesystem
┌────────────────────▼─────────────────────────────────────┐
│  projects/<slug>/                                        │
│   ├ project.yaml                                         │
│   ├ strategy/01..04-*.md     (ContentOS Agent output)   │
│   ├ engine/                  (Ronin Skill Graph: 17 md) │
│   ├ agents/01..11/                                       │
│   │   ├ agent.yaml           (Iron Triangle config)     │
│   │   ├ playbook.md          (Memory: what worked)      │
│   │   ├ anti-patterns.md     (Taste: what didn't)       │
│   │   ├ metrics.json         (rolling 30d counters)     │
│   │   └ content-bank/{new-idea,draft,bank,published}/   │
│   └ .contentos-state.json                                │
│  reviews/<reviewer>/<symlink>.md                        │
└──────────────────────────────────────────────────────────┘
```

## What's good

1. **Filesystem-as-database scales surprisingly far.** ~1MB of content / project, git-versioned, human-readable, no schema migrations. For < 100 projects × 11 agents × 100 drafts/yr = 110K markdown files. Reasonable.

2. **Iron Triangle as filesystem state.** Each agent is `agent.yaml + SKILL.md + reviewer.md + playbook.md + anti-patterns.md + metrics.json + content-bank/*` — 7 files, no DB. Builder edits SKILL.md in their editor of choice. Reviewer fills playbook/anti-patterns via UI or CLI.

3. **ContentOS Agent state machine.** 4-step human-in-loop discovery is the right shape — Founder reads + edits + approves each step. Without this gate the output is too unsupervised.

4. **Multi-product registry.** `projects/_registry.json` + 5-project list scales linearly to 50+ products without UI changes. Wizard reuses across products.

5. **Frontend / backend separation.** SPA + REST = deployable to any static + Node host (Railway, Vercel, Fly.io, Cloudflare Pages + Workers, etc.).

6. **Anthropic SDK port done correctly.** Replacing `claude --print` subprocess with `@anthropic-ai/sdk` was mechanical (same prompts work). Now Railway-native, no local CLI dependency.

## What's hacky (and why)

### H1: Engine duplication across projects
Each `projects/<slug>/engine/` is a full copy of the 17-file skill graph (208 KB × 3 = 624 KB).

**Why hacky**: brand voice should differ per project (BTCMind ≠ Amazon-seller-tone). Right now BTCMind/engine is just a copy of voc-ai/engine — outputs sound like Amazon analyst not crypto trader.

**v3 fix**: split engine into "core graph" (platforms.md / hooks.md / repurpose.md — brand-agnostic) and "brand layer" (index.md / voice/brand-voice.md — per-project). ContentOS Agent Step 4 produces the brand layer files from strategy, not just agent.yaml.

### H2: Reviewer queue is symlinks
`reviews/Ivy Chen/foo.md` → symlinks to `projects/voc-ai/agents/06-reddit/content-bank/draft/foo.md`.

**Why hacky**: symlinks break on Docker COPY without `-a`, don't transfer across filesystems, can leave orphans when target is deleted.

**v3 fix**: replace with a `reviews.json` index file per reviewer listing draft paths. Or use a SQLite `reviews` table.

### H3: Python + Node duplication
`scripts/contentos-agent.py` + `scripts/run-agent.py` + `scripts/source-ideas.py` are kept around for local CLI use, but the same logic is reimplemented in `server/contentos.js` etc for Railway. Two source-of-truth = drift.

**v3 fix**: pick one — either Node-only (delete Python scripts) or call out to Python from Node via child_process. Recommend Node-only since Railway only ships Node.

### H4: No auth
`POST /api/promote-idea` (which burns Claude API $) is open to anyone with the URL.

**v3 fix**: add `Authorization: Bearer <token>` check on all write endpoints. Token from env var. Founder-only.

### H5: Scheduling doesn't run on Railway
launchd plist + run-all.sh exist for local. Railway doesn't honor them.

**v3 fix**: Railway Cron service (separate cron-only deploy that hits `/api/source-ideas` on a schedule). Or use GitHub Actions cron triggering the Railway API.

### H6: Solvea project stuck mid-wizard
`projects/solvea/.contentos-state.json` shows `step_1_done` but `strategy/01-market-insight.md` was overwritten somewhere along the way and `strategy/02-user-insight.md` exists but is partial. State machine got into a weird state.

**v3 fix**: make state machine atomic — write strategy file + state.json in a transaction. Or use a content hash check.

### H7: Dashboard has dead views
- `published` state never gets anything written to it (no flow from `bank` → `published`)
- `metrics.json` published count is always 0

**v3 fix**: add a "🚀 Mark as Published" button on Bank tab + a `/api/publish` endpoint that moves `bank/foo.md` → `published/foo.md` + bumps metric. (Or wire to Postiz for actual distribution.)

## v3 Optimization Roadmap

### Tier 1 — Trust & Auth (BEFORE more shares)
- Bearer token auth on all writes (~/api/promote-idea / /api/run-step / /api/build / /api/review)
- Cloudflare Access policy on the custom domain
- Rate limit (token bucket) per endpoint
- (1 day)

### Tier 2 — Real Scheduling
- Railway Cron service for daily Ideas Pool refresh
- Per-agent schedule cron parsing from agent.yaml (currently hardcoded daily 8am)
- Notification when reviewer queue gets > N items
- (2 days)

### Tier 3 — Engine Refactor
- Split engine into core + brand layers
- ContentOS Agent Step 4 generates brand layer (index.md / brand-voice.md) — not just agent.yaml
- Per-project engine is now ~17KB (brand layer) + symlink to shared core (~200KB)
- (3 days)

### Tier 4 — Distribution Layer
- Connect to Postiz (already plan'd: gitroomhq/postiz-app fork)
- "🚀 Publish to <platform>" button on Bank tab
- Track upvotes/clicks back via webhooks
- Auto-feed metrics into engine/hooks.md weekly
- (1-2 weeks)

### Tier 5 — Paperclip Bridge (real)
- Detect Paperclip server on localhost OR pass URL via env
- POST agent state to Paperclip's `/api/companies/:id/agents` schema
- Two-way sync: Paperclip's approval status reflects in dashboard
- (1 week)

### Tier 6 — Multi-language / Localization
- Some content is Chinese (中国客服 line is Chinese-first)
- Engine should detect / specify output language
- (TBD)

## Lessons Learned (for next products)

1. **Start with the 4-step Founder discovery, not the agent skeleton.** v1 built 11 agents first then asked "what do they do?" v2 ran ContentOS Agent first then hydrated — that order is right.

2. **Markdown > database for content-as-config.** Schema-less, diffable, human-grok. SQLite/Postgres are for *metrics + queues*, not strategy briefs.

3. **Iron Triangle is non-negotiable.** Builder + Agent + Reviewer = real check on quality. Without Reviewer, swarm produces slop. Without Builder, agent has no context. Without Agent, you're just hand-writing.

4. **Anti-patterns matter more than playbook.** What got rejected teaches the prompt more than what got approved. Make it easy to capture reject reasons inline.

5. **One topic → N platform-native posts** (Ronin's rule, Step 4 in repurpose.md) is the unlock. Without "rethink not reformat", every post looks like AI.

6. **Strategy briefs should be 20KB+ markdown, not 3-bullet summaries.** ContentOS Agent's first attempt was a meta-summary; force "OUTPUT INSTRUCTION" strict to get the depth. Founder wants to read it cover-to-cover.

7. **Filesystem is fine until 10k+ items.** When it stops being fine, you'll know.

## Counter-positions (things I might be wrong about)

- **Maybe Postgres is right after all.** When 5 reviewers each have 50 items in queue, querying filesystem becomes slow.
- **Maybe Python scripts should stay primary**, with the Node server being a thin proxy. Easier for engineers to debug locally.
- **Maybe the wizard should NOT be human-in-loop.** Run all 4 steps in 5 min while Founder gets coffee. Edit only if first pass is wrong.
- **Maybe we should sell ContentOS Agent as a standalone product** before the full swarm. The 4-step discovery is the highest-value piece.

## Acceptance Criteria for v3

If after Tier 1-5 we still can't:
1. Onboard a new product in < 1 hour (Founder fills project.yaml → wizard → built)
2. Generate 20+ ideas per agent per day on Railway cron
3. Reviewer approves 30 items / week without leaving dashboard
4. 50+% of approved drafts get to "published" state
5. At least 1 metric (clicks/upvotes/conversions) flows back into engine hooks.md weekly

… then the architecture is wrong, not the features. Stop adding features, fix the architecture.
