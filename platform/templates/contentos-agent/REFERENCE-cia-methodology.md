---
name: cia
description: 首席情报官 — 市场机会全链路情报分析。Python 固定能力层（拉取/结构化/导出）+ LLM 端点（意图扩容/解读合成）。当用户提到市场分析、竞品分析、机会发现、情报分析、App 市场、关键词研究、ASO 时使用。
metadata: {"openclaw":{"emoji":"🕵️","requires":{"env":["DATAFORSEO_BASIC_AUTH","APIFY_TOKEN","YOUTUBE_API_KEY"]}}}
---

# CIA — 市场情报分析（v2 工程化版）

## 设计原则

> **Python 干固定的事，LLM 干判断的事。**
>
> 数据拉取、结构化存储、表格导出 → Python（可重复、可审计、低成本、任何人可重跑）
> 意图扩容、解读合成、战略判断 → LLM（在两端用，不在中间用）

> **CIA 找机会，不证明想法。** 永远给用户多条赛道，主动找用户假设的反向证据，做市场规模现实检验。

---

## 一、数据架构

```
~/workspace/analytics/reports/<YYYY-MM-DD>-cia-<topic-slug>/
  cia.db                      # ★ canonical SQLite — 所有数据真相源
  data.xlsx                   # 多 sheet Excel，投放/ASO 团队直接打开
  report.html                 # 可交互 HTML（DataTables 搜索/排序/导出 CSV）
  report.md                   # LLM 解读摘要
  raw/*.json                  # Ahrefs MCP 等响应的原始缓存
```

**SQLite 14 张表**：seeds / keywords_google / appstore_serp / appstore_keywords / competitors_app / app_reviews / competitors_web / competitor_organic_kw / ai_visibility / social_tiktok / social_reddit / social_youtube / topic_meta / fetch_log

---

## 二、API 分工矩阵（v2 锁定）

| 数据 | 渠道 | 工具 | 成本 |
|---|---|---|---|
| Google 关键词 vol/KD/CPC/intent | Ahrefs MCP | `keywords-explorer-*` | 含订阅 |
| Google SERP / 竞品 organic 词 | Ahrefs MCP | `site-explorer-organic-keywords` | 含订阅 |
| 竞品 Web 流量 / DR / backlinks | Ahrefs MCP | `site-explorer-metrics` | 含订阅 |
| **AI 引用份额（ChatGPT/Gemini）** | Ahrefs MCP | `brand-radar-sov-overview` | 含订阅 |
| **App Store SERP（keyword → 排名 App）** | iTunes Search API | `itunes.keyword_to_apps` | 免费 |
| **App ASO 关键词（app → 排名词 + SV）** | DataForSEO Labs | `keywords_for_app/live` | $0.01 + $0.0001/条 |
| **App 评论（痛点提炼）** | DataForSEO | `app_reviews/task_post` | $0.0015/50 |
| App 元数据 | iTunes Lookup | `itunes.lookup_apps` | 免费 |
| TikTok 内容 | Apify | `clockworks/free-tiktok-scraper` | ~$0.05/run |
| Reddit 讨论 | Apify | `trudax/reddit-scraper-lite` | ~$0.05/run |
| YouTube 视频 + Hook | YouTube Data API v3 | `search`+`videos` | 10K units/day 免费 |

---

## 三、标准工作流（Python CLI 主跑）

> 所有命令从 `~/.claude/skills/cia/scripts/` 目录运行。

### Step 0：建 topic
```bash
cd ~/.claude/skills/cia/scripts
python3 cli.py init "ai phone receptionist" --country us
```

### Step 1：意图扩容（LLM 出力）
基于用户输入按 20 维扩容（详见 §五）。把种子写到 `seeds.txt`：
```
demand|core|ai receptionist
demand|core|ai answering service
demand|audience|ai receptionist for dentist
supply|competitor|openphone
```
然后：
```bash
python3 cli.py seed-save --topic "ai phone receptionist" --file seeds.txt
```

