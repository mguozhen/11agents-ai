# GTM × Multica Integration Design

> Spec v1.1 · 2026-05-12
> Branch: feature/multica-review-agent

## Overview

把 GTM Swarm 的内容流水线和 Multica 的 Agent 协作平台打通，形成一个**两层增长飞轮**：

- **大循环（顶层触发）**：Founder 输入 PMF 角度 → ContentDrop 一键触发 → 全渠道 Agent 并行执行
- **小循环（持续涌现）**：Agent 在日常互动中发现高价值 Insight → 自动进审核队列 → 人审批 → 好的升级成新 ContentDrop

Multica 负责**任务协作层**（Issue 管理、评论、实时状态、AI 协同）；gtm-swarm 负责**内容执行层**（LLM 生成、Engine 上下文、发布流水线）。

## 多产品 × 共享人员 × 复用 Agent

### 一个产品 = 一个 Multica Workspace

| 产品 | Multica workspace slug |
|---|---|
| VOC AI | `voc-ai` |
| Solvea | `solvea` |
| BTCMind | `btcmind` |
| Flatkey | `flatkey` |
| PairCode | `paircode` |

每个 workspace 独立管理自己的 ContentDrop、Issue 流水线和内容 bank。

### 人（Builders / Reviewers）跨 workspace 共享

Wayne、Ivy、张基琳 等人是**所有 workspace 的 member**，在 Multica 的 `member` 表里每人有 N 条记录（一个 workspace 一条）。gtm-swarm 在 bootstrap 时自动 upsert：

```
for each product workspace:
  for each person in people table:
    INSERT INTO member (workspace_id, user_id, role) ON CONFLICT DO NOTHING
```

Reviewer 在 Multica 里可以自由切换 workspace，看到自己负责的各产品 review 队列。

### Agent 执行逻辑完全复用，按产品注入上下文

GTM Agent（Reddit、Blog、X 等）的执行代码是**同一套 runner.js**，不同产品只是传入不同的：
- `workspace_slug`（决定读哪个产品的 engine files）
- `project_config`（产品定位、受众、竞品）

在每个 Multica workspace 里，gtm-swarm bootstrap 时自动注册同一批 channel agents：

```
for each product workspace:
  for each channel in [reddit, x, blog, video, kol-koc, landing]:
    upsert agent row in Multica agent table
    // name: "GTM-Reddit", runtime_mode: "cloud", runtime_config: { gtm_channel: "reddit" }
```

同一个 "GTM-Reddit agent" 在所有 workspace 里都存在，但执行时读取的是当前 workspace 对应产品的 engine context。

### gtm-swarm 现有流水线完全保留

Multica 集成是**叠加层**，不替换现有任何逻辑：

```
有 MULTICA_DATABASE_URL → 草稿同步到 Multica issue comment + AI review 触发
没有 MULTICA_DATABASE_URL → 走现有 filesystem/PostgreSQL 流水线，完全不变
```

现有的：
- `projects/` 目录结构
- `content-bank/` 文件
- `reviews/<reviewer>/` symlink 队列
- `POST /api/review` approve/reject
- Dashboard `/dashboard/:slug` 现有视图

**全部保留**。Multica 的 review 是**并行渠道**，不是替换。

---

## 集成方式：共享 PostgreSQL

两个服务连接**同一个 PostgreSQL 实例**（Multica 的数据库）。

- gtm-swarm 直接读写 Multica 的 `issue`、`comment`、`agent`、`workspace` 表
- 无需 HTTP 调用，无需 webhook 轮询
- Multica Go 后端通过 WebSocket 实时广播状态变更，前端自动刷新

gtm-swarm 新增 `server/multica-db.js`：使用独立 pg Pool 连接 `MULTICA_DATABASE_URL`，封装所有对 Multica 表的读写操作。

## Layer 1：ContentDrop — 顶层触发全渠道扩散

### 数据模型

ContentDrop 在 Multica 中表示为一组 Issue：

```
parent issue (type: content_drop)
  ├── child issue: reddit   (assignee: wayne agent)
  ├── child issue: x        (assignee: wayne agent)
  ├── child issue: blog     (assignee: 张基琳 agent)
  ├── child issue: video    (assignee: 庄可欣 agent)
  ├── child issue: kol-koc  (assignee: ivy agent)
  └── child issue: landing  (assignee: 高博远 agent)
```

Parent issue 的 `description` 字段存放完整 Drop 上下文（PMF 角度、目标受众、关键数据点）。

### 触发流程

