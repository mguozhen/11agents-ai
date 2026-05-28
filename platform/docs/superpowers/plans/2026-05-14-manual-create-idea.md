# Manual Idea Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "+ New Idea" button to the Ideas Pool header that expands an inline form, letting users create ideas (topic + angle + hook) directly from the dashboard.

**Architecture:** New `POST /api/create-idea` endpoint in `server/api.js` inserts a Multica DB issue with `backlog` status (which maps to `new-idea` state). The `IdeasPool` component gains a new `onCreateIdea` prop and an inline form controlled by local state. `App.tsx` wires the handler.

**Tech Stack:** Node.js/Express (server), React + TypeScript (dashboard), `pg` via `multica-db.js` helper functions.

---

## File Map

| File | Change |
|------|--------|
| `server/api.js` | Add `POST /api/create-idea` after the `reject-idea` route |
| `dashboard/src/components/IdeasPool.tsx` | Add `onCreateIdea` prop + form state + inline form UI |
| `dashboard/src/components/IdeasPool.css` | Add form panel styles |
| `dashboard/src/App.tsx` | Pass `onCreateIdea` handler to `<IdeasPool>` |

---

### Task 1: Backend — POST /api/create-idea

**Files:**
- Modify: `server/api.js` (after the `reject-idea` route, around line 393)

- [ ] **Step 1: Add the endpoint**

In `server/api.js`, locate the line `r.post('/source-ideas', ...)` (around line 395). Insert the following block **before** it:

```js
r.post('/create-idea', async (req, res) => {
  const { project, topic, angle, hook } = req.body || {}
  if (!project || !topic) return res.status(400).json({ error: 'project and topic are required' })
  if (!hasMultica()) return res.status(503).json({ error: 'No database configured' })
  try {
    const { getWorkspaceBySlug, getOrCreateGTMUser, createIssue } = await import('./multica-db.js')
    const ws = await getWorkspaceBySlug(project)
    if (!ws) return res.status(404).json({ error: `workspace "${project}" not found` })
    const creatorId = await getOrCreateGTMUser()
    const parts = []
    if (angle) parts.push(`**Angle**: ${angle}`)
    if (hook) parts.push(`**Hook seed**: ${hook}`)
    const description = parts.join('\n\n')
    const id = await createIssue(ws.id, { title: topic, description, status: 'backlog', creatorId })
    res.json({ ok: true, id })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})
```

Note: `hasMultica` is already imported at the top of `api.js` — confirm with `grep hasMultica server/api.js`.

- [ ] **Step 2: Verify endpoint exists**

Run the dev server (or use an existing instance) and test with curl:

```bash
curl -s -X POST http://localhost:3000/api/create-idea \
  -H 'Content-Type: application/json' \
  -d '{"project":"voc-ai","topic":"Test idea from curl","angle":"test angle","hook":"test hook"}' | jq .
```

Expected output: `{ "ok": true, "id": "<uuid>" }`

If database is not configured: `{ "error": "No database configured" }` — that's also correct, endpoint is wired.

- [ ] **Step 3: Commit**

```bash
git add server/api.js
git commit -m "feat(api): add POST /api/create-idea endpoint"
```

---

### Task 2: CSS — form panel styles

**Files:**
- Modify: `dashboard/src/components/IdeasPool.css`

- [ ] **Step 1: Add styles at the end of IdeasPool.css**

Append to `dashboard/src/components/IdeasPool.css`:

```css
/* Manual create form */
.ip-new-btn {
  margin-left: auto;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  transition: all 0.15s;
}
.ip-new-btn:hover {
  border-color: var(--pink);
  color: var(--pink);
}

.ip-create-form {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ip-create-input {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--text);
  font-family: inherit;
}
.ip-create-input:focus {
  outline: none;
  border-color: var(--pink);
}
.ip-create-input::placeholder { color: var(--text-sub); }

.ip-create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/IdeasPool.css
git commit -m "feat(ui): add IdeasPool create-form styles"
```