### Step 2：拉 Ahrefs Google 关键词（MCP 调用 + ingest）
对每组种子词调 MCP，把 JSON 落盘后 ingest：
```bash
# 1. Claude 在对话中调 MCP（用 ToolSearch 加载 schema）
mcp__claude_ai_Ahrefs__keywords-explorer-overview \
  keywords="ai receptionist,ai answering service,ai phone answering" \
  country=us select=keyword,volume,difficulty,cpc,traffic_potential,intents
# 2. 把响应 JSON 保存到 raw/ahrefs-overview-1.json
# 3. ingest
python3 cli.py ingest-ahrefs --topic "ai phone receptionist" \
  --kind keywords --file raw/ahrefs-overview-1.json --source-seed "ai receptionist"
```
**关键操作**：每组核心词跑 `matching-terms`（limit 100）+ `related-terms`（limit 50），全部 ingest。**不要**在 LLM 阶段砍数据 — 全部进 SQLite，最后让 Excel/HTML 渲染。

### Step 3：拉 Brand Radar（AI 引用份额）
```bash
mcp__claude_ai_Ahrefs__brand-radar-sov-overview keywords="ai receptionist" country=us
# 保存到 raw/brand-radar-sov.json
python3 cli.py ingest-ahrefs --topic "..." --kind brand-radar \
  --file raw/brand-radar-sov.json
```

### Step 4：拉 App Store SERP（iTunes 免费）
用 Step 2 的 Google 词去搜 App Store：
```bash
python3 cli.py fetch-itunes-serp --topic "ai phone receptionist" \
  --keywords "ai receptionist,ai answering service,ai phone answering,ai virtual receptionist,ai call answering" \
  --limit 20
```

### Step 5：竞品 App 元数据
```bash
python3 cli.py fetch-competitors-meta --topic "ai phone receptionist"
# 自动从 appstore_serp 提取所有 app_id，调 iTunes lookup 拿全量元数据
```

### Step 6：App ASO 关键词（DataForSEO，每个 ~$0.012）
```bash
python3 cli.py fetch-aso-keywords --topic "..." --top 20 --limit 200
# --top 20 = 自动选 SERP 出现次数最多的 Top 20 竞品
```

### Step 7：App 评论（痛点）
```bash
python3 cli.py fetch-app-reviews --topic "..." --top 5 --depth 200
# Top 5 竞品 × 200 review = 约 $0.03
```

### Step 8：竞品 Web 流量（Ahrefs MCP）
对每个竞品域名：
```bash
mcp__claude_ai_Ahrefs__site-explorer-metrics target=quo.com country=us
python3 cli.py ingest-ahrefs --topic "..." --kind site-metrics \
  --file raw/ahrefs-quo-metrics.json --domain quo.com

mcp__claude_ai_Ahrefs__site-explorer-organic-keywords \
  target=quo.com country=us limit=100 order_by=volume:desc
python3 cli.py ingest-ahrefs --topic "..." --kind organic-kw \
  --file raw/ahrefs-quo-orgkw.json --domain quo.com
```

### Step 9：社交信号
```bash
python3 cli.py fetch-tiktok  --topic "..." --queries "ai receptionist,ai answering service" --max-items 80
python3 cli.py fetch-reddit  --topic "..." --queries "ai receptionist,answering service for small business" --subreddits "smallbusiness,Entrepreneur,startups" --max-items 60
python3 cli.py fetch-youtube --topic "..." --queries "ai receptionist demo,ai answering service review" --per-query 15
```

### Step 10：检查数据
```bash
python3 cli.py status --topic "ai phone receptionist"
# 显示每张表行数 + 总成本
```

### Step 11：LLM 写解读 → 导出
1. 用 sqlite3 读关键聚合（详见 §六）
2. LLM 写 `synthesis.md`（只写解读段落，**不写表**）
3. 导出：
```bash
python3 cli.py export --topic "ai phone receptionist" --synthesis-file synthesis.md
# 生成：data.xlsx + report.html（含 LLM 摘要 + 14 张可搜索表）
```

