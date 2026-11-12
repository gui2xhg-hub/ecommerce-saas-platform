import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatBRL, formatDateBR, onlyDigits, isValidCNPJ, isValidCPF, num, addDaysISO, todayISO } from '../../lib/rental';

// Guarda o cliente/empresa identificado neste aparelho
const storageKey = (tenantId) => `rental_customer_${tenantId}`;

export function loadSavedRentalCustomer(tenantId) {
  try { return JSON.parse(localStorage.getItem(storageKey(tenantId)) || 'null'); } catch (e) { return null; }
}
export function saveRentalCustomer(tenantId, data) {
  try {
    if (data) localStorage.setItem(storageKey(tenantId), JSON.stringify(data));
    else localStorage.removeItem(storageKey(tenantId));
  } catch (e) {}
}

// Confere no banco se o cliente salvo continua aprovado e qual tabela de preço ele usa
export async function refreshRentalCustomer(tenantId, saved) {
  if (!saved?.document) return null;
  const { data: c } = await supabase
    .from('rental_customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('document', onlyDigits(saved.document))
    .maybeSingle();
  if (!c || c.status !== 'aprovado') return null;
  if (onlyDigits(c.phone) && !onlyDigits(c.phone).endsWith(onlyDigits(saved.phone).slice(-8))) return null;
  let table = null;
  if (c.price_table_id) {
    const { data: t } = await supabase.from('rental_price_tables').select('*').eq('id', c.price_table_id).eq('tenant_id', tenantId).maybeSingle();
    if (t && t.active) table = { id: t.id, name: t.name, discount_percent: num(t.discount_percent), applies_to_sales: !!t.applies_to_sales };
  }
  return { id: c.id, name: c.name, company_name: c.company_name, document: c.document, phone: c.phone, email: c.email, customer_type: c.customer_type, address: c.address, table };
}

// ---------------------------------------------------------------------
// Barra de datas da vitrine
// ---------------------------------------------------------------------
export function RentalDateBar({ start, end, onChange, days, error, settings, colors }) {
  const minStart = addDaysISO(todayISO(), parseInt(settings?.min_advance_days, 10) || 0);
  return (
    <div style={{ backgroundColor: colors.card }} className="p-3 rounded-2xl border border-white/10 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold" style={{ color: colors.primary }}>📅 Para quando é a locação?</span>
        {days > 0 && !error && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/30">{days} {settings?.day_count_mode === 'inclusivo' ? 'dia(s)' : 'diária(s)'}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] opacity-60 block mb-0.5">Retirada / entrega</label>
          <input type="date" min={minStart} value={start} onChange={(e) => onChange(e.target.value, end && end < e.target.value ? e.target.value : end)}
            style={{ backgroundColor: colors.bg, color: colors.text }} className="w-full border border-white/10 p-2 rounded-xl text-xs focus:outline-none" />
        </div>
        <div>
          <label className="text-[10px] opacity-60 block mb-0.5">Devolução</label>
          <input type="date" min={start || minStart} value={end} onChange={(e) => onChange(start, e.target.value)}
            style={{ backgroundColor: colors.bg, color: colors.text }} className="w-full border border-white/10 p-2 rounded-xl text-xs focus:outline-none" />
        </div>
      </div>
      {error && start && end && <p className="text-[10px] text-red-400 font-bold">{error}</p>}
      {!start && <p className="text-[10px] opacity-60">Escolha as datas para ver os preços do período e a disponibilidade de cada item.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Selo de disponibilidade
// ---------------------------------------------------------------------
export function AvailabilityBadge({ info, needed = 1 }) {
  if (!info) return null;
  if (info.available === null || info.available === undefined) return <span className="text-[9px] font-bold text-green-400">✅ Disponível</span>;
  if (info.available <= 0) return <span className="text-[9px] font-bold text-red-400">❌ Indisponível nessas datas</span>;
  if (info.available < needed) return <span className="text-[9px] font-bold text-yellow-400">⚠️ Só {info.available} disponível(is)</span>;
  return <span className="text-[9px] font-bold text-green-400">✅ {info.available} disponível(is)</span>;
}

// ---------------------------------------------------------------------
// "Sou empresa" — entrar ou se cadastrar (CNPJ / CPF)
// ---------------------------------------------------------------------
export function CompanyAccessModal({ tenant, onClose, onLogged, colors }) {
  const [tab, setTab] = useState('entrar');
  const [doc, setDoc] = useState('');
  const [phone, setPhone] = useState('');
  const [form, setForm] = useState({ customer_type: 'PJ', name: '', company_name: '', document: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const field = { backgroundColor: colors.bg, color: colors.text };
  const cls = 'w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none';

  const login = async (e) => {
    e.preventDefault();
    const d = onlyDigits(doc);
    if (!(d.length === 11 || d.length === 14)) return setMessage('Digite um CPF ou CNPJ válido.');
    if (onlyDigits(phone).length < 10) return setMessage('Digite o WhatsApp cadastrado, com DDD.');
    setBusy(true);
    const { data: c } = await supabase.from('rental_customers').select('status, phone').eq('tenant_id', tenant.id).eq('document', d).maybeSingle();
    if (!c) { setBusy(false); return setMessage('Cadastro não encontrado. Use a aba "Cadastrar".'); }
    if (c.status === 'pendente') { setBusy(false); return setMessage('⏳ Seu cadastro está em análise pela loja. Assim que for aprovado, os preços especiais aparecem aqui.'); }
    if (c.status !== 'aprovado') { setBusy(false); return setMessage('Cadastro indisponível. Fale com a loja pelo WhatsApp.'); }
    const full = await refreshRentalCustomer(tenant.id, { document: d, phone });
    setBusy(false);
    if (!full) return setMessage('O WhatsApp não confere com o cadastro.');
    saveRentalCustomer(tenant.id, { document: d, phone: onlyDigits(phone) });
    onLogged(full);
  };

  const signup = async (e) => {
    e.preventDefault();
    const d = onlyDigits(form.document);
    if (form.customer_type === 'PJ' ? !isValidCNPJ(d) : !isValidCPF(d)) return setMessage(`${form.customer_type === 'PJ' ? 'CNPJ' : 'CPF'} inválido.`);
    if (!form.name.trim() || onlyDigits(form.phone).length < 10) return setMessage('Preencha o nome e o WhatsApp com DDD.');
    setBusy(true);
    const { error } = await supabase.from('rental_customers').insert([{
      tenant_id: tenant.id, customer_type: form.customer_type, name: form.name.trim(), company_name: form.company_name.trim(),
      document: d, phone: onlyDigits(form.phone), email: form.email.trim(), status: 'pendente'
    }]);
    setBusy(false);
    if (error) return setMessage(String(error.message).includes('duplicate') ? 'Este documento já tem cadastro. Use a aba "Entrar".' : 'Erro ao cadastrar: ' + error.message);
    setMessage('✅ Cadastro enviado! A loja vai analisar e liberar seus preços especiais.');
    const wa = onlyDigits(tenant.whatsapp);
    if (wa) {
      const msg = `Olá! Acabei de fazer o cadastro de ${form.customer_type === 'PJ' ? 'empresa' : 'cliente'} na loja.\n*${form.company_name || form.name}*\nDocumento: ${d}\nPode aprovar meu cadastro?`;
      setTimeout(() => window.open(`https://wa.me/${wa.length <= 11 ? '55' + wa : wa}?text=${encodeURIComponent(msg)}`, '_blank'), 600);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div style={{ backgroundColor: colors.card, color: colors.text }} className="border border-white/10 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-white/10 pb-2">
          <h3 className="font-bold text-sm" style={{ color: colors.primary }}>🏢 Empresas e clientes cadastrados</h3>
          <button onClick={onClose} className="opacity-60 font-bold text-xs">✕ Fechar</button>
        </div>
        <div className="flex bg-black/30 p-1 rounded-xl">
          {[['entrar', 'Entrar'], ['cadastrar', 'Cadastrar']].map(([k, t]) => (
            <button key={k} onClick={() => { setTab(k); setMessage(''); }} style={tab === k ? { backgroundColor: colors.primary, color: colors.btnText } : {}} className="flex-1 py-2 rounded-lg text-xs font-bold">{t}</button>
          ))}
        </div>

        {tab === 'entrar' ? (
          <form onSubmit={login} className="space-y-2">
            <p className="text-[11px] opacity-70">Clientes aprovados veem os preços da sua tabela especial.</p>
            <input placeholder="CNPJ ou CPF" value={doc} onChange={(e) => setDoc(e.target.value)} style={field} className={cls} />
            <input placeholder="WhatsApp cadastrado" value={phone} onChange={(e) => setPhone(e.target.value)} style={field} className={cls} />
            <button type="submit" disabled={busy} style={{ backgroundColor: colors.primary, color: colors.btnText }} className="w-full py-3 rounded-xl text-xs font-bold disabled:opacity-60">{busy ? 'Conferindo...' : 'Entrar'}</button>
          </form>
        ) : (
          <form onSubmit={signup} className="space-y-2">
            <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })} style={field} className={cls}>
              <option value="PJ">🏢 Empresa (CNPJ)</option>
              <option value="PF">👤 Pessoa física (CPF)</option>
            </select>
            <input placeholder={form.customer_type === 'PJ' ? 'CNPJ' : 'CPF'} value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} style={field} className={cls} />
            {form.customer_type === 'PJ' && <input placeholder="Nome da empresa" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} style={field} className={cls} />}
            <input placeholder="Seu nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={field} className={cls} />
            <input placeholder="WhatsApp com DDD" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={field} className={cls} />
            <input placeholder="E-mail (opcional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={field} className={cls} />
            <button type="submit" disabled={busy} style={{ backgroundColor: colors.primary, color: colors.btnText }} className="w-full py-3 rounded-xl text-xs font-bold disabled:opacity-60">{busy ? 'Enviando...' : 'Enviar cadastro'}</button>
          </form>
        )}

        {message && <p className="text-[11px] font-bold text-center">{message}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Termo de locação
// ---------------------------------------------------------------------
export function TermsModal({ text, items, onClose, colors }) {
  const withValue = (items || []).filter((i) => num(i.replacement_value) > 0);
  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4">
      <div style={{ backgroundColor: colors.card, color: colors.text }} className="border border-white/10 w-full max-w-sm rounded-2xl p-5 space-y-3 shadow-2xl max-h-[85vh] overflow-y-auto">
        <h3 className="font-bold text-sm" style={{ color: colors.primary }}>📝 Termo de Locação</h3>
        <p className="text-xs opacity-80 whitespace-pre-line leading-relaxed">{text}</p>
        {withValue.length > 0 && (
          <div className="text-[11px] space-y-1 pt-2 border-t border-white/10">
            <b className="block">Valor de reposição por unidade (dano ou perda):</b>
            {withValue.map((i, idx) => <div key={idx}>• {i.name}: <b>{formatBRL(i.replacement_value)}</b></div>)}
          </div>
        )}
        <button onClick={onClose} style={{ backgroundColor: colors.primary, color: colors.btnText }} className="w-full py-2.5 rounded-xl text-xs font-bold">Entendi</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Texto do pedido de locação para o WhatsApp da loja (quando não há API)
// ---------------------------------------------------------------------
export function buildRentalStoreMessage({ tenant, orderId, customerName, customerPhone, customerDocument, items, start, end, days, deliveryLabel, address, deliveryTime, returnTime, subtotal, discount, couponCode, deliveryFee, assemblyFee, total, downPayment, deposit, payment, tableName, notes, paid }) {
  let msg = `*NOVA RESERVA DE LOCAÇÃO${orderId ? ` #${orderId}` : ''} - ${String(tenant.name || '').toUpperCase()}*\n\n`;
  msg += `*Cliente:* ${customerName}\n*Telefone:* ${customerPhone}\n`;
  if (customerDocument) msg += `*CPF/CNPJ:* ${customerDocument}\n`;
  if (tableName) msg += `*Tabela de preço:* ${tableName}\n`;
  msg += `\n📅 *Retirada/entrega:* ${formatDateBR(start)}${deliveryTime ? ` às ${deliveryTime}` : ''}\n📅 *Devolução:* ${formatDateBR(end)}${returnTime ? ` às ${returnTime}` : ''}\n⏱️ *Período:* ${days} dia(s)\n`;
  msg += `🚚 *${deliveryLabel}*${address ? `: ${address}` : ''}\n`;
  msg += `\n*ITENS:*\n${items.map((i) => `• ${i.quantity}x ${i.name}${i.variationsText ? ` [${i.variationsText}]` : ''} — ${formatBRL(i.price * i.quantity)}${i.price_label ? ` (${i.price_label})` : ''}${i.note ? `\n    Obs: _"${i.note}"_` : ''}`).join('\n')}\n\n`;
  msg += `*Subtotal:* ${formatBRL(subtotal)}\n`;
  if (discount > 0) msg += `*Desconto${couponCode ? ` (${couponCode})` : ''}:* -${formatBRL(discount)}\n`;
  if (deliveryFee > 0) msg += `*Entrega:* ${formatBRL(deliveryFee)}\n`;
  if (assemblyFee > 0) msg += `*Montagem:* ${formatBRL(assemblyFee)}\n`;
  msg += `*TOTAL:* *${formatBRL(total)}*\n`;
  if (downPayment > 0 && downPayment < total) msg += `*Sinal para reservar:* ${formatBRL(downPayment)}\n`;
  if (deposit > 0) msg += `*Caução:* ${formatBRL(deposit)}\n`;
  msg += `*Pagamento:* ${paid ? '🟢 PIX PAGO E CONFIRMADO' : payment}\n`;
  if (notes) msg += `\n📝 ${notes}`;
  return msg;
}
