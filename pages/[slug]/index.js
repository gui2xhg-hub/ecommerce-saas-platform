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

  // SELEÇÃO DE TAMANHO E QUANTIDADE
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

  // CHECKOUT WHATSAPP
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
    setTimeout(() => setCopiedPix(false), 3000);
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando catálogo...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-blue-500">Loja não encontrada</h1></div>;

  // 🎨 CONFIGURAÇÃO DAS CORES DINÂMICAS DO TEMA DO CLIENTE
  const primaryColor = tenant.primary_color || '#3B82F6';
  const buttonTextColor = tenant.button_text_color || '#FFFFFF';
  const secondaryColor = tenant.secondary_color || '#090D16'; // Fundo da página
  const cardBgColor = tenant.card_bg_color || '#111827';       // Fundo dos cards e modais
  const textColor = tenant.text_color || '#FFFFFF';             // Cor da fonte geral

  // LOGO E BANNER DO BANCO
  const bannerUrl = (tenant.banner_url && tenant.banner_url.trim() !== '') 
    ? tenant.banner_url 
    : 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80';

  const logoUrl = (tenant.logo_url && tenant.logo_url.trim() !== '') 
    ? tenant.logo_url 
    : 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=150&auto=format&fit=crop&q=80';

  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory === 'ALL' || p.category_id === Number(selectedCategory);
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen font-sans pb-24 transition-colors duration-300" style={{ backgroundColor: secondaryColor, color: textColor }}>
      
      {/* CAPA / BANNER SUPERIOR */}
      <div className="relative h-48 md:h-64 w-full overflow-hidden" style={{ backgroundColor: cardBgColor }}>
        <img src={bannerUrl} alt={tenant.name} className="w-full h-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
      </div>

      {/* PERFIL DA LOJA */}
      <div className="max-w-3xl mx-auto px-4 -mt-16 relative z-10 space-y-4">
        <div className="flex items-end space-x-4">
          <img src={logoUrl} alt={tenant.name} className="w-24 h-24 rounded-3xl object-cover border-4 shadow-2xl" style={{ borderColor: secondaryColor, backgroundColor: cardBgColor }} />
          <div className="pb-1">
            <h1 className="font-bold text-xl md:text-2xl" style={{ color: textColor }}>{tenant.name}</h1>
            <p className="text-xs opacity-75">👕 Camisas & Vestuário Digital</p>
          </div>
        </div>

        {/* BARRA DE PESQUISA */}
        <div className="relative">
          <input 
            type="text" 
            placeholder="🔍 Buscar peça pelo nome..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }}
            className="w-full border p-3.5 pl-10 rounded-2xl text-xs focus:outline-none shadow-lg"
          />
        </div>

        {/* NAVEGAÇÃO DE COLEÇÕES */}
        <div className="flex space-x-2 overflow-x-auto pb-2 text-xs font-bold scrollbar-none">
          <button 
            onClick={() => setSelectedCategory('ALL')}
            style={selectedCategory === 'ALL' ? { backgroundColor: primaryColor, color: buttonTextColor } : { backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }}
            className="px-4 py-2.5 rounded-xl whitespace-nowrap border transition shadow-md">
            Todas as Peças
          </button>

          {categories.map(c => (
            <button 
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              style={selectedCategory === c.id ? { backgroundColor: primaryColor, color: buttonTextColor } : { backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }}
              className="px-4 py-2.5 rounded-xl whitespace-nowrap border transition shadow-md">
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
            style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.08)' }}
            className="border rounded-3xl p-3 flex flex-col justify-between cursor-pointer hover:opacity-90 transition shadow-lg group">
            
            <div className="space-y-2">
              <div className="w-full h-36 md:h-44 rounded-2xl overflow-hidden relative" style={{ backgroundColor: secondaryColor }}>
                <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
              </div>
              <div>
                <h3 className="font-bold text-xs line-clamp-1" style={{ color: textColor }}>{p.name}</h3>
                <p className="text-[11px] opacity-70 line-clamp-1 mt-0.5">{p.description || 'Tecido premium e caimento perfeito.'}</p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 mt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <span className="font-bold text-sm" style={{ color: textColor }}>R$ {Number(p.price).toFixed(2)}</span>
              <button 
                style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                className="text-[10px] font-bold px-3 py-1.5 rounded-xl shadow-md">
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
            style={{ backgroundColor: primaryColor, color: buttonTextColor }}
            className="w-full py-4 px-5 rounded-2xl font-bold text-xs flex justify-between items-center shadow-2xl transition transform active:scale-95">
            <span className="flex items-center space-x-2">
              <span className="bg-black/20 px-2.5 py-1 rounded-lg text-[11px]">{cart.reduce((a, b) => a + b.quantity, 0)}</span>
              <span>Ver Sacola de Compras</span>
            </span>
            <span>R$ {total.toFixed(2)} ➔</span>
          </button>
        </div>
      )}

      {/* MODAL DE SELEÇÃO DE PRODUTO */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm rounded-3xl p-5 border space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl" style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)', color: textColor }}>
            <div className="w-full h-48 rounded-2xl overflow-hidden" style={{ backgroundColor: secondaryColor }}>
              <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" />
            </div>

            <div>
              <h3 className="font-bold text-base">{selectedProduct.name}</h3>
              <p className="text-xs opacity-75 mt-1">{selectedProduct.description}</p>
              <span className="font-bold text-lg block mt-2" style={{ color: primaryColor }}>R$ {Number(selectedProduct.price).toFixed(2)}</span>
            </div>

            {/* SELETOR DE TAMANHO */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold opacity-75 uppercase block">Selecione o Tamanho:</label>
              <div className="grid grid-cols-5 gap-1.5">
                {['P', 'M', 'G', 'GG', 'XGG'].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    style={selectedSize === size ? { backgroundColor: primaryColor, color: buttonTextColor } : { backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }}
                    className="py-2 rounded-xl text-xs font-bold border transition">
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* SELETOR DE QUANTIDADE */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-xs font-bold opacity-75">Quantidade:</span>
              <div className="flex items-center space-x-3 border p-1 rounded-xl" style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.1)' }}>
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 rounded-lg font-bold text-sm" style={{ backgroundColor: cardBgColor }}>-</button>
                <span className="text-xs font-bold w-4 text-center">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 rounded-lg font-bold text-sm" style={{ backgroundColor: cardBgColor }}>+</button>
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button onClick={() => setSelectedProduct(null)} className="w-1/3 opacity-80 font-bold py-3 rounded-xl text-xs" style={{ backgroundColor: secondaryColor }}>Cancelar</button>
              <button 
                onClick={() => handleAddToCart(selectedProduct)}
                style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                className="w-2/3 font-bold py-3 rounded-xl text-xs shadow-lg">
                Adicionar à Sacola 🛍️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CHECKOUT / SACOLA */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-3xl p-5 border space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl" style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)', color: textColor }}>
            <div className="flex justify-between items-center border-b pb-3" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <h3 className="font-bold text-sm">🛍️ Sua Sacola de Compras</h3>
              <button onClick={() => setIsCartOpen(false)} className="text-xs font-bold opacity-75">✕ Fechar</button>
            </div>

            {/* ITENS NO CARRINHO */}
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {cart.map(item => (
                <div key={item.cartId} className="flex justify-between items-center p-3 rounded-xl text-xs border" style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.1)' }}>
                  <div>
                    <span className="font-bold block">{item.quantity}x {item.name}</span>
                    <span className="text-[10px] font-bold" style={{ color: primaryColor }}>Tam: {item.size}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold">R$ {(Number(item.price) * item.quantity).toFixed(2)}</span>
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
                style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }}
                className="flex-1 border p-2.5 rounded-xl text-xs uppercase focus:outline-none" 
              />
              <button onClick={handleApplyCoupon} className="px-4 py-2.5 rounded-xl font-bold text-xs border" style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.2)' }}>Aplicar</button>
            </div>

            {/* COPIAR PIX MANUAL */}
            {tenant.pix_key && (
              <div className="p-3 rounded-2xl border space-y-2 text-xs" style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.1)' }}>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-green-400">🔑 Pagamento via PIX:</span>
                  <button onClick={handleCopyPix} className="bg-green-600/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-lg font-bold text-[10px]">
                    {copiedPix ? '✓ Copiado!' : '📋 Copiar Chave PIX'}
                  </button>
                </div>
                <p className="text-[10px] opacity-80 font-mono break-all p-2 rounded-xl" style={{ backgroundColor: cardBgColor }}>{tenant.pix_key}</p>
              </div>
            )}

            {/* FORMULÁRIO DE ENTREGA */}
            <form onSubmit={handleCheckout} className="space-y-3 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <input type="text" placeholder="Seu Nome Completo" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }} className="w-full border p-3 rounded-xl text-xs focus:outline-none" required />
              <input type="text" placeholder="Seu WhatsApp (DDD + Número)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }} className="w-full border p-3 rounded-xl text-xs focus:outline-none" required />
              <input type="text" placeholder="Endereço Completo de Entrega" value={address} onChange={(e) => setAddress(e.target.value)} style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }} className="w-full border p-3 rounded-xl text-xs focus:outline-none" />

              <div>
                <label className="text-[10px] font-bold opacity-75 block mb-1">Opção de Envio / Frete:</label>
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
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }}
                  className="w-full border p-3 rounded-xl text-xs focus:outline-none">
                  <option value="">Retirada / Combinar no Local (R$ 0,00)</option>
                  {neighborhoods.map(n => (
                    <option key={n.id} value={n.id}>{n.name} — R$ {Number(n.fee).toFixed(2)}</option>
                  ))}
                </select>
              </div>

              {/* RESUMO FINANCEIRO */}
              <div className="p-3 rounded-2xl space-y-1 text-xs border" style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.1)' }}>
                <div className="flex justify-between opacity-80"><span>Subtotal:</span><span>R$ {subtotal.toFixed(2)}</span></div>
                {discountAmount > 0 && <div className="flex justify-between text-green-400"><span>Desconto:</span><span>-R$ {discountAmount.toFixed(2)}</span></div>}
                <div className="flex justify-between opacity-80"><span>Frete:</span><span>R$ {deliveryFee.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-sm pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}><span>TOTAL:</span><span className="text-green-400">R$ {total.toFixed(2)}</span></div>
              </div>

              <button 
                type="submit" 
                style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                className="w-full font-bold py-3.5 rounded-xl text-xs shadow-lg transition transform active:scale-95">
                Enviar Pedido no WhatsApp 🚀
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
