#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyyaml>=6"]
# ///
"""
Export GTM Swarm projects into a Paperclip-importable JSON bundle.

Usage:
  scripts/export-paperclip.py                     # all built projects
  scripts/export-paperclip.py --project voc-ai    # one project
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
PROJECTS = REPO_ROOT / "projects"


def project_state(slug: str) -> str:
    f = PROJECTS / slug / ".contentos-state.json"
    if not f.exists():
        return "not_started"
    d = json.loads(f.read_text())
    if d.get("steps", {}).get("04-content-strategy", {}).get("status") == "done":
        return "built"
    return f"step_{d.get('current_step', 0)}_done"


def load_project(slug: str) -> dict:
    pdir = PROJECTS / slug
    py = yaml.safe_load((pdir / "project.yaml").read_text()) or {}
    agents = []
    if (pdir / "agents").exists():
        for ay in sorted((pdir / "agents").glob("*/agent.yaml")):
            y = yaml.safe_load(ay.read_text()) or {}
            agents.append({
                "id": y.get("id", ay.parent.name),
                "name": y.get("name"),
                "role": y.get("category", "general"),
                "title": y.get("name"),
                "reports_to": y.get("builder"),
                "capabilities": [y.get("platform")],
                "metadata": {
                    "platform": y.get("platform"),
                    "builder": y.get("builder"),
                    "reviewer": y.get("reviewer"),
                    "goal": y.get("goal"),
                    "default_product": y.get("default_product"),
                    "kpi": y.get("kpi"),
                    "topics": y.get("topics"),
                    "status": y.get("status"),
                    "activate": y.get("activate", True),
                },
            })
    return {
        "slug": slug,
        "name": py.get("name"),
        "url": py.get("url"),
        "category": py.get("category"),
        "tagline": py.get("tagline"),
        "status": py.get("status"),
        "state": project_state(slug),
        "agents": agents,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project")
    ap.add_argument("--out", default=str(REPO_ROOT / "exports" / "paperclip-import.json"))
    args = ap.parse_args()

    slugs = [args.project] if args.project else [
        p.name for p in PROJECTS.iterdir()
        if p.is_dir() and not p.name.startswith("_") and project_state(p.name) == "built"
    ]
    if not slugs:
        raise SystemExit("No built projects to export.")

    bundle = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source": "gtm-swarm",
        "projects": [load_project(s) for s in slugs],
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, indent=2, ensure_ascii=False))
    total_agents = sum(len(p["agents"]) for p in bundle["projects"])
    print(f"Exported {len(slugs)} projects / {total_agents} agents to {out}")
    print(f"Slugs: {', '.join(slugs)}")


if __name__ == "__main__":
    main()
