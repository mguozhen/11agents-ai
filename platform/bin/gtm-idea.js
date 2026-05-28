#!/usr/bin/env node
// gtm-idea — CLI for other Hunter businesses to pull the freshest, highest-
// potential topic idea from the gtm-swarm Ideas Pool.
//
// Usage:
//   gtm-idea peek [opts]            preview top-N without claiming
//   gtm-idea pop  [opts]            return top-1 + move file to claimed/
//   gtm-idea list [opts]            browse pool (alias of peek --limit 20)
//   gtm-idea unclaim ID             move file back to new-idea/
//
// Common opts:
//   --project SLUG    (voc-ai | flatkey | btcmind | solvea | paircode)
//   --agent AID       (e.g. 03-blog, 06-reddit, 07-social-media)
//   --hook TYPE       (data-bomb | competitor-intel | contrarian | curiosity-gap
//                      | direct-challenge | result-first | speed-ease)
//   --audience X      (builders | casual | mixed)
//   --limit N         peek/list result count (default 5)
//   --md              output markdown instead of JSON
//   --since-h N       only ideas created within N hours (default 168 = 7d)

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync, renameSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = process.env.GTM_DATA_DIR || REPO_ROOT
const PROJECTS_DIR = path.join(DATA_DIR, 'projects')

function parseArgs(argv) {
  const a = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t.startsWith('--')) {
      const k = t.slice(2)
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
      a[k] = v
    } else a._.push(t)
  }
  return a
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { frontmatter: {}, body: text }
  const fm = {}
  const lines = m[1].split('\n')
  for (let i = 0; i < lines.length; i++) {
    const x = lines[i].match(/^([\w-]+):\s*(.*)$/)
    if (!x) continue
    let v = x[2].trim()
    // Multi-line block scalar (>- or |-) — pull subsequent indented lines
    if (v === '>-' || v === '>' || v === '|-' || v === '|') {
      const folded = v.startsWith('>')
      const parts = []
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        parts.push(lines[++i].trim())
      }
      v = folded ? parts.join(' ') : parts.join('\n')
    } else if (v.startsWith('"') && v.endsWith('"')) {
      v = v.slice(1, -1)
    }
    fm[x[1]] = v
  }
  return { frontmatter: fm, body: m[2] }
}

function* eachIdeaFile(opts) {
  if (!existsSync(PROJECTS_DIR)) return
  const projects = readdirSync(PROJECTS_DIR).filter(p => !p.startsWith('_') && !p.startsWith('.'))
  for (const p of projects) {
    if (opts.project && p !== opts.project) continue
    const agentsDir = path.join(PROJECTS_DIR, p, 'agents')
    if (!existsSync(agentsDir)) continue
    for (const aid of readdirSync(agentsDir)) {
      if (opts.agent && aid !== opts.agent) continue
      const dir = path.join(agentsDir, aid, 'content-bank', 'new-idea')
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.md') || f === '.gitkeep') continue
        const fp = path.join(dir, f)
        yield { project: p, agent: aid, file: fp, name: f }
      }
    }
  }
}

function scoreIdea(fm, now, sinceMs) {
  const ts = fm.created_at ? Date.parse(fm.created_at) : 0
  const ageH = (now - ts) / 3600_000
  if (ts && ageH > sinceMs / 3600_000) return null  // outside window
  // Recency score: linear decay over 7 days
  const recency = Math.max(0, 1 - ageH / 168)
  // Hook diversity bonus (favor non-default hooks slightly)
  const hookBonus = ['contrarian', 'data-bomb', 'competitor-intel'].includes(fm.suggested_hook) ? 0.1 : 0
  return Math.min(1, recency + hookBonus)
}

