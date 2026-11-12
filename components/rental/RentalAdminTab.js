import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  getRentalSettings, DEFAULT_RENTAL_SETTINGS, formatBRL, formatDateBR, todayISO, addDaysISO,
  rentalStage, RENTAL_STATUS_LABELS, formatDocument, num, onlyDigits, isValidCNPJ, isValidCPF
} from '../../lib/rental';

const SUBTABS = [
  ['agenda', '📅 Agenda'],
  ['estoque', '📦 Disponibilidade'],
  ['clientes', '🏢 Clientes / CNPJ'],
  ['tabelas', '🏷️ Tabelas de Preço'],
  ['config', '⚙️ Configurações'],
  ['whatsapp', '💬 WhatsApp']
];

const TEMPLATE_LABELS = {
  pedido_recebido: 'Reserva recebida (automática ao fechar o pedido)',
  pedido_confirmado: 'Reserva confirmada (botão "Confirmar")',
  lembrete_entrega: 'Lembrete: dia anterior à retirada/entrega (automático)',
  lembrete_devolucao: 'Lembrete: dia anterior à devolução (automático)',
  atraso: 'Devolução atrasada (automático)',
  devolvido: 'Itens devolvidos (botão "Devolvido")'
};

const box = 'bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl';
const input = 'w-full bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none';
const label = 'text-[11px] text-gray-400 block mb-1';

