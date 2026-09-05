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

  // MODAL DE DETALHES DO PRODUTO (TAMANHO, COR E PERSONALIZAÇÃO)
  const [activeProduct, setActiveProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState('G');
  const [selectedColor, setSelectedColor] = useState('Preto');
  const [customText, setCustomText] = useState(''); // Nome/Número para estampar
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
      customText: customText.trim(),
      imageUrl: activeProduct.image_url
    };

    setCart([...cart, cartItem]);
    setActiveProduct(null);
    setCustomText('');
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

    // FORMATAR MENSAGEM DO WHATSAPP COM OS DETALHES DE PERSONALIZAÇÃO
    let msg = `*NOVO PEDIDO #${createdOrder.id} - ${tenant.name.toUpperCase()}*\n\n`;
    msg += `*Cliente:* ${customerName}\n*WhatsApp:* ${customerPhone}\n`;
    msg += `*Endereço:* ${customerAddress}\n`;
    if (customerZip) msg += `*CEP:* ${customerZip}\n`;
    msg += `*Forma de Envio:* ${shippingMethod}\n\n`;
    msg += `*ITENS SOLICITADOS:*\n`;

    cart.forEach((item, idx) => {
      msg += `\n${idx + 1}. *${item.quantity}x ${item.name}* - R$ ${(item.price * item.quantity).toFixed(2)}\n`;
      msg += `   • *Tamanho:* ${item.size} | *Cor:* ${item.color}\n`;
      if (item.customText) {
        msg += `   • ✏️ *Estampa/Nome:* "${item.customText}"\n`;
      }
    });

    msg += `\n*TOTAL DO PEDIDO:* *R$ ${totalCart.toFixed(2)}*`;

    const cleanWhatsapp = tenant.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/55${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');

    setCart([]);
    setShowCartModal(false);
    alert("Pedido enviado com sucesso para a produção!");
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando Loja...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Loja não encontrada</h1></div>;

  const filteredProducts = selectedCategory === 'ALL' 
    ? products 
    : products.filter(p => String(p.category_id) === String(selectedCategory));

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans pb-24 max-w-md mx-auto">
      
      {/* CAPA & BANNER DA LOJA */}
      <div className="relative h-40 bg-gray-900 border-b border-gray-800">
        <img src={tenant.banner_url || 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80'} alt="Capa" className="w-full h-full object-cover opacity-40" />
        
        <div className="absolute -bottom-6 left-4 flex items-center space-x-3">
          <img src={tenant.logo_url || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=150&auto=format&fit=crop&q=80'} alt="Logo" className="w-16 h-16 rounded-2xl border-2 border-gray-950 object-cover bg-gray-800 shadow-xl" />
          <div className="pt-5">
            <h1 className="font-bold text-lg text-white leading-tight">{tenant.name}</h1>
            <p className="text-[11px] text-gray-400">👕 Camisas & Vestuário Personalizado</p>
          </div>
        </div>
      </div>

      {/* CATEGORIAS DA LOJA */}
      <div className="mt-10 px-4 space-y-5">
        <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
              selectedCategory === 'ALL' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'
            }`}>
            Todas as Peças
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
                String(selectedCategory) === String(cat.id) ? 'bg-orange-500 border-orange-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'
              }`}>
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
              className="bg-gray-900 border border-gray-800 rounded-2xl p-2.5 space-y-2 cursor-pointer hover:border-orange-500/50 transition flex flex-col justify-between">
              
              <div className="space-y-2">
                <img
                  src={prod.image_url || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80'}
                  alt={prod.name}
                  className="w-full h-36 object-cover rounded-xl bg-gray-950"
                />
                <h3 className="font-bold text-xs text-white line-clamp-2">{prod.name}</h3>
              </div>

              <div className="flex justify-between items-center pt-1 border-t border-gray-800/80">
                <span className="text-orange-400 font-bold text-xs">R$ {Number(prod.price).toFixed(2)}</span>
                <span className="bg-orange-500/10 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-orange-500/20">
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
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold p-3.5 rounded-2xl shadow-2xl flex justify-between items-center text-xs transition">
            <span className="bg-black/30 px-2.5 py-1 rounded-lg">🛒 {cart.length} item(ns)</span>
            <span>Ver Sacola de Compras ➔</span>
            <span>R$ {totalCart.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* MODAL DE OPÇÕES DO PRODUTO (TAMANHO, COR E PERSONALIZAÇÃO) */}
      {activeProduct && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h3 className="font-bold text-sm text-white">{activeProduct.name}</h3>
              <button onClick={() => setActiveProduct(null)} className="text-gray-400 font-bold text-xs">✕ Fechar</button>
            </div>

            <img
              src={activeProduct.image_url || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80'}
              alt={activeProduct.name}
              className="w-full h-44 object-cover rounded-2xl bg-gray-950"
            />

            <p className="text-xs text-gray-400">{activeProduct.description || 'Algodão 100% penteado de altíssima qualidade.'}</p>

            {/* SELEÇÃO DE TAMANHO */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-300 block">1. Selecione o Tamanho:</label>
              <div className="flex space-x-2">
                {['P', 'M', 'G', 'GG', 'XGG'].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`flex-1 py-2 rounded-xl font-bold text-xs border transition ${
                      selectedSize === size ? 'bg-orange-500 border-orange-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'
                    }`}>
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* SELEÇÃO DE COR */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-300 block">2. Selecione a Cor:</label>
              <div className="grid grid-cols-3 gap-2">
                {['Preto', 'Branco', 'Mescla/Cinza', 'Marrom', 'Bege', 'Vermelho'].map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`py-1.5 px-2 rounded-xl font-bold text-[11px] border transition ${
                      selectedColor === color ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-gray-800 border-gray-700 text-gray-300'
                    }`}>
                    {color}
                  </button>
                ))}
              </div>
            </div>

            {/* CAMPO DE PERSONALIZAÇÃO OPCIONAL */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-300 block">3. Nome/Número para Estampar (Opcional):</label>
              <input
                type="text"
                placeholder="Ex: SILVA - #10 (ou deixe em branco)"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="font-bold text-sm text-green-400">R$ {(Number(activeProduct.price) * productQuantity).toFixed(2)}</span>
              <button
                type="button"
                onClick={handleAddToCart}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition">
                Adicionar à Sacola 🛍️
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DA SACOLA DE COMPRAS E CHECKOUT */}
      {showCartModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <h3 className="font-bold text-sm text-orange-400">🛍️ Sua Sacola de Compras</h3>
              <button onClick={() => setShowCartModal(false)} className="text-gray-400 font-bold text-xs">✕ Fechar</button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {cart.map(item => (
                <div key={item.cartId} className="bg-gray-950 p-3 rounded-2xl border border-gray-800 text-xs flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-white">{item.quantity}x {item.name}</h4>
                    <p className="text-[10px] text-gray-400">Tam: <b>{item.size}</b> | Cor: <b>{item.color}</b></p>
                    {item.customText && <p className="text-[10px] text-orange-300 italic">Estampa: "{item.customText}"</p>}
                    <span className="text-green-400 font-bold text-[11px]">R$ {(item.price * item.quantity).toFixed(2)}</span>
                  </div>

                  <button onClick={() => handleRemoveFromCart(item.cartId)} className="text-red-400 text-xs font-bold px-2 py-1">
                    🗑
                  </button>
                </div>
              ))}
            </div>

            {/* FORMULÁRIO DE ENTREGA */}
            <form onSubmit={handleCheckout} className="space-y-2.5 pt-2 border-t border-gray-800 text-xs">
              <h4 className="font-bold text-xs text-gray-300">Dados para Envio Nacional</h4>
              <input
                type="text"
                required
                placeholder="Seu Nome Completo"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-white focus:outline-none"
              />
              <input
                type="text"
                required
                placeholder="Seu WhatsApp (DDD + Número)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-white focus:outline-none"
              />
              <input
                type="text"
                required
                placeholder="Endereço Completo com Número e Bairro"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-white focus:outline-none"
              />
              <input
                type="text"
                placeholder="CEP (para cálculo de envio)"
                value={customerZip}
                onChange={(e) => setCustomerZip(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-white focus:outline-none"
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
