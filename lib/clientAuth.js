// Funções de login usadas pelas páginas (navegador). As senhas são conferidas no servidor.

const tokenKey = (slug) => `sinerge_token_${String(slug || '').toLowerCase()}`;

export function getSavedToken(slug) {
  try { return localStorage.getItem(tokenKey(slug)) || ''; } catch (e) { return ''; }
}

export function saveToken(slug, token) {
  try { localStorage.setItem(tokenKey(slug), token); } catch (e) {}
}

export function clearToken(slug) {
  try { localStorage.removeItem(tokenKey(slug)); } catch (e) {}
}

// scope: 'admin' | 'agenda' | 'financial' | 'prof_fin' | 'agenda_prices' | 'change_fin_pass'
export async function apiLogin(slug, scope, password, extra = {}) {
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, scope, password, ...extra })
    });
    const data = await r.json();
    return data && data.ok ? data : { ok: false, error: data?.error };
  } catch (e) {
    return { ok: false, error: 'Falha de conexão' };
  }
}

// Confere se o token salvo ainda vale. Retorna o nível ('admin' | 'agenda') ou null.
export async function checkSession(slug) {
  const token = getSavedToken(slug);
  if (!token) return null;
  try {
    const r = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, token })
    });
    const data = await r.json();
    return data && data.ok ? data.level : null;
  } catch (e) {
    return null;
  }
}

// Migra o login antigo (senha guardada no aparelho) para o novo token, sem pedir senha de novo.
export async function migrateLegacyLogin(slug) {
  try {
    const oldPass = localStorage.getItem('sinerge_tenant_pass');
    const oldSlug = localStorage.getItem('sinerge_tenant_slug');
    if (!oldPass) return null;
    if (oldSlug && String(oldSlug).toLowerCase() !== String(slug).toLowerCase()) return null;
    const res = await apiLogin(slug, 'admin', oldPass);
    if (res.ok && res.token) {
      saveToken(slug, res.token);
      localStorage.removeItem('sinerge_tenant_pass');
      return res.level;
    }
  } catch (e) {}
  return null;
}
