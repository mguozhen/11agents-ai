#!/usr/bin/env bash
# Scaffold a new GTM agent under agents/<id>/.
# Enforces Principle 3: No Triangle = No Agent.
# Refuses to create the directory if builder or reviewer is missing.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="$REPO_ROOT/agents"

if [[ $# -lt 1 ]]; then
  cat <<'USAGE'
Usage: new-agent.sh <id>
  <id>  numeric-name slug, e.g. 06-reddit or 12-tiktok-shop

You will be prompted for platform / builder / reviewer / goal.
Iron Triangle rule: builder and reviewer must both be non-empty.
USAGE
  exit 1
fi

ID="$1"
DIR="$AGENTS_DIR/$ID"

if [[ -d "$DIR" ]]; then
  echo "Agent $ID already exists at $DIR" >&2
  exit 1
fi

read -r -p "Platform (e.g. Reddit, X · GitHub · LinkedIn): " PLATFORM
read -r -p "Builder (engineer name, REQUIRED): " BUILDER
read -r -p "Reviewer (taste owner, REQUIRED): " REVIEWER
read -r -p "Goal (one sentence): " GOAL
read -r -p "Default product (solvea | voc-ai | cnapi | shulex-cn): " PRODUCT

if [[ -z "$BUILDER" || -z "$REVIEWER" ]]; then
  cat >&2 <<'ERR'

REFUSED — Iron Triangle incomplete.
Principle 3: No triangle = no agent. Find a Builder and Reviewer first.
ERR
  exit 2
fi

mkdir -p "$DIR/content-bank"/{new-idea,draft,bank,published}
touch "$DIR/content-bank/new-idea/.gitkeep" \
      "$DIR/content-bank/draft/.gitkeep" \
      "$DIR/content-bank/bank/.gitkeep" \
      "$DIR/content-bank/published/.gitkeep"

cat > "$DIR/agent.yaml" <<YAML
id: $ID
platform: "$PLATFORM"
builder: "$BUILDER"
reviewer: "$REVIEWER"
goal: "$GOAL"
default_product: "$PRODUCT"
kpi:
  weekly_target: TBD
  measure: TBD
schedule: TBD
budget_monthly_usd: 0
YAML

cat > "$DIR/SKILL.md" <<MD
# Agent $ID — SKILL (Builder owns this file)

**Builder:** $BUILDER
**Platform:** $PLATFORM
**Default product:** $PRODUCT

## What this agent does
TODO — describe the job, output shape, frequency.

## Inputs
- Topic / brief
- \`engines/$PRODUCT/\` skill graph (Ronin pattern — 17 files)
- \`memory/playbook.md\` cross-agent learnings
- \`agents/$ID/playbook.md\` agent-specific learnings
- \`agents/$ID/anti-patterns.md\` known-rejected patterns

## Tools / connectors
TODO — \`platforms/<platform>/\` modules used.

## Execution recipe
1. Read engine + memory + anti-patterns.
2. Produce draft following the Ronin Skill Graph chain (one topic → native post, not reformat).
3. Write to \`agents/$ID/content-bank/draft/<ts>-<slug>.md\` with YAML frontmatter (product, topic, hook_type).
4. Mirror to \`reviews/$REVIEWER/\` for the Reviewer queue.

## Definition of stable / good / long-running (Principle 2)
- Stable: TODO
- Good: TODO
- Long-running: TODO
MD

cat > "$DIR/reviewer.md" <<MD
# Agent $ID — Reviewer Standards ($REVIEWER owns this file)

## Must-check before approve
TODO — list 3-7 hard checks the reviewer runs on every draft.

## Approve criteria
TODO

## Reject heuristics
TODO — patterns that get auto-rejected, written from this Reviewer's taste.

## Weekly retro (Friday)
- Update \`agents/$ID/playbook.md\` with what worked
- Append rejects to \`agents/$ID/anti-patterns.md\`
- Surface anything generalizable to \`memory/playbook.md\`
MD

cat > "$DIR/playbook.md" <<MD
# Agent $ID — Playbook (Memory)

Append-only. What worked, with the why. Read by \`runner\` before every draft.

## Format
\`\`\`
### YYYY-MM-DD · <topic> · <platform>
- What: <one-line outcome>
- Why it worked: <hook / angle / proof / format>
- Reuse: <when to apply again>
\`\`\`

## Entries
(none yet)
MD

cat > "$DIR/anti-patterns.md" <<MD
# Agent $ID — Anti-Patterns (Taste)

Append-only. Things that got rejected, with the reason. Negative samples in next draft's prompt.

## Format
\`\`\`
### YYYY-MM-DD · <topic>
- What: <one-line draft summary>
- Why rejected: <reviewer reason>
- Avoid: <rule for next time>
\`\`\`

## Entries
(none yet)
MD

cat > "$DIR/metrics.json" <<JSON
{
  "agent_id": "$ID",
  "rolling_30d": {
    "drafted": 0,
    "approved": 0,
    "rejected": 0,
    "published": 0
  },
  "last_updated": null
}
JSON

mkdir -p "$REPO_ROOT/reviews/$REVIEWER"
touch "$REPO_ROOT/reviews/$REVIEWER/.gitkeep"

echo
echo "Agent $ID scaffolded at $DIR"
echo "Next: Builder ($BUILDER) fills SKILL.md, Reviewer ($REVIEWER) fills reviewer.md"