```
Founder 在 Multica 前端 → 填写 Drop 表单
  → POST /api/drops (gtm-swarm)
  → multica-db.js 创建 parent issue
  → 为每个激活的 channel agent 创建 child issue
  → 每个 child issue 分配对应的 Multica agent
  → child issue status = 'in_progress'
  → Multica WS 广播 → 前端实时显示各 Issue 进度
```

### Agent 执行

gtm-swarm 的 `runner.js` 轮询（或接收 Multica webhook）`in_progress` 状态的 GTM content issues：

```
runner 检测到 child issue in_progress
  → 读取 parent issue description 作为 Drop 上下文
  → 调用 LLM 生成平台原生内容（现有 engine 逻辑）
  → 草稿作为 comment POST 到 child issue
  → issue status → 'in_review'
  → 触发 AI review（见 Layer 2）
```

### ContentDrop 创建 API

`POST /api/drops`（新增到 gtm-swarm `server/api.js`）：

```json
{
  "workspace_slug": "voc-ai",
  "angle": "QA团队每周节省40小时",
  "context": "来自客户访谈，3个客户验证",
  "channels": ["reddit", "x", "blog", "video"],
  "priority": "high"
}
```

返回：`{ drop_id, parent_issue_id, child_issues: [...] }`

## Layer 2：AI Review 看板

### AI Review 触发时机

当 child issue 状态变为 `in_review` 时，gtm-swarm 的 review worker 自动触发：

1. 读取 issue 的最新 comment（Agent 生成的草稿）
2. 读取该 channel 的 `channel_profiles` review_checklist
3. 调用 Claude API，返回：
   - 质量分（0-100）
   - 每条 checklist 的通过/失败判断
   - 3-5 条内联批注（问题段落 + 修改建议）
   - 整体推荐（approve / revise / reject）
4. AI review 结果作为新 comment POST 到 issue（author_type: 'agent'，agent 标记为 `gtm-ai-reviewer`）

### Multica 前端扩展：Review 侧边栏

在 Multica 的 issue detail 页（`apps/web/app/[workspaceSlug]/(dashboard)/issues/[id]/`）：

当 issue 带有 label `gtm-content` 且状态为 `in_review` 时，在右侧面板注入 `<GTMReviewPanel>`：

```
┌─────────────────────────────────────┐
│ AI Review                    82/100 │
│ 推荐：✓ Approve                      │
├─────────────────────────────────────┤
│ Checklist                           │
│ ✓ Native fit                        │
│ ✓ Value ratio (>80% helpful)        │
│ ⚠ 第3段产品提及稍多                  │
│ ✓ No spam language                  │
├─────────────────────────────────────┤
│ 内联批注 (2)                         │
│ > "我们的产品可以..." ← 改成用户视角  │
│ > 结尾 CTA 太硬 ← 可改成提问收尾     │
├─────────────────────────────────────┤
│ [✓ Approve]  [✗ Reject]  [✏ Edit]  │
└─────────────────────────────────────┘
```

Approve → issue status → `done` → gtm-swarm 监听到 → 内容写入 `content_items` bank。

### AI Review API

`POST /api/ai-review`（新增到 gtm-swarm）：

```json
{
  "issue_id": "uuid",
  "draft_comment_id": "uuid",
  "channel": "reddit",
  "workspace_slug": "voc-ai"
}
```

调用 Claude API，结果 POST 回 Multica issue 作为 comment，同时存入 gtm-swarm `audit_log`。

## Layer 3：Insight 涌现 → 小循环

### Insight 发现

现有 `source-ideas.js` 每日运行，生成 `new-idea` 文件。扩展为两类输出：

1. **普通 Idea**：agent 生成的内容选题（现有逻辑不变）
2. **高价值 Insight**：LLM 标记为 `insight_type: signal`，表示发现了新的市场信号或用户洞察

高价值 Insight 自动在 Multica 中创建 issue（`label: gtm-insight`），进入专属的 Insight Review 队列。

### Insight Review 队列

Multica 前端新增 **Insights** 视图（在工作区侧边栏）：

- 列表：所有 `label: gtm-insight` 且 `status: backlog` 的 issue
- 每条显示：Insight 文字、来源 Agent、来源渠道、AI 置信分
- 操作：
  - **升级为 Drop**：一键填充 ContentDrop 表单，触发全渠道扩散
  - **记为噪音**：status → `cancelled`，写入对应 agent 的 anti-patterns

## 数据库桥接

### 新增连接

gtm-swarm `server/multica-db.js`：

