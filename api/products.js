const { getSession } = require('../lib/auth');
const { listProducts, addProduct, deleteProduct } = require('../lib/store');

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
          for (const [k, v] of params.entries()) {
            if (k.endsWith('[]')) {
              const base = k.slice(0, -2);
              if (!Array.isArray(out[base])) out[base] = [];
              out[base].push(v);
            } else {
              out[k] = v;
            }
          }
          if (typeof out.channels === 'string') {
            out.channels = out.channels.split(',').map(s => s.trim()).filter(Boolean);
          }
          resolve(out);
        }
      } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) {
    res.statusCode = 401;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
    return;
  }

  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ ok: true, products: listProducts() }));
    return;
  }

  if (req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.name) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'name required' }));
      return;
    }
    const product = addProduct(body);
    console.log('[admin/products] created:', JSON.stringify({ ...product, _by: session.email }));

    const accept = (req.headers.accept || '').toLowerCase();
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/x-www-form-urlencoded') && accept.includes('text/html')) {
      res.statusCode = 303;
      res.setHeader('location', '/dashboard?added=' + encodeURIComponent(product.id));
      res.end();
      return;
    }

    res.statusCode = 201;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, product }));
    return;
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url, 'http://x');
    const id = url.searchParams.get('id');
    if (!id) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'id required' }));
      return;
    }
    const removed = deleteProduct(id);
    res.statusCode = removed ? 200 : 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: removed }));
    return;
  }

  res.statusCode = 405;
  res.end('Method Not Allowed');
};
