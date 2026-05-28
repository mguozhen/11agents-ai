# Dashboard Tabs — 功能说明

GTM Swarm Dashboard（`/dashboard/[slug]`）共 8 个 Tab，分为两层：**管理层**（Overview / North Star / Ledger）和**内容流水线**（Ideas → Drafts → Review → Bank → Published）。

---

## 管理层

### Overview
项目总览。展示当前项目下所有 Agent 频道卡片（Reddit、Blog、X 等），包含每个 agent 的激活状态、30 天滚动指标和周目标。入口页。

### North Star
**KPI 跟踪看板**，对应 Principle 04 — "Traffic + Revenue is the Only Goal"。

追踪 4 个核心漏斗指标（实际 vs 目标，带进度条）：

| 指标 | 说明 |
|------|------|
| 🚦 Traffic | 网站流量 |
| 📝 Registrations | 注册用户数 |
| 💳 Payments | 付费笔数 |
| 💰 Revenue (USD) | 收入 |

支持日 / 周 / 月 / 年切换；Founder 可手动录入每日数据；底部展示最近 14 天的历史记录和人员责任分布（Iron Triangle）。

数据源：`/api/north-star?project=<slug>`，目标值来自各项目的 `targets.yaml`。

### Ledger
**Swarm 运营总账**，按 agent 维度展示内容流水线的吞吐量。

- 时间窗口可选：24h / 7d / 30d
- 每行显示一个 agent 在窗口内新增的 ideas、drafts、bank、published 数量，以及当前 pending review 数
- 展开行可查看该 agent 近期话题、生命周期累计数据、最新 Reviewer 反馈片段
- Iron Triangle 完整性检查：Builder 或 Reviewer 缺失时标红警告 ⚠

数据源：`/api/ledger?project=<slug>&window_hours=<n>`

---

## 内容流水线

内容在这 5 个状态之间单向流转：

```
Ideas (new-idea)
  ↓  Promote（提升为草稿）
Drafts (draft)
  ↓  Submit for Review
Review（Reviewer 审核）
  ↓  Approve
Bank (bank)
  ↓  Publish
Published (published)
```

### Ideas
**state = `new-idea`**。Agent 生成的原始选题/创意，尚未开始写作。

操作：
- **Promote** — 将 idea 提升为 draft，触发 `/api/promote-idea`
- **Reject** — 拒绝并记录原因，触发 `/api/reject-idea`
- **手动新建** — 直接填写 topic / angle / hook 创建 idea

### Drafts
**state = `draft`**。已在撰写中的稿件，内容尚未送审。Reviewer 角色在此 Tab 也可直接对草稿执行审核操作。

### Review
**Reviewer 的待审队列**。同样展示 draft 状态的内容，但以 Reviewer 视角呈现，右上角切换到 Reviewer 视图后可在此 inline Approve / Reject。Tab 角标（红色）= 待审数量，非零时高亮提醒。

### Bank
**state = `bank`**。已通过审核、质量达标、等待发布的内容储备库。内容在此暂存，等待调度发布。

### Published
**state = `published`**。已正式推送到对应平台（Reddit、Blog、X 等）的内容，作为历史记录保留。

---

## 角色与权限

| 操作 | Founder | Reviewer |
|------|---------|----------|
| 浏览所有 Tab | ✅ | ✅ |
| 录入 North Star 数据 | ✅ | ✅ |
| Promote / Reject idea | 需 token | 需 token |
| Approve / Reject draft | — | 需 token |

角色通过顶栏 **VIEW** 切换（Founder / Reviewer）；Approve / Reject 操作需要有效 token（顶栏 Sign in）。
