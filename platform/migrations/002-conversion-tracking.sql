-- migrations/002-conversion-tracking.sql
-- Closes I4 (conversion loop). Published content → tracked → attributed → revenue.
-- Honors Principle 04: "Traffic + Revenue Is the Only Goal."
--
-- Two tables:
--   tracking_handles   — one row per (content_item, channel) outbound link/post; what we PUT into the world
--   conversion_events  — one row per attributed signal pulled back from GA4/db/etc; what came BACK
--
-- Wire-up plan:
--   1. agent runner generates UTM + short URL + platform post-id at publish-time → insert into tracking_handles
--   2. nightly cron pulls GA4 / Plausible / app db → upserts into conversion_events keyed by handle
--   3. Per-agent ROI = sum(conversion_events.revenue_usd) / cost_usd grouped by agent over time window
--
-- Status: DRAFT 2026-05-25 · safe to run (additive, no destructive ops)

-- ----------------------------------------------------------------------
-- 1. tracking_handles — outbound, generated at publish-time
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tracking_handles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,

  -- The actual handle we put into the world. At least ONE of these is non-null.
  utm_campaign TEXT,          -- e.g. "voc-ai-reddit-2026-05-amazon-pain"
  short_url TEXT,             -- e.g. "https://sol.cx/r/k3n9"
  post_id TEXT,               -- platform-native ID, e.g. reddit submission id, X post id, gh release tag
  post_url TEXT,              -- canonical link to the live post

  channel TEXT NOT NULL,      -- reddit / x / linkedin / blog / youtube / etc.
  platform_handle TEXT,       -- which account published it (e.g. "@vocai09" / "u/sol_team")

  published_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',  -- channel-specific extras (subreddit, hashtags, video duration, ...)

  UNIQUE (content_item_id, channel, post_id),
  CHECK (utm_campaign IS NOT NULL OR short_url IS NOT NULL OR post_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tracking_handles_workspace ON tracking_handles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tracking_handles_agent ON tracking_handles(agent_id);
CREATE INDEX IF NOT EXISTS idx_tracking_handles_utm ON tracking_handles(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracking_handles_short ON tracking_handles(short_url) WHERE short_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracking_handles_post ON tracking_handles(channel, post_id) WHERE post_id IS NOT NULL;

-- ----------------------------------------------------------------------
-- 2. conversion_events — inbound, ingested from external systems
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_handle_id UUID NOT NULL REFERENCES tracking_handles(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Event taxonomy: keep small and orthogonal
  event_type TEXT NOT NULL,         -- impression | click | signup | activation | purchase | mcp_call
  source TEXT NOT NULL,             -- ga4 | plausible | own_db | reddit_insights | stripe | ...
  occurred_at TIMESTAMPTZ NOT NULL,

  -- Quantitative payload (any may be null)
  count INT DEFAULT 1,              -- N for batched events (impressions=N, clicks=N)
  revenue_usd NUMERIC(12,2),        -- only set on purchase/mcp_call/etc.
  user_id TEXT,                     -- de-duped user identifier from the source system
  metadata JSONB DEFAULT '{}',      -- raw event payload for forensics

  -- Idempotency: same (handle, source, event_type, source_event_id) cannot duplicate
  source_event_id TEXT,
  UNIQUE (tracking_handle_id, source, event_type, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_workspace ON conversion_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_handle ON conversion_events(tracking_handle_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_type_time ON conversion_events(event_type, occurred_at DESC);

-- ----------------------------------------------------------------------
-- 3. Per-agent ROI view — read-only convenience, dashboard queries this
-- ----------------------------------------------------------------------
CREATE OR REPLACE VIEW agent_roi_30d AS
SELECT
  th.workspace_id,
  th.agent_id,
  th.channel,
  COUNT(DISTINCT th.id)                                                                       AS published_count,
  COUNT(*) FILTER (WHERE ce.event_type = 'impression')                                        AS impression_events,
  COALESCE(SUM(ce.count) FILTER (WHERE ce.event_type = 'impression'), 0)                      AS impressions,
  COALESCE(SUM(ce.count) FILTER (WHERE ce.event_type = 'click'), 0)                           AS clicks,
  COALESCE(SUM(ce.count) FILTER (WHERE ce.event_type IN ('signup','activation')), 0)          AS signups,
  COALESCE(SUM(ce.count) FILTER (WHERE ce.event_type IN ('purchase','mcp_call')), 0)          AS conversions,
  COALESCE(SUM(ce.revenue_usd) FILTER (WHERE ce.occurred_at > now() - INTERVAL '30 days'), 0) AS revenue_usd_30d
FROM tracking_handles th
LEFT JOIN conversion_events ce
       ON ce.tracking_handle_id = th.id
      AND ce.occurred_at > now() - INTERVAL '30 days'
WHERE th.published_at > now() - INTERVAL '30 days'
GROUP BY th.workspace_id, th.agent_id, th.channel;

-- ----------------------------------------------------------------------
-- 4. Optional: extend content_items with a published_at watermark
-- ----------------------------------------------------------------------
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE content_items ADD COLUMN IF NOT EXISTS first_tracked_at TIMESTAMPTZ;
