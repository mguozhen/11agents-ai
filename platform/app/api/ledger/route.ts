import { NextRequest, NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

const UNIT_COST_RMB = 10

function detectType(agentName: string): 'blog' | 'video' | 'reddit' | 'other' {
  const n = (agentName || '').toLowerCase()
  if (n.includes('video')) return 'video'
  if (n.includes('reddit')) return 'reddit'
  if (n.includes('blog') || n.includes('seo')) return 'blog'
  return 'other'
}

export async function GET(request: NextRequest) {
  if (!hasMultica()) return NextResponse.json({ error: 'multica not configured' }, { status: 503 })
  if (!hasDB()) return NextResponse.json({ error: 'GTM_DATABASE required' }, { status: 503 })

  const p = request.nextUrl.searchParams
  const page = Number(p.get('page') || '1')
  const project = p.get('project') || ''
  if (!project) return NextResponse.json({ error: 'project required' }, { status: 400 })

  const gtmWs = await store.getWorkspace(project)
  if (!gtmWs?.multica_workspace_slug) return NextResponse.json({ error: 'no multica workspace bound to this project' }, { status: 400 })
  const multicaSlug = gtmWs.multica_workspace_slug

  const pageSize = 20

  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: process.env.MULTICA_DATABASE_URL })

  try {
    const { getWorkspaceBySlug } = await import('@/server/multica-db.js')
    const ws = await getWorkspaceBySlug(multicaSlug)
    if (!ws) return NextResponse.json({ error: 'multica workspace not found' }, { status: 404 })

    // Counts per agent per status (child issues only)
    const { rows: countRows } = await pool.query(`
      SELECT a.name AS agent_name, i.status, COUNT(*) AS cnt
      FROM issue i
      LEFT JOIN agent a ON a.id = i.assignee_id
      WHERE i.workspace_id = $1 AND i.parent_issue_id IS NOT NULL
      GROUP BY a.name, i.status
    `, [ws.id])

    // Aggregate by content type
    const types = { blog: 0, video: 0, reddit: 0, other: 0 }
    for (const r of countRows) {
      if (r.status === 'done') {
        const t = detectType(r.agent_name || '')
        types[t] += Number(r.cnt)
      }
    }

    const costEstimate = {
      blog:   { count: types.blog,   unit: UNIT_COST_RMB, total: types.blog   * UNIT_COST_RMB },
      video:  { count: types.video,  unit: UNIT_COST_RMB, total: types.video  * UNIT_COST_RMB },
      reddit: { count: types.reddit, unit: UNIT_COST_RMB, total: types.reddit * UNIT_COST_RMB },
      other:  { count: types.other,  unit: UNIT_COST_RMB, total: types.other  * UNIT_COST_RMB },
      grand_total: (types.blog + types.video + types.reddit + types.other) * UNIT_COST_RMB,
    }

    // Recent issues with pagination
    const { rows: issueRows } = await pool.query(`
      SELECT i.id, i.title, i.status, i.created_at, i.updated_at, a.name AS agent_name
      FROM issue i
      LEFT JOIN agent a ON a.id = i.assignee_id
      WHERE i.workspace_id = $1 AND i.parent_issue_id IS NOT NULL
      ORDER BY i.updated_at DESC
      LIMIT $2 OFFSET $3
    `, [ws.id, pageSize, (page - 1) * pageSize])

    const { rows: totalRow } = await pool.query(`
      SELECT COUNT(*) AS total FROM issue
      WHERE workspace_id = $1 AND parent_issue_id IS NOT NULL
    `, [ws.id])

    return NextResponse.json({
      counts: types,
      cost_estimate: costEstimate,
      issues: issueRows,
      total_issues: Number(totalRow[0]?.total || 0),
      page,
      page_size: pageSize,
    })
  } finally {
    await pool.end()
  }
}
