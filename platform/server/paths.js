import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(__dirname, '..')

// If GTM_DATA_DIR is set (Railway volume mount, e.g. /data), use it for
// projects/ + reviews/ so writes persist across container restarts.
// Otherwise fall back to repo-local paths (dev mode).
const DATA_DIR = process.env.GTM_DATA_DIR || REPO_ROOT

export const PROJECTS_DIR = path.join(DATA_DIR, 'projects')
export const REVIEWS_DIR = path.join(DATA_DIR, 'reviews')
export const TEMPLATES_DIR = path.join(REPO_ROOT, 'templates', 'contentos-agent')

export const BOOTSTRAP_FROM = path.join(REPO_ROOT, 'projects')

