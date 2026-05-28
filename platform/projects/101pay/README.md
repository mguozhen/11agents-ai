# 101pay — Agent-First GTM 战略推演

**外部标的**,非自有产品。本仓库是 `agent-gtm` skill 在 101pay.ai 这条赛道上的战略推演与执行模板,**不是已落地清单**。

## 这是什么

101pay 在我们的六产品组合里被划为 **Agent 经济的横向结算 infra** —— 类比 flatkey(LLM 课金 rail) 之于推理,101pay 之于 Agent tool call 的支付清算。

核心命题:**谁先成为 Agent 经济的默认结算 rail,谁就在 Agent 时代拿到 Stripe 的位置。**

## 仓库内容

| 文件 | 用途 |
|---|---|
| `project.yaml` | 产品元数据 / agent-gtm skill 读取入口 |
| `GTM/agent-first-gtm-for-101pay.html` | 四张卡(发现/引流/内容/分发) + 7 天冲刺表 + 第一性原理 |

## 四张卡(摘要)

1. **发现** — HTTP 402 响应直接带 101pay 结算指令(x402-native);MCP catalog Payments/Finance + apis.guru + Coinbase 开发者目录
2. **引流** — 接入摩擦趋近 0 的 x402 端点;费率元数据(stablecoin · 内置 AML/policy · ~0.5% · T+0);**flatkey billing v2「agent-callable topup」走 101pay rail**
3. **内容** — 5 个 x402 cookbook + 结算 comparison page
4. **分发** — OSS reference repo(`x402-claude-code-paywall` / `101pay-langchain-billing`);与 Claude Code / Cursor / Open Hands 谈「x402 计费默认 rail」;hub 互链给 flatkey/btcmind/voc/solvea 的 tool call 计费做底层结算

**起手三件**(若 101pay 团队接受这套打法):
1. x402-native 收银端点(让 402 响应自带结算指令)
2. capability manifest + 机器可读 policy spec
3. 与 flatkey billing v2 互链 —— 集团内先跑通,再向外部 runtime 扩

## 可见性说明

仓库为 **private** —— GitHub 的 `internal` 仅 Enterprise 计划开放,SolveaCX 是 free org,private 是当前最接近"组织内部可见"的选项。
