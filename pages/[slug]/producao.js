import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function FilaProducao() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (router.isReady && slug) {
      fetchData();

      // INSCRIÇÃO NO SUPABASE REALTIME (ATUALIZAÇÃO EM TEMPO REAL QUANDO O PIX/CARTÃO É PAGO)
      const channel = supabase
        .channel('realtime_orders_queue')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          () => {
            fetchData();
          }
        )
        .subscribe();

      const interval = setInterval(fetchData, 10000);

      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    }
  }, [router.isReady, slug]);

  const fetchData = async () => {
    try {
      const cleanSlug = String(slug).trim();

      const { data: tData, error: tError } = await supabase
        .from('tenants')
        .select('*')
        .ilike('slug', cleanSlug)
        .maybeSingle();

      if (tError) {
        setErrorMessage("Erro ao buscar dados da loja: " + tError.message);
        setLoading(false);
        return;
      }

      if (tData) {
        setTenant(tData);

        const { data: oData, error: oError } = await supabase
          .from('orders')
          .select('*')
          .eq('tenant_id', tData.id)
          .order('id', { ascending: false });

        if (oError) {
          setErrorMessage("Erro ao buscar pedidos no Supabase: " + oError.message);
        } else if (oData) {
          setOrders(oData);
          setErrorMessage('');
        }
      } else {
        setErrorMessage(`Loja com o slug "${cleanSlug}" não foi encontrada no banco de dados.`);
      }
    } catch (err) {
      setErrorMessage("Erro inesperado: " + err.message);
    } font-sans finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    if (error) alert("Erro ao atualizar status: " + error.message);
    fetchData();
  };

  // VERIFICA SE O PEDIDO FOI PAGO (VIA BANCO DE DADOS OU TEXTO ANTIGO)
  const isOrderPaid = (order) => {
    return Boolean(order.is_paid) || Boolean(order.payment_method?.includes('PAGO'));
  };

  // ALTERAR MANUALMENTE O STATUS DE PAGAMENTO
  const togglePaymentStatus = async (order) => {
    const currentPaidStatus = isOrderPaid(order);
    const { error } = await supabase
      .from('orders')
      .update({ is_paid: !currentPaidStatus })
      .eq('id', order.id);

    if (error) alert("Erro ao alterar pagamento: " + error.message);
    fetchData();
  };

  const handleDeleteOrder = async (orderId) => {
    if (confirm(`Tem certeza que deseja excluir permanentemente o Pedido #${orderId}?`)) {
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) alert("Erro ao excluir pedido: " + error.message);
      fetchData();
    }
  };

  const handlePrintOrder = (order) => {
    const printWindow = window.open('', '_blank', 'width=600,height=700');
    const itemsList = Array.isArray(order.items) ? order.items : [];
    const isPickup = order.address === 'Retirada na Loja' || order.neighborhood === 'Retirar na Loja';
    const paidText = isOrderPaid(order) ? 'PAGO 🟢' : 'PENDENTE 🔴';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pedido #${order.id} - ${tenant?.name || 'Loja'}</title>
        <style>
          body { font-family: monospace; padding: 20px; width: 300px; margin: 0 auto; color: #000; }
          .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
          .title { font-size: 16px; font-weight: bold; }
          .subtitle { font-size: 12px; }
          .shipping-badge { background: #000; color: #fff; padding: 4px; text-align: center; font-weight: bold; margin-top: 5px; font-size: 12px; }
          .section { border-bottom: 1px dashed #000; padding: 8px 0; font-size: 12px; }
          .item { margin-bottom: 8px; }
          .total { font-size: 14px; font-weight: bold; text-align: right; margin-top: 10px; }
          .footer { text-align: center; margin-top: 20px; font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${tenant?.name || 'E-COMMERCE'}</div>
          <div class="subtitle">ETIQUETA DE ENVIO / SEPARAÇÃO</div>
          <div class="title" style="margin-top:5px;">PEDIDO #${order.id}</div>
          <div class="shipping-badge">${isPickup ? '🏪 RETIRADA NA LOJA' : '🛵 ENTREGA EM CASA'}</div>
        </div>

        <div class="section">
          <b>CLIENTE:</b> ${order.customer_name || 'N/A'}<br/>
          <b>TEL:</b> ${order.customer_phone || 'N/A'}<br/>
          <b>ENDEREÇO:</b> ${order.address || 'N/A'}<br/>
          <b>TIPO DE ENVIO:</b> ${order.neighborhood || (isPickup ? 'Retirada' : 'Entrega')}<br/>
          <b>PAGAMENTO:</b> ${order.payment_method || 'PIX'} (${paidText})
        </div>

        <div class="section">
          <b>ITENS DA ENCOMENDA:</b><br/><br/>
          ${itemsList.map(it => `
            <div class="item">
              <b>${it.quantity}x ${it.name}</b><br/>
              ${it.variationsText ? `&nbsp;&nbsp;• Opt: <b>${it.variationsText}</b><br/>` : (it.size ? `&nbsp;&nbsp;• Tam: <b>${it.size}</b><br/>` : '')}
              ${it.note ? `&nbsp;&nbsp;• Obs: <i>"${it.note}"</i><br/>` : ''}
              &nbsp;&nbsp;• Valor: R$ ${(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}
            </div>
          `).join('')}
        </div>

        <div class="section">
          Subtotal: R$ ${Number(order.subtotal || 0).toFixed(2)}<br/>
          Frete/Taxa: ${Number(order.delivery_fee) === 0 ? '<b>GRÁTIS</b>' : `R$ ${Number(order.delivery_fee || 0).toFixed(2)}`}<br/>
          <div class="total">TOTAL: R$ ${Number(order.total || 0).toFixed(2)}</div>
        </div>

        <div class="footer">
          Impresso em ${new Date().toLocaleString('pt-BR')}<br/>
          Obrigado pela preferência!
        </div>

        <script>
          window.onload = function() { window.print(); window.close(); };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando Fila de Produção...</p></div>;

  const novos = orders.filter(o => o.status === 'recebido' || !o.status);
  const emProducao = orders.filter(o => o.status === 'em_producao' || o.status === 'preparando');
  const concluidos = orders.filter(o => o.status === 'pronto' || o.status === 'concluido' || o.status === 'entregue');

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 font-sans pb-16">
      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-6 max-w-7xl mx-auto">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center font-bold text-xl text-white">🛍️</div>
          <div>
            <h1 className="font-bold text-lg text-white">Fila de Produção — {tenant?.name || slug}</h1>
            <p className="text-xs text-gray-400">Gerencie pedidos, pagamentos automáticos e envios em tempo real</p>
          </div>
        </div>
        <button onClick={fetchData} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
          🔄 Recarregar
        </button>
      </header>

      {errorMessage && (
        <div className="max-w-7xl mx-auto mb-6 bg-red-500/20 border border-red-500/40 p-4 rounded-2xl text-xs text-red-300 font-bold flex justify-between items-center">
          <span>⚠️ {errorMessage}</span>
          <button onClick={fetchData} className="underline text-white ml-4">Tentar novamente</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto">
        
        {/* COLUNA 1: NOVAS ENCOMENDAS */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-4 space-y-3">
          <h2 className="font-bold text-xs text-yellow-400 uppercase tracking-wider flex justify-between items-center border-b border-gray-800 pb-2">
            <span>🟡 1. Novas Encomendas ({novos.length})</span>
          </h2>

          {novos.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">Nenhum pedido novo no momento.</p>
          ) : (
            novos.map(o => {
              const isPickup = o.address === 'Retirada na Loja' || o.neighborhood === 'Retirar na Loja';
              const isFreeShipping = Number(o.delivery_fee) === 0 && !isPickup;
              const paid = isOrderPaid(o);

              return (
                <div key={o.id} className="bg-gray-950 p-4 rounded-2xl border border-gray-800 space-y-3 shadow-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-sm text-white">PEDIDO #{o.id}</h3>
                      <p className="text-xs text-gray-300 font-bold mt-0.5">{o.customer_name}</p>
                      <p className="text-[11px] text-gray-400">📱 {o.customer_phone}</p>
                    </div>

                    <div className="flex flex-col items-end space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-900 px-2 py-0.5 rounded-md border border-gray-800">
                        {o.payment_method || 'PIX'}
                      </span>
                      <button 
                        onClick={() => togglePaymentStatus(o)} 
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border transition ${
                          paid ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}>
                        {paid ? '🟢 PAGO' : '🔴 PENDENTE'}
                      </button>
                    </div>
                  </div>

                  {/* BLOCO DE INFORMAÇÕES DE FRETE E ENVIO */}
                  <div className="bg-gray-900 p-2.5 rounded-xl border border-gray-800/80 text-xs space-y-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isPickup ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                        {isPickup ? '🏪 RETIRADA NA LOJA' : '🛵 ENTREGA EM CASA'}
                      </span>
                      <span className="text-[10px] font-bold text-orange-400">
                        {isPickup ? 'Frete R$ 0,00' : (isFreeShipping ? '🎁 FRETE GRÁTIS' : `Frete R$ ${Number(o.delivery_fee || 0).toFixed(2)}`)}
                      </span>
                    </div>
                    <p className="text-gray-400 text-[11px]"><b>Endereço:</b> {o.address}</p>
                  </div>

                  <div className="space-y-1.5 border-t border-gray-800 pt-2 text-xs">
                    {Array.isArray(o.items) && o.items.map((it, idx) => (
                      <div key={idx} className="bg-gray-900/60 p-2 rounded-lg border border-gray-800/50">
                        <div className="flex justify-between text-gray-200">
                          <span><b>{it.quantity}x</b> {it.name}</span>
                          <span className="font-bold">R$ {(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}</span>
                        </div>
                        {(it.variationsText || it.size) && (
                          <p className="text-[10px] text-orange-400 font-semibold mt-0.5">
                            Opt: {it.variationsText || it.size}
                          </p>
                        )}
                        {it.note && (
                          <p className="text-[10px] text-gray-400 italic">Obs: "{it.note}"</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-gray-800 text-xs">
                    <span className="font-bold text-green-400">TOTAL: R$ {Number(o.total || 0).toFixed(2)}</span>
                    <div className="flex space-x-1.5">
                      <button onClick={() => handlePrintOrder(o)} className="bg-gray-800 hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded-lg font-bold text-[11px] border border-gray-700">
                        🖨️
                      </button>
                      <button onClick={() => handleDeleteOrder(o.id)} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2.5 py-1 rounded-lg font-bold text-[11px] border border-red-500/30">
                        🗑️
                      </button>
                    </div>
                  </div>

                  <button onClick={() => updateOrderStatus(o.id, 'em_producao')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs transition">
                    🚀 Iniciar Produção / Separação ➔
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* COLUNA 2: EM PRODUÇÃO */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-4 space-y-3">
          <h2 className="font-bold text-xs text-blue-400 uppercase tracking-wider flex justify-between items-center border-b border-gray-800 pb-2">
            <span>⚙️ 2. Em Produção / Separação ({emProducao.length})</span>
          </h2>

          {emProducao.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">Nenhum pedido em produção.</p>
          ) : (
            emProducao.map(o => {
              const paid = isOrderPaid(o);
              return (
                <div key={o.id} className="bg-gray-950 p-4 rounded-2xl border border-blue-500/30 space-y-3 shadow-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-sm text-white">PEDIDO #{o.id}</h3>
                      <p className="text-xs text-gray-300 font-bold mt-0.5">{o.customer_name}</p>
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-900 px-2 py-0.5 rounded-md border border-gray-800">
                        {o.payment_method || 'PIX'}
                      </span>
                      <button 
                        onClick={() => togglePaymentStatus(o)} 
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border transition ${
                          paid ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}>
                        {paid ? '🟢 PAGO' : '🔴 PENDENTE'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1 border-t border-gray-800 pt-2 text-xs">
                    {Array.isArray(o.items) && o.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-gray-200">
                        <span><b>{it.quantity}x</b> {it.name} {it.variationsText ? `(${it.variationsText})` : (it.size ? `(${it.size})` : '')}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-gray-800 text-xs">
                    <span className="font-bold text-green-400">R$ {Number(o.total || 0).toFixed(2)}</span>
                    <div className="flex space-x-1.5">
                      <button onClick={() => handlePrintOrder(o)} className="bg-gray-800 hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded-lg font-bold text-[11px] border border-gray-700">
                        🖨️
                      </button>
                      <button onClick={() => handleDeleteOrder(o.id)} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2.5 py-1 rounded-lg font-bold text-[11px] border border-red-500/30">
                        🗑️
                      </button>
                    </div>
                  </div>

                  <button onClick={() => updateOrderStatus(o.id, 'pronto')} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl text-xs transition">
                    📦 Marcar como Pronto / Enviado ➔
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* COLUNA 3: PRONTOS / ENVIADOS */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-4 space-y-3">
          <h2 className="font-bold text-xs text-green-400 uppercase tracking-wider flex justify-between items-center border-b border-gray-800 pb-2">
            <span>📦 3. Prontos / Enviados ({concluidos.length})</span>
          </h2>

          {concluidos.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">Nenhum pedido concluído.</p>
          ) : (
            concluidos.map(o => (
              <div key={o.id} className="bg-gray-950 p-4 rounded-2xl border border-gray-800 space-y-2 opacity-80">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-sm text-white">PEDIDO #{o.id}</h3>
                    <p className="text-xs text-gray-300">{o.customer_name}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-xl bg-green-500/20 text-green-400 border border-green-500/30">
                    ✓ ENVIADO
                  </span>
                </div>
                <div className="flex space-x-2 pt-2">
                  <button onClick={() => handlePrintOrder(o)} className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-300 py-1.5 rounded-xl font-bold text-[11px] border border-gray-800">
                    🖨️ Etiqueta
                  </button>
                  <button onClick={() => handleDeleteOrder(o.id)} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-xl font-bold text-[11px] border border-red-500/30">
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
