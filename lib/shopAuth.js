// Login da EQUIPE da loja (painel, fila de produção). A senha é conferida no servidor.
const key = (slug) => `sinerge_shop_token_${String(slug || '').toLowerCase()}`;

export const getShopToken = (slug) => { try { return localStorage.getItem(key(slug)) || ''; } catch (e) { return ''; } };
export const saveShopToken = (slug, t) => { try { localStorage.setItem(key(slug), t); } catch (e) {} };
export const clearShopToken = (slug) => { try { localStorage.removeItem(key(slug)); } catch (e) {} };

export async function shopLogin(slug, password) {
  try {
    const r = await fetch('/api/store-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, password }) });
    const d = await r.json();
    if (d.ok && d.token) saveShopToken(slug, d.token);
    return d;
  } catch (e) {
    return { ok: false, error: 'Falha de conexão' };
  }
}

export async function shopSessionValid(slug) {
  const token = getShopToken(slug);
  if (!token) return false;
  try {
    const r = await fetch('/api/store-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, token }) });
    const d = await r.json();
    return !!d.ok;
  } catch (e) {
    return false;
  }
}
