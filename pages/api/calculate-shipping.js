// Frete por CEP com o Melhor Envio. O token e o CEP de origem da loja são lidos no servidor.
// Se a loja não configurou o Melhor Envio, devolve lista vazia e a vitrine usa a estimativa padrão.
import { loadTenantById } from '../../lib/storeServer';
import { serverSupabase } from '../../lib/serverSupabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const { tenant_id, destinationCep, items } = req.body || {};
  const cleanDestination = String(destinationCep || '').replace(/\D/g, '');
  if (!tenant_id || cleanDestination.length !== 8) return res.status(400).json({ error: 'CEP de destino inválido.' });

  try {
    const tenant = await loadTenantById(tenant_id);
    const token = tenant?.melhorenvio_token || process.env.MELHOR_ENVIO_SAAS_TOKEN;
    const origin = String(tenant?.origin_cep || '').replace(/\D/g, '');
    if (!token || origin.length !== 8) return res.status(200).json({ options: [], reason: 'not_configured' });

    // Medidas vêm do cadastro do produto (não do navegador)
    const ids = (items || []).map((i) => i.id).filter(Boolean);
    const { data: prods } = ids.length ? await serverSupabase.from('products').select('*').in('id', ids).eq('tenant_id', tenant_id) : { data: [] };
    const products = (items || []).filter((i) => !i.is_digital).map((i) => {
      const p = (prods || []).find((x) => String(x.id) === String(i.id)) || {};
      return {
        id: String(i.id),
        width: Number(p.width_cm) || 15,
        height: Number(p.height_cm) || 10,
        length: Number(p.length_cm) || 20,
        weight: Number(p.weight_kg) || 0.3,
        insurance_value: Number(p.price) || Number(i.price) || 0,
        quantity: Number(i.quantity) || 1
      };
    });
    if (products.length === 0) return res.status(200).json({ options: [] });

    const response = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${String(token).trim()}`,
        'User-Agent': 'Sinerge Catalogo (contato@sinergemkt.com)'
      },
      body: JSON.stringify({ from: { postal_code: origin }, to: { postal_code: cleanDestination }, products })
    });
    const data = await response.json();
    if (!Array.isArray(data)) return res.status(200).json({ options: [], reason: 'api_error' });

    const options = data
      .filter((o) => !o.error && o.price)
      .map((o) => ({
        id: String(o.id),
        name: `${o.company?.name || ''} ${o.name}`.trim(),
        fee: parseFloat(o.custom_price || o.price),
        time: o.delivery_time ? `${o.delivery_time} dia(s) úteis` : '',
        company: o.company?.name || ''
      }))
      .sort((a, b) => a.fee - b.fee);
    return res.status(200).json({ options });
  } catch (err) {
    console.error('calculate-shipping:', err);
    return res.status(200).json({ options: [], reason: 'api_error' });
  }
}
