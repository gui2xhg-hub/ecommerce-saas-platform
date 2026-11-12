// USO EXCLUSIVO NO SERVIDOR (pasta pages/api). Nunca importe este arquivo em uma página.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
// Usa a chave secreta (service_role) se estiver configurada na Vercel; senão, a chave pública.
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const serverSupabase = createClient(url, key, { auth: { persistSession: false } });

// Campos que NUNCA devem sair do servidor para páginas públicas.
const SECRET_KEY_PATTERN = /(password|senha|token|secret|api_key|apikey|access_key|pin)$/i;
const TENANT_PRIVATE_FIELDS = ['admin_password', 'financial_password', 'pix_access_token', 'bot_whatsapp_token', 'api_key', 'instance_id', 'bot_whatsapp_instance'];

export function sanitizeTenant(t) {
  if (!t) return t;
  const clean = {};
  Object.keys(t).forEach((k) => {
    if (TENANT_PRIVATE_FIELDS.includes(k) || SECRET_KEY_PATTERN.test(k)) return;
    clean[k] = t[k];
  });
  return clean;
}

export function sanitizeProfessional(p, { keepCommission = false } = {}) {
  if (!p) return p;
  const clean = {};
  Object.keys(p).forEach((k) => {
    if (k === 'pin' || SECRET_KEY_PATTERN.test(k)) return;
    if (!keepCommission && k === 'commission_percentage') return;
    clean[k] = p[k];
  });
  // Informa só SE o profissional tem PIN (sem revelar qual é)
  clean.has_pin = !!(p.pin && String(p.pin).trim() !== '');
  return clean;
}
