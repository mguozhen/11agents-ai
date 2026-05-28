import path from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, statSync } from 'node:fs'
import yaml from 'js-yaml'
import matter from 'gray-matter'
import { complete } from './llm.js'
import { REPO_ROOT, PROJECTS_DIR, REVIEWS_DIR } from './paths.js'
import { hasDB } from './db.js'
import * as store from './store.js'
import { hasMultica, postComment, updateIssueStatus, getOrCreateGTMUser } from './multica-db.js'

const ENGINE_READING_ORDER = [
  'CLAUDE.md', 'index.md',
  'voice/brand-voice.md', 'voice/platform-tone.md',
  'engine/hooks.md', 'engine/repurpose.md', 'engine/scheduling.md',
  'engine/content-types.md', 'engine/topic-sourcing.md', 'engine/qa-checklist.md',
  'audience/builders.md', 'audience/casual.md',
]
const POST_SEPARATOR = '---POST---'

function parsePlatforms(spec) {
  const aliases = {
    x: 'x', twitter: 'x', linkedin: 'linkedin', youtube: 'youtube',
    tiktok: 'tiktok', instagram: 'instagram', ins: 'instagram',
    threads: 'threads', facebook: 'facebook', fb: 'facebook',
    newsletter: 'newsletter', reddit: 'reddit', github: 'github', wechat: 'wechat',
    blog: 'blog', website: 'blog',
  }
  const out = []
  for (const part of String(spec || '').toLowerCase().split(/\s*[·,/+]\s*/)) {
    const slug = aliases[part.trim()]
    if (slug && !out.includes(slug)) out.push(slug)
  }
  return out.length ? out : ['blog']
}

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'topic'
}

function findEngineDir(project) {
  // Try project-local engine first, then global engines dir
  const candidates = [
    path.join(PROJECTS_DIR, project, 'engine'),
    path.join(REPO_ROOT, 'engines', project),
  ]
  return candidates.find(d => existsSync(d)) || null
}

function buildContext(engineDir, platforms, agentDir) {
  const parts = []
  for (const rel of ENGINE_READING_ORDER) {
    const f = path.join(engineDir, rel)
    if (existsSync(f)) parts.push(`### FILE: ${rel}\n\n${readFileSync(f, 'utf-8')}`)
  }
  for (const p of platforms) {
    const f = path.join(engineDir, 'platforms', `${p}.md`)
    if (existsSync(f)) parts.push(`### FILE: platforms/${p}.md\n\n${readFileSync(f, 'utf-8')}`)
  }
  if (agentDir) {
    for (const mem of ['playbook.md', 'anti-patterns.md']) {
      const f = path.join(agentDir, mem)
      if (existsSync(f) && statSync(f).size > 0) {
        parts.push(`### FILE: agents/${path.basename(agentDir)}/${mem}\n\n${readFileSync(f, 'utf-8')}`)
      }
    }
  }
  return parts.join('\n\n')
}

function buildPrompt(topic, platforms, agentCfg, sourceMeta) {
  const now = new Date().toISOString()
  const plats = platforms.join(', ')
  return `Read the skill graph above as your complete operating context.

TOPIC: ${topic}

PRODUCE one platform-native post for each platform: ${plats}.

For each platform output ONE block formatted EXACTLY like this:

${POST_SEPARATOR}
---
agent: ${agentCfg.id}
product: ${agentCfg.default_product}
topic: "${topic.replace(/"/g, '\\"')}"
hook_type: <one of data-bomb | competitor-intel | contrarian | curiosity-gap | direct-challenge | result-first | speed-ease>
platform: <one of: ${plats}>
repurpose_step: <1-8 per engine/repurpose.md chain order>
generated_at: ${now}
reviewer: ${agentCfg.reviewer || ''}
target_audience: ${sourceMeta?.target_audience || 'builders'}
status: draft
---
[POST BODY HERE]

CRITICAL RULES:
1. RETHINK per platform — do NOT reformat the same text across platforms.
2. Use hook formulas from engine/hooks.md.
3. Apply per-platform format from platforms/<platform>.md.
4. Pass engine/qa-checklist.md before output.

Output ONLY the ${POST_SEPARATOR} blocks, no preamble.`
}

function parsePosts(raw) {
  const blocks = raw.split(POST_SEPARATOR).map(s => s.trim()).filter(Boolean)
  const out = []
  for (const b of blocks) {
    try { out.push(matter(b)) } catch (e) { console.warn('skip block:', e?.message) }
  }
  return out
}

function bumpMetric(agentDir, field, delta = 1) {
  const f = path.join(agentDir, 'metrics.json')
  let data = existsSync(f) ? JSON.parse(readFileSync(f, 'utf-8')) : { agent_id: path.basename(agentDir) }
  data.rolling_30d = data.rolling_30d || { drafted: 0, approved: 0, rejected: 0, published: 0 }
  data.rolling_30d[field] = (data.rolling_30d[field] || 0) + delta
  data.last_updated = new Date().toISOString()
  writeFileSync(f, JSON.stringify(data, null, 2))
}

