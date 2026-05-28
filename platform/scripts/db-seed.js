// scripts/db-seed.js
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

// Seed channel profiles
const cpDir = path.join(ROOT, 'channel_profiles')
const cpFiles = readdirSync(cpDir).filter(f => f.endsWith('.json'))
for (const f of cpFiles) {
  const data = JSON.parse(readFileSync(path.join(cpDir, f), 'utf-8'))
  await pool.query(
    `INSERT INTO channel_profiles (channel, review_checklist, content_template, dashboard_widgets, kpi_defaults)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (channel) DO UPDATE SET
       review_checklist = EXCLUDED.review_checklist,
       content_template = EXCLUDED.content_template,
       dashboard_widgets = EXCLUDED.dashboard_widgets,
       kpi_defaults = EXCLUDED.kpi_defaults`,
    [data.channel, JSON.stringify(data.review_checklist), JSON.stringify(data.content_template),
     JSON.stringify(data.dashboard_widgets), JSON.stringify(data.kpi_defaults)]
  )
  console.log(`seeded channel_profile: ${data.channel}`)
}

// Seed base engine files (workspace_id = NULL)
const baseEngineDir = path.join(ROOT, 'engines', '_base')
if (existsSync(baseEngineDir)) {
  function walk(dir, rel = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(full, relPath)
      else if (entry.name.endsWith('.md')) {
        const content = readFileSync(full, 'utf-8')
        pool.query(
          `INSERT INTO engines (workspace_id, file_path, content) VALUES (NULL, $1, $2)
           ON CONFLICT (workspace_id, file_path) DO UPDATE SET content = EXCLUDED.content`,
          [relPath, content]
        ).then(() => console.log(`seeded engine base: ${relPath}`))
      }
    }
  }
  walk(baseEngineDir)
}

await pool.end()
console.log('Seed complete.')
