// Fetches today's curated AI HOT signals (aihot.virxact.com) and formats
// them as a markdown digest. Used by source-ideas.js to inject "live AI
// industry context" into per-agent idea-generation prompts on projects
// that opt in via project.yaml: `aihot.enabled: true`.
//
// Filters are per-project: project.yaml can specify
//   aihot:
//     enabled: true
//     categories: [ai-products, industry, tip]   # default: all 5
//     since_hours: 48                              # default: 24
//     max_items: 15                                # default: 15
//
// No caching layer — API is 5-min server-cached + 600/min rate-limited,
// and we call once per project per ideas-pool run (≤daily). Lightweight.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const BASE = 'https://aihot.virxact.com'

const DEFAULT_CATS = ['ai-models', 'ai-products', 'industry', 'paper', 'tip']

export async function fetchAiHot({ sinceHours = 24, categories = DEFAULT_CATS, maxItems = 15 } = {}) {
  const sinceISO = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString()
  const url = `${BASE}/api/public/items?mode=selected&since=${encodeURIComponent(sinceISO)}&take=50`
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`aihot ${r.status}`)
  const j = await r.json()
  const items = (j.items || []).filter(it => categories.includes(it.category))
  return items.slice(0, maxItems)
}

export function formatAiHotForPrompt(items) {
  if (!items.length) return ''
  const lines = ['## TODAY\'S AI INDUSTRY SIGNALS (last 24h, from aihot.virxact.com)\n',
    'Use these as fresh angles. If an item connects to the agent\'s topic territory, lead with it. Cite source name (e.g., "OpenAI Blog") if you reference an item.',
    '']
  for (const it of items) {
    const date = (it.publishedAt || '').slice(0, 16).replace('T', ' ')
    lines.push(`- **[${it.category || '?'}] ${it.title}** — ${it.source || ''} (${date} UTC)`)
    if (it.summary) lines.push(`  ${it.summary.slice(0, 280)}`)
  }
  return lines.join('\n')
}

export async function aiHotMarkdownFor(projectYaml) {
  const cfg = projectYaml?.aihot
  if (!cfg?.enabled) return ''
  try {
    const items = await fetchAiHot({
      sinceHours: cfg.since_hours || 24,
      categories: cfg.categories || DEFAULT_CATS,
      maxItems: cfg.max_items || 15,
    })
    return formatAiHotForPrompt(items)
  } catch (e) {
    console.warn(`[aihot] fetch failed for ${projectYaml?.slug}: ${e.message}`)
    return ''
  }
}