---

### Task 3: IdeasPool component — inline form

**Files:**
- Modify: `dashboard/src/components/IdeasPool.tsx`

- [ ] **Step 1: Update props interface and add form state**

Replace the props type block at the top of `IdeasPool.tsx`:

```ts
export function IdeasPool({
  items,
  onPromote,
  onReject,
  onCreateIdea,
}: {
  items: ContentItem[]
  onPromote: (item: ContentItem) => Promise<void> | void
  onReject: (item: ContentItem, reason: string) => Promise<void> | void
  onCreateIdea: (topic: string, angle: string, hook: string) => Promise<void>
}) {
```

Then add these state declarations directly after the existing `useState` calls (after `const [reason, setReason] = useState('')`):

```ts
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [newAngle, setNewAngle] = useState('')
  const [newHook, setNewHook] = useState('')
```

- [ ] **Step 2: Update the header to include the button and form**

Locate the `<div className="ip-header">` block in the component. Replace it entirely:

```tsx
      <div className="ip-header">
        <h3>💡 Ideas Pool · {items.length} fresh</h3>
        <span className="ip-hint">Promote → triggers runner with this topic · Reject → writes anti-pattern</span>
        <button className="ip-new-btn" onClick={() => setShowCreate(v => !v)}>
          {showCreate ? '✕ Cancel' : '+ New Idea'}
        </button>
      </div>
      {showCreate && (
        <div className="ip-create-form">
          <input
            autoFocus
            className="ip-create-input"
            placeholder="Topic — what's the idea? (required)"
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
          />
          <input
            className="ip-create-input"
            placeholder="Angle — framing or perspective (optional)"
            value={newAngle}
            onChange={e => setNewAngle(e.target.value)}
          />
          <input
            className="ip-create-input"
            placeholder="Hook seed — opening sentence (optional)"
            value={newHook}
            onChange={e => setNewHook(e.target.value)}
          />
          <div className="ip-create-actions">
            <button
              className="btn-ip btn-ip-cancel"
              onClick={() => { setShowCreate(false); setNewTopic(''); setNewAngle(''); setNewHook('') }}
            >Cancel</button>
            <button
              className="btn-ip btn-ip-promote"
              disabled={!newTopic.trim() || creating}
              onClick={async () => {
                setCreating(true)
                await onCreateIdea(newTopic.trim(), newAngle.trim(), newHook.trim())
                setCreating(false)
                setShowCreate(false)
                setNewTopic(''); setNewAngle(''); setNewHook('')
              }}
            >{creating ? '⟳ Creating…' : '✓ Create'}</button>
          </div>
        </div>
      )}
```

**Important:** The empty-state branch also returns early before reaching the header. The form should only be on the non-empty path. To handle the empty state, also add a `+ New Idea` button to the empty state block. Replace the existing empty-state `return`:

