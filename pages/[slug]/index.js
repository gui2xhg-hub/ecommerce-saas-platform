import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function TenantVitrine() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  // FORMULÁRIO DE CHECKOUT
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [selectedNeighFee, setSelectedNeighFee] = useState(0);
  const [selectedNeighName, setSelectedNeighName] = useState('Retirada / Combinar no Local');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [copiedPix, setCopiedPix] = useState(false);

  // SELEÇÃO DE TAMANHO E QUANTIDADE NO MODAL
  const [selectedSize, setSelectedSize] = useState('M');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantData();
    }
  }, [router.isReady, slug]);

  const fetchTenantData = async () => {
    const cleanSlug = String(slug).toLowerCase().trim();

    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', cleanSlug).single();

    if (tData) {
      setTenant(tData);

      const { data: cData } = await supabase.from('categories').select('*').eq('tenant_id', tData.id).order('id', { ascending: true });
      const { data: pData } = await supabase.from('products').select('*').eq('tenant_id', tData.id).eq('active', true).order('id', { ascending: true });
      const { data: nData } = await supabase.from('neighborhoods').select('*').eq('tenant_id', tData.id).order('fee', { ascending: true });

      if (cData) setCategories(cData);
      if (pData) setProducts(pData);
      if (nData) setNeighborhoods(nData);
    }
    setLoading(false);
  };

  // APLICAR CUPOM
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    const cleanCode = couponCode.trim().toUpperCase();

    const { data: cData } = await supabase
      .from('coupons')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('code', cleanCode)
      .eq('active', true)
      .single();

    if (cData) {
      setAppliedCoupon(cData);
      alert(`Cupom "${cData.code}" aplicado com sucesso!`);
    } else {
      alert("Cupom inválido ou expirado!");
    }
  };

  // ADICIONAR AO CARRINHO
  const handleAddToCart = (product) => {
    const cartItem = {
      ...product,
      size: selectedSize,
      quantity: quantity,
      cartId: `${product.id}-${selectedSize}`
    };

    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.cartId === cartItem.cartId);
      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx].quantity += quantity;
        return updated;
      }
      return [...prev, cartItem];
    });

    setSelectedProduct(null);
    setQuantity(1);
    setSelectedSize('M');
  };

  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  // CÁLCULO DE VALORES
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  
  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discount_type === 'percent') {
      discountAmount = (subtotal * Number(appliedCoupon.discount_value)) / 100;
    } else {
      discountAmount = Number(appliedCoupon.discount_value);
    }
  }

  const deliveryFee = Number(selectedNeighFee || 0);
  const total = Math.max(0, subtotal - discountAmount) + deliveryFee;

  // FINALIZAR PEDIDO NO WHATSAPP
  const handleCheckout = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return alert("Sua sacola está vazia!");
    if (!customerName || !customerPhone) return alert("Preencha seu Nome e WhatsApp!");

    const orderPayload = {
      tenant_id: tenant.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      address: address || 'Retirada na loja',
      neighborhood: selectedNeighName,
      delivery_fee: deliveryFee,
      subtotal: subtotal,
      total: total,
      items: cart,
      status: 'recebido',
      payment_method: 'PIX / Pendente'
    };

    const { data: newOrder } = await supabase.from('orders').insert([orderPayload]).select().single();

    // FORMATAR MENSAGEM DO WHATSAPP
    let message = `👕 *NOVO PEDIDO #${newOrder ? newOrder.id : ''} - ${tenant.name}*\n\n`;
    message += `👤 *Cliente:* ${customerName}\n`;
    message += `📱 *Telefone:* ${customerPhone}\n`;
    message += `📍 *Endereço/Envio:* ${address || 'A combinar'} (${selectedNeighName})\n\n`;
    message += `📦 *PEÇAS ESCOLHIDAS:*\n`;

    cart.forEach(item => {
      message += `• *${item.quantity}x ${item.name}* (Tam: *${item.size}*) - R$ ${(Number(item.price) * item.quantity).toFixed(2)}\n`;
    });

    message += `\n💰 *Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
    if (discountAmount > 0) message += `🎟️ *Desconto (${appliedCoupon?.code}):* -R$ ${discountAmount.toFixed(2)}\n`;
    message += `📦 *Frete:* R$ ${deliveryFee.toFixed(2)}\n`;
    message += `💳 *TOTAL:* *R$ ${total.toFixed(2)}*\n\n`;
    message += `⚡ *Pagamento:* PIX (Aguardando comprovante)`;

    const cleanZap = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
    const whatsappUrl = `https://api.whatsapp.com/send?phone=55${cleanZap}&text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');
  };

  const handleCopyPix = () => {
    if (!tenant?.pix_key) return alert("Chave PIX não cadastrada nesta loja!");
    navigator.clipboard.writeText(tenant.pix_key);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(null), 3000);
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando catálogo...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-blue-500">Loja não encontrada</h1></div>;

  // IMAGENS PADRÃO DE ROUPAS/VESTUÁRIO (SÓ USADAS SE NÃO HOUVER URL NO BANCO)
  const bannerUrl = (tenant.banner_url && tenant.banner_url.trim() !== '') 
    ? tenant.banner_url 
    : 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80';

  const logoUrl = (tenant.logo_url && tenant.logo_url.trim() !== '') 
    ? tenant.logo_url 
    : 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=150&auto=format&fit=crop&q=80';

  const primaryColor = tenant.primary_color || '#3B82F6';

  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory === 'ALL' || p.category_id === Number(selectedCategory);
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans pb-24">
      
      {/* CAPA / BANNER SUPERIOR */}
      <div className="relative h-48 md:h-64 w-full bg-gray-900 overflow-hidden">
        <img src={bannerUrl} alt={tenant.name} className="w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent"></div>
      </div>

      {/* PERFIL DA LOJA */}
      <div className="max-w-3xl mx-auto px-4 -mt-16 relative z-10 space-y-4">
        <div className="flex items-end space-x-4">
          <img src={logoUrl} alt={tenant.name} className="w-24 h-24 rounded-3xl object-cover border-4 border-gray-950 bg-gray-900 shadow-2xl" />
          <div className="pb-1">
            <h1 className="font-bold text-xl md:text-2xl text-white">{tenant.name}</h1>
            <p className="text-xs text-gray-400">👕 Camisas & Vestuário Digital</p>
          </div>
        </div>

        {/* BARRA DE PESQUISA */}
        <div className="relative">
          <input 
            type="text" 
            placeholder="🔍 Buscar peça pelo nome..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 p-3.5 pl-10 rounded-2xl text-xs text-white focus:outline-none focus:border-blue-500 shadow-lg"
          />
        </div>

        {/* NAVEGAÇÃO DE COLEÇÕES */}
        <div className="flex space-x-2 overflow-x-auto pb-2 text-xs font-bold scrollbar-none">
          <button 
            onClick={() => setSelectedCategory('ALL')}
            style={selectedCategory === 'ALL' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}}
            className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition ${selectedCategory === 'ALL' ? 'shadow-md' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'}`}>
            Todas as Peças
          </button>

          {categories.map(c => (
            <button 
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              style={selectedCategory === c.id ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}}
              className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition ${selectedCategory === c.id ? 'shadow-md' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* GRADE DE PRODUTOS */}
      <main className="max-w-3xl mx-auto px-4 mt-6 grid grid-cols-2 gap-3.5">
        {filteredProducts.map(p => (
          <div 
            key={p.id} 
            onClick={() => setSelectedProduct(p)}
            className="bg-gray-900 border border-gray-800/80 rounded-3xl p-3 flex flex-col justify-between cursor-pointer hover:border-gray-700 transition shadow-lg group">
            
            <div className="space-y-2">
              <div className="w-full h-36 md:h-44 rounded-2xl bg-gray-950 overflow-hidden relative">
                <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-white line-clamp-1">{p.name}</h3>
                <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{p.description || 'Tecido premium e caimento perfeito.'}</p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 mt-2 border-t border-gray-800/60">
              <span className="font-bold text-sm text-white">R$ {Number(p.price).toFixed(2)}</span>
              <button 
                style={{ backgroundColor: primaryColor }}
                className="text-white text-[10px] font-bold px-3 py-1.5 rounded-xl shadow-md">
                Ver Peça
              </button>
            </div>
          </div>
        ))}
      </main>

      {/* BARRA FLUTUANTE DA SACOLA */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-40">
          <button 
            onClick={() => setIsCartOpen(true)}
            style={{ backgroundColor: primaryColor }}
            className="w-full py-4 px-5 rounded-2xl font-bold text-xs text-white flex justify-between items-center shadow-2xl transition transform active:scale-95">
            <span className="flex items-center space-x-2">
              <span className="bg-white/20 px-2.5 py-1 rounded-lg text-[11px]">{cart.reduce((a, b) => a + b.quantity, 0)}</span>
              <span>Ver Sacola de Compras</span>
            </span>
            <span>R$ {total.toFixed(2)} ➔</span>
          </button>
        </div>
      )}

      {/* MODAL DE SELEÇÃO DE PRODUTO */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 w-full max-w-sm rounded-3xl p-5 border border-gray-800 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="w-full h-48 rounded-2xl bg-gray-950 overflow-hidden">
              <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" />
            </div>

            <div>
              <h3 className="font-bold text-base text-white">{selectedProduct.name}</h3>
              <p className="text-xs text-gray-400 mt-1">{selectedProduct.description}</p>
              <span className="font-bold text-lg text-green-400 block mt-2">R$ {Number(selectedProduct.price).toFixed(2)}</span>
            </div>

            {/* SELETOR DE TAMANHO */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase block">Selecione o Tamanho:</label>
              <div className="grid grid-cols-5 gap-1.5">
                {['P', 'M', 'G', 'GG', 'XGG'].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    style={selectedSize === size ? { backgroundColor: primaryColor, borderColor: primaryColor } : {}}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${selectedSize === size ? 'text-white' : 'bg-gray-950 text-gray-400 border-gray-800'}`}>
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* SELETOR DE QUANTIDADE */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-xs font-bold text-gray-400">Quantidade:</span>
              <div className="flex items-center space-x-3 bg-gray-950 border border-gray-800 p-1 rounded-xl">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 rounded-lg bg-gray-900 text-white font-bold text-sm">-</button>
                <span className="text-xs font-bold w-4 text-center">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 rounded-lg bg-gray-900 text-white font-bold text-sm">+</button>
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button onClick={() => setSelectedProduct(null)} className="w-1/3 bg-gray-800 text-gray-300 font-bold py-3 rounded-xl text-xs">Cancelar</button>
              <button 
                onClick={() => handleAddToCart(selectedProduct)}
                style={{ backgroundColor: primaryColor }}
                className="w-2/3 text-white font-bold py-3 rounded-xl text-xs shadow-lg">
                Adicionar à Sacola 🛍️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CHECKOUT / SACOLA */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 w-full max-w-md rounded-3xl p-5 border border-gray-800 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-sm text-white">🛍️ Sua Sacola de Compras</h3>
              <button onClick={() => setIsCartOpen(false)} className="text-xs text-gray-400 font-bold">✕ Fechar</button>
            </div>

            {/* ITENS NO CARRINHO */}
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {cart.map(item => (
                <div key={item.cartId} className="flex justify-between items-center bg-gray-950 p-3 rounded-xl text-xs border border-gray-800">
                  <div>
                    <span className="font-bold text-white block">{item.quantity}x {item.name}</span>
                    <span className="text-[10px] text-blue-400 font-bold">Tam: {item.size}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white">R$ {(Number(item.price) * item.quantity).toFixed(2)}</span>
                    <button onClick={() => removeFromCart(item.cartId)} className="text-red-400 font-bold p-1">🗑</button>
                  </div>
                </div>
              ))}
            </div>

            {/* CUPOM DE DESCONTO */}
            <div className="flex space-x-2">
              <input 
                type="text" 
                placeholder="Possui Cupom? (Ex: PROMO10)" 
                value={couponCode} 
                onChange={(e) => setCouponCode(e.target.value)}
                className="flex-1 bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-xs text-white uppercase focus:outline-none" 
              />
              <button onClick={handleApplyCoupon} className="bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2.5 rounded-xl font-bold text-xs border border-gray-700">Aplicar</button>
            </div>

            {/* COPIAR PIX MANUAL */}
            {tenant.pix_key && (
              <div className="bg-gray-950 p-3 rounded-2xl border border-green-500/30 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-green-400">🔑 Pagamento via PIX:</span>
                  <button onClick={handleCopyPix} className="bg-green-600/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-lg font-bold text-[10px]">
                    {copiedPix ? '✓ Copiado!' : '📋 Copiar Chave PIX'}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 font-mono break-all bg-gray-900 p-2 rounded-xl">{tenant.pix_key}</p>
              </div>
            )}

            {/* FORMULÁRIO DE ENTREGA */}
            <form onSubmit={handleCheckout} className="space-y-3 pt-2 border-t border-gray-800">
              <input type="text" placeholder="Seu Nome Completo" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" required />
              <input type="text" placeholder="Seu WhatsApp (DDD + Número)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" required />
              <input type="text" placeholder="Endereço Completo de Entrega" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" />

              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-1">Opção de Envio / Frete:</label>
                <select 
                  onChange={(e) => {
                    const selected = neighborhoods.find(n => n.id === Number(e.target.value));
                    if (selected) {
                      setSelectedNeighFee(selected.fee);
                      setSelectedNeighName(selected.name);
                    } else {
                      setSelectedNeighFee(0);
                      setSelectedNeighName('Retirada / Combinar no Local');
                    }
                  }}
                  className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none">
                  <option value="">Retirada / Combinar no Local (R$ 0,00)</option>
                  {neighborhoods.map(n => (
                    <option key={n.id} value={n.id}>{n.name} — R$ {Number(n.fee).toFixed(2)}</option>
                  ))}
                </select>
              </div>

              {/* RESUMO FINANCEIRO */}
              <div className="bg-gray-950 p-3 rounded-2xl space-y-1 text-xs border border-gray-800">
                <div className="flex justify-between text-gray-400"><span>Subtotal:</span><span>R$ {subtotal.toFixed(2)}</span></div>
                {discountAmount > 0 && <div className="flex justify-between text-green-400"><span>Desconto:</span><span>-R$ {discountAmount.toFixed(2)}</span></div>}
                <div className="flex justify-between text-gray-400"><span>Frete:</span><span>R$ {deliveryFee.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-sm text-white pt-1 border-t border-gray-800"><span>TOTAL:</span><span className="text-green-400">R$ {total.toFixed(2)}</span></div>
              </div>

              <button 
                type="submit" 
                style={{ backgroundColor: primaryColor }}
                className="w-full text-white font-bold py-3.5 rounded-xl text-xs shadow-lg transition transform active:scale-95">
                Enviar Pedido no WhatsApp 🚀
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
