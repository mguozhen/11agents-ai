#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyyaml>=6"]
# ///
"""
Hydrate 11 agent.yaml files for a project from the ContentOS Step 4
content-strategy.md AGENT-HYDRATION YAML block.

Usage:
  scripts/hydrate-agents.py --project voc-ai
  scripts/hydrate-agents.py --project voc-ai --dry-run
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
START_MARKER = "---AGENT-HYDRATION-START---"
END_MARKER = "---AGENT-HYDRATION-END---"

HYDRATE_FIELDS = ("activate", "goal", "kpi", "topics")


def extract_block(strategy_md: Path) -> dict:
    text = strategy_md.read_text()
    m = re.search(
        rf"{re.escape(START_MARKER)}\s*\n(.*?)\n{re.escape(END_MARKER)}",
        text, re.DOTALL,
    )
    if not m:
        sys.exit(f"AGENT-HYDRATION block not found in {strategy_md}. Re-run Step 4.")
    block = m.group(1).strip()
    block = re.sub(r"^```ya?ml\s*\n", "", block)
    block = re.sub(r"\n```\s*$", "", block)
    try:
        data = yaml.safe_load(block)
    except yaml.YAMLError as e:
        sys.exit(f"AGENT-HYDRATION block is not valid YAML:\n{e}\n--- block ---\n{block[:500]}")
    if not isinstance(data, dict) or "agents" not in data:
        sys.exit("AGENT-HYDRATION block must contain 'agents:' top-level key.")
    return data["agents"]


def merge_agent(existing: dict, new: dict) -> dict:
    merged = dict(existing)
    for f in HYDRATE_FIELDS:
        if f in new:
            merged[f] = new[f]
    merged["contentos_hydrated_at"] = datetime.now(timezone.utc).isoformat()
    if new.get("activate") is False:
        merged["status"] = "deactivated_by_contentos"
    elif merged.get("status") == "deactivated_by_contentos":
        merged["status"] = "active"
    return merged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    project_dir = REPO_ROOT / "projects" / args.project
    if not project_dir.exists():
        sys.exit(f"project not found: {project_dir}")

    strategy_md = project_dir / "strategy" / "04-content-strategy.md"
    if not strategy_md.exists():
        sys.exit(f"Step 4 output missing: {strategy_md}. Run --step 4 first.")

    hydration = extract_block(strategy_md)
    agents_dir = project_dir / "agents"
    if not agents_dir.exists():
        sys.exit(f"agents dir missing: {agents_dir}")

    updated, skipped = [], []
    for agent_id, new_fields in hydration.items():
        agent_yaml_path = agents_dir / agent_id / "agent.yaml"
        if not agent_yaml_path.exists():
            skipped.append((agent_id, "agent.yaml missing"))
            continue
        existing = yaml.safe_load(agent_yaml_path.read_text()) or {}
        merged = merge_agent(existing, new_fields)
        if args.dry_run:
            updated.append((agent_id, "would update"))
            continue
        agent_yaml_path.write_text(
            yaml.safe_dump(merged, allow_unicode=True, sort_keys=False, default_flow_style=False)
        )
        updated.append((agent_id, "hydrated"))

    project_yaml_path = project_dir / "project.yaml"
    if project_yaml_path.exists() and not args.dry_run:
        pj = yaml.safe_load(project_yaml_path.read_text())
        pj.setdefault("contentos_agent", {})
        pj["contentos_agent"]["state"] = "built"
        pj["contentos_agent"]["built_at"] = datetime.now(timezone.utc).isoformat()
        pj["contentos_agent"]["agents_hydrated"] = len(updated)
        project_yaml_path.write_text(
            yaml.safe_dump(pj, allow_unicode=True, sort_keys=False, default_flow_style=False)
        )

    print(f"Project: {args.project}")
    print(f"Hydration block: {len(hydration)} agents from strategy")
    print()
    for aid, status in updated:
        print(f"  ✓ {aid}  {status}")
    for aid, reason in skipped:
        print(f"  ⚠ {aid}  skipped: {reason}")
    print()
    if not args.dry_run:
        print(f"project.yaml.contentos_agent.state = built")
        print(f"All {len(updated)} agents ready to run via:")
        print(f"  ./scripts/run-agent.py <agent-id> --project {args.project} --topic '...'")


if __name__ == "__main__":
    main()
