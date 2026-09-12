export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { amount, description, accessToken, orderId, token, installments, paymentMethodId, payer } = req.body;

  if (!accessToken || !token || !amount) {
    return res.status(400).json({ error: 'Dados insuficientes para processar o cartão.' });
  }

  try {
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Idempotency-Key': `order-card-${orderId}-${Date.now()}`
      },
      body: JSON.stringify({
        transaction_amount: Number(amount),
        token: token, // Token do cartão gerado no frontend
        description: description,
        installments: Number(installments || 1),
        payment_method_id: paymentMethodId,
        payer: {
          email: payer.email,
          first_name: payer.name,
          identification: {
            type: 'CPF',
            number: payer.cpf.replace(/\D/g, '')
          }
        }
      })
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      return res.status(mpResponse.status).json({
        error: data.message || 'Erro ao processar pagamento com cartão.',
        details: data
      });
    }

    return res.status(200).json({
      id: data.id,
      status: data.status, // approved, in_process, rejected
      status_detail: data.status_detail
    });
  } catch (err) {
    console.error('Erro no servidor ao processar cartão:', err);
    return res.status(500).json({ error: 'Erro interno ao conectar ao Mercado Pago.' });
  }
}
