# ContentOS Prompts · Vertical-Bias Audit · 2026-05-25

**目的**:验 Goal「无论卖什么都能卖出去」前置 —— 4-step prompt 对垂直的隐藏假设是否阻碍 universal 落地。

**结论**:Step 1/2/3 接近 universal,主要缺陷在 Step 4(硬编码 11 agent)。Step 1/2 有少量 B2B SaaS 语言渗漏需要软化。

---

## Step 1 · Market Insight

| 维度 | 评估 | 证据 / 行号 |
|---|---|---|
| 方法论 universal | ✅ | CIA 5-8 tracks 不锁垂直 |
| TAM 公式 | ⚠ | L97: `TAM = head competitors' user count × ARPU × paid conversion` —— 不适配硬件(单价×销量)/ 一次性服务(case 数×单价) |
| Founder framing | ⚠ | L7 `Founder's input is one hypothesis` —— 假设产品由 founder 主导,大公司新 line 不适用 |
| 数据源 | ✅ | CIA real-data 占位 + LLM fallback 双轨,可降级 |

**改造建议**:把 TAM 公式拆 3 种模板(订阅 / 一次性销售 / 服务)by vertical-detection at Step 1 prelude。

---

## Step 2 · User Insight

| 维度 | 评估 | 证据 / 行号 |
|---|---|---|
| ICP 框架 | ✅ | 三层(primary/secondary/exclude)对任何垂直成立 |
| Firmographic 措辞 | ❌ | L30 `Firmographic: role + company size + revenue range + tech stack` —— 纯 B2B 语言。B2C/DTC 应是 demographic(age / income / hobby) |
| 示例 bias | ⚠ | L109 唯一示例 "Medspa owners on GoHighLevel" —— B2B SaaS,缺 B2C/hardware/service 平衡 |
| 词汇审计 | ✅ | universal |
| Channel mapping | ⚠ | L82 `feed Step 4 (Content Strategy) — tells us which of the 11 GTM Agents to activate` —— 11 硬编码渗漏到 Step 2 |

**改造建议**:把 ICP section 改成 `Profile (firmographic for B2B / demographic for B2C)`;加 hardware 和 service 两个示例;Channel mapping 改成「from the agent registry」而非「11 agents」。

---

## Step 3 · Competitor Analysis

| 维度 | 评估 | 证据 |
|---|---|---|
| 整体 universal 程度 | ✅ | 4 step 里最 universal |
| 价格假设 | ⚠ | L20/47 `Their price — typical entry tier $/mo` —— 假设订阅模式。硬件应 `unit price` |
| Win-loss | ✅ | 不锁垂直 |

**改造建议**:`Their price` 改成 `Their pricing model (subscription $/mo · one-time $ · per-unit $ · per-engagement $)`。

---

## Step 4 · Content Strategy + Hydration ⚠ **主战场**

| 维度 | 评估 | 证据 |
|---|---|---|
| Activate 决策 | ✅ | Critical Rule 1 已立法 `Activate only agents that fit this product` |
| Agent 集合 | ❌ | L52-77 hydration YAML schema **硬编码 11 个 agent key** (`01-foundation` ... `11-poster`) |
| 示例 bias | ⚠ | L82 只举 B2B SaaS / consumer crypto 两例 |
| 文件假设 | ❌ | L92 `Write the new fields into each projects/<slug>/agents/<id>/agent.yaml` —— 违 CLAUDE.md §39「不走文件系统」 |
| Channel pool 可扩 | ❌ | prompt 列死 11 agent,加 1 个新 channel(PH / HN / Substack)= 改 prompt + 改 hydrate-agents.py + 重跑所有 product |

**改造路径(配合 agent_definitions schema 落地后)**:
- Step 4 prompt 重写成「从 <code>SELECT * FROM agent_definitions WHERE enabled=true</code> 里挑」
- Hydration YAML schema 改成动态 `agents: [{id: <slug>, activate: bool, ...}]`
- 去掉所有 `agent.yaml` 文件路径引用,改写入 `workspace_agents` 表
- Critical Rule 1 加示例:hardware / service / agent-native MCP 各 1 例

---

## 跨 4-step 共性问题

| 问题 | 影响 | 解决 |
|---|---|---|
| 全 prompt 反复出现「11 GTM Agents」字样 | 用户读完会以为 swarm 只能做 11 件事 | 改 prompt 措辞为「N agents from the registry」 |
| 全 prompt 默认产品有「founder」 | 集团内部 BU 新 line 不适用 | 改成「product owner」(founder OR product manager OR BU lead) |
| 全 prompt 假设产品有 web 官网 | P06 立法的 agent-native 产品没有官网 | Step 1 加分支:agent-native product → discovery 走 mcp.so / smithery / agent registries |

---

## 优先级

| Priority | 改造点 | 阻塞 |
|---|---|---|
| **P0** | Step 4 hardcoded 11 agent → registry-driven | I2 / I5 解锁的前置 |
| **P1** | Step 2 Firmographic → Profile(B2B/B2C 分支) | universal onboard 体感 |
| **P1** | 全 prompt 「11 GTM Agents」字样收口 | 措辞一致性 |
| **P2** | Step 1 TAM 公式 3 模板 | 硬件/服务垂直数学 |
| **P2** | Step 3 pricing model 分类 | 同上 |
| **P3** | 全 prompt founder → product owner 中性化 | BU 内部场景 |

---

## 不需要改的

- Step 1 的 CIA 方法论框架(已经 universal)
- Step 2 的 ICP 三层 / 词汇审计 / 痛点排序方法
- Step 3 的 positioning map / win-loss 框架
- Step 4 的 Channel Strategy / Editorial Calendar / Distribution Sequence(只要 channel pool 改成 registry-driven)

**评分**:4-step prompt 系统 **85% universal-ready**,缺的 15% 主要靠 Step 4 + agent registry 改造一次性补完。
