# Platform Tone — How VOC AI's Voice Adapts

Same analyst, different room. Our [[brand-voice]] DNA stays constant — data-driven, insightful, practical. But the energy shifts per platform.

## Tone Matrix

| Platform | Energy | Formality | Sentence Length | Emoji Use | "I" vs "We" |
|----------|--------|-----------|-----------------|-----------|--------------|
| X | punchy, data drops | very low | short (5-15 words) | zero | "i" lowercase |
| LinkedIn | thoughtful, strategic | medium | medium (10-25 words) | zero | "I" |
| YouTube | tutorial host, excited | medium-low | conversational | zero | "I" |
| Instagram | bold, visual data | low | short captions | minimal (1-2) | "We" |
| TikTok | raw, "look at this" | very low | spoken word pace | zero | "I" |
| Threads | casual analyst | very low | short | zero | "i" |
| Facebook | helpful group member | medium | medium | zero | "We" |
| Newsletter | insider data analyst | medium | longer (15-30 words) | zero | "I" |

## Platform Personality Descriptions

**X:** The Amazon seller at a mastermind dinner dropping data bombs. Speaks in sharp insights. Cites specific numbers casually. Makes you screenshot the tweet.

**LinkedIn:** The e-commerce strategist giving a talk at an industry conference. Connects data to business strategy. Tells stories about product launches informed by review data.

**YouTube:** The expert friend doing a screen-share showing you how they research products. Patient with walkthroughs but moves fast through fluff. "Let me show you what I found."

**Instagram:** The data designer who turns 10,000 reviews into one clean visual. Bold headlines. Clear takeaways. Every carousel slide is screenshot-worthy.

**TikTok:** The seller who just found something crazy in the data and had to share it. Screen recording energy. "You guys need to see this" vibes. Raw and unfiltered.

**Threads:** The late-night observation from someone who spends too much time in Amazon data. Stream of consciousness but backed by numbers.

**Facebook:** The experienced seller in an FBA group who helps newbies without being condescending. Shares findings, asks questions, builds reputation through value.

**Newsletter:** The analyst writing a weekly intelligence briefing for their inner circle. Goes deeper than social. Exclusive data cuts and behind-the-scenes methodology.

## Adaptation Examples

**Same insight, different tone:**

Core insight: "34% of 3-star reviews contain product opportunity signals"

- **X:** "3-star reviews are where the money hides. 34% contain a specific product improvement customers are literally asking for. your next product idea is in your competitor's mid-range reviews"
- **LinkedIn:** "We analyzed review patterns across 500 product categories. The finding that changed how I think about product research: 34% of 3-star reviews contain explicit feature requests. These aren't complaints — they're product briefs written by real customers."
- **YouTube:** "Everyone looks at 1-star and 5-star reviews. But I'm going to show you why 3-star reviews are actually the most valuable data source for product research. Let me show you what I mean."
- **Instagram:** Slide 1: "Stop Reading 5-Star Reviews" / Slide 2: "The Real Gold Is in 3-Star Reviews"
- **TikTok:** [screen recording scrolling through reviews] "Everyone's looking at 1-star reviews for problems. Wrong. Look at 3-star reviews. 34% of them literally tell you what product to build next."
- **Threads:** "kinda wild that the most valuable data for product research isn't in the 1-star or 5-star reviews. it's in the 3-stars. the 'it's fine but...' reviews are literally product briefs"
- **Facebook:** "Question for sellers here — how much time do you spend reading 3-star reviews vs 1-star? We found that 34% of 3-star reviews contain specific product improvement ideas. Curious if anyone's used mid-range reviews for product development?"
- **Newsletter:** "This week I want to show you a data pattern that's hiding in plain sight. When we segmented 2 billion reviews by star rating, the 3-star bucket revealed something fascinating..."

## MCP CTA Rule (PRINCIPLES.md §06 — added 2026-05-18)

**Every content piece must include an agent-readable CTA in addition to its human-readable one.** Non-negotiable for v3 content — it's how we turn the swarm's content engine into a distribution engine for capability discovery.

### When the product has a public MCP server

If the project (`voc-ai` / `flatkey` / `solvea` / `101pay` / `smartcrawler` etc.) exposes an MCP server, every published piece on developer-leaning platforms (X / GitHub / LinkedIn / Blog / YouTube) MUST include the install command:

```
Install via MCP:
  claude mcp add <slug> --env <SLUG>_API_KEY=sk-... -- npx -y @<slug>/mcp@latest
```

Placement:
- **Blog**: footer + sticky mid-article CTA box
- **X / Threads**: in a reply to the main thread (algo penalty for external links in main body)
- **LinkedIn**: P.S. line at bottom or pinned first comment
- **YouTube**: first line of description + pinned comment
- **Reddit**: only if subreddit allows; otherwise top-level comment on own post

### When the product has NO MCP yet

Replace with: "**Agent-friendly API**: `<product>.com/api/agent-capabilities`" — surfaces capability manifest to Agent training data crawlers even pre-MCP.

### Verified live MCP servers as of 2026-05-18

| Product | MCP install command | Status |
|---|---|---|
| **flatkey** | `claude mcp add flatkey --env FLATKEY_API_KEY=sk-... -- npx -y @flatkey/mcp@latest` | ✅ Server live, npm pending publish |
| voc-ai | _TBD — needs capability layer_ | 🟡 |
| solvea | _TBD_ | 🔴 |
| 101pay | _TBD — docs gated_ | 🔴 |
| smartcrawler | `claude mcp add smartcrawler --url https://smartcrawler.io/.well-known/mcp.json` | ✅ Native (3rd-party exemplar) |

Reviewer auto-rejects content from `03-blog` / `07-social-media` / `06-reddit` / `02-kol-koc` / `05-video` missing the MCP CTA (or agent-capabilities fallback). Enforced via QA §0.4.

## References
- [[brand-voice]] for core DNA
- [[x]], [[linkedin]], [[youtube]] for platform-specific rules
- PRINCIPLES.md §06 + §07 (repo root)
- [[../engine/format-templates]] · [[../engine/qa-checklist]]
