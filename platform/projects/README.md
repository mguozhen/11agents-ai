# projects/ — Multi-Product GTM Swarm

Each subfolder is one product instance of the GTM Swarm. The `_registry.json` is the source of truth for which products exist + their high-level metadata.

## Layout

```
projects/
├── _registry.json              # 5-product index (read by ContentOS Agent + dashboard switcher)
├── <slug>/
│   ├── project.yaml            # full project metadata (see templates/project.template.yaml)
│   ├── strategy/               # ContentOS Agent output
│   │   ├── 01-market-insight.md
│   │   ├── 02-user-insight.md
│   │   ├── 03-competitor-analysis.md
│   │   └── 04-content-strategy.md
│   ├── engine/                 # symlink → ~/solvea-content-engine{,-original} or local copy
│   ├── agents/01..11/          # the 11 GTM agents (hydrated from strategy)
│   ├── content-bank/           # cross-agent state (optional)
│   ├── reviews/                # per-reviewer queue (project-scoped)
│   └── .contentos-state.json   # wizard step tracker
```

## Status legend

- `live` — fully configured, ContentOS Agent has run, agents are deployable
- `stub` — placeholder only, ContentOS Agent not yet run, agents not hydrated
- `building` — ContentOS Agent in progress (state machine paused on a step)

## Adding a new project

```bash
./scripts/new-project.sh <slug>           # scaffolds projects/<slug>/ from template
./scripts/contentos-agent.py --project <slug> --step 1   # start discovery
```

Or via wizard at `http://127.0.0.1:8082/wizard/new`.
