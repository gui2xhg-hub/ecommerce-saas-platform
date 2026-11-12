// USO NO SERVIDOR (pages/api). Envia mensagens pela API de WhatsApp que a loja contratou.
// Provedores prontos: Evolution API, Z-API e Webhook (n8n, Make, outra API qualquer).

export const WHATSAPP_PROVIDERS = {
  evolution: 'Evolution API',
  zapi: 'Z-API',
  webhook: 'Webhook / Outra API'
};

export function normalizePhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.length <= 11 ? `55${clean}` : clean;
}

// Monta a requisição de cada provedor (separado para facilitar testes)
export function buildProviderRequest(config, phone, text) {
  const number = normalizePhone(phone);
  const provider = config?.provider || 'evolution';
  const base = String(config?.api_url || '').trim().replace(/\/+$/, '');

  if (provider === 'zapi') {
    // Documentação: POST https://api.z-api.io/instances/{ID}/token/{TOKEN}/send-text  (cabeçalho Client-Token)
    const zBase = base || 'https://api.z-api.io';
    const headers = { 'Content-Type': 'application/json' };
    if (config?.client_token) headers['Client-Token'] = config.client_token;
    return {
      url: `${zBase}/instances/${encodeURIComponent(config?.instance || '')}/token/${encodeURIComponent(config?.api_token || '')}/send-text`,
      options: { method: 'POST', headers, body: JSON.stringify({ phone: number, message: text }) }
    };
  }

  if (provider === 'webhook') {
    const headers = { 'Content-Type': 'application/json' };
    if (config?.api_token) headers.Authorization = `Bearer ${config.api_token}`;
    return {
      url: base,
      options: { method: 'POST', headers, body: JSON.stringify({ phone: number, message: text, instance: config?.instance || '' }) }
    };
  }

  // Evolution API v2: POST {URL}/message/sendText/{INSTANCIA}  (cabeçalho apikey)
  return {
    url: `${base}/message/sendText/${encodeURIComponent(config?.instance || '')}`,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config?.api_token || '' },
      body: JSON.stringify({ number, text })
    }
  };
}

export function isConfigComplete(config) {
  if (!config || !config.active) return false;
  if (config.provider === 'zapi') return !!(config.instance && config.api_token);
  if (config.provider === 'webhook') return !!config.api_url;
  return !!(config.api_url && config.instance && config.api_token);
}

export async function sendWhatsApp(config, phone, text) {
  if (!isConfigComplete(config)) return { ok: false, error: 'API de WhatsApp não configurada' };
  if (!normalizePhone(phone)) return { ok: false, error: 'Telefone inválido' };
  const { url, options } = buildProviderRequest(config, phone, text);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    let body = null;
    try { body = await res.json(); } catch (e) {}
    if (!res.ok) return { ok: false, status: res.status, error: (body && (body.message || body.error)) || `A API respondeu ${res.status}` };
    return { ok: true, status: res.status, body };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'A API demorou demais para responder' : e.message };
  }
}
