#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "pyyaml>=6",
#   "python-frontmatter>=1.1",
# ]
# ///
"""
Pipeline Runner for the GTM Agent Swarm content engine.

Loads an agent's config, assembles the engine skill graph as context,
calls `claude --print` with a topic, parses platform-native posts out
of the response, writes drafts into agents/<id>/content-bank/draft/,
and symlinks them into reviews/<reviewer>/ for the Reviewer queue.

Usage:
  scripts/run-agent.py <agent-id> --topic "..."
  scripts/run-agent.py <agent-id> --project voc-ai --topic "..."
  scripts/run-agent.py 06-reddit --topic "the #1 complaint in wireless earbuds" --dry-run

Default project = voc-ai. Pass --project to switch.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import frontmatter  # python-frontmatter
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent

ENGINE_READING_ORDER = [
    "CLAUDE.md",
    "index.md",
    "voice/brand-voice.md",
    "voice/platform-tone.md",
    "engine/hooks.md",
    "engine/repurpose.md",
    "engine/scheduling.md",
    "engine/content-types.md",
    "engine/topic-sourcing.md",
    "engine/qa-checklist.md",
    "audience/builders.md",
    "audience/casual.md",
]

POST_SEPARATOR = "---POST---"


def parse_platforms(spec: str) -> list[str]:
    """Map agent.yaml `platform` string to lowercase platform slugs."""
    aliases = {
        "x": "x",
        "twitter": "x",
        "linkedin": "linkedin",
        "youtube": "youtube",
        "tiktok": "tiktok",
        "instagram": "instagram",
        "ins": "instagram",
        "threads": "threads",
        "facebook": "facebook",
        "fb": "facebook",
        "newsletter": "newsletter",
        "reddit": "reddit",
        "github": "github",
        "wechat": "wechat",
    }
    parts = re.split(r"\s*[·,/+]\s*", spec.lower())
    out = []
    for p in parts:
        slug = aliases.get(p.strip())
        if slug and slug not in out:
            out.append(slug)
    return out or ["reddit"]


def slugify(s: str) -> str:
    s = re.sub(r"[^\w\s-]", "", s.lower())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s[:50] or "topic"


def build_context(engine_dir: Path, platforms: list[str], agent_dir: Path) -> str:
    parts = []
    for rel in ENGINE_READING_ORDER:
        f = engine_dir / rel
        if f.exists():
            parts.append(f"### FILE: {rel}\n\n{f.read_text()}")
    for p in platforms:
        f = engine_dir / "platforms" / f"{p}.md"
        if f.exists():
            parts.append(f"### FILE: platforms/{p}.md\n\n{f.read_text()}")
    for mem in ("playbook.md", "anti-patterns.md"):
        f = agent_dir / mem
        if f.exists() and f.stat().st_size > 0:
            parts.append(f"### FILE: agents/{agent_dir.name}/{mem}\n\n{f.read_text()}")
    return "\n\n".join(parts)


def load_topic(args, agent_dir: Path) -> tuple[str, dict]:
    if args.topic:
        return args.topic, {}
    if args.source:
        src = Path(args.source)
        if not src.is_absolute():
            src = REPO_ROOT / src
        post = frontmatter.load(src)
        return post.metadata.get("topic", post.content.strip().split("\n")[0]), dict(post.metadata)
    # fallback: pick newest new-idea file
    new_idea = agent_dir / "content-bank" / "new-idea"
    candidates = sorted(new_idea.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
    candidates = [p for p in candidates if p.name != ".gitkeep"]
    if not candidates:
        sys.exit("No --topic, no --source, and no new-idea/*.md available.")
    post = frontmatter.load(candidates[0])
    return post.metadata.get("topic", post.content.strip().split("\n")[0]), dict(post.metadata)


def build_prompt(topic: str, platforms: list[str], agent_cfg: dict, source_meta: dict) -> str:
    now = datetime.now(timezone.utc).isoformat()
    suggested_hook = source_meta.get("suggested_hook", "(let runner choose)")
    audience = source_meta.get("target_audience", "builders")
    plats = ", ".join(platforms)

    return f"""Read the skill graph above as your complete operating context.

TOPIC: {topic}

PRODUCE one platform-native post for each platform: {plats}.

For each platform output ONE block formatted EXACTLY like this:

{POST_SEPARATOR}
---
agent: {agent_cfg['id']}
product: {agent_cfg['default_product']}
topic: {topic!r}
hook_type: <one of data-bomb | competitor-intel | contrarian | curiosity-gap | direct-challenge | result-first | speed-ease>
platform: <one of: {plats}>
repurpose_step: <1-8 per engine/repurpose.md chain order>
generated_at: {now}
reviewer: {agent_cfg['reviewer']}
target_audience: {audience}
status: draft
---
[POST BODY HERE]

Suggested hook category for this topic: {suggested_hook}.
Primary audience: {audience}.

CRITICAL RULES:
1. RETHINK per platform — do NOT reformat the same text across platforms. Same topic, different angle, hook, voice, format.
2. Use the hook formulas from engine/hooks.md.
3. Apply per-platform format rules from platforms/<platform>.md and voice/platform-tone.md.
4. Pass the QA checklist in engine/qa-checklist.md before output. If any HARD check fails, mark `status: rejected` in the frontmatter and put the reason on the first line of the body.

