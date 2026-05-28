// DingTalk robot webhook poster. Reads GTM_DINGTALK_WEBHOOK from env.
// Silently skips if env is unset (so dev / Railway-without-secret won't fail).

const WEBHOOK = process.env.GTM_DINGTALK_WEBHOOK || ''

export const hasDingTalk = () => Boolean(WEBHOOK)

export async function pushMarkdown(title, text) {
  if (!WEBHOOK) {
    console.log('[dingtalk] skip — GTM_DINGTALK_WEBHOOK not set')
    return { ok: false, skipped: true }
  }
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { title, text } }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.errcode !== 0) {
      console.error(`[dingtalk] push failed: ${r.status} ${JSON.stringify(j)}`)
      return { ok: false, status: r.status, body: j }
    }
    console.log(`[dingtalk] pushed: "${title}"`)
    return { ok: true }
  } catch (e) {
    console.error(`[dingtalk] error: ${e.message}`)
    return { ok: false, error: e.message }
  }
}

export async function pushText(content) {
  if (!WEBHOOK) return { ok: false, skipped: true }
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ msgtype: 'text', text: { content } }),
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok && j.errcode === 0, status: r.status, body: j }
}