```js
// 连接 Multica 的 PostgreSQL（共享实例）
const MULTICA_DATABASE_URL = process.env.MULTICA_DATABASE_URL

export async function createIssue(workspaceId, { title, description, status, priority, parentId, label })
export async function postComment(issueId, { body, authorType, authorId })
export async function updateIssueStatus(issueId, status)
export async function getIssueWithComments(issueId)
export async function watchIssueStatus(issueId, callback)  // polling, 5s interval
export async function createOrGetGTMAgent(workspaceId, channelName)  // upsert agent row
```

### 环境变量

新增到 gtm-swarm：
```
MULTICA_DATABASE_URL=postgres://multica:multica@localhost:5432/multica
MULTICA_WORKSPACE_ID=<uuid>  # 对应的 Multica workspace
```

### Multica Issue 约定

gtm-swarm 创建的 issue 统一打上以下 label（自动 upsert）：
- `gtm-content`：内容 Issue（channel 草稿）
- `gtm-drop`：ContentDrop 父 Issue
- `gtm-insight`：Insight 涌现 Issue

## Multica 前端改动

改动范围控制在**新增文件**为主，避免大幅修改现有页面：

### 1. ContentDrop 触发器

新增路由：`apps/web/app/[workspaceSlug]/(dashboard)/drops/new/page.tsx`

- 表单：PMF 角度（必填）、背景上下文、目标渠道（多选）、优先级
- 提交 → 调用 gtm-swarm `POST /api/drops`
- 实时显示各渠道 Issue 创建状态

### 2. GTM Review Panel（issue detail 扩展）

新增文件：`packages/views/src/issues/gtm-review-panel.tsx`

- 检测 issue 是否有 `gtm-content` label
- 从 issue comments 中提取最新 AI review comment（author 为 gtm-ai-reviewer agent）
- 渲染 checklist、内联批注、分数、操作按钮
- Approve/Reject 操作调用现有 Multica issue status mutation

### 3. Insights 视图

新增路由：`apps/web/app/[workspaceSlug]/(dashboard)/insights/page.tsx`

- 查询 `label: gtm-insight` issues
- 升级为 Drop 按钮打开 ContentDrop 表单（预填 Insight 内容）

## gtm-swarm 后端改动

### 新增文件
- `server/multica-db.js`：Multica PostgreSQL 桥接层
- `server/ai-review.js`：AI review 生成逻辑（调用 Claude API）
- `server/drops.js`：ContentDrop 创建和 fan-out 逻辑

### 修改文件
- `server/api.js`：新增 `POST /api/drops`、`POST /api/ai-review` 路由
- `server/source-ideas.js`：高价值 Insight 标记 + 写入 Multica issue
- `server/runner.js`：执行完毕后将草稿 POST 到对应 Multica issue comment

## Bootstrap 逻辑（多 workspace 初始化）

`server/bootstrap.js` 的 `bootstrapDB()` 扩展，当 `MULTICA_DATABASE_URL` 设置时额外执行：

```
1. 对 gtm-swarm 每个 workspace (voc-ai, solvea, ...) 在 Multica 中 upsert workspace 记录
2. 对 people 表每个人，在每个 Multica workspace 里 upsert member 记录
3. 对每个 Multica workspace，注册 6 个 channel agent 记录
4. 创建 GTM label (gtm-content, gtm-drop, gtm-insight) 到每个 workspace
```

一次 bootstrap 跑完，后续按需增量更新。

---

## 实现顺序

Phase 1 — 基础桥接 + 多 workspace bootstrap（无 UI）：
1. `server/multica-db.js` + 环境变量 (`MULTICA_DATABASE_URL`, `MULTICA_DEFAULT_USER_ID`)
2. Bootstrap：所有产品 workspace → Multica workspace upsert + 人员 member 注册 + channel agent 注册
3. `POST /api/drops` + Multica issue fan-out（支持指定 workspace_slug）
4. runner.js → 执行完草稿 POST 为对应 Multica workspace child issue 的 comment

Phase 2 — AI Review：
5. `server/ai-review.js` + `POST /api/ai-review`
6. Multica 前端 `GTMReviewPanel`（`packages/views/src/issues/`）
7. Approve → gtm-swarm content_items state 更新为 bank

Phase 3 — Insight 小循环：
8. source-ideas.js 高价值 Insight 标记 + 写入 Multica insight issue
9. Multica 前端 Insights 视图 + "升级为 Drop" 操作

Phase 4 — ContentDrop UI：
10. Multica 前端 Drop 触发表单（`/[workspaceSlug]/drops/new`）

## Out of Scope

- Multica 用户认证与 gtm-swarm 用户系统打通（后续可做 SSO）
- 内容自动发布（publish 动作依然需要人工触发）
- Multica 移动端适配
