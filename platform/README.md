# GTM Agent Swarm

> Build GTM capability at scale — Traffic + Revenue oriented, adaptable to any product.

11 GTM agents on the **Iron Triangle** (Builder + Agent + Reviewer) with a shared content engine and shared distribution layer. Source of truth for the architecture is `PRINCIPLES.md` + `ROSTER.md`. Background lives in `~/.claude/plans/gtm-agent-swarm-https-manus-im-share-fi-luminous-koala.md`.

## Four-layer stack

```
L4  Distribution      fork of gitroomhq/postiz-app — 14 platforms + scheduler
L3  Pipeline UI       DaoJie ContentOS shape — 4 states, review queue, port 8082
L2  Iron Triangle     this repo — agents/<n>/ governance files
L1  Content brain     ~/solvea-content-engine (Ronin Skill Graph) — symlinked under engines/
```

## Repo layout

```
agents/        one folder per GTM agent (01-foundation … 11-poster)
engines/       symlinks to skill-graph engines (voc-ai, solvea, cnapi, shulex-cn)
platforms/     shared platform connectors (reddit, youtube, …)
memory/        cross-agent Memory + Taste (brand voice, playbook, anti-patterns)
dashboard/     Vite + React local UI (port 8082) — DaoJie ContentOS shape
scripts/       new-agent.sh, run-agent.sh, review-queue.sh
reviews/       per-reviewer queue of pending items
.github/       cron workflows per agent
```

## Quick start

```bash
./scripts/new-agent.sh 12-yourname            # scaffold a new agent (refuses if Iron Triangle incomplete)
./scripts/review-queue.sh ivy-chen            # pull a reviewer's queue
./scripts/run-agent.sh 06-reddit --dry-run    # produce a draft into reviews/
```

## Status

Phase A skeleton. Pilot agent = `06-reddit` (Wayne builder / Ivy Chen reviewer / VOC AI product).
