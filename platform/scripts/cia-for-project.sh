#!/usr/bin/env bash
# Run CIA discovery for a gtm-swarm project, copy outputs to projects/<slug>/cia/.
# Requires: ~/.claude/skills/cia installed + CIA_HUB_URL + CIA_HUB_TOKEN in
# ~/.claude/settings.json env.
#
# Usage:
#   scripts/cia-for-project.sh <slug> "<topic>" [country]
#   scripts/cia-for-project.sh voc-ai "amazon review intelligence" us
#   scripts/cia-for-project.sh btcmind "btc perp risk co-pilot" us

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <project-slug> \"<topic>\" [country]" >&2
  exit 1
fi

SLUG="$1"
TOPIC="$2"
COUNTRY="${3:-us}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIA_BIN="$HOME/.claude/skills/cia/scripts/cia"
PROJECT_DIR="$REPO_ROOT/projects/$SLUG"
CIA_OUT="$PROJECT_DIR/cia"

if [[ ! -x "$CIA_BIN" ]]; then
  echo "CIA not installed. Run: git clone https://github.com/ericstory/CIA-insight.git ~/.claude/skills/cia && bash ~/.claude/skills/cia/install.sh" >&2
  exit 1
fi
if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "Project not found: $PROJECT_DIR" >&2
  exit 1
fi
if ! grep -q "CIA_HUB_TOKEN" ~/.claude/settings.json 2>/dev/null; then
  echo "⚠ CIA_HUB_TOKEN not in ~/.claude/settings.json env. CIA fetches will fail until you ask @andrew for one." >&2
fi

echo "→ CIA discovery for $SLUG / $TOPIC ($COUNTRY)"

"$CIA_BIN" init "$TOPIC" --country "$COUNTRY"

# 1. App Store SERP — populates appstore_serp; later fetches auto-pick from this
"$CIA_BIN" fetch-itunes-serp --topic "$TOPIC" --keywords "$TOPIC" --limit 20 || echo "  (itunes skipped/failed)"

# 2. Competitor metadata for top SERP apps (developer / install / category)
"$CIA_BIN" fetch-competitors-meta --topic "$TOPIC" --country "$COUNTRY" || echo "  (competitors-meta skipped/failed)"

# 3. App reviews → pain-point mining (auto-picks top-N from SERP)
"$CIA_BIN" fetch-app-reviews --topic "$TOPIC" --top 5 --depth 100 || echo "  (app-reviews skipped/failed)"

# 4. ASO keywords for top apps (reverse-engineer their keyword strategy)
"$CIA_BIN" fetch-aso-keywords --topic "$TOPIC" --top 5 --limit 50 || echo "  (aso-keywords skipped/failed)"

# 5. Ahrefs Google keyword vol/CPC (hub must have Ahrefs key — may 402 otherwise)
"$CIA_BIN" fetch-ahrefs-kw --topic "$TOPIC" --keywords "$TOPIC" --country "$COUNTRY" --limit 50 || echo "  (ahrefs-kw skipped/failed)"

# 6. Social signals
"$CIA_BIN" fetch-tiktok --topic "$TOPIC" --queries "$TOPIC" --max-items 30 || echo "  (tiktok skipped/failed)"
"$CIA_BIN" fetch-reddit --topic "$TOPIC" --queries "$TOPIC" --subreddits "Entrepreneur,smallbusiness,startups" --max-items 30 || echo "  (reddit skipped/failed)"
"$CIA_BIN" fetch-youtube --topic "$TOPIC" --queries "$TOPIC" --per-query 10 || echo "  (youtube skipped/failed)"

# 7. Cluster competitors (uses sklearn on assembled meta)
"$CIA_BIN" cluster-competitors --topic "$TOPIC" || echo "  (cluster skipped/failed)"

"$CIA_BIN" status --topic "$TOPIC" || true
"$CIA_BIN" export --topic "$TOPIC" || true

REPORTS_BASE="$HOME/workspace/analytics/reports"
TOPIC_SLUG=$(echo "$TOPIC" | tr '[:upper:]' '[:lower:]' | tr -c '[:alnum:]\n' '-' | tr -s '-' | sed 's/^-\|-$//g')
LATEST=$(ls -dt "$REPORTS_BASE"/*"$TOPIC_SLUG"* 2>/dev/null | head -1)

if [[ -z "$LATEST" || ! -d "$LATEST" ]]; then
  echo "⚠ Could not locate CIA output dir under $REPORTS_BASE" >&2
  exit 1
fi

mkdir -p "$CIA_OUT"
for f in synthesis.md report.md report.html data.xlsx cia.db; do
  if [[ -f "$LATEST/$f" ]]; then cp "$LATEST/$f" "$CIA_OUT/$f" && echo "  ✓ $f"; fi
done

echo ""
echo "✓ CIA data copied to $CIA_OUT"

# CIA CLI does not emit synthesis.md — generate it from data.xlsx so
# server/contentos.js readCiaData() has something to inject into prompts.
if [[ -f "$CIA_OUT/data.xlsx" ]]; then
  CIA_PY="$HOME/.claude/skills/cia/.venv/bin/python"
  if [[ -x "$CIA_PY" ]]; then
    "$CIA_PY" "$REPO_ROOT/scripts/cia-synthesize.py" "$CIA_OUT" || echo "  (synthesize step failed)"
  else
    echo "  ⚠ CIA venv python not found — skipping synthesis.md generation"
  fi
fi
echo "  Next: wizard Step 1+2 will auto-include this data in the LLM prompt."
