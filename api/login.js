// POST /api/login — { email, password } → sets HttpOnly session cookie
const { makeToken, setSessionCookie } = require('../lib/auth');

function parseBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', c => buf += c);
    req.on('end', () => {
      const ct = (req.headers['content-type'] || '').toLowerCase();
      try {
        if (ct.includes('application/json')) {
          resolve(JSON.parse(buf || '{}'));
        } else {
          const params = new URLSearchParams(buf);
          const out = {};
          for (const [k, v] of params) out[k] = v;
          resolve(out);
        }
      } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }
  const body = await parseBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || '';

  if (!adminEmail || !adminPass) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'admin credentials not configured' }));
    return;
  }

  if (email !== adminEmail || password !== adminPass) {
    res.statusCode = 401;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'invalid credentials' }));
    return;
  }

  const token = makeToken(email);
  setSessionCookie(res, token);

  const accept = (req.headers.accept || '').toLowerCase();
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/x-www-form-urlencoded') && accept.includes('text/html')) {
    res.statusCode = 303;
    res.setHeader('location', '/dashboard');
    res.end();
    return;
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: true, email, redirect: '/dashboard' }));
};
