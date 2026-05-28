'use client'
import { useEffect, useState } from 'react'

const KEY = 'gtm-swarm.writes_token'

export function useToken(): [string, (t: string) => void, () => void] {
  const [token, setTokenState] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(KEY) || ''
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  }, [token])
  const setToken = (t: string) => setTokenState(t.trim())
  const clear = () => setTokenState('')
  return [token, setToken, clear]
}

export function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function postJson<T = unknown>(url: string, body: unknown, token = ''): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  })
  return r.json()
}
