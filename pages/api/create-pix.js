// Gera o PIX do Mercado Pago. O token da loja é lido AQUI no servidor (nunca vem do navegador)
// e o valor vem do pedido gravado no banco (o navegador não escolhe o valor).
import { loadTenantById, loadOrder, amountToCharge, mpHeaders, baseUrlFrom } from '../../lib/storeServer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const { tenant_id, orderId, description, payer } = req.body || {};
  if (!tenant_id || !orderId) return res.status(400).json({ error: 'Pedido inválido.' });

  try {
    const tenant = await loadTenantById(tenant_id);
    if (!tenant?.pix_access_token) return res.status(400).json({ error: 'PIX automático não configurado na loja.' });
    const order = await loadOrder(tenant_id, orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const amount = amountToCharge(order);
    if (!(amount > 0)) return res.status(400).json({ error: 'Valor do pedido inválido.' });

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: mpHeaders(tenant.pix_access_token, { 'X-Idempotency-Key': `order-${orderId}-${Date.now()}` }),
      body: JSON.stringify({
        transaction_amount: amount,
        description: description || `Pedido #${orderId} - ${tenant.name}`,
        payment_method_id: 'pix',
        external_reference: String(orderId),
        ...(baseUrlFrom(req).startsWith('https://') ? { notification_url: `${baseUrlFrom(req)}/api/mp-webhook?tenant_id=${encodeURIComponent(tenant.id)}` } : {}),
        payer: {
          email: payer?.email || 'cliente@loja.com',
          first_name: payer?.name || 'Cliente'
        }
      })
    });
    const data = await mpResponse.json();
    if (!mpResponse.ok) {
      console.error('Erro Mercado Pago API:', data);
      return res.status(mpResponse.status).json({ error: data.message || data.cause?.[0]?.description || 'Erro ao gerar PIX no Mercado Pago' });
    }
    return res.status(200).json({
      id: data.id,
      amount,
      qr_code: data.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64
    });
  } catch (error) {
    console.error('create-pix:', error);
    return res.status(500).json({ error: 'Erro de comunicação no servidor' });
  }
}
