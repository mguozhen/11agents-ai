# engines/ — Content Skill Graphs (the brain)

Each product has its own skill graph following the Ronin pattern (17 files: `index.md`, `voice/*`, `engine/*`, `platforms/*`, `audience/*`). Runners read these as the AI agent's full context before producing a draft.

| Brand | Path | Status |
|---|---|---|
| VOC AI | `voc-ai/` → `~/solvea-content-engine` | ✅ live |
| Solvea | `solvea/` → `~/solvea-content-engine-original` | ✅ live |
| CNAPI | `cnapi/` | 🚫 stub — `cp -r voc-ai/* cnapi/` then rewrite identity to cnapi.io |
| Shulex 中国客服 | `shulex-cn/` | 🚫 stub — domestic CS line, Chinese-first voice |

When adding a new brand: copy `voc-ai/` as a template, then edit `index.md` identity + `voice/brand-voice.md` vocabulary. Everything else (platform rules, hook formulas, scheduling) is largely brand-agnostic.