```tsx
  if (items.length === 0) {
    return (
      <div>
        <div className="ip-header" style={{ marginBottom: 16 }}>
          <h3>💡 Ideas Pool</h3>
          <button className="ip-new-btn" onClick={() => setShowCreate(v => !v)}>
            {showCreate ? '✕ Cancel' : '+ New Idea'}
          </button>
        </div>
        {showCreate && (
          <div className="ip-create-form">
            <input
              autoFocus
              className="ip-create-input"
              placeholder="Topic — what's the idea? (required)"
              value={newTopic}
              onChange={e => setNewTopic(e.target.value)}
            />
            <input
              className="ip-create-input"
              placeholder="Angle — framing or perspective (optional)"
              value={newAngle}
              onChange={e => setNewAngle(e.target.value)}
            />
            <input
              className="ip-create-input"
              placeholder="Hook seed — opening sentence (optional)"
              value={newHook}
              onChange={e => setNewHook(e.target.value)}
            />
            <div className="ip-create-actions">
              <button
                className="btn-ip btn-ip-cancel"
                onClick={() => { setShowCreate(false); setNewTopic(''); setNewAngle(''); setNewHook('') }}
              >Cancel</button>
              <button
                className="btn-ip btn-ip-promote"
                disabled={!newTopic.trim() || creating}
                onClick={async () => {
                  setCreating(true)
                  await onCreateIdea(newTopic.trim(), newAngle.trim(), newHook.trim())
                  setCreating(false)
                  setShowCreate(false)
                  setNewTopic(''); setNewAngle(''); setNewHook('')
                }}
              >{creating ? '⟳ Creating…' : '✓ Create'}</button>
            </div>
          </div>
        )}
        <div className="ip-empty">
          <div className="ip-empty-icon">💡</div>
          <h3>Ideas Pool is empty</h3>
          <p>Run <code>scripts/source-ideas.py --project &lt;slug&gt;</code> or wait for the daily cron at 08:00 UTC.</p>
        </div>
      </div>
    )
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/boyuangao/skills/gtm-swarm/dashboard && pnpm tsc --noEmit
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/IdeasPool.tsx
git commit -m "feat(ui): add inline create-idea form to IdeasPool"
```

---

### Task 4: App.tsx — wire onCreateIdea handler

**Files:**
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Add onCreateIdea to the IdeasPool usage**

Locate the `<IdeasPool` block (around line 199) in `App.tsx`. Add the `onCreateIdea` prop:

```tsx
        <IdeasPool
          items={items.filter(i => i.state === 'new-idea')}
          onPromote={async item => {
            const r = await postJson<{ ok?: boolean; topic?: string; error?: string }>('/api/promote-idea', { project: item.project, agent: item.agent, idea_id: item.id }, token)
            if (r.ok) alert('✓ Drafted: ' + (r.topic || '').slice(0, 60))
            else alert('Promote failed: ' + (r.error || 'unknown') + (String(r.error || '').includes('401') ? ' — click 🔒 Sign in (top bar).' : ''))
            refresh()
          }}
          onReject={async (item, reason) => {
            await postJson('/api/reject-idea', { project: item.project, agent: item.agent, idea_id: item.id, reason }, token)
            refresh()
          }}
          onCreateIdea={async (topic, angle, hook) => {
            const r = await postJson<{ ok?: boolean; error?: string }>('/api/create-idea', { project: slug, topic, angle, hook })
            if (!r.ok) alert('Failed to create idea: ' + (r.error || 'unknown'))
            refresh()
          }}
        />
```

Note: `postJson` is called without a token (public endpoint). Its signature is `postJson(url, body, token?)` — omitting the third arg is valid.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/boyuangao/skills/gtm-swarm/dashboard && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/App.tsx
git commit -m "feat: wire onCreateIdea handler in App"
```

---

### Task 5: End-to-end smoke test

- [ ] **Step 1: Start dev server**

```bash
cd /Users/boyuangao/skills/gtm-swarm && npm start &
cd dashboard && pnpm dev
```

- [ ] **Step 2: Open dashboard and navigate to Ideas tab**

Open `http://localhost:5173` (or wherever Vite runs). Select a project and click the **Ideas** tab.

- [ ] **Step 3: Test create flow**

1. Click `+ New Idea` in the header — form should expand
2. Leave topic blank — **Create** button should be disabled
3. Fill in topic "Smoke test idea", add angle and hook
4. Click **Create** — button shows "⟳ Creating…"
5. Form closes, Ideas Pool refreshes — new card should appear with the topic

- [ ] **Step 4: Test cancel flow**

Click `+ New Idea` → fill a field → click **Cancel** — form closes, field cleared

- [ ] **Step 5: Test empty state**

If pool is empty, the `+ New Idea` button should still be visible in the empty state header and work identically.

- [ ] **Step 6: Final commit (if any fixups needed)**

```bash
git add -p
git commit -m "fix: <describe any fixups>"
```
