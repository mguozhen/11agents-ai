// scripts/db-migrate-data.js
// One-time migration: reads filesystem projects/ → inserts into PostgreSQL
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import matter from 'gray-matter'
import pg from 'pg'
const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

const PROJECTS_DIR = path.join(ROOT, 'projects')
const entries = readdirSync(PROJECTS_DIR)

for (const slug of entries) {
  if (slug.startsWith('_')) continue
  const projectDir = path.join(PROJECTS_DIR, slug)
  const yamlPath = path.join(projectDir, 'project.yaml')
  if (!existsSync(yamlPath)) continue

  const cfg = yaml.load(readFileSync(yamlPath, 'utf-8')) || {}
  const name = cfg.name || slug

  // Determine lifecycle_state from contentos state file
  let lifecycle_state = 'onboarding'
  const stateFile = path.join(projectDir, '.contentos-state.json')
  if (existsSync(stateFile)) {
    const st = JSON.parse(readFileSync(stateFile, 'utf-8'))
    if (st.current_step >= 4) lifecycle_state = 'active'
    else if (st.current_step > 0) lifecycle_state = 'strategy'
  }

  const ws = await pool.query(
    `INSERT INTO workspaces (slug, name, lifecycle_state, project_config)
     VALUES ($1,$2,$3,$4) ON CONFLICT (slug) DO UPDATE SET
       name=EXCLUDED.name, lifecycle_state=EXCLUDED.lifecycle_state,
       project_config=EXCLUDED.project_config
     RETURNING id`,
    [slug, name, lifecycle_state, JSON.stringify(cfg)]
  )
  const wsId = ws.rows[0].id
  console.log(`workspace: ${slug} (${wsId})`)

  // Migrate contentos state
  if (existsSync(stateFile)) {
    const st = JSON.parse(readFileSync(stateFile, 'utf-8'))
    await pool.query(
      `INSERT INTO contentos_states (workspace_id, current_step, steps, last_updated)
       VALUES ($1,$2,$3,now()) ON CONFLICT (workspace_id) DO UPDATE SET
         current_step=EXCLUDED.current_step, steps=EXCLUDED.steps, last_updated=now()`,
      [wsId, st.current_step || 0, JSON.stringify(st.steps || {})]
    )
  }

  // Migrate strategy docs
  const strategyDir = path.join(projectDir, 'strategy')
  if (existsSync(strategyDir)) {
    for (const f of readdirSync(strategyDir).filter(f => f.endsWith('.md'))) {
      const stepKey = f.replace('.md', '')
      const content = readFileSync(path.join(strategyDir, f), 'utf-8')
      await pool.query(
        `INSERT INTO strategy_docs (workspace_id, step_key, version, content)
         VALUES ($1,$2,1,$3)`,
        [wsId, stepKey, content]
      )
      console.log(`  strategy: ${stepKey}`)
    }
  }

  // Migrate agents
  const agentsDir = path.join(projectDir, 'agents')
  if (existsSync(agentsDir)) {
    for (const agId of readdirSync(agentsDir)) {
      const agDir = path.join(agentsDir, agId)
      const agYaml = path.join(agDir, 'agent.yaml')
      if (!existsSync(agYaml)) continue
      const agCfg = yaml.load(readFileSync(agYaml, 'utf-8')) || {}
      const channel = (agCfg.platform || agId).split(/[·, /]/)[0].toLowerCase().trim()

      const cpRow = await pool.query('SELECT id FROM channel_profiles WHERE channel = $1', [channel])
      const cpId = cpRow.rows[0]?.id || null

      let metricsJson = '{}'
      const metricsFile = path.join(agDir, 'metrics.json')
      if (existsSync(metricsFile)) metricsJson = readFileSync(metricsFile, 'utf-8')

      const agRow = await pool.query(
        `INSERT INTO agents (workspace_id, channel, channel_profile_id, config, metrics)
         VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING RETURNING id`,
        [wsId, channel, cpId, JSON.stringify(agCfg), metricsJson]
      )
      const agDbId = agRow.rows[0]?.id
      if (!agDbId) continue
      console.log(`  agent: ${agId} (channel: ${channel})`)

      // Migrate content items
      function walkContentBank(state, stateDir) {
        if (!existsSync(stateDir)) return
        for (const f of readdirSync(stateDir).filter(f => f.endsWith('.md') && f !== '.gitkeep')) {
          try {
            const parsed = matter(readFileSync(path.join(stateDir, f), 'utf-8'))
            pool.query(
              `INSERT INTO content_items (workspace_id, agent_id, state, frontmatter, body, mtime)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [wsId, agDbId, state, JSON.stringify(parsed.data), parsed.content,
               new Date(statSync(path.join(stateDir, f)).mtimeMs).toISOString()]
            )
          } catch (e) { console.warn(`  skip ${f}:`, e.message) }
        }
      }
      const bankDir = path.join(agDir, 'content-bank')
      walkContentBank('new-idea', path.join(bankDir, 'new-idea'))
      walkContentBank('draft', path.join(bankDir, 'draft'))
      walkContentBank('bank', path.join(bankDir, 'bank'))
      walkContentBank('published', path.join(bankDir, 'published'))
    }
  }
}

await pool.end()
console.log('Data migration complete.')
