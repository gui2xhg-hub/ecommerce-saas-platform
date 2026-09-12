import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function EcommerceCliente() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [selectedCat, setSelectedCat] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // LISTA DE TAMANHOS DE ROUPA PADRÃO
  const DEFAULT_FASHION_SIZES = ['P', 'M', 'G', 'GG', 'XG'];

  // MODAL DE DETALHES DO PRODUTO
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeImage, setActiveImage] = useState('');
  const [selectedVariations, setSelectedVariations] = useState({});
  const [productQuantity, setProductQuantity] = useState(1);
  const [productNote, setProductNote] = useState('');

  // CARRINHO E CHECKOUT
  const [cart, setCart] = useState([]);
  const [showCartModal, setShowCartModal] = useState(false);
  const [deliveryType, setDeliveryType] = useState('ENTREGA');
  const [hybridOption, setHybridOption] = useState('bairro'); // 'bairro' ou 'cep'
  const [selectedNeighId, setSelectedNeighId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ESTADOS DO PIX DINÂMICO
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState('');
  const [pixCopyPaste, setPixCopyPaste] = useState('');
  const [pixPaymentId, setPixPaymentId] = useState(null);
  const [pixStatus, setPixStatus] = useState('pending');
  const [pixCopySuccess, setPixCopySuccess] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [currentOrderPayload, setCurrentOrderPayload] = useState(null);

  // ESTADOS DO MEUS PEDIDOS
  const [showMyOrdersModal, setShowMyOrdersModal] = useState(false);
  const [myOrdersList, setMyOrdersList] = useState([]);
  const [loadingMyOrders, setLoadingMyOrders] = useState(false);

  // CÁLCULO DE FRETE POR CEP
  const [destinationCep, setDestinationCep] = useState('');
  const [isCalculatingCep, setIsCalculatingCep] = useState(false);
  const [calculatedOptions, setCalculatedOptions] = useState([]);
  const [selectedShippingOption, setSelectedShippingOption] = useState(null);
  const [cepError, setCepError] = useState('');

  // CUPOM DE DESCONTO
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponMessage, setCouponMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantData();
    }
  }, [router.isReady, slug]);

  // MONITORAMENTO EM TEMPO REAL DO PIX DINÂMICO (POLLING)
  useEffect(() => {
    let interval = null;
    if (showPixModal && pixPaymentId && tenant?.pix_access_token && pixStatus !== 'approved') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`https://api.mercadopago.com/v1/payments/${pixPaymentId}`, {
            headers: {
              'Authorization': `Bearer ${tenant.pix_access_token}`
            }
          });
          const data = await res.json();
          if (data && data.status === 'approved') {
            setPixStatus('approved');
            if (currentOrderId) {
              await supabase.from('orders').update({ is_paid: true }).eq('id', currentOrderId);
            }
            clearInterval(interval);
          }
        } catch (e) {
          console.error("Erro ao consultar status do PIX:", e);
        }
      }, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showPixModal, pixPaymentId, pixStatus, tenant, currentOrderId]);

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
          t = b.createElement(e); t.async = !0;
          t.src = v; s = b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t, s);
        })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        window.fbq('init', tData.pixel_id);
        window.fbq('track', 'PageView');
      }

      const { data: cData } = await supabase.from('categories').select('*').eq('tenant_id', tData.id).order('id', { ascending: true });
      const { data: pData } = await supabase.from('products').select('*').eq('tenant_id', tData.id).eq('active', true).order('id', { ascending: true });
      const { data: nData } = await supabase.from('neighborhoods').select('*').eq('tenant_id', tData.id).order('id', { ascending: true });

      if (cData) setCategories(cData);
      if (pData) setProducts(pData);
      if (nData) setNeighborhoods(nData);
    }
    setLoading(false);
  };

  const saveOrderIdToLocal = (orderId) => {
    if (typeof window !== 'undefined' && tenant?.id) {
      const storageKey = `my_orders_${tenant.id}`;
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!existing.includes(orderId)) {
        existing.unshift(orderId);
        localStorage.setItem(storageKey, JSON.stringify(existing));
      }
    }
  };

  const handleOpenMyOrders = async () => {
    setShowMyOrdersModal(true);
    setLoadingMyOrders(true);

    try {
      if (typeof window !== 'undefined' && tenant?.id) {
        const storageKey = `my_orders_${tenant.id}`;
        const storedIds = JSON.parse(localStorage.getItem(storageKey) || '[]');

        if (storedIds.length > 0) {
          const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('tenant_id', tenant.id)
            .in('id', storedIds)
            .order('id', { ascending: false });

          if (!error && data) {
            setMyOrdersList(data);
          }
        } else {
          setMyOrdersList([]);
        }
      }
    } catch (e) {
      console.error("Erro ao buscar histórico de pedidos:", e);
    } finally {
      setLoadingMyOrders(false);
    }
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

  const handleCalculateCep = async (cepToCalc) => {
    const cleanCep = (cepToCalc || destinationCep).replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setCepError('Digite um CEP válido com 8 números.');
      setCalculatedOptions([]);
      setSelectedShippingOption(null);
      return;
    }

    setIsCalculatingCep(true);
    setCepError('');

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();

      if (data.erro) {
        setCepError('CEP não encontrado. Verifique o número digitado.');
        setCalculatedOptions([]);
        setSelectedShippingOption(null);
        setIsCalculatingCep(false);
        return;
      }

      if (data.logradouro && !customerAddress) {
        setCustomerAddress(`${data.logradouro}, nº , ${data.bairro} - ${data.localidade}/${data.uf}`);
      }

      const totalWeight = cart.reduce((acc, item) => {
        const prod = products.find(p => p.id === item.id);
        return acc + ((prod?.weight_kg || 0.3) * item.quantity);
      }, 0);

      const isFree = freeThreshold > 0 && subtotal >= freeThreshold;
      const options = [];

      const basePacFee = Math.max(16.50, 16.50 + (totalWeight - 0.5) * 4.5);
      const baseSedexFee = Math.max(28.90, 28.90 + (totalWeight - 0.5) * 8.0);

      options.push({
        id: 'pac',
        name: '📦 Correios PAC',
        fee: isFree ? 0 : basePacFee,
        time: '4 a 8 dias úteis'
      });

      options.push({
        id: 'sedex',
        name: '⚡ Correios SEDEX',
        fee: isFree ? 0 : baseSedexFee,
        time: '1 a 3 dias úteis'
      });

      setCalculatedOptions(options);
      setSelectedShippingOption(options[0]);
    } catch (err) {
      setCepError('Erro ao consultar o CEP. Tente novamente.');
      setCalculatedOptions([]);
      setSelectedShippingOption(null);
    } finally {
      setIsCalculatingCep(false);
    }
  };

  const handleApplyCoupon = async (e) => {
    e.preventDefault();
    if (!couponInput.trim()) return;

    const cleanCode = couponInput.trim().toUpperCase();
    const { data: cpData, error: cpErr } = await supabase
      .from('coupons')
      .select('*')
      .eq('tenant_id', tenant.id)
      .ilike('code', cleanCode)
      .eq('active', true)
      .maybeSingle();

    if (cpErr || !cpData) {
      setAppliedCoupon(null);
      setCouponMessage({ type: 'error', text: 'Cupom inválido ou expirado.' });
    } else {
      setAppliedCoupon(cpData);
      setCouponMessage({ type: 'success', text: `Cupom "${cpData.code}" aplicado com sucesso!` });
    }
  };

  const copyPixCode = () => {
    if (!pixCopyPaste) return;
    navigator.clipboard.writeText(pixCopyPaste);
    setPixCopySuccess(true);
    setTimeout(() => setPixCopySuccess(false), 3000);
  };

  const sendWhatsAppNotification = (orderObj, isPaidConfirmed = false) => {
    let orderTag = orderObj?.id ? ` #${orderObj.id}` : '';
    let itemsText = cart.map(i => {
      let varStr = i.variationsText ? ` [${i.variationsText}]` : '';
      let txt = `• ${i.quantity}x ${i.name}${varStr} (R$ ${(Number(i.price) * i.quantity).toFixed(2)})`;
      if (i.note) txt += `\n    Obs: _"${i.note}"_`;
      return txt;
    }).join('\n\n');

    let msg = `*NOVA COMPRA NA LOJA${orderTag} - ${tenant.name.toUpperCase()}*\n\n`;
    msg += `*Cliente:* ${customerName}\n*Telefone:* ${customerPhone}\n`;
    msg += `*Tipo de Envio:* ${deliveryType === 'ENTREGA' ? `Entrega em: ${customerAddress} (${currentOrderPayload?.shippingLabel || ''})` : 'Retirar na Loja'}\n`;
    if (destinationCep) msg += `*CEP:* ${destinationCep}\n`;
    msg += `\n*ITENS COMPRADOS:*\n${itemsText}\n\n`;
    msg += `*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
    if (discountValue > 0) {
      msg += `*Desconto (${appliedCoupon?.code}):* -R$ ${discountValue.toFixed(2)}\n`;
    }
    msg += `*Frete/Envio:* ${activeShippingFee === 0 ? (deliveryType === 'RETIRADA' ? 'Grátis (Retirada)' : 'FRETE GRÁTIS 🎉') : `R$ ${activeShippingFee.toFixed(2)}`}\n`;
    msg += `*TOTAL:* *R$ ${total.toFixed(2)}*\n`;
    
    if (isPaidConfirmed) {
      msg += `*Forma de Pagamento:* 🟢 PIX (PAGO E CONFIRMADO AUTOMATICAMENTE)`;
    } else if (paymentMethod === 'PIX') {
      msg += `*Forma de Pagamento:* 🟡 PIX Dinâmico (Aguardando Confirmação)`;
    } else {
      msg += `*Forma de Pagamento:* ${paymentMethod}`;
    }

    if (tenant.custom_message) {
      msg += `\n\n📌 _${tenant.custom_message}_`;
    }

    const cleanWhatsapp = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
    if (cleanWhatsapp) {
      window.open(`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  // CÁLCULOS GERAIS E FRETE
  const primaryColor = tenant?.primary_color || '#FF8C00';
  const btnTextColor = tenant?.button_text_color || '#FFFFFF';
  const bgColor = tenant?.background_color || tenant?.secondary_color || '#090D16';
  const cardColor = tenant?.card_color || '#111827';
  const textColor = tenant?.text_color || '#FFFFFF';

  const shippingMode = tenant?.shipping_mode || 'local';
  const freeThreshold = Number(tenant?.free_shipping_threshold ?? 0.00);
  const allowPickup = tenant?.enable_pickup ?? true;

  const selectedNeighborhood = neighborhoods.find(n => String(n.id) === String(selectedNeighId));
  const localShippingFee = selectedNeighborhood ? Number(selectedNeighborhood.fee) : 0;

  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
  const isFreeShipping = freeThreshold > 0 && subtotal >= freeThreshold;

  let activeShippingFee = 0;
  if (deliveryType === 'RETIRADA') {
    activeShippingFee = 0;
  } else if (shippingMode === 'local' || (shippingMode === 'hybrid' && hybridOption === 'bairro')) {
    activeShippingFee = isFreeShipping ? 0 : localShippingFee;
  } else if (shippingMode === 'national' || (shippingMode === 'hybrid' && hybridOption === 'cep')) {
    activeShippingFee = isFreeShipping ? 0 : (selectedShippingOption ? selectedShippingOption.fee : 0);
  }

  let discountValue = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discount_type === 'percent') {
      discountValue = (subtotal * Number(appliedCoupon.discount_value)) / 100;
    } else {
      discountValue = Number(appliedCoupon.discount_value);
    }
    if (discountValue > subtotal) discountValue = subtotal;
  }

  const total = Math.max(0, subtotal - discountValue + activeShippingFee);

  const promoProductsCount = products.filter(p => p.original_price && Number(p.original_price) > Number(p.price)).length;
  
  const filteredProducts = selectedCat === 'ALL' 
    ? products 
    : (selectedCat === 'OFFERS' 
        ? products.filter(p => p.original_price && Number(p.original_price) > Number(p.price))
        : products.filter(p => String(p.category_id) === String(selectedCat))
      );

  const promoBannerList = tenant?.promo_banners ? tenant.promo_banners.split(',').map(b => b.trim()).filter(Boolean) : [];

  const handleFinishOrder = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return alert("Seu carrinho está vazio!");
    if (!customerName || !customerPhone) return alert("Preencha seu Nome e WhatsApp!");
    if (!tenant || !tenant.id) return alert("Erro: Dados da loja não carregados corretamente.");

    if (deliveryType === 'ENTREGA') {
      if (!customerAddress) return alert("Preencha seu Endereço para entrega!");

      if (shippingMode === 'local' || (shippingMode === 'hybrid' && hybridOption === 'bairro')) {
        if (neighborhoods.length > 0 && !selectedNeighId) {
          return alert("Por favor, selecione seu Bairro de entrega!");
        }
      }

      if (shippingMode === 'national' || (shippingMode === 'hybrid' && hybridOption === 'cep')) {
        if (!selectedShippingOption) {
          return alert("Por favor, informe seu CEP e selecione uma opção de envio!");
        }
      }
    }

    setIsSubmitting(true);

    let shippingLabel = 'Retirar na Loja';
    if (deliveryType === 'ENTREGA') {
      if (shippingMode === 'local' || (shippingMode === 'hybrid' && hybridOption === 'bairro')) {
        shippingLabel = selectedNeighborhood ? `Bairro: ${selectedNeighborhood.name}` : 'Entrega Local';
      } else if (selectedShippingOption) {
        shippingLabel = `${selectedShippingOption.name} (${selectedShippingOption.time})`;
      } else {
        shippingLabel = 'Entrega Padrão';
      }
      if (isFreeShipping) shippingLabel += ' [Frete Grátis]';
    }

    const orderPayload = {
      tenant_id: tenant.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      address: deliveryType === 'ENTREGA' ? customerAddress : 'Retirada na Loja',
      neighborhood: shippingLabel,
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
      delivery_fee: Number(activeShippingFee.toFixed(2)),
      total: Number(total.toFixed(2)),
      payment_method: paymentMethod,
      status: 'recebido',
      is_paid: false
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

    saveOrderIdToLocal(insertedOrder.id);
    setCurrentOrderId(insertedOrder.id);
    setCurrentOrderPayload({ ...orderPayload, shippingLabel });

    if (window.fbq) {
      window.fbq('track', 'Purchase', { value: total, currency: 'BRL' });
    }

    const isPixDynamic = paymentMethod === 'PIX' && tenant.pix_enabled && tenant.pix_access_token;

    if (isPixDynamic) {
      try {
        const mpRes = await fetch('/api/create-pix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Number(total.toFixed(2)),
            description: `Pedido #${insertedOrder.id} - ${tenant.name}`,
            accessToken: tenant.pix_access_token,
            orderId: insertedOrder.id,
            payer: {
              email: `${customerPhone.replace(/\D/g, '') || 'cliente'}@sac.com`,
              name: customerName
            }
          })
        });

        const mpData = await mpRes.json();

        if (mpRes.ok && mpData.qr_code_base64) {
          setPixQrCodeBase64(mpData.qr_code_base64);
          setPixCopyPaste(mpData.qr_code);
          setPixPaymentId(mpData.id);
          setPixStatus('pending');
          setShowPixModal(true);
          setShowCartModal(false);
          setIsSubmitting(false);
          return;
        } else {
          alert(`⚠️ Não foi possível gerar o PIX:\n${mpData.error || 'Verifique se o Access Token está correto no painel.'}`);
          setIsSubmitting(false);
          return;
        }
      } catch (err) {
        console.error("Erro na rota interna do PIX:", err);
        alert("Ocorreu um erro de conexão ao tentar gerar o PIX.");
        setIsSubmitting(false);
        return;
      }
    }

    const isCardPayment = paymentMethod.includes('Cartão') && tenant.pix_access_token;

    if (isCardPayment) {
      try {
        const prefRes = await fetch('/api/create-preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cart.map(i => ({ name: i.name, quantity: i.quantity, price: Number(i.price) })),
            accessToken: tenant.pix_access_token,
            orderId: insertedOrder.id,
            tenantName: tenant.name,
            customerName: customerName,
            customerPhone: customerPhone
          })
        });

        const prefData = await prefRes.json();

        if (prefRes.ok && prefData.init_point) {
          setIsSubmitting(false);
          setCart([]);
          setShowCartModal(false);
          window.location.href = prefData.init_point;
          return;
        } else {
          alert(`⚠️ Não foi possível iniciar o checkout de cartão:\n${prefData.error || 'Verifique as configurações do Mercado Pago no Admin.'}`);
          setIsSubmitting(false);
          return;
        }
      } catch (err) {
        console.error("Erro ao gerar Checkout Pro de cartão:", err);
        alert("Erro de comunicação ao redirecionar para o pagamento.");
        setIsSubmitting(false);
        return;
      }
    }

    sendWhatsAppNotification(insertedOrder, false);
    setIsSubmitting(false);
    setCart([]);
    setShowCartModal(false);
    alert("Pedido registrado com sucesso!");
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando loja...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Loja não encontrada</h1></div>;

  const hasCustomVariations = selectedProduct?.variations_json && Array.isArray(selectedProduct.variations_json) && selectedProduct.variations_json.length > 0;
  const isFashionFallback = !hasCustomVariations && (tenant?.niche === 'fashion' || !tenant?.niche);

  const productGallery = selectedProduct?.images_json && Array.isArray(selectedProduct.images_json) && selectedProduct.images_json.length > 0
    ? selectedProduct.images_json
    : (selectedProduct?.image ? [selectedProduct.image] : []);

  const selectedProductHasPromo = selectedProduct && selectedProduct.original_price && Number(selectedProduct.original_price) > Number(selectedProduct.price);
  const selectedProductSavings = selectedProductHasPromo ? (Number(selectedProduct.original_price) - Number(selectedProduct.price)) : 0;

  return (
    <div className="min-h-screen font-sans pb-24 max-w-md mx-auto transition-colors duration-300" style={{ backgroundColor: bgColor, color: textColor }}>
      
      {/* BARRA DE AVISOS E COMUNICADOS (DESTAQUE NO TOPO) */}
      {tenant.custom_message && (
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 text-white text-[11px] font-bold py-2.5 px-4 text-center shadow-md flex items-center justify-center space-x-2">
          <span>📢 {tenant.custom_message}</span>
        </div>
      )}

      {/* CAPA DA LOJA */}
      <div className="relative h-36 bg-gray-900 border-b border-white/10">
        <img src={tenant.banner_url || 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80'} alt="Capa da Loja" className="w-full h-full object-cover opacity-50" />
        
        <div className="absolute top-3 right-3 flex items-center space-x-2 z-10">
          <button
            onClick={handleOpenMyOrders}
            className="bg-gray-900/90 hover:bg-black text-white font-bold text-[10px] px-3 py-1.5 rounded-full border border-white/20 shadow-lg transition flex items-center space-x-1">
            <span>📦 Meus Pedidos</span>
          </button>

          {tenant.instagram_url && (
            <a
              href={tenant.instagram_url.startsWith('http') ? tenant.instagram_url : `https://${tenant.instagram_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white font-bold text-[10px] px-3 py-1.5 rounded-full shadow-lg transition flex items-center space-x-1 hover:opacity-90">
              <span>📸 Instagram</span>
            </a>
          )}
        </div>

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

      {/* CATEGORIAS + ABA DE PROMOÇÕES */}
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
            <span className="text-xs font-bold">R$ {total.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* MODAL MEUS PEDIDOS */}
      {showMyOrdersModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div style={{ backgroundColor: cardColor, color: textColor }} className="border border-white/10 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm" style={{ color: primaryColor }}>📦 Meus Pedidos Recentes</h3>
              <button onClick={() => setShowMyOrdersModal(false)} className="opacity-60 font-bold text-xs">✕ Fechar</button>
            </div>

            {loadingMyOrders ? (
              <p className="text-xs text-gray-400 text-center py-6">Carregando seus pedidos...</p>
            ) : myOrdersList.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <span className="text-3xl block">🛍️</span>
                <p className="text-xs text-gray-400 font-bold">Nenhum pedido encontrado neste dispositivo.</p>
                <p className="text-[10px] text-gray-500">Seus pedidos recentes aparecerão aqui automaticamente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myOrdersList.map(ord => {
                  const isPaid = ord.is_paid || ord.payment_method?.includes('PAGO');
                  return (
                    <div key={ord.id} style={{ backgroundColor: bgColor }} className="p-3.5 rounded-xl border border-white/10 space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-white block">PEDIDO #{ord.id}</span>
                          <span className="text-[10px] text-gray-400 block">{new Date(ord.created_at || Date.now()).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${
                          isPaid ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                        }`}>
                          {isPaid ? '🟢 PAGO' : '🟡 PENDENTE'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <span className="font-bold text-white">Total: R$ {Number(ord.total).toFixed(2)}</span>
                        <button
                          onClick={() => {
                            setShowMyOrdersModal(false);
                            router.push(`/${slug}/pedido/${ord.id}`);
                          }}
                          style={{ backgroundColor: primaryColor, color: btnTextColor }}
                          className="px-3 py-1.5 rounded-lg font-bold text-[10px] transition shadow">
                          🔎 Acompanhar Pedido
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

      {/* MODAL DO CARRINHO & CHECKOUT (FRETE E BAIRROS DESCOMPLICADOS) */}
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

            <form onSubmit={handleApplyCoupon} className="pt-2 border-t border-white/10 space-y-1.5">
              <label className="text-[11px] opacity-70 block">🎟️ Possui um Cupom de Desconto?</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Ex: PRIMEIRA10"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  style={{ backgroundColor: bgColor, color: textColor }}
                  className="flex-1 uppercase border border-white/10 p-2 rounded-xl text-xs focus:outline-none"
                />
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor, color: btnTextColor }}
                  className="px-3 py-2 rounded-xl text-xs font-bold transition">
                  Aplicar
                </button>
              </div>
              {couponMessage.text && (
                <p className={`text-[10px] font-bold ${couponMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {couponMessage.text}
                </p>
              )}
            </form>

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
                  🛵 Entrega {isFreeShipping ? '(GRÁTIS)' : ''}
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

              {deliveryType === 'ENTREGA' && (
                <>
                  {/* ALTERNADOR EXCLUSIVO PARA MODO HÍBRIDO */}
                  {shippingMode === 'hybrid' && (
                    <div className="flex space-x-2 mb-2 bg-black/40 p-1 rounded-xl border border-white/10">
                      <button
                        type="button"
                        onClick={() => setHybridOption('bairro')}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition ${
                          hybridOption === 'bairro' ? 'bg-orange-500 text-white shadow' : 'text-gray-400 hover:text-white'
                        }`}>
                        🛵 Entrega por Bairro
                      </button>
                      <button
                        type="button"
                        onClick={() => setHybridOption('cep')}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition ${
                          hybridOption === 'cep' ? 'bg-orange-500 text-white shadow' : 'text-gray-400 hover:text-white'
                        }`}>
                        📦 Envio por CEP
                      </button>
                    </div>
                  )}

                  {/* CÁLCULO DE CEP (APENAS QUANDO SELECIONADO CEP OU MODO NACIONAL) */}
                  {(shippingMode === 'national' || (shippingMode === 'hybrid' && hybridOption === 'cep')) && (
                    <div className="space-y-2 p-3 rounded-xl border border-white/10 bg-black/20">
                      <label className="text-[11px] font-bold block text-orange-400">📦 Digite seu CEP para calcular o Frete:</label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          placeholder="Ex: 01001-000"
                          value={destinationCep}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDestinationCep(val);
                            const cleanVal = val.replace(/\D/g, '');

                            if (cleanVal.length === 8) {
                              handleCalculateCep(val);
                            } else {
                              setCalculatedOptions([]);
                              setSelectedShippingOption(null);
                              setCepError('');
                            }
                          }}
                          style={{ backgroundColor: bgColor, color: textColor }}
                          className="flex-1 border border-white/10 p-2 rounded-xl text-xs font-mono focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleCalculateCep()}
                          disabled={isCalculatingCep}
                          style={{ backgroundColor: primaryColor, color: btnTextColor }}
                          className="px-3 py-2 rounded-xl text-xs font-bold transition">
                          {isCalculatingCep ? 'Calculando...' : 'Calcular'}
                        </button>
                      </div>

                      {cepError && <p className="text-[10px] text-red-400 font-bold">{cepError}</p>}

                      {calculatedOptions.length > 0 && (
                        <div className="space-y-1.5 pt-2">
                          <label className="text-[10px] opacity-70 block">Opções de Envio Disponíveis:</label>
                          {calculatedOptions.map(opt => (
                            <label
                              key={opt.id}
                              className={`flex justify-between items-center p-2 rounded-xl border text-xs cursor-pointer transition ${
                                selectedShippingOption?.id === opt.id ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 bg-black/30'
                              }`}>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  name="shippingOption"
                                  checked={selectedShippingOption?.id === opt.id}
                                  onChange={() => setSelectedShippingOption(opt)}
                                  className="accent-orange-500"
                                />
                                <div>
                                  <span className="font-bold block text-white">{opt.name}</span>
                                  <span className="text-[10px] opacity-60">Prazo: {opt.time}</span>
                                </div>
                              </div>
                              <span className="font-bold text-orange-400">
                                {opt.fee === 0 ? 'GRÁTIS' : `R$ ${opt.fee.toFixed(2)}`}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SELEÇÃO DE BAIRROS (APENAS QUANDO MODO LOCAL OU HÍBRIDO BAIRRO) */}
                  {(shippingMode === 'local' || (shippingMode === 'hybrid' && hybridOption === 'bairro')) && (
                    <div>
                      <label className="text-[11px] opacity-70 block mb-1">Selecione seu Bairro de Entrega:</label>
                      <select
                        value={selectedNeighId}
                        onChange={(e) => setSelectedNeighId(e.target.value)}
                        style={{ backgroundColor: bgColor, color: textColor }}
                        className="w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none font-bold">
                        <option value="">-- Selecione seu Bairro --</option>
                        {neighborhoods.map(n => (
                          <option key={n.id} value={n.id}>{n.name} — R$ {Number(n.fee).toFixed(2)}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

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
                  <input type="text" required value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} style={{ backgroundColor: bgColor, color: textColor }} className="w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none" placeholder="Rua, número, complemento, bairro, cidade/UF" />
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
                
                {discountValue > 0 && (
                  <div className="flex justify-between text-green-400 font-bold">
                    <span>Desconto ({appliedCoupon?.code}):</span>
                    <span>-R$ {discountValue.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="opacity-60">Taxa de Frete/Envio:</span>
                  <span>
                    {deliveryType === 'RETIRADA' 
                      ? 'Grátis' 
                      : (isFreeShipping ? '🎉 FRETE GRÁTIS' : `R$ ${activeShippingFee.toFixed(2)}`)}
                  </span>
                </div>

                <div className="flex justify-between font-bold text-sm pt-1 border-t border-white/10">
                  <span style={{ color: primaryColor }}>TOTAL:</span>
                  <span style={{ color: primaryColor }}>R$ {total.toFixed(2)}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{ backgroundColor: primaryColor, color: btnTextColor }}
                className="w-full font-bold py-3.5 rounded-xl text-xs shadow-lg transition hover:opacity-90">
                {isSubmitting ? 'Gerando Pagamento...' : 'Finalizar Pedido 🚀'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PIX DINÂMICO */}
      {showPixModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div style={{ backgroundColor: cardColor, color: textColor }} className="border border-green-500/40 w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl text-center relative overflow-hidden">
            
            <div className="space-y-1">
              <span className="text-2xl block">⚡</span>
              <h3 className="font-extrabold text-base text-green-400">Pagamento via PIX Dinâmico</h3>
              <p className="text-[11px] opacity-70">Escaneie o QR Code ou copie a chave para pagar no app do seu banco.</p>
            </div>

            {pixStatus === 'approved' ? (
              <div className="bg-green-500/20 border border-green-500/50 p-3 rounded-2xl space-y-1 animate-bounce">
                <span className="text-xl">✅</span>
                <p className="font-extrabold text-xs text-green-400">PAGAMENTO CONFIRMADO COM SUCESSO!</p>
                <p className="text-[10px] text-gray-300">Seu pedido já foi baixado automaticamente no sistema.</p>
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/30 p-2.5 rounded-2xl flex items-center justify-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping"></span>
                <span className="text-xs font-bold text-yellow-400">Aguardando pagamento no banco...</span>
              </div>
            )}

            {pixQrCodeBase64 && (
              <div className="bg-white p-3 rounded-2xl inline-block shadow-lg mx-auto border border-gray-200">
                <img 
                  src={`data:image/jpeg;base64,${pixQrCodeBase64}`} 
                  alt="QR Code PIX Mercado Pago" 
                  className="w-44 h-44 object-contain mx-auto" 
                />
              </div>
            )}

            <div className="space-y-2">
              <span className="text-xs text-gray-400 block font-bold">Valor Total: <b className="text-green-400 text-sm">R$ {total.toFixed(2)}</b></span>
              
              <button
                type="button"
                onClick={copyPixCode}
                className={`w-full font-bold py-3 rounded-xl text-xs border transition flex items-center justify-center space-x-2 ${
                  pixCopySuccess ? 'bg-green-600 text-white border-green-500' : 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'
                }`}>
                <span>{pixCopySuccess ? '✓ Chave Copiada!' : '📋 Copiar Chave PIX (Copia e Cola)'}</span>
              </button>
            </div>

            <div className="pt-2 border-t border-white/10 space-y-2">
              <button
                type="button"
                onClick={() => {
                  sendWhatsAppNotification({ id: currentOrderId }, pixStatus === 'approved');
                  setShowPixModal(false);
                  setCart([]);
                }}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-extrabold py-3.5 rounded-xl text-xs transition shadow-lg flex items-center justify-center space-x-2">
                <span>💬 Enviar Confirmação no WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowPixModal(false);
                  setCart([]);
                }}
                className="text-[11px] opacity-60 hover:opacity-100 font-bold block mx-auto pt-1">
                Fechar Janela
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
