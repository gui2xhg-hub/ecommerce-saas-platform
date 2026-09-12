// pages/api/create-preference.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { items, accessToken, orderId, tenantName, customerPhone, customerName } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: 'Token do Mercado Pago não configurado.' });
  }

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken.trim()}`
      },
      body: JSON.stringify({
        items: items.map(item => ({
          title: item.name,
          quantity: Number(item.quantity),
          unit_price: Number(item.price),
          currency_id: 'BRL'
        })),
        payer: {
          name: customerName,
          phone: { number: customerPhone }
        },
        external_reference: String(orderId),
        statement_descriptor: tenantName?.substring(0, 15) || 'LOJA ONLINE'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro Preference MP:", data);
      return res.status(response.status).json({ error: data.message || 'Erro ao criar preferência de pagamento' });
    }

    // Retorna o link de pagamento do Mercado Pago
    return res.status(200).json({
      init_point: data.init_point // Link de pagamento oficial
    });
  } catch (error) {
    console.error("Erro interno no servidor:", error);
    return res.status(500).json({ error: 'Erro ao conectar com o Mercado Pago' });
  }
}
