import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { num, formatBRL, formatDateBR, purchaseTotal, purchaseMessage, todayISO, addDaysISO, toCSV, downloadCSV } from '../../lib/erp';
import { Card, SubTabs, Modal, Empty, inputCls, labelCls, btn, friendlyError } from './ui';

const EMPTY_SUPPLIER = { name: '', document: '', contact_name: '', phone: '', email: '', address: '', lead_time_days: '', payment_terms: '', notes: '' };
const PO_STATUS = { rascunho: '📝 Rascunho', enviado: '📨 Enviado', recebido: '✅ Recebido', cancelado: '⚫ Cancelado' };

const emptyPO = () => ({
  supplier_id: '', items: [], freight: '', other_costs: '', expected_date: '', payment_due_date: addDaysISO(todayISO(), 30),
  installments: 1, installment_interval_days: 30, paid_on_receipt: false, payment_method: 'Boleto', notes: ''
});

const cleanPhone = (p) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d && !d.startsWith('55') && d.length <= 11) d = '55' + d;
  return d;
};

export default function SuppliersTab({ tenant, products, suppliers, primaryColor, onChanged, draftItems, onDraftConsumed }) {
  const [view, setView] = useState('compras');
  const [editing, setEditing] = useState(null);
  const [orders, setOrders] = useState([]);
  const [po, setPo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('abertos');

  const loadOrders = async () => {
    const { data } = await supabase.from('purchase_orders').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(300);
    setOrders(data || []);
  };
  useEffect(() => { loadOrders(); }, []);

  // Rascunho vindo da aba Estoque (produtos para repor)
  useEffect(() => {
    if (draftItems && draftItems.length) {
      const sup = draftItems.find((i) => i.supplier_id)?.supplier_id || '';
      const items = draftItems.filter((i) => !sup || !i.supplier_id || String(i.supplier_id) === String(sup)).map(({ supplier_id, ...i }) => i);
      setView('compras');
      setPo({ ...emptyPO(), supplier_id: sup ? String(sup) : '', items });
      onDraftConsumed && onDraftConsumed();
    }
  }, [draftItems]);

  // ---------------- FORNECEDORES ----------------
  const saveSupplier = async (e) => {
    e.preventDefault();
    if (!editing.name.trim()) return alert('Informe o nome do fornecedor.');
    setSaving(true);
    const payload = {
      name: editing.name.trim(), document: editing.document || null, contact_name: editing.contact_name || null,
      phone: editing.phone ? String(editing.phone).replace(/\D/g, '') : null, email: editing.email || null, address: editing.address || null,
      lead_time_days: String(editing.lead_time_days ?? '').trim() === '' ? null : parseInt(editing.lead_time_days, 10),
      payment_terms: editing.payment_terms || null, notes: editing.notes || null
    };
    const { error } = editing.id
      ? await supabase.from('suppliers').update(payload).eq('id', editing.id)
      : await supabase.from('suppliers').insert([{ ...payload, tenant_id: tenant.id }]);
    setSaving(false);
    if (error) return alert(friendlyError(error));
    setEditing(null);
    onChanged && onChanged();
  };

  const toggleSupplier = async (s) => {
    const { error } = await supabase.from('suppliers').update({ active: s.active === false }).eq('id', s.id);
    if (error) return alert(friendlyError(error));
    onChanged && onChanged();
  };

  // ---------------- PEDIDOS DE COMPRA ----------------
  const supplierOf = (id) => suppliers.find((s) => String(s.id) === String(id));
  const poTotal = po ? purchaseTotal(po.items, po.freight, po.other_costs) : 0;

  const addItem = (productId) => {
    const p = products.find((pp) => String(pp.id) === String(productId));
    if (!p) return;
    if (po.items.some((i) => String(i.product_id) === String(p.id))) return;
    setPo({ ...po, items: [...po.items, { product_id: String(p.id), name: p.name, quantity: 1, unit_cost: p.cost_price ?? '' }] });
  };
  const setItem = (idx, k, v) => setPo({ ...po, items: po.items.map((i, n) => (n === idx ? { ...i, [k]: v } : i)) });
  const removeItem = (idx) => setPo({ ...po, items: po.items.filter((_, n) => n !== idx) });

  const savePO = async (e) => {
    e && e.preventDefault();
    if (!po.supplier_id) { alert('Escolha o fornecedor.'); return null; }
    if (po.items.length === 0) { alert('Adicione pelo menos um produto.'); return null; }
    if (po.items.some((i) => !(parseInt(i.quantity, 10) > 0))) { alert('Confira as quantidades.'); return null; }
    setSaving(true);
    const sup = supplierOf(po.supplier_id);
    const payload = {
      supplier_id: Number(po.supplier_id), supplier_name: sup?.name || null,
      items: po.items.map((i) => ({ product_id: String(i.product_id), name: i.name, quantity: parseInt(i.quantity, 10), unit_cost: num(i.unit_cost) })),
      freight: num(po.freight), other_costs: num(po.other_costs), total: poTotal,
      expected_date: po.expected_date || null, payment_due_date: po.payment_due_date || null,
      installments: Math.max(parseInt(po.installments, 10) || 1, 1), installment_interval_days: Math.max(parseInt(po.installment_interval_days, 10) || 30, 1),
      paid_on_receipt: !!po.paid_on_receipt, payment_method: po.payment_method || null, notes: po.notes || null
    };
    const res = po.id
      ? await supabase.from('purchase_orders').update(payload).eq('id', po.id).select().maybeSingle()
      : await supabase.from('purchase_orders').insert([{ ...payload, tenant_id: tenant.id, status: 'rascunho' }]).select().maybeSingle();
    setSaving(false);
    if (res.error) { alert(friendlyError(res.error)); return null; }
    setPo(null);
    loadOrders();
    return res.data;
  };

  const sendWhatsApp = async (order, preOpened) => {
    const sup = supplierOf(order.supplier_id);
    const msg = purchaseMessage({ ...order, supplier_contact: sup?.contact_name }, tenant);
    const phone = cleanPhone(sup?.phone);
    const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    if (preOpened && !preOpened.closed) preOpened.location.href = url; else window.open(url, '_blank');
    if (order.status === 'rascunho') {
      await supabase.from('purchase_orders').update({ status: 'enviado' }).eq('id', order.id);
      loadOrders();
    }
  };

  const receive = async (order) => {
    const parc = order.installments > 1 ? `${order.installments} parcelas` : '1 pagamento';
    if (!window.confirm(`Confirmar o RECEBIMENTO da compra #${order.id}?\n\n• Entra no estoque: ${order.items.reduce((s, i) => s + num(i.quantity), 0)} unidades\n• O custo médio dos produtos é atualizado (frete incluso)\n• Lança ${formatBRL(order.total)} em Contas a Pagar (${parc})${order.paid_on_receipt ? ' já como PAGO' : ''}`)) return;
    setSaving(true);
    const { error } = await supabase.rpc('receive_purchase_order', { p_tenant_id: String(tenant.id), p_po_id: order.id });
    setSaving(false);
    if (error) return alert(friendlyError(error));
    alert('✅ Compra recebida! Estoque e financeiro atualizados.');
    loadOrders();
    onChanged && onChanged();
  };

  const cancelPO = async (order) => {
    if (!window.confirm(`Cancelar a compra #${order.id}?`)) return;
    await supabase.from('purchase_orders').update({ status: 'cancelado' }).eq('id', order.id);
    loadOrders();
  };
  const deletePO = async (order) => {
    if (!window.confirm(`Excluir a compra #${order.id}?`)) return;
    const { error } = await supabase.from('purchase_orders').delete().eq('id', order.id);
    if (error) return alert(friendlyError(error));
    loadOrders();
  };

  const visibleOrders = orders.filter((o) => statusFilter === 'todos' || (statusFilter === 'abertos' ? ['rascunho', 'enviado'].includes(o.status) : o.status === statusFilter));

  const exportOrders = () => downloadCSV(`compras-${todayISO()}.csv`, toCSV(orders, [
    { label: 'Nº', value: 'id' }, { label: 'Data', value: (o) => new Date(o.created_at).toLocaleDateString('pt-BR') },
    { label: 'Fornecedor', value: 'supplier_name' }, { label: 'Itens', value: (o) => (o.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', ') },
    { label: 'Frete', value: (o) => num(o.freight) }, { label: 'Total', value: (o) => num(o.total) },
    { label: 'Situação', value: (o) => (PO_STATUS[o.status] || o.status).replace(/^[^ ]+ /, '') },
    { label: 'Recebido em', value: (o) => (o.received_at ? new Date(o.received_at).toLocaleDateString('pt-BR') : '') }
  ]));

  const supplierStats = (s) => {
    const rec = orders.filter((o) => String(o.supplier_id) === String(s.id) && o.status === 'recebido');
    return { count: rec.length, total: rec.reduce((a, o) => a + num(o.total), 0) };
  };

  return (
    <div className="space-y-4">
      <SubTabs primaryColor={primaryColor} active={view} onChange={setView} tabs={[
        { id: 'compras', label: '🧾 Pedidos de compra', badge: orders.filter((o) => o.status === 'enviado').length || null },
        { id: 'fornecedores', label: `🏭 Fornecedores (${suppliers.length})` }
      ]} />

      {view === 'fornecedores' && (
        <Card title="Fornecedores" right={<button type="button" className={btn.primary} onClick={() => setEditing({ ...EMPTY_SUPPLIER })}>➕ Novo fornecedor</button>}>
          {suppliers.length === 0 ? <Empty>Cadastre seus fornecedores para fazer pedidos de compra pelo WhatsApp e controlar o que você deve a cada um.</Empty> : (
            <div className="grid md:grid-cols-2 gap-2">
              {suppliers.map((s) => {
                const st = supplierStats(s);
                return (
                  <div key={s.id} className={`bg-gray-950 border border-gray-800 rounded-2xl p-3 text-xs space-y-1 ${s.active === false ? 'opacity-50' : ''}`}>
                    <div className="flex justify-between gap-2">
                      <p className="font-bold text-white">{s.name}{s.active === false ? ' (inativo)' : ''}</p>
                      <div className="flex gap-1">
                        <button type="button" className={btn.small} onClick={() => setEditing({ ...EMPTY_SUPPLIER, ...s, lead_time_days: s.lead_time_days ?? '' })}>✏️</button>
                        <button type="button" className={btn.small} onClick={() => toggleSupplier(s)}>{s.active === false ? 'Ativar' : 'Inativar'}</button>
                      </div>
                    </div>
                    <p className="text-gray-400">{[s.contact_name, s.phone, s.email].filter(Boolean).join(' • ') || 'Sem contato cadastrado'}</p>
                    {(s.payment_terms || s.lead_time_days) && <p className="text-gray-500">{[s.payment_terms && `💳 ${s.payment_terms}`, s.lead_time_days && `⏱️ entrega em ${s.lead_time_days} dias`].filter(Boolean).join(' • ')}</p>}
                    <p className="text-gray-500">Compras recebidas: {st.count} • {formatBRL(st.total)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {view === 'compras' && (
        <Card title="Pedidos de compra" right={
          <div className="flex gap-1">
            <button type="button" className={btn.small} onClick={exportOrders}>⬇️ Planilha</button>
            <button type="button" className={btn.primary} onClick={() => suppliers.length ? setPo(emptyPO()) : (alert('Cadastre um fornecedor primeiro.'), setView('fornecedores'))}>➕ Nova compra</button>
          </div>
        }>
          <div className="flex gap-1 overflow-x-auto text-[11px]">
            {[['abertos', 'Em aberto'], ['recebido', 'Recebidos'], ['cancelado', 'Cancelados'], ['todos', 'Todos']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setStatusFilter(k)} className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap ${statusFilter === k ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>{l}</button>
            ))}
          </div>
          {visibleOrders.length === 0 ? <Empty>Nenhum pedido de compra aqui. Crie um, envie ao fornecedor pelo WhatsApp e, quando a mercadoria chegar, clique em "Receber".</Empty> : (
            <div className="space-y-2">
              {visibleOrders.map((o) => (
                <div key={o.id} className="bg-gray-950 border border-gray-800 rounded-2xl p-3 text-xs space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="font-bold text-white">Compra #{o.id} • {o.supplier_name || '—'}</p>
                      <p className="text-[10px] text-gray-500">
                        {new Date(o.created_at).toLocaleDateString('pt-BR')}
                        {o.expected_date ? ` • chega ${formatDateBR(o.expected_date)}` : ''}
                        {o.received_at ? ` • recebida ${new Date(o.received_at).toLocaleDateString('pt-BR')}` : ''}
                        {o.installments > 1 ? ` • ${o.installments}x` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-white">{formatBRL(o.total)}</p>
                      <p className="text-[10px]">{PO_STATUS[o.status] || o.status}</p>
                    </div>
                  </div>
                  <p className="text-gray-400">{(o.items || []).map((i) => `${i.quantity}x ${i.name}`).join(' • ')}</p>
                  <div className="flex flex-wrap gap-1">
                    {['rascunho', 'enviado'].includes(o.status) && (
                      <>
                        <button type="button" disabled={saving} className={btn.green} onClick={() => receive(o)}>📥 Receber mercadoria</button>
                        <button type="button" className={btn.small} onClick={() => sendWhatsApp(o)}>💬 {o.status === 'rascunho' ? 'Enviar ao fornecedor' : 'Reenviar'}</button>
                        <button type="button" className={btn.small} onClick={() => setPo({ ...emptyPO(), ...o, supplier_id: String(o.supplier_id || ''), freight: o.freight || '', other_costs: o.other_costs || '', expected_date: o.expected_date || '', payment_due_date: o.payment_due_date || '' })}>✏️ Editar</button>
                        <button type="button" className={btn.small} onClick={() => cancelPO(o)}>Cancelar</button>
                      </>
                    )}
                    {['rascunho', 'cancelado'].includes(o.status) && <button type="button" className={btn.small} onClick={() => deletePO(o)}>🗑️</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {editing && (
        <Modal title={editing.id ? 'Editar fornecedor' : 'Novo fornecedor'} onClose={() => setEditing(null)}>
          <form onSubmit={saveSupplier} className="space-y-2">
            <div><label className={labelCls}>Nome / Razão social *</label><input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>CNPJ / CPF</label><input className={inputCls} value={editing.document || ''} onChange={(e) => setEditing({ ...editing, document: e.target.value })} /></div>
              <div><label className={labelCls}>Contato (nome)</label><input className={inputCls} value={editing.contact_name || ''} onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} /></div>
              <div><label className={labelCls}>WhatsApp</label><input className={inputCls} inputMode="tel" placeholder="(11) 99999-9999" value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div><label className={labelCls}>E-mail</label><input className={inputCls} type="email" value={editing.email || ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div><label className={labelCls}>Prazo de entrega (dias)</label><input className={inputCls} type="number" min="0" value={editing.lead_time_days} onChange={(e) => setEditing({ ...editing, lead_time_days: e.target.value })} /></div>
              <div><label className={labelCls}>Condição de pagamento</label><input className={inputCls} placeholder="Ex: 30/60/90 boleto" value={editing.payment_terms || ''} onChange={(e) => setEditing({ ...editing, payment_terms: e.target.value })} /></div>
            </div>
            <div><label className={labelCls}>Endereço</label><input className={inputCls} value={editing.address || ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
            <div><label className={labelCls}>Observações</label><input className={inputCls} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            <button type="submit" disabled={saving} className={`${btn.primary} w-full`}>{saving ? 'Salvando...' : 'Salvar fornecedor'}</button>
          </form>
        </Modal>
      )}

      {po && (
        <Modal wide title={po.id ? `Editar compra #${po.id}` : 'Nova compra'} onClose={() => setPo(null)}>
          <form onSubmit={savePO} className="space-y-3">
            <div>
              <label className={labelCls}>Fornecedor *</label>
              <select className={inputCls} value={po.supplier_id} onChange={(e) => setPo({ ...po, supplier_id: e.target.value })}>
                <option value="">Escolha...</option>
                {suppliers.filter((s) => s.active !== false || String(s.id) === String(po.supplier_id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className={labelCls}>Produtos</label>
              {po.items.map((i, idx) => (
                <div key={i.product_id} className="grid grid-cols-12 gap-1 items-center bg-gray-950 border border-gray-800 rounded-xl p-2 text-xs">
                  <span className="col-span-12 md:col-span-6 font-bold text-white truncate">{i.name}</span>
                  <label className="col-span-4 md:col-span-2 text-[10px] text-gray-500">Qtd<input type="number" min="1" value={i.quantity} onChange={(e) => setItem(idx, 'quantity', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-1.5 text-white" /></label>
                  <label className="col-span-5 md:col-span-3 text-[10px] text-gray-500">Custo un. (R$)<input inputMode="decimal" value={i.unit_cost} onChange={(e) => setItem(idx, 'unit_cost', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-lg p-1.5 text-white" /></label>
                  <button type="button" onClick={() => removeItem(idx)} className="col-span-3 md:col-span-1 text-red-400 text-right pr-1">✕</button>
                </div>
              ))}
              <select className={inputCls} value="" onChange={(e) => addItem(e.target.value)}>
                <option value="">➕ Adicionar produto...</option>
                {products.filter((p) => !p.is_digital && !po.items.some((i) => String(i.product_id) === String(p.id)))
                  .sort((a, b) => (String(a.supplier_id) === String(po.supplier_id) ? -1 : 0) - (String(b.supplier_id) === String(po.supplier_id) ? -1 : 0))
                  .map((p) => <option key={p.id} value={p.id}>{p.name}{p.stock !== null && p.stock !== undefined ? ` (tem ${p.stock})` : ''}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <div><label className={labelCls}>Frete (R$)</label><input className={inputCls} inputMode="decimal" value={po.freight} onChange={(e) => setPo({ ...po, freight: e.target.value })} /></div>
              <div><label className={labelCls}>Outros custos (R$)</label><input className={inputCls} inputMode="decimal" placeholder="impostos, taxas" value={po.other_costs} onChange={(e) => setPo({ ...po, other_costs: e.target.value })} /></div>
              <div><label className={labelCls}>Previsão de chegada</label><input className={inputCls} type="date" value={po.expected_date} onChange={(e) => setPo({ ...po, expected_date: e.target.value })} /></div>
            </div>

            <div className="bg-gray-950/60 border border-gray-800 rounded-2xl p-3 space-y-2">
              <p className="text-[11px] font-bold text-orange-300">💳 Pagamento ao fornecedor (vai para Contas a Pagar ao receber)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div><label className={labelCls}>1º vencimento</label><input className={inputCls} type="date" value={po.payment_due_date} onChange={(e) => setPo({ ...po, payment_due_date: e.target.value })} /></div>
                <div><label className={labelCls}>Parcelas</label><input className={inputCls} type="number" min="1" max="24" value={po.installments} onChange={(e) => setPo({ ...po, installments: e.target.value })} /></div>
                <div><label className={labelCls}>A cada (dias)</label><input className={inputCls} type="number" min="1" value={po.installment_interval_days} onChange={(e) => setPo({ ...po, installment_interval_days: e.target.value })} /></div>
                <div><label className={labelCls}>Forma</label>
                  <select className={inputCls} value={po.payment_method || ''} onChange={(e) => setPo({ ...po, payment_method: e.target.value })}>
                    {['Boleto', 'PIX', 'Cartão', 'Dinheiro', 'Transferência'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={!!po.paid_on_receipt} onChange={(e) => setPo({ ...po, paid_on_receipt: e.target.checked })} /> Já paguei / pago na entrega (lança como pago)</label>
            </div>

            <div><label className={labelCls}>Observações para o fornecedor</label><input className={inputCls} value={po.notes || ''} onChange={(e) => setPo({ ...po, notes: e.target.value })} /></div>

            <div className="flex justify-between items-center bg-gray-950 border border-gray-800 rounded-xl p-3">
              <span className="text-xs text-gray-400">Total da compra</span>
              <span className="text-lg font-extrabold text-white">{formatBRL(poTotal)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="submit" disabled={saving} className={btn.ghost}>💾 Salvar rascunho</button>
              <button type="button" disabled={saving} className={btn.green} onClick={async () => { const w = window.open('', '_blank'); const saved = await savePO(); if (saved) sendWhatsApp(saved, w); else if (w) w.close(); }}>💬 Salvar e enviar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
