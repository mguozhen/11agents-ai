// Builder daily log — per-agent, per-day standup entries written by the
// human builder (or their Claude Code instance) via CLI/API.
//
// Stored at projects/<slug>/agents/<aid>/builder-log.jsonl (append-only).
// Each entry can carry any subset of: value_point / product_update /
// target_update / note.

import { readFileSync, existsSync, appendFileSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PROJECTS_DIR } from './paths.js'

const FIELDS = ['value_point', 'product_update', 'target_update', 'note']

function jsonl(file) {
  if (!existsSync(file)) return []
  const out = []
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch {}
  }
  return out
}

function logPath(slug, aid) {
  return path.join(PROJECTS_DIR, slug, 'agents', aid, 'builder-log.jsonl')
}

export function appendBuilderLog(slug, aid, entry) {
  const projectDir = path.join(PROJECTS_DIR, slug)
  const agentDir = path.join(projectDir, 'agents', aid)
  if (!existsSync(agentDir)) throw new Error(`agent not found: ${slug}/${aid}`)
  const filtered = {}
  for (const k of FIELDS) {
    if (entry[k] !== undefined && entry[k] !== null && String(entry[k]).trim()) filtered[k] = String(entry[k]).trim()
  }
  if (Object.keys(filtered).length === 0) throw new Error(`at least one of: ${FIELDS.join(', ')}`)
  const row = {
    date: entry.date || new Date().toISOString().slice(0, 10),
    builder: entry.builder || null,
    ...filtered,
    logged_at: new Date().toISOString(),
  }
  mkdirSync(agentDir, { recursive: true })
  appendFileSync(logPath(slug, aid), JSON.stringify(row) + '\n')
  return row
}

export function readBuilderLog(slug, aid, { sinceHours = 24 * 30, limit = 50 } = {}) {
  const sinceMs = Date.now() - sinceHours * 3600 * 1000
  const since = new Date(sinceMs).toISOString().slice(0, 10)
  const rows = jsonl(logPath(slug, aid))
    .filter(r => r.date >= since)
    .sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1))
  return rows.slice(0, limit)
}

export function readAllBuilderLogs(slug, { sinceHours = 24 * 7, limitPerAgent = 5 } = {}) {
  const projectDir = path.join(PROJECTS_DIR, slug)
  const agentsDir = path.join(projectDir, 'agents')
  if (!existsSync(agentsDir)) return {}
  const result = {}
  for (const aid of readdirSync(agentsDir).sort()) {
    const rows = readBuilderLog(slug, aid, { sinceHours, limit: limitPerAgent })
    if (rows.length) result[aid] = rows
  }
  return result
}
