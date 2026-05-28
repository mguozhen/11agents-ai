'use client'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import './Header.css'

export function Header({ onRefresh }: { onRefresh?: () => void }) {
  const [refreshing, setRefreshing] = useState(false)
  return (
    <header className="dj-header">
      <div className="dj-brand">
        <div className="dj-logo" aria-hidden>
          <span className="dj-logo-dot" />
        </div>
        <h1 className="dj-wordmark">
          <span className="dj-wordmark-name">GTM Swarm</span>
          <span className="dj-wordmark-sub">· Founder Build Console</span>
        </h1>
      </div>
      <div className="dj-actions">
        <button
          className="dj-btn dj-btn-orange"
          type="button"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true)
            if (onRefresh) await onRefresh()
            setTimeout(() => setRefreshing(false), 600)
          }}
        >
          <RefreshCw size={14} className={refreshing ? 'dj-spin' : ''} />
          <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>
    </header>
  )
}
