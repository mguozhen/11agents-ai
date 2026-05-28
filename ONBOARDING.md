# 11agents.ai — engineer onboarding

Welcome. This repo contains **two deployables** in one tree:

| Surface     | Path in repo      | Deploys to                                              | Stack                              |
|-------------|-------------------|---------------------------------------------------------|------------------------------------|
| Marketing   | repo root (`/`)   | Vercel → `https://11agents.ai`                          | static HTML + Vercel Node funcs    |
| Platform    | `platform/`       | Railway → `https://gtm-swarm-production-b9ff.up.railway.app/` | Next.js 15 + Postgres + Anthropic SDK |

Read [`README.md`](README.md) first for the high-level architecture. This file is the step-by-step setup + dev + deploy guide.

---

## 0. Prereqs

Install once on your machine:

- **Git** + a working GitHub account that's been added to `mguozhen/11agents-ai` as a collaborator (ask Hunter for access).
- **Node.js ≥ 22** (use `nvm`: `nvm install 22 && nvm use 22`).
- **pnpm** (`npm i -g pnpm`) — both surfaces use it.
- **Postgres 15+** locally (Homebrew: `brew install postgresql@15 && brew services start postgresql@15`) — platform needs it.
- **Vercel CLI** — `npm i -g vercel` (for marketing deploys).
- **Railway CLI** — `brew install railway` (for platform deploys).

Auth once:

```sh
gh auth login                           # GitHub
vercel login                            # Vercel (use Hunter-shared team `solvea1`)
railway login                           # Railway (browser OAuth)
```

Get added to:

- Vercel team `solvea1` (Hunter invites)
- Railway project `gtm-swarm` (Hunter invites)

---

## 1. Clone

```sh
git clone https://github.com/mguozhen/11agents-ai.git
cd 11agents-ai
```

You'll see two roots: the marketing static site (top-level files) and `platform/` (the gtm-swarm Next.js app). They're developed and deployed independently for now.

---

## 2. Marketing — local dev

The marketing surface is a single static `index.html` plus a few static HTML pages plus Vercel serverless functions in `api/`. There is no build step.

### Open the static page

```sh
open index.html
```

That gives you the landing page with full functionality except API calls (signup, login, products) — those need Vercel dev.

### Run the full thing (incl. API routes)

```sh
vercel dev --scope solvea1
# opens http://localhost:3000
```

You'll need Vercel env vars locally:

```sh
vercel env pull --scope solvea1   # pulls SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD into .env.local
```

### Admin sign-in (local)

- URL: `http://localhost:3000/login`
- Email: same as `ADMIN_EMAIL` in `.env.local`
- Password: same as `ADMIN_PASSWORD` in `.env.local`

After login you land at `/dashboard` where you can create/list/delete products.

### Files you'll touch most

| File                     | Purpose                                                          |
|--------------------------|------------------------------------------------------------------|
| `index.html`             | Landing page. All copy lives in the JS `T` object at the bottom (en/zh/ja/de). |
| `login.html`             | Admin sign-in form.                                              |
| `dashboard.html`         | Admin product list + add form.                                   |
| `api/signup.js`          | Kickstarter early-bird email capture (public).                   |
| `api/login.js`           | Admin sign-in, sets HttpOnly cookie session.                     |
| `api/logout.js`          | Clears session.                                                  |
| `api/me.js`              | Returns current admin email if authed.                           |
| `api/products.js`        | GET/POST/DELETE products (admin only).                           |
| `lib/auth.js`            | HMAC-SHA256 cookie session, no JWT dep.                          |
| `lib/store.js`           | In-memory product store. Cold-starts reset. Replace with KV/Postgres in v2. |

### Marketing deploy

```sh
# preview build (auto-creates a unique URL):
vercel --scope solvea1

# production (pushes to 11agents.ai):
vercel --prod --yes --scope solvea1
```

The custom domain `11agents.ai` is bound in the Vercel project. CF DNS records:

- `A     11agents.ai → 76.76.21.21`
- `CNAME www         → cname.vercel-dns.com`

Don't touch DNS unless you have the CF token for the 11agents.ai zone (Hunter holds it).

### Marketing env vars (live in Vercel)

| name                 | purpose                                          |
|----------------------|--------------------------------------------------|
| `SESSION_SECRET`     | HMAC secret for signed cookies                   |
| `ADMIN_EMAIL`        | the single admin login email                     |
| `ADMIN_PASSWORD`     | the single admin login password                  |
| `SIGNUP_WEBHOOK_URL` | optional Slack/Discord/ntfy webhook for signups  |

Manage from the Vercel dashboard or CLI:

```sh
vercel env ls --scope solvea1
vercel env add NAME production --scope solvea1     # adds (prompts for value)
vercel env rm NAME production --scope solvea1
```

---

## 3. Platform — local dev

