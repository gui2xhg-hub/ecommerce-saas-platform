export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { amount, description, payer, accessToken, orderId } = req.body;

  if (!accessToken || !amount) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes (accessToken ou amount)' });
  }

  try {
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Idempotency-Key': `order-${orderId}-${Date.now()}`
      },
      body: JSON.stringify({
        transaction_amount: Number(amount),
        description: description || `Pedido #${orderId}`,
        payment_method_id: 'pix',
        payer: {
          email: payer?.email || 'cliente@sac.com',
          first_name: payer?.name || 'Cliente'
        }
      })
    });

    const data = await mpResponse.json();

    if (mpResponse.ok && data.point_of_interaction?.transaction_data) {
      return res.status(200).json({
        id: data.id,
        qr_code_base64: data.point_of_interaction.transaction_data.qr_code_base64,
        qr_code: data.point_of_interaction.transaction_data.qr_code
      });
    } else {
      return res.status(400).json({ error: 'Erro ao gerar PIX no Mercado Pago', details: data });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Erro de conexão no servidor', details: err.message });
  }
}
