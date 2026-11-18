// =====================================================================
// GESTÃO — cálculos de estoque, compras e financeiro (usado pelo painel)
// =====================================================================

export const num = (v, fb = 0) => {
  if (v === null || v === undefined || v === '') return fb;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? fb : n;
};
export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
export const formatBRL = (v) => 'R$ ' + round2(num(v)).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const formatDateBR = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
export const todayISO = () => new Date().toLocaleDateString('sv-SE');
export const toISODate = (v) => (v ? new Date(v).toLocaleDateString('sv-SE') : '');
export const monthKey = (iso) => String(iso || '').slice(0, 7);
export function addDaysISO(iso, days) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10); }
export function addMonthsISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
export const monthLabel = (key) => { const [y, m] = key.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1] + '/' + y.slice(2); };

// ---------------------------------------------------------------------
// Categorias do financeiro (a loja pode digitar outras)
// ---------------------------------------------------------------------
export const PURCHASE_CATEGORY = 'Compra de mercadorias';
export const EXPENSE_CATEGORIES = [
  PURCHASE_CATEGORY, 'Aluguel', 'Água, luz e internet', 'Salários e pró-labore', 'Impostos', 'Taxas de pagamento (cartão/PIX)',
  'Frete e envios', 'Embalagens', 'Marketing e anúncios', 'Sistemas e assinaturas', 'Manutenção', 'Outras despesas'
];
export const INCOME_CATEGORIES = ['Vendas (loja)', 'Locações', 'Serviços', 'Outras receitas'];

// ---------------------------------------------------------------------
// Pedidos → receitas (entram sozinhos no financeiro)
// ---------------------------------------------------------------------
export const isOrderCancelled = (o) => o?.status === 'cancelado' || o?.rental_status === 'cancelado';
export const isOrderPaid = (o) => !!(o?.is_paid || String(o?.payment_method || '').includes('PAGO'));
const isDownPaid = (o) => String(o?.payment_method || '').toLowerCase().includes('sinal pago');

// Para cada pedido: quanto já entrou (realizado) e quanto falta receber
export function orderReceivables(orders) {
  return (orders || []).filter((o) => !isOrderCancelled(o)).map((o) => {
    const total = num(o.total);
    let received = 0;
    if (isOrderPaid(o)) received = total;
    else if (o.order_type === 'aluguel' && isDownPaid(o)) received = Math.min(num(o.down_payment_value), total);
    // pedido arquivado sem pagamento é considerado encerrado (não fica cobrando em "a receber")
    return {
      id: o.id,
      kind: o.order_type === 'aluguel' ? 'Locações' : 'Vendas (loja)',
      customer: o.customer_name,
      date: toISODate(o.created_at),
      due: o.order_type === 'aluguel' && o.rental_start ? o.rental_start : toISODate(o.created_at),
      total: round2(total),
      received: round2(received),
      open: o.status === 'arquivado' ? 0 : round2(Math.max(total - received, 0)),
      payment_method: o.payment_method
    };
  });
}

// ---------------------------------------------------------------------
// Situação de um lançamento
// ---------------------------------------------------------------------
export function txStatus(t, today = todayISO()) {
  if (t.status === 'cancelado') return 'cancelado';
  if (t.status === 'pago') return 'pago';
  if (t.due_date && t.due_date < today) return 'vencido';
  if (t.due_date && t.due_date <= addDaysISO(today, 7)) return 'vence_logo';
  return 'pendente';
}
export const TX_STATUS_LABEL = { pago: '🟢 Pago', vencido: '🔴 Vencido', vence_logo: '🟡 Vence em até 7 dias', pendente: '⚪ A vencer', cancelado: '⚫ Cancelado' };

// Próxima ocorrência de um lançamento mensal
export function nextRecurring(t) {
  return {
    tenant_id: t.tenant_id, type: t.type, category: t.category, description: t.description, amount: t.amount,
    due_date: addMonthsISO(t.due_date || todayISO(), 1), status: 'pendente', payment_method: t.payment_method,
    supplier_id: t.supplier_id || null, recurrence: 'mensal', notes: t.notes || null
  };
}

