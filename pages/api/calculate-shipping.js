export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  const { originCep, destinationCep, items, token } = req.body;

  if (!originCep || !destinationCep) {
    return res.status(400).json({ error: 'CEPs de origem e destino são obrigatórios.' });
  }

  const cleanOrigin = String(originCep).replace(/\D/g, '');
  const cleanDestination = String(destinationCep).replace(/\D/g, '');

  if (cleanDestination.length !== 8) {
    return res.status(400).json({ error: 'CEP de destino inválido.' });
  }

  // Sanitização e aplicação de fallbacks para o carrinho
  const formattedProducts = items.map(item => ({
    id: String(item.id),
    width: Number(item.width_cm) || 15,
    height: Number(item.height_cm) || 10,
    length: Number(item.length_cm) || 20,
    weight: Number(item.weight_kg) || 0.3,
    insurance_value: Number(item.price) || 0,
    quantity: Number(item.quantity) || 1
  }));

  // Token fallback: usa o token da loja ou o token master da sua plataforma SaaS
  const apiToken = token || process.env.MELHOR_ENVIO_SAAS_TOKEN;

  if (!apiToken) {
    // Retorno simulação simples caso o token ainda não esteja configurado
    return res.status(200).json([
      { name: 'PAC (Correios)', price: 24.90, days: 6, company: 'Correios' },
      { name: 'SEDEX (Correios)', price: 42.50, days: 2, company: 'Correios' }
    ]);
  }

  try {
    const response = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
        'User-Agent': 'SaaS-Ecommerce (contato@seusaas.com)'
      },
      body: JSON.stringify({
        from: { postal_code: cleanOrigin },
        to: { postal_code: cleanDestination },
        products: formattedProducts
      })
    });

    const data = await response.json();

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Erro ao calcular frete no gateway.' });
    }

    const options = data
      .filter(item => !item.error)
      .map(item => ({
        id: item.id,
        name: `${item.company.name} - ${item.name}`,
        price: parseFloat(item.price),
        days: item.delivery_time,
        company: item.company.name
      }));

    return res.status(200).json(options);
  } catch (err) {
    return res.status(500).json({ error: 'Falha na comunicação com a API de frete.' });
  }
}
