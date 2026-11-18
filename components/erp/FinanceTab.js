import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  num, round2, formatBRL, formatDateBR, todayISO, addMonthsISO, addDaysISO, monthKey, txStatus, TX_STATUS_LABEL, nextRecurring,
  financeSummary, cashflowByMonth, buildDRE, orderReceivables, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PURCHASE_CATEGORY,
  toCSV, downloadCSV
} from '../../lib/erp';
import { Card, Stat, SubTabs, Modal, Empty, inputCls, labelCls, btn, friendlyError } from './ui';

const emptyTx = (type) => ({
  type, description: '', category: type === 'despesa' ? EXPENSE_CATEGORIES[1] : INCOME_CATEGORIES[3], amount: '', due_date: todayISO(),
  already_paid: false, payment_method: 'PIX', supplier_id: '', recurrence: 'nenhuma', repeat: 1, notes: ''
});

function periodRange(kind, custom) {
  const t = todayISO();
  const first = t.slice(0, 8) + '01';
  const lastOf = (iso) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).toISOString().slice(0, 10);
  if (kind === 'mes') return { start: first, end: lastOf(first) };
  if (kind === 'mes_passado') { const s = addMonthsISO(first, -1); return { start: s, end: lastOf(s) }; }
  if (kind === '3meses') return { start: addMonthsISO(first, -2), end: lastOf(first) };
  if (kind === 'ano') return { start: t.slice(0, 4) + '-01-01', end: t.slice(0, 4) + '-12-31' };
  return { start: custom.start || first, end: custom.end || t };
}

