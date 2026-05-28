// In-memory products store.
// Persists for the lifetime of the function instance.
// Vercel may cold-start and lose state — v2 will move to Vercel KV / Postgres.

const PRODUCTS = [];
let nextId = 1;

function listProducts() {
  return PRODUCTS.slice().sort((a, b) => b.created_at_ms - a.created_at_ms);
}

function addProduct(p) {
  const product = {
    id: String(nextId++),
    name: String(p.name || '').slice(0, 200),
    url: String(p.url || '').slice(0, 500),
    description: String(p.description || '').slice(0, 2000),
    channels: Array.isArray(p.channels) ? p.channels.slice(0, 20) : [],
    status: String(p.status || 'onboarding').slice(0, 32),
    created_at_ms: Date.now(),
    created_at: new Date().toISOString()
  };
  PRODUCTS.push(product);
  return product;
}

function getProduct(id) {
  return PRODUCTS.find(p => p.id === id) || null;
}

function deleteProduct(id) {
  const i = PRODUCTS.findIndex(p => p.id === id);
  if (i < 0) return false;
  PRODUCTS.splice(i, 1);
  return true;
}

module.exports = { listProducts, addProduct, getProduct, deleteProduct };
