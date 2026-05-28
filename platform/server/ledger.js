// Swarm Ledger — per-agent activity snapshot for a project.
// Reads filesystem state (no DB), returns structured JSON for dashboard /
// digest consumers.
//
// Inspired by Tutti's "contributor ledger" pattern (per-creator/per-post
// attribution rather than aggregate counts) — makes a managed-service feel
// like a SaaS dashboard.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import matter from 'gray-matter'
import { PROJECTS_DIR } from './paths.js'

const STATES = ['new-idea', 'claimed', 'draft', 'bank', 'published', 'draft-rejected']

function scanState(dir, sinceMs) {
  if (!existsSync(dir)) return { total: 0, fresh: 0, recent: [] }
  const files = readdirSync(dir).filter(f => f.endsWith('.md') && f !== '.gitkeep')
  let fresh = 0
  const recent = []
  for (const f of files) {
    const fp = path.join(dir, f)
    let mtime = 0
    try { mtime = statSync(fp).mtimeMs } catch { continue }
    if (mtime >= sinceMs) {
      fresh++
      let topic = ''
      try { topic = matter(readFileSync(fp, 'utf-8')).data.topic || '' } catch {}
      recent.push({ name: f.replace(/\.md$/, ''), topic, mtime })
    }
  }
  recent.sort((a, b) => b.mtime - a.mtime)
  return { total: files.length, fresh, recent: recent.slice(0, 3) }
}

function readAntiPatternsSnippet(agentDir) {
  const f = path.join(agentDir, 'anti-patterns.md')
  if (!existsSync(f)) return ''
  try {
    const text = readFileSync(f, 'utf-8').trim()
    if (text.includes('(none yet)') || text.length < 30) return ''
    // Return last 240 chars (most recent reviewer feedback)
    return text.length > 240 ? text.slice(-240) : text
  } catch { return '' }
}

function readMetrics(agentDir) {
  const f = path.join(agentDir, 'metrics.json')
  if (!existsSync(f)) return null
  try { return JSON.parse(readFileSync(f, 'utf-8')) } catch { return null }
}

export function buildLedger(slug, { windowHours = 168 } = {}) {
  const projectDir = path.join(PROJECTS_DIR, slug)
  if (!existsSync(projectDir)) throw new Error(`project not found: ${slug}`)
  const sinceMs = Date.now() - windowHours * 3600 * 1000

  const agentsDir = path.join(projectDir, 'agents')
  const agentIds = existsSync(agentsDir)
    ? readdirSync(agentsDir).filter(a => existsSync(path.join(agentsDir, a, 'agent.yaml'))).sort()
    : []

  const agents = []
  let totals = { freshIdeas: 0, freshDrafts: 0, freshBank: 0, freshPublished: 0, pendingReview: 0 }

  for (const aid of agentIds) {
    const agentDir = path.join(agentsDir, aid)
    let cfg = {}
    try { cfg = yaml.load(readFileSync(path.join(agentDir, 'agent.yaml'), 'utf-8')) || {} } catch {}

    const byState = {}
    for (const s of STATES) {
      byState[s] = scanState(path.join(agentDir, 'content-bank', s), sinceMs)
    }

    // Build the row
    const row = {
      id: aid,
      name: cfg.name || aid,
      platform: cfg.platform || '',
      category: cfg.category || '',
      builder: cfg.builder || null,
      reviewer: cfg.reviewer || null,
      status: cfg.status || 'unknown',
      activate: cfg.activate !== false,
      goal: cfg.goal || '',
      kpi: cfg.kpi || null,
      ironTriangleOK: Boolean(cfg.builder && cfg.reviewer),
      window: {
        new_ideas: byState['new-idea'].fresh,
        claimed: byState['claimed'].fresh,
        drafts: byState['draft'].fresh,
        bank: byState['bank'].fresh,
        published: byState['published'].fresh,
        rejected: byState['draft-rejected'].fresh,
      },
      pending_review: byState['draft'].total,        // currently in draft/ = waiting reviewer
      total_published: byState['published'].total,
      total_bank: byState['bank'].total,
      recent_topics: byState['draft'].recent.concat(byState['bank'].recent).slice(0, 3).map(r => r.topic).filter(Boolean),
      anti_patterns_snippet: readAntiPatternsSnippet(agentDir),
      metrics: readMetrics(agentDir),
    }

    totals.freshIdeas += row.window.new_ideas
    totals.freshDrafts += row.window.drafts
    totals.freshBank += row.window.bank
    totals.freshPublished += row.window.published
    totals.pendingReview += row.pending_review

    agents.push(row)
  }

  return {
    project: slug,
    window_hours: windowHours,
    generated_at: new Date().toISOString(),
    totals,
    agents,
  }
}
