# Agent 10-yelp — SKILL (Builder owns this file)

**Builder:** TBD
**Reviewer:** TBD
**Default product:** solvea
**Status:** blocked

## What this agent does
TODO — Builder fills in. What is the job, what does success look like, how often does it run.

## Inputs
- Topic / brief (from `memory/trending.md` or manual)
- `engines/solvea/` Skill Graph (Ronin pattern)
- `memory/playbook.md` cross-agent lessons
- `agents/10-yelp/playbook.md` agent-specific lessons
- `agents/10-yelp/anti-patterns.md` rejected drafts

## Tools / platform connectors
TODO — list `platforms/*` modules.

## Execution recipe
1. Read `engines/solvea/CLAUDE.md` for full skill graph
2. Read `agents/10-yelp/playbook.md` + `anti-patterns.md`
3. Produce native draft (NOT reformat — rethink per Principle 5)
4. Write to `agents/10-yelp/content-bank/draft/<ts>-<slug>.md` with frontmatter (product, topic, hook_type, source_url)
5. Symlink into `reviews/TBD/` for queue

## Definition of Stable · Good · Long-Running (Principle 2)
- **Stable**: TODO — what makes runner not break (rate-limit, retry, fallback)
- **Good**: TODO — output quality bar from Reviewer
- **Long-running**: TODO — what stays consistent over months (voice, frequency, KPI direction)
