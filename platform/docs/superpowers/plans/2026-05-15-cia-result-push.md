# CIA Result Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CIA skill が合成完了後に gtm-swarm へ結果を POST し、Dashboard の Overview Tab に表示する。

**Architecture:** CIA skill（Claude Code ローカル）→ `POST /api/cia/result`（CIA_HUB_TOKEN 認証）→ GTM DB の `workspaces.cia_result` JSONB カラム → `GET /api/workspaces/[slug]` 経由で Dashboard に表示。

**Tech Stack:** Next.js 15 API routes (TypeScript), PostgreSQL (node-postgres), React

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Delete | `server/cia.js` | 壊れた Python spawn コード — 完全削除 |
| Delete | `app/api/cia/analyze/route.ts` | 旧 CIA トリガー route |
| Delete | `app/api/cia/status/[slug]/route.ts` | 旧 CIA ポーリング route |
| Modify | `migrations/001-initial.sql` | `cia_result JSONB` カラム追加（冪等） |
| Modify | `server/store.js` | `saveWorkspaceCIAResult()` 追加、`getWorkspace` は既存のまま（DB が列を返すので自動） |
| Create | `app/api/cia/result/route.ts` | POST エンドポイント — 認証・バリデーション・DB 書き込み |
| Modify | `app/api/workspaces/[slug]/route.ts` | `cia_result` を返すのは自動（`SELECT *` で取れる） — 型だけ確認 |
| Modify | `app/dashboard/[slug]/page.tsx` | CIA Insights カード — `wsData.cia_result` があるときだけ表示 |
| Modify | `~/.claude/skills/cia/SKILL.md` | 合成後に gtm-swarm へ push する手順を追加 |

---

### Task 1: 壊れた CIA ファイルを削除

**Files:**
- Delete: `server/cia.js`
- Delete: `app/api/cia/analyze/route.ts`
- Delete: `app/api/cia/status/[slug]/route.ts`

- [ ] **Step 1: ファイルを削除**

```bash
rm server/cia.js
rm app/api/cia/analyze/route.ts
rm "app/api/cia/status/[slug]/route.ts"
```

- [ ] **Step 2: `app/api/workspaces/route.ts` で cia.js を import していないか確認し、あれば削除**

```bash
grep -n "cia" app/api/workspaces/route.ts
```

もし `runCIAAnalysis` などの import があれば、その行を削除する。

- [ ] **Step 3: ビルドエラーがないか確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし（CIA 関連の import が残っていれば "Cannot find module" が出るので修正する）

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove broken CIA local-spawn code"
```

---

### Task 2: DB Migration — cia_result カラム追加

**Files:**
- Modify: `migrations/001-initial.sql`

- [ ] **Step 1: `migrations/001-initial.sql` の末尾に追記**

ファイルの最後の行（最後の `CREATE INDEX` の後）に追加：

```sql
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS cia_result JSONB;
```

- [ ] **Step 2: ローカル DB に適用（GTM_DATABASE が設定されている場合）**

```bash
psql $GTM_DATABASE -c "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS cia_result JSONB;"
```

Expected: `ALTER TABLE` — すでに存在する場合は `NOTICE: column "cia_result" of relation "workspaces" already exists, skipping.`

- [ ] **Step 3: カラムが存在することを確認**

```bash
psql $GTM_DATABASE -c "\d workspaces" | grep cia_result
```

Expected: `cia_result | jsonb |`

- [ ] **Step 4: Commit**

```bash
git add migrations/001-initial.sql
git commit -m "feat: add cia_result JSONB column to workspaces"
```

---

### Task 3: store.js — saveWorkspaceCIAResult 追加

**Files:**
- Modify: `server/store.js`

- [ ] **Step 1: `server/store.js` の `updateWorkspace` 関数の直後に追加**

```js
export async function saveWorkspaceCIAResult(slug, synthesis) {
  return queryOne(
    `UPDATE workspaces SET cia_result = $1, updated_at = now() WHERE slug = $2 RETURNING *`,
    [JSON.stringify(synthesis), slug]
  )
}
```

- [ ] **Step 2: 関数が export されていることを確認**

```bash
grep -n "saveWorkspaceCIAResult" server/store.js
```

Expected: `export async function saveWorkspaceCIAResult`

- [ ] **Step 3: Commit**

```bash
git add server/store.js
git commit -m "feat: add saveWorkspaceCIAResult to store"
```

---

### Task 4: POST /api/cia/result エンドポイント作成

**Files:**
- Create: `app/api/cia/result/route.ts`

- [ ] **Step 1: ディレクトリを作成**

```bash
mkdir -p app/api/cia/result
```

- [ ] **Step 2: `app/api/cia/result/route.ts` を作成**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { hasDB } from '@/server/db.js'
import { getWorkspace, saveWorkspaceCIAResult } from '@/server/store.js'

export async function POST(request: NextRequest) {
  // Auth
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!process.env.CIA_HUB_TOKEN || token !== process.env.CIA_HUB_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!hasDB()) return NextResponse.json({ error: 'GTM_DATABASE required' }, { status: 503 })

  const body = await request.json().catch(() => null)
  if (!body?.slug || !body?.synthesis) {
    return NextResponse.json({ error: 'slug and synthesis required' }, { status: 400 })
  }

  const ws = await getWorkspace(body.slug)
  if (!ws) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

  const result = {
    ...body.synthesis,
    analyzed_at: body.analyzed_at || new Date().toISOString(),
  }
  await saveWorkspaceCIAResult(body.slug, result)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: TypeScript エラーがないか確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 4: curl で動作確認（ローカルサーバーが起動している場合）**

まず token なしで 401 になることを確認：
```bash
curl -s -X POST http://localhost:3000/api/cia/result \
  -H "Content-Type: application/json" \
  -d '{"slug":"test","synthesis":{}}' | jq .
