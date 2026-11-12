import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import { apiLogin, saveToken, clearToken } from '../lib/clientAuth';

// Busca os dados da loja pelo servidor (sem senhas/tokens)
const fetchPublicTenant = async (slug) => {
  try {
    const r = await fetch(`/api/public-tenant?slug=${encodeURIComponent(slug)}`);
    const j = await r.json();
    return j.tenant || null;
  } catch (e) {
    return null;
  }
};

// Remove senhas que versões antigas guardavam no aparelho
const stripSecrets = (t) => {
  if (!t) return t;
  const clean = { ...t };
  Object.keys(clean).forEach(k => {
    if (/(password|senha|token|secret|api_key|pin)$/i.test(k) || k === 'instance_id' || k === 'bot_whatsapp_instance') delete clean[k];
  });
  return clean;
};

export default function HomePortalAgendamento() {
  const router = useRouter();

  const [slugInput, setSlugInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // ESTADOS DO PIX, MODAL E MÉTRICAS
  const [showPixModal, setShowPixModal] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [stats, setStats] = useState({ appointmentsCount: 0, totalRevenue: 0 });

  // DOMÍNIO OFICIAL, PIX ESTÁTICO E WHATSAPP SUPORTE
  const DOMAIN_URL = 'https://agendamento.sinergemkt.com';
  const PIX_COPIA_COLA = "00020101021126330014br.gov.bcb.pix011107758777945520400005303986540599.995802BR5925HENRIQUE GONCALVES DE OLI6009SAO PAULO622905251M24TWWDEN5A3XEVQZMREE1D56304C896";
  const SUPPORT_WHATSAPP = "5547996302864";

  // MURAL DE NOVIDADES DO SAAS DE AGENDAMENTO (ATUALIZADO)
  const systemUpdates = [
    { id: 1, tag: 'NOVO', date: '23/09', title: '💳 Cartão Fidelidade 100% Automático', desc: 'Acúmulo automático de selos ao concluir atendimentos na agenda e sincronização instantânea com o cadastro do cliente.' },
    { id: 2, tag: 'NOVO', date: '22/09', title: '🎨 Tema Amarelo ☀️ / Dourado', desc: 'Novo preset de cores na agenda com contraste moderno e paleta harmônica.' },
    { id: 3, tag: 'NOVO', date: '20/09', title: '🔐 Extrato Financeiro Protegido por PIN', desc: 'Relatório individual de comissões e faturamento por profissional com senha de segurança.' },
    { id: 4, tag: 'MELHORIA', date: '15/09', title: '🤖 Lembretes de Amanhã no WhatsApp', desc: 'Painel rápido na agenda para envio de confirmação no WhatsApp 1 dia antes para evitar faltas.' }
  ];

  // CARREGA E RE-ATUALIZA OS DADOS DIRETO DO SUPABASE
  useEffect(() => {
    const savedTenantStr = localStorage.getItem('sinerge_authenticated_tenant');
    if (savedTenantStr) {
      try {
        const saved = stripSecrets(JSON.parse(savedTenantStr));
        setTenant(saved);
        localStorage.setItem('sinerge_authenticated_tenant', JSON.stringify(saved));
        
        if (saved && saved.slug) {
          // Busca dados mais recentes da loja e estatísticas de agendamentos no banco
          fetchPublicTenant(saved.slug).then((data) => {
            if (data) {
              setTenant(data);
              localStorage.setItem('sinerge_authenticated_tenant', JSON.stringify(data));
              fetchTenantStats(data.id);
            }
          });
        }
      } catch (e) {
        localStorage.removeItem('sinerge_authenticated_tenant');
      }
    }
  }, []);

  // BUSCA ESTATÍSTICAS DA AGENDA DO ESTABELECIMENTO
  const fetchTenantStats = async (tenantId) => {
    try {
      const { data: appointments } = await supabase
        .from('appointments')
        .select('total_price, status')
        .eq('tenant_id', tenantId)
        .neq('status', 'cancelado');

      if (appointments) {
        const count = appointments.length;
        const revenue = appointments.reduce((acc, app) => {
          const val = Number(app.total_price || 0);
          return acc + val;
        }, 0);
        setStats({ appointmentsCount: count, totalRevenue: revenue });
      }
    } catch (err) {
      console.log('Erro ao carregar estatísticas da agenda:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!slugInput || !passwordInput) return alert("Preencha o identificador (Slug) e a Senha!");

    setLoading(true);
    const cleanSlug = slugInput.toLowerCase().trim();

    // Senha conferida no servidor
    const res = await apiLogin(cleanSlug, 'admin', passwordInput);
    const data = res.ok ? await fetchPublicTenant(cleanSlug) : null;

    setLoading(false);

    if (!res.ok || !data) {
      alert(res.error && !['Senha incorreta', 'Estabelecimento não encontrado'].includes(res.error)
        ? res.error
        : "Identificador da loja ou Senha de Administrador incorretos!");
    } else {
      // Já deixa o painel admin e a agenda liberados neste aparelho
      if (res.token) saveToken(cleanSlug, res.token);
      setTenant(data);
      localStorage.setItem('sinerge_authenticated_tenant', JSON.stringify(data));
      fetchTenantStats(data.id);
    }
  };

  const handleLogout = () => {
    if (tenant?.slug) clearToken(tenant.slug);
    localStorage.removeItem('sinerge_authenticated_tenant');
    setTenant(null);
    setSlugInput('');
    setPasswordInput('');
  };

  const publicUrl = tenant ? `${DOMAIN_URL}/${tenant.slug}` : '';

  const handleCopyPublicLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPixCopiaCola = () => {
    navigator.clipboard.writeText(PIX_COPIA_COLA);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  // FORMATADOR DE MOEDA BRASILEIRA (CORRIGIDO PARA PRESERVAR R$ 0,00)
  const formatCurrency = (amount, fallback = 0) => {
    const val = Number(amount ?? fallback);
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // CÁLCULO DE VENCIMENTO DO CLIENTE
  const getDueDateInfo = (dueDateStr) => {
    if (!dueDateStr) return { diffDays: 999, isExpiring: false, isExpired: false, label: 'Mensalidade em dia' };

    const today = new Date(new Date().toISOString().split('T')[0]);
    const dueDate = new Date(dueDateStr);
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { diffDays, isExpiring: false, isExpired: true, label: '🔴 Mensalidade Vencida — Efetue o pagamento para manter o sistema ativo' };
    } else if (diffDays <= 3) {
      return { diffDays, isExpiring: true, isExpired: false, label: `⚠️ Sua mensalidade vence ${diffDays === 0 ? 'HOJE' : `em ${diffDays} dia(s)`}` };
    } else {
      return { diffDays, isExpiring: false, isExpired: false, label: `🟢 Adimplente (Vence em ${diffDays} dias - ${dueDateStr.split('-').reverse().join('/')})` };
    }
  };

  // CORES E TEMAS DINÂMICOS DO CLIENTE
  const primaryColor = tenant?.primary_color || '#A855F7';
  const buttonTextColor = tenant?.button_text_color || '#FFFFFF';
  const secondaryColor = tenant?.secondary_color || '#090D16';
  const cardBgColor = tenant?.card_bg_color || '#111827';
  const textColor = tenant?.text_color || '#FFFFFF';

  // LOGO
  const isFoodLogo = tenant?.logo_url && (tenant.logo_url.includes('photo-1550547660') || tenant.logo_url.includes('photo-1555396273'));
  const logoUrl = (tenant?.logo_url && !isFoodLogo && tenant.logo_url.trim() !== '')
    ? tenant.logo_url
    : 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=150&auto=format&fit=crop&q=80';

  const dueInfo = tenant ? getDueDateInfo(tenant.due_date) : null;
  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(PIX_COPIA_COLA)}`;

  return (
    <div 
      className="min-h-screen font-sans flex flex-col justify-between p-4 md:p-8 transition-colors duration-300"
      style={{ backgroundColor: tenant ? secondaryColor : '#090D16', color: tenant ? textColor : '#FFFFFF' }}>
      
      <Head>
        <title>Sinerge Agendamento - Gestão</title>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FF8C00" />
        <meta name="apple-mobile-web-app-title" content="Sinerge Gestão" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </Head>

      {/* CABEÇALHO */}
      <header className="max-w-5xl mx-auto w-full flex justify-between items-center py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="flex items-center space-x-3">
          <div 
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-lg shadow-lg"
            style={{ backgroundColor: tenant ? primaryColor : '#A855F7', color: tenant ? buttonTextColor : '#FFFFFF' }}>
            ✂️
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight" style={{ color: tenant ? textColor : '#FFFFFF' }}>Sinerge Agendamento</h1>
            <p className="text-[11px] opacity-75">Portal do Cliente & Gestão SaaS</p>
          </div>
        </div>

        {tenant && (
          <button
            onClick={handleLogout}
            style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)' }}
            className="text-xs text-red-400 border px-3.5 py-1.5 rounded-xl font-bold transition flex items-center space-x-1 hover:opacity-80">
            <span>🚪 Sair / Trocar Loja</span>
          </button>
        )}
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="max-w-5xl mx-auto w-full my-auto py-6 space-y-6">
        {!tenant ? (
          /* TELA DE LOGIN */
          <div className="max-w-md mx-auto bg-gray-900 border border-gray-800 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500"></div>

            <div className="text-center space-y-2 pt-2">
              <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-2xl flex items-center justify-center text-xl mx-auto">
                🔐
              </div>
              <h2 className="text-xl font-bold text-white">Acessar Meu Painel</h2>
              <p className="text-xs text-gray-400">Digite seu identificador e senha de administrador para entrar.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 text-xs">
              <div>
                <label className="text-gray-300 font-bold block mb-1">Identificador do Estabelecimento (Slug):</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: lannadesigner"
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 p-3.5 rounded-xl text-white focus:outline-none focus:border-purple-500 transition text-sm"
                />
              </div>

              <div>
                <label className="text-gray-300 font-bold block mb-1">Senha de Administrador:</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 p-3.5 rounded-xl text-white focus:outline-none focus:border-purple-500 transition text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl text-xs transition shadow-lg shadow-purple-600/20">
                {loading ? 'Acessando Sistema...' : 'Entrar na Minha Plataforma 🚀'}
              </button>
            </form>
          </div>
        ) : (
          /* PAINEL AUTENTICADO DO CLIENTE */
          <div className="space-y-6">
            
            {/* HERO BANNER & MÉTRICAS DA AGENDA */}
            <div 
              className="border rounded-3xl p-6 space-y-4 relative overflow-hidden shadow-xl"
              style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)' }}>
              
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center space-x-4">
                  <img
                    src={logoUrl}
                    alt={tenant.name}
                    className="w-16 h-16 rounded-2xl object-cover border-2 shadow-md"
                    style={{ borderColor: primaryColor, backgroundColor: secondaryColor }}
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-xl font-bold" style={{ color: textColor }}>{tenant.name}</h2>
                      <span className="bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                        🟢 Autenticado
                      </span>
                    </div>
                    <p className="text-xs opacity-75 mt-0.5">Painel de controle do seu sistema de agendamentos.</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 w-full md:w-auto">
                  <button
                    onClick={() => router.push(`/${tenant.slug}/admin`)}
                    style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                    className="font-bold px-5 py-3 rounded-xl text-xs transition shadow-lg w-full md:w-auto text-center hover:opacity-90">
                    ⚙️ Ir para Configurações
                  </button>
                </div>
              </div>

              {/* MÉTRICAS RÁPIDAS DE ATENDIMENTOS */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t text-xs" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="p-3 rounded-2xl border" style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.05)' }}>
                  <span className="opacity-60 block text-[10px]">Atendimentos Confirmados:</span>
                  <span className="text-base font-bold" style={{ color: textColor }}>{stats.appointmentsCount} agendamento(s)</span>
                </div>

                <div className="p-3 rounded-2xl border" style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.05)' }}>
                  <span className="opacity-60 block text-[10px]">Movimentação Prevista:</span>
                  <span className="text-base font-bold text-green-400">
                    {formatCurrency(stats.totalRevenue, 0)}
                  </span>
                </div>

                <div className="p-3 rounded-2xl border col-span-2 sm:col-span-1 flex justify-between items-center" style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.05)' }}>
                  <div>
                    <span className="opacity-60 block text-[10px]">Robô de WhatsApp:</span>
                    {tenant.bot_enabled
                      ? <span className="text-xs font-bold text-green-400">🟢 Ativado</span>
                      : <span className="text-xs font-bold opacity-60">⚪ Desligado</span>}
                  </div>
                  <button onClick={() => router.push(`/${tenant.slug}/admin`)} className="text-[10px] font-bold underline" style={{ color: primaryColor }}>Configurar</button>
                </div>
              </div>
            </div>

            {/* BARRA DE VENCIMENTO E MENSALIDADE PIX */}
            <div 
              className={`p-5 rounded-3xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition ${
                dueInfo.isExpired 
                  ? 'bg-red-500/10 border-red-500/50' 
                  : dueInfo.isExpiring 
                  ? 'bg-yellow-500/10 border-yellow-500/50' 
                  : 'border'
              }`}
              style={!dueInfo.isExpired && !dueInfo.isExpiring ? { backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)' } : {}}>
              
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-base">{dueInfo.isExpired ? '🔴' : dueInfo.isExpiring ? '⚠️' : '💳'}</span>
                  <h3 className="font-bold text-sm" style={{ color: textColor }}>Status da Assinatura SaaS</h3>
                </div>
                <p className="text-xs opacity-80">
                  {dueInfo.label} • Valor: <b className="text-green-400">{formatCurrency(tenant.monthly_fee, 99.99)}/mês</b>
                </p>
              </div>

              <button
                onClick={() => setShowPixModal(true)}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-lg shadow-green-600/20 flex items-center justify-center space-x-1.5 shrink-0">
                <span>⚡ Pagar Mensalidade (PIX)</span>
              </button>
            </div>

            {/* MURAL DE NOVIDADES DO SISTEMA */}
            <div 
              className="p-5 rounded-3xl border space-y-3"
              style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)' }}>
              
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-xs uppercase tracking-wider flex items-center space-x-2" style={{ color: primaryColor }}>
                  <span>📢 O que há de novo no Sinerge Agendamento?</span>
                </h3>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold">Atualizado</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {systemUpdates.map(up => (
                  <div key={up.id} className="p-3.5 rounded-2xl border space-y-1" style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center space-x-2">
                      <span className="bg-purple-500/20 text-purple-300 text-[9px] font-bold px-2 py-0.5 rounded">{up.tag}</span>
                      <span className="text-[10px] opacity-60">{up.date}</span>
                      <h4 className="font-bold text-xs truncate" style={{ color: textColor }}>{up.title}</h4>
                    </div>
                    <p className="text-[11px] opacity-75">{up.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ATALHOS DE MÓDULOS DE TRABALHO */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3 opacity-75">
                📌 O que você deseja acessar agora?
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* PAINEL ADMIN */}
                <div
                  onClick={() => router.push(`/${tenant.slug}/admin`)}
                  style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)' }}
                  className="border hover:border-opacity-50 p-5 rounded-3xl space-y-3 cursor-pointer transition group shadow-lg">
                  <div 
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg border"
                    style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.1)', color: primaryColor }}>
                    ⚙️
                  </div>
                  <div>
                    <h4 className="font-bold text-sm transition" style={{ color: textColor }}>Painel Administrativo</h4>
                    <p className="text-xs opacity-70 mt-1">Gerencie serviços, preços, equipe, comissões e regras.</p>
                  </div>
                  <span className="text-xs font-bold block pt-2" style={{ color: primaryColor }}>Acessar Admin ➔</span>
                </div>

                {/* GESTÃO DA AGENDA */}
                <div
                  onClick={() => router.push(`/${tenant.slug}/agenda`)}
                  style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)' }}
                  className="border hover:border-opacity-50 p-5 rounded-3xl space-y-3 cursor-pointer transition group shadow-lg">
                  <div 
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg border text-purple-400"
                    style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.1)' }}>
                    📅
                  </div>
                  <div>
                    <h4 className="font-bold text-sm transition" style={{ color: textColor }}>Gestão da Agenda</h4>
                    <p className="text-xs opacity-70 mt-1">Acompanhe horários agendados, feche folgas e conclua atendimentos.</p>
                  </div>
                  <span className="text-xs font-bold text-purple-400 block pt-2">Abrir Agenda ➔</span>
                </div>

                {/* PÁGINA PÚBLICA */}
                <div
                  onClick={() => window.open(publicUrl, '_blank')}
                  style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)' }}
                  className="border hover:border-opacity-50 p-5 rounded-3xl space-y-3 cursor-pointer transition group shadow-lg">
                  <div 
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg border text-blue-400"
                    style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.1)' }}>
                    🛍️
                  </div>
                  <div>
                    <h4 className="font-bold text-sm transition" style={{ color: textColor }}>Página do Cliente</h4>
                    <p className="text-xs opacity-70 mt-1">Veja a tela pública que seus clientes usam para agendar.</p>
                  </div>
                  <span className="text-xs font-bold text-blue-400 block pt-2">Visualizar Página ➔</span>
                </div>

              </div>
            </div>

            {/* BLOCO DE COMPARTILHAMENTO DO LINK */}
            <div 
              className="border rounded-3xl p-6 space-y-3 shadow-xl"
              style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)' }}>
              <div>
                <h4 className="font-bold text-sm flex items-center space-x-1" style={{ color: textColor }}>
                  <span>🔗 Link de Agendamento do Seu Estabelecimento</span>
                </h4>
                <p className="text-xs opacity-70">Divulgue no Instagram ou envie direto para seus clientes.</p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  style={{ backgroundColor: secondaryColor, color: primaryColor, borderColor: 'rgba(255,255,255,0.1)' }}
                  className="w-full border p-3 rounded-xl text-xs font-mono focus:outline-none"
                />

                <div className="flex space-x-2 w-full sm:w-auto">
                  <button
                    onClick={handleCopyPublicLink}
                    style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.2)', color: textColor }}
                    className={`px-4 py-3 rounded-xl text-xs font-bold transition whitespace-nowrap border ${
                      copied ? '!bg-green-600 !text-white' : ''
                    }`}>
                    {copied ? '✓ Copiado!' : '📋 Copiar Link'}
                  </button>

                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Acesse nosso link para agendar seu horário: ${publicUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30 px-4 py-3 rounded-xl text-xs font-bold transition whitespace-nowrap text-center">
                    💬 WhatsApp
                  </a>
                </div>
              </div>
            </div>

          </div>
        )}
      </main>

      {/* MODAL DE PAGAMENTO PIX (COM QR CODE E COPIA E COLA) */}
      {showPixModal && tenant && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 w-full max-w-md rounded-3xl p-6 border border-green-500/40 space-y-4 relative shadow-2xl text-center">
            <button 
              onClick={() => setShowPixModal(false)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-white font-bold text-sm">
              ✕
            </button>

            <div>
              <h3 className="font-bold text-base text-white">Pagamento de Mensalidade via PIX</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Favorecido: <b className="text-white">Henrique Gonçalves de Olinda</b><br />
                Valor da Mensalidade: <b className="text-green-400">{formatCurrency(tenant.monthly_fee, 99.99)}</b>
              </p>
            </div>

            {/* IMAGEM DO QR CODE EXIBIDA NA TELA */}
            <div className="bg-white p-3 rounded-2xl w-44 h-44 mx-auto flex items-center justify-center shadow-lg border-2 border-green-500">
              <img 
                src={qrCodeImageUrl} 
                alt="QR Code PIX Sinerge" 
                className="w-full h-full object-contain"
              />
            </div>
            <p className="text-[11px] text-gray-400">Abra o app do seu banco e escaneie o código acima.</p>

            {/* CAMPO PIX COPIA E COLA */}
            <div className="bg-gray-950 p-3 rounded-2xl border border-gray-800 space-y-2">
              <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider">Ou use o PIX Copia e Cola:</span>
              <input 
                type="text" 
                readOnly 
                value={PIX_COPIA_COLA} 
                className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-[10px] text-yellow-400 font-mono focus:outline-none text-center select-all"
              />
              
              <button 
                onClick={handleCopyPixCopiaCola} 
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-md shadow-green-600/20">
                {copiedPix ? '✓ PIX Copia e Cola Copiado!' : '📋 Copiar PIX Copia e Cola'}
              </button>
            </div>

            <a 
              href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
                `Olá! Realizei o pagamento da mensalidade do sistema de agendamento *${tenant.name}* (${formatCurrency(tenant.monthly_fee, 99.99)}). Segue o comprovante em anexo!`
              )}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full bg-gray-800 hover:bg-gray-700 text-green-400 border border-green-500/30 font-bold py-3 rounded-xl text-xs transition block">
              💬 Enviar Comprovante no WhatsApp
            </a>
          </div>
        </div>
      )}

      {/* RODAPÉ */}
      <footer className="max-w-5xl mx-auto w-full text-center py-4 border-t text-xs opacity-60" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        <p>© 2026 Sinerge Agendamento — Plataforma SaaS Multi-Tenant.</p>
      </footer>
    </div>
  );
}