function loadIdeas(opts) {
  const now = Date.now()
  const sinceH = parseInt(opts['since-h'] || '168', 10)
  const sinceMs = sinceH * 3600_000
  const out = []
  for (const item of eachIdeaFile(opts)) {
    let text
    try { text = readFileSync(item.file, 'utf-8') } catch { continue }
    const { frontmatter, body } = parseFrontmatter(text)
    if (opts.hook && frontmatter.suggested_hook !== opts.hook) continue
    if (opts.audience && frontmatter.target_audience !== opts.audience) continue
    const score = scoreIdea(frontmatter, now, sinceMs)
    if (score === null) continue
    const id = item.name.replace(/\.md$/, '')
    out.push({
      id,
      project: item.project,
      agent: item.agent,
      topic: frontmatter.topic || '',
      hook: frontmatter.suggested_hook || null,
      audience: frontmatter.target_audience || null,
      created_at: frontmatter.created_at || null,
      file: path.relative(REPO_ROOT, item.file),
      _abs: item.file,
      score: Number(score.toFixed(3)),
      body: body.trim(),
    })
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

function formatIdeaJson(it, fullBody = true) {
  const o = { id: it.id, project: it.project, agent: it.agent, topic: it.topic, hook: it.hook, audience: it.audience, created_at: it.created_at, score: it.score, file: it.file }
  if (fullBody && it.body) o.body = it.body
  return o
}

function formatIdeaMd(it) {
  return [
    `# ${it.topic}`,
    `*${it.project} / ${it.agent} · hook: ${it.hook} · score: ${it.score}*`,
    '',
    it.body,
    '',
    `> claim id: ${it.id}`,
  ].join('\n')
}

function cmdPeek(opts) {
  const ideas = loadIdeas(opts)
  const limit = parseInt(opts.limit || '5', 10)
  const slice = ideas.slice(0, limit)
  if (opts.md) {
    for (const it of slice) { console.log(formatIdeaMd(it)); console.log('\n---\n') }
  } else {
    console.log(JSON.stringify(slice.map(it => formatIdeaJson(it, false)), null, 2))
  }
}

function cmdPop(opts) {
  const ideas = loadIdeas(opts)
  if (!ideas.length) {
    console.error('No matching ideas in pool.')
    process.exit(2)
  }
  const top = ideas[0]
  // Move file from new-idea/ to claimed/
  const dir = path.dirname(top._abs)
  const claimedDir = path.join(path.dirname(dir), 'claimed')
  mkdirSync(claimedDir, { recursive: true })
  const dest = path.join(claimedDir, path.basename(top._abs))
  renameSync(top._abs, dest)
  top.file = path.relative(REPO_ROOT, dest)
  if (opts.md) console.log(formatIdeaMd(top))
  else console.log(JSON.stringify(formatIdeaJson(top, true), null, 2))
}

function cmdUnclaim(opts, idArg) {
  if (!idArg) { console.error('usage: gtm-idea unclaim <id>'); process.exit(1) }
  // Find any claimed/<id>.md across projects
  for (const p of readdirSync(PROJECTS_DIR).filter(x => !x.startsWith('_') && !x.startsWith('.'))) {
    const agentsDir = path.join(PROJECTS_DIR, p, 'agents')
    if (!existsSync(agentsDir)) continue
    for (const aid of readdirSync(agentsDir)) {
      const claimed = path.join(agentsDir, aid, 'content-bank', 'claimed', `${idArg}.md`)
      if (existsSync(claimed)) {
        const dest = path.join(agentsDir, aid, 'content-bank', 'new-idea', `${idArg}.md`)
        renameSync(claimed, dest)
        console.log(`unclaim: ${path.relative(REPO_ROOT, claimed)} -> ${path.relative(REPO_ROOT, dest)}`)
        return
      }
    }
  }
  console.error(`claim id not found: ${idArg}`)
  process.exit(2)
}

function usage() {
  console.log(`gtm-idea — pull a fresh, high-potential topic idea from gtm-swarm

  gtm-idea peek [opts]        top-N preview (default 5, JSON)
  gtm-idea pop  [opts]        return top-1 + claim (move to claimed/)
  gtm-idea list [opts]        alias for peek --limit 20
  gtm-idea unclaim ID         restore claimed idea

Filters:
  --project SLUG       voc-ai | flatkey | btcmind | solvea | paircode
  --agent AID          03-blog | 06-reddit | 07-social-media | ...
  --hook TYPE          data-bomb | competitor-intel | contrarian | ...
  --audience X         builders | casual | mixed
  --since-h N          window in hours (default 168 = 7d)
  --limit N            peek/list size (default 5)
  --md                 markdown output instead of JSON

Examples:
  gtm-idea pop --project voc-ai --agent 06-reddit
  gtm-idea peek --hook contrarian --limit 3 --md
  gtm-idea list --project voc-ai
`)
}

const args = parseArgs(process.argv.slice(2))
const cmd = args._[0]
switch (cmd) {
  case 'peek': cmdPeek(args); break
  case 'list': args.limit = args.limit || 20; cmdPeek(args); break
  case 'pop': cmdPop(args); break
  case 'unclaim': cmdUnclaim(args, args._[1]); break
  case 'help': case '-h': case '--help': case undefined: usage(); break
  default: console.error(`unknown command: ${cmd}`); usage(); process.exit(1)
}
