# CIA → ContentOS Auto-Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CIA 调研结果推送后自动生成缺失的 4 步策略文档，并把完整 synthesis.md 数据注入 prompt，同时在 Wizard 和 Dashboard 提供 Regenerate 按钮。

**Architecture:** `POST /api/cia/result` 保存后触发 `setImmediate → runMissingContentOSSteps(slug)`，后者从 DB 读 `cia_result.synthesis_md` 注入 `buildPrompt`，跳过已存在的步骤。Regenerate 按钮调新接口 `POST /api/contentos/[slug]/run-with-cia?step=N` 强制重跑。

**Tech Stack:** Node.js ESM, Next.js 15 API routes (TypeScript), PostgreSQL (node-postgres), React

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `server/contentos.js` | 加 `formatCiaForPrompt`；`buildPrompt` 接受 `ciaResult`；`runContentOSStep` 从 DB 读 `cia_result`；新增 `runMissingContentOSSteps` |
| Modify | `app/api/cia/result/route.ts` | 写 synthesis.md 到文件系统 + `setImmediate` 触发后台生成 |
| Create | `app/api/contentos/[slug]/run-with-cia/route.ts` | Regenerate 接口，强制重跑指定步骤 |
| Modify | `_hooks/useStrategy.ts` | `useProjectMeta` 接受 `refreshKey` 参数 |
| Modify | `_components/ProjectOverview.tsx` | brief-card 加 🔄 Regenerate 按钮 |
| Modify | `app/wizard/[slug]/page.tsx` | step-toolbar 加"🔄 重新生成"按钮 |
| Modify | `~/.claude/skills/cia/SKILL.md` | Step 12 push 脚本加 `synthesis_md` 字段 |

---

### Task 1: server/contentos.js — CIA 数据注入 + runMissingContentOSSteps

**Files:**
- Modify: `server/contentos.js`

背景：`buildPrompt` 目前只在 Steps 1-2 注入文件系统 CIA 数据。需要改成接受 DB 里的 `cia_result`（含 `synthesis_md`），并注入所有 4 步。`runContentOSStep` 需要从 DB 读 `cia_result`。新增 `runMissingContentOSSteps` 供后台触发。

- [ ] **Step 1: 在 `readCiaData` 函数前加 `formatCiaForPrompt` 函数**

在 `server/contentos.js` 文件，`readCiaData` 函数定义之前插入：

```js
function formatCiaForPrompt(ciaResult) {
  if (!ciaResult) return null
  if (ciaResult.synthesis_md) return ciaResult.synthesis_md
  // 降级：只有轻量结构化字段时
  const lines = []
  if (ciaResult.tagline) lines.push(`**定位：** ${ciaResult.tagline}`)
  if (ciaResult.category) lines.push(`**品类：** ${ciaResult.category}`)
  if (ciaResult.audience?.primary) {
    const sec = ciaResult.audience.secondary ? ` · ${ciaResult.audience.secondary}` : ''
    lines.push(`**核心受众：** ${ciaResult.audience.primary}${sec}`)
  }
  if (ciaResult.positioning) lines.push(`**差异化：** ${ciaResult.positioning}`)
  if (ciaResult.competitors?.length) lines.push(`**主要竞品：** ${ciaResult.competitors.join(' · ')}`)
  if (ciaResult.suggested_channels?.length) lines.push(`**建议渠道：** ${ciaResult.suggested_channels.join(' · ')}`)
  return lines.length ? lines.join('\n') : null
}
```

- [ ] **Step 2: 修改 `buildPrompt` 签名，加 `ciaResult = null` 参数，并替换 CIA 注入逻辑**

找到现有的 `export function buildPrompt(stepIdx, projectDir, projectYaml) {` 这一行，改为：

