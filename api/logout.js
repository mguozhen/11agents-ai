const { clearSessionCookie } = require('../lib/auth');

module.exports = async (req, res) => {
  clearSessionCookie(res);
  if ((req.headers.accept || '').toLowerCase().includes('text/html')) {
    res.statusCode = 303;
    res.setHeader('location', '/');
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
};