---

## 四、Mode B（竞品列表驱动）

输入是竞品列表（含 App 名/域名）：
1. 把竞品名作为种子，调 iTunes Search 找 app_id → 直接 `fetch-competitors-meta`
2. 跑 Step 6-8 补 ASO + Web 数据
3. 反向：从竞品 organic 词反推 Google 关键词种子，再跑 Step 2
4. Step 9 社交信号
5. Step 11 合成

---

## 五、意图扩容 20 维（LLM 头部出力）

**需求侧 1-7**：核心问题词 / 受众细分词 / 场景触发词 / 痛点量化词 / 用户自描述词 / 相邻扩展词 / 平台偏重
**供给侧 8-12**：现有解决方案词 / 付费决策词 / 竞品获客渠道 / 传统替代品 / 竞品投诉词
**Gap 侧 13-17**：被忽视受众 / 场景空白 / 地域空白 / 功能空白 / 定价空白
**行动侧 18-20**：渠道判断 / 变现模式 / 时机判断

> 关键：扩容产物是**种子词列表**，不是分析。分析在 Step 11 用 SQLite 数据写。

---

## 六、合成阶段的 SQL 速查（LLM 用）

```sql
-- Golden 关键词（高 vol + 低 KD + 高 CPC）
SELECT keyword, volume, kd, cpc_usd, intent FROM keywords_google
WHERE volume>=200 AND kd<=35 AND cpc_usd>=1
ORDER BY volume DESC LIMIT 30;

-- App Store 蓝海词（搜索量大但只有 ≤3 个 App 占据）
SELECT keyword, search_volume, COUNT(DISTINCT app_id) AS n
FROM appstore_keywords WHERE search_volume>=500
GROUP BY keyword HAVING n<=3 ORDER BY search_volume DESC LIMIT 30;

-- 竞品体量分层
SELECT name, rating, review_count, est_downloads_high
FROM competitors_app ORDER BY review_count DESC LIMIT 20;

-- App 评论高频痛点
SELECT body FROM app_reviews WHERE rating<=3 AND length(body)>50
ORDER BY posted_at DESC LIMIT 50;

-- AI 引用份额
SELECT brand, platform, sov_pct, mentions FROM ai_visibility
ORDER BY sov_pct DESC LIMIT 20;

-- TikTok 高分享率内容（强商业信号）
SELECT plays, likes, shares, ROUND(1.0*shares/likes,3) AS share_rate, text, url
FROM social_tiktok WHERE likes>100 ORDER BY share_rate DESC LIMIT 15;

-- Reddit 高分痛点帖
SELECT score, num_comments, subreddit, title, body FROM social_reddit
ORDER BY score DESC LIMIT 20;
```

---

## 七、报告固定结构（synthesis.md）—— **赛道分层模板（v2 强制）**

> **核心原则**：**不被用户输入限制视野**。CIA 应按竞品 mind-share 反推 5-8 条赛道，按 TAM 从大到小排序，再让用户选择跨赛道组合。

```
# 一、核心洞察（TL;DR）
| 你给的方向 | 实际市场容量 | 与最大赛道差距 | 反向洞察 |

# 二、成功者解码（按 review_count 排序，识别 mind-share）
| # | 竞品 | Reviews | 估算下载 | 类目 | 用户心智（一句话） | 成功内核 |
（取 Top 20）

# 三、战略赛道矩阵（按 TAM 从大到小，5-8 条）
| # | 赛道 | 用户心智 | 头部竞品 | TAM 估算 | 与你方向关系 | 综合评分 |

# 四、每条赛道详细卡片（每条赛道一张表）
## L1: <赛道名>（TAM 范围）
| 维度 | 数据 |
| 用户心智 | ... |
| 体量证据 | reviews + Web traffic + ARPU 估算 |
| 头部竞品 | ... |
| 你的切入角度 | ... |
| 关键获客词 | （从 Ahrefs 数据引用真实 vol/KD/CPC） |
| 切入难度 | ⭐ 评级 |
| 关键风险 | ... |

# 五、跨赛道组合策略
## 5.1 单赛道选择（按资源约束）
| 资金/资源 | 推荐路径 | 理由 |
## 5.2 双赛道协同组合（最高 ROI）
| 组合 | 协同逻辑 | 适用 |
## 5.3 单一最佳推荐 + 90 天预算

# 六、对用户原始假设的批判性评估
| 你假设 | 反向证据 | 调整建议 |

# 数据出处 + v2.1 待补
```

