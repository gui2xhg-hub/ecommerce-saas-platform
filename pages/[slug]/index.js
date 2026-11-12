import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import {
  getStoreMode, getRentalSettings, countRentalDays, validateRentalDates, computeRentalUnitPrice, displayDailyPrice,
  hasRentalPromo, computeDeposit, computeDownPayment, formatBRL, num, round2, onlyDigits,
  isValidCPF, isValidCNPJ, formatDocument, getPeriods
} from '../../lib/rental';
import {
  RentalDateBar, AvailabilityBadge, CompanyAccessModal, TermsModal, buildRentalStoreMessage,
  loadSavedRentalCustomer, saveRentalCustomer, refreshRentalCustomer
} from '../../components/rental/StoreRental';

export default function EcommerceCliente() {
  const router = useRouter();
  const { slug } = router.query;

  const [tenant, setTenant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [selectedCat, setSelectedCat] = useState('ALL');
  const [loading, setLoading] = useState(true);

  // CARROSSEL DE BANNERS PROMOCIONAIS
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  // LISTA DE TAMANHOS DE ROUPA PADRÃO (FALLBACK)
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

  // ===== MÓDULO LOCAÇÃO (só aparece quando a loja está em modo Aluguel ou Venda + Aluguel) =====
  const [rentalStart, setRentalStart] = useState('');
  const [rentalEnd, setRentalEnd] = useState('');
  const [availability, setAvailability] = useState({});
  const [availabilityTick, setAvailabilityTick] = useState(0);
  const [buyMode, setBuyMode] = useState('venda'); // 'venda' | 'aluguel' no modal do produto
  const [rentalCustomer, setRentalCustomer] = useState(null); // empresa/cliente aprovado (tabela de preço)
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [customerDocument, setCustomerDocument] = useState('');
  const [customerType, setCustomerType] = useState('PF');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [wantAssembly, setWantAssembly] = useState(false);
  const [rentalNotes, setRentalNotes] = useState('');

  const storeMode = getStoreMode(tenant);
  const rentalOn = storeMode !== 'venda';
  const rentalSettings = getRentalSettings(tenant);
  const rentalDays = countRentalDays(rentalStart, rentalEnd, rentalSettings.day_count_mode);
  const rentalDateError = rentalStart && rentalEnd ? validateRentalDates(rentalSettings, rentalStart, rentalEnd) : '';
  const rentalDiscount = rentalCustomer?.table ? num(rentalCustomer.table.discount_percent) : 0;
  const saleDiscount = rentalCustomer?.table?.applies_to_sales ? rentalDiscount : 0;
  const isRentalCart = cart.length > 0 && cart[0].type === 'aluguel';
  const canRent = (p) => rentalOn && !!p?.rental_enabled;
  const canBuy = (p) => storeMode === 'venda' || (storeMode === 'ambos' && p?.sale_enabled !== false);

  // DISPONIBILIDADE DOS ITENS NAS DATAS ESCOLHIDAS
  useEffect(() => {
    if (!tenant?.id || !rentalOn || !rentalStart || !rentalEnd || rentalDateError) {
      setAvailability({});
      return;
    }
    let cancelled = false;
    supabase
      .rpc('rental_availability', { p_tenant_id: String(tenant.id), p_start: rentalStart, p_end: rentalEnd })
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map = {};
        data.forEach((r) => { map[String(r.product_id)] = r; });
        setAvailability(map);
      });
    return () => { cancelled = true; };
  }, [tenant?.id, rentalOn, rentalStart, rentalEnd, rentalDateError, availabilityTick]);

  // PREENCHE O DOCUMENTO DO CLIENTE IDENTIFICADO (EMPRESA/CNPJ)
  useEffect(() => {
    if (rentalCustomer) {
      setCustomerDocument(formatDocument(rentalCustomer.document));
      setCustomerType(rentalCustomer.customer_type || (onlyDigits(rentalCustomer.document).length === 14 ? 'PJ' : 'PF'));
      if (!customerName) setCustomerName(rentalCustomer.company_name || rentalCustomer.name || '');
      if (!customerPhone) setCustomerPhone(rentalCustomer.phone || '');
    }
  }, [rentalCustomer]);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantData();
    }
  }, [router.isReady, slug]);

  // POLLING DE MONITORAMENTO EM TEMPO REAL DO PIX DINÂMICO
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
              const isPartialRental = currentOrderPayload?.order_type === 'aluguel' && num(currentOrderPayload?.down_payment_value) < num(currentOrderPayload?.total);
              await supabase.from('orders').update(isPartialRental ? { payment_method: 'PIX (sinal pago)' } : { is_paid: true }).eq('id', currentOrderId);
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
  }, [showPixModal, pixPaymentId, pixStatus, tenant, currentOrderId, currentOrderPayload]);

  // CARROSSEL AUTOMÁTICO DE BANNERS
  const promoBannerList = tenant?.promo_banners ? tenant.promo_banners.split(',').map(b => b.trim()).filter(Boolean) : [];

  useEffect(() => {
    if (promoBannerList.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % promoBannerList.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [promoBannerList.length]);

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

      // Empresa/cliente já identificado neste aparelho: confere se continua aprovado
      if (tData.rental_module_enabled) {
        const saved = loadSavedRentalCustomer(tData.id);
        if (saved) {
          refreshRentalCustomer(tData.id, saved).then((c) => {
            if (c) setRentalCustomer(c);
            else saveRentalCustomer(tData.id, null);
          });
        }
      }
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
    const rentable = canRent(product);
    const buyable = canBuy(product);
    const startAsRental = rentable && (!buyable || isRentalCart || (cart.length === 0 && storeMode === 'aluguel'));
    setBuyMode(startAsRental ? 'aluguel' : 'venda');

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
    } else if (!product.is_digital && !canRent(product) && (tenant?.niche === 'fashion' || !tenant?.niche)) {
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

    // ----- LOCAÇÃO -----
    if (buyMode === 'aluguel') {
      if (!rentalStart || !rentalEnd) return alert('📅 Escolha a data de retirada e a de devolução.');
      if (rentalDateError) return alert(rentalDateError);
      const minDays = Math.max(1, parseInt(selectedProduct.rental_min_days, 10) || 1);
      if (rentalDays < minDays) return alert(`Este item precisa de no mínimo ${minDays} dia(s) de locação.`);
      const priceInfo = computeRentalUnitPrice(selectedProduct, rentalDays, rentalDiscount);
      if (!priceInfo.available) return alert('Este item não tem preço de locação para esse período. Fale com a loja.');
      const info = availability[String(selectedProduct.id)];
      const alreadyInCart = cart.filter((i) => i.id === selectedProduct.id && i.type === 'aluguel').reduce((a, b) => a + b.quantity, 0);
      if (info && info.available !== null && info.available !== undefined && productQuantity + alreadyInCart > info.available) {
        return alert(info.available - alreadyInCart > 0 ? `Só há ${info.available - alreadyInCart} unidade(s) disponível(is) nessas datas.` : 'Item indisponível nessas datas.');
      }
      if (cart.length > 0 && !isRentalCart) {
        if (!confirm('Seu carrinho tem itens de COMPRA. Para alugar, finalize a compra antes ou esvazie o carrinho.\n\nEsvaziar o carrinho e continuar com a locação?')) return;
      }
      const rentalItem = {
        cartItemId: `R-${selectedProduct.id}-${JSON.stringify(selectedVariations)}-${Date.now()}`,
        id: selectedProduct.id,
        type: 'aluguel',
        name: selectedProduct.name,
        variations: selectedVariations,
        variationsText,
        price: priceInfo.unit,
        quantity: productQuantity,
        note: productNote,
        image: activeImage || selectedProduct.image,
        is_digital: false,
        download_url: '',
        replacement_value: num(selectedProduct.replacement_value),
        rental_min_days: minDays
      };
      setCart(cart.length > 0 && !isRentalCart ? [rentalItem] : [...cart, rentalItem]);
      setSelectedProduct(null);
      return;
    }

    if (isRentalCart) {
      if (!confirm('Seu carrinho tem itens de LOCAÇÃO. Para comprar, finalize a reserva antes ou esvazie o carrinho.\n\nEsvaziar o carrinho e continuar com a compra?')) return;
    }

    const cartItem = {
      cartItemId: `${selectedProduct.id}-${JSON.stringify(selectedVariations)}-${Date.now()}`,
      id: selectedProduct.id,
      name: selectedProduct.name,
      variations: selectedVariations,
      variationsText: variationsText,
      price: Number(selectedProduct.price),
      base_price: Number(selectedProduct.price),
      quantity: productQuantity,
      note: productNote,
      image: activeImage || selectedProduct.image,
      is_digital: selectedProduct.is_digital || false,
      download_url: selectedProduct.download_url || ''
    };

    setCart(isRentalCart ? [cartItem] : [...cart, cartItem]);
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
        if (item.is_digital) return acc;
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

  // VERIFICA SE O CARRINHO É 100% DIGITAL
  const isAllDigital = cart.length > 0 && cart.every(item => item.is_digital);

  const sendWhatsAppNotification = (orderObj, isPaidConfirmed = false) => {
    if (isRentalCart) {
      const rentalMsg = buildRentalStoreMessage({
        tenant, orderId: orderObj?.id, customerName, customerPhone, customerDocument,
        items: pricedCart, start: rentalStart, end: rentalEnd, days: rentalDays,
        deliveryLabel: rentalDeliveryType === 'ENTREGA' ? 'Entrega' : 'Retirada na loja',
        address: rentalDeliveryType === 'ENTREGA' ? `${customerAddress}${selectedNeighborhood ? ` (${selectedNeighborhood.name})` : ''}` : '',
        deliveryTime, returnTime, subtotal, discount: discountValue, couponCode: appliedCoupon?.code,
        deliveryFee: activeShippingFee, assemblyFee, total, downPayment: rentalAmountNow, deposit: rentalDeposit,
        payment: paymentMethod, tableName: rentalCustomer?.table?.name, notes: rentalNotes, paid: isPaidConfirmed
      });
      const wa = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
      if (wa) window.open(`https://wa.me/${wa}?text=${encodeURIComponent(rentalMsg)}`, '_blank');
      return;
    }
    let orderTag = orderObj?.id ? ` #${orderObj.id}` : '';
    let itemsText = pricedCart.map(i => {
      let varStr = i.variationsText ? ` [${i.variationsText}]` : '';
      let digitalStr = i.is_digital ? ' ⚡ (Produto Digital)' : '';
      let txt = `• ${i.quantity}x ${i.name}${varStr}${digitalStr} (R$ ${(Number(i.price) * i.quantity).toFixed(2)})`;
      if (i.note) txt += `\n    Obs: _"${i.note}"_`;
      return txt;
    }).join('\n\n');

    let msg = `*NOVA COMPRA NA LOJA${orderTag} - ${tenant.name.toUpperCase()}*\n\n`;
    msg += `*Cliente:* ${customerName}\n*Telefone:* ${customerPhone}\n`;

    if (isAllDigital) {
      msg += `*Tipo de Envio:* ⚡ Envio Digital (Download / Acesso Direto)\n`;
    } else {
      msg += `*Tipo de Envio:* ${deliveryType === 'ENTREGA' ? `Entrega em: ${customerAddress} (${currentOrderPayload?.shippingLabel || ''})` : 'Retirar na Loja'}\n`;
      if (destinationCep) msg += `*CEP:* ${destinationCep}\n`;
    }

    msg += `\n*ITENS COMPRADOS:*\n${itemsText}\n\n`;
    msg += `*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
    if (discountValue > 0) {
      msg += `*Desconto (${appliedCoupon?.code}):* -R$ ${discountValue.toFixed(2)}\n`;
    }
    
    if (isAllDigital) {
      msg += `*Frete/Envio:* Sem frete (Produto Digital)\n`;
    } else {
      msg += `*Frete/Envio:* ${activeShippingFee === 0 ? (deliveryType === 'RETIRADA' ? 'Grátis (Retirada)' : 'FRETE GRÁTIS 🎉') : `R$ ${activeShippingFee.toFixed(2)}`}\n`;
    }

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

  // PREÇO DE CADA ITEM: locação recalcula pelo período; tabela de preço (CNPJ) aplica o desconto
  const pricedCart = cart.map((item) => {
    if (item.type === 'aluguel') {
      const prod = products.find((pp) => pp.id === item.id) || {};
      const info = computeRentalUnitPrice(prod, rentalDays || 1, rentalDiscount);
      return { ...item, price: info.available ? info.unit : 0, price_label: info.label, rental_ok: info.available };
    }
    if (saleDiscount > 0) {
      const base = Number(item.base_price ?? item.price);
      return { ...item, price: round2(base * (1 - saleDiscount / 100)) };
    }
    return item;
  });

  const subtotal = pricedCart.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
  const isFreeShipping = freeThreshold > 0 && subtotal >= freeThreshold;

  // ENTREGA DA LOCAÇÃO: usa as taxas por bairro; respeita o que a loja liberou
  const rentalDeliveryType = !rentalSettings.allow_delivery ? 'RETIRADA' : (!rentalSettings.allow_pickup ? 'ENTREGA' : deliveryType);

  let activeShippingFee = 0;
  if (isRentalCart) {
    activeShippingFee = rentalDeliveryType === 'RETIRADA' ? 0 : localShippingFee;
  } else if (isAllDigital) {
    activeShippingFee = 0;
  } else if (deliveryType === 'RETIRADA') {
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

  const assemblyFee = isRentalCart && rentalSettings.allow_assembly && wantAssembly ? num(rentalSettings.assembly_fee) : 0;
  const total = Math.max(0, subtotal - discountValue + activeShippingFee + assemblyFee);
  const rentalDeposit = isRentalCart ? computeDeposit(rentalSettings, pricedCart, subtotal) : 0;
  const rentalAmountNow = isRentalCart ? computeDownPayment(rentalSettings, total) : total;

  // Modo venda: todos os produtos (como sempre). Modo aluguel/ambos: conforme marcado em cada produto.
  const visibleProducts = storeMode === 'venda'
    ? products
    : products.filter(p => canRent(p) || canBuy(p));
  const isOnPromo = (p) => (canBuy(p) && p.original_price && Number(p.original_price) > Number(p.price)) || (canRent(p) && hasRentalPromo(p));

  const promoProductsCount = visibleProducts.filter(isOnPromo).length;
  
  const filteredProducts = selectedCat === 'ALL' 
    ? visibleProducts 
    : (selectedCat === 'OFFERS' 
        ? visibleProducts.filter(isOnPromo)
        : visibleProducts.filter(p => String(p.category_id) === String(selectedCat))
      );

  // =====================================================================
  // FINALIZAR RESERVA DE LOCAÇÃO
  // =====================================================================
  const handleFinishRentalOrder = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (cart.length === 0) return alert("Sua reserva está vazia!");
    if (!rentalStart || !rentalEnd) return alert("📅 Escolha a data de retirada e a de devolução.");
    if (rentalDateError) return alert(rentalDateError);
    const tooShort = pricedCart.find(i => rentalDays < (i.rental_min_days || 1));
    if (tooShort) return alert(`"${tooShort.name}" precisa de no mínimo ${tooShort.rental_min_days} dia(s).`);
    const noPrice = pricedCart.find(i => !i.rental_ok);
    if (noPrice) return alert(`"${noPrice.name}" não tem preço de locação para ${rentalDays} dia(s). Remova o item ou fale com a loja.`);
    const qtyById = {};
    pricedCart.forEach(i => { qtyById[i.id] = (qtyById[i.id] || 0) + i.quantity; });
    const short = Object.entries(qtyById).find(([id, q]) => { const a = availability[String(id)]; return a && a.available !== null && a.available !== undefined && q > a.available; });
    if (short) {
      const prodName = pricedCart.find(i => String(i.id) === String(short[0]))?.name;
      return alert(`"${prodName}" tem só ${availability[String(short[0])].available} unidade(s) disponível(is) nessas datas.`);
    }
    if (!customerName || onlyDigits(customerPhone).length < 10) return alert("Preencha seu nome e WhatsApp com DDD!");
    const docDigits = onlyDigits(customerDocument);
    if (rentalSettings.require_document) {
      const okDoc = customerType === 'PJ' ? isValidCNPJ(docDigits) : isValidCPF(docDigits);
      if (!okDoc) return alert(`Informe um ${customerType === 'PJ' ? 'CNPJ' : 'CPF'} válido.`);
    }
    if (rentalDeliveryType === 'ENTREGA') {
      if (!customerAddress) return alert("Preencha o endereço de entrega!");
      if (neighborhoods.length > 0 && !selectedNeighId) return alert("Selecione o bairro de entrega!");
    }
    if (rentalSettings.require_terms && !termsAccepted) return alert("Leia e aceite o termo de locação para continuar.");

    setIsSubmitting(true);

    const shippingLabel = rentalDeliveryType === 'RETIRADA'
      ? 'Retirar na Loja'
      : (selectedNeighborhood ? `Bairro: ${selectedNeighborhood.name}` : 'Entrega');

    const orderPayload = {
      tenant_id: tenant.id,
      customer_name: customerName,
      customer_phone: customerPhone,
      address: rentalDeliveryType === 'ENTREGA' ? customerAddress : 'Retirada na Loja',
      neighborhood: shippingLabel + (assemblyFee > 0 ? ' + Montagem' : ''),
      items: pricedCart.map(i => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        price: Number(i.price),
        size: i.variationsText || 'Padrão',
        variationsText: i.variationsText || '',
        note: i.note || '',
        is_digital: false,
        download_url: '',
        rental: true,
        price_label: i.price_label || '',
        replacement_value: num(i.replacement_value)
      })),
      subtotal: Number(subtotal.toFixed(2)),
      delivery_fee: Number((activeShippingFee + assemblyFee).toFixed(2)),
      total: Number(total.toFixed(2)),
      payment_method: paymentMethod,
      status: 'recebido',
      is_paid: false,
      order_type: 'aluguel',
      rental_start: rentalStart,
      rental_end: rentalEnd,
      rental_days: rentalDays,
      rental_status: 'reservado',
      deposit_value: rentalDeposit,
      deposit_status: rentalDeposit > 0 ? 'pendente' : null,
      down_payment_value: Number(rentalAmountNow.toFixed(2)),
      customer_document: docDigits,
      customer_type: customerType,
      rental_customer_id: rentalCustomer?.id || null,
      price_table_name: rentalCustomer?.table?.name || null,
      price_table_discount: rentalDiscount,
      terms_accepted_at: rentalSettings.require_terms ? new Date().toISOString() : null,
      delivery_time: deliveryTime,
      return_time: returnTime,
      rental_notes: rentalNotes
    };

    // Grava conferindo o estoque no banco (trava contra duas reservas ao mesmo tempo)
    const { data: insertedOrder, error: insertErr } = await supabase.rpc('create_rental_order', { p_order: orderPayload });

    if (insertErr || !insertedOrder) {
      const msg = String(insertErr?.message || 'Erro desconhecido');
      setAvailabilityTick(t => t + 1);
      setIsSubmitting(false);
      if (msg.includes('SEM_ESTOQUE') || msg.includes('DADOS_INVALIDOS')) return alert('⚠️ ' + msg.replace(/^(SEM_ESTOQUE|DADOS_INVALIDOS):\s*/, ''));
      return alert("⚠️ Erro ao salvar a reserva:\n" + msg);
    }

    saveOrderIdToLocal(insertedOrder.id);
    setCurrentOrderId(insertedOrder.id);
    setCurrentOrderPayload({ ...orderPayload, shippingLabel });

    if (window.fbq) {
      window.fbq('track', 'Purchase', { value: total, currency: 'BRL' });
    }

    // WhatsApp automático (se a loja configurou a API). Sem API, abrimos o WhatsApp da loja como sempre.
    let storeNotifiedByApi = false;
    try {
      const waRes = await fetch('/api/rental-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', tenant_id: tenant.id, order_id: insertedOrder.id, event: 'pedido_recebido' })
      });
      const waData = await waRes.json();
      storeNotifiedByApi = !!(waData && waData.sent && waData.store_sent);
    } catch (err) {
      console.error('WhatsApp automático indisponível:', err);
    }

    const isPartial = rentalAmountNow < total;
    const payDescription = `Reserva #${insertedOrder.id}${isPartial ? ' (sinal)' : ''} - ${tenant.name}`;

    if (paymentMethod === 'PIX' && tenant.pix_enabled && tenant.pix_access_token) {
      try {
        const mpRes = await fetch('/api/create-pix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Number(rentalAmountNow.toFixed(2)),
            description: payDescription,
            accessToken: tenant.pix_access_token,
            orderId: insertedOrder.id,
            payer: { email: `${onlyDigits(customerPhone) || 'cliente'}@sac.com`, name: customerName }
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
        }
        alert(`⚠️ Sua reserva #${insertedOrder.id} foi registrada, mas não foi possível gerar o PIX:\n${mpData.error || 'Fale com a loja.'}`);
      } catch (err) {
        alert(`⚠️ Sua reserva #${insertedOrder.id} foi registrada, mas houve erro ao gerar o PIX. Fale com a loja.`);
      }
    } else if (paymentMethod.includes('Cartão') && tenant.pix_access_token) {
      try {
        const prefRes = await fetch('/api/create-preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ name: payDescription, quantity: 1, price: Number(rentalAmountNow.toFixed(2)) }],
            accessToken: tenant.pix_access_token,
            orderId: insertedOrder.id,
            tenantName: tenant.name,
            customerName,
            customerPhone
          })
        });
        const prefData = await prefRes.json();
        if (prefRes.ok && prefData.init_point) {
          if (!storeNotifiedByApi) sendWhatsAppNotification(insertedOrder, false);
          setIsSubmitting(false);
          setCart([]);
          setShowCartModal(false);
          window.location.href = prefData.init_point;
          return;
        }
        alert(`⚠️ Sua reserva #${insertedOrder.id} foi registrada, mas não foi possível abrir o pagamento com cartão:\n${prefData.error || 'Fale com a loja.'}`);
      } catch (err) {
        alert(`⚠️ Sua reserva #${insertedOrder.id} foi registrada, mas houve erro ao abrir o pagamento. Fale com a loja.`);
      }
    }

    if (!storeNotifiedByApi) sendWhatsAppNotification(insertedOrder, false);
    setIsSubmitting(false);
    setCart([]);
    setShowCartModal(false);
    setTermsAccepted(false);
    alert(`✅ Reserva #${insertedOrder.id} registrada com sucesso!`);
    router.push(`/${slug}/pedido/${insertedOrder.id}`);
  };

  const handleFinishOrder = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return alert("Seu carrinho está vazio!");
    if (!customerName || !customerPhone) return alert("Preencha seu Nome e WhatsApp!");
    if (!tenant || !tenant.id) return alert("Erro: Dados da loja não carregados corretamente.");

    if (!isAllDigital && deliveryType === 'ENTREGA') {
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

    let shippingLabel = 'Envio Digital (Download)';
    if (!isAllDigital) {
      if (deliveryType === 'RETIRADA') {
        shippingLabel = 'Retirar na Loja';
      } else if (shippingMode === 'local' || (shippingMode === 'hybrid' && hybridOption === 'bairro')) {
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
      address: isAllDigital ? '⚡ Produto Digital - Envio via WhatsApp / Download' : (deliveryType === 'ENTREGA' ? customerAddress : 'Retirada na Loja'),
      neighborhood: shippingLabel,
      items: pricedCart.map(i => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        price: Number(i.price),
        size: i.variations?.Tamanho || i.variationsText || 'Padrão',
        variationsText: i.variationsText || '',
        note: i.note || '',
        is_digital: i.is_digital || false,
        download_url: i.download_url || ''
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
            items: pricedCart.map(i => ({ name: i.name, quantity: i.quantity, price: Number(i.price) })),
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
  const isFashionFallback = buyMode !== 'aluguel' && !canRent(selectedProduct) && !selectedProduct?.is_digital && !hasCustomVariations && (tenant?.niche === 'fashion' || !tenant?.niche);
  const rentalColors = { primary: primaryColor, btnText: btnTextColor, bg: bgColor, card: cardColor, text: textColor };
  const selectedRentalInfo = selectedProduct && buyMode === 'aluguel' ? computeRentalUnitPrice(selectedProduct, rentalDays || 1, rentalDiscount) : null;
  const selectedAvailability = selectedProduct ? availability[String(selectedProduct.id)] : null;
  const modalUnitPrice = buyMode === 'aluguel'
    ? (selectedRentalInfo?.unit || 0)
    : (selectedProduct ? round2(Number(selectedProduct.price) * (1 - saleDiscount / 100)) : 0);

  const productGallery = selectedProduct?.images_json && Array.isArray(selectedProduct.images_json) && selectedProduct.images_json.length > 0
    ? selectedProduct.images_json
    : (selectedProduct?.image ? [selectedProduct.image] : []);

  const selectedProductHasPromo = selectedProduct && selectedProduct.original_price && Number(selectedProduct.original_price) > Number(selectedProduct.price);
  const selectedProductSavings = selectedProductHasPromo ? (Number(selectedProduct.original_price) - Number(selectedProduct.price)) : 0;

  const cleanTenantWhatsapp = tenant?.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';

  // =====================================================================
  // CHECKOUT DA LOCAÇÃO
  // =====================================================================
  const renderRentalCheckout = () => {
    const field = { backgroundColor: bgColor, color: textColor };
    const cls = 'w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none';
    const shortItems = pricedCart.filter(i => { const a = availability[String(i.id)]; return a && a.available !== null && a.available !== undefined && i.quantity > a.available; });
    return (
      <form onSubmit={handleFinishRentalOrder} className="space-y-3 pt-2 border-t border-white/10">
        <RentalDateBar start={rentalStart} end={rentalEnd} onChange={(a, b) => { setRentalStart(a); setRentalEnd(b); }} days={rentalDays} error={rentalDateError} settings={rentalSettings} colors={rentalColors} />
        {shortItems.length > 0 && (
          <div className="text-[11px] text-red-400 font-bold">⚠️ Sem estoque suficiente nessas datas: {shortItems.map(i => i.name).join(', ')}</div>
        )}

        {rentalSettings.allow_delivery && rentalSettings.allow_pickup && (
          <div className="flex space-x-2">
            {[['ENTREGA', '🚚 Entrega'], ['RETIRADA', '🏪 Retirar na Loja']].map(([k, t]) => (
              <button key={k} type="button" onClick={() => setDeliveryType(k)}
                style={{ backgroundColor: rentalDeliveryType === k ? primaryColor : bgColor, color: rentalDeliveryType === k ? btnTextColor : textColor }}
                className="w-1/2 py-2 rounded-xl text-xs font-bold border border-white/10">{t}</button>
            ))}
          </div>
        )}

        {rentalDeliveryType === 'ENTREGA' && (
          <>
            {neighborhoods.length > 0 && (
              <select value={selectedNeighId} onChange={(e) => setSelectedNeighId(e.target.value)} style={field} className={`${cls} font-bold`}>
                <option value="">-- Selecione o bairro de entrega --</option>
                {neighborhoods.map(n => <option key={n.id} value={n.id}>{n.name} — R$ {Number(n.fee).toFixed(2)}</option>)}
              </select>
            )}
            <input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Endereço completo do evento/entrega" style={field} className={cls} />
          </>
        )}
        {rentalDeliveryType === 'RETIRADA' && <p className="text-[11px] opacity-70">🏪 Você retira e devolve os itens na loja.</p>}

        {rentalSettings.allow_assembly && (
          <label className="flex items-center space-x-2 text-xs cursor-pointer">
            <input type="checkbox" checked={wantAssembly} onChange={(e) => setWantAssembly(e.target.checked)} />
            <span>🛠️ Quero montagem (+ {formatBRL(rentalSettings.assembly_fee)})</span>
          </label>
        )}

        {rentalSettings.ask_times && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] opacity-70 block mb-0.5">Horário {rentalDeliveryType === 'ENTREGA' ? 'da entrega' : 'da retirada'}:</label>
              <input type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} style={field} className={cls} />
            </div>
            <div>
              <label className="text-[10px] opacity-70 block mb-0.5">Horário da devolução:</label>
              <input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} style={field} className={cls} />
            </div>
          </div>
        )}

        <input type="text" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={customerType === 'PJ' ? 'Nome da empresa / responsável' : 'Seu nome'} style={field} className={cls} />
        <input type="text" required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Seu WhatsApp com DDD" style={field} className={cls} />

        {rentalSettings.require_document && (
          <div className="grid grid-cols-3 gap-2">
            <select value={customerType} onChange={(e) => setCustomerType(e.target.value)} style={field} className={cls}>
              <option value="PF">CPF</option>
              <option value="PJ">CNPJ</option>
            </select>
            <input type="text" value={customerDocument} onChange={(e) => setCustomerDocument(e.target.value)} placeholder={customerType === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'} style={field} className={`${cls} col-span-2`} />
          </div>
        )}

        <input type="text" value={rentalNotes} onChange={(e) => setRentalNotes(e.target.value)} placeholder="Observações (tipo de evento, acesso, referência...)" style={field} className={cls} />

        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={field} className={cls}>
          <option value="PIX">PIX</option>
          <option value="Cartão de Crédito">Cartão de Crédito</option>
          <option value="Cartão de Débito">Cartão de Débito</option>
          <option value="Dinheiro">Dinheiro</option>
        </select>

        <div style={{ backgroundColor: bgColor }} className="p-3 rounded-xl border border-white/10 space-y-1 text-xs">
          <div className="flex justify-between"><span className="opacity-60">Locação ({rentalDays || 0} dia(s)):</span><span>{formatBRL(subtotal)}</span></div>
          {rentalDiscount > 0 && <div className="flex justify-between text-green-400 text-[11px]"><span>Tabela {rentalCustomer.table.name}:</span><span>-{rentalDiscount}% já aplicado</span></div>}
          {discountValue > 0 && <div className="flex justify-between text-green-400 font-bold"><span>Desconto ({appliedCoupon?.code}):</span><span>-{formatBRL(discountValue)}</span></div>}
          <div className="flex justify-between"><span className="opacity-60">Entrega:</span><span>{rentalDeliveryType === 'RETIRADA' ? 'Retirada (grátis)' : formatBRL(activeShippingFee)}</span></div>
          {assemblyFee > 0 && <div className="flex justify-between"><span className="opacity-60">Montagem:</span><span>{formatBRL(assemblyFee)}</span></div>}
          <div className="flex justify-between font-bold text-sm pt-1 border-t border-white/10" style={{ color: primaryColor }}><span>TOTAL:</span><span>{formatBRL(total)}</span></div>
          {rentalAmountNow < total && <div className="flex justify-between font-bold text-purple-300"><span>💳 Sinal para reservar agora:</span><span>{formatBRL(rentalAmountNow)}</span></div>}
          {rentalDeposit > 0 && (
            <div className="text-[11px] text-orange-300 pt-1">🔒 Caução: <b>{formatBRL(rentalDeposit)}</b> — {rentalSettings.deposit_note}</div>
          )}
        </div>

        {rentalSettings.require_terms && (
          <label className="flex items-start space-x-2 text-[11px] cursor-pointer">
            <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-0.5" />
            <span>Li e aceito o <button type="button" onClick={() => setShowTermsModal(true)} className="underline font-bold" style={{ color: primaryColor }}>termo de locação</button>, incluindo os valores de reposição em caso de dano.</span>
          </label>
        )}

        <button type="submit" disabled={isSubmitting} style={{ backgroundColor: primaryColor, color: btnTextColor }} className="w-full font-bold py-3.5 rounded-xl text-xs shadow-lg transition hover:opacity-90 disabled:opacity-60">
          {isSubmitting ? 'Reservando...' : (rentalAmountNow < total ? `Reservar e pagar sinal de ${formatBRL(rentalAmountNow)} 🚀` : 'Confirmar Reserva 🚀')}
        </button>
      </form>
    );
  };

  return (
    <div className="min-h-screen font-sans pb-24 max-w-md mx-auto transition-colors duration-300 relative flex flex-col justify-between" style={{ backgroundColor: bgColor, color: textColor }}>
      
      <div>
        {/* BARRA DE AVISOS E COMUNICADOS */}
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

            {rentalOn && (rentalSettings.allow_company_signup || rentalCustomer) && (
              <button
                onClick={() => rentalCustomer
                  ? (confirm(`Sair da conta ${rentalCustomer.company_name || rentalCustomer.name}?`) && (saveRentalCustomer(tenant.id, null), setRentalCustomer(null)))
                  : setShowCompanyModal(true)}
                className="bg-gray-900/90 hover:bg-black text-white font-bold text-[10px] px-3 py-1.5 rounded-full border border-white/20 shadow-lg transition">
                {rentalCustomer ? `🏢 ${(rentalCustomer.company_name || rentalCustomer.name).split(' ')[0]}` : '🏢 Sou empresa'}
              </button>
            )}

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
              <p className="text-[11px] opacity-70">{storeMode === 'aluguel' ? '🗓️ Locação Online' : storeMode === 'ambos' ? '🛍️ Venda & 🗓️ Locação' : '🛍️ Catálogo Online & E-commerce'}</p>
            </div>
          </div>
        </div>

        {/* CARROSSEL AUTOMÁTICO DE BANNERS PROMOCIONAIS */}
        {promoBannerList.length > 0 && (
          <div className="mt-8 px-4">
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-lg group">
              <div 
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${currentBannerIndex * 100}%)` }}>
                {promoBannerList.map((bannerUrl, idx) => (
                  <img 
                    key={idx} 
                    src={bannerUrl} 
                    alt={`Destaque ${idx + 1}`} 
                    className="w-full h-36 object-cover shrink-0" 
                  />
                ))}
              </div>

              {promoBannerList.length > 1 && (
                <div className="absolute bottom-2 inset-x-0 flex justify-center space-x-1.5 z-10">
                  {promoBannerList.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentBannerIndex(idx)}
                      style={{ backgroundColor: currentBannerIndex === idx ? primaryColor : 'rgba(255,255,255,0.4)' }}
                      className={`h-1.5 rounded-full transition-all ${currentBannerIndex === idx ? 'w-5' : 'w-1.5'}`}
                    />
                  ))}
                </div>
              )}
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

        {/* LOCAÇÃO: CLIENTE IDENTIFICADO + DATAS */}
        {rentalOn && (
          <div className="mt-3 px-4 space-y-2">
            {rentalCustomer?.table && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-[11px] p-2.5 rounded-xl font-bold text-center">
                🏢 {rentalCustomer.company_name || rentalCustomer.name}: preços da tabela <b>{rentalCustomer.table.name}</b> (-{num(rentalCustomer.table.discount_percent)}%) já aplicados
              </div>
            )}
            <RentalDateBar
              start={rentalStart}
              end={rentalEnd}
              onChange={(a, b) => { setRentalStart(a); setRentalEnd(b); }}
              days={rentalDays}
              error={rentalDateError}
              settings={rentalSettings}
              colors={rentalColors}
            />
          </div>
        )}

        {/* GRID DE PRODUTOS */}
        <div className="mt-4 px-4 grid grid-cols-2 gap-3">
          {filteredProducts.map(p => {
            const showRental = canRent(p) && (!canBuy(p) || storeMode === 'aluguel');
            const rentalDisplay = canRent(p) ? displayDailyPrice(p, rentalDiscount) : null;
            const periodInfo = canRent(p) && rentalDays > 0 && !rentalDateError ? computeRentalUnitPrice(p, rentalDays, rentalDiscount) : null;
            const hasPromo = showRental
              ? hasRentalPromo(p)
              : (p.original_price && Number(p.original_price) > Number(p.price));
            const discPercent = hasPromo
              ? (showRental
                  ? Math.round(((num(p.rental_original_price) - num(p.rental_daily_price)) / num(p.rental_original_price)) * 100)
                  : Math.round(((Number(p.original_price) - Number(p.price)) / Number(p.original_price)) * 100))
              : 0;
            const salePrice = round2(Number(p.price) * (1 - saleDiscount / 100));

            return (
              <div 
                key={p.id} 
                onClick={() => handleOpenProductModal(p)}
                style={{ backgroundColor: cardColor }} 
                className="p-3 rounded-2xl border border-white/10 flex flex-col justify-between cursor-pointer hover:border-white/20 transition relative group">
                
                <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-end space-y-1">
                  {hasPromo && (
                    <span className="bg-gradient-to-r from-red-600 to-orange-500 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-full shadow-lg border border-white/20 uppercase tracking-wider animate-pulse">
                      -{discPercent}% OFF
                    </span>
                  )}
                  {p.is_digital && (
                    <span className="bg-blue-600/90 text-white font-extrabold text-[8px] px-2 py-0.5 rounded-full shadow border border-blue-400/30 uppercase tracking-wider">
                      ⚡ Digital
                    </span>
                  )}
                  {canRent(p) && storeMode === 'ambos' && (
                    <span className="bg-purple-600/90 text-white font-extrabold text-[8px] px-2 py-0.5 rounded-full shadow border border-purple-400/30 uppercase tracking-wider">
                      🗓️ Aluga
                    </span>
                  )}
                </div>

                <div>
                  <div className="relative overflow-hidden rounded-xl mb-2">
                    <img src={p.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&auto=format&fit=crop&q=80'} alt={p.name} className="w-full h-28 object-cover border border-white/10 bg-gray-800" />
                  </div>
                  <h3 className="font-bold text-xs line-clamp-2 leading-snug h-8" style={{ color: textColor }}>{p.name}</h3>
                  <p className="text-[10px] opacity-60 line-clamp-2 h-7 mt-1">{p.description}</p>
                </div>

                <div className="mt-2 pt-2 border-t border-white/10 flex justify-between items-end">
                  {showRental ? (
                    <div>
                      {rentalDisplay.original > rentalDisplay.price && (
                        <span className="text-[10px] opacity-50 line-through block leading-tight">{formatBRL(rentalDisplay.original)}</span>
                      )}
                      <span className="font-bold text-xs block" style={{ color: hasPromo ? '#f87171' : primaryColor }}>
                        {formatBRL(rentalDisplay.price)}<span className="text-[9px] opacity-70">{rentalDisplay.suffix}</span>
                      </span>
                      {periodInfo?.available && <span className="text-[9px] opacity-70 block">{rentalDays} dia(s): <b>{formatBRL(periodInfo.unit)}</b></span>}
                      {rentalDays > 0 && !rentalDateError && <AvailabilityBadge info={availability[String(p.id)]} />}
                    </div>
                  ) : (
                  <div>
                    {(hasPromo || saleDiscount > 0) && (
                      <span className="text-[10px] opacity-50 line-through block leading-tight">
                        R$ {Number(hasPromo ? p.original_price : p.price).toFixed(2)}
                      </span>
                    )}
                    <span className={`font-bold text-xs block ${hasPromo ? 'text-red-400 font-extrabold' : ''}`} style={{ color: hasPromo ? '#f87171' : primaryColor }}>
                      R$ {salePrice.toFixed(2)}
                    </span>
                    {canRent(p) && rentalDisplay && rentalDisplay.price > 0 && (
                      <span className="text-[9px] block font-bold text-purple-300">ou alugue: {formatBRL(rentalDisplay.price)}{rentalDisplay.suffix}</span>
                    )}
                    {canRent(p) && rentalDays > 0 && !rentalDateError && <AvailabilityBadge info={availability[String(p.id)]} />}
                  </div>
                  )}

                  <button style={{ backgroundColor: primaryColor, color: btnTextColor }} className="px-2 py-1 rounded-lg text-[10px] font-bold transition shadow shrink-0">
                    Ver
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RODAPÉ PROFISSIONAL (FOOTER) */}
      <footer className="mt-12 border-t border-white/10 pt-8 pb-12 px-4 text-center space-y-3 opacity-90">
        <div className="flex justify-center items-center space-x-2">
          <img src={tenant.logo_url || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=150&auto=format&fit=crop&q=80'} alt="Logo" className="w-7 h-7 rounded-full object-cover border border-white/20" />
          <span className="font-extrabold text-sm tracking-wide" style={{ color: textColor }}>{tenant.name}</span>
        </div>

        <p className="text-[11px] opacity-60 max-w-xs mx-auto leading-relaxed">
          Atendimento de Seg. a Sáb. das {tenant.opening_time || '08:00'} às {tenant.closing_time || '18:00'}.
        </p>

        <div className="pt-2 border-t border-white/5 flex flex-col items-center space-y-1 text-[10px] opacity-50">
          <p>© {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.</p>
          <p className="font-medium tracking-wider">
            Desenvolvido por <span className="text-orange-400 font-bold hover:underline cursor-pointer">SinergeMKT</span>
          </p>
        </div>
      </footer>

      {/* ÍCONE FLUTUANTE DO WHATSAPP (FIXO NA TELA) */}
      {cleanTenantWhatsapp && (
        <a
          href={`https://wa.me/${cleanTenantWhatsapp}?text=${encodeURIComponent("Olá! Vim pelo catálogo e gostaria de tirar uma dúvida.")}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ bottom: cart.length > 0 ? '5.5rem' : '1.25rem' }}
          className="fixed right-4 z-40 bg-[#25D366] text-white p-3.5 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 flex items-center justify-center border-2 border-white/20 group">
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
          </svg>
          <span className="absolute right-14 bg-black/80 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg pointer-events-none">
            Falar no WhatsApp
          </span>
        </a>
      )}

      {/* BARRA DO CARRINHO FLUTUANTE */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-40">
          <button
            onClick={() => setShowCartModal(true)}
            style={{ backgroundColor: primaryColor, color: btnTextColor }}
            className="w-full font-bold p-3.5 rounded-2xl flex justify-between items-center shadow-2xl transition hover:opacity-95">
            <span className="text-xs bg-black/20 px-2.5 py-1 rounded-lg">🛍️ {cart.reduce((a, b) => a + b.quantity, 0)} itens</span>
            <span className="text-xs font-bold uppercase tracking-wider">{isRentalCart ? 'Finalizar Reserva' : 'Finalizar Compra'}</span>
            <span className="text-xs font-bold">R$ {total.toFixed(2)}</span>
          </button>
        </div>
      )}

      {showCompanyModal && (
        <CompanyAccessModal
          tenant={tenant}
          colors={rentalColors}
          onClose={() => setShowCompanyModal(false)}
          onLogged={(c) => { setRentalCustomer(c); setShowCompanyModal(false); alert(c.table ? `✅ Bem-vindo(a)! Preços da tabela ${c.table.name} aplicados.` : '✅ Cadastro identificado!'); }}
        />
      )}

      {showTermsModal && (
        <TermsModal text={rentalSettings.terms_text} items={pricedCart} colors={rentalColors} onClose={() => setShowTermsModal(false)} />
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
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-sm leading-snug" style={{ color: primaryColor }}>{selectedProduct.name}</h3>
                  {selectedProduct.is_digital && (
                    <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] font-bold px-2 py-0.5 rounded-md shrink-0">⚡ Digital</span>
                  )}
                </div>
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

            {canRent(selectedProduct) && canBuy(selectedProduct) && (
              <div className="flex bg-black/30 p-1 rounded-xl border border-white/10">
                {[['venda', '🛍️ Comprar'], ['aluguel', '🗓️ Alugar']].map(([k, t]) => (
                  <button key={k} type="button" onClick={() => setBuyMode(k)}
                    style={buyMode === k ? { backgroundColor: primaryColor, color: btnTextColor } : {}}
                    className="flex-1 py-2 rounded-lg text-xs font-bold transition">{t}</button>
                ))}
              </div>
            )}

            {buyMode === 'aluguel' && (
              <div className="space-y-2">
                <div className="flex items-baseline space-x-2">
                  {(() => { const d = displayDailyPrice(selectedProduct, rentalDiscount); return (<>
                    <span className="text-xl font-extrabold" style={{ color: hasRentalPromo(selectedProduct) ? '#f87171' : primaryColor }}>{formatBRL(d.price)}<span className="text-xs opacity-70">{d.suffix}</span></span>
                    {d.original > d.price && <span className="text-xs text-gray-500 line-through">{formatBRL(d.original)}</span>}
                  </>); })()}
                </div>
                {getPeriods(selectedProduct).length > 0 && (
                  <div className="text-[11px] opacity-80 space-y-0.5">
                    {getPeriods(selectedProduct).map((pk, idx) => <div key={idx}>🎁 {pk.label || `Até ${pk.days} dias`}: <b>{formatBRL(pk.price * (1 - rentalDiscount / 100))}</b></div>)}
                  </div>
                )}
                <p className="text-xs opacity-70">{selectedProduct.description}</p>
                <RentalDateBar
                  start={rentalStart}
                  end={rentalEnd}
                  onChange={(a, b) => { setRentalStart(a); setRentalEnd(b); }}
                  days={rentalDays}
                  error={rentalDateError}
                  settings={rentalSettings}
                  colors={rentalColors}
                />
                {rentalDays > 0 && !rentalDateError && selectedRentalInfo && (
                  <div style={{ backgroundColor: bgColor }} className="p-2.5 rounded-xl border border-white/10 text-xs space-y-1">
                    <div className="flex justify-between"><span className="opacity-70">Período ({rentalDays} dia(s)):</span><b>{selectedRentalInfo.available ? formatBRL(selectedRentalInfo.unit) : '—'}/un.</b></div>
                    {selectedRentalInfo.available && <div className="text-[10px] opacity-60">{selectedRentalInfo.label}{rentalDiscount > 0 ? ` • tabela ${rentalCustomer.table.name} -${rentalDiscount}%` : ''}</div>}
                    <AvailabilityBadge info={selectedAvailability} needed={productQuantity} />
                    {num(selectedProduct.rental_min_days) > 1 && <div className="text-[10px] text-yellow-300">Mínimo de {selectedProduct.rental_min_days} dias</div>}
                  </div>
                )}
                {num(selectedProduct.replacement_value) > 0 && (
                  <div className="bg-orange-500/10 border border-orange-500/20 p-2 rounded-xl text-[11px] text-orange-200">
                    ⚠️ Valor de reposição em caso de dano ou perda: <b>{formatBRL(selectedProduct.replacement_value)}</b> por unidade.
                  </div>
                )}
              </div>
            )}

            {buyMode !== 'aluguel' && (
            <div className="space-y-1">
              <div className="flex items-baseline space-x-2">
                <span className="text-xl font-extrabold block" style={{ color: selectedProductHasPromo ? '#f87171' : primaryColor }}>
                  R$ {modalUnitPrice.toFixed(2)}
                </span>
                {(selectedProductHasPromo || saleDiscount > 0) && (
                  <span className="text-xs text-gray-500 line-through">
                    R$ {Number(selectedProductHasPromo ? selectedProduct.original_price : selectedProduct.price).toFixed(2)}
                  </span>
                )}
              </div>
              <p className="text-xs opacity-70">{selectedProduct.description}</p>
            </div>
            )}

            {selectedProduct.is_digital && (
              <div className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-xl text-xs text-blue-300">
                ⚡ <b>Produto Digital:</b> Acesso imediato liberado após confirmação do pagamento. Não exige envio físico.
              </div>
            )}

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
                {buyMode === 'aluguel' ? 'Reservar' : 'Adicionar'} • R$ {(modalUnitPrice * productQuantity).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DO CARRINHO & CHECKOUT */}
      {showCartModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div style={{ backgroundColor: cardColor, color: textColor }} className="border border-white/10 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm" style={{ color: primaryColor }}>{isRentalCart ? '🗓️ Sua Reserva' : '🛍️ Sacola de Compras'}</h3>
              <button onClick={() => setShowCartModal(false)} className="opacity-60 font-bold text-xs">✕ Fechar</button>
            </div>

            {!isRentalCart && !isAllDigital && freeThreshold > 0 && (
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

            {isAllDigital && (
              <div className="bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] p-2.5 rounded-xl font-bold text-center">
                ⚡ Seus produtos são <b>100% Digitais</b>! Isenção total de taxa de frete.
              </div>
            )}

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pricedCart.map(item => (
                <div key={item.cartItemId} style={{ backgroundColor: bgColor }} className="p-2.5 rounded-xl border border-white/10 flex justify-between items-start text-xs space-x-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold block">{item.quantity}x {item.name}</span>
                      {item.is_digital && <span className="bg-blue-500/20 text-blue-400 text-[9px] font-bold px-1.5 py-0.2 rounded">⚡ Digital</span>}
                    </div>
                    {item.variationsText && (
                      <span className="text-[10px] font-bold text-orange-400 block">{item.variationsText}</span>
                    )}
                    {item.note && (
                      <p className="text-[10px] opacity-60 italic">Obs: "{item.note}"</p>
                    )}
                    {item.type === 'aluguel' && (
                      <span className="text-[10px] opacity-60 block">{rentalDays > 0 ? `${rentalDays} dia(s) • ${item.price_label}` : 'Escolha as datas'}</span>
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

            {isRentalCart ? renderRentalCheckout() : (
            <form onSubmit={handleFinishOrder} className="space-y-3 pt-2 border-t border-white/10">
              
              {/* OPÇÕES DE ENTREGA OCULTAS SE TUDO FOR DIGITAL */}
              {!isAllDigital && (
                <>
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
                </>
              )}

              <div>
                <label className="text-[11px] opacity-70 block mb-1">Seu Nome:</label>
                <input type="text" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={{ backgroundColor: bgColor, color: textColor }} className="w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none" />
              </div>

              <div>
                <label className="text-[11px] opacity-70 block mb-1">Seu WhatsApp (Recebimento dos Links):</label>
                <input type="text" required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} style={{ backgroundColor: bgColor, color: textColor }} className="w-full border border-white/10 p-2.5 rounded-xl text-xs focus:outline-none" />
              </div>

              {!isAllDigital && deliveryType === 'ENTREGA' && (
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
                  {!isAllDigital && <option value="Dinheiro">Dinheiro</option>}
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
                    {isAllDigital 
                      ? '⚡ Digital (Grátis)' 
                      : (deliveryType === 'RETIRADA' ? 'Grátis' : (isFreeShipping ? '🎉 FRETE GRÁTIS' : `R$ ${activeShippingFee.toFixed(2)}`))}
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
            )}
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
              <span className="text-xs text-gray-400 block font-bold">{isRentalCart && rentalAmountNow < total ? 'Sinal da reserva' : 'Valor Total'}: <b className="text-green-400 text-sm">R$ {(isRentalCart ? rentalAmountNow : total).toFixed(2)}</b></span>
              
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
                  setShowCartModal(false);
                  if (currentOrderId) {
                    router.push(`/${slug}/pedido/${currentOrderId}`);
                  }
                }}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-extrabold py-3.5 rounded-xl text-xs transition shadow-lg flex items-center justify-center space-x-2">
                <span>💬 Enviar Confirmação no WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowPixModal(false);
                  setCart([]);
                  setShowCartModal(false);
                  if (currentOrderId) {
                    router.push(`/${slug}/pedido/${currentOrderId}`);
                  }
                }}
                className="text-[11px] opacity-60 hover:opacity-100 font-bold block mx-auto pt-1">
                Acompanhar Pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
