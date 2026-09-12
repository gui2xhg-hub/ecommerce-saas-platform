// pages/api/create-pix.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  const { amount, description, accessToken, orderId, payer } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: 'Token de acesso do Mercado Pago não configurado.' });
  }

  try {
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.trim()}`,
        'X-Idempotency-Key': `order-${orderId}-${Date.now()}`
      },
      body: JSON.stringify({
        transaction_amount: Number(amount),
        description: description || `Pedido #${orderId}`,
        payment_method_id: 'pix',
        payer: {
          email: payer?.email || 'cliente@loja.com',
          first_name: payer?.name || 'Cliente',
        }
      })
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Erro Mercado Pago API:", data);
      return res.status(mpResponse.status).json({ 
        error: data.message || data.cause?.[0]?.description || 'Erro ao gerar PIX no Mercado Pago' 
      });
    }

    const qrCode = data.point_of_interaction?.transaction_data?.qr_code;
    const qrCodeBase64 = data.point_of_interaction?.transaction_data?.qr_code_base64;

    return res.status(200).json({
      id: data.id,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64
    });
  } catch (error) {
    console.error("Erro interno do servidor:", error);
    return res.status(500).json({ error: 'Erro de comunicação no servidor' });
  }
}