This is the GTM Swarm Next.js 15 app — multi-tenant agent runtime, project workspace UI, DB-backed agent definitions, scheduled cron loops, etc.

### Setup

```sh
cd platform
pnpm install
```

### Database

You need two Postgres databases — one for the GTM platform's own state, one for "Multica" (the external project-management DB that owns agent config + content). For local dev, you can co-locate them in your one local Postgres.

Create them:

```sh
createdb gtm_swarm
createdb multica
```

Run migrations:

```sh
cd platform
pnpm migrate                              # check package.json for exact script name
```

If `pnpm migrate` doesn't exist, apply migrations manually:

```sh
psql gtm_swarm -f migrations/*.sql
```

### Env vars

Copy the example and fill it in:

```sh
cd platform
cp .env.example .env.local                # if .env.example doesn't exist, ask Hunter
```

Required vars:

```
DATABASE_URL=postgresql://localhost:5432/gtm_swarm
MULTICA_DATABASE_URL=postgresql://localhost:5432/multica
ANTHROPIC_API_KEY=sk-ant-...              # ask Hunter for a shared dev key
SUPABASE_URL=...                          # ask Hunter
SUPABASE_ANON_KEY=...                     # ask Hunter
```

### Run dev server

```sh
cd platform
pnpm dev                                  # http://localhost:8082
```

### Read these before changing anything

- `platform/CLAUDE.md` — the working playbook. Voice, voice, voice — read it.
- `platform/PRINCIPLES.md` — Iron Triangle doctrine. **"No Triangle = No Agent"** is a hard rule.
- `platform/ROSTER.md` — the canonical 11 agent definitions.
- `platform/docs/` — replan deck, audit reports, brand decks.

### Don't do

- **Don't read agent config from the filesystem.** Multica DB is the only source of truth. If you find `readFileSync` on `agent.yaml`, that's tech debt — log it and clean it up.
- **Don't ship an agent without all three Iron Triangle roles** (Builder + Reviewer + Cron). Claude is not a substitute for a human Reviewer.

### Platform deploy

Railway watches `mguozhen/11agents-ai` `main` branch (TODO: confirm the Railway service is pointed at this repo and the `platform/` subdir).

```sh
cd platform
railway link                              # links your CLI to the gtm-swarm service
railway up                                # triggers a deploy from your current dir
railway logs                              # tail prod logs
railway run pnpm migrate                  # run a one-off command against prod
```

Or push to GitHub and let Railway auto-build:

```sh
# from the repo root:
git push origin main
# Railway picks up the push and rebuilds from platform/
```

### Production troubleshooting

If something breaks in prod, look at `platform/docs/` for the operational triage runbooks. Specifically:

- `platform/docs/RETROSPECTIVE.md` — past outages and lessons
- `platform/docs/HUMAN_AGENT_WORKFLOW.md` — how the loop is supposed to work
- Railway logs: `railway logs --service gtm-swarm`

---

## 4. Day-to-day workflow

1. `git pull` on `main`.
2. New branch: `git checkout -b feat/your-thing`.
3. Hack.
4. Local test (`vercel dev` for marketing, `pnpm dev` for platform).
5. Push branch, open a PR to `main` on `mguozhen/11agents-ai`.
6. Hunter reviews + merges.
7. Vercel auto-deploys marketing on every push to `main`.
8. Railway auto-deploys platform on every push to `main`.

### PR etiquette

- **One concern per PR.** Don't bundle marketing tweaks with platform refactors.
- **Title format:** `feat(marketing): ...` or `fix(platform): ...` so logs stay readable.
- **Screenshot any UI change** in the PR description.
- **Test prod-style** before requesting review — `vercel --target preview` gives you a preview URL.

---

## 5. Where to get help

- **Codebase questions:** ping Hunter (`@mguozhen`) on GitHub or `mguozhen03@gmail.com`.
- **Brand / copy questions:** check `platform/docs/brand-11agents-v1.html` first — that's the locked design system.
- **Deploy stuck:** check `vercel ls --scope solvea1 11agents-ai` and Railway dashboard. If something's been "UNKNOWN" for >10 min, cancel and re-deploy.
- **Secrets you need:** Hunter shares them via 1Password / iMessage. Never commit them.

---

## 6. Common first tasks (good first issues)

If you're looking for somewhere to start:

- **Marketing copy edits** — `T` object in `index.html`, four language tabs.
- **Replace the in-memory product store with Vercel KV** — see `lib/store.js`. Add `@vercel/kv` dep and a tiny adapter.
- **Add Stripe Checkout pre-order** — currently the form just collects email. Wire up a Stripe Checkout Session creator under `api/checkout.js`.
- **Per-agent detail pages** — `app/agents/[slug]` (platform side) or static pages from `index.html` data.
- **Open Platform channel SDK draft** — `platform/docs/replan-2026-05-22-platform-line.html` has the brief.

Welcome aboard.
