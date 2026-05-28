# Manual Idea Creation — Design Spec

**Date:** 2026-05-14  
**Status:** Approved

## Problem

Ideas currently enter the pool exclusively through the automated `source-ideas` cron/script. There is no way for a user to inject a hand-crafted idea directly from the dashboard.

## Goal

Add a "Create Idea" flow to the Ideas Pool tab that lets users type a topic, angle, and hook seed and immediately see the new idea card in the pool.

## Scope

- Backend: one new API endpoint
- Frontend: IdeasPool header button + inline expand form
- No changes to routing, auth flow, or other tabs

---

## Backend

### `POST /api/create-idea`

**Location:** `server/api.js` (alongside `promote-idea` and `reject-idea`)

**Request body:**
```json
{
  "project": "voc-ai",       // required — workspace slug
  "topic":   "...",          // required — idea title
  "angle":   "...",          // optional
  "hook":    "..."           // optional
}
```

**Validation:** Return 400 if `project` or `topic` is missing.

**Auth:** None required (public endpoint, consistent with GET /content).

**Logic:**
1. Resolve workspace ID via `getWorkspaceBySlug(project)`. Return 404 if not found.
2. Resolve the GTM bot user ID via `getOrCreateGTMUser()`.
3. Build description string:
   ```
   **Angle**: {angle}

   **Hook seed**: {hook}
   ```
   Omit a line if the field is empty.
4. Call `createIssue(workspaceId, { title: topic, description, status: 'backlog', creatorId: botUserId })`.
5. Return `{ ok: true, id }`.

**Error response:** `{ error: "..." }` with appropriate HTTP status.

---

## Frontend

### IdeasPool component (`dashboard/src/components/IdeasPool.tsx`)

**New prop:**
```ts
onCreateIdea: (topic: string, angle: string, hook: string) => Promise<void>
```

**State additions:**
```ts
const [showCreate, setShowCreate] = useState(false)
const [creating, setCreating] = useState(false)
const [newTopic, setNewTopic] = useState('')
const [newAngle, setNewAngle] = useState('')
const [newHook, setNewHook] = useState('')
```

**Header layout (updated):**
```
💡 Ideas Pool · N fresh    [hint text]    [+ New Idea button]
```

When `showCreate` is true, render an inline form panel directly below the header:

| Field | Label | Placeholder | Required |
|-------|-------|-------------|----------|
| topic | Topic | "What's the idea?" | yes |
| angle | Angle | "What angle / framing?" | no |
| hook  | Hook seed | "Opening hook sentence..." | no |

Buttons: **Create** (disabled when `topic` empty or `creating`) / **Cancel**

On submit:
1. Set `creating = true`
2. Await `onCreateIdea(newTopic, newAngle, newHook)`
3. Reset form state, set `showCreate = false`, `creating = false`

### App.tsx

Add `onCreateIdea` handler passed to `<IdeasPool>`:
```ts
onCreateIdea={async (topic, angle, hook) => {
  await postJson('/api/create-idea', { project: slug, topic, angle, hook }, token)
  await refresh()
}}
```

### Styling (`dashboard/src/components/IdeasPool.css`)

New classes:
- `.ip-create-form` — panel below header: dark background (`#1f2937`), 1px border (`#374151`), border-radius 10, padding 16, margin-bottom 16
- `.ip-create-fields` — flex column, gap 10
- `.ip-create-input` — full-width input, same style as `.idea-reason`
- `.ip-create-actions` — flex row, gap 8, justify-content flex-end

---

## Data Flow

```
User clicks "+ New Idea"
  → showCreate = true → form renders
User fills topic [+ angle + hook] → clicks Create
  → POST /api/create-idea { project, topic, angle, hook }
  → server inserts issue (status: backlog) into Multica DB
  → response { ok: true, id }
  → App calls refresh() → GET /api/content?state=new-idea
  → new card appears in Ideas Pool grid
```

---

## Out of Scope

- Channel / agent assignment at creation time
- Editing or deleting manually created ideas (use promote/reject)
- Auth token requirement on the new endpoint