```
Expected: `{"error":"unauthorized"}`

正しい token で存在しない slug に 404 になることを確認：
```bash
curl -s -X POST http://localhost:3000/api/cia/result \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CIA_HUB_TOKEN" \
  -d '{"slug":"nonexistent","synthesis":{"tagline":"test"}}' | jq .
```
Expected: `{"error":"workspace not found"}`

実在する slug で 200 になることを確認（slug は実際の workspace slug に置き換える）：
```bash
curl -s -X POST http://localhost:3000/api/cia/result \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CIA_HUB_TOKEN" \
  -d '{
    "slug": "gtm",
    "synthesis": {
      "tagline": "Test tagline",
      "category": "B2B SaaS",
      "audience": {"primary": "Founders", "secondary": "Marketers"},
      "positioning": "Test positioning",
      "competitors": ["CompA", "CompB"],
      "suggested_channels": ["reddit", "x"]
    }
  }' | jq .
```
Expected: `{"ok":true}`

DB に保存されたことを確認：
```bash
psql $GTM_DATABASE -c "SELECT slug, cia_result->>'tagline' AS tagline FROM workspaces WHERE slug='gtm';"
```
Expected: `tagline` 列に `Test tagline`

- [ ] **Step 5: Commit**

```bash
git add app/api/cia/result/route.ts
git commit -m "feat: POST /api/cia/result endpoint with CIA_HUB_TOKEN auth"
```

---

### Task 5: Dashboard — CIA Insights カード

**Files:**
- Modify: `app/dashboard/[slug]/page.tsx`

- [ ] **Step 1: `AgentRow` 型の直前に `CIAResult` 型を追加**

`app/dashboard/[slug]/page.tsx` の `type AgentRow` の前に挿入：

```typescript
type CIAResult = {
  tagline?: string
  category?: string
  audience?: { primary?: string; secondary?: string }
  positioning?: string
  competitors?: string[]
  suggested_channels?: string[]
  analyzed_at?: string
}
```

- [ ] **Step 2: `wsData` の state 型に `cia_result` を追加**

```typescript
  const [wsData, setWsData] = useState<{
    lifecycle_state?: string
    agents?: AgentRow[]
    cia_result?: CIAResult | null
  } | null>(null)
```

- [ ] **Step 3: Overview Tab の JSX に CIA Insights カードを追加**

`AgentChannelCard` の板块（`wsData?.agents && ...` の div）の**上**に挿入：

```typescript
          {wsData?.cia_result && (
            <div style={{ padding: '0 24px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.96px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 12 }}>
                CIA Insights
                {wsData.cia_result.analyzed_at && (
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
                    · 分析于 {wsData.cia_result.analyzed_at.slice(0, 10)}
                  </span>
                )}
              </div>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, boxShadow: 'var(--shadow-sm)', display: 'grid', gap: 8 }}>
                {wsData.cia_result.tagline && (
                  <div style={{ fontSize: 14, color: 'var(--ink)', fontStyle: 'italic' }}>"{wsData.cia_result.tagline}"</div>
                )}
                {wsData.cia_result.category && (
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                    <span style={{ color: 'var(--text-faint)' }}>Category </span>{wsData.cia_result.category}
                  </div>
                )}
                {wsData.cia_result.positioning && (
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                    <span style={{ color: 'var(--text-faint)' }}>Positioning </span>{wsData.cia_result.positioning}
                  </div>
                )}
                {wsData.cia_result.audience?.primary && (
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                    <span style={{ color: 'var(--text-faint)' }}>Audience </span>
                    {wsData.cia_result.audience.primary}
                    {wsData.cia_result.audience.secondary && ` · ${wsData.cia_result.audience.secondary}`}
                  </div>
                )}
                {wsData.cia_result.competitors && wsData.cia_result.competitors.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                    <span style={{ color: 'var(--text-faint)' }}>Competitors </span>
                    {wsData.cia_result.competitors.join(' · ')}
                  </div>
                )}
                {wsData.cia_result.suggested_channels && wsData.cia_result.suggested_channels.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                    <span style={{ color: 'var(--text-faint)' }}>Channels </span>
                    {wsData.cia_result.suggested_channels.join(' · ')}
                  </div>
                )}
              </div>
            </div>
          )}
