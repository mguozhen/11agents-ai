// scripts/db-migrate.js
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
const sql = readFileSync(path.join(__dirname, '../migrations/001-initial.sql'), 'utf-8')
await pool.query(sql)
await pool.end()
console.log('Migration complete.')
