# Next.js Full Migration — Design Spec

**Date:** 2026-05-14
**Status:** Approved

## Problem

The current frontend is Vite + React, served as a pre-built static bundle (`dashboard/dist`) by Express. Any UI change requires a full `pnpm build` + server restart to be visible. The Vite dev server (`pnpm dev`) has HMR but duplicates all API logic in `vite.config.ts`, meaning every new endpoint must be written twice.

## Goal

Replace the Vite + Express dual-server setup with a single Next.js application that:
- Provides instant HMR in development (`next dev`)
- Serves both frontend and API from a single process
- Eliminates the `vite.config.ts` API duplication

---

## Scope

| In scope | Out of scope |
|----------|-------------|
| Replace `dashboard/` (Vite) with Next.js | Changing UI/UX or component logic |
| Migrate all 34 Express endpoints to Next.js API Routes | Migrating Python scripts |
| Delete `server/api.js`, `server/index.js`, `server/bootstrap.js` | Changing database schema |
| Update Dockerfile + railway.json for Next.js | Adding new features |
| Delete `vite.config.ts` inline API plugin | |

---

## Architecture

### Directory Layout (after migration)

```
/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout (HTML shell)
│   ├── page.tsx                # / (was routes/Home.tsx)
│   ├── onboard/page.tsx        # /onboard
│   ├── pool/page.tsx           # /pool
│   ├── dashboard/
│   │   ├── page.tsx            # /dashboard
│   │   └── [slug]/page.tsx     # /dashboard/:slug
│   ├── wizard/
│   │   └── [slug]/page.tsx     # /wizard/:slug
│   └── api/                    # All API Route Handlers
│       ├── projects/route.ts
│       ├── agents/route.ts
│       ├── content/route.ts
│       ├── file/route.ts
│       ├── project-meta/route.ts
│       ├── health/route.ts
│       ├── promote-idea/route.ts
│       ├── reject-idea/route.ts
│       ├── create-idea/route.ts
│       ├── source-ideas/route.ts
│       ├── review/route.ts
│       ├── workspaces/
│       │   ├── route.ts         # GET /workspaces, POST /workspaces
│       │   └── [slug]/route.ts  # GET /workspaces/:slug
│       ├── contentos/
│       │   └── [slug]/
│       │       ├── state/route.ts
│       │       ├── strategy/route.ts
│       │       ├── run-step/route.ts
│       │       ├── save-edit/route.ts
│       │       └── build/route.ts
│       ├── engines/
│       │   ├── [ws]/
│       │   │   ├── route.ts     # GET /engines/:ws
│       │   │   └── file/[...path]/route.ts
│       ├── pool/route.ts
│       ├── assignments/route.ts
│       ├── drops/
│       │   ├── route.ts
│       │   └── status/[issueId]/route.ts
│       ├── onboarding/
│       │   ├── analyze/route.ts
│       │   └── analysis/[id]/route.ts
│       ├── ai-review/route.ts
│       ├── cia/
│       │   ├── analyze/route.ts
│       │   └── status/[slug]/route.ts
│       └── test/
│           ├── hello-world/route.ts
│           └── retry/[issueId]/route.ts
├── _components/                # Migrated from dashboard/src/components/
├── _hooks/                     # Migrated from dashboard/src/hooks/
├── server/                     # Utility modules (keep, no changes)
│   ├── multica-db.js
│   ├── llm.js
│   ├── runner.js
│   ├── store.js
│   ├── paths.js
│   └── ... (other utils)
├── next.config.ts
├── tsconfig.json
└── package.json                # Root package.json gains next dependency
```

### What Gets Deleted

- `dashboard/` — entire Vite project
- `server/api.js` — replaced by `app/api/`
- `server/index.js` — replaced by Next.js server
- `server/bootstrap.js` — startup logic moved to `next.config.ts`

---

## Component Migration Strategy

All existing React components use `useState` / `useEffect` / browser APIs. Every component and page file gets `'use client'` at the top — no logic changes, just the directive.

React Router (`<BrowserRouter>`, `<Link>`, `useParams`) is removed. Next.js equivalents:
- `useParams()` from `react-router-dom` → `useParams()` from `next/navigation`
- `<Link to="...">` → `<Link href="...">` from `next/link`
- `useNavigate()` → `useRouter()` from `next/navigation`

---

## API Route Migration Pattern

Each Express handler becomes a `route.ts` file:

```ts
// app/api/health/route.ts
import { NextResponse } from 'next/server'
import { listProjects } from '@/lib/api-helpers'
import { hasAnthropic } from '@/server/llm'

export async function GET() {
  return NextResponse.json({ ok: true, anthropic: hasAnthropic() })
}
```

**Auth:** Express `requireAuth` middleware → inline check at top of handler:
```ts
function requireAuth(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token === process.env.WRITES_TOKEN
}
```

**Request body:** `req.body` → `await request.json()`

**Query params:** `req.query.foo` → `request.nextUrl.searchParams.get('foo')`

---

## next.config.ts

```ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'gray-matter'],
}
export default nextConfig
```

---

## package.json Changes

Root `package.json` gains:
- `next`, `react`, `react-dom` as dependencies
- `@types/react`, `@types/react-dom`, `typescript` as devDependencies
- Scripts: `"dev": "next dev -p 8082"`, `"build": "next build"`, `"start": "next start -p 8082"`

Dashboard `package.json` and `pnpm-lock.yaml` are deleted.

---

## Dockerfile (after)

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache tini python3
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json ./
COPY server ./server
COPY projects ./projects
COPY engines ./engines
COPY templates ./templates
COPY scripts ./scripts
ENV NODE_ENV=production
ENV PORT=8082
EXPOSE 8082
ENTRYPOINT ["/sbin/tini","--"]
CMD ["npm", "start"]
```

## railway.json (after)

```json
{
  "build": { "builder": "DOCKERFILE" },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

---

## CSS / Styling

- `dashboard/src/index.css` → `app/globals.css` (imported in `app/layout.tsx`)
- `dashboard/src/App.css` → `app/dashboard/[slug]/page.module.css` or kept as global
- Component CSS files (`IdeasPool.css` etc.) stay co-located with components in `_components/`

---

## Development Workflow (after)

```bash
# Single command — HMR for both UI and API routes
npm run dev
# open http://localhost:8082
```

No separate build step. Changes to any file hot-reload instantly.
