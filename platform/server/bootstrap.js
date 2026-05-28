import path from 'node:path'
import { existsSync, mkdirSync, readdirSync, cpSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PROJECTS_DIR, REVIEWS_DIR, BOOTSTRAP_FROM, REPO_ROOT } from './paths.js'
import pg from 'pg'
const { Pool } = pg
import { hasMultica, getOrCreateGTMUser } from './multica-db.js'
import { hasDB } from './db.js'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// On first boot with GTM_DATA_DIR set (Railway volume), copy the committed
// projects/ baseline into the volume so the dashboard isn't empty.
// Subsequent boots see the existing volume and skip.
export function bootstrap() {
  if (PROJECTS_DIR === BOOTSTRAP_FROM) {
    console.log(`[bootstrap] no GTM_DATA_DIR → in-place projects/`)
    return
  }
  mkdirSync(path.dirname(PROJECTS_DIR), { recursive: true })
  if (!existsSync(PROJECTS_DIR) || readdirSync(PROJECTS_DIR).length === 0) {
    console.log(`[bootstrap] seeding ${PROJECTS_DIR} from ${BOOTSTRAP_FROM}`)
    cpSync(BOOTSTRAP_FROM, PROJECTS_DIR, { recursive: true })
  } else {
    console.log(`[bootstrap] ${PROJECTS_DIR} already populated`)
  }
  mkdirSync(REVIEWS_DIR, { recursive: true })
  console.log(`[bootstrap] PROJECTS_DIR = ${PROJECTS_DIR}`)
  console.log(`[bootstrap] REVIEWS_DIR  = ${REVIEWS_DIR}`)
}

export async function bootstrapDB() {
  if (!process.env.GTM_DATABASE) return
  const pool = new Pool({ connectionString: process.env.GTM_DATABASE, ssl: { rejectUnauthorized: false } })
  try {
    const migrationSql = readFileSync(path.join(ROOT, 'migrations/001-initial.sql'), 'utf-8')
    await pool.query(migrationSql)
    console.log('[bootstrap] DB migrations run')

    const cpDir = path.join(ROOT, 'channel_profiles')
    if (existsSync(cpDir)) {
      for (const f of readdirSync(cpDir).filter(f => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(path.join(cpDir, f), 'utf-8'))
        await pool.query(
          `INSERT INTO channel_profiles (channel, review_checklist, content_template, dashboard_widgets, kpi_defaults)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (channel) DO UPDATE SET
             review_checklist=EXCLUDED.review_checklist,
             content_template=EXCLUDED.content_template,
             dashboard_widgets=EXCLUDED.dashboard_widgets,
             kpi_defaults=EXCLUDED.kpi_defaults`,
          [data.channel, JSON.stringify(data.review_checklist), JSON.stringify(data.content_template),
           JSON.stringify(data.dashboard_widgets), JSON.stringify(data.kpi_defaults)]
        )
      }
      console.log('[bootstrap] channel profiles seeded')
    }
  } finally {
    await pool.end()
  }
}

export async function bootstrapMultica() {
  if (!hasMultica()) return
  // Only create the GTM bot user globally.
  // Workspace bindings are explicit (user picks in UI) — we do NOT auto-create
  // Multica workspaces from GTM projects, as that pollutes the real workspace list.
  await getOrCreateGTMUser()
  console.log('[bootstrapMultica] done')
}
