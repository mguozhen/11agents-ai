'use client'
import { useEffect, useState } from 'react'

export type Role = 'founder' | 'reviewer'

const KEY = 'gtm-swarm.role'

export function useRole(): [Role, (r: Role) => void] {
  const [role, setRole] = useState<Role>('founder')

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as Role | null
    if (stored) setRole(stored)
  }, [])

  useEffect(() => {
    localStorage.setItem(KEY, role)
  }, [role])

  return [role, setRole]
}
