# 11agents.ai

> No business should struggle with GTM.

Single-page marketing site + admin dashboard for **11agents.ai** — a swarm of eleven specialised AI growth agents (+ 1 customer support agent), launching on Kickstarter Q3 2026 with hardware.

**Live:** https://11agents.ai

## Stack

- Single static `index.html` (no framework, no build step) — value-first hero, 4-language i18n switcher (EN / 中 / 日 / DE), inline CSS, vanilla JS for language toggle.
- `hero-video.mp4` — generated via ByteDance Seedance Pro on Replicate, image-to-video from `hero-hardware.png`.
- `hero-hardware.png` — product render generated via Flux Schnell on Replicate.
- `api/*.js` — Vercel Node serverless functions for signup capture and admin auth/CRUD.
- `login.html` + `dashboard.html` — admin auth + product CRUD UI.

```
.
├── index.html              # main landing page (10 sections, 4 langs, i18n via data-i18n)
├── login.html              # admin sign-in form
├── dashboard.html          # product list + add form
├── hero-hardware.png       # device render
├── hero-video.mp4          # 5s Seedance teaser
├── vercel.json             # cleanUrls + security headers
├── api/
│   ├── signup.js           # POST /api/signup — Kickstarter early-bird capture
│   ├── login.js            # POST /api/login — sets HttpOnly session cookie
│   ├── logout.js           # GET  /api/logout — clears session
│   ├── me.js               # GET  /api/me     — returns { email } if authed
│   └── products.js         # GET/POST/DELETE /api/products — admin CRUD
└── lib/
    ├── auth.js             # HMAC-SHA256 cookie session (no JWT lib)
    └── store.js            # in-memory product store (cold-start resets — v2: Vercel KV / Postgres)
```

## Local dev

Static HTML opens directly:

```sh
open index.html
```

API functions are Vercel-only (Node serverless). Run via Vercel dev:

```sh
vercel dev --scope solvea1
```

## Deploy

Production deploys to Vercel project `solvea1/11agents-ai`, custom domain `11agents.ai`.

```sh
vercel --prod --yes --scope solvea1
```

## Environment variables (Vercel project)

| name              | purpose                                |
|-------------------|----------------------------------------|
| `SESSION_SECRET`  | HMAC secret for signed session cookies |
| `ADMIN_EMAIL`     | the single admin login email           |
| `ADMIN_PASSWORD`  | the single admin login password        |
| `SIGNUP_WEBHOOK_URL` | (optional) Slack/Discord/ntfy webhook to fan out new signups |

## Admin

- `/login` — sign in with `ADMIN_EMAIL` + `ADMIN_PASSWORD`
- `/dashboard` — list + add + delete products
- Session: HttpOnly `__11a_session` cookie, HMAC-SHA256 signed, 7-day TTL

## DNS

`11agents.ai` is on Cloudflare (separate account from `flatkey.ai`). The dedicated zone API token lives at `~/.flatkey/cloudflare.env` as `CF_11AGENTS_TOKEN` (zone id `CF_11AGENTS_ZONE_ID`). Records:

- `A     11agents.ai     → 76.76.21.21`                  (Vercel apex, Proxy OFF)
- `CNAME www             → cname.vercel-dns.com`         (Vercel www, Proxy OFF)

## Roadmap

- [ ] v2: persistent product store (Vercel KV or Postgres)
- [ ] Kickstarter campaign live (Q3 2026)
- [ ] Per-agent detail pages (`/agents/[slug]`)
- [ ] Stripe pre-order checkout (currently waitlist only)
- [ ] Open Platform channel SDK (2027)