// ---------------------------------------------------------------------
// Visão geral do mês
// ---------------------------------------------------------------------
export function financeSummary({ transactions = [], orders = [], today = todayISO() }) {
  const month = monthKey(today);
  const rec = orderReceivables(orders);
  const tx = transactions.filter((t) => t.status !== 'cancelado');

  const receivedOrdersMonth = rec.filter((r) => monthKey(r.date) === month).reduce((s, r) => s + r.received, 0);
  const otherIncomeMonth = tx.filter((t) => t.type === 'receita' && t.status === 'pago' && monthKey(t.paid_at) === month).reduce((s, t) => s + num(t.amount), 0);
  const paidExpensesMonth = tx.filter((t) => t.type === 'despesa' && t.status === 'pago' && monthKey(t.paid_at) === month).reduce((s, t) => s + num(t.amount), 0);

  const toReceive = rec.reduce((s, r) => s + r.open, 0) + tx.filter((t) => t.type === 'receita' && t.status === 'pendente').reduce((s, t) => s + num(t.amount), 0);
  const pendingExp = tx.filter((t) => t.type === 'despesa' && t.status === 'pendente');
  const toPay = pendingExp.reduce((s, t) => s + num(t.amount), 0);
  const overdue = pendingExp.filter((t) => t.due_date && t.due_date < today);

  return {
    month,
    incomeMonth: round2(receivedOrdersMonth + otherIncomeMonth),
    expensesMonth: round2(paidExpensesMonth),
    balanceMonth: round2(receivedOrdersMonth + otherIncomeMonth - paidExpensesMonth),
    toReceive: round2(toReceive),
    toPay: round2(toPay),
    overdueCount: overdue.length,
    overdueAmount: round2(overdue.reduce((s, t) => s + num(t.amount), 0))
  };
}

// ---------------------------------------------------------------------
// Fluxo de caixa por mês (realizado + previsto)
// ---------------------------------------------------------------------
export function cashflowByMonth({ transactions = [], orders = [], months = 6, today = todayISO() }) {
  const keys = [];
  for (let i = months - 1; i >= 0; i--) keys.push(monthKey(addMonthsISO(today.slice(0, 8) + '01', -i)));
  const nextKeys = [1, 2, 3].map((i) => monthKey(addMonthsISO(today.slice(0, 8) + '01', i)));
  const all = [...keys, ...nextKeys];
  const rows = Object.fromEntries(all.map((k) => [k, { key: k, label: monthLabel(k), income: 0, expense: 0, forecastIncome: 0, forecastExpense: 0, future: nextKeys.includes(k) }]));

  orderReceivables(orders).forEach((r) => {
    if (rows[monthKey(r.date)]) rows[monthKey(r.date)].income += r.received;
    if (r.open > 0) { const k = monthKey(r.due < today ? today : r.due); if (rows[k]) rows[k].forecastIncome += r.open; }
  });
  transactions.filter((t) => t.status !== 'cancelado').forEach((t) => {
    if (t.status === 'pago') {
      const k = monthKey(t.paid_at);
      if (rows[k]) rows[k][t.type === 'receita' ? 'income' : 'expense'] += num(t.amount);
    } else {
      const k = monthKey(!t.due_date || t.due_date < today ? today : t.due_date);
      if (rows[k]) rows[k][t.type === 'receita' ? 'forecastIncome' : 'forecastExpense'] += num(t.amount);
    }
  });
  return all.map((k) => {
    const r = rows[k];
    return { ...r, income: round2(r.income), expense: round2(r.expense), forecastIncome: round2(r.forecastIncome), forecastExpense: round2(r.forecastExpense), balance: round2(r.income - r.expense) };
  });
}