```js
export function buildPrompt(stepIdx, projectDir, projectYaml, ciaResult = null) {
  const step = STEPS[stepIdx]
  const template = readFileSync(path.join(TEMPLATES_DIR, `${step.slug}.md`), 'utf-8')
  const parts = [`## ContentOS Agent — Running Step ${step.n}: ${step.label}\n`]
  parts.push('## PROJECT YAML\n')
  parts.push('```yaml\n' + yaml.dump(projectYaml, { sortKeys: false }) + '```\n')

  // CIA data injection — all 4 steps, DB source takes priority over filesystem
  const ciaText = formatCiaForPrompt(ciaResult) || readCiaData(projectDir)
  if (ciaText) {
    parts.push('## 🕵️ CIA 市场情报（真实数据 — Ahrefs/DataForSEO/TikTok/Reddit/iTunes）\n')
    parts.push('**核心原则：禁止编造数字。以下是 CIA pipeline 实测数据。**\n**Step 1-4 的 TAM/竞品格局/渠道判断必须从此数据引用，不得凭感觉估算。**\n\n')
    parts.push(ciaText)
    parts.push('\n')
  }

  for (const depSlug of step.deps) {
    const depFile = path.join(projectDir, 'strategy', `${depSlug}.md`)
    if (existsSync(depFile)) {
      let depText = readFileSync(depFile, 'utf-8')
      depText = Array.from(depText).filter(c => c.codePointAt(0) < 0x10000).join('')
      parts.push(`## PRIOR OUTPUT — ${depSlug}.md\n`)
      parts.push(depText)
      parts.push('\n')
    } else {
      throw new Error(`Dependency missing: ${depFile}`)
    }
  }
  parts.push('## INSTRUCTION TEMPLATE\n')
  parts.push(template)
  parts.push(`\n\nNow produce the output for Step ${step.n} (${step.label}). Output ONLY the markdown brief (and, for Step 4, the AGENT-HYDRATION block at the end). No preamble.`)
  return parts.join('\n')
}
```

- [ ] **Step 3: 修改 `runContentOSStep` — 从 DB 读 `cia_result` 后传给 `buildPrompt`**

找到 `export async function runContentOSStep(slug, n) {` 的开头部分（在 `const step = STEPS[n - 1]` 之前），插入读取 `cia_result` 的逻辑：

```js
export async function runContentOSStep(slug, n) {
  if (n < 1 || n > 4) throw new Error('step must be 1..4')
  const projectDir = path.join(PROJECTS_DIR, slug)
  if (!existsSync(projectDir)) throw new Error(`project not found: ${slug}`)
  const projectYamlPath = path.join(projectDir, 'project.yaml')
  const projectYaml = yaml.load(readFileSync(projectYamlPath, 'utf-8')) || {}

  // Fetch cia_result from DB for prompt injection
  let ciaResult = null
  if (hasDB()) {
    try {
      const ws = await store.getWorkspace(slug)
      if (ws?.cia_result) {
        ciaResult = typeof ws.cia_result === 'string' ? JSON.parse(ws.cia_result) : ws.cia_result
      }
    } catch (e) {
      console.warn('[contentos] cia_result fetch failed (non-fatal):', e.message)
    }
  }

  const step = STEPS[n - 1]
  const state = loadState(projectDir)
  state.steps[step.slug] = { status: 'running', started_at: new Date().toISOString() }
  saveState(projectDir, state)

  const prompt = buildPrompt(n - 1, projectDir, projectYaml, ciaResult)
  const { text, usage } = await complete(prompt, { maxTokens: 20000 })

  // ... 保留原有的文件写入 + DB 写入 + project.yaml 更新逻辑不变 ...
```

注意：`buildPrompt` 调用需要加第 4 个参数 `ciaResult`。

- [ ] **Step 4: 在文件末尾加 `runMissingContentOSSteps` 函数**

在 `hydrateAgents` 函数之后追加：

```js
export async function runMissingContentOSSteps(slug) {
  if (!hasDB()) return
  try {
    const ws = await store.getWorkspace(slug)
    if (!ws) return
    for (const step of STEPS) {
      try {
        const existing = await store.getStrategyDoc(ws.id, step.slug)
        if (!existing) {
          await runContentOSStep(slug, step.n)
        }
      } catch (e) {
        console.warn(`[contentos] auto-gen step ${step.n} for ${slug} failed:`, e.message)
      }
    }
    console.log(`[contentos] runMissingContentOSSteps done for ${slug}`)
  } catch (e) {
    console.warn('[contentos] runMissingContentOSSteps outer error:', e.message)
  }
}
```

- [ ] **Step 5: TypeScript エラーがないか確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add server/contentos.js
git commit -m "feat: CIA data injection in buildPrompt + runMissingContentOSSteps"
```

---

### Task 2: app/api/cia/result/route.ts — 写文件系统 + 触发后台生成

**Files:**
- Modify: `app/api/cia/result/route.ts`

- [ ] **Step 1: 在文件顶部加新 import**

在现有 import 行之后追加：

```typescript
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PROJECTS_DIR } from '@/server/paths.js'
import { runMissingContentOSSteps } from '@/server/contentos.js'
```

- [ ] **Step 2: 在 `await saveWorkspaceCIAResult(body.slug, result)` 之后加写文件 + 触发后台**

把 try 块里 `await saveWorkspaceCIAResult` 之后的代码改为：

```typescript
    await saveWorkspaceCIAResult(body.slug, result)

    // Write synthesis.md to filesystem for Python contentos-agent.py path
    if (result.synthesis_md) {
      try {
        const ciaDir = path.join(PROJECTS_DIR, body.slug, 'cia')
        mkdirSync(ciaDir, { recursive: true })
        writeFileSync(path.join(ciaDir, 'synthesis.md'), result.synthesis_md)
      } catch (e) {
        console.warn('[cia/result] synthesis.md write failed (non-fatal):', (e as Error).message)
      }
    }

    // Fire background ContentOS generation for missing steps
    setImmediate(() => {
      runMissingContentOSSteps(body.slug).catch((e: Error) =>
        console.warn('[cia/result] background contentos failed:', e.message)
      )
    })

    return NextResponse.json({ ok: true })
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/api/cia/result/route.ts
git commit -m "feat: cia/result writes synthesis.md + triggers background contentos"
```

---

### Task 3: app/api/contentos/[slug]/run-with-cia/route.ts — Regenerate 接口

**Files:**
- Create: `app/api/contentos/[slug]/run-with-cia/route.ts`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p "app/api/contentos/[slug]/run-with-cia"
```

- [ ] **Step 2: 创建文件**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { runContentOSStep } from '@/server/contentos.js'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const step = _req.nextUrl.searchParams.get('step')
  if (!step || !['1', '2', '3', '4'].includes(step)) {
    return NextResponse.json({ error: 'step 1..4 required' }, { status: 400 })
  }
  try {
    const result = await runContentOSStep(slug, Number(step))
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add "app/api/contentos/[slug]/run-with-cia/route.ts"
git commit -m "feat: POST /api/contentos/[slug]/run-with-cia endpoint"
```

---

### Task 4: _hooks/useStrategy.ts — useProjectMeta 支持 refreshKey

**Files:**
- Modify: `_hooks/useStrategy.ts`

ProjectOverview 需要在 Regenerate 完成后刷新 briefs 数据，通过 `refreshKey` 参数触发重新 fetch。

- [ ] **Step 1: 修改 `useProjectMeta` 函数签名，加 `refreshKey = 0` 参数**

找到：
```typescript
export function useProjectMeta(slug: string | undefined) {
  const [data, setData] = useState<ProjectMetaPayload | null>(null)
  useEffect(() => {
    if (!slug) return
    fetch(`/api/project-meta?project=${slug}`).then(r => r.json()).then(setData)
  }, [slug])
  return data
}
```

替换为：
```typescript
export function useProjectMeta(slug: string | undefined, refreshKey = 0) {
  const [data, setData] = useState<ProjectMetaPayload | null>(null)
  useEffect(() => {
    if (!slug) return
    fetch(`/api/project-meta?project=${slug}`).then(r => r.json()).then(setData)
  }, [slug, refreshKey])
  return data
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors（`useProjectMeta` 的现有调用不传 `refreshKey` 时默认为 0，不受影响）

- [ ] **Step 3: Commit**

```bash
git add _hooks/useStrategy.ts
git commit -m "feat: useProjectMeta accepts refreshKey for cache invalidation"
```

---

### Task 5: _components/ProjectOverview.tsx — Regenerate 按钮

**Files:**
- Modify: `_components/ProjectOverview.tsx`

- [ ] **Step 1: 在 `ProjectOverview` 组件顶部加 state**

找到 `export function ProjectOverview({ slug }: { slug: string }) {` 函数体开头，在 `const meta = useProjectMeta(slug)` 之前加：

```typescript
  const [refreshKey, setRefreshKey] = useState(0)
  const [regenerating, setRegenerating] = useState<number | null>(null)
```

然后把：
```typescript
  const meta = useProjectMeta(slug)
```
改为：
```typescript
  const meta = useProjectMeta(slug, refreshKey)
```

- [ ] **Step 2: 加 `regenerateBrief` 函数**

在 `const brief = useStrategyBrief(slug, expandedStep)` 之后插入：

```typescript
  const regenerateBrief = async (step: number) => {
    setRegenerating(step)
    try {
      const r = await fetch(`/api/contentos/${slug}/run-with-cia?step=${step}`, { method: 'POST' }).then(r => r.json())
      if (r.error) alert('Regeneration failed: ' + r.error)
    } finally {
      setRegenerating(null)
      setRefreshKey(k => k + 1)
    }
  }
```

- [ ] **Step 3: 在 brief-card 的 `brief-head` button 内加 Regenerate 按钮**

找到：
```typescript
                  <span className="brief-chevron">{isOpen ? '▴' : '▾'}</span>
                </button>
```

在 `</button>` 之前（即 `brief-chevron` span 之后）插入：

```typescript
                  {b.exists && (
                    <span
                      onClick={e => { e.stopPropagation(); regenerateBrief(b.step) }}
                      style={{
                        fontSize: 11, padding: '2px 6px', marginLeft: 4,
                        color: 'var(--text-faint)', cursor: 'pointer',
                        borderRadius: 4, border: '1px solid var(--border)',
                        background: 'transparent', userSelect: 'none',
                      }}
                      title="基于 CIA 数据重新生成"
                    >
                      {regenerating === b.step ? '⟳' : '🔄'}
                    </span>
                  )}
```

注意：用 `span` 而非 `button` 避免嵌套 button（外层 `brief-head` 已是 button）。

- [ ] **Step 4: 在 import 行确认 `useState` 已导入**

文件顶部应有：
```typescript
import { useState } from 'react'
```

如果只有 `import MDEditor from ...` 等，在顶部加：
```typescript
import { useState } from 'react'
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add _components/ProjectOverview.tsx _hooks/useStrategy.ts
git commit -m "feat: Regenerate button in Dashboard Strategy Briefs"
```

---

### Task 6: app/wizard/[slug]/page.tsx — Regenerate 按钮

**Files:**
- Modify: `app/wizard/[slug]/page.tsx`

- [ ] **Step 1: 加 `regenerateStep` 函数**

在现有 `runStep` 函数之后（约第 93 行之后）插入：

```typescript
  const regenerateStep = async () => {
    if (!slug) return
    setLoading('running')
    const r = await fetch(`/api/contentos/${slug}/run-with-cia?step=${currentStep}`, {
      method: 'POST',
    }).then(r => r.json())
    setLoading('idle')
    if (r.error) {
      alert('Regeneration failed:\n' + r.error)
      return
    }
    await refreshState()
    await loadStep(currentStep)
  }
```

- [ ] **Step 2: 在 step-toolbar st-actions 里加按钮**

找到（在 `!editing` 分支里）：
```typescript
                      <button className="btn btn-ghost" onClick={() => setEditing(true)}>✏️ Edit</button>
```

在这行之后插入：
```typescript
                      <button className="btn btn-ghost" onClick={regenerateStep} disabled={loading !== 'idle'}>
                        🔄 重新生成
                      </button>
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add "app/wizard/[slug]/page.tsx"
git commit -m "feat: Regenerate button in Wizard step toolbar"
```

---

### Task 7: ~/.claude/skills/cia/SKILL.md — Step 12 加 synthesis_md

**Files:**
- Modify: `~/.claude/skills/cia/SKILL.md`

- [ ] **Step 1: 找到 Step 12 的 Python 脚本 `slug = "<WORKSPACE_SLUG>"` 行**

在 `slug = "<WORKSPACE_SLUG>"` 之后，`gtm_url = ...` 之前，插入读取 synthesis.md 的代码：

```python
# 读取 synthesis.md 全文（完整报告，含 TAM/PLG/TikTok/Reddit 真实数据）
from pathlib import Path
reports_base = Path.home() / "workspace/analytics/reports"
topic_slug = slug  # 用 workspace slug 匹配，或手动指定 topic slug
dirs = sorted(
    [d for d in reports_base.iterdir() if d.name.endswith(f"-cia-{topic_slug}")],
    reverse=True
) if reports_base.exists() else []
synthesis_md = ""
if dirs:
    f = dirs[0] / "synthesis.md"
    if f.exists():
        synthesis_md = f.read_text(encoding="utf-8")
        print(f"✓ synthesis.md loaded ({len(synthesis_md)} chars)")
    else:
        print("⚠ synthesis.md not found in topic dir — push without full report")
else:
    print("⚠ no CIA topic dir found — push without full report")
```

- [ ] **Step 2: 在 `synthesis = { ... }` 字典里加 `synthesis_md` 字段**

找到 synthesis 字典的最后一个字段，在其后加：

```python
    "synthesis_md": synthesis_md,  # 完整报告，含真实 TAM/PLG/TikTok/Reddit 数据
```

- [ ] **Step 3: 确认 synthesis 字典正确**

最终 synthesis 字典应类似：
```python
synthesis = {
    "tagline": "<tagline>",
    "category": "<category>",
    "audience": {"primary": "<primary>", "secondary": "<secondary>"},
    "positioning": "<positioning>",
    "competitors": ["<comp1>", "<comp2>"],
    "suggested_channels": ["reddit", "x", "blog"],
    "synthesis_md": synthesis_md,
}
```

不需要 git commit（该文件在 `~/.claude/skills/`，不在 gtm-swarm 仓库中）。

---

### Task 8: 最终构建 & 推送

- [ ] **Step 1: 完整构建**

```bash
npm run build
```

Expected: `✓ Compiled successfully`

- [ ] **Step 2: 确认新路由存在**

```bash
ls "app/api/contentos/[slug]/run-with-cia/route.ts"
```

Expected: 文件存在

- [ ] **Step 3: git push**

```bash
git push
```
