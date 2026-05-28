// Build a daily digest summarising what's fresh in the Ideas Pool.
// Reads the same filesystem state that gtm-idea CLI consumes.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { PROJECTS_DIR } from './paths.js'

function eachIdeaFile(slug) {
  const agentsDir = path.join(PROJECTS_DIR, slug, 'agents')
  if (!existsSync(agentsDir)) return []
  const out = []
  for (const aid of readdirSync(agentsDir).sort()) {
    const dir = path.join(agentsDir, aid, 'content-bank', 'new-idea')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md') || f === '.gitkeep') continue
      out.push({ agent: aid, file: path.join(dir, f), name: f })
    }
  }
  return out
}

export function buildDailyDigest({ sinceHours = 24, publicUrl = '' } = {}) {
  const since = Date.now() - sinceHours * 3600 * 1000
  if (!existsSync(PROJECTS_DIR)) return { projects: [], totalFresh: 0, ts: new Date().toISOString() }
  const slugs = readdirSync(PROJECTS_DIR).filter(p => !p.startsWith('_') && !p.startsWith('.'))
  const projects = []
  let totalFresh = 0
  for (const slug of slugs) {
    const files = eachIdeaFile(slug)
    const freshByAgent = {}
    for (const f of files) {
      let mtime = 0
      try { mtime = statSync(f.file).mtimeMs } catch {}
      if (mtime < since) continue
      let topic = ''
      try { topic = matter(readFileSync(f.file, 'utf-8')).data.topic || '' } catch {}
      if (!freshByAgent[f.agent]) freshByAgent[f.agent] = []
      freshByAgent[f.agent].push({ topic, name: f.name })
    }
    const fresh = Object.values(freshByAgent).flat().length
    if (!fresh) continue
    totalFresh += fresh
    projects.push({ slug, freshByAgent, fresh })
  }
  return { projects, totalFresh, ts: new Date().toISOString(), publicUrl }
}

export function formatDigestMarkdown(digest) {
  const date = digest.ts.slice(0, 10)
  const lines = [`# GTM Swarm Daily — ${date}`, '']
  if (!digest.totalFresh) {
    lines.push('_(no fresh ideas in the past 24h — cron may not have run yet)_')
    return lines.join('\n')
  }
  lines.push(`**${digest.totalFresh}** fresh ideas across **${digest.projects.length}** project(s).`)
  lines.push('')
  for (const p of digest.projects) {
    lines.push(`## ${p.slug} (+${p.fresh})`)
    for (const [agent, items] of Object.entries(p.freshByAgent)) {
      lines.push(`- **${agent}** (${items.length}):`)
      for (const it of items.slice(0, 2)) {
        const t = (it.topic || '(no topic)').slice(0, 100)
        lines.push(`  - ${t}`)
      }
      if (items.length > 2) lines.push(`  - _… +${items.length - 2} more_`)
    }
    lines.push('')
  }
  if (digest.publicUrl) {
    lines.push(`---`)
    const ledgerLinks = digest.projects
      .map(p => `[${p.slug} ledger](${digest.publicUrl}/dashboard/${p.slug})`)
      .join('  ·  ')
    lines.push(`📒 Ledger: ${ledgerLinks}`)
    lines.push(`💡 Ideas Pool: [open](${digest.publicUrl}/dashboard)  ·  CLI: \`gtm-idea pop --project <slug>\``)
  }
  return lines.join('\n')
}
