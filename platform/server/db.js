// server/db.js
import pg from 'pg'
const { Pool } = pg

let pool = null

export function hasDB() {
  return Boolean(process.env.GTM_DATABASE)
}

export function getPool() {
  if (!pool && hasDB()) {
    pool = new Pool({ connectionString: process.env.GTM_DATABASE, ssl: { rejectUnauthorized: false } })
  }
  return pool
}

export async function query(sql, params = []) {
  const p = getPool()
  if (!p) throw new Error('No GTM_DATABASE set')
  const { rows } = await p.query(sql, params)
  return rows
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params)
  return rows[0] || null
}
