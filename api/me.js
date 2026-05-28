const { getSession } = require('../lib/auth');

module.exports = async (req, res) => {
  const s = getSession(req);
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  if (!s) { res.statusCode = 401; res.end(JSON.stringify({ ok: false })); return; }
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, email: s.email, issued_at: s.issuedAt }));
};
