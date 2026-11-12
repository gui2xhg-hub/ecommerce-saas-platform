import React, { useState } from 'react';
import { getPeriods, num, formatBRL } from '../../lib/rental';

// Campos de LOCAÇÃO no cadastro/edição de produto (só aparecem se o módulo estiver ligado na loja)
export default function ProductRentalFields({ value, onChange, storeMode }) {
  const [pkgLabel, setPkgLabel] = useState('');
  const [pkgDays, setPkgDays] = useState('');
  const [pkgPrice, setPkgPrice] = useState('');

  if (!value || storeMode === 'venda') return null;
  const set = (patch) => onChange({ ...value, ...patch });
  const periods = getPeriods(value);
  const rentalOn = !!value.rental_enabled;

  const addPackage = () => {
    const days = parseInt(pkgDays, 10);
    const price = num(pkgPrice);
    if (!days || days < 1 || !price) return alert('Informe a quantidade de dias e o valor do pacote.');
    const list = [...periods, { label: pkgLabel.trim() || `Até ${days} dias`, days, price }].sort((a, b) => a.days - b.days);
    set({ rental_periods_json: list });
    setPkgLabel(''); setPkgDays(''); setPkgPrice('');
  };

  const removePackage = (idx) => set({ rental_periods_json: periods.filter((_, i) => i !== idx) });

  const input = 'w-full bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none';
  const hasPromo = num(value.rental_original_price) > num(value.rental_daily_price) && num(value.rental_daily_price) > 0;

  return (
    <div className="bg-gray-950 p-3.5 rounded-2xl border border-purple-500/30 space-y-3">
      <div className="flex flex-wrap gap-4">
        {storeMode === 'ambos' && (
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" checked={value.sale_enabled !== false} onChange={(e) => set({ sale_enabled: e.target.checked })} className="w-4 h-4 accent-blue-500" />
            <span className="text-xs font-bold text-blue-400">🛍️ Disponível para VENDA</span>
          </label>
        )}
        <label className="flex items-center space-x-2 cursor-pointer">
          <input type="checkbox" checked={rentalOn} onChange={(e) => set({ rental_enabled: e.target.checked })} className="w-4 h-4 accent-purple-500" />
          <span className="text-xs font-bold text-purple-400">🗓️ Disponível para ALUGUEL</span>
        </label>
      </div>

      {rentalOn && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-purple-300 font-bold block mb-1">Valor da diária (R$):</label>
              <input type="text" placeholder="Ex: 10.00" value={value.rental_daily_price ?? ''} onChange={(e) => set({ rental_daily_price: e.target.value })} className={input} />
            </div>
            <div>
              <label className="text-[10px] text-red-400 font-bold block mb-1">🔥 Promoção: diária "De" (R$):</label>
              <input type="text" placeholder="Opcional" value={value.rental_original_price ?? ''} onChange={(e) => set({ rental_original_price: e.target.value })} className={input} />
            </div>
            <div>
              <label className="text-[10px] text-green-400 font-bold block mb-1">📦 Quantidade p/ locação:</label>
              <input type="number" min="0" placeholder="Sem limite" value={value.rental_stock ?? ''} onChange={(e) => set({ rental_stock: e.target.value })} className={input} />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Mínimo de dias:</label>
              <input type="number" min="1" value={value.rental_min_days ?? 1} onChange={(e) => set({ rental_min_days: e.target.value })} className={input} />
            </div>
          </div>

          {hasPromo && (
            <p className="text-[10px] text-red-300">Na loja: <s>{formatBRL(value.rental_original_price)}</s> por <b>{formatBRL(value.rental_daily_price)}</b>/dia</p>
          )}

          <div>
            <label className="text-[10px] text-orange-400 font-bold block mb-1">⚠️ Valor de reposição em caso de dano ou perda (R$, por unidade):</label>
            <input type="text" placeholder="Ex: 150.00 — aparece para o cliente e no termo" value={value.replacement_value ?? ''} onChange={(e) => set({ replacement_value: e.target.value })} className={input} />
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-800">
            <label className="text-[11px] font-bold text-purple-300 block">🎁 Pacotes por período (opcional)</label>
            <p className="text-[10px] text-gray-400">Ex.: "Fim de semana" — até 3 dias por R$ 25. O sistema escolhe sozinho o mais barato para o cliente: diária × dias ou o pacote.</p>
            <div className="grid grid-cols-6 gap-2">
              <input type="text" placeholder="Nome (ex: Fim de semana)" value={pkgLabel} onChange={(e) => setPkgLabel(e.target.value)} className={`${input} col-span-3`} />
              <input type="number" min="1" placeholder="Até X dias" value={pkgDays} onChange={(e) => setPkgDays(e.target.value)} className={`${input} col-span-1`} />
              <input type="text" placeholder="R$" value={pkgPrice} onChange={(e) => setPkgPrice(e.target.value)} className={`${input} col-span-1`} />
              <button type="button" onClick={addPackage} className="col-span-1 bg-purple-600 hover:bg-purple-700 rounded-xl text-xs font-bold text-white">+ Add</button>
            </div>
            {periods.length > 0 && (
              <div className="space-y-1">
                {periods.map((p, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-gray-900 p-2 rounded-xl text-xs border border-gray-800">
                    <span><b className="text-purple-300">{p.label}</b> — até {p.days} dia(s) por <b>{formatBRL(p.price)}</b></span>
                    <button type="button" onClick={() => removePackage(idx)} className="text-red-400 font-bold px-2">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Converte os campos do formulário para gravar no banco
export function rentalFieldsToDb(prod) {
  const intOrNull = (v) => (v === '' || v === null || v === undefined ? null : Math.max(0, parseInt(v, 10) || 0));
  const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : num(v));
  return {
    sale_enabled: prod.sale_enabled !== false,
    rental_enabled: !!prod.rental_enabled,
    rental_daily_price: numOrNull(prod.rental_daily_price),
    rental_original_price: numOrNull(prod.rental_original_price),
    rental_periods_json: getPeriods(prod),
    rental_stock: intOrNull(prod.rental_stock),
    rental_min_days: Math.max(1, parseInt(prod.rental_min_days, 10) || 1),
    replacement_value: numOrNull(prod.replacement_value)
  };
}
