# GTM Agent Swarm — 6 Principles

Principles 01-05 verbatim from Solvea Founder Mix Party deck (`~/Downloads/Founder_Mix_Party_—_Solvea_(PDF_Style).pdf`), section "GTM Agent Swarm · Building Principles". **Principle 06 added 2026-05-18** as a foundational doctrine for the Agent-era pivot.

## 01 · Execution Model — Agents Execute. Humans Manage Agents.

The fundamental shift: humans no longer do the work — **humans manage the agents that do the work**. Every GTM function is owned by an Agent, every Agent is owned by a human.

## 02 · Builder's Mission — Builder = Stable · Good · Long-Running

Builder makes agents run stable, run well, and run long. Reviewer manages and empowers agents to deliver business results. Each role is distinct — **never conflate building with reviewing**.

## 03 · Org Structure — The Iron Triangle: Agent + Builder + Reviewer

The minimum viable unit of a GTM Agent Swarm. **No triangle = no agent.** Every deployed agent must have all three roles assigned. This rule is enforced by `scripts/new-agent.sh` — agents with empty `builder` or `reviewer` fields in `agent.yaml` cannot be deployed.

## 04 · North Star — What You Sell Doesn't Matter. Traffic + Revenue Is the Only Goal.

The GTM Agent Swarm's job is to **build GTM capability at scale** — not to be tied to any single product or channel. Traffic-driven and revenue-oriented. The swarm adapts to whatever you need to sell.

## 05 · Content Strategy — Content Is King. Build Content That Spreads & Delivers Value.

Thin AI content is everywhere — **the differentiator is depth.** Build content with real research data, benchmarks, interactive demos, and multi-format distribution (blog → video → social). Virality comes from genuine user value.

## 06 · Agents Are the New Distribution Channel — Build Capability, Not Interface.

**The principle.** External AI Agents are a new distribution channel on the order of the App Store / SEO / 公众号 / TikTok at their respective inflection points. Agents do not call your UI — they call your **capability**. A product with only a UI and no API gets bypassed. An API that is not agent-friendly loses to one that is.

**Why it holds.** End-user behavior is shifting from *"open the app"* to *"ask the agent to do it."* The agent makes the decision, places the call, completes the payment. It does not read your landing page, does not click your buttons, does not respect your funnel. It reads your **OpenAPI / MCP / tool schema**. Whoever becomes the agent's default capability source wins this wave of distribution.

**What it changes in our decisions.**

1. **Every core capability ships API-first, UI second.** A feature without an API is a feature that does not exist in the agent era.
2. **The API's design audience is the Agent, not the frontend engineer.** Descriptions self-explanatory, errors semantic, parameters minimal, side-effects predictable.
3. **Payment / billing / subscription must be agent-discoverable, agent-callable, agent-memorable.** One tool call. No browser handoff. Don't force the agent to fall back to "ask the human to click a link."
4. **The simplest upgrade we ship NEXT WEEK**: make every existing public API agent-friendly. OpenAPI spec complete, error codes semantic, auth not cookie-dependent, MCP wrapper published.

**Counter-example.** A great feature buried 3 menus deep inside a SaaS dashboard. No agent will ever reach it. In the agent era, **that feature does not exist**.

**What this means for the GTM Agent Swarm specifically.** Our 11 agents target a user that is increasingly **Agent > Human**. The downstream consumer of every output is no longer "a person scrolling Reddit" — it is "an agent deciding which capability to invoke on a user's behalf." So:

- Every agent must ship an **agent-readable output surface** (structured JSON, MCP tool, OpenAPI endpoint) **alongside** its human-readable surface.
- `voc.ai`, `solvea.cx`, `flatkey.ai` each need a public, agent-friendly capability layer — not just a marketing site.
- Distribution agents (`03-blog`, `06-reddit`, `07-social-media`) should produce content **and** the structured snippets / API endpoints / MCP descriptions that let an agent invoke us directly from that content.
- Conversion agents (`08-ads`, `09-edm`) target both human funnels AND agent-discovery surfaces (LLM training data, MCP registries, search-engine-of-agents indexes).
- "Iron Triangle" Reviewer's job grows: they now judge "is this output agent-callable too?" not only "is this output human-readable?"

## 07 · Strategy Output Format — Card-Draw HTML, Not Markdown Lists.

**The principle.** Every strategic plan, every market insight, every cross-product analysis is rendered as a single-file HTML "card draw" (4-7 cards, editorial design, one screen per card section) — *not* as a markdown bullet list. The HTML lives in `docs/<topic>.html` and is opened in browser at delivery time.

**Why it holds.** A 60-card markdown plan dies in three places: the reader skims line 1, the executor loses the through-line by line 30, and the cross-team consumer can't share it without copy-pasting into Notion. A card-draw HTML page survives all three: scan-friendly at the card level, link-shareable, image-screenshot-shareable. **Bandwidth of insight per minute of reading is 3-5x higher.**

**What counts as a "strategic plan / insight".**
- Any product GTM analysis (per-product, e.g. `agent-first-gtm-for-101pay.html`)
- Cross-product framework (e.g. `agent-first-gtm-playbook.html`, the 4-card master)
- Architecture decisions worth ≥ 1 day of work
- Persona insights / market research deliverables
- Before/after migration plans (e.g. `format-discipline-before-after.html`)

**What does NOT need this format.** Bug reports, daily standup logs, individual idea drafts, code review comments. The threshold is "would more than one person re-read this after delivery?"

**Template / canonical reference.** `docs/agent-first-gtm-playbook.html` (the 4-card master from 2026-05-18). Reuse its CSS palette: warm cream paper, serif display, mono accents, 2-column card grid. The `agent-gtm` skill auto-applies this template.

**Storage.** All HTML plan deliverables under `docs/` in the gtm-swarm repo. The plan file (`~/.claude/plans/...`) stays markdown for AI-readable execution lineage, but the human-facing artifact is always HTML.

---

## The Iron Triangle, in motion

```
Brief (Goal · Budget · KPI)
   ↓ brief
Builder (define · configure · iterate)
   ↓ ① create · equip
Agents (produce · invoke · run)
   ↓ ② submit
Reviewer (judge · edit · set standard)
   ↓ ③ approve
Output (Content · Ads · Outbound)

Memory + Taste (反馈沉淀 / feedback distilled)
   ↑ ④ feedback (from Reviewer)
   ↓ ⑤ recall · evolve (back to Builder)
```

Every agent must implement this 5-step loop and write each Reviewer feedback into `playbook.md` (Memory) and `anti-patterns.md` (Taste).

## Concrete rules

- **Builder writes** `agents/<n>/SKILL.md` and `agents/<n>/agent.yaml`.
- **Agent runs** `agents/<n>/runner.py|sh`, drops drafts into `agents/<n>/content-bank/draft/`.
- **Reviewer pulls queue** with `./scripts/review-queue.sh <name>`; approves move drafts to `bank/` then `published/`; rejects write to `agents/<n>/anti-patterns.md`.
- **Memory loop** — every Friday a reviewer scans the week's approvals and updates `agents/<n>/playbook.md` + the appropriate `engines/<brand>/engine/hooks.md`. This is Ronin's "weekly update hooks.md" rule and the deck's Memory + Taste flywheel — same thing.
- **Cross-product**: each draft carries a `product:` field (`solvea | voc-ai | cnapi | shulex-cn`). Runner reads `engines/<product>/` for that draft.