### 赛道识别方法（LLM 判断步骤）

1. 读取 `competitors_app` 全表，**过滤掉通用 AI Chat 噪声**（ChatGPT/Replika/Character/Perplexity/Genie/Poe/Kindroid/Math/SynClub/BALA/...）
2. 按 review_count 排序，看头部 20 个竞品
3. 用 `subtitle` + `description` 短语判断 mind-share，**不要用 App Store category**（category 太粗）
4. 同 mind-share 的竞品归为一个赛道，每赛道至少 2-3 个有效竞品
5. 按"赛道总 review × 估算 ARPU"算 TAM
6. 用户给的方向必须**也作为一条赛道**列出，并诚实评估其相对体量
7. 总赛道数 5-8 条；少于 5 → 数据不足，多于 8 → 颗粒度太细

### TAM 估算粗略公式

```
TAM = (赛道头部竞品 review × ~100 估算下载) × 估算 ARPU × 估算付费转化率 × 估算市场倍数
例：
TextNow 899K reviews → ~90M downloads → 5% 付费 × $5/月 ARPU × 12 = $270M ARR
Beside 8.5K → ~850K downloads → 10% 付费 × $30/月 × 12 = $2.5M ARR；市场 10x = $25M 天花板
```

> **不在 synthesis.md 写超长表格** — 详细数据全在 Excel + HTML 里。synthesis 只放：赛道总览表、每赛道卡片表、跨组合策略表、批判性评估表。

---

## 八、成本预算

单次完整 CIA 报告 ~$1-3：
- DataForSEO Keywords-for-App × 20 个竞品 ~ $0.30
- DataForSEO App Reviews × 5 个竞品 × 200 review ~ $0.03
- Apify TikTok + Reddit ~ $0.30

DataForSEO 余额查询：
```bash
curl -s -X GET "https://api.dataforseo.com/v3/appendix/user_data" \
  -H "Authorization: Basic $(python3 -c 'import json,pathlib; print(json.loads(pathlib.Path.home().joinpath(".claude/settings.json").read_text())["env"]["DATAFORSEO_BASIC_AUTH"])')" \
  | python3 -c "import sys,json; print('$'+str(json.load(sys.stdin)['tasks'][0]['result'][0]['money']['balance']))"
```

---

## 九、关键 don'ts

- ❌ **不要让 LLM 手抄数据进 markdown** — 全走 Python → SQLite → Excel/HTML
- ❌ **不要在 LLM 阶段砍数据** — Ahrefs 给多少 ingest 多少，导出层负责筛选展示
- ❌ **不要写"展示型"报告** — 投放团队要原始词单 (xlsx)，不是 15 行精选
- ❌ **不要单方向证明用户假设** — 必须给 3-5 条赛道并 TAM 现实检验
- ❌ **不要重复调 API** — 每次 run 前先 `cli.py status` 看 DB 已有什么；重跑要明确删表

---

## 十、扩展指南

新增数据源：
1. 加 fetcher 到 `scripts/fetchers/<name>.py`
2. 加 schema 到 `scripts/sql/schema.sql`
3. 加 CLI 命令到 `cli.py`
4. 加 sheet 到 `scripts/export/excel.py :: SHEETS`
5. 跑 `python3 cli.py status --topic <test>` 验证表可见

完整 schema：`scripts/sql/schema.sql`
原始 v1 skill（备份）：`SKILL.md.old`
