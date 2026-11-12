// MÓDULO LOCAÇÃO — ROBÔ DE LEMBRETES (roda 1x por dia pela Vercel, ver vercel.json)
//  * Dia anterior à retirada/entrega  -> "lembrete_entrega"
//  * Dia anterior à devolução         -> "lembrete_devolucao"
//  * Devolução atrasada               -> "atraso" (uma vez)
// Só envia para lojas com o módulo ligado E com a API de WhatsApp ativa.
// Segurança: defina CRON_SECRET nas variáveis da Vercel (a Vercel envia automaticamente).
import { serverSupabase } from '../../lib/serverSupabase';
import { sendWhatsApp, isConfigComplete } from '../../lib/whatsapp';
import { getRentalSettings, renderTemplate, buildOrderMessageVars, addDaysISO } from '../../lib/rental';

export default async function handler(req, res) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  const auth = req.headers.authorization || '';
  if (!secret || (auth !== `Bearer ${secret}` && req.query.secret !== secret)) {
    return res.status(401).json({ ok: false, error: 'Não autorizado (configure CRON_SECRET)' });
  }

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const tomorrow = addDaysISO(today, 1);
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const baseUrl = host ? `https://${host}` : '';
  const log = [];

  const { data: tenants } = await serverSupabase.from('tenants').select('*').eq('rental_module_enabled', true);

  for (const tenant of tenants || []) {
    const { data: cfg } = await serverSupabase.from('rental_whatsapp_config').select('*').eq('tenant_id', tenant.id).maybeSingle();
    if (!isConfigComplete(cfg)) continue;
    const settings = getRentalSettings(tenant);

    const { data: orders } = await serverSupabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('order_type', 'aluguel')
      .lte('rental_start', tomorrow)
      .gte('rental_end', addDaysISO(today, -30));

    for (const o of orders || []) {
      if (o.status === 'cancelado' || ['cancelado', 'devolvido'].includes(o.rental_status)) continue;
      const st = o.rental_status || 'reservado';
      let event = null;
      let flag = null;

      if (o.rental_start === tomorrow && ['reservado', 'confirmado'].includes(st) && !o.reminder_delivery_sent) {
        event = 'lembrete_entrega'; flag = 'reminder_delivery_sent';
      } else if (o.rental_end === tomorrow && st === 'entregue' && !o.reminder_return_sent) {
        event = 'lembrete_devolucao'; flag = 'reminder_return_sent';
      } else if (o.rental_end < today && st === 'entregue' && !o.overdue_notified) {
        event = 'atraso'; flag = 'overdue_notified';
      }
      if (!event) continue;

      const text = renderTemplate(settings.templates[event], buildOrderMessageVars(o, tenant, baseUrl));
      const r = await sendWhatsApp(cfg, o.customer_phone, text);
      if (r.ok) await serverSupabase.from('orders').update({ [flag]: true }).eq('id', o.id);
      log.push(`${tenant.slug} #${o.id} ${event}: ${r.ok ? 'enviado' : 'falhou - ' + r.error}`);
    }
  }

  return res.status(200).json({ ok: true, today, processed: log.length, log });
}
