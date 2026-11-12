import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabase';
import { formatBRL, formatDateBR, num, rentalStage } from '../../../lib/rental';

export default function AcompanharPedido() {
  const router = useRouter();
  const { slug, id } = router.query;

  const [tenant, setTenant] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (router.isReady && slug && id) {
      fetchOrderData();

      // Atualização em Tempo Real (se o lojista mudar o status no painel, o cliente vê na hora)
      const channel = supabase
        .channel(`order_status_${id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
          (payload) => {
            setOrder(payload.new);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [router.isReady, slug, id]);

  const fetchOrderData = async () => {
    setLoading(true);

    const { data: tData } = await supabase
      .from('tenants')
      .select('*')
      .ilike('slug', String(slug).trim())
      .maybeSingle();

    if (tData) {
      setTenant(tData);

      const { data: oData } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tData.id)
        .eq('id', Number(id))
        .maybeSingle();

      if (oData) setOrder(oData);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans">
        <p className="text-xs text-gray-400">Carregando status do pedido...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-4 font-sans space-y-3">
        <span className="text-4xl">🔍</span>
        <h1 className="text-base font-bold text-orange-400">Pedido não encontrado</h1>
        <p className="text-xs text-gray-400 text-center">Verifique se o link informado está correto.</p>
      </div>
    );
  }

  // Estágios do pedido para a Linha do Tempo
  const isPickup = order.address === 'Retirada na Loja' || order.neighborhood === 'Retirar na Loja';

  const isRental = order.order_type === 'aluguel';
  const stage = isRental ? rentalStage(order) : null;

  const rentalSteps = [
    { key: 'reservado', label: 'Reserva Recebida', icon: '📝' },
    { key: 'confirmado', label: 'Reserva Confirmada pela Loja', icon: '✅' },
    { key: 'entregue', label: isPickup ? 'Itens Retirados / Em uso' : 'Itens Entregues / Em uso', icon: '📦' },
    { key: 'devolvido', label: 'Itens Devolvidos', icon: '↩️' }
  ];
  const rentalStepIndex = { reservado: 0, confirmado: 1, em_uso: 2, atrasado: 2, entregue: 2, devolvido: 3 };

  const saleSteps = [
    { key: 'recebido', label: 'Pedido Recebido', icon: '📝' },
    { key: 'em_producao', label: 'Em Separação / Preparo', icon: '⚙️' },
    { key: 'pronto', label: isPickup ? 'Pronto para Retirada' : 'Saiu para Entrega', icon: isPickup ? '🏪' : '🛵' },
    { key: 'entregue', label: 'Entregue / Concluído', icon: '✅' }
  ];
  const steps = isRental ? rentalSteps : saleSteps;

  const getStepIndex = (status) => {
    switch (status) {
      case 'recebido': return 0;
      case 'em_producao':
      case 'preparando': return 1;
      case 'pronto':
      case 'concluido': return 2;
      case 'entregue':
      case 'arquivado': return 3;
      default: return 0;
    }
  };

  const currentStep = isRental ? (rentalStepIndex[stage] ?? 0) : getStepIndex(order.status);
  const isPaid = order.is_paid || order.payment_method?.includes('PAGO');
  const downPaid = isRental && !order.is_paid && String(order.payment_method || '').toLowerCase().includes('sinal pago');

  const cardColor = tenant?.card_color || '#111827';
  const primaryColor = tenant?.primary_color || '#FF8C00';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 font-sans max-w-md mx-auto space-y-4">
      
      {/* CABEÇALHO */}
      <div style={{ backgroundColor: cardColor }} className="p-4 rounded-2xl border border-white/10 flex justify-between items-center">
        <div>
          <span className="text-[10px] text-gray-400 block font-bold">{isRental ? 'Acompanhamento da Locação' : 'Acompanhamento de Encomenda'}</span>
          <h1 className="text-base font-extrabold text-white">{isRental ? 'Reserva' : 'Pedido'} #{order.id}</h1>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border ${
          isPaid ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
        }`}>
          {isPaid ? '🟢 PAGAMENTO CONFIRMADO' : downPaid ? '🟣 SINAL PAGO' : '🟡 PAGAMENTO PENDENTE'}
        </span>
      </div>

      {/* DADOS DA LOCAÇÃO */}
      {isRental && (
        <div style={{ backgroundColor: cardColor }} className="p-4 rounded-2xl border border-purple-500/30 text-xs space-y-2">
          {stage === 'cancelado' && <p className="text-red-400 font-bold">⚫ Esta reserva foi cancelada.</p>}
          {stage === 'atrasado' && <p className="text-red-400 font-bold">🔴 A devolução está atrasada. Fale com a loja.</p>}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
              <span className="text-[10px] text-gray-400 block">{isPickup ? 'Retirada' : 'Entrega'}</span>
              <b className="text-blue-300">{formatDateBR(order.rental_start)}{order.delivery_time ? ` • ${order.delivery_time}` : ''}</b>
            </div>
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
              <span className="text-[10px] text-gray-400 block">Devolução</span>
              <b className="text-green-300">{formatDateBR(order.rental_end)}{order.return_time ? ` • ${order.return_time}` : ''}</b>
            </div>
          </div>
          {order.rental_days ? <p className="text-gray-300">⏱️ Período: <b>{order.rental_days} dia(s)</b></p> : null}
          {num(order.down_payment_value) > 0 && num(order.down_payment_value) < num(order.total) && (
            <p className="text-purple-300">💳 Sinal para reservar: <b>{formatBRL(order.down_payment_value)}</b> • restante: <b>{formatBRL(num(order.total) - num(order.down_payment_value))}</b></p>
          )}
          {num(order.deposit_value) > 0 && <p className="text-orange-300">🔒 Caução: <b>{formatBRL(order.deposit_value)}</b>{order.deposit_status ? ` (${order.deposit_status})` : ''}</p>}
          {order.price_table_name && <p className="text-green-300">🏢 Tabela de preço: <b>{order.price_table_name}</b></p>}
          {num(order.damage_value) > 0 && <p className="text-red-300">⚠️ Valor por dano/falta: <b>{formatBRL(order.damage_value)}</b>{order.damage_notes ? ` — ${order.damage_notes}` : ''}</p>}
        </div>
      )}

      {/* LINHA DO TEMPO EM TEMPO REAL */}
      <div style={{ backgroundColor: cardColor }} className="p-5 rounded-2xl border border-white/10 space-y-4">
        <h2 className="text-xs font-bold text-gray-300 uppercase tracking-wider">{isRental ? 'Status da Locação' : 'Status do Pedido'}</h2>
        
        <div className="space-y-4 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-gray-800">
          {steps.map((step, idx) => {
            const isCompleted = currentStep >= idx;
            const isCurrent = currentStep === idx;

            return (
              <div key={step.key} className="flex items-center space-x-3 relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border transition ${
                  isCompleted 
                    ? 'bg-green-500 border-green-400 text-black shadow-lg shadow-green-500/20' 
                    : 'bg-gray-900 border-gray-800 text-gray-500'
                }`}>
                  {step.icon}
                </div>
                <div>
                  <p className={`text-xs font-bold ${isCurrent ? 'text-green-400' : (isCompleted ? 'text-white' : 'text-gray-500')}`}>
                    {step.label}
                  </p>
                  {isCurrent && (
                    <span className="text-[10px] text-yellow-400 font-medium animate-pulse">{isRental ? 'Status atual da sua reserva' : 'Status atual do seu pacote'}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RESUMO DOS ITENS */}
      <div style={{ backgroundColor: cardColor }} className="p-4 rounded-2xl border border-white/10 space-y-3">
        <h2 className="text-xs font-bold text-gray-300 uppercase tracking-wider">{isRental ? 'Itens Alugados' : 'Itens da Compra'}</h2>
        <div className="space-y-2">
          {Array.isArray(order.items) && order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
              <div>
                <span className="font-bold text-white block">{item.quantity}x {item.name}</span>
                {item.variationsText && <span className="text-[10px] text-orange-400 block">{item.variationsText}</span>}
                {item.price_label && <span className="text-[10px] text-gray-500 block">{item.price_label}</span>}
              </div>
              <span className="font-bold text-gray-300">R$ {(Number(item.price) * Number(item.quantity)).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="pt-2 text-xs space-y-1">
          <div className="flex justify-between text-gray-400">
            <span>Frete / Envio:</span>
            <span>{Number(order.delivery_fee) === 0 ? 'GRÁTIS' : `R$ ${Number(order.delivery_fee).toFixed(2)}`}</span>
          </div>
          <div className="flex justify-between font-bold text-sm text-white pt-1 border-t border-white/10">
            <span>Total:</span>
            <span style={{ color: primaryColor }}>R$ {Number(order.total).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* DETALHES DA ENTREGA */}
      <div style={{ backgroundColor: cardColor }} className="p-4 rounded-2xl border border-white/10 text-xs space-y-1">
        <h2 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Destino de Envio</h2>
        <p className="text-gray-300"><b>Cliente:</b> {order.customer_name}</p>
        <p className="text-gray-400"><b>Tipo:</b> {order.neighborhood}</p>
        <p className="text-gray-400"><b>Endereço:</b> {order.address}</p>
      </div>

      {/* BOTÃO DE DÚVIDAS VIA WHATSAPP */}
      {tenant?.whatsapp && (
        <a
          href={`https://wa.me/${tenant.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Gostaria de informações sobre o meu pedido #${order.id}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3.5 rounded-2xl text-xs transition flex items-center justify-center space-x-2 shadow-lg">
          <span>💬 Precisa de ajuda com o Pedido? Fale Conosco</span>
        </a>
      )}
    </div>
  );
}
