import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function EcommerceCliente() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCat, setSelectedCat] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // LISTA DE TAMANHOS DE ROUPA PADRÃO (FALLBACK PARA VESTUÁRIO/FASHION)
  const DEFAULT_FASHION_SIZES = ['P', 'M', 'G', 'GG', 'XG'];

  // MODAL DE DETALHES DO PRODUTO (GALERIA, VARIAÇÕES DINÂMICAS E OBSERVAÇÃO)
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeImage, setActiveImage] = useState('');
  const [selectedVariations, setSelectedVariations] = useState({});
  const [productQuantity, setProductQuantity] = useState(1);
  const [productNote, setProductNote] = useState('');

  // CARRINHO E CHECKOUT
  const [cart, setCart] = useState([]);
  const [showCartModal, setShowCartModal] = useState(false);
  const [deliveryType, setDeliveryType] = useState('ENTREGA');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantData();
    }
  }, [router.isReady, slug]);

  const fetchTenantData = async () => {
    setLoading(true);
    const cleanSlug = String(slug).trim();
    
    const { data: tData, error: tErr } = await supabase
      .from('tenants')
      .select('*')
      .ilike('slug', cleanSlug)
      .maybeSingle();

    if (tErr) {
      console.error("Erro ao buscar dados do tenant:", tErr.message);
    }

    if (tData) {
      setTenant(tData);

      if (tData.pixel_id && typeof window !== 'undefined') {
        !(function (f, b, e, v, n, t, s) {
          if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
          if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
          n.queue = []; t = b.createElement(e); t.async = !0;
          t.src = v; s = b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t, s);
        })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        window.fbq('init', tData.pixel_id);
        window.fbq('track', 'PageView');
      }

      const { data: cData } = await supabase.from('categories').select('*').eq('tenant_id', tData.id).order('id', { ascending: true });
      const { data: pData } = await supabase.from('products').select('*').eq('tenant_id', tData.id).eq('active', true).order('id', { ascending: true });

      if (cData) setCategories(cData);
      if (pData) setProducts(pData);
    }
    setLoading(false);
  };

  const handleOpenProductModal = (product) => {
    setSelectedProduct(product);
    setProductQuantity(1);
    setProductNote('');

    const gallery = product.images_json && Array.isArray(product.images_json) && product.images_json.length > 0 
      ? product.images_json 
      : [product.image];
    setActiveImage(gallery[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&auto=format&fit=crop&q=80');

    const initialVars = {};
    if (product.variations_json && Array.isArray(product.variations_json) && product.variations_json.length > 0) {
      product.variations_json.forEach(v => {
        if (v.attribute_name && v.options && v.options.length > 0) {
          initialVars[v.attribute_name] = v.options[0];
        }
      });
    } else if (tenant?.niche === 'fashion' || !tenant?.niche) {
      initialVars['Tamanho'] = 'M';
    }

    setSelectedVariations(initialVars);
  };

  const handleSelectVariation = (attrName, optionValue) => {
    setSelectedVariations(prev => ({
      ...prev,
      [attrName]: optionValue
    }));
  };

  const handleAddProductToCart = () => {
    if (!selectedProduct) return;

    const variationEntries = Object.entries(selectedVariations);
    const variationsText = variationEntries.map(([key, val]) => `${key}: ${val}`).join(' | ');

    const cartItem = {
      cartItemId: `${selectedProduct.id}-${JSON.stringify(selectedVariations)}-${Date.now()}`,
      id: selectedProduct.id,
      name: selectedProduct.name,
      variations: selectedVariations,
      variationsText: variationsText,
      price: Number(selectedProduct.price),
      quantity: productQuantity,
      note: productNote,
      image: activeImage || selectedProduct.image
    };

    setCart([...cart, cartItem]);
    setSelectedProduct(null);

    if (window.fbq) {
      window.fbq('track', 'AddToCart', {
        content_name: `${selectedProduct.name} ${variationsText ? `(${variationsText})` : ''}`,
        value: Number(selectedProduct.price) * productQuantity,
        currency: 'BRL'
      });
    }
  };

  const removeFromCart = (cartItemId) => {
    setCart(cart.filter(item => item.cartItemId !== cartItemId));
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando loja...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Loja não encontrada</h1></div>;

  const primaryColor = tenant.primary_color || '#FF8C00';
  const btnTextColor = tenant.button_text_color || '#FFFFFF';
  const bgColor = tenant.background_color || tenant.secondary_color || '#090D16';
  const cardColor = tenant.card_color || '#111827';
  const textColor = tenant.text_color || '#FFFFFF';

  // REGRAS AUTOMÁTICAS DE FRETE
  const defaultFee = Number(tenant.default_shipping_fee ?? 10.00);
  const freeThreshold = Number(tenant.free_shipping_threshold ?? 0.00);
  const allowPickup = tenant.enable_pickup ?? true;

  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
  const isFreeShipping = freeThreshold > 0 && subtotal >= freeThreshold;
  const currentFee = deliveryType === 'RETIRADA' ? 0 : (isFreeShipping ? 0 : defaultFee);
  const total = subtotal + currentFee;

  // FILTRAGEM COM SUPORTE PARA A ABA 'OFFERS' (🔥 PROMOÇÕES)
  const promoProductsCount = products.filter(p => p.original_price && Number(p.original_price) > Number(p.price)).length;
  
  const filteredProducts = selectedCat === 'ALL' 
    ? products 
    : (selectedCat === 'OFFERS' 
        ? products.filter(p => p.original_price && Number(p.original_price) > Number(p.price))
        : products.filter(p => String(p.category_id) === String(selectedCat))
      );

  const promoBannerList = tenant.promo_banners ? tenant.promo_banners.split(',').map(b => b.trim()).filter(Boolean) : [];

  const handleFinishOrder = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return alert("Seu carrinho está vazio!");
    if (!customerName || !customerPhone) return alert("Preencha seu Nome e WhatsApp!");
    if (deliveryType === 'ENTREGA' && !customerAddress) return alert("Preencha seu Endereço para entrega!");
    if (!tenant || !tenant.id) return alert("Erro: Dados da loja não carregados corretamente.");

    setIsSubmitting(true);

    const orderPayload = {
      tenant_id: tenant.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      address: deliveryType === 'ENTREGA' ? customerAddress : 'Retirada na Loja',
      neighborhood: deliveryType === 'ENTREGA' ? (isFreeShipping ? 'Entrega em Casa (Frete Grátis)' : 'Entrega em Casa') : 'Retirar na Loja',
      items: cart.map(i => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        price: Number(i.price),
        size: i.variations?.Tamanho || i.variationsText || 'Padrão',
        variationsText: i.variationsText || '',
        note: i.note || ''
      })),
      subtotal: Number(subtotal.toFixed(2)),
      delivery_fee: Number(currentFee.toFixed(2)),
      total: Number(total.toFixed(2)),
      payment_method: paymentMethod,
      status: 'recebido'
    };

    const { data: insertedOrder, error: insertErr } = await supabase
      .from('orders')
      .insert([orderPayload])
      .select()
      .maybeSingle();

    if (insertErr) {
      alert("⚠️ Erro ao salvar pedido no banco de dados:\n" + insertErr.message);
      setIsSubmitting(false);
      return;
    }

    if (window.fbq) {
      window.fbq('track', 'Purchase', { value: total, currency: 'BRL' });
    }

    let orderTag = insertedOrder?.id ? ` #${insertedOrder.id}` : '';
    let itemsText = cart.map(i => {
      let varStr = i.variationsText ? ` [${i.variationsText}]` : '';
      let txt = `• ${i.quantity}x ${i.name}${varStr} (R$ ${(Number(i.price) * i.quantity).toFixed(2)})`;
      if (i.note) txt += `\n   Obs: _"${i.note}"_`;
      return txt;
    }).join('\n\n');

    let msg = `*NOVA COMPRA NA LOJA${orderTag} - ${tenant.name.toUpperCase()}*\n\n`;
    msg += `*Cliente:* ${customerName}\n*Telefone:* ${customerPhone}\n`;
    msg += `*Tipo:* ${deliveryType === 'ENTREGA' ? `Entrega em: ${customerAddress}` : 'Retirar na Loja'}\n\n`;
    msg += `*ITENS COMPRADOS:*\n${itemsText}\n\n`;
    msg += `*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
    msg += `*Frete/Envio:* ${currentFee === 0 ? (deliveryType === 'RETIRADA' ? 'Grátis (Retirada)' : 'FRETE GRÁTIS 🎉') : `R$ ${currentFee.toFixed(2)}`}\n`;
    msg += `*TOTAL:* *R$ ${total.toFixed(2)}*\n`;
    msg += `*Forma de Pagamento:* ${paymentMethod}`;

    if (tenant.custom_message) {
      msg += `\n\n📌 _${tenant.custom_message}_`;
    }

    const cleanWhatsapp = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
    if (cleanWhatsapp) {
      window.open(`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    setIsSubmitting(false);
    setCart([]);
    setShowCartModal(false);
    alert("Pedido registrado e enviado para o WhatsApp com sucesso!");
  };

  const hasCustomVariations = selectedProduct?.variations_json && Array.isArray(selectedProduct.variations_json) && selectedProduct.variations_json.length > 0;
  const isFashionFallback = !hasCustomVariations && (tenant?.niche === 'fashion' || !tenant?.niche);

  const productGallery = selectedProduct?.images_json && Array.isArray(selectedProduct.images_json) && selectedProduct.images_json.length > 0
    ? selectedProduct.images_json
    : (selectedProduct?.image ? [selectedProduct.image] : []);

  const selectedProductHasPromo = selectedProduct && selectedProduct.original_price && Number(selectedProduct.original_price) > Number(selectedProduct.price);
  const selectedProductSavings = selectedProductHasPromo ? (Number(selectedProduct.original_price) - Number(selectedProduct.price)) : 0;

  return (
    <div className="min-h-screen font-sans pb-24 max-w-md mx-auto transition-colors duration-300" style={{ backgroundColor: bgColor, color: textColor }}>
      {/* CAPA DA LOJA */}
      <div className="relative h-36 bg-gray-900 border-b border-white/10">
        <img src={tenant.banner_url || 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80'} alt="Capa da Loja" className="w-full h-full object-cover opacity-50" />
        
        {tenant.instagram_url && (
          <a
            href={tenant.instagram_url.startsWith('http') ? tenant.instagram_url : `https://${tenant.instagram_url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-3 right-3 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white font-bold text-[10px] px-3 py-1.5 rounded-full shadow-lg transition flex items-center space-x-1 hover:opacity-90 z-10">
            <span>📸 Instagram</span>
          </a>
        )}

        <div className="absolute -bottom-5 left-4 flex items-center space-x-3">
          <img src={tenant.logo_url || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=150&auto=format&fit=crop&q=80'} alt="Logo" className="w-16 h-16 rounded-full border-2 border-black/40 object-cover bg-gray-800 shadow-lg" />
          <div className="pt-4">
            <h1 className="font-bold text-lg leading-tight" style={{ color: textColor }}>{tenant.name}</h1>
            <p className="text-[11px] opacity-70">🛍️ Catálogo Online & E-commerce</p>
          </div>
        </div>
      </div>

      {/* BANNERS PROMOCIONAIS */}
      {promoBannerList.length > 0 && (
        <div className="mt-8 px-4">
          <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-none">
            {promoBannerList.map((bannerUrl, idx) => (
              <img key={idx} src={bannerUrl} alt={`Destaque ${idx + 1}`} className="w-72 h-32 rounded-2xl object-cover border border-white/10 shrink-0 shadow-md" />
            ))}
          </div>
        </div>
      )}

      {/* CATEGORIAS + ABA DE PROMOÇÕES 🔥 */}
      <div className={`${promoBannerList.length > 0 ? 'mt-4' : 'mt-8'} px-4`}>
        <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedCat('ALL')}
            style={{ 
              backgroundColor: selectedCat === 'ALL' ? primaryColor : cardColor,
              color: selectedCat === 'ALL' ? btnTextColor : textColor
            }}
            className="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border border-white/10 transition">
            Todos
          </button>

          {/* BOTÃO ESPECIAL DE PROMOÇÕES */}
          {promoProductsCount > 0 && (
            <button
              onClick={() => setSelectedCat('OFFERS')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition flex items-center space-x-1 ${
                selectedCat === 'OFFERS' 
                  ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white border-red-500 shadow-lg' 
                  : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
              }`}>
              <span>🔥 Promoções ({promoProductsCount})</span>
            </button>
          )}

          {categories.map(c => {
            const isSelected = String(selectedCat) === String(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCat(c.id)}
                style={{ 
                  backgroundColor: isSelected ? primaryColor : cardColor,
                  color: isSelected ? btnTextColor : textColor
                }}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border border-white/10 transition">
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* GRID DE PRODUTOS */}
      <div className="mt-4 px-4 grid grid-cols-2 gap-3">
        {filteredProducts.map(p => {
          const hasPromo = p.original_price && Number(p.original_price) > Number(p.price);
          const discPercent = hasPromo ? Math.round(((Number(p.original_price) - Number(p.price)) / Number(p.original_price)) * 100) : 0;

          return (
            <div 
              key={p.id} 
              onClick={() => handleOpenProductModal(p)}
              style={{ backgroundColor: cardColor }} 
              className="p-3 rounded-2xl border border-white/10 flex flex-col justify-between cursor-pointer hover:border-white/20 transition relative group">
              
              {/* BADGE DE PROMOÇÃO NO CARD */}
              {hasPromo && (
                <div className="absolute top-2.5 right-2.5 z-10 bg-gradient-to-r from-red-600 to-orange-500 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-full shadow-lg border border-white/20 uppercase tracking-wider animate-pulse">
                  -{discPercent}% OFF
                </div>
              )}

              <div>
                <div className="relative overflow-hidden rounded-xl mb-2">
                  <img src={p.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&auto=format&fit=crop&q=80'} alt={p.name} className="w-full h-28 object-cover border border-white/10 bg-gray-800" />
                </div>
                <h3 className="font-bold text-xs line-clamp-2 leading-snug h-8" style={{ color: textColor }}>{p.name}</h3>
                <p className="text-[10px] opacity-60 line-clamp-2 h-7 mt-1">{p.description}</p>
              </div>

              <div className="mt-2 pt-2 border-t border-white/10 flex justify-between items-end">
                <div>
                  {hasPromo && (
                    <span className="text-[10px] opacity-50 line-through block leading-tight">
                      R$ {Number(p.original_price).toFixed(2)}
                    </span>
                  )}
                  <span className={`font-bold text-xs block ${hasPromo ? 'text-red-400 font-extrabold' : ''}`} style={{ color: hasPromo ? '#f87171' : primaryColor }}>
                    R$ {Number(p.price).toFixed(2)}
                  </span>
                </div>

                <button style={{ backgroundColor: primaryColor, color: btnTextColor }} className="px-2 py-1 rounded-lg text-[10px] font-bold transition shadow shrink-0">
                  Ver
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* BARRA DO CARRINHO FLUTUANTE */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-40">
          <button
            onClick={() => setShowCartModal(true)}
            style={{ backgroundColor: primaryColor, color: btnTextColor }}
            className="w-full font-bold p-3.5 rounded-2xl flex justify-between items-center shadow-2xl transition hover:opacity-95">
            <span className="text-xs bg-black/20 px-2.5 py-1 rounded-lg">🛍️ {cart.reduce((a, b) => a + b.quantity, 0)} itens</span>
            <span className="text-xs font-bold uppercase tracking-wider">Finalizar Compra</span>
            <span className="text-xs font-bold">R$ {subtotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* MODAL DE DETALHES DO PRODUTO */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div style={{ backgroundColor: cardColor, color: textColor }} className="border border-white/10 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-white/10 pb-2 gap-2">
              <div className="flex-1">
                <h3 className="font-bold text-sm leading-snug" style={{ color: primaryColor }}>{selectedProduct.name}</h3>
                {selectedProductHasPromo && (
                  <span className="inline-block bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold px-2 py-0.5 rounded-md mt-1">
                    🔥 OFERTA ESPECIAL — ECONOMIZE R$ {selectedProductSavings.toFixed(2)}
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedProduct(null)} className="opacity-60 hover:opacity-100 font-bold text-xs shrink-0 pt-0.5">✕ Fechar</button>
            </div>

            <div className="relative">
              <img src={activeImage} alt={selectedProduct.name} className="w-full h-44 rounded-xl object-cover border border-white/10 bg-gray-900" />
              {selectedProductHasPromo && (
                <span className="absolute top-2 right-2 bg-gradient-to-r from-red-600 to-orange-500 text-white font-extrabold text-xs px-2.5 py-1 rounded-full shadow-lg border border-white/20">
                  -{Math.round(((Number(selectedProduct.original_price) - Number(selectedProduct.price)) / Number(selectedProduct.original_price)) * 100)}% OFF
                </span>
              )}
            </div>
            
            {productGallery.length > 1 && (
              <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
                {productGallery.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImage(imgUrl)}
                    style={{ borderColor: activeImage === imgUrl ? primaryColor : 'rgba(255,255,255,0.1)' }}
                    className={`w-12 h-12 rounded-lg border-2 overflow-hidden shrink-0 transition ${activeImage === imgUrl ? 'scale-105' : 'opacity-60'}`}>
                    <img src={imgUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-baseline space-x-2">
                <span className="text-xl font-extrabold block" style={{ color: selectedProductHasPromo ? '#f87171' : primaryColor }}>
                  R$ {Number(selectedProduct.price).toFixed(2)}
                </span>
                {selectedProductHasPromo && (
                  <span className="text-xs text-gray-500 line-through">
                    R$ {Number(selectedProduct.original_price).toFixed(2)}
                  </span>
                )}
              </div>
              <p className="text-xs opacity-70">{selectedProduct.description}</p>
            </div>

            {hasCustomVariations && selectedProduct.variations_json.map((v, idx) => (
              <div key={idx} className="space-y-2 pt-2 border-t border-white/10">
                <label className="text-xs font-bold block opacity-80">🏷️ Selecione: {v.attribute_name}</label>
                <div className="flex flex-wrap gap-2">
                  {v.options.map((opt) => {
                    const isSelected = selectedVariations[v.attribute_name] === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleSelectVariation(v.attribute_name, opt)}
                        style={{
                          backgroundColor: isSelected ? primaryColor : bgColor,
                          color: isSelected ? btnTextColor : textColor,
                          borderColor: isSelected ? primaryColor : 'rgba(255,255,255,0.1)'
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-bold border transition text-center">
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {isFashionFallback && (
              <div className="space-y-2 pt-2 border-t border-white/10">
                <label className="text-xs font-bold block opacity-80">🏷️ Selecione o Tamanho da Peça:</label>
                <div className="grid grid-cols-5 gap-2">
                  {DEFAULT_FASHION_SIZES.map(size => {
                    const isSelected = selectedVariations['Tamanho'] === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => handleSelectVariation('Tamanho', size)}
                        style={{
                          backgroundColor: isSelected ? primaryColor : bgColor,
                          color: isSelected ? btnTextColor : textColor,
                          borderColor: isSelected ? primaryColor : 'rgba(255,255,255,0.1)'
                        }}
                        className="py-2 rounded-xl text-xs font-bold border transition text-center">
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1 pt-1">
              <label className="text-xs font-bold block opacity-80">📝 Observação (Opcional):</label>
              <input
                type="text"
                placeholder="Ex: Embalar para presente, instrução de envio..."
                value={productNote}
                onChange={(e) => setProductNote(e.target.value)}
                style={{ backgroundColor: bgColor, color: textColor }}
                className="w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none"
              />
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <div className="flex items-center space-x-2 bg-black/30 p-1 rounded-xl border border-white/10">
                <button onClick={() => setProductQuantity(Math.max(1, productQuantity - 1))} className="w-8 h-8 rounded-lg bg-gray-800 text-white font-bold text-sm">-</button>
                <span className="font-bold px-2">{productQuantity}</span>
                <button onClick={() => setProductQuantity(productQuantity + 1)} style={{ backgroundColor: primaryColor, color: btnTextColor }} className="w-8 h-8 rounded-lg font-bold text-sm">+</button>
              </div>

              <button
                onClick={handleAddProductToCart}
                style={{ backgroundColor: primaryColor, color: btnTextColor }}
                className="flex-1 font-bold py-3 rounded-xl text-xs shadow-lg transition">
                Adicionar • R$ {(Number(selectedProduct.price) * productQuantity).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DO CARRINHO */}
      {showCartModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div style={{ backgroundColor: cardColor, color: textColor }} className="border border-white/10 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm" style={{ color: primaryColor }}>🛍️ Sacola de Compras</h3>
              <button onClick={() => setShowCartModal(false)} className="opacity-60 font-bold text-xs">✕ Fechar</button>
            </div>

            {freeThreshold > 0 && (
              <div 
                className="text-[11px] p-2.5 rounded-xl font-bold text-center border transition"
                style={{ 
                  backgroundColor: isFreeShipping ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  borderColor: isFreeShipping ? 'rgba(34, 197, 94, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                  color: isFreeShipping ? '#4ade80' : textColor
                }}>
                {isFreeShipping ? (
                  <span>🎉 Parabéns! Você ganhou <b>FRETE GRÁTIS</b>!</span>
                ) : (
                  <span>Faltam <b>R$ {(freeThreshold - subtotal).toFixed(2)}</b> para você ganhar <b>FRETE GRÁTIS</b>!</span>
                )}
              </div>
            )}

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {cart.map(item => (
                <div key={item.cartItemId} style={{ backgroundColor: bgColor }} className="p-2.5 rounded-xl border border-white/10 flex justify-between items-start text-xs space-x-2">
                  <div className="flex-1">
                    <span className="font-bold block">{item.quantity}x {item.name}</span>
                    {item.variationsText && (
                      <span className="text-[10px] font-bold text-orange-400 block">{item.variationsText}</span>
                    )}
                    {item.note && (
                      <p className="text-[10px] opacity-60 italic">Obs: "{item.note}"</p>
                    )}
                    <span style={{ color: primaryColor }} className="font-bold block mt-0.5">R$ {(Number(item.price) * item.quantity).toFixed(2)}</span>
                  </div>

                  <button onClick={() => removeFromCart(item.cartItemId)} className="text-red-400 font-bold text-xs p-1">🗑</button>
                </div>
              ))}
            </div>

            <form onSubmit={handleFinishOrder} className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setDeliveryType('ENTREGA')}
                  style={{ 
                    backgroundColor: deliveryType === 'ENTREGA' ? primaryColor : bgColor,
                    color: deliveryType === 'ENTREGA' ? btnTextColor : textColor
                  }}
                  className={`py-2 rounded-xl text-xs font-bold border border-white/10 ${allowPickup ? 'w-1/2' : 'w-full'}`}>
                  🛵 Entrega {isFreeShipping ? '(GRÁTIS)' : `(R$ ${defaultFee.toFixed(2)})`}
                </button>

                {allowPickup && (
                  <button
                    type="button"
                    onClick={() => setDeliveryType('RETIRADA')}
                    style={{ 
                      backgroundColor: deliveryType === 'RETIRADA' ? primaryColor : bgColor,
                      color: deliveryType === 'RETIRADA' ? btnTextColor : textColor
                    }}
                    className="w-1/2 py-2 rounded-xl text-xs font-bold border border-white/10">
                    🏪 Retirar na Loja
                  </button>
                )}
              </div>

              <div>
                <label className="text-[11px] opacity-70 block mb-1">Seu Nome:</label>
                <input type="text" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ backgroundColor: bgColor, color: textColor }} className="w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none" />
              </div>

              <div>
                <label className="text-[11px] opacity-70 block mb-1">Seu WhatsApp:</label>
                <input type="text" required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} style={{ backgroundColor: bgColor, color: textColor }} className="w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none" />
              </div>

              {deliveryType === 'ENTREGA' && (
                <div>
                  <label className="text-[11px] opacity-70 block mb-1">Endereço Completo de Entrega:</label>
                  <input type="text" required value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} style={{ backgroundColor: bgColor, color: textColor }} className="w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none" />
                </div>
              )}

              <div>
                <label className="text-[11px] opacity-70 block mb-1">Forma de Pagamento Preferida:</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ backgroundColor: bgColor, color: textColor }} className="w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none">
                  <option value="PIX">PIX</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                  <option value="Dinheiro">Dinheiro</option>
                </select>
              </div>

              <div style={{ backgroundColor: bgColor }} className="p-3 rounded-xl border border-white/10 space-y-1 text-xs">
                <div className="flex justify-between"><span className="opacity-60">Subtotal:</span><span>R$ {subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between">
                  <span className="opacity-60">Taxa de Frete/Envio:</span>
                  <span>
                    {deliveryType === 'RETIRADA' 
                      ? 'Grátis' 
                      : (isFreeShipping ? '🎉 FRETE GRÁTIS' : `R$ ${currentFee.toFixed(2)}`)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-white/10"><span style={{ color: primaryColor }}>TOTAL:</span><span style={{ color: primaryColor }}>R$ {total.toFixed(2)}</span></div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{ backgroundColor: primaryColor, color: btnTextColor }}
                className="w-full font-bold py-3.5 rounded-xl text-xs shadow-lg transition hover:opacity-90">
                {isSubmitting ? 'Enviando...' : 'Finalizar Pedido no WhatsApp 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
