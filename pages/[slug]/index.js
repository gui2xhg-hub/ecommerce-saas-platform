import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function CatalogoRoupas() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ESTADOS DO CARRINHO & PRODUTO SELECIONADO
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState([]);
  const [showCartModal, setShowCartModal] = useState(false);

  // MODAL DE DETALHES DO PRODUTO (TAMANHO E COR)
  const [activeProduct, setActiveProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState('G');
  const [selectedColor, setSelectedColor] = useState('Preto');
  const [productQuantity, setProductQuantity] = useState(1);

  // DADOS DE ENTREGA DO CLIENTE
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerZip, setCustomerZip] = useState('');
  const [shippingMethod, setShippingMethod] = useState('PAC (Envio Correios)');
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

      if (cData) setCategories(cData);
      if (pData) setProducts(pData);
    }
    setLoading(false);
  };

  // ADICIONAR ITEM AO CARRINHO COM OPÇÕES
  const handleAddToCart = () => {
    if (!activeProduct) return;

    const cartItem = {
      cartId: `${activeProduct.id}-${selectedSize}-${selectedColor}-${Date.now()}`,
      productId: activeProduct.id,
      name: activeProduct.name,
      price: Number(activeProduct.price || 0),
      quantity: productQuantity,
      size: selectedSize,
      color: selectedColor,
      imageUrl: activeProduct.image_url || activeProduct.image
    };

    setCart([...cart, cartItem]);
    setActiveProduct(null);
    setProductQuantity(1);
  };

  const handleRemoveFromCart = (cartId) => {
    setCart(cart.filter(item => item.cartId !== cartId));
  };

  const totalCart = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

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
      neighborhood: customerZip ? `CEP: ${customerZip}` : 'Envio Nacional',
      order_type: 'entrega',
      items: cart,
      total: totalCart,
      payment_method: 'PIX / Cartão no WhatsApp',
      status: 'recebido',
      archived: false
    };

    const { data: createdOrder, error } = await supabase.from('orders').insert([orderData]).select().single();

    setIsSubmitting(false);

    if (error) {
      return alert("Erro ao enviar pedido: " + error.message);
    }

    // FORMATAR MENSAGEM DO WHATSAPP
    let msg = `*NOVO PEDIDO #${createdOrder.id} - ${tenant.name.toUpperCase()}*\n\n`;
    msg += `*Cliente:* ${customerName}\n*WhatsApp:* ${customerPhone}\n`;
    msg += `*Endereço:* ${customerAddress}\n`;
    if (customerZip) msg += `*CEP:* ${customerZip}\n`;
    msg += `*Forma de Envio:* ${shippingMethod}\n\n`;
    msg += `*ITENS SOLICITADOS:*\n`;

    cart.forEach((item, idx) => {
      msg += `\n${idx + 1}. *${item.quantity}x ${item.name}* - R$ ${(item.price * item.quantity).toFixed(2)}\n`;
      msg += `   • *Tamanho:* ${item.size} | *Cor:* ${item.color}\n`;
    });

    msg += `\n*TOTAL DO PEDIDO:* *R$ ${totalCart.toFixed(2)}*`;

    const cleanWhatsapp = tenant.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/55${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');

    setCart([]);
    setShowCartModal(false);
    alert("Pedido enviado com sucesso!");
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando Loja...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Loja não encontrada</h1></div>;

  // CORES DINÂMICAS DO TEMA
  const primaryColor = tenant.primary_color || '#FF8C00';
  const buttonTextColor = tenant.button_text_color || '#FFFFFF';
  const secondaryColor = tenant.secondary_color || '#090D16';
  const cardBgColor = tenant.card_bg_color || '#111827';
  const textColor = tenant.text_color || '#FFFFFF';

  const filteredProducts = selectedCategory === 'ALL' 
    ? products 
    : products.filter(p => String(p.category_id) === String(selectedCategory));

  return (
    <div 
      className="min-h-screen font-sans pb-24 max-w-md mx-auto transition-colors duration-300"
      style={{ backgroundColor: secondaryColor, color: textColor }}>
      
      {/* CAPA & BANNER DA LOJA */}
      <div className="relative h-40 bg-black/30 border-b border-white/10">
        <img 
          src={tenant.banner_url || 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80'} 
          alt="Capa" 
          className="w-full h-full object-cover opacity-40" 
        />
        
        <div className="absolute -bottom-6 left-4 flex items-center space-x-3">
          <img 
            src={tenant.logo_url || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=150&auto=format&fit=crop&q=80'} 
            alt="Logo" 
            className="w-16 h-16 rounded-2xl border-2 border-white/20 object-cover shadow-xl"
            style={{ backgroundColor: cardBgColor }} 
          />
          <div className="pt-5">
            <h1 className="font-bold text-lg leading-tight" style={{ color: textColor }}>{tenant.name}</h1>
            <p className="text-[11px] opacity-70" style={{ color: textColor }}>👕 Camisas & Vestuário</p>
          </div>
        </div>
      </div>

      {/* CATEGORIAS DA LOJA */}
      <div className="mt-10 px-4 space-y-5">
        <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('ALL')}
            style={
              selectedCategory === 'ALL' 
                ? { backgroundColor: primaryColor, color: buttonTextColor, borderColor: primaryColor } 
                : { backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }
            }
            className="px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border shadow-sm">
            Todas as Peças
          </button>
          
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={
                String(selectedCategory) === String(cat.id) 
                  ? { backgroundColor: primaryColor, color: buttonTextColor, borderColor: primaryColor } 
                  : { backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }
              }
              className="px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border shadow-sm">
              {cat.name}
            </button>
          ))}
        </div>

        {/* CATÁLOGO DE PRODUTOS */}
        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map(prod => (
            <div
              key={prod.id}
              onClick={() => {
                setActiveProduct(prod);
                setSelectedSize('G');
                setSelectedColor('Preto');
                setProductQuantity(1);
              }}
              style={{ backgroundColor: cardBgColor, borderColor: 'rgba(255,255,255,0.1)' }}
              className="border rounded-2xl p-2.5 space-y-2 cursor-pointer hover:border-white/30 transition flex flex-col justify-between shadow-lg">
              
              <div className="space-y-2">
                <img
                  src={prod.image_url || prod.image || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80'}
                  alt={prod.name}
                  className="w-full h-36 object-cover rounded-xl bg-black/20"
                />
                <h3 className="font-bold text-xs line-clamp-2" style={{ color: textColor }}>{prod.name}</h3>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-white/10">
                <span className="font-bold text-xs" style={{ color: primaryColor }}>R$ {Number(prod.price).toFixed(2)}</span>
                <span 
                  style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, borderColor: `${primaryColor}40` }}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-lg border">
                  + Opções
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BARRA FLUTUANTE DO CARRINHO */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-40">
          <button
            onClick={() => setShowCartModal(true)}
            style={{ backgroundColor: primaryColor, color: buttonTextColor }}
            className="w-full font-bold p-3.5 rounded-2xl shadow-2xl flex justify-between items-center text-xs transition active:scale-95">
            <span className="bg-black/30 px-2.5 py-1 rounded-lg">🛒 {cart.length} item(ns)</span>
            <span>Ver Sacola de Compras ➔</span>
            <span>R$ {totalCart.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* MODAL DE DETALHES DO PRODUTO (TAMANHO E COR) */}
      {activeProduct && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div 
            style={{ backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }}
            className="border w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm">{activeProduct.name}</h3>
              <button onClick={() => setActiveProduct(null)} className="font-bold text-xs opacity-60 hover:opacity-100">✕ Fechar</button>
            </div>

            <img
              src={activeProduct.image_url || activeProduct.image || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80'}
              alt={activeProduct.name}
              className="w-full h-44 object-cover rounded-2xl bg-black/20"
            />

            <p className="text-xs opacity-70">{activeProduct.description || 'Algodão 100% penteado de altíssima qualidade.'}</p>

            {/* SELEÇÃO DE TAMANHO */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold block opacity-90">1. Selecione o Tamanho:</label>
              <div className="flex space-x-2">
                {['P', 'M', 'G', 'GG', 'XGG'].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    style={
                      selectedSize === size 
                        ? { backgroundColor: primaryColor, color: buttonTextColor } 
                        : { backgroundColor: 'rgba(255,255,255,0.05)', color: textColor }
                    }
                    className="flex-1 py-2 rounded-xl font-bold text-xs border border-white/10 transition">
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* SELEÇÃO DE COR */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold block opacity-90">2. Selecione a Cor:</label>
              <div className="grid grid-cols-3 gap-2">
                {['Preto', 'Branco', 'Mescla/Cinza', 'Marrom', 'Bege', 'Vermelho'].map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    style={
                      selectedColor === color 
                        ? { backgroundColor: `${primaryColor}30`, borderColor: primaryColor, color: primaryColor } 
                        : { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: textColor }
                    }
                    className="py-1.5 px-2 rounded-xl font-bold text-[11px] border transition">
                    {color}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="font-bold text-sm text-green-400">R$ {(Number(activeProduct.price) * productQuantity).toFixed(2)}</span>
              <button
                type="button"
                onClick={handleAddToCart}
                style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                className="font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-lg">
                Adicionar à Sacola 🛍️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DA SACOLA DE COMPRAS E CHECKOUT */}
      {showCartModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div 
            style={{ backgroundColor: cardBgColor, color: textColor, borderColor: 'rgba(255,255,255,0.1)' }}
            className="border w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm" style={{ color: primaryColor }}>🛍️ Sua Sacola de Compras</h3>
              <button onClick={() => setShowCartModal(false)} className="font-bold text-xs opacity-60 hover:opacity-100">✕ Fechar</button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {cart.map(item => (
                <div 
                  key={item.cartId} 
                  style={{ backgroundColor: secondaryColor, borderColor: 'rgba(255,255,255,0.1)' }}
                  className="p-3 rounded-2xl border text-xs flex justify-between items-center">
                  <div>
                    <h4 className="font-bold">{item.quantity}x {item.name}</h4>
                    <p className="text-[10px] opacity-70">Tam: <b>{item.size}</b> | Cor: <b>{item.color}</b></p>
                    <span className="text-green-400 font-bold text-[11px]">R$ {(item.price * item.quantity).toFixed(2)}</span>
                  </div>

                  <button onClick={() => handleRemoveFromCart(item.cartId)} className="text-red-400 text-xs font-bold px-2 py-1">
                    🗑
                  </button>
                </div>
              ))}
            </div>

            {/* FORMULÁRIO DE ENTREGA */}
            <form onSubmit={handleCheckout} className="space-y-2.5 pt-2 border-t border-white/10 text-xs">
              <h4 className="font-bold text-xs opacity-90">Dados para Envio Nacional</h4>
              <input
                type="text"
                required
                placeholder="Seu Nome Completo"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.15)' }}
                className="w-full border p-2.5 rounded-xl focus:outline-none"
              />
              <input
                type="text"
                required
                placeholder="Seu WhatsApp (DDD + Número)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.15)' }}
                className="w-full border p-2.5 rounded-xl focus:outline-none"
              />
              <input
                type="text"
                required
                placeholder="Endereço Completo com Número e Bairro"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.15)' }}
                className="w-full border p-2.5 rounded-xl focus:outline-none"
              />
              <input
                type="text"
                placeholder="CEP (para cálculo de envio)"
                value={customerZip}
                onChange={(e) => setCustomerZip(e.target.value)}
                style={{ backgroundColor: secondaryColor, color: textColor, borderColor: 'rgba(255,255,255,0.15)' }}
                className="w-full border p-2.5 rounded-xl focus:outline-none"
              />

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-2xl text-xs transition shadow-lg mt-2">
                {isSubmitting ? 'Enviando...' : 'Finalizar Pedido no WhatsApp 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
