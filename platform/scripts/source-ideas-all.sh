#!/usr/bin/env bash
# Daily Ideas Pool refresh — walks all built projects + active agents,
# generates IDEAS_PER_AGENT (default 5) ideas per agent into new-idea/.
# Designed for launchd / cron daily invocation.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p logs
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="logs/source-ideas-${TS}.log"
N="${IDEAS_PER_AGENT:-5}"

log() { echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "$LOG"; }

log "=== source-ideas-all start (N=$N per agent) ==="

shopt -s nullglob
for project_dir in projects/*/; do
  slug=$(basename "$project_dir")
  [[ "$slug" == _* ]] && continue
  state_file="${project_dir}.contentos-state.json"
  [[ -f "$state_file" ]] || { log "skip $slug: no state file"; continue; }
  built=$(python3 -c "import json;d=json.load(open('$state_file'));print(d.get('steps',{}).get('04-content-strategy',{}).get('status','pending'))" 2>/dev/null || echo "pending")
  if [[ "$built" != "done" ]]; then log "skip $slug: not built"; continue; fi

  log ">> $slug"
  if ./scripts/source-ideas.py --project "$slug" -n "$N" >> "$LOG" 2>&1; then
    log "   ✓ $slug ideas refreshed"
  else
    log "   ✗ $slug failed (see $LOG)"
  fi
done

log "=== source-ideas-all done ==="
echo "Log: $LOG"
