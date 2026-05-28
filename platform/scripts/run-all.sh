#!/usr/bin/env bash
# Fire one draft per built+active agent across all projects.
# Topic chosen randomly from each agent.yaml's topics list.
# Designed for launchd / cron daily invocation.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p logs
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="logs/run-all-${TS}.log"

log() { echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "$LOG"; }

log "=== run-all start ==="

shopt -s nullglob
for project_dir in projects/*/; do
  slug=$(basename "$project_dir")
  [[ "$slug" == _* ]] && continue
  state_file="${project_dir}.contentos-state.json"
  [[ -f "$state_file" ]] || { log "skip $slug: not built"; continue; }
  built=$(python3 -c "import json,sys;d=json.load(open('$state_file'));s=d.get('steps',{}).get('04-content-strategy',{}).get('status','pending');print(s)" 2>/dev/null || echo "pending")
  if [[ "$built" != "done" ]]; then log "skip $slug: step 4 not done ($built)"; continue; fi

  log ">> project $slug"
  for agent_dir in "${project_dir}agents"/*/; do
    [[ -f "${agent_dir}agent.yaml" ]] || continue
    agent_id=$(basename "$agent_dir")
    activate=$(python3 -c "import yaml;y=yaml.safe_load(open('${agent_dir}agent.yaml'))or{};print(y.get('activate',True))" 2>/dev/null || echo "True")
    if [[ "$activate" != "True" ]]; then log "   skip $agent_id (deactivated)"; continue; fi
    topic=$(python3 -c "import yaml,random;y=yaml.safe_load(open('${agent_dir}agent.yaml'))or{};t=y.get('topics')or[];print(random.choice(t) if t else '')" 2>/dev/null)
    if [[ -z "$topic" ]]; then log "   skip $agent_id (no topics)"; continue; fi
    log "   fire $agent_id : $topic"
    if ./scripts/run-agent.py "$agent_id" --project "$slug" --topic "$topic" >> "$LOG" 2>&1; then
      log "   ✓ $agent_id done"
    else
      log "   ✗ $agent_id failed (see $LOG)"
    fi
  done
done

log "=== run-all done ==="
echo "Log: $LOG"