export default function RentalAdminTab({ tenant, adminPassword, products, primaryColor, onTenantSaved }) {
  const [sub, setSub] = useState('agenda');
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState(tenant?.store_mode || 'venda');
  const [settings, setSettings] = useState(getRentalSettings(tenant));

  useEffect(() => {
    setMode(tenant?.store_mode || 'venda');
    setSettings(getRentalSettings(tenant));
  }, [tenant?.id]);

  useEffect(() => {
    if (tenant?.id) loadAll();
  }, [tenant?.id]);

  const loadAll = async () => {
    setLoading(true);
    const [o, c, t] = await Promise.all([
      supabase.from('orders').select('*').eq('tenant_id', tenant.id).eq('order_type', 'aluguel').order('rental_start', { ascending: true }),
      supabase.from('rental_customers').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
      supabase.from('rental_price_tables').select('*').eq('tenant_id', tenant.id).order('discount_percent', { ascending: true })
    ]);
    if (o.error && /order_type|column/.test(o.error.message || '')) {
      alert('⚠️ O banco ainda não tem a estrutura da locação. Rode o arquivo supabase/locacao_01_estrutura.sql no Supabase.');
    }
    setOrders(o.data || []);
    setCustomers(c.data || []);
    setTables(t.data || []);
    setLoading(false);
  };

  // ----------------------------------------------------------------- WhatsApp
  const sendEvent = async (order, event) => {
    try {
      const r = await fetch('/api/rental-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', tenant_id: tenant.id, order_id: order.id, event, password: adminPassword })
      });
      const data = await r.json();
      if (data.sent) return alert('✅ Mensagem enviada pelo WhatsApp automático.');
      if (data.fallback_url) {
        if (data.error && data.reason !== 'not_configured') alert('⚠️ A API não conseguiu enviar (' + data.error + '). Vou abrir o WhatsApp para você enviar manualmente.');
        window.open(data.fallback_url, '_blank');
        return;
      }
      alert('Não foi possível enviar: ' + (data.error || 'erro desconhecido'));
    } catch (e) {
      alert('Erro de conexão ao enviar mensagem.');
    }
  };

  const updateOrder = async (order, patch, event) => {
    const { error } = await supabase.from('orders').update(patch).eq('id', order.id).eq('tenant_id', tenant.id);
    if (error) return alert('Erro ao atualizar: ' + error.message);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...patch } : o)));
    if (event && confirm('Enviar mensagem para o cliente no WhatsApp?')) sendEvent({ ...order, ...patch }, event);
  };

  const handleReturn = async (order) => {
    const dmg = prompt('Itens devolvidos! Houve dano ou falta? Informe o valor a cobrar (R$) ou deixe 0:', '0');
    if (dmg === null) return;
    const damage = num(dmg);
    let notes = '';
    if (damage > 0) notes = prompt('Descreva o dano/falta (opcional):', '') || '';
    const patch = { rental_status: 'devolvido', damage_value: damage, damage_notes: notes };
    if (num(order.deposit_value) > 0) patch.deposit_status = damage > 0 ? 'retida' : 'devolvida';
    updateOrder(order, patch, 'devolvido');
  };

  // ----------------------------------------------------------------- Configurações
  const saveSettings = async () => {
    const payload = { store_mode: mode, rental_settings: settings };
    const { error } = await supabase.from('tenants').update(payload).eq('id', tenant.id);
    if (error) return alert('Erro ao salvar: ' + error.message);
    alert('✅ Configurações de locação salvas!');
    if (onTenantSaved) onTenantSaved();
  };
  // Ativa o modo direto pelo aviso (sem precisar ir até Configurações)
  const activateMode = async (newMode) => {
    const { error } = await supabase.from('tenants').update({ store_mode: newMode, rental_settings: settings }).eq('id', tenant.id);
    if (error) return alert('Erro ao salvar: ' + error.message);
    setMode(newMode);
    alert(newMode === 'aluguel'
      ? '✅ Loja no modo SÓ ALUGUEL! Agora marque os produtos como "Disponível para ALUGUEL" na aba 📦 Produtos.'
      : '✅ Loja no modo VENDA + ALUGUEL! Agora marque os produtos que também podem ser alugados na aba 📦 Produtos.');
    if (onTenantSaved) onTenantSaved();
  };

  const setS = (patch) => setSettings((prev) => ({ ...prev, ...patch }));
  const setTpl = (key, val) => setSettings((prev) => ({ ...prev, templates: { ...prev.templates, [key]: val } }));

  // ----------------------------------------------------------------- Render
  return (
    <div className="space-y-4">
      {(tenant?.store_mode || 'venda') === 'venda' && (
        <div className="bg-purple-500/10 border border-purple-500/30 p-4 rounded-2xl text-xs text-purple-200 space-y-3">
          <p>🗓️ O módulo de locação está <b>liberado</b> para sua loja, mas a vitrine ainda está no modo <b>só venda</b>. Escolha como a loja vai funcionar:</p>
          <div className="grid grid-cols-2 gap-2">
            {[['aluguel', '🗓️ Só aluguel'], ['ambos', '🔁 Venda + Aluguel']].map(([k, t]) => (
              <button key={k} type="button" onClick={() => activateMode(k)} className="py-3 rounded-xl font-bold bg-purple-600 hover:bg-purple-700 text-white">{t}</button>
            ))}
          </div>
          <p className="text-[10px] text-purple-300/70">Você pode mudar depois em 🗓️ Locação → ⚙️ Configurações. Depois, marque os produtos como "Disponível para ALUGUEL" na aba 📦 Produtos.</p>
        </div>
      )}

      <div className="flex space-x-1 bg-gray-900 p-1.5 rounded-2xl border border-gray-800 text-[11px] font-bold overflow-x-auto">
        {SUBTABS.map(([key, txt]) => (
          <button key={key} onClick={() => setSub(key)} style={sub === key ? { backgroundColor: primaryColor, color: '#fff' } : {}}
            className={`flex-1 py-2 px-3 rounded-xl whitespace-nowrap transition ${sub === key ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>
            {txt}
          </button>
        ))}
      </div>

      {loading && <p className="text-xs text-gray-400">Carregando...</p>}

      {sub === 'agenda' && <AgendaView orders={orders} onReload={loadAll} onUpdate={updateOrder} onReturn={handleReturn} onSend={sendEvent} tenant={tenant} />}
      {sub === 'estoque' && <AvailabilityView tenant={tenant} products={products} />}
      {sub === 'clientes' && <CustomersView tenant={tenant} customers={customers} tables={tables} onReload={loadAll} />}
      {sub === 'tabelas' && <TablesView tenant={tenant} tables={tables} onReload={loadAll} products={products} />}
      {sub === 'config' && <ConfigView mode={mode} setMode={setMode} settings={settings} setS={setS} setTpl={setTpl} onSave={saveSettings} />}
      {sub === 'whatsapp' && <WhatsAppView tenant={tenant} adminPassword={adminPassword} />}
    </div>
  );
}

// =====================================================================
// AGENDA DE LOCAÇÕES
// =====================================================================
function AgendaView({ orders, onReload, onUpdate, onReturn, onSend, tenant }) {
  const [filter, setFilter] = useState('proximas');
  const [search, setSearch] = useState('');
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const active = orders.filter((o) => !['cancelado', 'devolvido'].includes(rentalStage(o, today)));
  const leavingToday = active.filter((o) => o.rental_start === today && ['reservado', 'confirmado'].includes(rentalStage(o, today)));
  const returningToday = active.filter((o) => o.rental_end === today && ['em_uso', 'entregue'].includes(rentalStage(o, today)));
  const late = active.filter((o) => rentalStage(o, today) === 'atrasado');
  const pending = active.filter((o) => rentalStage(o, today) === 'reservado');

  const filters = {
    proximas: ['⏭️ Próximas', (o) => ['reservado', 'confirmado'].includes(rentalStage(o, today))],
    hoje: ['📍 Hoje e amanhã', (o) => [today, tomorrow].includes(o.rental_start) || [today, tomorrow].includes(o.rental_end)],
    uso: ['📦 Em uso', (o) => rentalStage(o, today) === 'em_uso'],
    atrasadas: [`🔴 Atrasadas (${late.length})`, (o) => rentalStage(o, today) === 'atrasado'],
    pendentes: [`🟡 A confirmar (${pending.length})`, (o) => rentalStage(o, today) === 'reservado'],
    historico: ['✅ Histórico', (o) => ['devolvido', 'cancelado'].includes(rentalStage(o, today))],
    todas: ['Todas', () => true]
  };

  const s = search.trim().toLowerCase();
  const list = orders
    .filter(filters[filter][1])
    .filter((o) => !s || String(o.id).includes(s) || (o.customer_name || '').toLowerCase().includes(s) || onlyDigits(o.customer_phone).includes(onlyDigits(s) || '#'))
    .sort((a, b) => (filter === 'historico' ? String(b.rental_start).localeCompare(String(a.rental_start)) : String(a.rental_start).localeCompare(String(b.rental_start))));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <Stat label="Saídas hoje" value={leavingToday.length} color="text-blue-400" />
        <Stat label="Devoluções hoje" value={returningToday.length} color="text-green-400" />
        <Stat label="Atrasadas" value={late.length} color="text-red-400" />
        <Stat label="A confirmar" value={pending.length} color="text-yellow-400" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(filters).map(([key, [txt]]) => (
          <button key={key} onClick={() => setFilter(key)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${filter === key ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'}`}>{txt}</button>
        ))}
        <button onClick={onReload} className="px-3 py-1.5 rounded-full text-[11px] font-bold border bg-gray-900 border-gray-800 text-gray-300">🔄 Atualizar</button>
      </div>

      <input type="text" placeholder="🔎 Buscar por nº do pedido, nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} className={input} />

      {list.length === 0 && <p className="text-xs text-gray-500 text-center py-6">Nenhuma locação neste filtro.</p>}

      {list.map((o) => {
        const stage = rentalStage(o, today);
        const items = Array.isArray(o.items) ? o.items : [];
        const isPickup = o.address === 'Retirada na Loja';
        return (
          <div key={o.id} className={`bg-gray-900 p-4 rounded-2xl border space-y-2 text-xs ${stage === 'atrasado' ? 'border-red-500/50' : 'border-gray-800'}`}>
            <div className="flex justify-between items-start gap-2">
              <div>
                <span className="font-bold text-white text-sm">#{o.id} — {o.customer_name}</span>
                <span className="block text-[11px] text-gray-400">{o.customer_phone}{o.customer_document ? ` • ${o.customer_type || ''} ${formatDocument(o.customer_document)}` : ''}{o.price_table_name ? ` • Tabela: ${o.price_table_name}` : ''}</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-gray-950 border border-gray-800 whitespace-nowrap">{RENTAL_STATUS_LABELS[stage] || stage}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-gray-950 p-2.5 rounded-xl border border-gray-800">
              <div><span className="text-gray-500 block text-[10px]">{isPickup ? 'Retirada' : 'Entrega'}</span><b className="text-blue-300">{formatDateBR(o.rental_start)}{o.delivery_time ? ` • ${o.delivery_time}` : ''}</b></div>
              <div><span className="text-gray-500 block text-[10px]">Devolução</span><b className="text-green-300">{formatDateBR(o.rental_end)}{o.return_time ? ` • ${o.return_time}` : ''}</b></div>
            </div>

            <div className="text-gray-300">{items.map((i, idx) => <div key={idx}>• {i.quantity}x {i.name}{i.price_label ? <span className="text-gray-500"> ({i.price_label})</span> : null}</div>)}</div>
            <div className="text-gray-400">📍 {o.address}{o.neighborhood && !isPickup ? ` — ${o.neighborhood}` : ''}</div>
            {o.rental_notes && <div className="text-yellow-300">📝 {o.rental_notes}</div>}

            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-gray-800">
              <span>Total: <b className="text-white">{formatBRL(o.total)}</b></span>
              {num(o.down_payment_value) > 0 && num(o.down_payment_value) < num(o.total) && <span>Sinal: <b className="text-purple-300">{formatBRL(o.down_payment_value)}</b></span>}
              {num(o.deposit_value) > 0 && <span>Caução: <b className="text-orange-300">{formatBRL(o.deposit_value)}</b> ({o.deposit_status || 'pendente'})</span>}
              <span>{o.is_paid ? '🟢 Pago' : '🟡 Pagamento pendente'}</span>
              {num(o.damage_value) > 0 && <span className="text-red-400">Dano: {formatBRL(o.damage_value)} {o.damage_notes ? `(${o.damage_notes})` : ''}</span>}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {stage === 'reservado' && <Btn c="bg-blue-600" onClick={() => onUpdate(o, { rental_status: 'confirmado' }, 'pedido_confirmado')}>✅ Confirmar</Btn>}
              {['reservado', 'confirmado'].includes(stage) && <Btn c="bg-indigo-600" onClick={() => onUpdate(o, { rental_status: 'entregue' })}>📦 Saiu / Entregue</Btn>}
              {['em_uso', 'atrasado'].includes(stage) && <Btn c="bg-green-600" onClick={() => onReturn(o)}>↩️ Devolvido</Btn>}
              <Btn c={o.is_paid ? 'bg-gray-700' : 'bg-emerald-700'} onClick={() => onUpdate(o, { is_paid: !o.is_paid })}>{o.is_paid ? 'Marcar não pago' : '💰 Marcar pago'}</Btn>
              {num(o.deposit_value) > 0 && o.deposit_status !== 'recebida' && !['devolvido', 'cancelado'].includes(stage) && <Btn c="bg-orange-700" onClick={() => onUpdate(o, { deposit_status: 'recebida' })}>🔒 Caução recebida</Btn>}
              <Btn c="bg-[#1f8f4e]" onClick={() => onSend(o, stage === 'atrasado' ? 'atraso' : ['em_uso'].includes(stage) ? 'lembrete_devolucao' : 'lembrete_entrega')}>💬 Lembrete</Btn>
              <a href={`/${tenant.slug}/pedido/${o.id}`} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] bg-gray-800 text-gray-200">🔎 Ver</a>
              {!['devolvido', 'cancelado'].includes(stage) && <Btn c="bg-red-900" onClick={() => confirm('Cancelar esta locação? O estoque será liberado.') && onUpdate(o, { rental_status: 'cancelado', status: 'cancelado' })}>✕ Cancelar</Btn>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const Stat = ({ label: l, value, color }) => (
  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3">
    <span className={`text-xl font-extrabold block ${color}`}>{value}</span>
    <span className="text-[10px] text-gray-400">{l}</span>
  </div>
);

const Btn = ({ c, onClick, children }) => (
  <button type="button" onClick={onClick} className={`${c} px-2.5 py-1.5 rounded-lg font-bold text-[11px] text-white`}>{children}</button>
);

// =====================================================================
// DISPONIBILIDADE POR DATA
// =====================================================================
function AvailabilityView({ tenant, products }) {
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [rows, setRows] = useState([]);

  const check = async () => {
    const { data, error } = await supabase.rpc('rental_availability', { p_tenant_id: String(tenant.id), p_start: start, p_end: end < start ? start : end });
    if (error) return alert('Erro: ' + error.message);
    setRows(data || []);
  };

  useEffect(() => { check(); }, []);
  const name = (id) => products.find((p) => String(p.id) === String(id))?.name || `Produto ${id}`;

  return (
    <section className={box}>
      <h3 className="font-bold text-sm text-purple-400">📦 Disponibilidade por data</h3>
      <div className="grid grid-cols-3 gap-2 items-end">
        <div><label className={label}>De:</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={input} /></div>
        <div><label className={label}>Até:</label><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={input} /></div>
        <button onClick={check} className="bg-purple-600 hover:bg-purple-700 py-2.5 rounded-xl text-xs font-bold text-white">Consultar</button>
      </div>
      {rows.length === 0 && <p className="text-xs text-gray-500">Nenhum produto marcado como "Disponível para aluguel".</p>}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.product_id} className="flex justify-between items-center bg-gray-950 p-2.5 rounded-xl border border-gray-800 text-xs">
            <span className="font-bold">{name(r.product_id)}</span>
            <span>
              {r.total_stock === null
                ? <b className="text-gray-300">Sem limite ({r.reserved} reservado)</b>
                : <><b className={r.available > 0 ? 'text-green-400' : 'text-red-400'}>{r.available} livre(s)</b> <span className="text-gray-500">de {r.total_stock} • {r.reserved} reservado(s)</span></>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// =====================================================================
// CLIENTES (PF / CNPJ)
// =====================================================================
function CustomersView({ tenant, customers, tables, onReload }) {
  const empty = { customer_type: 'PJ', name: '', company_name: '', document: '', phone: '', email: '', address: '', price_table_id: '', status: 'aprovado' };
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState('todos');

  const save = async (e) => {
    e.preventDefault();
    const doc = onlyDigits(form.document);
    if (!form.name.trim()) return alert('Informe o nome.');
    if (form.customer_type === 'PJ' ? !isValidCNPJ(doc) : !isValidCPF(doc)) return alert(`${form.customer_type === 'PJ' ? 'CNPJ' : 'CPF'} inválido.`);
    const { error } = await supabase.from('rental_customers').insert([{
      ...form, tenant_id: tenant.id, document: doc, phone: onlyDigits(form.phone), price_table_id: form.price_table_id ? Number(form.price_table_id) : null
    }]);
    if (error) return alert(error.message.includes('duplicate') ? 'Já existe um cliente com este documento.' : 'Erro: ' + error.message);
    setForm(empty);
    onReload();
  };

  const update = async (c, patch) => {
    const { error } = await supabase.from('rental_customers').update(patch).eq('id', c.id).eq('tenant_id', tenant.id);
    if (error) return alert('Erro: ' + error.message);
    onReload();
  };

  const remove = async (c) => {
    if (!confirm(`Excluir o cadastro de ${c.name}?`)) return;
    await supabase.from('rental_customers').delete().eq('id', c.id).eq('tenant_id', tenant.id);
    onReload();
  };

  const pendingCount = customers.filter((c) => c.status === 'pendente').length;
  const list = customers.filter((c) => filter === 'todos' || c.status === filter);

  return (
    <div className="space-y-4">
      <section className={box}>
        <h3 className="font-bold text-sm text-purple-400">➕ Cadastrar cliente</h3>
        <p className="text-[10px] text-gray-400">Empresas também podem se cadastrar pela loja (botão "Sou empresa"). Elas aparecem aqui como <b>pendente</b> até você aprovar e escolher a tabela de preço.</p>
        <form onSubmit={save} className="grid grid-cols-2 gap-2">
          <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })} className={input}>
            <option value="PJ">🏢 Empresa (CNPJ)</option>
            <option value="PF">👤 Pessoa física (CPF)</option>
          </select>
          <input placeholder={form.customer_type === 'PJ' ? 'CNPJ' : 'CPF'} value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} className={input} />
          <input placeholder="Nome do responsável" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
          {form.customer_type === 'PJ' && <input placeholder="Razão social / Nome fantasia" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className={input} />}
          <input placeholder="WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
          <input placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
          <select value={form.price_table_id} onChange={(e) => setForm({ ...form, price_table_id: e.target.value })} className={input}>
            <option value="">Tabela: preço normal</option>
            {tables.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name} (-{num(t.discount_percent)}%)</option>)}
          </select>
          <button type="submit" className="col-span-2 bg-purple-600 hover:bg-purple-700 py-2.5 rounded-xl text-xs font-bold text-white">Salvar cliente</button>
        </form>
      </section>

      <div className="flex gap-1.5">
        {[['todos', 'Todos'], ['pendente', `🟡 Pendentes (${pendingCount})`], ['aprovado', '🟢 Aprovados'], ['bloqueado', '⛔ Bloqueados']].map(([k, t]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${filter === k ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'}`}>{t}</button>
        ))}
      </div>

      {list.length === 0 && <p className="text-xs text-gray-500 text-center py-4">Nenhum cliente.</p>}
      {list.map((c) => (
        <div key={c.id} className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 text-xs space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <b className="text-white">{c.customer_type === 'PJ' ? '🏢' : '👤'} {c.company_name || c.name}</b>
              <span className="block text-gray-400">{c.company_name ? `${c.name} • ` : ''}{formatDocument(c.document)} • {c.phone}{c.email ? ` • ${c.email}` : ''}</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${c.status === 'aprovado' ? 'bg-green-500/20 text-green-400' : c.status === 'pendente' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>{c.status}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <select value={c.price_table_id || ''} onChange={(e) => update(c, { price_table_id: e.target.value ? Number(e.target.value) : null })} className="bg-gray-950 border border-gray-800 p-1.5 rounded-lg text-[11px] text-white">
              <option value="">Preço normal</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.name} (-{num(t.discount_percent)}%)</option>)}
            </select>
            {c.status !== 'aprovado' && <Btn c="bg-green-700" onClick={() => update(c, { status: 'aprovado' })}>✅ Aprovar</Btn>}
            {c.status !== 'bloqueado' && <Btn c="bg-red-900" onClick={() => update(c, { status: 'bloqueado' })}>⛔ Bloquear</Btn>}
            {c.phone && <a href={`https://wa.me/${onlyDigits(c.phone).length <= 11 ? '55' : ''}${onlyDigits(c.phone)}`} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] bg-[#1f8f4e] text-white">💬</a>}
            <Btn c="bg-gray-800" onClick={() => remove(c)}>🗑</Btn>
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// TABELAS DE PREÇO (% de desconto automático)
// =====================================================================
function TablesView({ tenant, tables, onReload, products }) {
  const [form, setForm] = useState({ name: '', discount_percent: '', applies_to_sales: false });

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Dê um nome para a tabela (ex: CNPJ, Parceiros, Cerimonialistas).');
    const pct = num(form.discount_percent);
    if (pct < 0 || pct > 100) return alert('O desconto deve ser entre 0 e 100%.');
    const { error } = await supabase.from('rental_price_tables').insert([{ tenant_id: tenant.id, name: form.name.trim(), discount_percent: pct, applies_to_sales: !!form.applies_to_sales }]);
    if (error) return alert('Erro: ' + error.message);
    setForm({ name: '', discount_percent: '', applies_to_sales: false });
    onReload();
  };

  const update = async (t, patch) => {
    await supabase.from('rental_price_tables').update(patch).eq('id', t.id).eq('tenant_id', tenant.id);
    onReload();
  };

  const sample = products.find((p) => p.rental_enabled && num(p.rental_daily_price) > 0);

  return (
    <div className="space-y-4">
      <section className={box}>
        <h3 className="font-bold text-sm text-purple-400">🏷️ Nova tabela de preço</h3>
        <p className="text-[10px] text-gray-400">Informe só o <b>% de desconto</b>: todos os preços são recalculados sozinhos para os clientes ligados a esta tabela. Se você mudar o preço base de um produto, a tabela acompanha.</p>
        <form onSubmit={add} className="grid grid-cols-3 gap-2 items-end">
          <div className="col-span-2"><label className={label}>Nome:</label><input placeholder="Ex: Empresas (CNPJ)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} /></div>
          <div><label className={label}>Desconto (%):</label><input type="text" placeholder="Ex: 15" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} className={input} /></div>
          <label className="col-span-3 flex items-center space-x-2 text-xs cursor-pointer">
            <input type="checkbox" checked={form.applies_to_sales} onChange={(e) => setForm({ ...form, applies_to_sales: e.target.checked })} className="accent-purple-500" />
            <span>Aplicar também nos produtos de <b>venda</b></span>
          </label>
          <button type="submit" className="col-span-3 bg-purple-600 hover:bg-purple-700 py-2.5 rounded-xl text-xs font-bold text-white">Criar tabela</button>
        </form>
      </section>

      {tables.map((t) => (
        <div key={t.id} className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 text-xs flex flex-wrap justify-between items-center gap-2">
          <div>
            <b className={t.active ? 'text-white' : 'text-gray-500 line-through'}>{t.name}</b>
            <span className="block text-gray-400">-{num(t.discount_percent)}% {t.applies_to_sales ? '• aluguel e venda' : '• só aluguel'}
              {sample && <> • ex.: {sample.name}: {formatBRL(sample.rental_daily_price)} → <b className="text-green-400">{formatBRL(num(sample.rental_daily_price) * (1 - num(t.discount_percent) / 100))}</b>/dia</>}
            </span>
          </div>
          <div className="flex gap-1.5">
            <Btn c="bg-gray-800" onClick={() => { const v = prompt('Novo desconto (%):', t.discount_percent); if (v !== null) update(t, { discount_percent: Math.min(100, Math.max(0, num(v))) }); }}>✏️ %</Btn>
            <Btn c="bg-gray-800" onClick={() => update(t, { applies_to_sales: !t.applies_to_sales })}>{t.applies_to_sales ? 'Só aluguel' : '+ Venda'}</Btn>
            <Btn c={t.active ? 'bg-yellow-800' : 'bg-green-800'} onClick={() => update(t, { active: !t.active })}>{t.active ? 'Pausar' : 'Ativar'}</Btn>
            <Btn c="bg-red-900" onClick={async () => { if (confirm('Excluir tabela? Os clientes dela voltam ao preço normal.')) { await supabase.from('rental_price_tables').delete().eq('id', t.id); onReload(); } }}>🗑</Btn>
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// CONFIGURAÇÕES DA LOCAÇÃO
// =====================================================================
function ConfigView({ mode, setMode, settings, setS, setTpl, onSave }) {
  const chk = (key, text) => (
    <label className="flex items-center space-x-2 text-xs cursor-pointer">
      <input type="checkbox" checked={!!settings[key]} onChange={(e) => setS({ [key]: e.target.checked })} className="accent-purple-500 w-4 h-4" />
      <span>{text}</span>
    </label>
  );

  return (
    <div className="space-y-4">
      <section className={box}>
        <h3 className="font-bold text-sm text-purple-400">🏪 Modo da loja</h3>
        <div className="grid grid-cols-3 gap-2">
          {[['venda', '🛍️ Só venda'], ['aluguel', '🗓️ Só aluguel'], ['ambos', '🔁 Venda + Aluguel']].map(([k, t]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`py-3 rounded-xl text-xs font-bold border ${mode === k ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-400'}`}>{t}</button>
          ))}
        </div>
      </section>

      <section className={box}>
        <h3 className="font-bold text-sm text-purple-400">📅 Período e cobrança</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Como contar os dias:</label>
            <select value={settings.day_count_mode} onChange={(e) => setS({ day_count_mode: e.target.value })} className={input}>
              <option value="diarias">Diárias (retira dia 10, devolve dia 12 = 2)</option>
              <option value="inclusivo">Dias corridos (retira 10, devolve 12 = 3)</option>
            </select>
          </div>
          <div><label className={label}>Antecedência mínima (dias):</label><input type="number" min="0" value={settings.min_advance_days} onChange={(e) => setS({ min_advance_days: parseInt(e.target.value, 10) || 0 })} className={input} /></div>
          <div><label className={label}>Máximo de dias por locação:</label><input type="number" min="1" value={settings.max_rental_days} onChange={(e) => setS({ max_rental_days: parseInt(e.target.value, 10) || 1 })} className={input} /></div>
          <div><label className={label}>Dias de folga entre locações (limpeza):</label><input type="number" min="0" value={settings.buffer_days} onChange={(e) => setS({ buffer_days: parseInt(e.target.value, 10) || 0 })} className={input} /></div>
        </div>
      </section>

      <section className={box}>
        <h3 className="font-bold text-sm text-purple-400">💳 Pagamento, sinal e caução</h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Sinal para reservar (%):</label>
            <input type="number" min="0" max="100" value={settings.down_payment_percent} onChange={(e) => setS({ down_payment_percent: num(e.target.value) })} className={input} />
            <p className="text-[10px] text-gray-500 mt-1">0 = o cliente paga o valor total. Ex.: 50 = paga metade para reservar.</p>
          </div>
          <div>
            <label className={label}>Caução:</label>
            <select value={settings.deposit_mode} onChange={(e) => setS({ deposit_mode: e.target.value })} className={input}>
              <option value="nenhuma">Sem caução</option>
              <option value="percent_total">% do valor do pedido</option>
              <option value="percent_reposicao">% do valor de reposição dos itens</option>
              <option value="fixa">Valor fixo (R$)</option>
            </select>
          </div>
          {settings.deposit_mode !== 'nenhuma' && (
            <>
              <div><label className={label}>{settings.deposit_mode === 'fixa' ? 'Valor da caução (R$):' : 'Percentual da caução (%):'}</label><input type="text" value={settings.deposit_value} onChange={(e) => setS({ deposit_value: e.target.value })} className={input} /></div>
              <div><label className={label}>Observação da caução:</label><input type="text" value={settings.deposit_note} onChange={(e) => setS({ deposit_note: e.target.value })} className={input} /></div>
            </>
          )}
        </div>
      </section>

      <section className={box}>
        <h3 className="font-bold text-sm text-purple-400">🚚 Entrega e retirada</h3>
        <div className="space-y-2">
          {chk('allow_pickup', 'Cliente pode retirar na loja')}
          {chk('allow_delivery', 'Loja entrega (usa as taxas por bairro da aba 🚚 Fretes)')}
          {chk('allow_assembly', 'Oferecer montagem')}
          {settings.allow_assembly && <div className="w-1/2"><label className={label}>Valor da montagem (R$):</label><input type="text" value={settings.assembly_fee} onChange={(e) => setS({ assembly_fee: e.target.value })} className={input} /></div>}
          {chk('ask_times', 'Pedir horário de entrega/retirada e de devolução')}
        </div>
      </section>

      <section className={box}>
        <h3 className="font-bold text-sm text-purple-400">📝 Cadastro e termo de locação</h3>
        <div className="space-y-2">
          {chk('require_document', 'Exigir CPF/CNPJ no pedido')}
          {chk('allow_company_signup', 'Mostrar botão "Sou empresa (CNPJ)" na loja')}
          {chk('require_terms', 'Cliente precisa aceitar o termo de locação')}
          {settings.require_terms && <textarea rows={5} value={settings.terms_text} onChange={(e) => setS({ terms_text: e.target.value })} className={input} />}
        </div>
      </section>

      <section className={box}>
        <h3 className="font-bold text-sm text-purple-400">💬 Mensagens automáticas</h3>
        <p className="text-[10px] text-gray-400">Campos que o sistema preenche: <code className="text-purple-300">{'{nome} {pedido} {loja} {itens} {data_retirada} {data_devolucao} {dias} {total} {sinal} {caucao} {endereco} {link}'}</code></p>
        {Object.entries(TEMPLATE_LABELS).map(([key, txt]) => (
          <div key={key}>
            <div className="flex justify-between items-center">
              <label className={label}>{txt}</label>
              <button type="button" onClick={() => setTpl(key, DEFAULT_RENTAL_SETTINGS.templates[key])} className="text-[10px] text-gray-500 hover:text-white">↺ padrão</button>
            </div>
            <textarea rows={3} value={settings.templates[key]} onChange={(e) => setTpl(key, e.target.value)} className={input} />
          </div>
        ))}
      </section>

      <button type="button" onClick={onSave} className="w-full bg-green-600 hover:bg-green-700 font-bold py-3.5 rounded-xl text-xs text-white shadow-lg">💾 Salvar configurações de locação</button>
    </div>
  );
}

// =====================================================================
// API DE WHATSAPP (contratada pelo lojista)
// =====================================================================
function WhatsAppView({ tenant, adminPassword }) {
  const [cfg, setCfg] = useState(null);
  const [testPhone, setTestPhone] = useState(tenant?.whatsapp || '');
  const [busy, setBusy] = useState(false);

  const call = async (body) => {
    const r = await fetch('/api/rental-whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant_id: tenant.id, password: adminPassword, ...body }) });
    return r.json();
  };

  useEffect(() => {
    call({ action: 'get_config' }).then((d) => setCfg(d.ok ? d.config : { provider: 'evolution', active: false, notify_store: true, error: d.error }));
  }, []);

  if (!cfg) return <p className="text-xs text-gray-400">Carregando...</p>;
  const set = (patch) => setCfg({ ...cfg, ...patch });

  const save = async () => {
    setBusy(true);
    const d = await call({ action: 'save_config', config: cfg });
    setBusy(false);
    if (!d.ok) return alert('Erro: ' + (d.error || 'não foi possível salvar'));
    alert(d.complete ? '✅ Salvo! O WhatsApp automático está ATIVO.' : '💾 Salvo. Para enviar automaticamente, preencha todos os campos e marque "Ativar".');
    const fresh = await call({ action: 'get_config' });
    if (fresh.ok) setCfg(fresh.config);
  };

  const test = async () => {
    setBusy(true);
    const d = await call({ action: 'test', phone: testPhone });
    setBusy(false);
    alert(d.ok ? '✅ Mensagem de teste enviada! Confira o WhatsApp.' : '❌ Falhou: ' + (d.error || 'verifique os dados'));
  };

  const p = cfg.provider;
  return (
    <div className="space-y-4">
      <section className={box}>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-sm text-green-400">💬 WhatsApp automático</h3>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${cfg.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-400'}`}>{cfg.active ? '🟢 Ativo' : '⚪ Desligado'}</span>
        </div>
        <p className="text-[11px] text-gray-400">
          Sem a API, o sistema continua funcionando: as mensagens abrem no WhatsApp para você enviar com um toque.
          Com a API contratada, a confirmação da reserva e os lembretes de entrega, devolução e atraso saem <b>sozinhos</b>.
        </p>
        {cfg.error && <p className="text-[11px] text-red-400">⚠️ {cfg.error}</p>}

        <div>
          <label className={label}>Provedor contratado:</label>
          <select value={p} onChange={(e) => set({ provider: e.target.value })} className={input}>
            <option value="evolution">Evolution API (servidor próprio ou revenda)</option>
            <option value="zapi">Z-API (z-api.io)</option>
            <option value="webhook">Outro / Webhook (n8n, Make, etc.)</option>
          </select>
        </div>

        {p === 'evolution' && (
          <div className="grid grid-cols-1 gap-2">
            <div><label className={label}>URL do servidor (ex: https://api.suaempresa.com):</label><input value={cfg.api_url} onChange={(e) => set({ api_url: e.target.value })} className={input} /></div>
            <div><label className={label}>Nome da instância:</label><input value={cfg.instance} onChange={(e) => set({ instance: e.target.value })} className={input} /></div>
            <div><label className={label}>API Key (apikey):</label><input type="password" value={cfg.api_token} onChange={(e) => set({ api_token: e.target.value })} className={input} /></div>
          </div>
        )}
        {p === 'zapi' && (
          <div className="grid grid-cols-1 gap-2">
            <div><label className={label}>ID da instância:</label><input value={cfg.instance} onChange={(e) => set({ instance: e.target.value })} className={input} /></div>
            <div><label className={label}>Token da instância:</label><input type="password" value={cfg.api_token} onChange={(e) => set({ api_token: e.target.value })} className={input} /></div>
            <div><label className={label}>Client-Token (Token de segurança da conta):</label><input type="password" value={cfg.client_token} onChange={(e) => set({ client_token: e.target.value })} className={input} /></div>
          </div>
        )}
        {p === 'webhook' && (
          <div className="grid grid-cols-1 gap-2">
            <div><label className={label}>URL do webhook (recebe POST com {'{ phone, message }'}):</label><input value={cfg.api_url} onChange={(e) => set({ api_url: e.target.value })} className={input} /></div>
            <div><label className={label}>Token (opcional, enviado como Bearer):</label><input type="password" value={cfg.api_token} onChange={(e) => set({ api_token: e.target.value })} className={input} /></div>
          </div>
        )}

        <label className="flex items-center space-x-2 text-xs cursor-pointer"><input type="checkbox" checked={!!cfg.notify_store} onChange={(e) => set({ notify_store: e.target.checked })} className="accent-green-500 w-4 h-4" /><span>Avisar também o WhatsApp da loja quando chegar reserva nova</span></label>
        <label className="flex items-center space-x-2 text-xs cursor-pointer"><input type="checkbox" checked={!!cfg.active} onChange={(e) => set({ active: e.target.checked })} className="accent-green-500 w-4 h-4" /><span className="font-bold text-green-400">Ativar envio automático</span></label>

        <button type="button" disabled={busy} onClick={save} className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-xl text-xs font-bold text-white disabled:opacity-60">💾 Salvar</button>

        <div className="pt-3 border-t border-gray-800 grid grid-cols-3 gap-2 items-end">
          <div className="col-span-2"><label className={label}>Enviar mensagem de teste para:</label><input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className={input} /></div>
          <button type="button" disabled={busy} onClick={test} className="bg-gray-800 hover:bg-gray-700 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-60">🧪 Testar</button>
        </div>
      </section>

      <section className="bg-gray-950 p-4 rounded-2xl border border-gray-800 text-[11px] text-gray-300 space-y-2">
        <b className="text-green-400 block">📘 Como contratar e configurar</b>
        <p><b>Z-API (mais simples):</b> crie a conta em z-api.io → "Instâncias" → crie uma instância → leia o QR Code com o WhatsApp da loja → copie o <b>ID da instância</b> e o <b>Token</b>. Em "Segurança", ative e copie o <b>Client-Token</b>. Cole aqui, marque "Ativar" e clique em Testar.</p>
        <p><b>Evolution API:</b> contrate um servidor/revenda Evolution (ou instale no seu servidor) → crie uma instância → leia o QR Code → copie a <b>URL do servidor</b>, o <b>nome da instância</b> e a <b>API Key</b>. Cole aqui, marque "Ativar" e teste.</p>
        <p>Dica: use um número de WhatsApp só para a loja. Os lembretes automáticos saem todo dia às 9h.</p>
      </section>
    </div>
  );
}
