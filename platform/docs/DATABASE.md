# Database Architecture

## Two databases, two responsibilities

### MULTICA_DATABASE_URL — Multica DB

Used exclusively by `server/multica-db.js`.

Stores Multica-native entities:
- Workspace / Agent definitions
- Issues (raw, as managed by Multica runtime)
- Comments, labels, issue-to-label mappings

### GTM_DATABASE — GTM Supabase (main app data)

`postgresql://postgres.subkdcyfaawrwjenretv:***@aws-1-us-west-1.pooler.supabase.com:5432/postgres`

Stores all GTM-swarm product data:
- **Projects** — workspace/project records
- **Ideas** (`new-idea` state) — sourced or manually created
- **Bank** — approved content
- **Published** — published content
- **Reviews** — review queue and decisions
- **North Star** — goals and KPI targets

## Env vars

```
MULTICA_DATABASE_URL=...   # Multica runtime DB
GTM_DATABASE=...           # GTM app DB (Supabase PostgreSQL)
```

## Code routing

| Feature | DB | Module |
|---------|-----|--------|
| Multica agents/issues | `MULTICA_DATABASE_URL` | `server/multica-db.js` |
| Projects | `GTM_DATABASE` | TBD |
| Ideas / Bank / Published | `GTM_DATABASE` | TBD |
| Reviews | `GTM_DATABASE` | TBD |
| North Star | `GTM_DATABASE` | TBD |
