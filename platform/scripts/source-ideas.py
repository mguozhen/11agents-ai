#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "pyyaml>=6",
#   "python-frontmatter>=1.1",
# ]
# ///
"""
Daily idea generator for a project's GTM swarm.

Reads:
- projects/<slug>/project.yaml
- projects/<slug>/strategy/*.md (4 ContentOS briefs)
- projects/<slug>/engine/engine/hooks.md
- projects/<slug>/agents/<id>/agent.yaml (topics field)
- projects/<slug>/agents/<id>/content-bank/{published,bank}/*.md (recent winners)
- projects/<slug>/agents/<id>/anti-patterns.md (recent losers)

Asks Claude to produce N fresh ideas per active agent, each tagged with
suggested_hook + target_audience + freshness_days + rationale. Writes
each idea as a markdown file:
  projects/<slug>/agents/<id>/content-bank/new-idea/<ts>-<slug>.md

Usage:
  scripts/source-ideas.py --project voc-ai
  scripts/source-ideas.py --project voc-ai --agent 06-reddit
  scripts/source-ideas.py --project voc-ai -n 8
  scripts/source-ideas.py --project voc-ai --dry-run
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import frontmatter
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
IDEA_SEPARATOR = "---IDEA---"


def slugify(s: str, max_len: int = 40) -> str:
    s = re.sub(r"[^\w\s-]", "", s.lower())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s[:max_len] or "idea"


def load_recent_outputs(agent_dir: Path, limit: int = 5) -> str:
    parts = []
    for state in ("bank", "published"):
        d = agent_dir / "content-bank" / state
        if not d.exists():
            continue
        files = sorted([f for f in d.glob("*.md") if f.name != ".gitkeep"],
                       key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
        for f in files:
            try:
                fm = frontmatter.load(f)
                topic = fm.metadata.get("topic", "")
                if topic:
                    parts.append(f"  · ({state}) {topic}")
            except Exception:
                pass
    return "\n".join(parts) if parts else "  · (none yet)"


def load_anti_patterns(agent_dir: Path) -> str:
    f = agent_dir / "anti-patterns.md"
    if not f.exists():
        return ""
    text = f.read_text()
    if "(none yet)" in text:
        return ""
    return text[-2000:]


def build_prompt(project_yaml: dict, briefs: list[str], hooks_md: str,
                 agent_yaml: dict, recent: str, anti: str, n: int) -> str:
    name = project_yaml.get("name", "Project")
    agent_id = agent_yaml.get("id", "agent")
    platform = agent_yaml.get("platform", "")
    goal = agent_yaml.get("goal", "")
    topics = agent_yaml.get("topics", []) or []
    audience = project_yaml.get("audience", {})

    parts = [
        f"You are the {name} GTM idea-generation agent for {agent_id} ({platform}).",
        "",
        f"AGENT GOAL: {goal}",
        "",
        "PROJECT CONTEXT:",
        yaml.safe_dump({k: v for k, v in project_yaml.items() if k in
                        ("name", "url", "category", "tagline", "audience", "positioning")},
                       allow_unicode=True, sort_keys=False),
    ]
    if briefs:
        parts.append("\n## STRATEGY BRIEFS (Step 1-4 condensed)")
        for i, b in enumerate(briefs, 1):
            parts.append(f"\n### Brief {i} (first 2000 chars):\n{b[:2000]}")

    if hooks_md:
        parts.append(f"\n## HOOK FORMULAS (first 1500 chars):\n{hooks_md[:1500]}")

    if topics:
        parts.append("\n## AGENT TOPIC TERRITORIES (must align):")
        for t in topics:
            parts.append(f"  · {t}")

    parts.append("\n## RECENT OUTPUTS (avoid direct repetition):")
    parts.append(recent)

    if anti:
        parts.append("\n## ANTI-PATTERNS (do NOT generate these shapes):")
        parts.append(anti)

    audience_str = ""
    if isinstance(audience, dict):
        audience_str = f"primary={audience.get('primary','')}; secondary={audience.get('secondary','')}"

    parts.append(f"""
## YOUR TASK
Produce **{n} fresh content ideas** for {agent_id}. Each idea must:
- Match the agent's platform ({platform}) and the project's positioning
- Use one of the hook categories from the brief
- Address the audience: {audience_str}
- Be DIFFERENT from the recent outputs above (no near-duplicates)
- NOT match any anti-pattern

