// Dados da loja para a vitrine — SEM senhas e SEM tokens de pagamento/frete.
import { loadTenantBySlug, sanitizeTenant } from '../../lib/storeServer';

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').trim();
  if (!slug) return res.status(400).json({ tenant: null });
  try {
    const t = await loadTenantBySlug(slug);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ tenant: t ? sanitizeTenant(t) : null });
  } catch (e) {
    console.error('public-store:', e);
    return res.status(500).json({ tenant: null, error: 'Erro ao carregar a loja' });
  }
}
