# 11agents.ai

> No business should struggle with GTM.

**Live marketing:** https://11agents.ai
**Live platform:** https://gtm-swarm-production-b9ff.up.railway.app/

This repo is a monorepo containing both the public marketing site and the GTM Swarm platform.

## Layout

```
.
├── index.html            # ← marketing landing page (10 sections, 4 langs)
├── login.html            # admin sign-in form (marketing-side)
├── dashboard.html        # product list + add form (marketing-side)
├── hero-hardware.png     # device render (Flux Schnell)
├── hero-video.mp4        # 5s Seedance Pro teaser
├── api/                  # marketing Vercel serverless funcs
│   ├── signup.js         # POST /api/signup
│   ├── login.js          # POST /api/login (HMAC cookie session)
│   ├── logout.js         # GET  /api/logout
│   ├── me.js             # GET  /api/me
│   └── products.js       # GET/POST/DELETE /api/products
├── lib/
│   ├── auth.js           # HMAC-SHA256 cookie session, no JWT lib
│   └── store.js          # in-memory product store (v2: KV/Postgres)
├── vercel.json
├── .vercelignore         # keeps Vercel from bundling platform/
│
└── platform/             # ← GTM Swarm Next.js 15 app
    ├── app/              # App Router routes (page.tsx, dashboard, onboard, pool, wizard, api)
    ├── lib/              # gtm-swarm db / agents / multica / iron-triangle logic
    ├── migrations/       # Postgres schema migrations
    ├── docs/             # ROSTER.md, brand decks, replan deck, etc.
    ├── Dockerfile        # Railway build
    ├── railway.json      # Railway service config
    ├── package.json      # next 15, react 19, supabase, pg, anthropic-sdk
    ├── CLAUDE.md         # platform-side dev guide
    ├── DESIGN.md         # internal design system
    ├── PRINCIPLES.md
    └── ROSTER.md         # 11 Iron Triangle agent definitions
```

## Two surfaces, two deployments

| Surface     | Source                  | Where it deploys                                        | Stack                        |
|-------------|-------------------------|---------------------------------------------------------|------------------------------|
| Marketing   | Repo root (`/`)         | Vercel project `solvea1/11agents-ai` → `11agents.ai`    | static HTML + Vercel funcs   |
| Platform    | `platform/` subdir      | Railway → `gtm-swarm-production-b9ff.up.railway.app`    | Next.js 15 + Postgres + Anthropic |

`.vercelignore` keeps Vercel from bundling `platform/`. Railway is configured to build from the `platform/` subdir (see Railway service settings).

## Roadmap — structural merge (next iteration)

The current monorepo keeps the two surfaces independent. Next iteration folds them into a single Next.js app:

- Move `index.html` content into `platform/app/(marketing)/page.tsx`
- Move the existing platform project grid from `platform/app/page.tsx` → `platform/app/admin/page.tsx`
- Port marketing API routes to Next.js Route Handlers under `platform/app/api/`
- Single Railway deployment serves both marketing and platform
- Eventually: PR the merged repo to canonical `SolveaCX/gtm-swarm`

---

## Marketing — local dev

Static HTML opens directly:

```sh
open index.html
```

API functions are Vercel-only (Node serverless). Run via:

```sh
vercel dev --scope solvea1
```

## Marketing — deploy

```sh
vercel --prod --yes --scope solvea1
```

## Marketing — environment variables (Vercel project)

| name                | purpose                                          |
|---------------------|--------------------------------------------------|
| `SESSION_SECRET`    | HMAC secret for signed session cookies           |
| `ADMIN_EMAIL`       | the single admin login email                     |
| `ADMIN_PASSWORD`    | the single admin login password                  |
| `SIGNUP_WEBHOOK_URL`| (optional) Slack/Discord/ntfy webhook for signups|

## Marketing — admin

- `/login` — sign in with `ADMIN_EMAIL` + `ADMIN_PASSWORD`
- `/dashboard` — list + add + delete products
- Session: HttpOnly `__11a_session` cookie, HMAC-SHA256 signed, 7-day TTL

## Marketing — DNS

`11agents.ai` is on Cloudflare (separate account from `flatkey.ai`). The dedicated zone API token lives at `~/.flatkey/cloudflare.env` as `CF_11AGENTS_TOKEN` (zone id `CF_11AGENTS_ZONE_ID`). Records:

- `A     11agents.ai     → 76.76.21.21`                (Vercel apex, Proxy OFF)
- `CNAME www             → cname.vercel-dns.com`       (Vercel www, Proxy OFF)

---

## Platform — local dev

```sh
cd platform
npm install
npm run dev      # starts Next.js on http://localhost:8082
```

## Platform — deploy

Railway pulls from the `platform/` subdir, builds via `Dockerfile`, runs `npm start`.

See `platform/CLAUDE.md` and `platform/docs/` for the full GTM Swarm dev guide, agent roster, Iron Triangle doctrine, and database setup.
