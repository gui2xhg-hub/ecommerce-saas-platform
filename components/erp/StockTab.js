import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  num, formatBRL, stockSummary, stockStatus, STOCK_STATUS_LABEL, hasStockControl, productMargin,
  purchaseSuggestions, toCSV, downloadCSV, todayISO
} from '../../lib/erp';
import { Card, Stat, SubTabs, Modal, Empty, inputCls, labelCls, btn, friendlyError } from './ui';

const MOVE_LABEL = {
  venda: '🛒 Venda', cancelamento: '↩️ Devolução/cancelamento', entrada: '📥 Entrada', saida: '📤 Saída',
  perda: '⚠️ Perda/avaria', inventario: '📋 Inventário', ajuste: '✏️ Ajuste no cadastro', compra: '🚚 Compra recebida'
};

export default function StockTab({ tenant, products, suppliers = [], primaryColor, onChanged, onTenantChanged, onCreatePurchase }) {
  const [view, setView] = useState('posicao');
  const [filter, setFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [moving, setMoving] = useState(null);
  const [moveForm, setMoveForm] = useState({ mode: 'entrada', quantity: '', unit_cost: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [movements, setMovements] = useState([]);
  const [movProduct, setMovProduct] = useState('');
  const [inventory, setInventory] = useState({});
  const enabled = !!tenant.stock_control_enabled;

  const physical = useMemo(() => (products || []).filter((p) => !p.is_digital), [products]);
  const summary = useMemo(() => stockSummary(physical), [physical]);
  const suggestions = useMemo(() => purchaseSuggestions(physical), [physical]);

  const loadMovements = async () => {
    let q = supabase.from('stock_movements').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(300);
    if (movProduct) q = q.eq('product_id', movProduct);
    const { data } = await q;
    setMovements(data || []);
  };
  useEffect(() => { if (view === 'historico') loadMovements(); }, [view, movProduct]);

  const toggleControl = async () => {
    const turningOn = !enabled;
    const msg = turningOn
      ? 'Ligar a BAIXA AUTOMÁTICA de estoque?\n\n• Cada venda da loja desconta do estoque na hora.\n• Pedido cancelado ou excluído devolve ao estoque.\n• Ninguém consegue comprar mais do que você tem.\n• Produtos com estoque em branco continuam ilimitados.'
      : 'Desligar a baixa automática? As vendas deixarão de descontar do estoque.';
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from('tenants').update({ stock_control_enabled: turningOn }).eq('id', tenant.id);
    if (error) return alert(friendlyError(error));
    onTenantChanged && onTenantChanged();
  };

  const filtered = physical.filter((p) => {
    const st = stockStatus(p);
    if (filter === 'baixo' && st !== 'baixo') return false;
    if (filter === 'zerado' && st !== 'zerado') return false;
    if (filter === 'semcusto' && !(hasStockControl(p) && (p.cost_price === null || p.cost_price === undefined))) return false;
    if (filter === 'controlados' && !hasStockControl(p)) return false;
    if (search) {
      const s = search.toLowerCase();
      if (![p.name, p.sku, p.barcode, p.stock_location].some((v) => String(v || '').toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const openMove = (p, mode = 'entrada') => {
    setMoving(p);
    setMoveForm({ mode, quantity: '', unit_cost: p.cost_price ?? '', reason: '' });
  };

  const submitMove = async (e) => {
    e.preventDefault();
    const qty = parseInt(moveForm.quantity, 10);
    if (isNaN(qty) || qty < 0 || (moveForm.mode !== 'definir' && qty === 0)) return alert('Informe a quantidade.');
    setSaving(true);
    const { error } = await supabase.rpc('stock_adjust', {
      p_tenant_id: String(tenant.id),
      p_product_id: String(moving.id),
      p_mode: moveForm.mode,
      p_quantity: qty,
      p_reason: moveForm.reason || null,
      p_unit_cost: moveForm.mode === 'entrada' && String(moveForm.unit_cost).trim() !== '' ? num(moveForm.unit_cost) : null,
      p_purchase_order_id: null
    });
    setSaving(false);
    if (error) return alert(friendlyError(error));
    setMoving(null);
    onChanged && onChanged();
    if (view === 'historico') loadMovements();
  };

  // Inventário: conta tudo e grava as diferenças de uma vez
  const saveInventory = async () => {
    const changes = Object.entries(inventory).filter(([id, v]) => {
      if (String(v).trim() === '') return false;
      const p = physical.find((pp) => String(pp.id) === id);
      return p && parseInt(v, 10) !== num(p.stock);
    });
    if (changes.length === 0) return alert('Nenhuma diferença para gravar.');
    if (!window.confirm(`Gravar a contagem de ${changes.length} produto(s)? O estoque será corrigido para o que você contou.`)) return;
    setSaving(true);
    for (const [id, v] of changes) {
      const { error } = await supabase.rpc('stock_adjust', {
        p_tenant_id: String(tenant.id), p_product_id: id, p_mode: 'definir', p_quantity: parseInt(v, 10),
        p_reason: 'Inventário ' + new Date().toLocaleDateString('pt-BR'), p_unit_cost: null, p_purchase_order_id: null
      });
      if (error) { setSaving(false); return alert(friendlyError(error)); }
    }
    setSaving(false);
    setInventory({});
    alert('Inventário gravado!');
    onChanged && onChanged();
  };

  const exportPosition = () => {
    downloadCSV(`estoque-${todayISO()}.csv`, toCSV(physical, [
      { label: 'Produto', value: 'name' }, { label: 'SKU', value: 'sku' }, { label: 'Código de barras', value: 'barcode' },
      { label: 'Local', value: 'stock_location' },
      { label: 'Estoque', value: (p) => (hasStockControl(p) ? num(p.stock) : 'ilimitado') },
      { label: 'Mínimo', value: 'min_stock' },
      { label: 'Custo unitário', value: (p) => (p.cost_price === null || p.cost_price === undefined ? '' : num(p.cost_price)) },
      { label: 'Preço de venda', value: (p) => num(p.price) },
      { label: 'Valor em estoque (custo)', value: (p) => (hasStockControl(p) ? Math.max(num(p.stock), 0) * num(p.cost_price) : '') },
      { label: 'Situação', value: (p) => STOCK_STATUS_LABEL[stockStatus(p)].replace(/^[^ ]+ /, '') }
    ]));
  };

  const exportMovements = () => {
    downloadCSV(`movimentacoes-estoque-${todayISO()}.csv`, toCSV(movements, [
      { label: 'Data', value: (m) => new Date(m.created_at).toLocaleString('pt-BR') }, { label: 'Produto', value: 'product_name' },
      { label: 'Tipo', value: (m) => (MOVE_LABEL[m.movement_type] || m.movement_type).replace(/^[^ ]+ /, '') },
      { label: 'Quantidade', value: (m) => num(m.quantity) }, { label: 'Saldo após', value: 'balance_after' },
      { label: 'Custo unitário', value: (m) => (m.unit_cost === null ? '' : num(m.unit_cost)) }, { label: 'Motivo', value: 'reason' }
    ]));
  };

  const supplierName = (id) => suppliers.find((s) => String(s.id) === String(id))?.name;

  return (
    <div className="space-y-4">
      {/* LIGA / DESLIGA BAIXA AUTOMÁTICA */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${enabled ? 'bg-green-500/10 border-green-500/30' : 'bg-gray-900 border-yellow-500/30'}`}>
        <div className="text-xs">
          <p className={`font-bold ${enabled ? 'text-green-400' : 'text-yellow-300'}`}>
            {enabled ? '✅ Baixa automática LIGADA' : '⏸️ Baixa automática desligada'}
          </p>
          <p className="text-gray-400 mt-0.5">
            {enabled ? 'Cada venda desconta do estoque; cancelamento devolve. A loja não vende o que não tem.' : 'Hoje as vendas não descontam do estoque. Ligue para controlar automaticamente.'}
          </p>
        </div>
        <button type="button" onClick={toggleControl} className={enabled ? btn.ghost : btn.green}>{enabled ? 'Desligar' : '▶️ Ligar baixa automática'}</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Valor do estoque (custo)" value={formatBRL(summary.costValue)} tone="blue" hint={`${summary.units} unidades`} />
        <Stat label="Valor de venda do estoque" value={formatBRL(summary.saleValue)} tone="green" hint={`Lucro potencial ${formatBRL(summary.potentialProfit)}`} />
        <Stat label="Estoque baixo" value={summary.low} tone={summary.low ? 'yellow' : 'white'} hint="no mínimo ou abaixo" />
        <Stat label="Zerados" value={summary.zero} tone={summary.zero ? 'red' : 'white'} hint={summary.withoutCost ? `${summary.withoutCost} sem custo cadastrado` : 'aparecem como Esgotado'} />
      </div>

      <SubTabs primaryColor={primaryColor} active={view} onChange={setView} tabs={[
        { id: 'posicao', label: '📦 Posição' },
        { id: 'reposicao', label: '🛒 Repor', badge: suggestions.length || null },
        { id: 'historico', label: '📜 Histórico' },
        { id: 'inventario', label: '📋 Inventário' }
      ]} />

      {view === 'posicao' && (
        <Card title="Posição de estoque" right={<button type="button" onClick={exportPosition} className={btn.small}>⬇️ Planilha</button>}>
          <div className="flex flex-col md:flex-row gap-2">
            <input placeholder="🔎 Buscar por nome, SKU, código de barras ou local" value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputCls} md:w-56`}>
              <option value="todos">Todos os produtos</option>
              <option value="controlados">Só com estoque controlado</option>
              <option value="baixo">🟡 Estoque baixo</option>
              <option value="zerado">🔴 Zerados</option>
              <option value="semcusto">Sem custo cadastrado</option>
            </select>
          </div>
          {filtered.length === 0 ? <Empty>Nenhum produto neste filtro.</Empty> : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const st = stockStatus(p);
                const m = productMargin(p);
                return (
                  <div key={p.id} className="bg-gray-950 border border-gray-800 rounded-2xl p-3 flex flex-col md:flex-row md:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{p.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {[p.sku && `SKU ${p.sku}`, p.stock_location && `📍 ${p.stock_location}`, supplierName(p.supplier_id) && `🏭 ${supplierName(p.supplier_id)}`].filter(Boolean).join(' • ') || '—'}
                      </p>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[10px] md:w-[420px]">
                      <div><span className="text-gray-500 block">Estoque</span><span className="font-bold text-white text-xs">{hasStockControl(p) ? num(p.stock) : '∞'}</span>{p.min_stock !== null && p.min_stock !== undefined && <span className="text-gray-500"> / mín {p.min_stock}</span>}</div>
                      <div><span className="text-gray-500 block">Custo</span><span className="font-bold text-gray-200">{p.cost_price !== null && p.cost_price !== undefined ? formatBRL(p.cost_price) : '—'}</span></div>
                      <div><span className="text-gray-500 block">Margem</span><span className={`font-bold ${m ? (m.percent < 0 ? 'text-red-400' : m.percent < 20 ? 'text-yellow-400' : 'text-green-400') : 'text-gray-500'}`}>{m ? `${m.percent}%` : '—'}</span></div>
                      <div><span className="text-gray-500 block">Situação</span><span className="font-bold">{STOCK_STATUS_LABEL[st]}</span></div>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => openMove(p, 'entrada')} className={btn.small}>📥 Entrada</button>
                      <button type="button" onClick={() => openMove(p, 'saida')} className={btn.small}>📤 Saída</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {view === 'reposicao' && (
        <Card title="Produtos para repor" right={suggestions.length > 0 && onCreatePurchase && (
          <button type="button" className={btn.green} onClick={() => onCreatePurchase(suggestions.map((s) => ({ product_id: String(s.product.id), name: s.product.name, quantity: s.suggested, unit_cost: s.product.cost_price ?? '', supplier_id: s.supplier_id })))}>
            🧾 Gerar pedido de compra
          </button>
        )}>
          <p className="text-[11px] text-gray-400">Aparecem aqui os produtos que chegaram no <b>estoque mínimo</b>. A sugestão leva o estoque ao dobro do mínimo.</p>
          {suggestions.length === 0 ? <Empty>Tudo em dia! Nenhum produto abaixo do mínimo. (Cadastre o "estoque mínimo" no produto para receber alertas.)</Empty> : (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div key={s.product.id} className="bg-gray-950 border border-gray-800 rounded-xl p-3 flex justify-between items-center text-xs gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{s.product.name}</p>
                    <p className="text-[10px] text-gray-500">Tem {num(s.product.stock)} • mínimo {s.product.min_stock}{supplierName(s.supplier_id) ? ` • 🏭 ${supplierName(s.supplier_id)}` : ''}</p>
                  </div>
                  <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-lg font-bold whitespace-nowrap">Comprar {s.suggested}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {view === 'historico' && (
        <Card title="Histórico de movimentações" right={<button type="button" onClick={exportMovements} className={btn.small}>⬇️ Planilha</button>}>
          <select value={movProduct} onChange={(e) => setMovProduct(e.target.value)} className={inputCls}>
            <option value="">Todos os produtos</option>
            {physical.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {movements.length === 0 ? <Empty>Nenhuma movimentação ainda. Elas aparecem quando há vendas (com a baixa automática ligada), entradas, saídas e compras.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300 min-w-[560px]">
                <thead className="bg-gray-950 text-gray-400 uppercase text-[10px]">
                  <tr><th className="p-2">Data</th><th className="p-2">Produto</th><th className="p-2">Tipo</th><th className="p-2 text-right">Qtd</th><th className="p-2 text-right">Saldo</th><th className="p-2">Motivo</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="p-2 whitespace-nowrap">{new Date(m.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="p-2">{m.product_name}</td>
                      <td className="p-2 whitespace-nowrap">{MOVE_LABEL[m.movement_type] || m.movement_type}</td>
                      <td className={`p-2 text-right font-bold ${num(m.quantity) < 0 ? 'text-red-400' : 'text-green-400'}`}>{num(m.quantity) > 0 ? '+' : ''}{m.quantity}</td>
                      <td className="p-2 text-right">{m.balance_after}</td>
                      <td className="p-2 text-gray-400">{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {view === 'inventario' && (
        <Card title="Inventário (contagem física)" right={<button type="button" disabled={saving} onClick={saveInventory} className={btn.green}>{saving ? 'Gravando...' : '💾 Gravar contagem'}</button>}>
          <p className="text-[11px] text-gray-400">Conte as peças na prateleira e digite a quantidade real. Deixe em branco o que não contou. Ao gravar, o sistema corrige o estoque e registra a diferença no histórico.</p>
          <div className="space-y-1">
            {physical.map((p) => {
              const v = inventory[p.id] ?? '';
              const diff = String(v).trim() !== '' ? parseInt(v, 10) - num(p.stock) : null;
              return (
                <div key={p.id} className="grid grid-cols-12 gap-2 items-center bg-gray-950 border border-gray-800 rounded-xl p-2 text-xs">
                  <span className="col-span-6 md:col-span-7 truncate text-white font-bold">{p.name}{p.stock_location ? <span className="text-gray-500 font-normal"> • {p.stock_location}</span> : null}</span>
                  <span className="col-span-2 text-gray-400 text-right">Sistema: {hasStockControl(p) ? num(p.stock) : '∞'}</span>
                  <input type="number" min="0" value={v} placeholder="Contado" onChange={(e) => setInventory({ ...inventory, [p.id]: e.target.value })} className="col-span-2 bg-gray-900 border border-gray-700 rounded-lg p-1.5 text-white text-xs" />
                  <span className={`col-span-2 md:col-span-1 text-right font-bold ${diff === null || diff === 0 ? 'text-gray-500' : diff < 0 ? 'text-red-400' : 'text-green-400'}`}>{diff === null ? '' : diff > 0 ? `+${diff}` : diff}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {moving && (
        <Modal title={`Movimentar: ${moving.name}`} onClose={() => setMoving(null)}>
          <p className="text-[11px] text-gray-400">Estoque atual: <b className="text-white">{hasStockControl(moving) ? num(moving.stock) : 'ilimitado (em branco)'}</b>{moving.cost_price !== null && moving.cost_price !== undefined ? <> • custo médio <b className="text-white">{formatBRL(moving.cost_price)}</b></> : null}</p>
          <form onSubmit={submitMove} className="space-y-3">
            <div className="grid grid-cols-2 gap-1 text-[11px] font-bold">
              {[['entrada', '📥 Entrada'], ['saida', '📤 Saída'], ['perda', '⚠️ Perda/avaria'], ['definir', '📋 Corrigir para']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setMoveForm({ ...moveForm, mode: k })}
                  className={`py-2 rounded-xl border ${moveForm.mode === k ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-400'}`}>{l}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>{moveForm.mode === 'definir' ? 'Quantidade real' : 'Quantidade'}</label>
                <input autoFocus type="number" min="0" value={moveForm.quantity} onChange={(e) => setMoveForm({ ...moveForm, quantity: e.target.value })} className={inputCls} />
              </div>
              {moveForm.mode === 'entrada' && (
                <div>
                  <label className={labelCls}>Custo unitário (R$)</label>
                  <input type="text" inputMode="decimal" value={moveForm.unit_cost} onChange={(e) => setMoveForm({ ...moveForm, unit_cost: e.target.value })} className={inputCls} />
                </div>
              )}
            </div>
            {moveForm.mode === 'entrada' && <p className="text-[10px] text-gray-500">O custo médio do produto é recalculado automaticamente.</p>}
            <div>
              <label className={labelCls}>Motivo / observação</label>
              <input type="text" placeholder={moveForm.mode === 'perda' ? 'Ex: peça com defeito' : 'Ex: nota fiscal 123, troca, brinde...'} value={moveForm.reason} onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })} className={inputCls} />
            </div>
            <button type="submit" disabled={saving} className={`${btn.primary} w-full`}>{saving ? 'Salvando...' : 'Confirmar'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