// ---------------------------------------------------------------------
// DRE simplificado (regime de caixa para despesas; vendas pagas pela data do pedido)
// Compras de mercadoria NÃO entram como despesa: o custo entra pelo CMV (custo do que foi vendido).
// ---------------------------------------------------------------------
export function buildDRE({ orders = [], transactions = [], products = [], movements = [], start, end }) {
  const inPeriod = (iso) => iso && iso >= start && iso <= end;
  const paidOrders = (orders || []).filter((o) => !isOrderCancelled(o) && isOrderPaid(o) && inPeriod(toISODate(o.created_at)));
  const sales = paidOrders.filter((o) => o.order_type !== 'aluguel');
  const rentals = paidOrders.filter((o) => o.order_type === 'aluguel');

  const salesGross = sales.reduce((s, o) => s + num(o.subtotal, num(o.total) - num(o.delivery_fee)), 0);
  const rentalGross = rentals.reduce((s, o) => s + num(o.subtotal, num(o.total) - num(o.delivery_fee)), 0);
  const freightIncome = paidOrders.reduce((s, o) => s + num(o.delivery_fee), 0);
  const discounts = paidOrders.reduce((s, o) => s + Math.max(num(o.subtotal, num(o.total)) + num(o.delivery_fee) - num(o.total), 0), 0);
  const otherIncome = transactions.filter((t) => t.type === 'receita' && t.status === 'pago' && inPeriod(t.paid_at)).reduce((s, t) => s + num(t.amount), 0);

  // CMV: usa o custo registrado na hora da venda (histórico); sem histórico, usa o custo atual do produto
  const paidIds = new Set(sales.map((o) => String(o.id)));
  const movByOrder = {};
  (movements || []).filter((m) => m.order_id && (m.movement_type === 'venda' || m.movement_type === 'cancelamento')).forEach((m) => {
    (movByOrder[m.order_id] = movByOrder[m.order_id] || []).push(m);
  });
  let cmv = 0;
  let cmvWithoutCost = 0;
  sales.forEach((o) => {
    const movs = movByOrder[String(o.id)];
    if (movs && movs.length) {
      movs.forEach((m) => { cmv += -num(m.quantity) * num(m.unit_cost); });
    } else {
      (Array.isArray(o.items) ? o.items : []).forEach((i) => {
        if (i.is_digital) return;
        const p = products.find((pp) => String(pp.id) === String(i.id));
        if (p && p.cost_price !== null && p.cost_price !== undefined && p.cost_price !== '') cmv += num(p.cost_price) * num(i.quantity, 1);
        else cmvWithoutCost += 1;
      });
    }
  });

  const expenses = {};
  transactions.filter((t) => t.type === 'despesa' && t.status === 'pago' && inPeriod(t.paid_at) && t.category !== PURCHASE_CATEGORY)
    .forEach((t) => { const c = t.category || 'Outras despesas'; expenses[c] = (expenses[c] || 0) + num(t.amount); });
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0);

  const grossRevenue = salesGross + rentalGross + freightIncome + otherIncome;
  const netRevenue = grossRevenue - discounts;
  const grossProfit = netRevenue - cmv;
  const netProfit = grossProfit - totalExpenses;

  return {
    ordersCount: paidOrders.length,
    salesGross: round2(salesGross), rentalGross: round2(rentalGross), freightIncome: round2(freightIncome), otherIncome: round2(otherIncome),
    grossRevenue: round2(grossRevenue), discounts: round2(discounts), netRevenue: round2(netRevenue),
    cmv: round2(cmv), cmvWithoutCost, grossProfit: round2(grossProfit),
    grossMargin: netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0,
    expenses: Object.entries(expenses).map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    totalExpenses: round2(totalExpenses), netProfit: round2(netProfit),
    netMargin: netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0,
    ticket: paidOrders.length ? round2(netRevenue / paidOrders.length) : 0
  };
}

