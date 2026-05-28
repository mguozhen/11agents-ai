# Topic Sourcing — Where the Engine Gets Ideas

Every post starts with a topic. This file defines where topics come from, how they're prioritized, and who decides what enters the production pipeline. See [[repurpose]] for what happens after a topic is selected.

## The Four Sources

### 1. VOC Data Surface (Primary)

The 2 billion reviews indexed by VOC AI are the moat. They produce topics no other tool can.

- **Trend reports** — `voc.ai/reports/` weekly category roundups → 1-2 contrarian data points per report
- **ASIN deep-dives** — pick a viral product on Amazon Movers & Shakers, run it through VOC AI → "the #1 complaint in [product] is X"
- **Cross-category patterns** — "we found the same defect pattern across 14 categories" type insights
- **Reviewer activity** — high-value verified reviewers tagged in our index → "what 7-figure sellers actually read"

**Output cadence:** 2-3 topics/week. Highest signal source.

### 2. Community Pain Points

Where Amazon sellers already complain or ask. Listen, then answer with VOC data.

- **r/AmazonSeller**, **r/FulfillmentByAmazon**, **r/ecommerce**, **r/Entrepreneur** — hot weekly threads
- **Helium 10 / Jungle Scout / SellerSprite Slack & FB groups** — what they discuss but those tools can't answer
- **YouTube comments** on competitor channels (Just One Dime, Travis Marziani, Project FBA)
- **Amazon Seller Forums** — official forums, low engagement but high-intent

**Output cadence:** 3-5 topics/week. Listen-mode source. Lower effort to produce because question is pre-validated.

### 3. Competitor Content Gaps

Watch what Helium 10, Jungle Scout, SellerSprite publish. Find what they CAN'T say because they don't have review data.

- **Helium 10 blog** — keyword-first content. Counter with review-first angle on same topic
- **Jungle Scout** state-of-the-seller reports — extract one chart, run our data, post the contrarian counter
- **SellerSprite** — Chinese-market focus. Most US sellers don't speak Chinese. Translate + add VOC layer
- **YouTube tutorials** for the tools above — they always end at keywords. We start where they stop

**Output cadence:** 1-2 topics/week. Differentiation source.

### 4. Internal Product / Customer Signals

What our own users say + what we ship.

- **Sales calls** — top 3 objections this week → blog post each
- **Support tickets** — top 3 confusion points → tutorial content
- **Product changelog** — new feature → demo video + walkthrough
- **Customer wins** — case study every successful customer when they hit a number

**Output cadence:** 1-2 topics/week. Trust source.

## Selection SOP (Monday Topic Meeting)

Every Monday 9-9:30am, the Reviewer picks **5 topics** for the week from the pool. Selection rules:

1. **Niche check** — does this fit [[brand-voice]]? (Amazon seller pain, e-commerce data, review intelligence). If not → reject.
2. **Mix the four sources** — at minimum 1 from VOC Data Surface, 1 from Community, 1 from Competitor Gaps. Source 4 (internal) opportunistic.
3. **Avoid repetition** — check `agents/<id>/playbook.md` and `anti-patterns.md`. If the same topic was rejected before, don't run it again.
4. **Distribute across audiences** — at least 3 of 5 hit [[builders]], at most 2 hit [[casual]].
5. **Tag hook intent** — for each topic, predict which [[hooks]] category fits best. The runner uses this.

The 5 selected topics drop into `agents/*/content-bank/new-idea/` as markdown files with frontmatter:

```yaml
---
topic: "the #1 complaint in wireless earbuds isn't sound quality"
source: voc-data | community | competitor-gap | internal
suggested_hook: data-bomb | contrarian | curiosity-gap | ...
target_audience: builders | casual
created_by: <reviewer name>
created_at: 2026-05-12T09:15:00Z
---
```

## Rejected Topics

If a topic gets killed at this meeting, it goes into `agents/*/anti-patterns.md` with the reason. Don't re-evaluate the same topic for 30 days.

## Why This Matters

Without a topic-sourcing SOP, the engine reverts to "what feels interesting today" — which always defaults to whatever the latest content from competitors triggers. That's the slop death spiral. Source 1 is what makes VOC AI's content unique. Forfeit it and we're just another keyword-tool clone with an AI accent.

## References
- [[index]] — the skill graph entry point
- [[repurpose]] — what happens after a topic is selected
- [[hooks]] — the categories the suggested_hook field references
- [[scheduling]] — when each topic runs through which platform
- [[builders]] / [[casual]] — audience routing
