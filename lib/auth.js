// Tiny session library — HMAC-signed cookie, no deps.
// Cookie name: __11a_session
// Format: base64(email|issued_at).hexHmac(SHA256, SESSION_SECRET)

const crypto = require('crypto');

const COOKIE_NAME = '__11a_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET env not set');
  return s;
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

function makeToken(email) {
  const payload = `${email}|${Date.now()}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  let payload;
  try { payload = Buffer.from(b64, 'base64url').toString(); }
  catch (e) { return null; }
  if (sign(payload) !== sig) return null;
  const [email, ts] = payload.split('|');
  if (!email || !ts) return null;
  if (Date.now() - parseInt(ts, 10) > MAX_AGE_MS) return null;
  return { email, issuedAt: parseInt(ts, 10) };
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i < 0) return;
    const k = p.slice(0, i).trim();
    const v = decodeURIComponent(p.slice(i + 1).trim());
    out[k] = v;
  });
  return out;
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return verifyToken(cookies[COOKIE_NAME]);
}

function setSessionCookie(res, token) {
  const maxAgeSec = Math.floor(MAX_AGE_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAgeSec}; Path=/; HttpOnly; Secure; SameSite=Lax`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    res.statusCode = 401;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
    return null;
  }
  return session;
}

module.exports = {
  COOKIE_NAME,
  makeToken,
  verifyToken,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth
};
