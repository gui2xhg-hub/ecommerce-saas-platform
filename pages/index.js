import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function StorePortal() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenant, setTenant] = useState(null);
  const [inputPassword, setInputPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // DOMÍNIO OFICIAL CORRETO DO E-COMMERCE
  const DOMAIN_URL = 'https://loja.sinergemkt.com';

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!tenantSlug) return alert('Digite a identificação (slug) da sua loja!');

    const cleanSlug = tenantSlug.toLowerCase().trim();
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', cleanSlug)
      .single();

    if (error || !data) {
      return alert('Loja não encontrada! Verifique o identificador digitado.');
    }

    if (data.admin_password && data.admin_password !== inputPassword) {
      return alert('Senha de acesso incorreta!');
    }

    setTenant(data);
    setIsAuthenticated(true);
  };

  const publicCatalogUrl = tenant ? `${DOMAIN_URL}/${tenant.slug}` : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicCatalogUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareZap = () => {
    const message = `🛍️ *Conheça nosso Catálogo Online!*\n\nAcesse e faça seu pedido direto pelo link:\n${publicCatalogUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-gray-900 p-8 rounded-3xl border border-blue-500/30 w-full max-w-sm space-y-5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-blue-500"></div>

          <div className="text-center space-y-1">
            <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-2xl flex items-center justify-center text-xl mx-auto mb-2">
              👕
            </div>
            <h1 className="text-xl font-bold text-white">Sinerge Catálogo</h1>
            <p className="text-xs text-gray-400">Portal de Vestuário & E-Commerce SaaS</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-gray-400 block mb-1">Identificador da Loja (Slug):</label>
              <input
                type="text"
                placeholder="Ex: vistatuafe"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 p-3.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-400 block mb-1">Senha de Acesso Admin:</label>
              <input
                type="password"
                placeholder="Sua senha..."
                value={inputPassword}
                onChange={(e) => setInputPassword(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 p-3.5 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 font-bold py-3.5 rounded-xl text-xs transition shadow-lg shadow-blue-600/20 text-white">
            Acessar Painel da Loja 🚀
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8 max-w-4xl mx-auto font-sans pb-16">
      
      {/* CABEÇALHO */}
      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-blue-600/20">
            👕
          </div>
          <div>
            <h1 className="font-bold text-lg text-white leading-tight">Sinerge Catálogo</h1>
            <p className="text-xs text-gray-400">Portal de Vestuário & E-Commerce SaaS</p>
          </div>
        </div>

        <button onClick={() => setIsAuthenticated(false)} className="text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 px-4 py-2 rounded-xl text-gray-400 font-bold transition">
          🚪 Sair / Trocar Loja
        </button>
      </header>

      {/* CARD DA LOJA */}
      <div className="bg-gray-900 border border-gray-800 p-5 rounded-3xl flex justify-between items-center flex-wrap gap-4 mb-8 shadow-xl">
        <div className="flex items-center space-x-4">
          <img src={tenant.logo_url || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=150&auto=format&fit=crop&q=80'} alt={tenant.name} className="w-16 h-16 rounded-2xl object-cover bg-gray-950 border border-gray-800" />
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-bold text-lg text-white">{tenant.name}</h2>
              <span className="bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">🟢 Autenticado</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Painel de controle de catálogo e pedidos de confecção.</p>
          </div>
        </div>

        <a href={`${DOMAIN_URL}/${tenant.slug}/admin`} className="bg-orange-500 hover:bg-orange-600 font-bold text-xs px-5 py-3 rounded-2xl text-white shadow-lg shadow-orange-500/20 transition">
          ⚙️ Gestão de Catálogo
        </a>
      </div>

      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">📌 O que você deseja acessar agora?</h3>

      {/* ATALHOS RÁPIDOS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <a href={`${DOMAIN_URL}/${tenant.slug}/admin`} className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 p-5 rounded-3xl space-y-3 transition block group">
          <div className="w-10 h-10 bg-gray-800 group-hover:bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center text-lg">⚙️</div>
          <div>
            <h4 className="font-bold text-sm text-white">Painel Administrativo</h4>
            <p className="text-xs text-gray-400 mt-1">Gerencie catálogo de camisas, peças, preços e categorias.</p>
          </div>
          <span className="text-xs font-bold text-blue-400 block pt-2">Acessar Admin ➔</span>
        </a>

        <a href={`${DOMAIN_URL}/${tenant.slug}/producao`} className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 p-5 rounded-3xl space-y-3 transition block group">
          <div className="w-10 h-10 bg-gray-800 group-hover:bg-purple-600/20 text-purple-400 rounded-2xl flex items-center justify-center text-lg">👕</div>
          <div>
            <h4 className="font-bold text-sm text-white">Fila de Produção</h4>
            <p className="text-xs text-gray-400 mt-1">Acompanhe encomendas recebidas, etapa de estamparia e envio.</p>
          </div>
          <span className="text-xs font-bold text-purple-400 block pt-2">Abrir Produção ➔</span>
        </a>

        <a href={publicCatalogUrl} target="_blank" rel="noreferrer" className="bg-gray-900 hover:bg-gray-800/80 border border-gray-800 p-5 rounded-3xl space-y-3 transition block group">
          <div className="w-10 h-10 bg-gray-800 group-hover:bg-green-600/20 text-green-400 rounded-2xl flex items-center justify-center text-lg">🛍️</div>
          <div>
            <h4 className="font-bold text-sm text-white">Catálogo Público</h4>
            <p className="text-xs text-gray-400 mt-1">Veja a tela onde seus clientes escolhem tamanhos, cores e encomendam.</p>
          </div>
          <span className="text-xs font-bold text-green-400 block pt-2">Visualizar Catálogo ➔</span>
        </a>
      </div>

      {/* COMPARTILHAMENTO DE LINK */}
      <div className="bg-gray-900 border border-gray-800 p-5 rounded-3xl space-y-3 shadow-xl">
        <h4 className="font-bold text-xs text-gray-300 flex items-center space-x-2">
          <span>🔗 Link da Sua Loja / Catálogo Digital</span>
        </h4>
        <p className="text-xs text-gray-400">Divulgue no Instagram ou envie direto aos clientes.</p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            readOnly
            value={publicCatalogUrl}
            className="flex-1 bg-gray-950 border border-gray-800 p-3 rounded-2xl text-xs text-orange-400 font-mono focus:outline-none"
          />

          <div className="flex space-x-2">
            <button onClick={handleCopyLink} className="bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs px-4 py-3 rounded-2xl border border-gray-700 transition">
              {copiedLink ? '✓ Copiado!' : '📋 Copiar Link'}
            </button>

            <button onClick={handleShareZap} className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-4 py-3 rounded-2xl transition flex items-center space-x-1">
              <span>💬 WhatsApp</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