// agentConfig: optional inline config object (Multica mode).
// When provided, skips filesystem agent.yaml lookup and filesystem writes.
export async function runAgent(agentId, { project = 'voc-ai', topic, source = null, multica_issue_id = null, agentConfig = null } = {}) {
  const projectDir = path.join(PROJECTS_DIR, project)
  if (!existsSync(projectDir)) throw new Error(`project not found: ${project}`)

  let cfg
  let agentDir = null

  if (agentConfig) {
    // Multica mode: config supplied directly, no filesystem agent dir needed
    cfg = agentConfig
  } else {
    agentDir = path.join(projectDir, 'agents', agentId)
    if (!existsSync(agentDir)) throw new Error(`agent not found: ${agentId}`)
    cfg = yaml.load(readFileSync(path.join(agentDir, 'agent.yaml'), 'utf-8'))
    if (!cfg.builder || !cfg.reviewer) {
      throw new Error(`Iron Triangle incomplete: builder=${cfg.builder} reviewer=${cfg.reviewer}`)
    }
    if (cfg.status === 'blocked') throw new Error(`agent ${agentId} blocked: ${cfg.blocked_reason}`)
  }

  const engineDir = findEngineDir(project)
  if (!engineDir) throw new Error(`engine not found for project: ${project}`)

  const platforms = parsePlatforms(cfg.platform)
  const sourceMeta = source ? matter(readFileSync(source, 'utf-8')).data : {}
  const finalTopic = topic || sourceMeta.topic
  if (!finalTopic) throw new Error('no topic provided')

  const context = buildContext(engineDir, platforms, agentDir)
  const prompt = buildPrompt(finalTopic, platforms, {
    id: agentId, default_product: project, reviewer: cfg.reviewer || '',
  }, sourceMeta)

  const full = context + '\n\n' + prompt
  const { text } = await complete(full, { maxTokens: 16000 })

  const posts = parsePosts(text)
  if (!posts.length) return { drafted: 0, written: [], raw_preview: text.slice(0, 500) }

  const written = []

  if (agentConfig) {
    // Multica mode: write all output to GTM DB only
    if (hasDB()) {
      try {
        let ws = await store.getWorkspace(project)
        if (!ws) {
          ws = await store.createWorkspace({ slug: project, name: project })
        }
        for (const p of posts) {
          await store.createContentItem({
            workspace_id: ws.id,
            agent_id: null,
            state: 'draft',
            frontmatter: p.data,
            body: p.content,
          })
          written.push(`db:${p.data.platform || 'unknown'}`)
        }
      } catch (e) {
        console.warn('[runner] GTM DB write failed:', e.message)
        throw e
      }
    }
  } else {
    // Filesystem mode: write drafts to disk
    const draftDir = path.join(agentDir, 'content-bank', 'draft')
    const rejectDir = path.join(agentDir, 'content-bank', 'draft-rejected')
    mkdirSync(draftDir, { recursive: true })
    mkdirSync(rejectDir, { recursive: true })
    const reviewerDir = path.join(REVIEWS_DIR, cfg.reviewer)
    mkdirSync(reviewerDir, { recursive: true })

    const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '').replace('T', 'T') + 'Z'
    const tsClean = ts.replace('ZZ', 'Z')
    const slug = slugify(finalTopic)

    for (const p of posts) {
      const platform = p.data.platform || 'unknown'
      const status = p.data.status || 'draft'
      const fname = `${tsClean}-${slug}-${platform}.md`
      const targetDir = status === 'rejected' ? rejectDir : draftDir
      const out = path.join(targetDir, fname)
      writeFileSync(out, matter.stringify(p.content, p.data))
      written.push(path.relative(REPO_ROOT, out))

      if (hasDB()) {
        try {
          const ws = await store.getWorkspace(project)
          if (ws) {
            const agRows = await store.listAgentsForWorkspace(ws.id)
            const ag = agRows.find(a => a.channel === platform)
            await store.createContentItem({
              workspace_id: ws.id,
              agent_id: ag?.id || null,
              state: 'draft',
              frontmatter: p.data,
              body: p.content,
            })
          }
        } catch (e) {
          console.warn('[runner] DB write failed (non-fatal):', e.message)
        }
      }

      if (status !== 'rejected') {
        const link = path.join(reviewerDir, fname)
        try { unlinkSync(link) } catch {}
        try { symlinkSync(path.resolve(out), link) } catch (e) { console.warn('symlink failed:', e?.message) }
      }
    }
    bumpMetric(agentDir, 'drafted', written.length)
  }

  // Mirror draft to Multica issue if configured (additive, non-fatal)
  if (hasMultica() && multica_issue_id && posts.length) {
    try {
      const botId = await getOrCreateGTMUser()
      const firstPost = posts[0]
      const platform = firstPost.data?.platform || agentId
      const commentBody = `## Draft: ${platform}\n\n${firstPost.content.trim()}`
      await postComment(multica_issue_id, { body: commentBody, authorId: botId })
      console.log(`[runner] draft posted to Multica issue ${multica_issue_id}`)
      const { runAIReview } = await import('./ai-review.js')
      runAIReview({ issue_id: multica_issue_id, channel: agentId, workspace_slug: project })
        .then(r => console.log(`[runner] AI review: ${r.score}/100 ${r.recommendation}`))
        .catch(e => console.warn('[runner] AI review failed (non-fatal):', e.message))
    } catch (e) {
      console.warn('[runner] Multica comment failed (non-fatal):', e.message)
    }
  }

  return { drafted: written.length, written, reviewer: cfg.reviewer || '' }
}