// ---------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------
export const isPhysical = (p) => !p.is_digital;
export const hasStockControl = (p) => isPhysical(p) && p.stock !== null && p.stock !== undefined && p.stock !== '';
export function stockStatus(p) {
  if (!hasStockControl(p)) return 'ilimitado';
  const s = num(p.stock);
  if (s <= 0) return 'zerado';
  if (p.min_stock !== null && p.min_stock !== undefined && p.min_stock !== '' && s <= num(p.min_stock)) return 'baixo';
  return 'ok';
}
export const STOCK_STATUS_LABEL = { ok: '🟢 OK', baixo: '🟡 Baixo', zerado: '🔴 Zerado', ilimitado: '∞ Sem controle' };

export function productMargin(p) {
  const price = num(p.price);
  const cost = num(p.cost_price, NaN);
  if (!(price > 0) || isNaN(cost)) return null;
  return { profit: round2(price - cost), percent: round2(((price - cost) / price) * 100), markup: cost > 0 ? round2(((price - cost) / cost) * 100) : null };
}

export function stockSummary(products) {
  const list = (products || []).filter(hasStockControl);
  const units = list.reduce((s, p) => s + Math.max(num(p.stock), 0), 0);
  const costValue = list.reduce((s, p) => s + Math.max(num(p.stock), 0) * num(p.cost_price), 0);
  const saleValue = list.reduce((s, p) => s + Math.max(num(p.stock), 0) * num(p.price), 0);
  return {
    controlled: list.length,
    units,
    costValue: round2(costValue),
    saleValue: round2(saleValue),
    potentialProfit: round2(saleValue - costValue),
    low: list.filter((p) => stockStatus(p) === 'baixo').length,
    zero: list.filter((p) => stockStatus(p) === 'zerado').length,
    withoutCost: list.filter((p) => p.cost_price === null || p.cost_price === undefined || p.cost_price === '').length
  };
}

// Sugestão de compra: leva o estoque ao dobro do mínimo
export function purchaseSuggestions(products) {
  return (products || [])
    .filter((p) => hasStockControl(p) && p.min_stock !== null && p.min_stock !== undefined && p.min_stock !== '' && num(p.stock) <= num(p.min_stock))
    .map((p) => ({ product: p, suggested: Math.max(num(p.min_stock) * 2 - num(p.stock), 1), supplier_id: p.supplier_id || null }))
    .sort((a, b) => num(a.product.stock) - num(b.product.stock));
}

export function purchaseTotal(items, freight = 0, other = 0) {
  return round2((items || []).reduce((s, i) => s + num(i.quantity) * num(i.unit_cost), 0) + num(freight) + num(other));
}

export function purchaseMessage(po, tenant) {
  const lines = (po.items || []).map((i) => `• ${i.quantity}x ${i.name}${num(i.unit_cost) > 0 ? ` — ${formatBRL(i.unit_cost)}/un.` : ''}`).join('\n');
  let msg = `Olá${po.supplier_contact ? ' ' + po.supplier_contact : ''}! Aqui é da *${tenant?.name || ''}*.\nGostaria de fazer o *pedido de compra #${po.id}*:\n\n${lines}\n`;
  if (num(po.total) > 0) msg += `\n*Total estimado:* ${formatBRL(po.total)}`;
  if (po.expected_date) msg += `\n*Entrega desejada:* ${formatDateBR(po.expected_date)}`;
  if (po.notes) msg += `\n\n📝 ${po.notes}`;
  msg += '\n\nPode confirmar, por favor?';
  return msg;
}

// ---------------------------------------------------------------------
// Exportar para planilha (CSV que o Excel abre em português)
// ---------------------------------------------------------------------
export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => {
    const v = typeof c.value === 'function' ? c.value(r) : r[c.value];
    return esc(typeof v === 'number' ? String(round2(v)).replace('.', ',') : v);
  }).join(';'));
  return '﻿' + [head, ...body].join('\n');
}

export function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}
