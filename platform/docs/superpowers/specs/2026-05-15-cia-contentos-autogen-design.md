# CIA → ContentOS 自动生成策略文档 — Design Spec

**Date:** 2026-05-15
**Status:** Approved

## Problem

CIA 调研产出的 `synthesis.md` 包含真实量化数据（赛道 TAM 排行、PLG 矩阵、TikTok share_rate、Reddit 痛点、App Store 蓝海词、竞品 review 数对比）。这些数据是 ContentOS 4 步策略文档的核心素材——没有它们，LLM 只能凭感觉编写，无法求真找到真实业务机会。

当前问题：
- CIA 结果推回 DB 后（`cia_result`），ContentOS 的 4 个步骤仍需手动触发
- `buildPrompt` 只注入轻量摘要（tagline/competitors），缺少真实数量数据
- Python 和 JS 两条生成路径都没利用 DB 里的 CIA 数据

## Solution

**CIA 推送时自动生成缺失的策略文档，同时把完整 synthesis.md 注入 prompt。**

- CIA skill 推送时带上 `synthesis_md`（完整 markdown 报告）
- `POST /api/cia/result` 保存后：异步触发缺失步骤生成 + 把 synthesis.md 写到文件系统供 Python 路径使用
- `buildPrompt` 注入完整 synthesis.md，禁止 LLM 编造数字
- Regenerate 按钮（Wizard + Dashboard）允许用最新 CIA 数据重跑任意步骤

## Data Flow

```
CIA skill (Claude Code)
  → POST /api/cia/result
    { slug, synthesis: { ...structured, synthesis_md: "# 一、赛道全景..." }, analyzed_at }

POST /api/cia/result handler:
  1. 保存 cia_result（含 synthesis_md）到 workspaces.cia_result JSONB（已实现）
  2. 写 synthesis_md 到 projects/<slug>/cia/synthesis.md（Python 路径用）
  3. setImmediate → runMissingContentOSSteps(slug)（后台，不阻塞响应）
  → 立刻返回 { ok: true }

runMissingContentOSSteps(slug):
  for step n in [1, 2, 3, 4]:
    if strategy_docs 表中 step_key 不存在:
      await runContentOSStep(slug, n)   ← 已有函数，读 cia_result 注入
  
Regenerate 按钮:
  POST /api/contentos/[slug]/run-with-cia?step=N
  → 强制重跑，不管是否已有 → 调 runContentOSStep(slug, n)
  → 返回 { ok: true, step, size }
```

## CIA Data in Prompt

`buildPrompt` 修改：接受可选 `ciaResult` 参数（从 DB 读取的 `workspaces.cia_result`）。

**注入规则：**
- `ciaResult.synthesis_md` 存在时：注入完整 markdown（全 4 步都注入，不限于 Step 1+2）
- `ciaResult.synthesis_md` 不存在但有结构化字段时：降级注入轻量摘要
- 两者都没有时：不注入（保持原有行为）

**注入内容（synthesis_md 完整报告，包含）：**
- 赛道全景表（按 `total_reviews × PLG 得分` 排序的真实 TAM 数据）
- Top 7 赛道详细卡片（含 TikTok share_rate、App Store SV、竞品 review 数）
- PLG 全赛道矩阵（TTV / setup_cost / viral_loop / sales_dep）
- 传播侧跨赛道洞察（Reddit 高分痛点帖、TikTok 爆款结构）
- 对用户假设的批判性评估

**Prompt 注入格式：**
```
## 🕵️ CIA 市场情报（真实数据 — Ahrefs/DataForSEO/TikTok/Reddit/iTunes）

**核心原则：禁止编造数字。以下是 CIA pipeline 实测数据。**
**Step 1-4 的 TAM/竞品格局/渠道判断必须从此数据引用，不得凭感觉估算。**

<synthesis_md 全文>
```

## Files Changed

| 动作 | 路径 | 内容 |
|------|------|------|
| 修改 | `server/contentos.js` | `buildPrompt` 加 `ciaResult?` 参数；`runContentOSStep` 从 DB 读 `cia_result`；新增 `runMissingContentOSSteps` |
| 修改 | `app/api/cia/result/route.ts` | 写 synthesis.md 到文件系统 + 触发后台生成 |
| 新增 | `app/api/contentos/[slug]/run-with-cia/route.ts` | Regenerate 接口 |
| 修改 | `app/wizard/[slug]/page.tsx` | 已完成步骤加"🔄 重新生成"按钮 |
| 修改 | `_components/ProjectOverview.tsx` | brief-card 已完成时加"🔄"按钮 |
| 修改 | `~/.claude/skills/cia/SKILL.md` | Step 12 push 脚本加入 `synthesis_md` 字段 |

