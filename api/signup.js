// 11agents.ai · first-user / Kickstarter early-bird signup endpoint
// Self-contained — no third-party activation flow.
// Submissions are logged to Vercel function logs (pull via `vercel logs --scope solvea1 11agents-ai`).

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ ok: true, endpoint: '11agents.ai/api/signup', method: 'POST', accepts: 'application/x-www-form-urlencoded | application/json' }),
      { headers: { 'content-type': 'application/json' } }
    );
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let data = {};
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      data = await req.json();
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      for (const [k, v] of params) data[k] = v;
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'bad body' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const email = String(data.email || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid email' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const submission = {
    received_at: new Date().toISOString(),
    email,
    name: String(data.name || '').slice(0, 200),
    company: String(data.company || '').slice(0, 200),
    tier: String(data.tier || '').slice(0, 64),
    source: String(data.source || '').slice(0, 200),
    ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    user_agent: (req.headers.get('user-agent') || '').slice(0, 400),
    referer: (req.headers.get('referer') || '').slice(0, 400)
  };

  // Persistent server-side log line — appears in `vercel logs`
  console.log('[11agents.ai/signup]', JSON.stringify(submission));

  // Optional fan-out to a webhook if env var is set (Slack/Discord/Telegram/ntfy)
  const hook = (typeof process !== 'undefined' && process.env && process.env.SIGNUP_WEBHOOK_URL) || '';
  if (hook) {
    try {
      await fetch(hook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `[11agents.ai] new signup: ${submission.email} (${submission.tier || 'no tier'}, from ${submission.name || 'anon'} @ ${submission.company || '-'})`, submission })
      });
    } catch (e) { /* don't fail the signup if webhook flakes */ }
  }

  // If browser submitted a regular HTML form, redirect to thanks page.
  const wantsRedirect = ct.includes('application/x-www-form-urlencoded') && (req.headers.get('accept') || '').includes('text/html');
  if (wantsRedirect) {
    const url = new URL('/?thanks=1', req.url);
    return Response.redirect(url.toString(), 303);
  }

  return new Response(JSON.stringify({ ok: true, message: 'Signup received. We will notify you at Kickstarter launch.', received_at: submission.received_at }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}
