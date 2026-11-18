import React from 'react';
import { inputCls, labelCls } from './ui';
import { num, round2, formatBRL } from '../../lib/erp';

export const EMPTY_COST_FIELDS = { cost_price: '', sku: '', barcode: '', min_stock: '', supplier_id: '', stock_location: '' };

export function costFieldsFromProduct(p) {
  return {
    cost_price: p?.cost_price ?? '',
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    min_stock: p?.min_stock ?? '',
    supplier_id: p?.supplier_id ?? '',
    stock_location: p?.stock_location ?? ''
  };
}

export function costFieldsToDb(v) {
  const clean = (x) => (x === undefined || x === null || String(x).trim() === '' ? null : String(x).trim());
  const cost = clean(v.cost_price);
  const min = clean(v.min_stock);
  const sup = clean(v.supplier_id);
  return {
    cost_price: cost === null ? null : round2(num(cost)),
    sku: clean(v.sku),
    barcode: clean(v.barcode),
    min_stock: min === null ? null : parseInt(min, 10),
    supplier_id: sup === null ? null : Number(sup),
    stock_location: clean(v.stock_location)
  };
}

// Bloco "Custos e estoque" no cadastro do produto
export default function ProductCostFields({ value, onChange, suppliers = [], price, onPrice }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const p = num(price);
  const c = num(value.cost_price, NaN);
  const showMargin = p > 0 && !isNaN(c) && String(value.cost_price).trim() !== '';
  const margin = showMargin ? round2(((p - c) / p) * 100) : null;
  const marginTone = margin === null ? '' : margin < 0 ? 'text-red-400' : margin < 20 ? 'text-yellow-400' : 'text-green-400';

  const applyMarkup = () => {
    const mk = typeof window !== 'undefined' ? window.prompt('Margem desejada sobre o custo (%)\nEx.: 100 = vender pelo dobro do custo', '100') : null;
    if (mk === null || isNaN(c)) return;
    const newPrice = round2(c * (1 + num(mk) / 100));
    if (onPrice) onPrice(newPrice.toFixed(2));
  };

  return (
    <div className="bg-gray-950/60 border border-blue-500/20 rounded-2xl p-3 space-y-2">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <span className="text-[11px] font-bold text-blue-300">💰 Custo, código e reposição (só você vê)</span>
        {showMargin && (
          <span className={`text-[11px] font-bold ${marginTone}`}>
            Lucro {formatBRL(p - c)} por unidade • margem {margin}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Custo unitário (R$)</label>
          <div className="flex gap-1">
            <input type="text" inputMode="decimal" placeholder="Ex: 25,00" value={value.cost_price} onChange={(e) => set('cost_price', e.target.value)} className={inputCls} />
            {onPrice && !isNaN(c) && String(value.cost_price).trim() !== '' && (
              <button type="button" title="Calcular preço de venda pela margem" onClick={applyMarkup} className="bg-gray-800 hover:bg-gray-700 rounded-xl px-2 text-xs">%</button>
            )}
          </div>
        </div>
        <div>
          <label className={labelCls}>Estoque mínimo (alerta)</label>
          <input type="number" min="0" placeholder="Ex: 3" value={value.min_stock} onChange={(e) => set('min_stock', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Fornecedor</label>
          <select value={value.supplier_id ?? ''} onChange={(e) => set('supplier_id', e.target.value)} className={inputCls}>
            <option value="">—</option>
            {suppliers.filter((s) => s.active !== false || String(s.id) === String(value.supplier_id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Código (SKU)</label>
          <input type="text" placeholder="Ex: CAM-PRT-M" value={value.sku} onChange={(e) => set('sku', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Código de barras</label>
          <input type="text" inputMode="numeric" placeholder="EAN" value={value.barcode} onChange={(e) => set('barcode', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Local no estoque</label>
          <input type="text" placeholder="Ex: Prateleira A2" value={value.stock_location} onChange={(e) => set('stock_location', e.target.value)} className={inputCls} />
        </div>
      </div>
    </div>
  );
}