## API Contracts

### POST /api/cia/result（更新）

新增可选字段 `synthesis_md`：
```json
{
  "slug": "solvea",
  "synthesis": {
    "tagline": "...",
    "category": "...",
    "audience": { "primary": "...", "secondary": "..." },
    "positioning": "...",
    "competitors": ["A", "B"],
    "suggested_channels": ["reddit", "x"],
    "synthesis_md": "# 一、赛道全景\n\n| # | Cluster | ..."
  },
  "analyzed_at": "2026-05-15T10:00:00Z"
}
```

### POST /api/contentos/[slug]/run-with-cia?step=N（新增）

- 无需 auth（与现有 run-step 保持一致）
- 强制重跑，不检查是否已存在
- 响应：`200 { ok: true, step: N, size: 12345 }` 或 `500 { error: "..." }`

## server/contentos.js 函数签名

```js
// 修改：加 ciaResult 可选参数
export function buildPrompt(stepIdx, projectDir, projectYaml, ciaResult = null)

// 修改：自动从 DB 读 cia_result，传给 buildPrompt
export async function runContentOSStep(slug, n)

// 新增：后台批量生成缺失步骤
export async function runMissingContentOSSteps(slug)
```

`runMissingContentOSSteps` 内部逻辑：
```js
async function runMissingContentOSSteps(slug) {
  const ws = await store.getWorkspace(slug)
  if (!ws) return
  for (const step of [1, 2, 3, 4]) {
    const key = STEPS[step - 1].slug
    const existing = await store.getStrategyDoc(ws.id, key)
    if (!existing) {
      await runContentOSStep(slug, step)   // cia_result 在函数内从 DB 读
    }
  }
}
```

## UI — Regenerate 按钮

**Wizard 页面**（`app/wizard/[slug]/page.tsx`）：

步骤已完成时（`state[stepKey]?.status === 'done'`），在步骤标题行右侧加小按钮：
```
[✓ Step 1: Market Insight]  [🔄 重新生成]
```
点击 → `POST /api/contentos/${slug}/run-with-cia?step=${n}` → 显示加载状态 → 完成后 `loadStep(n)` 刷新内容

**Dashboard Overview**（`_components/ProjectOverview.tsx`）：

`brief-card.is-done` 展开头部右侧加图标按钮：
```
[✓  Step 1: Market Insight  12.3 KB · click to expand]  [🔄]
```
点击 → 同上接口 → 完成后刷新 briefs 数据

## CIA Skill Step 12 更新

在 `~/.claude/skills/cia/SKILL.md` Step 12 的 Python 脚本中，`synthesis` 字段加入 `synthesis_md`：

```python
# 读取 synthesis.md 全文
from pathlib import Path
reports_base = Path.home() / "workspace/analytics/reports"
topic_slug = topic.lower().replace(" ", "-").strip("-")
dirs = sorted([d for d in reports_base.iterdir() 
               if d.name.endswith(f"-cia-{topic_slug}")], reverse=True)
synthesis_md = ""
if dirs:
    f = dirs[0] / "synthesis.md"
    if f.exists():
        synthesis_md = f.read_text()

synthesis = {
    "tagline": "<tagline>",
    ...
    "synthesis_md": synthesis_md,  # 完整报告，含真实 TAM/PLG/TikTok/Reddit 数据
}
```

## Error Handling

- `runMissingContentOSSteps` 中单步失败不影响后续步骤（try/catch per step，log error）
- synthesis.md 文件写入失败不影响 DB 保存和后台生成（try/catch，warn log）
- `run-with-cia` 接口同步等待，失败返回 500（用户在 UI 看到错误提示）

## Out of Scope

- 修改 Python `contentos-agent.py`（Python 路径通过文件系统 synthesis.md 受益，不改代码）
- 生成进度实时推送（后台异步，刷新页面查看结果）
- 多 workspace 并发生成的锁机制
