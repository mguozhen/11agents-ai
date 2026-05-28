'use client'
import { useCallback, useEffect, useState } from 'react'

export type ContentItem = {
  id: string
  project: string
  agent: string
  state: 'new-idea' | 'draft' | 'bank' | 'published'
  multica_status?: string
  file: string
  size: number
  mtime: number
  frontmatter: Record<string, unknown>
  preview: string
}

export type ContentApiResponse = {
  items: ContentItem[]
  counts: Record<'new-idea' | 'draft' | 'bank' | 'published', number>
  reviewers: Record<string, number>
  project: string | null
}

export function useContent(opts: { project?: string; state?: string; agent?: string }) {
  const [data, setData] = useState<ContentApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (opts.project) p.set('project', opts.project)
      if (opts.state) p.set('state', opts.state)
      if (opts.agent) p.set('agent', opts.agent)
      const r = await fetch(`/api/content?${p.toString()}`)
      if (!r.ok) throw new Error(`http ${r.status}`)
      setData(await r.json())
      setErr(null)
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }, [opts.project, opts.state, opts.agent])

  useEffect(() => { refresh() }, [refresh])

  return { data, loading, err, refresh }
}
