// server/onboarding.js
import { complete } from './llm.js'

const analyses = new Map()

function newAnalysisId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export async function analyzeProduct({ website, github_kb }) {
  const id = newAnalysisId()
  analyses.set(id, { status: 'running', started_at: new Date().toISOString() })

  const prompt = `You are a GTM product analyst. Based on the following URL(s), infer the product's GTM metadata using your knowledge of the company/product if you know it, or make reasonable inferences from the domain name and any context.

Website URL: ${website}
${github_kb ? `GitHub Knowledge Base: ${github_kb}` : ''}

Return ONLY a valid JSON object (no markdown fences, no preamble):
{
  "name": "Product name",
  "slug": "kebab-case-slug-max-30-chars",
  "tagline": "One sharp sentence describing what the product does and for whom",
  "category": "B2B SaaS | B2C App | Dev Tools | AI Tool | E-commerce | etc",
  "url": "${website}",
  "audience": {
    "primary": "Specific primary user persona (role + context)",
    "secondary": "Secondary audience or use case"
  },
  "positioning": "1-2 sentences on what makes this product different",
  "competitors": ["top competitor 1", "competitor 2", "competitor 3"],
  "suggested_channels": ["reddit", "x", "blog", "kol-koc", "video", "landing"]
}

Be specific and concrete. Infer from domain/URL patterns if needed.`

  complete(prompt, { maxTokens: 2000 }).then(({ text }) => {
    try {
      const jsonStr = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
      const data = JSON.parse(jsonStr)
      analyses.set(id, { status: 'done', result: data, completed_at: new Date().toISOString() })
    } catch (e) {
      analyses.set(id, { status: 'error', error: e.message })
    }
  }).catch(e => {
    analyses.set(id, { status: 'error', error: e.message })
  })

  return id
}

export function getAnalysis(id) {
  return analyses.get(id) || null
}