export default function FinanceTab({ tenant, orders, products, suppliers = [], primaryColor, onOrdersChanged }) {
  const [view, setView] = useState('geral');
  const [tx, setTx] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [payFilter, setPayFilter] = useState('abertas');
  const [monthFilter, setMonthFilter] = useState('');
  const [period, setPeriod] = useState('mes');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [movements, setMovements] = useState([]);
  const today = todayISO();

  const loadTx = async () => {
    const { data } = await supabase.from('fin_transactions').select('*').eq('tenant_id', tenant.id).order('due_date', { ascending: true }).limit(5000);
    setTx(data || []);
    setLoaded(true);
  };
  useEffect(() => { loadTx(); }, []);

  const range = periodRange(period, custom);
  useEffect(() => {
    if (view !== 'dre') return;
    supabase.from('stock_movements').select('order_id,quantity,unit_cost,movement_type,product_id')
      .eq('tenant_id', tenant.id).in('movement_type', ['venda', 'cancelamento'])
      .gte('created_at', range.start + 'T00:00:00').limit(10000)
      .then(({ data }) => setMovements(data || []));
  }, [view, range.start]);

  const summary = useMemo(() => financeSummary({ transactions: tx, orders, today }), [tx, orders, today]);
  const flow = useMemo(() => cashflowByMonth({ transactions: tx, orders, months: 6, today }), [tx, orders, today]);
  const dre = useMemo(() => buildDRE({ orders, transactions: tx, products, movements, start: range.start, end: range.end }), [orders, tx, products, movements, range.start, range.end]);
  const receivables = useMemo(() => orderReceivables(orders).filter((r) => r.open > 0), [orders]);

  // ---------------- LANÇAMENTOS ----------------
  const saveTx = async (e) => {
    e.preventDefault();
    const amount = round2(num(form.amount));
    if (!form.description.trim()) return alert('Descreva o lançamento.');
    if (!(amount > 0)) return alert('Informe o valor.');
    setSaving(true);
    const base = {
      type: form.type, category: form.category || null, description: form.description.trim(), amount,
      payment_method: form.payment_method || null, supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      recurrence: form.recurrence, notes: form.notes || null
    };
    let error;
    if (form.id) {
      ({ error } = await supabase.from('fin_transactions').update({ ...base, due_date: form.due_date || null }).eq('id', form.id));
    } else {
      const n = form.recurrence === 'mensal' ? 1 : Math.max(parseInt(form.repeat, 10) || 1, 1);
      const rows = Array.from({ length: n }, (_, i) => ({
        ...base, tenant_id: tenant.id,
        description: n > 1 ? `${base.description} (${i + 1}/${n})` : base.description,
        installment: n > 1 ? `${i + 1}/${n}` : null,
        due_date: addMonthsISO(form.due_date || today, i),
        status: form.already_paid && i === 0 ? 'pago' : 'pendente',
        paid_at: form.already_paid && i === 0 ? (form.due_date || today) : null
      }));
      ({ error } = await supabase.from('fin_transactions').insert(rows));
      if (!error && form.recurrence === 'mensal' && form.already_paid) {
        await supabase.from('fin_transactions').insert([{ ...nextRecurring({ ...rows[0], due_date: rows[0].due_date }), description: base.description }]);
      }
    }
    setSaving(false);
    if (error) return alert(friendlyError(error));
    setForm(null);
    loadTx();
  };

  const markPaid = async (t) => {
    const paidAt = typeof window !== 'undefined' ? window.prompt(`Data do ${t.type === 'despesa' ? 'pagamento' : 'recebimento'} (dd/mm/aaaa)`, new Date().toLocaleDateString('pt-BR')) : null;
    if (paidAt === null) return;
    const m = paidAt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : today;
    const { error } = await supabase.from('fin_transactions').update({ status: 'pago', paid_at: iso }).eq('id', t.id);
    if (error) return alert(friendlyError(error));
    // despesa fixa mensal: já deixa o próximo mês lançado
    if (t.recurrence === 'mensal') {
      const next = nextRecurring(t);
      const exists = tx.some((o) => o.id !== t.id && o.recurrence === 'mensal' && o.description === t.description && o.due_date === next.due_date);
      if (!exists) await supabase.from('fin_transactions').insert([next]);
    }
    loadTx();
  };
  const unpay = async (t) => { await supabase.from('fin_transactions').update({ status: 'pendente', paid_at: null }).eq('id', t.id); loadTx(); };
  const removeTx = async (t) => {
    if (!window.confirm(`Excluir "${t.description}"?`)) return;
    await supabase.from('fin_transactions').delete().eq('id', t.id);
    loadTx();
  };
  const stopRecurring = async (t) => {
    if (!window.confirm('Parar de repetir esta conta todo mês?')) return;
    await supabase.from('fin_transactions').update({ recurrence: 'nenhuma' }).eq('id', t.id);
    loadTx();
  };

  const markOrderReceived = async (r) => {
    if (!window.confirm(`Marcar o pedido #${r.id} (${r.customer}) como PAGO? Valor em aberto: ${formatBRL(r.open)}`)) return;
    const { error } = await supabase.from('orders').update({ is_paid: true }).eq('id', r.id);
    if (error) return alert(friendlyError(error));
    onOrdersChanged && onOrdersChanged();
  };

  const listFor = (type) => tx.filter((t) => {
    if (t.type !== type) return false;
    const st = txStatus(t, today);
    if (payFilter === 'abertas' && !['pendente', 'vencido', 'vence_logo'].includes(st)) return false;
    if (payFilter === 'vencidas' && st !== 'vencido') return false;
    if (payFilter === 'pagas' && st !== 'pago') return false;
    if (monthFilter && monthKey(t.status === 'pago' ? t.paid_at : t.due_date) !== monthFilter) return false;
    return true;
  });

  const exportTx = (type) => {
    const rows = listFor(type);
    downloadCSV(`${type === 'despesa' ? 'contas-a-pagar' : 'contas-a-receber'}-${today}.csv`, toCSV(rows, [
      { label: 'Descrição', value: 'description' }, { label: 'Categoria', value: 'category' }, { label: 'Valor', value: (t) => num(t.amount) },
      { label: 'Vencimento', value: (t) => formatDateBR(t.due_date) }, { label: 'Pago em', value: (t) => formatDateBR(t.paid_at) },
      { label: 'Situação', value: (t) => TX_STATUS_LABEL[txStatus(t, today)].replace(/^[^ ]+ /, '') }, { label: 'Forma', value: 'payment_method' },
      { label: 'Fornecedor', value: (t) => suppliers.find((s) => String(s.id) === String(t.supplier_id))?.name || '' }
    ]));
  };

  const exportDRE = () => {
    const rows = [
      ['Vendas (produtos)', dre.salesGross], ['Locações', dre.rentalGross], ['Fretes cobrados', dre.freightIncome], ['Outras receitas', dre.otherIncome],
      ['= RECEITA BRUTA', dre.grossRevenue], ['(-) Descontos e cupons', -dre.discounts], ['= RECEITA LÍQUIDA', dre.netRevenue],
      ['(-) Custo das mercadorias vendidas (CMV)', -dre.cmv], ['= LUCRO BRUTO', dre.grossProfit],
      ...dre.expenses.map((e) => [`(-) ${e.category}`, -e.amount]), ['= LUCRO LÍQUIDO', dre.netProfit]
    ].map(([l, v]) => ({ l, v }));
    downloadCSV(`dre-${range.start}-a-${range.end}.csv`, toCSV(rows, [{ label: `DRE ${formatDateBR(range.start)} a ${formatDateBR(range.end)}`, value: 'l' }, { label: 'Valor (R$)', value: 'v' }]));
  };

  const maxFlow = Math.max(1, ...flow.map((f) => Math.max(f.income + f.forecastIncome, f.expense + f.forecastExpense)));
  const overdueBadge = tx.filter((t) => t.type === 'despesa' && txStatus(t, today) === 'vencido').length;
  const months = Array.from(new Set(tx.map((t) => monthKey(t.status === 'pago' ? t.paid_at : t.due_date)).filter(Boolean))).sort().reverse();

  const renderTxList = (type) => {
    const rows = listFor(type);
    const total = rows.reduce((s, t) => s + num(t.amount), 0);
    return (
      <Card title={type === 'despesa' ? '📤 Contas a pagar' : '📥 Outras receitas'} right={
        <div className="flex gap-1">
          <button type="button" className={btn.small} onClick={() => exportTx(type)}>⬇️ Planilha</button>
          <button type="button" className={btn.primary} onClick={() => setForm(emptyTx(type))}>➕ {type === 'despesa' ? 'Nova despesa' : 'Nova receita'}</button>
        </div>
      }>
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex gap-1 overflow-x-auto text-[11px]">
            {[['abertas', 'Em aberto'], ['vencidas', 'Vencidas'], ['pagas', type === 'despesa' ? 'Pagas' : 'Recebidas'], ['todas', 'Todas']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPayFilter(k)} className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap ${payFilter === k ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>{l}</button>
            ))}
          </div>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={`${inputCls} md:w-44 md:ml-auto`}>
            <option value="">Todos os meses</option>
            {months.map((m) => <option key={m} value={m}>{m.split('-').reverse().join('/')}</option>)}
          </select>
        </div>
        {rows.length === 0 ? <Empty>{type === 'despesa' ? 'Nenhuma conta aqui. Lance aluguel, contas fixas, impostos... As compras recebidas de fornecedores entram sozinhas.' : 'Receitas fora da loja (serviços, vendas no balcão etc.). As vendas da loja já entram sozinhas em "A receber".'}</Empty> : (
          <div className="space-y-1">
            {rows.map((t) => {
              const st = txStatus(t, today);
              return (
                <div key={t.id} className={`bg-gray-950 border rounded-xl p-3 text-xs flex flex-col md:flex-row md:items-center gap-2 ${st === 'vencido' ? 'border-red-500/40' : 'border-gray-800'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{t.description}{t.recurrence === 'mensal' ? ' 🔁' : ''}</p>
                    <p className="text-[10px] text-gray-500">{[t.category, t.payment_method, suppliers.find((s) => String(s.id) === String(t.supplier_id))?.name].filter(Boolean).join(' • ')}</p>
                  </div>
                  <div className="flex items-center justify-between md:justify-end gap-3">
                    <div className="text-right">
                      <p className="font-extrabold text-white">{formatBRL(t.amount)}</p>
                      <p className="text-[10px] text-gray-400">{st === 'pago' ? `pago ${formatDateBR(t.paid_at)}` : `vence ${formatDateBR(t.due_date)}`} • {TX_STATUS_LABEL[st]}</p>
                    </div>
                    <div className="flex gap-1">
                      {st !== 'pago' && st !== 'cancelado' && <button type="button" className={btn.green} onClick={() => markPaid(t)}>{type === 'despesa' ? 'Pagar' : 'Recebi'}</button>}
                      {st === 'pago' && <button type="button" className={btn.small} title="Desfazer" onClick={() => unpay(t)}>↩️</button>}
                      <button type="button" className={btn.small} onClick={() => setForm({ ...emptyTx(type), ...t, supplier_id: t.supplier_id ? String(t.supplier_id) : '', amount: String(t.amount) })}>✏️</button>
                      {t.recurrence === 'mensal' && <button type="button" className={btn.small} title="Parar de repetir" onClick={() => stopRecurring(t)}>⏹️</button>}
                      <button type="button" className={btn.small} onClick={() => removeTx(t)}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-right text-xs text-gray-400 pt-1">Total da lista: <b className="text-white">{formatBRL(total)}</b></p>
          </div>
        )}
      </Card>
    );
  };

  const dreLine = ({ label, value, strong, minus, tone }) => (
    <div key={label} className={`flex justify-between py-1.5 text-xs ${strong ? 'border-t border-gray-700 font-extrabold' : 'text-gray-300'}`}>
      <span className={strong ? 'text-white' : ''}>{label}</span>
      <span className={tone || (strong ? (value < 0 ? 'text-red-400' : 'text-white') : minus ? 'text-red-300' : 'text-gray-200')}>{(minus && value > 0) || (!minus && value < 0) ? '− ' : ''}{formatBRL(Math.abs(value))}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <SubTabs primaryColor={primaryColor} active={view} onChange={(v) => { setView(v); setPayFilter('abertas'); setMonthFilter(''); }} tabs={[
        { id: 'geral', label: '📊 Visão geral' },
        { id: 'pagar', label: '📤 A pagar', badge: overdueBadge || null },
        { id: 'receber', label: '📥 A receber' },
        { id: 'fluxo', label: '📈 Fluxo de caixa' },
        { id: 'dre', label: '🧮 Resultado (DRE)' }
      ]} />

      {!loaded && <Empty>Carregando...</Empty>}

      {loaded && view === 'geral' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Entrou este mês" value={formatBRL(summary.incomeMonth)} tone="green" hint="vendas pagas + outras receitas" />
            <Stat label="Saiu este mês" value={formatBRL(summary.expensesMonth)} tone="red" hint="contas pagas" />
            <Stat label="Saldo do mês" value={formatBRL(summary.balanceMonth)} tone={summary.balanceMonth < 0 ? 'red' : 'blue'} />
            <Stat label="A receber" value={formatBRL(summary.toReceive)} tone="green" hint="pedidos não pagos + receitas" />
            <Stat label="A pagar" value={formatBRL(summary.toPay)} tone="orange" hint="contas em aberto" />
            <Stat label="Vencidas" value={summary.overdueCount ? formatBRL(summary.overdueAmount) : 'Nenhuma'} tone={summary.overdueCount ? 'red' : 'green'} hint={summary.overdueCount ? `${summary.overdueCount} conta(s) atrasada(s)` : 'tudo em dia 👍'} />
          </div>

          <Card title="⏰ Próximos vencimentos (15 dias)">
            {(() => {
              const limit = addDaysISO(today, 15);
              const next = tx.filter((t) => t.status === 'pendente' && t.due_date && t.due_date <= limit).slice(0, 12);
              if (!next.length) return <Empty>Nada vencendo nos próximos 15 dias.</Empty>;
              return next.map((t) => {
                const st = txStatus(t, today);
                return (
                  <div key={t.id} className="flex justify-between items-center bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs">
                    <span className="truncate"><span className={t.type === 'despesa' ? 'text-red-400' : 'text-green-400'}>{t.type === 'despesa' ? '▼' : '▲'}</span> {t.description}</span>
                    <span className="whitespace-nowrap text-right"><b className="text-white">{formatBRL(t.amount)}</b> <span className={`text-[10px] ${st === 'vencido' ? 'text-red-400' : 'text-gray-400'}`}>{formatDateBR(t.due_date)}</span></span>
                  </div>
                );
              });
            })()}
          </Card>

          <Card title="💡 Como funciona">
            <ul className="text-[11px] text-gray-400 space-y-1 list-disc pl-4">
              <li><b className="text-gray-200">Vendas da loja</b> entram sozinhas: pagas viram "entrou", não pagas ficam em "a receber".</li>
              <li><b className="text-gray-200">Compras de fornecedor</b> recebidas criam as parcelas em "a pagar" automaticamente.</li>
              <li><b className="text-gray-200">Contas fixas</b> (aluguel, internet...) marque como "todo mês": ao pagar, o próximo mês já é lançado.</li>
              <li>O <b className="text-gray-200">Resultado (DRE)</b> mostra o lucro de verdade, descontando o custo dos produtos vendidos.</li>
            </ul>
          </Card>
        </div>
      )}

      {loaded && view === 'pagar' && renderTxList('despesa')}

      {loaded && view === 'receber' && (
        <div className="space-y-4">
          <Card title="🛒 Pedidos da loja ainda não pagos">
            {receivables.length === 0 ? <Empty>Nenhum pedido em aberto. 🎉</Empty> : (
              <div className="space-y-1">
                {receivables.map((r) => (
                  <div key={r.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2 bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-white truncate">#{r.id} • {r.customer}</p>
                      <p className="text-[10px] text-gray-500">{r.kind} • {formatDateBR(r.date)} • {r.payment_method}{r.received > 0 ? ` • sinal recebido ${formatBRL(r.received)}` : ''}</p>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-3">
                      <span className="font-extrabold text-white">{formatBRL(r.open)}</span>
                      <button type="button" className={btn.green} onClick={() => markOrderReceived(r)}>Recebi</button>
                    </div>
                  </div>
                ))}
                <p className="text-right text-xs text-gray-400 pt-1">Total: <b className="text-white">{formatBRL(receivables.reduce((s, r) => s + r.open, 0))}</b></p>
              </div>
            )}
          </Card>
          {renderTxList('receita')}
        </div>
      )}

      {loaded && view === 'fluxo' && (
        <Card title="Fluxo de caixa — 6 meses + previsão de 3">
          <div className="flex gap-3 text-[10px] text-gray-400">
            <span><span className="inline-block w-2.5 h-2.5 rounded bg-green-500 mr-1" />Entradas</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded bg-red-500 mr-1" />Saídas</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded bg-gray-500 mr-1" />Previsto</span>
          </div>
          <div className="flex items-end gap-1 md:gap-2 h-40 border-b border-gray-800 pt-2">
            {flow.map((f) => (
              <div key={f.key} className="flex-1 flex items-end justify-center gap-0.5 h-full" title={`${f.label}: entradas ${formatBRL(f.income + f.forecastIncome)} / saídas ${formatBRL(f.expense + f.forecastExpense)}`}>
                <div className="w-1/2 max-w-[18px] flex flex-col justify-end h-full">
                  <div className="bg-gray-500/60 rounded-t" style={{ height: `${(f.forecastIncome / maxFlow) * 100}%` }} />
                  <div className="bg-green-500" style={{ height: `${(f.income / maxFlow) * 100}%` }} />
                </div>
                <div className="w-1/2 max-w-[18px] flex flex-col justify-end h-full">
                  <div className="bg-gray-500/60 rounded-t" style={{ height: `${(f.forecastExpense / maxFlow) * 100}%` }} />
                  <div className="bg-red-500" style={{ height: `${(f.expense / maxFlow) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-gray-300 min-w-[520px]">
              <thead className="text-[10px] text-gray-400 uppercase"><tr><th className="p-2 text-left">Mês</th><th className="p-2 text-right">Entradas</th><th className="p-2 text-right">Saídas</th><th className="p-2 text-right">Saldo</th><th className="p-2 text-right">Previsto (+/−)</th></tr></thead>
              <tbody className="divide-y divide-gray-800">
                {flow.map((f) => (
                  <tr key={f.key} className={f.future ? 'text-gray-500' : ''}>
                    <td className="p-2 font-bold">{f.label}{f.key === monthKey(today) ? ' (atual)' : ''}</td>
                    <td className="p-2 text-right text-green-400">{formatBRL(f.income)}</td>
                    <td className="p-2 text-right text-red-400">{formatBRL(f.expense)}</td>
                    <td className={`p-2 text-right font-bold ${f.balance < 0 ? 'text-red-400' : 'text-white'}`}>{formatBRL(f.balance)}</td>
                    <td className="p-2 text-right">{formatBRL(f.forecastIncome)} / {formatBRL(f.forecastExpense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {loaded && view === 'dre' && (
        <Card title="Resultado do período (DRE)" right={<button type="button" className={btn.small} onClick={exportDRE}>⬇️ Planilha</button>}>
          <div className="flex flex-wrap gap-1 text-[11px]">
            {[['mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['3meses', '3 meses'], ['ano', 'Este ano'], ['custom', 'Escolher datas']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPeriod(k)} className={`px-3 py-1.5 rounded-xl font-bold ${period === k ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>{l}</button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>De</label><input type="date" className={inputCls} value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} /></div>
              <div><label className={labelCls}>Até</label><input type="date" className={inputCls} value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} /></div>
            </div>
          )}
          <p className="text-[11px] text-gray-500">{formatDateBR(range.start)} a {formatDateBR(range.end)} • {dre.ordersCount} pedido(s) pago(s) • ticket médio {formatBRL(dre.ticket)}</p>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Receita líquida" value={formatBRL(dre.netRevenue)} tone="blue" />
            <Stat label="Margem bruta" value={`${dre.grossMargin}%`} tone={dre.grossMargin < 20 ? 'yellow' : 'green'} />
            <Stat label="Lucro líquido" value={formatBRL(dre.netProfit)} tone={dre.netProfit < 0 ? 'red' : 'green'} hint={`${dre.netMargin}% da receita`} />
          </div>

          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4">
            {dreLine({ label: 'Vendas de produtos', value: dre.salesGross })}
            {dre.rentalGross > 0 && dreLine({ label: 'Locações', value: dre.rentalGross })}
            {dreLine({ label: 'Fretes cobrados', value: dre.freightIncome })}
            {dre.otherIncome > 0 && dreLine({ label: 'Outras receitas', value: dre.otherIncome })}
            {dreLine({ strong: true, label: '= Receita bruta', value: dre.grossRevenue })}
            {dreLine({ minus: true, label: '(−) Descontos e cupons', value: dre.discounts })}
            {dreLine({ strong: true, label: '= Receita líquida', value: dre.netRevenue })}
            {dreLine({ minus: true, label: '(−) Custo das mercadorias vendidas', value: dre.cmv })}
            {dreLine({ strong: true, label: `= Lucro bruto (${dre.grossMargin}%)`, value: dre.grossProfit })}
            {dre.expenses.map((e) => dreLine({ minus: true, label: `(−) ${e.category}`, value: e.amount }))}
            {dreLine({ strong: true, label: `= LUCRO LÍQUIDO (${dre.netMargin}%)`, value: dre.netProfit, tone: dre.netProfit < 0 ? 'text-red-400' : 'text-green-400' })}
          </div>
          {dre.cmvWithoutCost > 0 && <p className="text-[11px] text-yellow-300">⚠️ {dre.cmvWithoutCost} item(ns) vendido(s) sem custo cadastrado — o lucro aparece maior do que é. Cadastre o custo nos produtos.</p>}
          <p className="text-[10px] text-gray-500">Despesas pelo dia em que foram pagas. Compras de mercadoria não aparecem como despesa aqui: o custo delas entra no "custo das mercadorias vendidas", conforme os produtos são vendidos.</p>
        </Card>
      )}

      {form && (
        <Modal title={form.id ? 'Editar lançamento' : form.type === 'despesa' ? 'Nova despesa' : 'Nova receita'} onClose={() => setForm(null)}>
          <form onSubmit={saveTx} className="space-y-2">
            <div><label className={labelCls}>Descrição *</label><input autoFocus className={inputCls} placeholder={form.type === 'despesa' ? 'Ex: Aluguel da loja' : 'Ex: Venda no balcão'} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Valor (R$) *</label><input className={inputCls} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label className={labelCls}>Vencimento</label><input className={inputCls} type="date" value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              <div>
                <label className={labelCls}>Categoria</label>
                <input className={inputCls} list={`cat-${form.type}`} value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                <datalist id={`cat-${form.type}`}>{(form.type === 'despesa' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div><label className={labelCls}>Forma</label>
                <select className={inputCls} value={form.payment_method || ''} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                  {['PIX', 'Boleto', 'Cartão', 'Dinheiro', 'Transferência', 'Débito automático'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {form.type === 'despesa' && suppliers.length > 0 && (
              <div><label className={labelCls}>Fornecedor (opcional)</label>
                <select className={inputCls} value={form.supplier_id || ''} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Repetição</label>
                <select className={inputCls} value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
                  <option value="nenhuma">Não repete</option><option value="mensal">🔁 Todo mês (conta fixa)</option>
                </select>
              </div>
              {!form.id && form.recurrence !== 'mensal' && (
                <div><label className={labelCls}>Parcelas</label><input className={inputCls} type="number" min="1" max="60" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} /></div>
              )}
            </div>
            {form.category === PURCHASE_CATEGORY && <p className="text-[10px] text-yellow-300">Dica: para compras de mercadoria use "Fornecedores → Nova compra": o estoque e o custo dos produtos são atualizados juntos.</p>}
            {!form.id && <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={form.already_paid} onChange={(e) => setForm({ ...form, already_paid: e.target.checked })} /> {form.type === 'despesa' ? 'Já está paga' : 'Já recebi'}{Number(form.repeat) > 1 ? ' (1ª parcela)' : ''}</label>}
            <div><label className={labelCls}>Observação</label><input className={inputCls} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <button type="submit" disabled={saving} className={`${btn.primary} w-full`}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
