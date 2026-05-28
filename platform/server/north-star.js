// North Star Dashboard — revenue-oriented KPIs (traffic/reg/payment/revenue)
// against monthly / weekly / daily targets, with per-person breakdown.
//
// Data model:
//   projects/<slug>/targets.yaml      Founder-edited target file
//   projects/<slug>/actuals.jsonl     Append-only log of daily actuals
//   projects/<slug>/agents/*/agent.yaml  for per-person attribution
//
// Periods are calendar-aligned (week = ISO Mon-Sun, month = calendar month).

import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { PROJECTS_DIR } from './paths.js'

const STAGES = ['traffic', 'registrations', 'payments', 'revenue_usd']

function loadTargets(projectDir) {
  const f = path.join(projectDir, 'targets.yaml')
  if (!existsSync(f)) return null
  return yaml.load(readFileSync(f, 'utf-8'))
}

function loadActualsJsonl(projectDir) {
  const f = path.join(projectDir, 'actuals.jsonl')
  if (!existsSync(f)) return []
  const out = []
  for (const line of readFileSync(f, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch {}
  }
  return out.sort((a, b) => (a.date > b.date ? 1 : -1))
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

function isoWeekStart(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const wd = x.getUTCDay() || 7    // Sunday=0 → 7
  x.setUTCDate(x.getUTCDate() - wd + 1)
  return x.toISOString().slice(0, 10)
}

function monthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function annualStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10)
}

function sumActuals(rows, fromDate) {
  const acc = { traffic: 0, registrations: 0, payments: 0, revenue_usd: 0, n_days: 0 }
  for (const r of rows) {
    if (r.date < fromDate) continue
    for (const s of STAGES) acc[s] += Number(r[s] || 0)
    acc.n_days++
  }
  return acc
}

function pct(actual, target) {
  if (!target || target <= 0) return null
  return Math.round((actual / target) * 1000) / 10  // one decimal
}

function gatherPeople(projectDir) {
  // Roll up active people from agent.yaml builder + reviewer fields.
  const out = {}     // name -> { agents:[{id,role,activate,goal}], builder_n, reviewer_n }
  const agentsDir = path.join(projectDir, 'agents')
  if (!existsSync(agentsDir)) return out
  for (const aid of readdirSync(agentsDir).sort()) {
    const yPath = path.join(agentsDir, aid, 'agent.yaml')
    if (!existsSync(yPath)) continue
    let cfg = {}
    try { cfg = yaml.load(readFileSync(yPath, 'utf-8')) || {} } catch { continue }
    for (const role of ['builder', 'reviewer']) {
      const name = cfg[role]
      if (!name) continue
      if (!out[name]) out[name] = { name, agents: [], builder_n: 0, reviewer_n: 0 }
      out[name].agents.push({ id: aid, role, activate: cfg.activate !== false, goal: cfg.goal || '' })
      out[name][`${role}_n`]++
    }
  }
  return out
}

export function buildNorthStar(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug)
  if (!existsSync(projectDir)) throw new Error(`project not found: ${slug}`)

  const tgt = loadTargets(projectDir)
  const actuals = loadActualsJsonl(projectDir)

  const today = todayUTC()
  const week = isoWeekStart()
  const month = monthStart()
  const year = annualStart()

  const periods = {
    daily:    { from: today, label: today },
    weekly:   { from: week,  label: `wk-of-${week}` },
    monthly:  { from: month, label: month.slice(0, 7) },
    annual:   { from: year,  label: year.slice(0, 4) },
  }

  const data = {}
  for (const [p, info] of Object.entries(periods)) {
    const sum = sumActuals(actuals, info.from)
    const targetForPeriod = tgt?.targets || {}
    const row = { period: p, label: info.label, from: info.from, days_logged: sum.n_days }
    for (const s of STAGES) {
      const a = sum[s]
      const t = targetForPeriod[s]?.[p === 'annual' ? 'annual' : p]
      row[s] = { actual: a, target: t || null, pct: pct(a, t) }
    }
    data[p] = row
  }

  return {
    project: slug,
    generated_at: new Date().toISOString(),
    has_targets: Boolean(tgt),
    targets_meta: tgt ? { data_source: tgt.data_source, last_target_review: tgt.last_target_review } : null,
    periods: data,
    stage_owners: tgt?.stage_owners || {},
    people: gatherPeople(projectDir),
    recent_actuals: actuals.slice(-14),
  }
}

export function appendActual(slug, entry) {
  const projectDir = path.join(PROJECTS_DIR, slug)
  if (!existsSync(projectDir)) throw new Error(`project not found: ${slug}`)
  if (!entry.date) entry.date = todayUTC()
  // sanity
  for (const s of STAGES) if (entry[s] !== undefined) entry[s] = Number(entry[s]) || 0
  entry.logged_at = new Date().toISOString()
  const f = path.join(projectDir, 'actuals.jsonl')
  mkdirSync(projectDir, { recursive: true })
  appendFileSync(f, JSON.stringify(entry) + '\n')
  return entry
}
