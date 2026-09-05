import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function ProducaoTenant() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug) {
      fetchTenantAndOrders();
      const interval = setInterval(() => {
        if (tenant?.id) fetchOrders(tenant.id);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [slug, tenant?.id]);

  const fetchTenantAndOrders = async () => {
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', slug).single();
    if (tData) {
      setTenant(tData);
      fetchOrders(tData.id);
    }
    setLoading(false);
  };

  const fetchOrders = async (tenantId) => {
    const { data: oData } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (oData) setOrders(oData);
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    if (tenant) fetchOrders(tenant.id);
  };

  const sendWhatsAppStatus = (order, msgType) => {
    const cleanPhone = order.customer_phone.replace(/\D/g, '');
    let msg = '';

    if (msgType === 'producao') {
      msg = `Olá ${order.customer_name}! 👕 Seu pedido #${order.id} no *${tenant.name}* entrou na fila de estamparia/confecção!`;
    } else if (msgType === 'enviado') {
      msg = `Olá ${order.customer_name}! 📦 Seu pedido #${order.id} no *${tenant.name}* foi produzido e enviado nos Correios/Transportadora!`;
    }

    window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  if (loading) return <div className="p-4 text-white text-center font-sans">Carregando Fila de Produção...</div>;
  if (!tenant) return <div className="p-4 text-white text-center font-sans">Loja não encontrada.</div>;

  const activeOrders = orders.filter(o => !o.archived);
  const recebidosOrders = activeOrders.filter(o => !o.status || o.status === 'recebido');
  const producaoOrders = activeOrders.filter(o => o.status === 'em_producao');
  const enviadosOrders = activeOrders.filter(o => o.status === 'saiu_entrega' || o.status === 'enviado');

  const renderOrderCard = (order) => (
    <div key={order.id} className="bg-gray-900 border border-gray-800 p-4 rounded-2xl space-y-3 shadow-lg">
      <div className="flex justify-between items-start border-b border-gray-800 pb-2">
        <div>
          <span className="font-bold text-xs text-orange-400">PEDIDO #{order.id}</span>
          <h3 className="font-bold text-xs text-white">{order.customer_name}</h3>
          <p className="text-[11px] text-gray-400">📱 {order.customer_phone}</p>
        </div>
      </div>

      <div className="text-[11px] text-gray-300 bg-gray-950 p-2.5 rounded-xl border border-gray-800/80 space-y-1">
        <p><b>Endereço:</b> {order.address}</p>
        <p><b>Envio/Bairro:</b> {order.neighborhood}</p>
      </div>

      {/* DETALHES DE CADA CAMISA / TAMANHO / ESTAMPA */}
      <div className="space-y-1.5 border-t border-b border-gray-800 py-2">
        {order.items && Array.isArray(order.items) && order.items.map((it, idx) => (
          <div key={idx} className="text-[11px] bg-gray-800/40 p-2 rounded-xl">
            <p className="font-bold text-white">{it.quantity}x {it.name}</p>
            <p className="text-[10px] text-gray-300">Tamanho: <b>{it.size}</b> | Cor: <b>{it.color}</b></p>
            {it.customText && <p className="text-[10px] text-orange-300 font-bold mt-0.5">🎨 Estampa: "{it.customText}"</p>}
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center text-xs font-bold">
        <span>TOTAL:</span>
        <span className="text-green-400">R$ {Number(order.total || 0).toFixed(2)}</span>
      </div>

      {/* BOTÕES DE NAVEGAÇÃO DA PRODUÇÃO */}
      <div className="pt-1">
        {(!order.status || order.status === 'recebido') && (
          <button onClick={() => { updateOrderStatus(order.id, 'em_producao'); sendWhatsAppStatus(order, 'producao'); }} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-xl text-xs font-bold text-white">
            👕 Iniciar Estamparia / Confecção ➔
          </button>
        )}

        {order.status === 'em_producao' && (
          <button onClick={() => { updateOrderStatus(order.id, 'enviado'); sendWhatsAppStatus(order, 'enviado'); }} className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-xl text-xs font-bold text-white">
            📦 Marcar como Enviado ➔
          </button>
        )}

        {(order.status === 'saiu_entrega' || order.status === 'enviado') && (
          <button onClick={() => updateOrderStatus(order.id, 'concluido')} className="w-full bg-green-600 hover:bg-green-700 py-2 rounded-xl text-xs font-bold text-white">
            ✅ Concluir Pedido
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 font-sans max-w-7xl mx-auto pb-12">
      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-6">
        <div>
          <h1 className="font-bold text-xl text-orange-500">👕 Fila de Produção — {tenant.name}</h1>
          <p className="text-xs text-gray-400">Acompanhe a estamparia e envio de encomendas dos clientes.</p>
        </div>
        <button onClick={() => fetchOrders(tenant.id)} className="bg-orange-500 hover:bg-orange-600 px-3 py-2 rounded-xl text-xs font-bold transition">
          🔄 Recarregar
        </button>
      </header>

      {/* KANBAN EM 3 COLUNAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900/60 p-3 rounded-2xl border border-yellow-500/30 space-y-3">
          <h2 className="font-bold text-xs text-yellow-400 uppercase tracking-wider border-b border-yellow-500/30 pb-2">🟡 1. PEDIDOS NOVOS ({recebidosOrders.length})</h2>
          <div className="space-y-3">{recebidosOrders.map(o => renderOrderCard(o))}</div>
        </div>

        <div className="bg-gray-900/60 p-3 rounded-2xl border border-blue-500/30 space-y-3">
          <h2 className="font-bold text-xs text-blue-400 uppercase tracking-wider border-b border-blue-500/30 pb-2">👕 2. EM ESTAMPARIA / CORTE ({producaoOrders.length})</h2>
          <div className="space-y-3">{producaoOrders.map(o => renderOrderCard(o))}</div>
        </div>

        <div className="bg-gray-900/60 p-3 rounded-2xl border border-purple-500/30 space-y-3">
          <h2 className="font-bold text-xs text-purple-400 uppercase tracking-wider border-b border-purple-500/30 pb-2">📦 3. PRONTOS / ENVIADOS ({enviadosOrders.length})</h2>
          <div className="space-y-3">{enviadosOrders.map(o => renderOrderCard(o))}</div>
        </div>
      </div>
    </div>
  );
}