```

- [ ] **Step 4: TypeScript エラーがないか確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 5: ブラウザで確認**

Task 4 の curl で `gtm` workspace に CIA result を書き込み済みであれば、`http://localhost:3000/dashboard/gtm` の Overview Tab に CIA Insights カードが表示される。

- [ ] **Step 6: Commit**

```bash
git add "app/dashboard/[slug]/page.tsx"
git commit -m "feat: CIA Insights card in Overview Tab"
```

---

### Task 6: CIA Skill に push ステップを追加

**Files:**
- Modify: `~/.claude/skills/cia/SKILL.md`

- [ ] **Step 1: `~/.claude/skills/cia/SKILL.md` の「### Step 11：LLM 写解读 → 导出」セクションの末尾に追記**

「Step 11」の手順（export コマンドの後）に以下を追加：

````markdown
### Step 12：結果を gtm-swarm へ Push（GTM_SERVER_URL が設定されている場合）

合成完了後、以下の Python を Claude Code から実行して結果を gtm-swarm へ送信する：

```python
import os, json, requests, sqlite3, pathlib

# slug は分析対象 workspace の slug（例: "solvea"）
slug = "<WORKSPACE_SLUG>"
gtm_url = os.environ.get("GTM_SERVER_URL", "").rstrip("/")
cia_token = os.environ.get("CIA_HUB_TOKEN", "")

if not gtm_url:
    print("GTM_SERVER_URL not set — skipping push")
else:
    # synthesis は Step 11 で生成した JSON 構造から構築
    synthesis = {
        "tagline": "<tagline>",
        "category": "<category>",
        "audience": {"primary": "<primary>", "secondary": "<secondary>"},
        "positioning": "<positioning>",
        "competitors": ["<comp1>", "<comp2>"],
        "suggested_channels": ["reddit", "x", "blog"],
    }
    resp = requests.post(
        f"{gtm_url}/api/cia/result",
        headers={"Authorization": f"Bearer {cia_token}", "Content-Type": "application/json"},
        json={"slug": slug, "synthesis": synthesis},
        timeout=10,
    )
    if resp.ok:
        print(f"✓ CIA result pushed to gtm-swarm ({slug})")
    else:
        print(f"⚠ Push failed: {resp.status_code} {resp.text}")
```

**必要な環境変数（CIA skill 側）：**
- `GTM_SERVER_URL` — gtm-swarm の公開 URL（例: `https://gtm.yourdomain.com`）
- `CIA_HUB_TOKEN` — 既存（CIA Hub 認証と共用）
````

- [ ] **Step 2: 環境変数の確認**

`~/.claude/settings.json` の `env` セクションに `GTM_SERVER_URL` を追加（まだなければ）：

```json
{
  "env": {
    "CIA_HUB_TOKEN": "...",
    "GTM_SERVER_URL": "https://your-gtm-server.com"
  }
}
```

- [ ] **Step 3: Push が機能することを確認（本番 URL に対して）**

```bash
curl -s -X POST https://your-gtm-server.com/api/cia/result \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CIA_HUB_TOKEN" \
  -d '{
    "slug": "gtm",
    "synthesis": {
      "tagline": "smoke test",
      "category": "Test",
      "audience": {"primary": "Test", "secondary": ""},
      "positioning": "test",
      "competitors": [],
      "suggested_channels": []
    }
  }' | jq .
```

Expected: `{"ok":true}`

---

### Task 7: 最終確認 & push

- [ ] **Step 1: ビルドが通ることを確認**

```bash
npm run build
```

Expected: `✓ Compiled successfully`

- [ ] **Step 2: 旧 CIA ファイルが残っていないことを確認**

```bash
ls server/cia.js app/api/cia/analyze/ "app/api/cia/status/" 2>&1
```

Expected: `No such file or directory` × 3

- [ ] **Step 3: git push**

```bash
git push
```
