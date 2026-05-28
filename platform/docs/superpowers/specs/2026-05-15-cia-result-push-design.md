# CIA Result Push — Design Spec

**Date:** 2026-05-15
**Status:** Approved

## Problem

CIA 分析跑在 Claude Code 本地 session（通过 CIA skill），`server/cia.js` 试图在生产服务器上 spawn Python 子进程——这条路不通，服务器没有 MCP 工具和外部 API 凭证。结果无法回到 dashboard。

`CIA_HUB_URL` 是数据拉取代理（hub_client.py → `/v1/fetch`），不是任务执行器。

## Solution: Push Model

CIA skill 完成合成后，主动 POST 结果到 gtm-swarm。结果持久化进 GTM DB，dashboard 通过现有 `GET /api/workspaces/[slug]` 读取。

## Data Flow

```
Claude Code (CIA skill)
  → synthesis 生成完毕
  → POST {GTM_SERVER_URL}/api/cia/result
       Authorization: Bearer {CIA_HUB_TOKEN}
       { slug, synthesis, analyzed_at }

gtm-swarm server
  → 验证 CIA_HUB_TOKEN
  → store.saveWorkspaceCIAResult(slug, synthesis)
  → 写入 workspaces.cia_result (JSONB)

Dashboard (Overview Tab)
  → GET /api/workspaces/[slug] 返回 cia_result
  → 有值时渲染 CIA Insights 卡片
  → 无值时不渲染
```

## Auth

复用 `CIA_HUB_TOKEN`（两端已有）。`POST /api/cia/result` 检查 `Authorization: Bearer <CIA_HUB_TOKEN>`，不匹配返回 401。

## API Contract

### POST /api/cia/result

**Request:**
```json
{
  "slug": "solvea",
  "synthesis": {
    "tagline": "string",
    "category": "string",
    "audience": { "primary": "string", "secondary": "string" },
    "positioning": "string",
    "competitors": ["string"],
    "suggested_channels": ["string"]
  },
  "analyzed_at": "2026-05-15T10:00:00Z"
}
```

**Responses:**
- `200 { "ok": true }` — 写入成功
- `401 { "error": "unauthorized" }` — token 错误或缺失
- `404 { "error": "workspace not found" }` — slug 不存在
- `400 { "error": "slug and synthesis required" }` — 参数缺失

### GET /api/workspaces/[slug] (updated)

在现有响应中新增 `cia_result` 字段：
```json
{
  "cia_result": {
    "tagline": "...",
    "analyzed_at": "2026-05-15T10:00:00Z",
    ...
  }
}
```
无 CIA 结果时 `cia_result: null`。

## Database

```sql
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS cia_result JSONB;
```

由 `server/bootstrap.js` 现有迁移机制执行。

## Files Changed

| 动作 | 路径 |
|------|------|
| 删除 | `server/cia.js` |
| 删除 | `app/api/cia/analyze/route.ts` |
| 删除 | `app/api/cia/status/[slug]/route.ts` |
| 新增 | `app/api/cia/result/route.ts` |
| 更新 | `server/store.js` — 加 `saveWorkspaceCIAResult(slug, result)` 和 `cia_result` 字段 |
| 更新 | `server/bootstrap.js` — 加 JSONB 列迁移 |
| 更新 | `app/api/workspaces/[slug]/route.ts` — 返回 `cia_result` |
| 更新 | `app/dashboard/[slug]/page.tsx` — Overview Tab 渲染 CIA Insights |

## CIA Skill Change

合成完成后，Claude Code 在对话中直接执行推送（不改 cli.py）：

```python
# 若 GTM_SERVER_URL 已配置，推送结果
gtm_url = os.environ.get("GTM_SERVER_URL", "")
cia_token = os.environ.get("CIA_HUB_TOKEN", "")
if gtm_url and cia_token:
    resp = requests.post(
        f"{gtm_url.rstrip('/')}/api/cia/result",
        headers={"Authorization": f"Bearer {cia_token}",
                 "Content-Type": "application/json"},
        json={"slug": slug, "synthesis": synthesis, "analyzed_at": datetime.utcnow().isoformat() + "Z"},
        timeout=10,
    )
    if resp.ok:
        print(f"✓ CIA result pushed to gtm-swarm ({slug})")
    else:
        print(f"⚠ Push failed: {resp.status_code} {resp.text}")
```

CIA skill 需要新增两个环境变量（在 CIA skill 的 config 中配置，不是 gtm-swarm）：
- `GTM_SERVER_URL` — gtm-swarm 的公网地址，例如 `https://gtm.yourdomain.com`
- `CIA_HUB_TOKEN` — 已有

## Dashboard UI

在 Overview Tab 的 `AgentChannelCard` 板块**上方**新增 CIA Insights 折叠卡：

```
┌─ CIA INSIGHTS ─────────────────────────────────────┐
│ 分析于 2026-05-15                                   │
│                                                      │
│ Tagline   One sharp sentence about the product       │
│ Category  B2B SaaS                                  │
│ Audience  Primary: ... / Secondary: ...             │
│ Positioning  What makes it different                │
│ Competitors  A · B · C · D                         │
│ Channels  reddit · x · blog                         │
└──────────────────────────────────────────────────────┘
```

无结果时整个板块不渲染（不显示"暂无数据"占位）。

## Out of Scope

- CIA skill 的完整执行流程（MCP 工具调用、DataForSEO、Ahrefs 等）
- CIA Hub 的任何改动
- 前端触发 CIA 分析的 UI（删掉旧的触发按钮即可）
