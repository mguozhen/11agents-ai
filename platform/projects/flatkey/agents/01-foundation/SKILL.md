# Agent 01-foundation — SKILL (Builder owns this file)

**Builder:** 钟石龙
**Reviewer:** Boyuan
**Default product:** all
**Status:** deployable

## What this agent does
TODO — Builder fills in. What is the job, what does success look like, how often does it run.

## Inputs
- Topic / brief (from `memory/trending.md` or manual)
- `engines/all/` Skill Graph (Ronin pattern)
- `memory/playbook.md` cross-agent lessons
- `agents/01-foundation/playbook.md` agent-specific lessons
- `agents/01-foundation/anti-patterns.md` rejected drafts

## Tools / platform connectors
TODO — list `platforms/*` modules.

## Execution recipe
1. Read `engines/all/CLAUDE.md` for full skill graph
2. Read `agents/01-foundation/playbook.md` + `anti-patterns.md`
3. Produce native draft (NOT reformat — rethink per Principle 5)
4. Write to `agents/01-foundation/content-bank/draft/<ts>-<slug>.md` with frontmatter (product, topic, hook_type, source_url)
5. Symlink into `reviews/Boyuan/` for queue

## Definition of Stable · Good · Long-Running (Principle 2)
- **Stable**: TODO — what makes runner not break (rate-limit, retry, fallback)
- **Good**: TODO — output quality bar from Reviewer
- **Long-running**: TODO — what stays consistent over months (voice, frequency, KPI direction)
