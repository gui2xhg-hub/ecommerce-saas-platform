// MÓDULO LOCAÇÃO — WhatsApp da loja
// Ações:
//   send        -> envia uma mensagem automática de um pedido (confirmação, lembrete...)
//   get_config  -> lê a configuração da API (token mascarado)        [senha do admin]
//   save_config -> salva a configuração da API                        [senha do admin]
//   test        -> envia uma mensagem de teste                        [senha do admin]
// Se a API não estiver configurada, devolve "fallback_url" (link wa.me) para o painel/loja abrir.
import { serverSupabase } from '../../lib/serverSupabase';
import { isAdminPassword } from '../../lib/adminAuth';
import { sendWhatsApp, normalizePhone, isConfigComplete } from '../../lib/whatsapp';
import { getRentalSettings, renderTemplate, buildOrderMessageVars } from '../../lib/rental';

const MASK = '••••••••';
const PUBLIC_EVENTS = ['pedido_recebido'];
const EVENTS = ['pedido_recebido', 'pedido_confirmado', 'lembrete_entrega', 'lembrete_devolucao', 'atraso', 'devolvido'];

const maskToken = (t) => (t ? `${MASK}${String(t).slice(-4)}` : '');

async function loadTenant(tenantId) {
  const { data } = await serverSupabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
  return data;
}

async function loadConfig(tenantId) {
  const { data } = await serverSupabase.from('rental_whatsapp_config').select('*').eq('tenant_id', tenantId).maybeSingle();
  return data;
}

function baseUrlFrom(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${proto}://${host}` : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { action, tenant_id, password } = req.body || {};
  if (!tenant_id) return res.status(400).json({ ok: false, error: 'tenant_id obrigatório' });

  try {
    const tenant = await loadTenant(tenant_id);
    if (!tenant) return res.status(404).json({ ok: false, error: 'Loja não encontrada' });
    const isAdmin = isAdminPassword(tenant, password);

    // ---------------- CONFIGURAÇÃO ----------------
    if (action === 'get_config') {
      if (!isAdmin) return res.status(401).json({ ok: false, error: 'Senha inválida' });
      const cfg = (await loadConfig(tenant_id)) || {};
      return res.status(200).json({
        ok: true,
        config: {
          provider: cfg.provider || 'evolution',
          api_url: cfg.api_url || '',
          instance: cfg.instance || '',
          api_token: maskToken(cfg.api_token),
          client_token: maskToken(cfg.client_token),
          notify_store: cfg.notify_store ?? true,
          active: cfg.active ?? false
        }
      });
    }

    if (action === 'save_config') {
      if (!isAdmin) return res.status(401).json({ ok: false, error: 'Senha inválida' });
      const incoming = req.body.config || {};
      const current = (await loadConfig(tenant_id)) || {};
      const keepIfMasked = (val, old) => (String(val || '').startsWith(MASK) ? old || '' : String(val || '').trim());
      const row = {
        tenant_id,
        provider: ['evolution', 'zapi', 'webhook'].includes(incoming.provider) ? incoming.provider : 'evolution',
        api_url: String(incoming.api_url || '').trim(),
        instance: String(incoming.instance || '').trim(),
        api_token: keepIfMasked(incoming.api_token, current.api_token),
        client_token: keepIfMasked(incoming.client_token, current.client_token),
        notify_store: incoming.notify_store !== false,
        active: !!incoming.active,
        updated_at: new Date().toISOString()
      };
      const { error } = await serverSupabase.from('rental_whatsapp_config').upsert(row, { onConflict: 'tenant_id' });
      if (error) return res.status(200).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, complete: isConfigComplete(row) });
    }

    if (action === 'test') {
      if (!isAdmin) return res.status(401).json({ ok: false, error: 'Senha inválida' });
      const cfg = await loadConfig(tenant_id);
      const phone = req.body.phone || tenant.whatsapp;
      if (!isConfigComplete(cfg)) return res.status(200).json({ ok: false, error: 'Preencha e ATIVE a configuração antes de testar.' });
      const r = await sendWhatsApp(cfg, phone, `✅ Teste do sistema de locação da *${tenant.name}*: a API de WhatsApp está funcionando!`);
      return res.status(200).json(r);
    }

    // ---------------- ENVIO DE MENSAGEM DE PEDIDO ----------------
    if (action === 'send') {
      const { order_id, event } = req.body;
      if (!EVENTS.includes(event)) return res.status(400).json({ ok: false, error: 'Evento inválido' });

      const { data: order } = await serverSupabase
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();
      if (!order) return res.status(404).json({ ok: false, error: 'Pedido não encontrado' });

      // A confirmação de pedido novo pode ser disparada pela loja (cliente) só logo após criar o pedido.
      if (!isAdmin) {
        const ageMin = (Date.now() - new Date(order.created_at || 0).getTime()) / 60000;
        if (!PUBLIC_EVENTS.includes(event) || ageMin > 15) {
          return res.status(401).json({ ok: false, error: 'Senha inválida' });
        }
      }

      const settings = getRentalSettings(tenant);
      const text = renderTemplate(settings.templates[event], buildOrderMessageVars(order, tenant, baseUrlFrom(req)));
      const customerPhone = normalizePhone(order.customer_phone);
      const fallback_url = customerPhone ? `https://wa.me/${customerPhone}?text=${encodeURIComponent(text)}` : '';

      const cfg = await loadConfig(tenant_id);
      if (!isConfigComplete(cfg)) {
        return res.status(200).json({ ok: true, sent: false, reason: 'not_configured', text, fallback_url });
      }

      const toCustomer = await sendWhatsApp(cfg, order.customer_phone, text);

      // Aviso para a própria loja quando chega pedido novo
      let toStore = null;
      if (event === 'pedido_recebido' && cfg.notify_store && tenant.whatsapp) {
        const storeText = `🔔 *NOVA RESERVA #${order.id}*\nCliente: ${order.customer_name} (${order.customer_phone})\n\n${text}`;
        toStore = await sendWhatsApp(cfg, tenant.whatsapp, storeText);
      }

      return res.status(200).json({ ok: true, sent: toCustomer.ok, error: toCustomer.error, store_sent: toStore ? toStore.ok : null, text, fallback_url });
    }

    return res.status(400).json({ ok: false, error: 'Ação inválida' });
  } catch (e) {
    console.error('rental-whatsapp:', e);
    return res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
}
