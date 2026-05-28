# Next.js Full Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vite + Express dual-server setup with a single Next.js App Router application that serves both frontend (with HMR) and all 36 API endpoints.

**Architecture:** Next.js App Router at the repo root — pages in `app/`, shared React components in `_components/`, hooks in `_hooks/`, server-side helpers in `lib/`. All 36 API routes move to `app/api/` as Route Handlers that import directly from the existing `server/` utility modules. `server/index.js` and `server/api.js` are deleted; `server/` utility modules (multica-db.js, llm.js, runner.js, etc.) are kept unchanged.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, existing `server/` Node.js modules (pg, gray-matter, js-yaml, @anthropic-ai/sdk).

---

## File Map

### Created
| File | Purpose |
|------|---------|
| `package.json` | Replace current root package.json — adds next, react, react-dom |
| `next.config.ts` | Next.js config (serverExternalPackages) |
| `tsconfig.json` | TypeScript config for Next.js |
| `app/layout.tsx` | Root HTML layout, imports globals.css |
| `app/globals.css` | Merged global CSS (index.css + App.css) |
| `app/page.tsx` | `/` — was `dashboard/src/routes/Home.tsx` |
| `app/onboard/page.tsx` | `/onboard` — was `Onboard.tsx` |
| `app/pool/page.tsx` | `/pool` — was `Pool.tsx` |
| `app/dashboard/page.tsx` | `/dashboard` — was `App.tsx` without slug |
| `app/dashboard/[slug]/page.tsx` | `/dashboard/:slug` — was `App.tsx` |
| `app/wizard/[slug]/page.tsx` | `/wizard/:slug` — was `Wizard.tsx` |
| `app/api/projects/route.ts` | GET /api/projects |
| `app/api/agents/route.ts` | GET /api/agents |
| `app/api/content/route.ts` | GET /api/content |
| `app/api/file/route.ts` | GET /api/file |
| `app/api/project-meta/route.ts` | GET /api/project-meta |
| `app/api/health/route.ts` | GET /api/health |
| `app/api/promote-idea/route.ts` | POST /api/promote-idea |
| `app/api/reject-idea/route.ts` | POST /api/reject-idea |
| `app/api/create-idea/route.ts` | POST /api/create-idea |
| `app/api/source-ideas/route.ts` | POST /api/source-ideas |
| `app/api/review/route.ts` | POST /api/review |
| `app/api/contentos/[slug]/state/route.ts` | GET |
| `app/api/contentos/[slug]/strategy/route.ts` | GET |
| `app/api/contentos/[slug]/run-step/route.ts` | POST |
| `app/api/contentos/[slug]/save-edit/route.ts` | POST |
| `app/api/contentos/[slug]/build/route.ts` | POST |
| `app/api/workspaces/route.ts` | GET + POST /api/workspaces |
| `app/api/workspaces/[slug]/route.ts` | GET + PATCH /api/workspaces/:slug |
| `app/api/pool/route.ts` | GET + POST /api/pool |
| `app/api/pool/[id]/route.ts` | PATCH /api/pool/:id |
| `app/api/assignments/route.ts` | POST /api/assignments |
| `app/api/engines/[ws]/route.ts` | GET /api/engines/:ws |
| `app/api/engines/[ws]/file/[...path]/route.ts` | GET + PUT /api/engines/:ws/file/* |
| `app/api/drops/route.ts` | POST /api/drops |
| `app/api/drops/status/[issueId]/route.ts` | GET /api/drops/status/:issueId |
| `app/api/onboarding/analyze/route.ts` | POST /api/onboarding/analyze |
| `app/api/onboarding/analysis/[id]/route.ts` | GET /api/onboarding/analysis/:id |
| `app/api/ai-review/route.ts` | POST /api/ai-review |
| `app/api/cia/analyze/route.ts` | POST /api/cia/analyze |
| `app/api/cia/status/[slug]/route.ts` | GET /api/cia/status/:slug |
| `app/api/test/hello-world/route.ts` | POST /api/test/hello-world |
| `app/api/test/retry/[issueId]/route.ts` | POST /api/test/retry/:issueId |
| `lib/fs-api.ts` | Shared filesystem utilities (collect, countsFor, etc.) |
| `_components/` | All files from `dashboard/src/components/` + `'use client'` |
| `_hooks/` | All files from `dashboard/src/hooks/` + `'use client'` |

### Deleted
- `dashboard/` (entire directory)
- `server/index.js`
- `server/api.js`
- `server/bootstrap.js`

### Modified
- `package.json` (root) — replace scripts + deps
- `Dockerfile`
- `railway.json`

---

### Task 1: Bootstrap Next.js — package.json, config, layout

**Files:**
- Modify: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `app/layout.tsx`
- Create: `app/globals.css`

- [ ] **Step 1: Replace root package.json**

```json
{
  "name": "gtm-swarm",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 8082",
    "build": "next build",
    "start": "next start -p 8082"
  },
  "engines": { "node": ">=22" },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.1",
    "@uiw/react-md-editor": "^4.1.0",
    "gray-matter": "^4.0.3",
    "js-yaml": "^4.1.0",
    "next": "^15.3.2",
    "node-cron": "^3.0.3",
    "pg": "^8.13.3",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "~5.7.0"
  }
}
```

- [ ] **Step 2: Create next.config.ts**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'gray-matter', 'js-yaml', 'node-cron'],
}

export default nextConfig
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "dashboard"]
}
```

- [ ] **Step 4: Install dependencies**

```bash
cd /Users/boyuangao/skills/gtm-swarm && npm install
```

Expected: `node_modules/next/` appears. No errors.

- [ ] **Step 5: Create app/layout.tsx**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'GTM Swarm' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 6: Create app/globals.css**

Copy the contents of `dashboard/src/index.css` first, then append the contents of `dashboard/src/App.css`.

```bash
cat dashboard/src/index.css dashboard/src/App.css > app/globals.css
```

- [ ] **Step 7: Create minimal app/page.tsx to prove Next.js boots**

```tsx
export default function Home() {
  return <div>Loading...</div>
}
```

- [ ] **Step 8: Verify next dev starts**

```bash
npm run dev
```

Expected: `▲ Next.js 15.x.x` on `:8082`, no errors. Open `http://localhost:8082` — see "Loading...". Kill the server (Ctrl+C).

- [ ] **Step 9: Commit**

```bash
git add package.json next.config.ts tsconfig.json app/layout.tsx app/globals.css app/page.tsx
git commit -m "feat(nextjs): bootstrap Next.js App Router"
```

---

### Task 2: Migrate hooks and components

**Files:**
- Create: `_hooks/*.ts` (5 files)
- Create: `_components/*.tsx` + `_components/*.css` (22 files)

- [ ] **Step 1: Copy hooks**

```bash
cp -r dashboard/src/hooks/ _hooks/
```

- [ ] **Step 2: Add 'use client' to every hook**

Each hook uses `useState`/`useEffect`/`localStorage` — they must be client-only.

Add `'use client'` as the first line of each file:

```bash
for f in _hooks/*.ts; do
  echo "'use client'" | cat - "$f" > /tmp/hook_tmp && mv /tmp/hook_tmp "$f"
done
```

- [ ] **Step 3: Copy components and CSS**

```bash
cp -r dashboard/src/components/ _components/
```

- [ ] **Step 4: Add 'use client' to every component .tsx file**

```bash
for f in _components/*.tsx; do
  echo "'use client'" | cat - "$f" > /tmp/comp_tmp && mv /tmp/comp_tmp "$f"
done
```

- [ ] **Step 5: Commit**

```bash
git add _hooks/ _components/
git commit -m "feat(nextjs): migrate components and hooks"
```

---

### Task 3: Create lib/fs-api.ts — shared filesystem helpers

**Files:**
- Create: `lib/fs-api.ts`

These functions are duplicated between `vite.config.ts` and `server/api.js`. They read filesystem project/agent files. Centralising them here means both pages and API routes share one implementation.

- [ ] **Step 1: Create lib/fs-api.ts**

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

// Re-export REPO_ROOT etc. so API routes don't need to import server/paths.js directly
export { REPO_ROOT, PROJECTS_DIR, REVIEWS_DIR } from '../server/paths.js'

import { PROJECTS_DIR, REVIEWS_DIR } from '../server/paths.js'

export type State = 'new-idea' | 'draft' | 'bank' | 'published'

export type ContentItem = {
  id: string
  project: string
  agent: string
  state: State
  file: string
  size: number
  mtime: number
  frontmatter: Record<string, unknown>
  preview: string
}

export function listProjects(): string[] {
  if (!existsSync(PROJECTS_DIR)) return []
  return readdirSync(PROJECTS_DIR).filter(n => {
    if (n.startsWith('_') || n.startsWith('.')) return false
    const p = path.join(PROJECTS_DIR, n)
    return statSync(p).isDirectory() && existsSync(path.join(p, 'project.yaml'))
  }).sort()
}

export function listAgents(project: string): string[] {
  const dir = path.join(PROJECTS_DIR, project, 'agents')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(n => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() && existsSync(path.join(p, 'agent.yaml'))
  }).sort()
}

export function walkAgentState(project: string, agent: string, state: State): ContentItem[] {
  const dir = path.join(PROJECTS_DIR, project, 'agents', agent, 'content-bank', state)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep')
    .map(f => {
      const filePath = path.join(dir, f)
      const stat = statSync(filePath)
      const raw = readFileSync(filePath, 'utf-8')
      let data: Record<string, unknown> = {}
      let body = raw
      try { const parsed = matter(raw); data = parsed.data; body = parsed.content } catch {}
      return {
        id: f.replace(/\.md$/, ''),
        project, agent, state,
        file: path.relative(PROJECTS_DIR, filePath),
        size: stat.size,
        mtime: stat.mtimeMs,
        frontmatter: data,
        preview: body.trim().split('\n').slice(0, 6).join('\n').slice(0, 400),
      }
    })
}

export function collect(opts: { project?: string; state?: State; agent?: string }): ContentItem[] {
  const projects = opts.project ? [opts.project] : listProjects()
  const states: State[] = opts.state ? [opts.state] : ['new-idea', 'draft', 'bank', 'published']
  const out: ContentItem[] = []
  for (const p of projects) {
    const agents = opts.agent ? [opts.agent] : listAgents(p)
    for (const a of agents) for (const s of states) out.push(...walkAgentState(p, a, s))
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

export function countsFor(project?: string) {
  return {
    'new-idea': collect({ project, state: 'new-idea' }).length,
    'draft': collect({ project, state: 'draft' }).length,
    'bank': collect({ project, state: 'bank' }).length,
    'published': collect({ project, state: 'published' }).length,
  }
}

export function reviewerQueueCount(): Record<string, number> {
  if (!existsSync(REVIEWS_DIR)) return {}
  const out: Record<string, number> = {}
  for (const name of readdirSync(REVIEWS_DIR)) {
    const p = path.join(REVIEWS_DIR, name)
    if (!statSync(p).isDirectory()) continue
    out[name] = readdirSync(p).filter(f => f.endsWith('.md') && f !== '.gitkeep').length
  }
  return out
}

export function readRegistry() {
  const f = path.join(PROJECTS_DIR, '_registry.json')
  if (!existsSync(f)) return null
  try { return JSON.parse(readFileSync(f, 'utf-8')) } catch { return null }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/fs-api.ts
git commit -m "feat(nextjs): add shared filesystem API helpers"
```

---

### Task 4: Migrate pages

**Files:**
- Modify: `app/page.tsx`
- Create: `app/onboard/page.tsx`
- Create: `app/pool/page.tsx`
- Create: `app/dashboard/page.tsx`
- Create: `app/dashboard/[slug]/page.tsx`
- Create: `app/wizard/[slug]/page.tsx`

The React Router `<BrowserRouter>` wrapper is removed. Each page becomes a Next.js page file. `react-router-dom` imports are replaced:
- `import { Link } from 'react-router-dom'` → `import Link from 'next/link'`
- `import { useParams } from 'react-router-dom'` → `import { useParams } from 'next/navigation'`
- `import { useNavigate } from 'react-router-dom'` → `import { useRouter } from 'next/navigation'` then `router.push('/path')`
- `<Link to="/foo">` → `<Link href="/foo">`

- [ ] **Step 1: Replace app/page.tsx with Home page**

Copy `dashboard/src/routes/Home.tsx` content into `app/page.tsx`. Add `'use client'` at top. Replace imports:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import './Home.css'
```

Also copy `dashboard/src/routes/Home.css` → `app/Home.css`.

```bash
cp dashboard/src/routes/Home.css app/Home.css
```

Then replace the full content of `app/page.tsx` with the Home.tsx content (change `export default function Home` name stays the same), with these substitutions:
- `import { Link } from 'react-router-dom'` → `import Link from 'next/link'`
- `<Link to=` → `<Link href=`

- [ ] **Step 2: Create app/onboard/page.tsx**

```bash
mkdir -p app/onboard
```

Copy `dashboard/src/routes/Onboard.tsx` content, add `'use client'`, apply substitutions:
- `import { Link, useNavigate } from 'react-router-dom'` →
  ```ts
  import Link from 'next/link'
  import { useRouter } from 'next/navigation'
  ```
- `const navigate = useNavigate()` → `const router = useRouter()`
- `navigate('/dashboard')` → `router.push('/dashboard')`
- `<Link to=` → `<Link href=`

Also copy the Wizard CSS (Onboard shares it):
```bash
cp dashboard/src/routes/Wizard.css app/Wizard.css
```

- [ ] **Step 3: Create app/pool/page.tsx**

```bash
mkdir -p app/pool
```

Copy `dashboard/src/routes/Pool.tsx` content, add `'use client'`, apply substitutions:
- `import { Link } from 'react-router-dom'` → `import Link from 'next/link'`
- `<Link to=` → `<Link href=`

- [ ] **Step 4: Create app/wizard/[slug]/page.tsx**

```bash
mkdir -p app/wizard/\[slug\]
```

Copy `dashboard/src/routes/Wizard.tsx` content, add `'use client'`. Apply:
- `import { useParams, Link } from 'react-router-dom'` →
  ```ts
  import { useParams } from 'next/navigation'
  import Link from 'next/link'
  ```
- `const { slug } = useParams<{ slug: string }>()` → `const params = useParams(); const slug = params.slug as string`
- `<Link to=` → `<Link href=`

- [ ] **Step 5: Create app/dashboard/[slug]/page.tsx**

```bash
mkdir -p app/dashboard/\[slug\]
```

Copy `dashboard/src/App.tsx` content, add `'use client'`. Apply:
- `import { useParams, Link } from 'react-router-dom'` →
  ```ts
  import { useParams } from 'next/navigation'
  import Link from 'next/link'
  ```
- `const { slug: routeSlug } = useParams<{ slug?: string }>()` → `const params = useParams(); const routeSlug = params.slug as string | undefined`
- All component imports change path prefix: `from './components/X'` → `from '@/_components/X'`
- All hook imports: `from './hooks/X'` → `from '@/_hooks/X'`
- `<Link to=` → `<Link href=`

- [ ] **Step 6: Create app/dashboard/page.tsx**

```tsx
'use client'
import DashboardPage from '../[slug]/page'
export default DashboardPage
```

Wait — that won't work because the slug would be undefined. Instead, create it as a thin wrapper:

```tsx
'use client'
import App from '@/_components/../app/dashboard/[slug]/page'
```

Actually the cleaner approach: create `app/dashboard/page.tsx` as a copy of the slug page, where `routeSlug` will be `undefined` and the existing fallback logic in App.tsx (`const slug = routeSlug || defaultSlug`) handles it:

```tsx
'use client'
// Re-export the slug page — when no slug in URL, App.tsx falls back to defaultSlug
export { default } from './[slug]/page'
```

- [ ] **Step 7: Verify TypeScript in pages**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any import errors. Common fixes:
- If `useParams()` returns `ReadonlyURLSearchParams` type errors, cast: `params.slug as string`
- If CSS imports cause errors, they won't — Next.js handles them at build time

- [ ] **Step 8: Commit**

```bash
git add app/
git commit -m "feat(nextjs): migrate all pages from React Router to Next.js"
```

---

### Task 5: API Routes — filesystem reads

**Files:**
- Create: `app/api/projects/route.ts`
- Create: `app/api/agents/route.ts`
- Create: `app/api/content/route.ts`
- Create: `app/api/file/route.ts`
- Create: `app/api/project-meta/route.ts`
- Create: `app/api/health/route.ts`

- [ ] **Step 1: Create app/api/projects/route.ts**

```bash
mkdir -p app/api/projects
```

```ts
import { NextResponse } from 'next/server'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { listProjects, readRegistry, PROJECTS_DIR } from '@/lib/fs-api'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'
import { hasMultica } from '@/server/multica-db.js'

export async function GET() {
  if (hasMultica()) {
    const { listAllWorkspaces } = await import('@/server/multica-db.js')
    const workspaces = await listAllWorkspaces()
    const projects = Object.fromEntries(workspaces.map(w => [
      w.slug, { slug: w.slug, name: w.name, url: '', category: '', tagline: '', status: 'active' }
    ]))
    return NextResponse.json({ registry: { projects, default: workspaces[0]?.slug }, discovered: workspaces.map(w => w.slug) })
  }
  if (hasDB()) {
    const rows = await store.listWorkspaces()
    const projects = Object.fromEntries(rows.map((ws: { slug: string; name: string }) => [
      ws.slug, { slug: ws.slug, name: ws.name, url: '', category: '', tagline: '', status: 'active' }
    ]))
    return NextResponse.json({ registry: { projects, default: rows[0]?.slug }, discovered: rows.map((ws: { slug: string }) => ws.slug) })
  }
  return NextResponse.json({ registry: readRegistry(), discovered: listProjects() })
}
```

- [ ] **Step 2: Create app/api/agents/route.ts**

```bash
mkdir -p app/api/agents
```

```ts
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { PROJECTS_DIR } from '@/lib/fs-api'

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get('project') || ''
  const agentsDir = path.join(PROJECTS_DIR, project, 'agents')
  if (!project || !existsSync(agentsDir)) {
    return NextResponse.json({ error: 'project agents dir not found' }, { status: 404 })
  }
  const out = readdirSync(agentsDir)
    .filter(n => existsSync(path.join(agentsDir, n, 'agent.yaml')))
    .sort()
    .map(id => {
      const raw = readFileSync(path.join(agentsDir, id, 'agent.yaml'), 'utf-8')
      let yaml: Record<string, unknown> = {}
      try { yaml = (matter('---\n' + raw + '\n---\n').data) as Record<string, unknown> } catch {}
      const metricsPath = path.join(agentsDir, id, 'metrics.json')
      let metrics: Record<string, unknown> = {}
      if (existsSync(metricsPath)) {
        try { metrics = JSON.parse(readFileSync(metricsPath, 'utf-8')) } catch {}
      }
      return { id, yaml, metrics }
    })
  return NextResponse.json({ project, agents: out })
}
```

- [ ] **Step 3: Create app/api/content/route.ts**

```bash
mkdir -p app/api/content
```

```ts
import { NextRequest, NextResponse } from 'next/server'
import { collect, countsFor, reviewerQueueCount, type State } from '@/lib/fs-api'
import { hasMultica } from '@/server/multica-db.js'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const project = p.get('project') || undefined
  const state = (p.get('state') || undefined) as State | undefined
  const agent = p.get('agent') || undefined

  if (hasMultica()) {
    const { getIssuesAsContent } = await import('@/server/multica-db.js')
    const items = await getIssuesAsContent(project!, state)
    return NextResponse.json({
      items,
      counts: {
        'new-idea': items.filter((i: { state: string }) => i.state === 'new-idea').length,
        'draft': items.filter((i: { state: string }) => i.state === 'draft').length,
        'bank': items.filter((i: { state: string }) => i.state === 'bank').length,
        'published': items.filter((i: { state: string }) => i.state === 'published').length,
      },
      reviewers: reviewerQueueCount(),
      project: project || null,
    })
  }

  const items = collect({ project, state, agent })
  return NextResponse.json({
    items,
    counts: countsFor(project),
    reviewers: reviewerQueueCount(),
    project: project || null,
  })
}
```

- [ ] **Step 4: Create app/api/file/route.ts**

```bash
mkdir -p app/api/file
```

```ts
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { REPO_ROOT } from '@/lib/fs-api'

export async function GET(request: NextRequest) {
  const rel = request.nextUrl.searchParams.get('path') || ''
  const abs = path.resolve(REPO_ROOT, rel)
  if (!abs.startsWith(REPO_ROOT) || !existsSync(abs)) {
    return new NextResponse('not found', { status: 404 })
  }
  const raw = readFileSync(abs, 'utf-8')
  let data: Record<string, unknown> = {}; let body = raw
  try { const parsed = matter(raw); data = parsed.data; body = parsed.content } catch {}
  return NextResponse.json({ frontmatter: data, body, file: rel })
}
```

- [ ] **Step 5: Create app/api/project-meta/route.ts**

```bash
mkdir -p app/api/project-meta
```

```ts
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { PROJECTS_DIR, REPO_ROOT } from '@/lib/fs-api'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET(request: NextRequest) {
  const project = request.nextUrl.searchParams.get('project') || ''
  const projectDir = path.join(PROJECTS_DIR, project)
  if (!project || !existsSync(projectDir)) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }
  const projectYamlPath = path.join(projectDir, 'project.yaml')
  const stateFile = path.join(projectDir, '.contentos-state.json')
  const strategyDir = path.join(projectDir, 'strategy')
  let projectYaml: Record<string, unknown> = {}
  if (existsSync(projectYamlPath)) {
    try { projectYaml = (matter('---\n' + readFileSync(projectYamlPath, 'utf-8') + '\n---\n').data) as Record<string, unknown> } catch {}
  }

  let state = { current_step: 0, steps: {} }
  if (hasDB()) {
    try {
      const ws = await store.getWorkspace(project)
      if (ws) state = await store.getContentOSState(ws.id) || state
    } catch {}
  } else if (existsSync(stateFile)) {
    try { state = JSON.parse(readFileSync(stateFile, 'utf-8')) } catch {}
  }

  const map: Array<[number, string]> = [
    [1, '01-market-insight'], [2, '02-user-insight'],
    [3, '03-competitor-analysis'], [4, '04-content-strategy'],
  ]
  const briefs = map.map(([step, key]) => {
    const f = path.join(strategyDir, `${key}.md`)
    const exists = existsSync(f)
    return { step, key, exists, size: exists ? statSync(f).size : 0 }
  })
  return NextResponse.json({ project, project_yaml: projectYaml, state, briefs })
}
```

- [ ] **Step 6: Create app/api/health/route.ts**

```bash
mkdir -p app/api/health
```

```ts
import { NextResponse } from 'next/server'
import { hasAnthropic } from '@/server/llm.js'
import { listProjects } from '@/lib/fs-api'

export async function GET() {
  return NextResponse.json({ ok: true, anthropic: hasAnthropic(), projects: listProjects() })
}
```

- [ ] **Step 7: Commit**

```bash
git add app/api/
git commit -m "feat(nextjs): add read-only filesystem API routes"
```

---

### Task 6: API Routes — ideas

**Files:**
- Create: `app/api/promote-idea/route.ts`
- Create: `app/api/reject-idea/route.ts`
- Create: `app/api/create-idea/route.ts`
- Create: `app/api/source-ideas/route.ts`

- [ ] **Step 1: Create app/api/promote-idea/route.ts**

```bash
mkdir -p app/api/promote-idea
```

```ts
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { PROJECTS_DIR } from '@/lib/fs-api'
import { hasAnthropic } from '@/server/llm.js'
import { runAgent } from '@/server/runner.js'
import { hasMultica } from '@/server/multica-db.js'

export async function POST(request: NextRequest) {
  const { project, agent, idea_id } = await request.json()
  if (!project || !agent || !idea_id) {
    return NextResponse.json({ error: 'project + agent + idea_id required' }, { status: 400 })
  }

  // Multica DB path
  if (hasMultica()) {
    if (!hasAnthropic()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
    const { getIssue, updateIssueStatus } = await import('@/server/multica-db.js')
    const issue = await getIssue(idea_id)
    if (!issue) return NextResponse.json({ error: 'idea not found' }, { status: 404 })
    const topic = issue.title || ''
    if (!topic) return NextResponse.json({ error: 'no topic in idea' }, { status: 400 })
    await updateIssueStatus(idea_id, 'in_progress')
    try {
      const out = await runAgent(agent, { project, topic })
      return NextResponse.json({ ok: true, topic, ...out })
    } catch (e: unknown) {
      return NextResponse.json({ error: String((e as Error)?.message || e), topic }, { status: 500 })
    }
  }

  // Filesystem path
  if (!hasAnthropic()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  const ideaFile = path.join(PROJECTS_DIR, project, 'agents', agent, 'content-bank', 'new-idea', `${idea_id}.md`)
  if (!existsSync(ideaFile)) return NextResponse.json({ error: 'idea not found' }, { status: 404 })
  let topic = ''
  try { topic = matter(readFileSync(ideaFile, 'utf-8')).data.topic || '' } catch {}
  if (!topic) return NextResponse.json({ error: 'no topic in idea frontmatter' }, { status: 400 })
  const promotedDir = path.join(PROJECTS_DIR, project, 'agents', agent, 'content-bank', '.promoted')
  mkdirSync(promotedDir, { recursive: true })
  renameSync(ideaFile, path.join(promotedDir, `${idea_id}.md`))
  try {
    const out = await runAgent(agent, { project, topic })
    return NextResponse.json({ ok: true, topic, ...out })
  } catch (e: unknown) {
    return NextResponse.json({ error: String((e as Error)?.message || e), topic }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create app/api/reject-idea/route.ts**

```bash
mkdir -p app/api/reject-idea
```

```ts
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, appendFileSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { PROJECTS_DIR } from '@/lib/fs-api'
import { hasMultica } from '@/server/multica-db.js'

export async function POST(request: NextRequest) {
  const { project, agent, idea_id, reason } = await request.json()
  if (!project || !agent || !idea_id) {
    return NextResponse.json({ error: 'project + agent + idea_id required' }, { status: 400 })
  }

  if (hasMultica()) {
    const { getIssue, updateIssueStatus } = await import('@/server/multica-db.js')
    const issue = await getIssue(idea_id)
    if (!issue) return NextResponse.json({ error: 'not found' }, { status: 404 })
    await updateIssueStatus(idea_id, 'cancelled')
    return NextResponse.json({ ok: true, topic: issue.title })
  }

  const ideaFile = path.join(PROJECTS_DIR, project, 'agents', agent, 'content-bank', 'new-idea', `${idea_id}.md`)
  if (!existsSync(ideaFile)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  let topic = ''
  try { topic = matter(readFileSync(ideaFile, 'utf-8')).data.topic || '' } catch {}
  const antiFile = path.join(PROJECTS_DIR, project, 'agents', agent, 'anti-patterns.md')
  const entry = `\n### ${new Date().toISOString().slice(0,10)} · ${topic || idea_id}\n- What: idea rejected at promotion gate\n- Why rejected: ${reason || 'No reason'}\n- Avoid: TBD\n`
  appendFileSync(antiFile, entry)
  const rejDir = path.join(PROJECTS_DIR, project, 'agents', agent, 'content-bank', '.rejected-ideas')
  mkdirSync(rejDir, { recursive: true })
  renameSync(ideaFile, path.join(rejDir, `${idea_id}.md`))
  return NextResponse.json({ ok: true, topic })
}
```

- [ ] **Step 3: Create app/api/create-idea/route.ts**

```bash
mkdir -p app/api/create-idea
```

```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'

export async function POST(request: NextRequest) {
  const { project, topic, angle, hook } = await request.json()
  if (!project || !topic) {
    return NextResponse.json({ error: 'project and topic are required' }, { status: 400 })
  }
  if (!hasMultica()) return NextResponse.json({ error: 'No database configured' }, { status: 503 })
  try {
    const { getWorkspaceBySlug, getOrCreateGTMUser, createIssue } = await import('@/server/multica-db.js')
    const ws = await getWorkspaceBySlug(project)
    if (!ws) return NextResponse.json({ error: `workspace "${project}" not found` }, { status: 404 })
    const creatorId = await getOrCreateGTMUser()
    const parts: string[] = []
    if (angle) parts.push(`**Angle**: ${angle}`)
    if (hook) parts.push(`**Hook seed**: ${hook}`)
    const description = parts.join('\n\n')
    const id = await createIssue(ws.id, { title: topic, description, status: 'backlog', creatorId })
    return NextResponse.json({ ok: true, id })
  } catch (e: unknown) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Create app/api/source-ideas/route.ts**

```bash
mkdir -p app/api/source-ideas
```

```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasAnthropic } from '@/server/llm.js'
import { sourceIdeas } from '@/server/source-ideas.js'

export async function POST(request: NextRequest) {
  const { project, agent, n } = await request.json()
  if (!project) return NextResponse.json({ error: 'project required' }, { status: 400 })
  if (!hasAnthropic()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  try {
    const out = await sourceIdeas({ project, agent, n: n || 5 })
    return NextResponse.json({ ok: true, ...out })
  } catch (e: unknown) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 })
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/promote-idea app/api/reject-idea app/api/create-idea app/api/source-ideas
git commit -m "feat(nextjs): add ideas API routes"
```

---

### Task 7: API Routes — review + contentos

**Files:**
- Create: `app/api/review/route.ts`
- Create: `app/api/contentos/[slug]/state/route.ts`
- Create: `app/api/contentos/[slug]/strategy/route.ts`
- Create: `app/api/contentos/[slug]/run-step/route.ts`
- Create: `app/api/contentos/[slug]/save-edit/route.ts`
- Create: `app/api/contentos/[slug]/build/route.ts`

- [ ] **Step 1: Create app/api/review/route.ts**

```bash
mkdir -p app/api/review
```

```ts
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, mkdirSync, renameSync, readlinkSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { REVIEWS_DIR, REPO_ROOT } from '@/lib/fs-api'

export async function POST(request: NextRequest) {
  const { reviewer, id, action, reason } = await request.json()
  if (!reviewer || !id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'reviewer/id/action required (action=approve|reject)' }, { status: 400 })
  }
  const link = path.join(REVIEWS_DIR, reviewer, `${id}.md`)
  if (!existsSync(link)) return NextResponse.json({ error: 'not in queue' }, { status: 404 })
  let target: string
  try { target = readlinkSync(link) } catch { target = link }

  return new Promise<NextResponse>(resolve => {
    const args = [path.join(REPO_ROOT, 'scripts/review-queue.sh'), reviewer, action, id]
    if (action === 'reject') args.push(reason || 'No reason given')
    const child = spawn('bash', args, { cwd: REPO_ROOT })
    let out = '', err = ''
    child.stdout.on('data', (d: Buffer) => out += d.toString())
    child.stderr.on('data', (d: Buffer) => err += d.toString())
    child.on('close', (code: number) => {
      resolve(NextResponse.json(
        { code, stdout: out.trim(), stderr: err.trim() },
        { status: code === 0 ? 200 : 500 }
      ))
    })
  })
}
```

- [ ] **Step 2: Create contentos routes**

```bash
mkdir -p app/api/contentos/\[slug\]/state app/api/contentos/\[slug\]/strategy app/api/contentos/\[slug\]/run-step app/api/contentos/\[slug\]/save-edit app/api/contentos/\[slug\]/build
```

**app/api/contentos/[slug]/state/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PROJECTS_DIR } from '@/lib/fs-api'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const projectDir = path.join(PROJECTS_DIR, slug)
  if (hasDB()) {
    try {
      const ws = await store.getWorkspace(slug)
      if (!ws) return NextResponse.json({ error: 'not found' }, { status: 404 })
      const state = await store.getContentOSState(ws.id) || { current_step: 0, steps: {} }
      const project = existsSync(path.join(projectDir, 'project.yaml'))
        ? readFileSync(path.join(projectDir, 'project.yaml'), 'utf-8') : ''
      return NextResponse.json({ slug, state, project_yaml: project })
    } catch (e: unknown) {
      console.warn('[contentos state DB read failed]', (e as Error).message)
    }
  }
  const stateFile = path.join(projectDir, '.contentos-state.json')
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf-8'))
    : { current_step: 0, steps: {} }
  const project = existsSync(path.join(projectDir, 'project.yaml'))
    ? readFileSync(path.join(projectDir, 'project.yaml'), 'utf-8') : ''
  return NextResponse.json({ slug, state, project_yaml: project })
}
```

**app/api/contentos/[slug]/strategy/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { PROJECTS_DIR, REPO_ROOT } from '@/lib/fs-api'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

const STEP_KEYS: Record<string, string> = {
  '1': '01-market-insight', '2': '02-user-insight',
  '3': '03-competitor-analysis', '4': '04-content-strategy',
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const step = request.nextUrl.searchParams.get('step')
  if (!step || !STEP_KEYS[step]) return NextResponse.json({ error: 'step 1..4 required' }, { status: 400 })
  const fname = STEP_KEYS[step]

  if (hasDB()) {
    try {
      const ws = await store.getWorkspace(slug)
      if (ws) {
        const doc = await store.getStrategyDoc(ws.id, fname)
        if (doc) return NextResponse.json({ step, content: doc.content })
      }
    } catch {}
  }

  const f = path.join(PROJECTS_DIR, slug, 'strategy', `${fname}.md`)
  const exists = existsSync(f)
  return NextResponse.json({
    step, file: path.relative(REPO_ROOT, f), exists,
    content: exists ? readFileSync(f, 'utf-8') : '',
  })
}
```

**app/api/contentos/[slug]/run-step/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import { REPO_ROOT } from '@/lib/fs-api'

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const step = request.nextUrl.searchParams.get('step')
  if (!step || !['1','2','3','4'].includes(step)) {
    return NextResponse.json({ error: 'step 1..4 required' }, { status: 400 })
  }
  return new Promise<NextResponse>(resolve => {
    const child = spawn('python3',
      [path.join(REPO_ROOT, 'scripts/contentos-agent.py'), '--project', slug, '--step', step],
      { cwd: REPO_ROOT, env: process.env })
    let out = '', err = ''
    child.stdout.on('data', (d: Buffer) => out += d.toString())
    child.stderr.on('data', (d: Buffer) => err += d.toString())
    child.on('close', (code: number) => {
      resolve(NextResponse.json({ code, stdout: out, stderr: err }, { status: code === 0 ? 200 : 500 }))
    })
    request.signal.addEventListener('abort', () => child.kill('SIGTERM'))
  })
}

import path from 'node:path'
```

Note: The `import path` at the bottom is a mistake — move it to the top. The correct file is:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { REPO_ROOT } from '@/lib/fs-api'

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const step = request.nextUrl.searchParams.get('step')
  if (!step || !['1','2','3','4'].includes(step)) {
    return NextResponse.json({ error: 'step 1..4 required' }, { status: 400 })
  }
  return new Promise<NextResponse>(resolve => {
    const child = spawn('python3',
      [path.join(REPO_ROOT, 'scripts/contentos-agent.py'), '--project', slug, '--step', step],
      { cwd: REPO_ROOT, env: process.env })
    let out = '', err = ''
    child.stdout.on('data', (d: Buffer) => out += d.toString())
    child.stderr.on('data', (d: Buffer) => err += d.toString())
    child.on('close', (code: number) => {
      resolve(NextResponse.json({ code, stdout: out, stderr: err }, { status: code === 0 ? 200 : 500 }))
    })
    request.signal.addEventListener('abort', () => child.kill('SIGTERM'))
  })
}
```

**app/api/contentos/[slug]/save-edit/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { PROJECTS_DIR, REPO_ROOT } from '@/lib/fs-api'

const STEP_KEYS: Record<string, string> = {
  '1': '01-market-insight', '2': '02-user-insight',
  '3': '03-competitor-analysis', '4': '04-content-strategy',
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const step = request.nextUrl.searchParams.get('step')
  if (!step || !STEP_KEYS[step]) return NextResponse.json({ error: 'bad step' }, { status: 400 })
  try {
    const { content } = await request.json()
    const f = path.join(PROJECTS_DIR, slug, 'strategy', `${STEP_KEYS[step]}.md`)
    writeFileSync(f, content)
    return NextResponse.json({ ok: true, file: path.relative(REPO_ROOT, f), size: content.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

**app/api/contentos/[slug]/build/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { REPO_ROOT } from '@/lib/fs-api'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return new Promise<NextResponse>(resolve => {
    const child = spawn('python3',
      [path.join(REPO_ROOT, 'scripts/hydrate-agents.py'), '--project', slug],
      { cwd: REPO_ROOT, env: process.env })
    let out = '', err = ''
    child.stdout.on('data', (d: Buffer) => out += d.toString())
    child.stderr.on('data', (d: Buffer) => err += d.toString())
    child.on('close', (code: number) => {
      resolve(NextResponse.json({ code, stdout: out, stderr: err }, { status: code === 0 ? 200 : 500 }))
    })
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/review app/api/contentos
git commit -m "feat(nextjs): add review and contentos API routes"
```

---

### Task 8: API Routes — workspaces, pool, assignments

**Files:**
- Create: `app/api/workspaces/route.ts`
- Create: `app/api/workspaces/[slug]/route.ts`
- Create: `app/api/pool/route.ts`
- Create: `app/api/pool/[id]/route.ts`
- Create: `app/api/assignments/route.ts`

- [ ] **Step 1: Create workspaces routes**

```bash
mkdir -p app/api/workspaces/\[slug\]
```

**app/api/workspaces/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { PROJECTS_DIR } from '@/lib/fs-api'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'
import { runCIAAnalysis } from '@/server/cia.js'

export async function GET() {
  if (!hasDB()) return NextResponse.json({ error: 'no database' })
  try {
    const workspaces = await store.listWorkspaces()
    const result = []
    for (const ws of workspaces) {
      const cosState = await store.getContentOSState(ws.id)
      result.push({ ...ws, contentos_state: cosState })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { slug, name, urls = {}, project_config = {} } = await request.json()
    if (!slug || !name) return NextResponse.json({ error: 'slug and name required' }, { status: 400 })

    if (hasDB()) {
      const ws = await store.createWorkspace({ slug, name, urls, project_config, lifecycle_state: 'onboarding' })
      await store.saveContentOSState(ws.id, { current_step: 0, steps: {} })
      return NextResponse.json(ws)
    }

    const projectDir = path.join(PROJECTS_DIR, slug)
    if (existsSync(projectDir)) return NextResponse.json({ error: 'slug already exists' }, { status: 409 })
    mkdirSync(path.join(projectDir, 'strategy'), { recursive: true })
    mkdirSync(path.join(projectDir, 'agents'), { recursive: true })

    const projData = {
      slug, name,
      url: (urls as Record<string, string>).website || (project_config as Record<string, string>).url || '',
      github_kb: (urls as Record<string, string>).github_kb || '',
      category: (project_config as Record<string, string>).category || '',
      tagline: (project_config as Record<string, string>).tagline || '',
      status: 'active',
    }
    writeFileSync(path.join(projectDir, 'project.yaml'), yaml.dump(projData, { lineWidth: 0, sortKeys: false }))

    const regPath = path.join(PROJECTS_DIR, '_registry.json')
    let reg: Record<string, unknown> = {}
    try { reg = JSON.parse(readFileSync(regPath, 'utf-8')) } catch {}
    if (!reg.projects) reg.projects = {}
    if (!reg.default) reg.default = slug;
    (reg.projects as Record<string, unknown>)[slug] = { slug, name, url: projData.url, status: 'active' }
    writeFileSync(regPath, JSON.stringify(reg, null, 2))

    if (process.env.CIA_HUB_TOKEN && process.env.CIA_AUTO === '1') {
      runCIAAnalysis(name, slug).catch((e: Error) => console.warn('[cia] auto-analyze failed:', e.message))
    }
    return NextResponse.json({ slug, name, lifecycle_state: 'onboarding', ...projData })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

**app/api/workspaces/[slug]/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'
import { hasMultica } from '@/server/multica-db.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  try {
    if (hasDB()) {
      const ws = await store.getWorkspace(slug)
      if (!ws) return NextResponse.json({ error: 'not found' }, { status: 404 })
      const cosState = await store.getContentOSState(ws.id)
      const agents = await store.listAgentsForWorkspace(ws.id)
      return NextResponse.json({ ...ws, contentos_state: cosState, agents })
    }
    if (hasMultica()) {
      const { getWorkspaceAgents } = await import('@/server/multica-db.js')
      const agents = await getWorkspaceAgents(slug)
      return NextResponse.json({ slug, name: slug, lifecycle_state: 'active', agents })
    }
    return NextResponse.json({ error: 'no database configured' }, { status: 503 })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const body = await request.json()
    const ws = await store.updateWorkspace(slug, body)
    if (!ws) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(ws)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create pool routes**

```bash
mkdir -p app/api/pool/\[id\]
```

**app/api/pool/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasDB, query } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET() {
  if (!hasDB()) return NextResponse.json({ error: 'no database' })
  try {
    const people = await store.listPeople()
    const result = []
    for (const p of people) {
      const assignments = await query(
        `SELECT aa.agent_id, w.slug AS workspace_slug, a.channel
         FROM agent_assignments aa
         JOIN agents a ON a.id = aa.agent_id
         JOIN workspaces w ON w.id = a.workspace_id
         WHERE aa.person_id = $1`,
        [p.id]
      )
      result.push({ ...p, assignments, current_workload: assignments.length })
    }
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const { handle, name, role, channels, max_workload } = await request.json()
    if (!handle || !name || !role) return NextResponse.json({ error: 'handle, name, role required' }, { status: 400 })
    const person = await store.createPerson({ handle, name, role, channels, max_workload })
    return NextResponse.json(person)
  } catch (e: unknown) {
    const msg = (e as Error).message || ''
    if (msg.includes('unique')) return NextResponse.json({ error: 'handle already exists' }, { status: 409 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

**app/api/pool/[id]/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const body = await request.json()
    const person = await store.updatePerson(id, body)
    if (!person) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(person)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create app/api/assignments/route.ts**

```bash
mkdir -p app/api/assignments
```

```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function POST(request: NextRequest) {
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const { agent_id, person_id, role } = await request.json()
    if (!agent_id || !person_id || !role) {
      return NextResponse.json({ error: 'agent_id, person_id, role required' }, { status: 400 })
    }
    const result = await store.assign(agent_id, person_id, role)
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/workspaces app/api/pool app/api/assignments
git commit -m "feat(nextjs): add workspaces, pool, assignments API routes"
```

---

### Task 9: API Routes — engines, drops, onboarding

**Files:**
- Create: `app/api/engines/[ws]/route.ts`
- Create: `app/api/engines/[ws]/file/[...path]/route.ts`
- Create: `app/api/drops/route.ts`
- Create: `app/api/drops/status/[issueId]/route.ts`
- Create: `app/api/onboarding/analyze/route.ts`
- Create: `app/api/onboarding/analysis/[id]/route.ts`

- [ ] **Step 1: Create engines routes**

```bash
mkdir -p "app/api/engines/[ws]/file/[...path]"
```

**app/api/engines/[ws]/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const workspace = await store.getWorkspace(ws)
    if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
    const files = await store.listEngineFiles(workspace.id)
    return NextResponse.json(files)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

**app/api/engines/[ws]/file/[...path]/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasDB } from '@/server/db.js'
import * as store from '@/server/store.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ws: string; path: string[] }> }) {
  const { ws, path: pathParts } = await params
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const workspace = await store.getWorkspace(ws)
    if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
    const filePath = pathParts.join('/')
    const content = await store.getEngineFile(workspace.id, filePath)
    if (content === null) return NextResponse.json({ error: 'file not found' }, { status: 404 })
    return NextResponse.json({ file_path: filePath, content, workspace: workspace.slug })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ ws: string; path: string[] }> }) {
  const { ws, path: pathParts } = await params
  if (!hasDB()) return NextResponse.json({ error: 'DATABASE_URL required' }, { status: 503 })
  try {
    const workspace = await store.getWorkspace(ws)
    if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
    const filePath = pathParts.join('/')
    const { content } = await request.json()
    if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 })
    const result = await store.upsertEngineFile(workspace.id, filePath, content)
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create drops routes**

```bash
mkdir -p app/api/drops/status/\[issueId\]
```

**app/api/drops/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'
import { createContentDrop } from '@/server/drops.js'

export async function POST(request: NextRequest) {
  if (!hasMultica()) return NextResponse.json({ error: 'MULTICA_DATABASE_URL not configured' }, { status: 503 })
  try {
    const { workspace_slug, angle, context, channels, priority } = await request.json()
    if (!workspace_slug || !angle) {
      return NextResponse.json({ error: 'workspace_slug and angle required' }, { status: 400 })
    }
    const result = await createContentDrop({ workspace_slug, angle, context, channels, priority })
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

**app/api/drops/status/[issueId]/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params
  if (!hasMultica()) return NextResponse.json({ error: 'MULTICA_DATABASE_URL not configured' }, { status: 503 })
  try {
    const { getIssue, getIssueComments } = await import('@/server/multica-db.js')
    const issue = await getIssue(issueId)
    if (!issue) return NextResponse.json({ error: 'issue not found' }, { status: 404 })
    const comments = await getIssueComments(issueId)
    return NextResponse.json({ issue, comments })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create onboarding routes**

```bash
mkdir -p app/api/onboarding/analyze app/api/onboarding/analysis/\[id\]
```

**app/api/onboarding/analyze/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { analyzeProduct } from '@/server/onboarding.js'

export async function POST(request: NextRequest) {
  const { website, github_kb } = await request.json()
  if (!website) return NextResponse.json({ error: 'website URL required' }, { status: 400 })
  try {
    const id = await analyzeProduct({ website, github_kb })
    return NextResponse.json({ id })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

**app/api/onboarding/analysis/[id]/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getAnalysis } from '@/server/onboarding.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = getAnalysis(id)
  if (!result) return NextResponse.json({ error: 'analysis not found' }, { status: 404 })
  return NextResponse.json(result)
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/engines app/api/drops app/api/onboarding
git commit -m "feat(nextjs): add engines, drops, onboarding API routes"
```

---

### Task 10: API Routes — ai-review, cia, test

**Files:**
- Create: `app/api/ai-review/route.ts`
- Create: `app/api/cia/analyze/route.ts`
- Create: `app/api/cia/status/[slug]/route.ts`
- Create: `app/api/test/hello-world/route.ts`
- Create: `app/api/test/retry/[issueId]/route.ts`

- [ ] **Step 1: Create remaining routes**

```bash
mkdir -p app/api/ai-review app/api/cia/analyze "app/api/cia/status/[slug]" app/api/test/hello-world "app/api/test/retry/[issueId]"
```

**app/api/ai-review/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { hasMultica } from '@/server/multica-db.js'
import { runAIReview } from '@/server/ai-review.js'

export async function POST(request: NextRequest) {
  if (!hasMultica()) return NextResponse.json({ error: 'MULTICA_DATABASE_URL not configured' }, { status: 503 })
  try {
    const { issue_id, channel, workspace_slug } = await request.json()
    if (!issue_id || !channel || !workspace_slug) {
      return NextResponse.json({ error: 'issue_id, channel, workspace_slug required' }, { status: 400 })
    }
    const result = await runAIReview({ issue_id, channel, workspace_slug })
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

**app/api/cia/analyze/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { runCIAAnalysis } from '@/server/cia.js'

export async function POST(request: NextRequest) {
  const { name, slug } = await request.json()
  if (!name || !slug) return NextResponse.json({ error: 'name and slug required' }, { status: 400 })
  if (!process.env.CIA_HUB_TOKEN) return NextResponse.json({ error: 'CIA_HUB_TOKEN not configured' }, { status: 503 })
  try {
    const result = await runCIAAnalysis(name, slug)
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

**app/api/cia/status/[slug]/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getCIAStatus } from '@/server/cia.js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const status = getCIAStatus(slug)
  if (!status) return NextResponse.json({ phase: 'idle', done: false, log: [] })
  return NextResponse.json(status)
}
```

**app/api/test/hello-world/route.ts:**
```ts
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const { initHelloWorld } = await import('@/server/test-hello-world.js')
    const result = await initHelloWorld()
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

**app/api/test/retry/[issueId]/route.ts:**
```ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params
  try {
    const { retryWithFeedback } = await import('@/server/test-hello-world.js')
    const result = await retryWithFeedback(issueId)
    return NextResponse.json(result)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/ai-review app/api/cia app/api/test
git commit -m "feat(nextjs): add ai-review, cia, test API routes"
```

---

### Task 11: Bootstrap cron in Next.js

The cron jobs currently start in `server/index.js` via `startCron()`. In Next.js, there's no equivalent startup hook in App Router. Use Next.js instrumentation instead.

**Files:**
- Create: `instrumentation.ts`

- [ ] **Step 1: Create instrumentation.ts**

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootstrap } = await import('./server/bootstrap.js')
    const { bootstrapDB, bootstrapMultica } = await import('./server/bootstrap.js')
    const { startCron } = await import('./server/cron.js')
    bootstrap()
    await bootstrapDB()
    await bootstrapMultica()
    startCron()
  }
}
```

- [ ] **Step 2: Enable instrumentation in next.config.ts**

Update `next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'gray-matter', 'js-yaml', 'node-cron'],
  experimental: {
    instrumentationHook: true,
  },
}

export default nextConfig
```

- [ ] **Step 3: Commit**

```bash
git add instrumentation.ts next.config.ts
git commit -m "feat(nextjs): add instrumentation hook for bootstrap + cron"
```

---

### Task 12: Update deployment config

**Files:**
- Modify: `Dockerfile`
- Modify: `railway.json`

- [ ] **Step 1: Replace Dockerfile**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache tini python3 py3-pip
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public 2>/dev/null || true
COPY package.json ./
COPY server ./server
COPY projects ./projects
COPY engines ./engines
COPY templates ./templates
COPY scripts ./scripts
COPY lib ./lib
COPY app/api ./app/api
COPY instrumentation.ts ./
ENV NODE_ENV=production
ENV PORT=8082
EXPOSE 8082
ENTRYPOINT ["/sbin/tini","--"]
CMD ["npm", "start"]
```

- [ ] **Step 2: Update railway.json**

```json
{
  "$schema": "https://schema.up.railway.app/v0/railway-config.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "Dockerfile" },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile railway.json
git commit -m "feat(nextjs): update Dockerfile and railway.json for Next.js"
```

---

### Task 13: Delete old files

- [ ] **Step 1: Delete Vite dashboard**

```bash
rm -rf dashboard/
```

- [ ] **Step 2: Delete old server entry files**

```bash
rm server/index.js server/api.js server/bootstrap.js
```

- [ ] **Step 3: Verify next dev still starts**

```bash
npm run dev
```

Expected: server starts on `:8082`, no missing module errors.

- [ ] **Step 4: Hit key API endpoints**

```bash
curl -s http://localhost:8082/api/health | jq .
# Expected: {"ok":true,"anthropic":...,"projects":[...]}

curl -s 'http://localhost:8082/api/content?project=voc-ai&state=new-idea' | jq '.counts'
# Expected: counts object
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(nextjs): remove Vite dashboard and old Express server files"
```

---

### Task 14: Smoke test and fix TypeScript

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Fix any errors. Common patterns:
- `cannot find module '@/server/foo.js'` → add `allowJs: true` is already set; check the path
- `params` must be awaited in Next.js 15 (already done in the route templates above)
- Missing types from server/ .js files → add `// @ts-ignore` above the import as needed

- [ ] **Step 2: Test the dashboard in browser**

Open `http://localhost:8082`. Verify:
1. Home page loads with project list
2. Click a project → `/dashboard/:slug` loads
3. Ideas tab shows ideas pool
4. `+ New Idea` button visible, form opens, create works
5. `/pool` route loads

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: resolve TypeScript and routing issues after Next.js migration"
```