For EACH idea output exactly this block, separated by `{IDEA_SEPARATOR}`:

{IDEA_SEPARATOR}
---
project: {project_yaml.get("slug","")}
agent: {agent_id}
source: contentos-daily
topic: "<one-sentence concrete topic >"
suggested_hook: <data-bomb | competitor-intel | contrarian | curiosity-gap | direct-challenge | result-first | speed-ease>
target_audience: <builders | casual | mixed>
freshness_days: 7
created_at: {datetime.now(timezone.utc).isoformat()}
status: new-idea
---
**Rationale**: <1-2 sentences why this idea fits the agent + why now>

**Angle**: <1 sentence specific angle that makes this idea concrete>

**Hook seed (first line)**: <a draft of the opening hook line>

Output ONLY the {IDEA_SEPARATOR} blocks, exactly {n} of them. No preamble, no closing summary.
""")
    return "\n".join(parts)


def call_claude(prompt: str, dry_run: bool) -> str:
    if dry_run:
        print(f"=== DRY RUN PROMPT (truncated 1500 / total {len(prompt)} chars) ===\n{prompt[:1500]}\n=== END ===")
        return ""
    res = subprocess.run(
        ["claude", "--print", "--allow-dangerously-skip-permissions"],
        input=prompt, text=True, capture_output=True, timeout=600,
    )
    if res.returncode != 0:
        sys.exit(f"claude failed: {res.stderr}")
    return res.stdout


def parse_ideas(raw: str) -> list[frontmatter.Post]:
    blocks = [b.strip() for b in raw.split(IDEA_SEPARATOR) if b.strip()]
    out = []
    for b in blocks:
        try:
            out.append(frontmatter.loads(b))
        except Exception as e:
            print(f"⚠ malformed block (skipped): {e}", file=sys.stderr)
    return out


def write_idea(idea: frontmatter.Post, agent_dir: Path) -> Path:
    new_idea_dir = agent_dir / "content-bank" / "new-idea"
    new_idea_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    topic = idea.get("topic", "untitled")
    slug = slugify(topic, 40)
    f = new_idea_dir / f"{ts}-{slug}.md"
    f.write_text(frontmatter.dumps(idea))
    return f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--agent", help="single agent id (default: all active)")
    ap.add_argument("-n", type=int, default=5, help="ideas per agent")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    project_dir = REPO_ROOT / "projects" / args.project
    if not project_dir.exists():
        sys.exit(f"project not found: {project_dir}")
    project_yaml = yaml.safe_load((project_dir / "project.yaml").read_text())
    project_yaml.setdefault("slug", args.project)

    briefs = []
    for step in ("01-market-insight", "02-user-insight", "03-competitor-analysis", "04-content-strategy"):
        f = project_dir / "strategy" / f"{step}.md"
        if f.exists():
            briefs.append(f.read_text())

    hooks_path = project_dir / "engine" / "engine" / "hooks.md"
    hooks_md = hooks_path.read_text() if hooks_path.exists() else ""

    agents_dir = project_dir / "agents"
    if not agents_dir.exists():
        sys.exit(f"agents dir missing: {agents_dir}")
    agent_ids = [args.agent] if args.agent else sorted(
        d.name for d in agents_dir.iterdir() if (d / "agent.yaml").exists()
    )

    total_written = 0
    for agent_id in agent_ids:
        agent_dir = agents_dir / agent_id
        agent_yaml = yaml.safe_load((agent_dir / "agent.yaml").read_text())
        if agent_yaml.get("activate") is False:
            print(f"○ skip {agent_id}: deactivated")
            continue
        if not agent_yaml.get("topics"):
            print(f"○ skip {agent_id}: no topics (run ContentOS hydrate first)")
            continue

        print(f"⟳ {args.project}/{agent_id} — generating {args.n} ideas...")
        recent = load_recent_outputs(agent_dir)
        anti = load_anti_patterns(agent_dir)
        prompt = build_prompt(project_yaml, briefs, hooks_md, agent_yaml, recent, anti, args.n)
        raw = call_claude(prompt, args.dry_run)
        if args.dry_run:
            continue
        ideas = parse_ideas(raw)
        for idea in ideas:
            f = write_idea(idea, agent_dir)
            total_written += 1
            print(f"  ✓ {f.relative_to(REPO_ROOT)}")

    if not args.dry_run:
        print(f"\nDone. {total_written} ideas across {len(agent_ids)} agents.")


if __name__ == "__main__":
    main()