Output ONLY the {POST_SEPARATOR} blocks, no preamble, no trailing commentary.
"""


def call_claude(context: str, prompt: str, dry_run: bool) -> str:
    full_prompt = context + "\n\n" + prompt
    if dry_run:
        print("=== DRY RUN PROMPT (truncated to 2000 chars) ===\n")
        print(full_prompt[:2000])
        print(f"\n... [total prompt = {len(full_prompt)} chars]\n=== END DRY RUN ===")
        return ""
    cmd = ["claude", "--print", "--allow-dangerously-skip-permissions"]
    res = subprocess.run(cmd, input=full_prompt, text=True, capture_output=True, timeout=600)
    if res.returncode != 0:
        sys.exit(f"claude CLI failed (exit {res.returncode}):\n{res.stderr}")
    return res.stdout


def parse_posts(raw: str) -> list[frontmatter.Post]:
    blocks = [b.strip() for b in raw.split(POST_SEPARATOR) if b.strip()]
    posts = []
    for b in blocks:
        try:
            posts.append(frontmatter.loads(b))
        except Exception as e:
            print(f"⚠ skip malformed block: {e}\n--- block ---\n{b[:300]}\n---")
    return posts


def write_drafts(posts: list[frontmatter.Post], agent_dir: Path, reviewer: str, topic: str):
    draft_dir = agent_dir / "content-bank" / "draft"
    reject_dir = agent_dir / "content-bank" / "draft-rejected"
    draft_dir.mkdir(parents=True, exist_ok=True)
    reject_dir.mkdir(parents=True, exist_ok=True)
    reviews_dir = REPO_ROOT / "reviews" / reviewer
    reviews_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = slugify(topic)
    written = []
    for p in posts:
        platform = p.get("platform", "unknown")
        status = p.get("status", "draft")
        fname = f"{ts}-{slug}-{platform}.md"
        target_dir = reject_dir if status == "rejected" else draft_dir
        out = target_dir / fname
        out.write_text(frontmatter.dumps(p))
        written.append(out)
        if status != "rejected":
            link = reviews_dir / fname
            if link.is_symlink() or link.exists():
                link.unlink()
            link.symlink_to(out.resolve())
    return written


def update_metrics(agent_dir: Path, drafted: int):
    f = agent_dir / "metrics.json"
    data = json.loads(f.read_text()) if f.exists() else {
        "agent_id": agent_dir.name, "rolling_30d": {"drafted": 0, "approved": 0, "rejected": 0, "published": 0}
    }
    data.setdefault("rolling_30d", {"drafted": 0, "approved": 0, "rejected": 0, "published": 0})
    data["rolling_30d"]["drafted"] = data["rolling_30d"].get("drafted", 0) + drafted
    data["last_updated"] = datetime.now(timezone.utc).isoformat()
    f.write_text(json.dumps(data, indent=2))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("agent_id")
    ap.add_argument("--project", default="voc-ai", help="project slug (default: voc-ai)")
    ap.add_argument("--topic")
    ap.add_argument("--source", help="path to a new-idea/*.md file to use as topic source")
    ap.add_argument("--dry-run", action="store_true", help="print prompt, do not call claude")
    args = ap.parse_args()

    project_dir = REPO_ROOT / "projects" / args.project
    if not project_dir.exists():
        sys.exit(f"project not found: {project_dir} (check projects/_registry.json)")

    agent_dir = project_dir / "agents" / args.agent_id
    if not agent_dir.exists():
        sys.exit(f"agent dir not found: {agent_dir}")

    cfg = yaml.safe_load((agent_dir / "agent.yaml").read_text())
    builder = cfg.get("builder", "")
    reviewer = cfg.get("reviewer", "")
    status = cfg.get("status", "")

    if not builder or not reviewer:
        sys.exit(f"Iron Triangle incomplete: builder={builder!r} reviewer={reviewer!r}")
    if status == "blocked":
        sys.exit(f"agent {args.agent_id} is blocked: {cfg.get('blocked_reason', '?')}")

    engine_dir = project_dir / "engine"
    if not engine_dir.exists():
        sys.exit(f"engine not found: {engine_dir} (project {args.project} engine symlink missing)")

    product = args.project  # for prompt context

    platforms = parse_platforms(cfg.get("platform", "reddit"))

    topic, source_meta = load_topic(args, agent_dir)

    print(f"agent     {args.agent_id}")
    print(f"product   {product}")
    print(f"platforms {platforms}")
    print(f"reviewer  {reviewer}")
    print(f"topic     {topic}")

    context = build_context(engine_dir, platforms, agent_dir)
    prompt = build_prompt(topic, platforms, {"id": args.agent_id, "default_product": product, "reviewer": reviewer}, source_meta)
    raw = call_claude(context, prompt, args.dry_run)

    if args.dry_run:
        return

    posts = parse_posts(raw)
    if not posts:
        print("⚠ no posts parsed from claude output; full output:")
        print(raw[:4000])
        sys.exit(1)

    written = write_drafts(posts, agent_dir, reviewer, topic)
    update_metrics(agent_dir, len(written))

    print(f"\nwrote {len(written)} drafts:")
    for f in written:
        print(f"  {f.relative_to(REPO_ROOT)}")
    print(f"\nReviewer queue: reviews/{reviewer}/")
    print(f"List queue:     ./scripts/review-queue.sh {reviewer!r}")


if __name__ == "__main__":
    main()
