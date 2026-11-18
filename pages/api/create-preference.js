// Link de pagamento do Mercado Pago (cartão). Token e valor lidos no servidor.
// O Mercado Pago avisa o pagamento em /api/mp-webhook e o pedido é baixado sozinho.
import { loadTenantById, loadOrder, amountToCharge, mpHeaders, baseUrlFrom } from '../../lib/storeServer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const { tenant_id, orderId, customerPhone, customerName } = req.body || {};
  if (!tenant_id || !orderId) return res.status(400).json({ error: 'Pedido inválido.' });

  try {
    const tenant = await loadTenantById(tenant_id);
    if (!tenant?.pix_access_token) return res.status(400).json({ error: 'Pagamento online não configurado na loja.' });
    const order = await loadOrder(tenant_id, orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const amount = amountToCharge(order);
    const base = baseUrlFrom(req);
    const isPartial = amount < (Number(order.total) || 0);
    const orderUrl = base && tenant.slug ? `${base}/${tenant.slug}/pedido/${order.id}` : undefined;

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: mpHeaders(tenant.pix_access_token),
      body: JSON.stringify({
        items: [{
          title: `${order.order_type === 'aluguel' ? 'Reserva' : 'Pedido'} #${order.id}${isPartial ? ' (sinal)' : ''} - ${tenant.name}`.slice(0, 250),
          quantity: 1,
          unit_price: amount,
          currency_id: 'BRL'
        }],
        payer: { name: customerName, phone: { number: customerPhone } },
        external_reference: String(order.id),
        statement_descriptor: String(tenant.name || 'LOJA ONLINE').substring(0, 15),
        ...(base.startsWith('https://') ? { notification_url: `${base}/api/mp-webhook?tenant_id=${encodeURIComponent(tenant.id)}` } : {}),
        ...(orderUrl ? { back_urls: { success: orderUrl, pending: orderUrl, failure: orderUrl }, auto_return: 'approved' } : {})
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Erro Preference MP:', data);
      return res.status(response.status).json({ error: data.message || 'Erro ao criar preferência de pagamento' });
    }
    return res.status(200).json({ init_point: data.init_point });
  } catch (error) {
    console.error('create-preference:', error);
    return res.status(500).json({ error: 'Erro ao conectar com o Mercado Pago' });
  }
}
