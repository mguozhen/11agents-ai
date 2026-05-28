'use client'
import { useEffect, useState } from 'react'

export type ProjectMeta = {
  slug: string
  name: string
  url: string | null
  category: string
  tagline: string
  status: string
}

export type Registry = {
  default: string
  projects: Record<string, ProjectMeta>
}

export function useProjects() {
  const [registry, setRegistry] = useState<Registry | null>(null)
  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(d => setRegistry(d.registry))
  }, [])
  return registry
}
