import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function CatalogoRoupas() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [shippingOptions, setShippingOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  // ESTADOS DO CARRINHO & PRODUTO SELECIONADO
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState([]);
  const [showCartModal, setShowCartModal] = useState(false);

  // CUPOM DE DESCONTO
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');

  // MODAL DE DETALHES DO PRODUTO
  const [activeProduct, setActiveProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState('G');
  const [productQuantity, setProductQuantity] = useState(1);

  // DADOS DE ENTREGA DO CLIENTE
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerZip, setCustomerZip] = useState('');
  const [selectedShipping, setSelectedShipping] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantAndProducts();
    }
  }, [router.isReady, slug]);

  const fetchTenantAndProducts = async () => {
    setLoading(true);
    const cleanSlug = String(slug).toLowerCase().trim();
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', cleanSlug).maybeSingle();

    if (tData) {
      setTenant(tData);
      const { data: cData } = await supabase.from('categories').select('*').eq('tenant_id', tData.id);
      const { data: pData } = await supabase.from('products').select('*').eq('tenant_id', tData.id).eq('active', true);
      const { data: nData } = await supabase.from('neighborhoods').select('*').eq('tenant_id', tData.id);

      if (cData) setCategories(cData);
      if (pData) setProducts(pData);
      if (nData) {
        setShippingOptions(nData);
        if (nData.length > 0) setSelectedShipping(nData[0]);
      }
    }
    setLoading(false);
  };

  const handleAddToCart = () => {
    if (!activeProduct) return;

    const cartItem = {
      cartId: `${activeProduct.id}-${selectedSize}-${Date.now()}`,
      productId: activeProduct.id,
      name: activeProduct.name,
      price: Number(activeProduct.price || 0),
      quantity: productQuantity,
      size: selectedSize,
      imageUrl: activeProduct.image_url || activeProduct.image
    };

    setCart([...cart, cartItem]);
    setActiveProduct(null);
    setProductQuantity(1);
  };

  const handleRemoveFromCart = (cartId) => {
    setCart(cart.filter(item => item.cartId !== cartId));
  };

  // CÁLCULO DOS VALORES
  const subtotalCart = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const shippingFee = selectedShipping ? Number(selectedShipping.fee || 0) : 0;

  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discount_type === 'percent') {
      discountAmount = subtotalCart * (Number(appliedCoupon.discount_value) / 100);
    } else {
      discountAmount = Number(appliedCoupon.discount_value);
    }
  }
  if (discountAmount > subtotalCart) discountAmount = subtotalCart;

  const totalCart = Math.max(0, subtotalCart + shippingFee - discountAmount);

  // VALIDAR CUPOM DE DESCONTO
  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    setCouponError('');
    if (!couponInput.trim()) return;

    const cleanCode = couponInput.trim().toUpperCase();
    const { data: cData, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('code', cleanCode)
      .eq('active', true)
      .maybeSingle();

    if (error || !cData) {
      setCouponError('Cupom inválido ou expirado');
      setAppliedCoupon(null);
    } else {
      setAppliedCoupon(cData);
      setCouponError('');
    }
  };

  // FINALIZAR PEDIDO NO WHATSAPP
  const handleCheckout = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return alert("Seu carrinho está vazio!");
    if (!customerName || !customerPhone || !customerAddress) return alert("Preencha Nome, WhatsApp e Endereço Completo!");

    setIsSubmitting(true);

    const orderData = {
      tenant_id: tenant.id,
      customer_name: customerName,
      customer_phone: customerPhone.replace(/\D/g, ''),
      address: customerAddress,
      neighborhood: selectedShipping ? `${selectedShipping.name} (R$ ${shippingFee.toFixed(2)})` : 'Envio Padrão',
      order_type: 'entrega',
      items: cart,
      subtotal: subtotalCart,
      delivery_fee: shippingFee,
      total: totalCart,
      payment_method: 'PIX / Pendente',
      status: 'recebido',
      archived: false
    };

    const { data: createdOrder, error } = await supabase.from('orders').insert([orderData]).select().single();

    setIsSubmitting(false);

    if (error) {
      return alert("Erro ao enviar pedido: " + error.message);
    }

    // MENSAGEM WHATSAPP
    let msg = `*NOVO PEDIDO #${createdOrder.id} - ${tenant.name.toUpperCase()}*\n\n`;
    msg += `*Cliente:* ${customerName}\n*WhatsApp:* ${customerPhone}\n`;
    msg += `*Endereço:* ${customerAddress}\n`;
    if (customerZip) msg += `*CEP:* ${customerZip}\n`;
    if (selectedShipping) msg += `*Frete/Estado:* ${selectedShipping.name} (R$ ${shippingFee.toFixed(2)})\n\n`;
    msg += `*ITENS SOLICITADOS:*\n`;

    cart.forEach((item, idx) => {
      msg += `\n${idx + 1}. *${item.quantity}x ${item.name}* - R$ ${(item.price * item.quantity).toFixed(2)}\n`;
      msg += `   • *Tamanho:* ${item.size}\n`;
    });

    msg += `\n*Subtotal:* R$ ${subtotalCart.toFixed(2)}`;
    msg += `\n*Frete:* R$ ${shippingFee.toFixed(2)}`;
    if (appliedCoupon) {
      msg += `\n*Cupom (${appliedCoupon.code}):* - R$ ${discountAmount.toFixed(2)}`;
    }
    msg += `\n*TOTAL:* *R$ ${totalCart.toFixed(2)}*`;

    const cleanWhatsapp = tenant.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/55${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');

    setCart([]);
    setShowCartModal(false);
    setAppliedCoupon(null);
    setCouponInput('');
    alert("Pedido enviado com sucesso!");
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando Loja...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Loja não encontrada</h1></div>;

  const primaryColor = tenant.primary_color || '#FF8C00';
  const buttonTextColor = tenant.button_text_color || '#FFFFFF';
  const secondaryColor = tenant.secondary_color || '#090D16';
  const cardBgColor = tenant.card_bg_color || '#111827';
  const textColor = tenant.text_color || '#FFFFFF';

  const filteredProducts = selectedCategory === 'ALL' 
    ? products 
    : products.filter(p => String(p.category_id) === String(selectedCategory));

  return (
    <div className="min-h-screen font-sans pb-24 max-w-md mx-auto transition-colors duration-300" style={{ backgroundColor: secondaryColor, color: textColor }}>
      
      {/* CAPA & BANNER DA LOJA */}
      <div className="relative h-40 bg-black/30 border-b border-white/10">
        <img src={tenant.banner_url || 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80'} alt="Capa" className="w-full h-full object-cover opacity-40" />
        <div className="absolute -bottom-6 left-4 flex items-center space-x-3">
          <img src={tenant.logo_url || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=150&auto=format&fit=crop&q=80'} alt="Logo" className="w-16 h-16 rounded-2xl border-2 border-white/20 object-cover shadow-xl" style={{ backgroundColor: cardBgColor }} />
          <div className="pt-5">
            <h1 className="font-bold text-lg leading-tight" style={{ color: textColor }}>{tenant.name}</h1>
            <p className="text-[11px] opacity-70" style={{ color: textColor }}>👕 Camisas & Vestuário</p>
          </div>
        </div>
      </div>

      {/* CATEGORIAS DA LOJA */}
      <div className="mt-10 px-4 space-y-5">
        <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
          <button onClick={() => setSelectedCategory('ALL')} style={selectedCategory === 'ALL' ? { backgroundColor: primaryColor, color: buttonTextColor, borderColor: primaryColor } : { backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }} className="px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border shadow-sm">
            Todas as Peças
          </button>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={String(selectedCategory) === String(cat.id) ? { backgroundColor: primaryColor, color: buttonTextColor, borderColor: primaryColor } : { backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }} className="px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border shadow-sm">
              {cat.name}
            </button>
          ))}
        </div>

        {/* CATÁLOGO DE PRODUTOS */}
        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map(prod => (
            <div key={prod.id} onClick={() => { setActiveProduct(prod); setSelectedSize('G'); setProductQuantity(1); }} style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)' }} className="border rounded-2xl p-2.5 space-y-2 cursor-pointer hover:border-white/30 transition flex flex-col justify-between shadow-lg">
              <div className="space-y-2">
                <img src={prod.image_url || prod.image || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80'} alt={prod.name} className="w-full h-36 object-cover rounded-xl bg-black/20" />
                <h3 className="font-bold text-xs line-clamp-2" style={{ color: textColor }}>{prod.name}</h3>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-white/10">
                <span className="font-bold text-xs" style={{ color: primaryColor }}>R$ {Number(prod.price).toFixed(2)}</span>
                <span style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, borderColor: `${primaryColor}40` }} className="text-[10px] font-bold px-2 py-0.5 rounded-lg border">Ver Peça</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BARRA FLUTUANTE DO CARRINHO */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-40">
          <button onClick={() => setShowCartModal(true)} style={{ backgroundColor: primaryColor, color: buttonTextColor }} className="w-full font-bold p-3.5 rounded-2xl shadow-2xl flex justify-between items-center text-xs transition active:scale-95">
            <span className="bg-black/30 px-2.5 py-1 rounded-lg">🛒 {cart.length} item(ns)</span>
            <span>Ver Sacola ➔</span>
            <span>R$ {totalCart.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* MODAL DETALHES DO PRODUTO */}
      {activeProduct && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div style={{ backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }} className="border w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm">{activeProduct.name}</h3>
              <button onClick={() => setActiveProduct(null)} className="font-bold text-xs opacity-60 hover:opacity-100">✕ Fechar</button>
            </div>
            <img src={activeProduct.image_url || activeProduct.image || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80'} alt={activeProduct.name} className="w-full h-44 object-cover rounded-2xl bg-black/20" />
            <p className="text-xs opacity-70">{activeProduct.description || 'Algodão 100% penteado de altíssima qualidade.'}</p>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold block opacity-90">1. Selecione o Tamanho:</label>
              <div className="flex space-x-2">
                {['P', 'M', 'G', 'GG', 'XGG'].map(size => (
                  <button key={size} type="button" onClick={() => setSelectedSize(size)} style={selectedSize === size ? { backgroundColor: primaryColor, color: buttonTextColor } : { backgroundColor: 'rgba(255,255,255,0.05)', color: textColor }} className="flex-1 py-2 rounded-xl font-bold text-xs border border-white/10 transition">
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold block opacity-90">2. Quantidade:</label>
              <div className="flex items-center space-x-3 bg-black/20 p-1.5 rounded-xl border border-white/10 w-max">
                <button type="button" onClick={() => setProductQuantity(Math.max(1, productQuantity - 1))} className="w-8 h-8 rounded-lg bg-white/10 font-bold text-sm flex items-center justify-center hover:bg-white/20 transition">-</button>
                <span className="font-bold text-sm px-2">{productQuantity}</span>
                <button type="button" onClick={() => setProductQuantity(productQuantity + 1)} className="w-8 h-8 rounded-lg bg-white/10 font-bold text-sm flex items-center justify-center hover:bg-white/20 transition">+</button>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-white/10">
              <span className="font-bold text-sm text-green-400">R$ {(Number(activeProduct.price) * productQuantity).toFixed(2)}</span>
              <button type="button" onClick={handleAddToCart} style={{ backgroundColor: primaryColor, color: buttonTextColor }} className="font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-lg">Adicionar à Sacola 🛍️</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHECKOUT */}
      {showCartModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div style={{ backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }} className="border w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm" style={{ color: primaryColor }}>🛍️ Sua Sacola de Compras</h3>
              <button onClick={() => setShowCartModal(false)} className="font-bold text-xs opacity-60 hover:opacity-100">✕ Fechar</button>
            </div>

            <div className="space-y-2 max-h-36 overflow-y-auto">
              {cart.map(item => (
                <div key={item.cartId} style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.1)' }} className="p-2.5 rounded-2xl border text-xs flex justify-between items-center">
                  <div>
                    <h4 className="font-bold">{item.quantity}x {item.name}</h4>
                    <p className="text-[10px] opacity-70">Tamanho: <b>{item.size}</b></p>
                    <span className="text-green-400 font-bold text-[11px]">R$ {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                  <button onClick={() => handleRemoveFromCart(item.cartId)} className="text-red-400 text-xs font-bold px-2 py-1">🗑</button>
                </div>
              ))}
            </div>

            {/* SEÇÃO DE CUPOM DE DESCONTO */}
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <label className="text-[11px] font-bold block opacity-90">🎟️ Cupom de Desconto:</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Ex: PRIMEIRA10"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.15)' }}
                  className="flex-1 border p-2 rounded-xl text-xs uppercase focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold">
                  Aplicar
                </button>
              </div>
              {appliedCoupon && (
                <p className="text-[11px] text-green-400 font-bold">
                  ✓ Cupom {appliedCoupon.code} aplicado ({appliedCoupon.discount_type === 'percent' ? `${appliedCoupon.discount_value}%` : `R$ ${appliedCoupon.discount_value}`} de desconto)!
                </p>
              )}
              {couponError && <p className="text-[11px] text-red-400 font-bold">{couponError}</p>}
            </div>

            <form onSubmit={handleCheckout} className="space-y-2.5 pt-2 border-t border-white/10 text-xs">
              <h4 className="font-bold text-xs opacity-90">Dados de Envio & Frete</h4>
              <input type="text" required placeholder="Seu Nome Completo" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.15)' }} className="w-full border p-2.5 rounded-xl focus:outline-none" />
              <input type="text" required placeholder="Seu WhatsApp (DDD + Número)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.15)' }} className="w-full border p-2.5 rounded-xl focus:outline-none" />
              <input type="text" required placeholder="Endereço Completo com Número" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.15)' }} className="w-full border p-2.5 rounded-xl focus:outline-none" />
              <input type="text" placeholder="CEP da Entrega" value={customerZip} onChange={(e) => setCustomerZip(e.target.value)} style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.15)' }} className="w-full border p-2.5 rounded-xl focus:outline-none" />

              {/* OPÇÃO DE FRETE / ESTADO */}
              {shippingOptions.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold block opacity-90">Opção de Envio / Estado:</label>
                  <select onChange={(e) => { const opt = shippingOptions.find(o => String(o.id) === e.target.value); setSelectedShipping(opt); }} style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.15)' }} className="w-full border p-2.5 rounded-xl focus:outline-none">
                    {shippingOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.name} — R$ {Number(opt.fee).toFixed(2)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* RESUMO DO VALOR */}
              <div className="bg-black/30 p-3 rounded-2xl border border-white/10 space-y-1">
                <div className="flex justify-between text-[11px]"><span>Subtotal:</span><span>R$ {subtotalCart.toFixed(2)}</span></div>
                <div className="flex justify-between text-[11px]"><span>Frete:</span><span className="text-blue-400">+ R$ {shippingFee.toFixed(2)}</span></div>
                {appliedCoupon && (
                  <div className="flex justify-between text-[11px] text-green-400"><span>Desconto ({appliedCoupon.code}):</span><span>- R$ {discountAmount.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between font-bold text-xs pt-1 border-t border-white/10 text-green-400"><span>Total Final:</span><span>R$ {totalCart.toFixed(2)}</span></div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-2xl text-xs transition shadow-lg mt-2">
                {isSubmitting ? 'Enviando...' : 'Finalizar Pedido no WhatsApp 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
