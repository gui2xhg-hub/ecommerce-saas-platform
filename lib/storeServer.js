// USO EXCLUSIVO NO SERVIDOR (pages/api). Dados da loja e regras de pagamento.
import { serverSupabase } from './serverSupabase';

// Campos que nunca podem ir para o navegador do cliente
const PRIVATE_FIELDS = ['admin_password', 'financial_password', 'pix_access_token', 'melhorenvio_token', 'api_key', 'bot_whatsapp_token', 'instance_id'];
const SECRET_PATTERN = /(password|senha|token|secret|api_key|apikey)$/i;

export function sanitizeTenant(t) {
  if (!t) return t;
  const clean = {};
  Object.keys(t).forEach((k) => {
    if (PRIVATE_FIELDS.includes(k) || SECRET_PATTERN.test(k)) return;
    clean[k] = t[k];
  });
  const hasMp = !!(t.pix_access_token && String(t.pix_access_token).trim());
  // A loja só precisa saber SE pode cobrar online, nunca o token
  clean.pix_ready = !!t.pix_enabled && hasMp;
  clean.card_ready = hasMp;
  clean.shipping_api_ready = !!(t.melhorenvio_token && String(t.melhorenvio_token).trim() && t.origin_cep);
  return clean;
}

export async function loadTenantBySlug(slug) {
  const { data } = await serverSupabase.from('tenants').select('*').ilike('slug', String(slug || '').trim()).maybeSingle();
  return data;
}

export async function loadTenantById(id) {
  const { data } = await serverSupabase.from('tenants').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function loadOrder(tenantId, orderId) {
  const { data } = await serverSupabase.from('orders').select('*').eq('id', orderId).eq('tenant_id', tenantId).maybeSingle();
  return data;
}

// Valor que o cliente paga online: na locação com sinal, só o sinal; no resto, o total do pedido
export function amountToCharge(order) {
  const total = Number(order?.total) || 0;
  const down = Number(order?.down_payment_value) || 0;
  if (order?.order_type === 'aluguel' && down > 0 && down < total) return Math.round(down * 100) / 100;
  return Math.round(total * 100) / 100;
}

// Dá baixa no pedido quando o Mercado Pago confirma o pagamento
export async function markOrderPaid(order) {
  if (!order) return null;
  const total = Number(order.total) || 0;
  const down = Number(order.down_payment_value) || 0;
  const partialRental = order.order_type === 'aluguel' && down > 0 && down < total;
  const patch = partialRental ? { payment_method: 'PIX (sinal pago)' } : { is_paid: true };
  if (!partialRental && order.is_paid) return order;
  await serverSupabase.from('orders').update(patch).eq('id', order.id).eq('tenant_id', order.tenant_id);
  return { ...order, ...patch };
}

export function mpHeaders(token, extra = {}) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${String(token || '').trim()}`, ...extra };
}

export function baseUrlFrom(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${proto}://${host}` : '';
}
