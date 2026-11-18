import React from 'react';

export const inputCls = 'w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500';
export const labelCls = 'text-[10px] text-gray-400 block mb-1 font-bold';

export function Card({ title, right, children, className = '' }) {
  return (
    <section className={`bg-gray-900 p-4 md:p-5 rounded-3xl border border-gray-800 space-y-3 shadow-xl ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap gap-2 justify-between items-center">
          {title && <h3 className="font-bold text-xs text-blue-400 uppercase tracking-wider">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = 'white', hint }) {
  const colors = { white: 'text-white', green: 'text-green-400', red: 'text-red-400', blue: 'text-blue-400', orange: 'text-orange-400', yellow: 'text-yellow-400', purple: 'text-purple-300' };
  return (
    <div className="bg-gray-900 p-3 md:p-4 rounded-2xl border border-gray-800 min-w-0">
      <span className="text-[10px] md:text-[11px] text-gray-400 block mb-1 leading-tight">{label}</span>
      <span className={`text-base md:text-lg font-extrabold break-words ${colors[tone] || colors.white}`}>{value}</span>
      {hint && <span className="text-[10px] text-gray-500 block mt-0.5">{hint}</span>}
    </div>
  );
}

export function SubTabs({ tabs, active, onChange, primaryColor }) {
  return (
    <div className="flex gap-1 bg-gray-900 p-1.5 rounded-2xl border border-gray-800 text-[11px] font-bold overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          style={active === t.id ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}}
          className={`flex-1 py-2 px-3 rounded-xl whitespace-nowrap transition ${active === t.id ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>
          {t.label}{t.badge ? <span className="ml-1 bg-red-500 text-white rounded-full px-1.5 text-[9px]">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`bg-gray-900 border border-gray-800 w-full ${wide ? 'md:max-w-2xl' : 'md:max-w-md'} rounded-t-3xl md:rounded-3xl p-5 space-y-3 max-h-[92vh] overflow-y-auto`}>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-sm text-blue-400">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none px-2">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SetupNotice() {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/40 p-5 rounded-3xl text-xs text-yellow-200 space-y-2">
      <p className="font-bold text-sm text-yellow-300">⚙️ Falta só um passo para liberar esta área</p>
      <p>O administrador do sistema precisa rodar uma vez o arquivo <b>supabase/gestao_01_estoque_fornecedores_financeiro.sql</b> no Supabase (SQL Editor → colar → Run).</p>
      <p className="text-yellow-200/70">Depois disso, atualize esta página. Nada do que já existe na loja é alterado.</p>
    </div>
  );
}

export function Empty({ children }) {
  return <p className="text-xs text-gray-500 text-center py-6">{children}</p>;
}

export const btn = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition disabled:opacity-50',
  green: 'bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition disabled:opacity-50',
  ghost: 'bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold px-3 py-2 rounded-xl text-xs transition disabled:opacity-50',
  danger: 'bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/40 font-bold px-3 py-2 rounded-xl text-xs transition disabled:opacity-50',
  small: 'bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold px-2.5 py-1.5 rounded-lg text-[11px] transition disabled:opacity-50'
};

// Erros do banco em português claro
export function friendlyError(err) {
  const m = String(err?.message || err || '');
  if (m.includes('SEM_ESTOQUE')) return '❌ Estoque insuficiente. ' + m.split('SEM_ESTOQUE:')[1]?.trim();
  if (m.includes('COMPRA_JA_RECEBIDA')) return 'Esta compra já foi recebida.';
  if (m.includes('COMPRA_CANCELADA')) return 'Esta compra está cancelada.';
  if (m.includes('QUANTIDADE_INVALIDA')) return 'Informe uma quantidade válida.';
  if (m.includes('PRODUTO_NAO_ENCONTRADO')) return 'Produto não encontrado.';
  if (m.includes('does not exist') || m.includes('schema cache')) return 'A área de gestão ainda não foi instalada no banco (rode o SQL de gestão no Supabase).';
  return m || 'Erro desconhecido';
}
