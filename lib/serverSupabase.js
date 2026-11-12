// USO EXCLUSIVO NO SERVIDOR (pasta pages/api). Nunca importe este arquivo em uma página.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
// Usa a chave secreta (service_role) se estiver configurada na Vercel; senão, a chave pública.
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const serverSupabase = createClient(url, key, { auth: { persistSession: false } });
