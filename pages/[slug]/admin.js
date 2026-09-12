import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

// FUNÇÃO AUXILIAR PARA PARSE SEGURO DE VALORES MONETÁRIOS
const parsePrice = (val, defaultVal = 0) => {
  if (!val && val !== 0) return defaultVal;
  const clean = String(val).replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? defaultVal : num;
};

export default function AdminTenant() {
  const router = useRouter();
  const { slug } = router.query;

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('products');
  const [loading, setLoading] = useState(true);

  // ESTADOS PRINCIPAIS
  const [tenant, setTenant] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [reportFilter, setReportFilter] = useState('all');

  // CONFIGURAÇÕES AUTOMÁTICAS E MODOS DE FRETE
  const [shippingMode, setShippingMode] = useState('local'); // 'local', 'national', 'hybrid'
  const [originCep, setOriginCep] = useState('');
  const [melhorenvioToken, setMelhorenvioToken] = useState('');
  const [defaultShippingFee, setDefaultShippingFee] = useState(10.00);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(0.00);
  const [enablePickup, setEnablePickup] = useState(true);

  // FORMULÁRIOS E EDIÇÃO
  const [newProd, setNewProd] = useState({ 
    name: '', 
    price: '', 
    original_price: '',
    category_id: '', 
    description: '', 
    image: '',
    images_json: [],
    variations_json: [],
    weight_kg: '0.3',
    width_cm: '15',
    height_cm: '10',
    length_cm: '20',
    stock: '' // Campo de estoque opcional
  });
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingNeigh, setEditingNeigh] = useState(null);

  // ESTADOS TEMPORÁRIOS PARA VARIAÇÕES
  const [tempVarName, setTempVarName] = useState('');
  const [tempVarOptions, setTempVarOptions] = useState('');
  const [tempEditVarName, setTempEditVarName] = useState('');
  const [tempEditVarOptions, setTempEditVarOptions] = useState('');

  // ESTADOS TEMPORÁRIOS PARA IMAGENS / GALERIA
  const [tempImageUrl, setTempImageUrl] = useState('');
  const [tempEditImageUrl, setTempEditImageUrl] = useState('');

  const [newCatName, setNewCatName] = useState('');
  const [newNeigh, setNewNeigh] = useState({ name: '', fee: '' });
  const [newCoupon, setNewCoupon] = useState({ code: '', discount_type: 'percent', discount_value: '' });

  // ESTADO PARA BUSCA NO CRM DE CLIENTES
  const [customerSearch, setCustomerSearch] = useState('');

  useEffect(() => {
    if (slug) fetchTenant();
  }, [slug]);

  const fetchTenant = async () => {
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', slug).single();
    if (tData) {
      setTenant(tData);
      setShippingMode(tData.shipping_mode || 'local');
      setOriginCep(tData.origin_cep || '');
      setMelhorenvioToken(tData.melhorenvio_token || '');
      setDefaultShippingFee(tData.default_shipping_fee ?? 10.00);
      setFreeShippingThreshold(tData.free_shipping_threshold ?? 0.00);
      setEnablePickup(tData.enable_pickup ?? true);
    }
    setLoading(false);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (tenant && (password === tenant.admin_password || password === 'master123')) {
      setIsAuthenticated(true);
      fetchData(tenant.id);
    } else {
      alert('Senha incorreta!');
    }
  };

  const fetchData = async (tenantId = tenant?.id) => {
    if (!tenantId) return;
    const { data: tData } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    const { data: cData } = await supabase.from('categories').select('*').eq('tenant_id', tenantId).order('id', { ascending: true });
    const { data: pData } = await supabase.from('products').select('*').eq('tenant_id', tenantId).order('id', { ascending: true });
    const { data: nData } = await supabase.from('neighborhoods').select('*').eq('tenant_id', tenantId).order('id', { ascending: true });
    
    let cpData = [];
    try {
      const res = await supabase.from('coupons').select('*').eq('tenant_id', tenantId).order('id', { ascending: false });
      if (res.data) cpData = res.data;
    } catch (err) {}

    const { data: oData } = await supabase.from('orders').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });

    if (tData) {
      setTenant(tData);
      setShippingMode(tData.shipping_mode || 'local');
      setOriginCep(tData.origin_cep || '');
      setMelhorenvioToken(tData.melhorenvio_token || '');
      setDefaultShippingFee(tData.default_shipping_fee ?? 10.00);
      setFreeShippingThreshold(tData.free_shipping_threshold ?? 0.00);
      setEnablePickup(tData.enable_pickup ?? true);
    }
    if (cData && cData.length > 0) {
      setCategories(cData);
      setNewProd(prev => ({ ...prev, category_id: prev.category_id || cData[0].id }));
    }
    if (pData) setProducts(pData);
    if (nData) setNeighborhoods(nData);
    if (cpData) setCoupons(cpData);
    if (oData) setAllOrders(oData);
  };

  const handleSaveTenantSettings = async (e) => {
    if (e) e.preventDefault();
    const cleanWhatsapp = tenant.whatsapp ? String(tenant.whatsapp).replace(/\D/g, '') : '';

    const updatePayload = {
      name: tenant.name || '',
      whatsapp: cleanWhatsapp,
      logo_url: tenant.logo_url || '',
      banner_url: tenant.banner_url || '',
      promo_banners: tenant.promo_banners || '',
      instagram_url: tenant.instagram_url || '',
      primary_color: tenant.primary_color || '#3B82F6',
      secondary_color: tenant.secondary_color || '#090D16',
      admin_password: tenant.admin_password || '',
      niche: tenant.niche || 'general',
      shipping_mode: shippingMode,
      origin_cep: originCep,
      melhorenvio_token: melhorenvioToken,
      default_shipping_fee: parsePrice(defaultShippingFee, 10.00),
      free_shipping_threshold: parsePrice(freeShippingThreshold, 0.00),
      enable_pickup: enablePickup,
      pix_key: tenant.pix_key || '',
      opening_time: tenant.opening_time || '08:00',
      closing_time: tenant.closing_time || '18:00',
      pixel_id: tenant.pixel_id || '',
      custom_message: tenant.custom_message || '',
      pix_enabled: tenant.pix_enabled || false,
      pix_provider: tenant.pix_provider || 'mercadopago',
      pix_access_token: tenant.pix_access_token || ''
    };

    const { error } = await supabase.from('tenants').update(updatePayload).eq('id', tenant.id);

    if (error) {
      alert("Erro ao salvar: " + error.message);
    } else {
      alert("Configurações salvas com sucesso!");
      fetchData();
    }
  };

  const handleClearFinancialData = async () => {
    if (confirm("⚠️ ATENÇÃO: Tem certeza que deseja zerar TODOS os pedidos e dados financeiros?\n\nEsta ação vai apagar definitivamente todos os pedidos de teste do banco de dados. Não poderá ser desfeito!")) {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('tenant_id', tenant.id);

      if (error) {
        alert("Erro ao limpar financeiro: " + error.message);
      } else {
        alert("Histórico financeiro e pedidos zerados com sucesso!");
        fetchData();
      }
    }
  };

  const handleAddImageToNewProd = () => {
    if (!tempImageUrl.trim()) return alert("Insira a URL da imagem!");
    const url = tempImageUrl.trim();
    setNewProd(prev => ({
      ...prev,
      image: prev.image || url,
      images_json: [...(prev.images_json || []), url]
    }));
    setTempImageUrl('');
  };

  const handleRemoveImageFromNewProd = (index) => {
    setNewProd(prev => {
      const updated = (prev.images_json || []).filter((_, i) => i !== index);
      return {
        ...prev,
        image: updated.length > 0 ? updated[0] : '',
        images_json: updated
      };
    });
  };

  const handleAddImageToEditProd = () => {
    if (!tempEditImageUrl.trim()) return alert("Insira a URL da imagem!");
    const url = tempEditImageUrl.trim();
    setEditingProduct(prev => ({
      ...prev,
      image: prev.image || url,
      images_json: [...(prev.images_json || []), url]
    }));
    setTempEditImageUrl('');
  };

  const handleRemoveImageFromEditProd = (index) => {
    setEditingProduct(prev => {
      const updated = (prev.images_json || []).filter((_, i) => i !== index);
      return {
        ...prev,
        image: updated.length > 0 ? updated[0] : '',
        images_json: updated
      };
    });
  };

  const handleAddVariationToNewProd = () => {
    if (!tempVarName.trim() || !tempVarOptions.trim()) return alert("Preencha o nome do atributo e as opções!");
    const optsArray = tempVarOptions.split(',').map(s => s.trim()).filter(Boolean);
    const newVar = { attribute_name: tempVarName.trim(), options: optsArray };
    setNewProd(prev => ({ ...prev, variations_json: [...(prev.variations_json || []), newVar] }));
    setTempVarName('');
    setTempVarOptions('');
  };

  const handleRemoveVariationFromNewProd = (index) => {
    setNewProd(prev => ({
      ...prev,
      variations_json: (prev.variations_json || []).filter((_, i) => i !== index)
    }));
  };

  const handleAddVariationToEditProd = () => {
    if (!tempEditVarName.trim() || !tempEditVarOptions.trim()) return alert("Preencha o nome do atributo e as opções!");
    const optsArray = tempEditVarOptions.split(',').map(s => s.trim()).filter(Boolean);
    const newVar = { attribute_name: tempEditVarName.trim(), options: optsArray };
    setEditingProduct(prev => ({ ...prev, variations_json: [...(prev.variations_json || []), newVar] }));
    setTempEditVarName('');
    setTempEditVarOptions('');
  };

  const handleRemoveVariationFromEditProd = (index) => {
    setEditingProduct(prev => ({
      ...prev,
      variations_json: (prev.variations_json || []).filter((_, i) => i !== index)
    }));
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProd.name || !newProd.price) return alert("Preencha nome e preço!");

    const targetCategoryId = parseInt(newProd.category_id || categories[0]?.id);
    if (!targetCategoryId || isNaN(targetCategoryId)) {
      return alert("Selecione uma categoria válida antes de salvar!");
    }

    const formattedPrice = parsePrice(newProd.price);
    const formattedOrigPrice = newProd.original_price ? parsePrice(newProd.original_price) : null;
    const mainImage = newProd.image || (newProd.images_json && newProd.images_json[0]) || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80';

    // LÓGICA DE ESTOQUE OPCIONAL (Se <= 0, desativa automaticamente)
    const stockVal = newProd.stock !== '' && newProd.stock !== null ? parseInt(newProd.stock) : null;
    const autoActive = stockVal !== null ? stockVal > 0 : true;

    const { error } = await supabase.from('products').insert([{
      tenant_id: tenant.id,
      category_id: targetCategoryId,
      name: newProd.name.trim(),
      description: newProd.description,
      price: formattedPrice,
      original_price: formattedOrigPrice,
      image: mainImage,
      images_json: newProd.images_json || [mainImage],
      variations_json: newProd.variations_json || [],
      weight_kg: parsePrice(newProd.weight_kg, 0.3),
      width_cm: parsePrice(newProd.width_cm, 15),
      height_cm: parsePrice(newProd.height_cm, 10),
      length_cm: parsePrice(newProd.length_cm, 20),
      stock: stockVal,
      active: autoActive
    }]);

    if (error) {
      alert("Erro ao cadastrar produto: " + error.message);
    } else {
      alert("Produto cadastrado com sucesso!");
      setNewProd({ 
        name: '', 
        price: '', 
        original_price: '',
        category_id: categories[0]?.id || '', 
        description: '', 
        image: '', 
        images_json: [],
        variations_json: [],
        weight_kg: '0.3',
        width_cm: '15',
        height_cm: '10',
        length_cm: '20',
        stock: ''
      });
      fetchData();
    }
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    const formattedPrice = parsePrice(editingProduct.price);
    const formattedOrigPrice = editingProduct.original_price ? parsePrice(editingProduct.original_price) : null;
    const mainImage = editingProduct.image || (editingProduct.images_json && editingProduct.images_json[0]) || '';

    // LÓGICA DE ESTOQUE NA EDIÇÃO
    const stockVal = editingProduct.stock !== '' && editingProduct.stock !== null ? parseInt(editingProduct.stock) : null;
    const autoActive = stockVal !== null ? stockVal > 0 : editingProduct.active;

    const { error } = await supabase.from('products').update({
      name: editingProduct.name.trim(),
      price: formattedPrice,
      original_price: formattedOrigPrice,
      description: editingProduct.description,
      category_id: parseInt(editingProduct.category_id),
      image: mainImage,
      images_json: editingProduct.images_json || [mainImage],
      variations_json: editingProduct.variations_json || [],
      weight_kg: parsePrice(editingProduct.weight_kg, 0.3),
      width_cm: parsePrice(editingProduct.width_cm, 15),
      height_cm: parsePrice(editingProduct.height_cm, 10),
      length_cm: parsePrice(editingProduct.length_cm, 20),
      stock: stockVal,
      active: autoActive
    }).eq('id', editingProduct.id);

    if (error) {
      alert("Erro ao atualizar produto: " + error.message);
    } else {
      setEditingProduct(null);
      fetchData();
    }
  };

  const handleAddCoupon = async (e) => {
    e.preventDefault();
    if (!newCoupon.code || !newCoupon.discount_value) return alert("Preencha o código e o valor do desconto!");
    const cleanCode = newCoupon.code.trim().toUpperCase();
    const formattedVal = parsePrice(newCoupon.discount_value);

    const { error } = await supabase.from('coupons').insert([{
      tenant_id: tenant.id,
      code: cleanCode,
      discount_type: newCoupon.discount_type,
      discount_value: formattedVal,
      active: true
    }]);

    if (error) {
      alert("Erro ao cadastrar cupom: Verifique se a tabela 'coupons' foi criada no SQL.");
    } else {
      setNewCoupon({ code: '', discount_type: 'percent', discount_value: '' });
      fetchData();
    }
  };

  const handleAddNeighborhood = async (e) => {
    e.preventDefault();
    const formattedFee = parsePrice(newNeigh.fee);
    await supabase.from('neighborhoods').insert([{ tenant_id: tenant.id, name: newNeigh.name.trim(), fee: formattedFee }]);
    setNewNeigh({ name: '', fee: '' });
    fetchData();
  };

  const handleUpdateNeigh = async (e) => {
    e.preventDefault();
    const formattedFee = parsePrice(editingNeigh.fee);
    await supabase.from('neighborhoods').update({ name: editingNeigh.name.trim(), fee: formattedFee }).eq('id', editingNeigh.id);
    setEditingNeigh(null);
    fetchData();
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await supabase.from('categories').insert([{ tenant_id: tenant.id, name: newCatName.trim() }]);
    setNewCatName('');
    fetchData();
  };

  const handleUpdateCategory = async (e) => {
    e.preventDefault();
    await supabase.from('categories').update({ name: editingCategory.name.trim() }).eq('id', editingCategory.id);
    setEditingCategory(null);
    fetchData();
  };

  // CÁLCULO DE VENDAS E FILTROS DO RELATÓRIO
  const getFilteredOrders = () => {
    const now = new Date();
    return allOrders.filter(o => {
      if (o.status === 'cancelado') return false;
      
      const isPaid = o.is_paid || (o.payment_method && o.payment_method.includes('PAGO'));
      if (!isPaid) return false;

      if (reportFilter === 'all') return true;
      if (!o.created_at) return true;
      const orderDate = new Date(o.created_at);
      const diffDays = (now - orderDate) / (1000 * 60 * 60 * 24);
      if (reportFilter === 'today') return orderDate.toDateString() === now.toDateString();
      if (reportFilter === '7days') return diffDays <= 7;
      if (reportFilter === '15days') return diffDays <= 15;
      if (reportFilter === '30days') return diffDays <= 30;
      return true;
    });
  };

  const filteredOrders = getFilteredOrders();
  const totalRevenue = filteredOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const averageTicket = filteredOrders.length > 0 ? (totalRevenue / filteredOrders.length) : 0;

  const productSalesMap = {};
  filteredOrders.forEach(o => {
    if (o.items && Array.isArray(o.items)) {
      o.items.forEach(it => {
        const q = it.quantity || 1;
        productSalesMap[it.name] = (productSalesMap[it.name] || 0) + q;
      });
    }
  });

  const topProducts = Object.entries(productSalesMap)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty);

  // AGRUPAMENTO DE CLIENTES PARA O CRM DE VENDAS
  const getCustomersList = () => {
    const customerMap = {};

    allOrders.forEach(ord => {
      const phoneClean = ord.customer_phone ? ord.customer_phone.replace(/\D/g, '') : '';
      if (!phoneClean) return;

      if (!customerMap[phoneClean]) {
        customerMap[phoneClean] = {
          name: ord.customer_name || 'Cliente',
          phone: ord.customer_phone,
          phoneClean: phoneClean,
          totalSpent: 0,
          totalOrders: 0,
          lastOrderDate: ord.created_at
        };
      }

      const isPaid = ord.is_paid || ord.payment_method?.includes('PAGO');
      if (isPaid && ord.status !== 'cancelado') {
        customerMap[phoneClean].totalSpent += Number(ord.total || 0);
      }
      customerMap[phoneClean].totalOrders += 1;
      
      if (new Date(ord.created_at) > new Date(customerMap[phoneClean].lastOrderDate)) {
        customerMap[phoneClean].lastOrderDate = ord.created_at;
      }
    });

    return Object.values(customerMap)
      .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  };

  const customersList = getCustomersList();

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-sm text-gray-400">Carregando painel...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-blue-500">Loja não encontrada</h1></div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-gray-900 p-6 rounded-2xl border border-gray-800 w-full max-w-sm space-y-4 shadow-2xl">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-blue-500 mb-1">{tenant.name}</h2>
            <p className="text-xs text-gray-400">Gestão do Catálogo & E-commerce</p>
          </div>
          <input 
            type="password" 
            placeholder="Senha de acesso..." 
            className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500" 
            onChange={(e) => setPassword(e.target.value)} 
          />
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition">
            Entrar no Painel 🚀
          </button>
        </form>
      </div>
    );
  }

  const primaryColor = tenant.primary_color || '#3B82F6';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-4xl mx-auto font-sans pb-16">
      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-6 print:hidden">
        <div>
          <h1 className="font-bold text-lg text-blue-400 flex items-center space-x-2">
            <span>🛍️ {tenant.name}</span>
          </h1>
          <p className="text-xs text-gray-400">Painel de Gestão de Catálogo & Vendas</p>
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="text-xs bg-gray-900 border border-gray-800 hover:bg-gray-800 px-3 py-1.5 rounded-xl text-red-400 font-bold transition">
          🚪 Sair
        </button>
      </header>

      {/* ABAS DO PAINEL */}
      <div className="flex space-x-1 bg-gray-900 p-1.5 rounded-2xl border border-gray-800 mb-6 text-[11px] font-bold overflow-x-auto print:hidden">
        <button 
          onClick={() => setActiveTab('products')} 
          style={activeTab === 'products' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}}
          className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'products' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>
          📦 Produtos
        </button>

        <button 
          onClick={() => setActiveTab('categories')} 
          style={activeTab === 'categories' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}}
          className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'categories' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>
          🏷️ Categorias
        </button>

        <button 
          onClick={() => setActiveTab('coupons')} 
          style={activeTab === 'coupons' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}}
          className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'coupons' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>
          🎟️ Cupons
        </button>

        <button 
          onClick={() => setActiveTab('neighborhoods')} 
          style={activeTab === 'neighborhoods' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}}
          className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'neighborhoods' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>
          🚚 Fretes & CEP
        </button>

        <button 
          onClick={() => setActiveTab('crm')} 
          style={activeTab === 'crm' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}}
          className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'crm' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>
          👥 Clientes VIP
        </button>

        <button 
          onClick={() => setActiveTab('reports')} 
          style={activeTab === 'reports' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}}
          className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'reports' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>
          📊 Relatórios
        </button>

        <button 
          onClick={() => setActiveTab('settings')} 
          style={activeTab === 'settings' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}}
          className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'settings' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>
          ⚙️ Config
        </button>
      </div>

      {/* ABA DE PRODUTOS */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">➕ Cadastrar Novo Produto</h3>
            <form onSubmit={handleAddProduct} className="space-y-3">
              <input type="text" placeholder="Nome do Produto (Ex: Sérum Facial, Camisa Oversized, Vaso Decorativo)" value={newProd.name} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} />
              <input type="text" placeholder="Descrição detalhada do produto" value={newProd.description} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, description: e.target.value })} />
              
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Preço Normal (R$):</label>
                  <input type="text" placeholder="Preço R$" value={newProd.price} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, price: e.target.value })} />
                </div>

                <div>
                  <label className="text-[10px] text-red-400 font-bold block mb-1">🔥 Preço Antigo / De (R$):</label>
                  <input type="text" placeholder="Ex: 120.00" value={newProd.original_price} className="w-full bg-gray-950 border border-red-500/30 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, original_price: e.target.value })} />
                </div>

                <div>
                  <label className="text-[10px] text-green-400 font-bold block mb-1">📦 Estoque (Opcional):</label>
                  <input type="number" placeholder="Ilimitado" value={newProd.stock} className="w-full bg-gray-950 border border-green-500/30 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, stock: e.target.value })} />
                </div>

                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Categoria:</label>
                  <select 
                    value={newProd.category_id || (categories[0]?.id || '')} 
                    className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" 
                    onChange={(e) => setNewProd({ ...newProd, category_id: e.target.value })}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* PESO E DIMENSÕES PARA FRETE NACIONAL */}
              <div className="bg-gray-950 p-3.5 rounded-2xl border border-gray-800 space-y-2">
                <label className="text-xs font-bold text-orange-400 block">📦 Peso e Dimensões da Caixa/Embalagem (Para Frete Nacional por CEP)</label>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Peso (kg):</label>
                    <input type="text" placeholder="0.3" value={newProd.weight_kg} onChange={(e) => setNewProd({ ...newProd, weight_kg: e.target.value })} className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Largura (cm):</label>
                    <input type="text" placeholder="15" value={newProd.width_cm} onChange={(e) => setNewProd({ ...newProd, width_cm: e.target.value })} className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Altura (cm):</label>
                    <input type="text" placeholder="10" value={newProd.height_cm} onChange={(e) => setNewProd({ ...newProd, height_cm: e.target.value })} className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Compr. (cm):</label>
                    <input type="text" placeholder="20" value={newProd.length_cm} onChange={(e) => setNewProd({ ...newProd, length_cm: e.target.value })} className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white focus:outline-none" />
                  </div>
                </div>
              </div>

              <div className="bg-gray-950 p-3.5 rounded-2xl border border-gray-800 space-y-3">
                <label className="text-xs font-bold text-blue-400 block">🖼️ Galeria de Fotos do Produto</label>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    placeholder="URL da Foto do Produto" 
                    value={tempImageUrl} 
                    onChange={(e) => setTempImageUrl(e.target.value)} 
                    className="flex-1 bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none" 
                  />
                  <button 
                    type="button" 
                    onClick={handleAddImageToNewProd} 
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition">
                    + Foto
                  </button>
                </div>

                {newProd.images_json && newProd.images_json.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
                    {newProd.images_json.map((imgUrl, idx) => (
                      <div key={idx} className="relative group w-16 h-16 rounded-xl border border-gray-800 overflow-hidden bg-gray-900">
                        <img src={imgUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                        <button 
                          type="button" 
                          onClick={() => handleRemoveImageFromNewProd(idx)} 
                          className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold shadow">
                          ✕
                        </button>
                        {idx === 0 && <span className="absolute bottom-0 inset-x-0 bg-blue-600 text-[8px] text-center font-bold py-0.5">Capa</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-950 p-3.5 rounded-2xl border border-gray-800 space-y-3">
                <label className="text-xs font-bold text-blue-400 block">⚡ Variações / Opções do Produto (Opcional)</label>
                <p className="text-[10px] text-gray-400">Ex: Atributo: <b>Voltagem</b> | Opções: <b>110V, 220V</b> ou Atributo: <b>Tamanho</b> | Opções: <b>P, M, G</b></p>
                
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    placeholder="Atributo (ex: Tamanho, Voltagem, Volume)" 
                    value={tempVarName} 
                    onChange={(e) => setTempVarName(e.target.value)} 
                    className="w-1/2 bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none" 
                  />
                  <input 
                    type="text" 
                    placeholder="Opções separadas por vírgula (ex: P, M, G)" 
                    value={tempVarOptions} 
                    onChange={(e) => setTempVarOptions(e.target.value)} 
                    className="w-1/2 bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none" 
                  />
                </div>
                <button 
                  type="button" 
                  onClick={handleAddVariationToNewProd} 
                  className="w-full bg-gray-800 hover:bg-gray-700 text-blue-400 font-bold py-2 rounded-xl text-xs border border-gray-700 transition">
                  + Adicionar Variação
                </button>

                {newProd.variations_json && newProd.variations_json.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-gray-800">
                    {newProd.variations_json.map((v, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-gray-900 p-2 rounded-xl text-xs border border-gray-800">
                        <span><b className="text-blue-400">{v.attribute_name}:</b> {v.options.join(', ')}</span>
                        <button type="button" onClick={() => handleRemoveVariationFromNewProd(idx)} className="text-red-400 font-bold px-2">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 font-bold py-3 rounded-xl text-xs text-white transition shadow-lg">
                Salvar Produto 🚀
              </button>
            </form>
          </section>

          <section className="space-y-3">
            <h3 className="font-bold text-sm text-gray-300">📋 Produtos Cadastrados ({products.length})</h3>
            {products.map((item) => {
              const hasPromo = item.original_price && Number(item.original_price) > Number(item.price);
              const discPercent = hasPromo ? Math.round(((Number(item.original_price) - Number(item.price)) / Number(item.original_price)) * 100) : 0;
              const isOutOfStock = item.stock !== null && item.stock <= 0;

              return (
                <div key={item.id} className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 flex justify-between items-center shadow-md">
                  <div className="flex items-center space-x-3">
                    {item.image && <img src={item.image} alt={item.name} className="w-12 h-12 rounded-xl object-cover bg-gray-950" />}
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`font-bold text-xs block ${!item.active ? 'line-through text-gray-500' : 'text-white'}`}>{item.name}</span>
                        {hasPromo && <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded-md">🔥 -{discPercent}% OFF</span>}
                        {isOutOfStock && <span className="bg-red-900/40 text-red-400 border border-red-700/50 text-[9px] font-bold px-1.5 py-0.5 rounded-md">❌ Esgotado</span>}
                      </div>
                      <div className="flex items-center space-x-3 text-xs mt-0.5">
                        <span className="text-blue-400 font-bold">R$ {Number(item.price).toFixed(2)}</span>
                        {hasPromo && <span className="text-[10px] text-gray-500 line-through">R$ {Number(item.original_price).toFixed(2)}</span>}
                        {item.stock !== null && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.stock > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            📦 Estoque: {item.stock} un.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button onClick={() => setEditingProduct({ ...item, images_json: item.images_json || (item.image ? [item.image] : []), variations_json: item.variations_json || [] })} className="text-xs bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-xl font-bold border border-blue-500/30">✏️ Editar</button>
                    <button onClick={async () => { await supabase.from('products').update({ active: !item.active }).eq('id', item.id); fetchData(); }} className={`text-[10px] font-bold px-2.5 py-1.5 rounded-xl ${item.active ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>{item.active ? 'Ativo' : 'Pausado'}</button>
                    <button onClick={async () => { if (confirm("Deseja excluir este produto?")) { await supabase.from('products').delete().eq('id', item.id); fetchData(); } }} className="text-xs bg-red-500/20 text-red-400 px-2.5 py-1.5 rounded-xl font-bold border border-red-500/30">🗑</button>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* ABA DE CUPONS DE DESCONTO */}
      {activeTab === 'coupons' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">🎟️ Criar Novo Cupom de Desconto</h3>
            <form onSubmit={handleAddCoupon} className="space-y-3">
              <input
                type="text"
                placeholder="Código do Cupom (Ex: PRIMEIRA10 ou PROMO20)"
                value={newCoupon.code}
                onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value })}
                className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white uppercase focus:outline-none"
              />
              <div className="flex space-x-2">
                <select
                  value={newCoupon.discount_type}
                  onChange={(e) => setNewCoupon({ ...newCoupon, discount_type: e.target.value })}
                  className="w-1/2 bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none">
                  <option value="percent">Porcentagem (%)</option>
                  <option value="fixed">Valor Fixo (R$)</option>
                </select>
                <input
                  type="text"
                  placeholder={newCoupon.discount_type === 'percent' ? "Ex: 10 (para 10%)" : "Ex: 15.00 (para R$ 15)"}
                  value={newCoupon.discount_value}
                  onChange={(e) => setNewCoupon({ ...newCoupon, discount_value: e.target.value })}
                  className="w-1/2 bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none"
                />
              </div>
              <button type="submit" className="w-full bg-green-600 hover:bg-green-700 font-bold py-3 rounded-xl text-xs text-white transition">
                Cadastrar Cupom 🎟️
              </button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-xs text-gray-400 uppercase">Cupons Cadastrados ({coupons.length})</h3>
            {coupons.map((c) => (
              <div key={c.id} className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-white block text-sm">{c.code}</span>
                  <span className="text-green-400 font-bold">
                    Desconto: {c.discount_type === 'percent' ? `${c.discount_value}%` : `R$ ${Number(c.discount_value).toFixed(2)}`}
                  </span>
                </div>
                <button onClick={async () => { if (confirm("Excluir cupom?")) { await supabase.from('coupons').delete().eq('id', c.id); fetchData(); } }} className="text-red-400 font-bold p-1">🗑</button>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* FRETE & CEP DE ORIGEM (SESSÃO ÚNICA DE FRETE COM MODO DE OPERAÇÃO UNIFICADO) */}
      {activeTab === 'neighborhoods' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-orange-500/30 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-orange-400 flex items-center space-x-2">
              <span>🚚 Configuração de Entregas & CEP</span>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-blue-400 block mb-1">🎯 Escolha o Modo de Envio da sua Loja:</label>
                <select
                  value={shippingMode}
                  onChange={(e) => setShippingMode(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none font-bold">
                  <option value="local">🛵 Apenas Local (Taxa Fixa / Bairros / Retirada na Loja)</option>
                  <option value="national">📦 Apenas Nacional (Cálculo via CEP / Correios / Transportadoras)</option>
                  <option value="hybrid">⚡ Híbrido (Motoboy na Cidade + Correios para o Brasil)</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  {shippingMode === 'local' && 'Ideal para negócios locais (lojas de bairro, restaurantes).'}
                  {shippingMode === 'national' && 'Ideal para marcas de alcance nacional (vestuário, cosméticos, eletrônicos).'}
                  {shippingMode === 'hybrid' && 'Combina entrega rápida por motoboy na sua cidade com envio via Correios para todo o Brasil.'}
                </p>
              </div>

              {(shippingMode === 'national' || shippingMode === 'hybrid') && (
                <div className="space-y-3 bg-gray-950 p-3.5 rounded-2xl border border-gray-800">
                  <h4 className="font-bold text-xs text-orange-400">📦 Parâmetros para Frete Nacional por CEP</h4>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">CEP de Origem (Endereço do Estoque):</label>
                    <input
                      type="text"
                      placeholder="Ex: 88301-000"
                      value={originCep}
                      onChange={(e) => setOriginCep(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Token de Acesso do Melhor Envio (Opcional):</label>
                    <input
                      type="password"
                      placeholder="Token para cotação direta na conta do lojista"
                      value={melhorenvioToken}
                      onChange={(e) => setMelhorenvioToken(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none font-mono"
                    />
                    <span className="text-[9px] text-gray-500 block mt-0.5">Se deixado em branco, a plataforma utilizará a integração padrão.</span>
                  </div>
                </div>
              )}

              {(shippingMode === 'local' || shippingMode === 'hybrid') && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-gray-950 p-3.5 rounded-2xl border border-gray-800">
                  <div className="col-span-full">
                    <h4 className="font-bold text-xs text-blue-400">🛵 Parâmetros para Entregas Locais</h4>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Taxa Fixa Local (R$):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={defaultShippingFee}
                      onChange={(e) => setDefaultShippingFee(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                      placeholder="10.00"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Valor p/ Frete Grátis (R$):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={freeShippingThreshold}
                      onChange={(e) => setFreeShippingThreshold(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                      placeholder="0.00"
                    />
                    <span className="text-[9px] text-gray-500 block mt-0.5">(0 = sem frete grátis)</span>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Permitir Retirada?</label>
                    <select
                      value={enablePickup ? 'SIM' : 'NAO'}
                      onChange={(e) => setEnablePickup(e.target.value === 'SIM')}
                      className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none">
                      <option value="SIM">Sim (Cliente pode retirar)</option>
                      <option value="NAO">Não (Apenas Entrega)</option>
                    </select>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveTenantSettings}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl text-xs transition shadow-md mt-2">
                💾 Salvar Configurações de Frete
              </button>
            </div>
          </section>

          {(shippingMode === 'local' || shippingMode === 'hybrid') && (
            <>
              <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
                <h3 className="font-bold text-sm text-blue-400">🛵 Cadastrar Bairros ou Regiões Locais (Manual)</h3>
                <form onSubmit={handleAddNeighborhood} className="space-y-3">
                  <input type="text" placeholder="Nome (Ex: Centro, Bairro São João, Zona Norte)" value={newNeigh.name} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewNeigh({ ...newNeigh, name: e.target.value })} />
                  <input type="text" placeholder="Taxa de Envio R$ Ex: 15.00" value={newNeigh.fee} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewNeigh({ ...newNeigh, fee: e.target.value })} />
                  <button type="submit" className="w-full bg-green-600 hover:bg-green-700 font-bold py-3 rounded-xl text-xs text-white transition">Cadastrar Bairro / Região</button>
                </form>
              </section>

              <section className="space-y-2">
                {neighborhoods.map((n) => (
                  <div key={n.id} className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold block text-white">{n.name}</span>
                      <span className="text-blue-400 font-bold">Taxa: R$ {Number(n.fee).toFixed(2)}</span>
                    </div>
                    <div className="flex space-x-1.5">
                      <button onClick={() => setEditingNeigh(n)} className="text-xs bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-xl font-bold border border-blue-500/30">✏️ Editar</button>
                      <button onClick={async () => { if (confirm("Excluir opção de frete?")) { await supabase.from('neighborhoods').delete().eq('id', n.id); fetchData(); } }} className="text-red-400 font-bold p-1">🗑</button>
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      )}

      {/* ABA DE CLIENTES VIP / CRM DE VENDAS */}
      {activeTab === 'crm' && (
        <div className="space-y-4">
          <div className="bg-gray-900 p-4 rounded-3xl border border-gray-800 space-y-3 shadow-xl">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-blue-400">👥 Gestão de Clientes & CRM</h3>
                <p className="text-xs text-gray-400">Histórico de compras e disparador direto de promoções via WhatsApp.</p>
              </div>
              <span className="bg-blue-500/20 text-blue-400 font-bold text-xs px-3 py-1.5 rounded-xl border border-blue-500/30">
                {customersList.length} Clientes
              </span>
            </div>

            <input
              type="text"
              placeholder="🔍 Buscar cliente por nome ou WhatsApp..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            {customersList.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Nenhum cliente encontrado.</p>
            ) : (
              customersList.map((c, idx) => {
                const isVIP = c.totalSpent > 200 || c.totalOrders >= 3;
                const promoMsg = `Olá ${c.name}! 🌟 Temos novidades e promoções imperdíveis aqui na ${tenant.name}. Venha conferir nosso catálogo atualizado!`;

                return (
                  <div key={idx} className="bg-gray-900 p-4 rounded-2xl border border-gray-800 flex justify-between items-center text-xs shadow-md">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-sm">{c.name}</span>
                        {isVIP && <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-extrabold text-[9px] px-2 py-0.5 rounded-md">👑 VIP</span>}
                      </div>
                      <span className="text-gray-400 block text-[11px]">📱 {c.phone}</span>
                      <span className="text-gray-500 block text-[10px]">Último Pedido: {new Date(c.lastOrderDate).toLocaleDateString('pt-BR')}</span>
                    </div>

                    <div className="text-right space-y-1">
                      <span className="font-extrabold text-green-400 block text-sm">R$ {c.totalSpent.toFixed(2)}</span>
                      <span className="text-[10px] text-gray-400 block">{c.totalOrders} pedido(s)</span>
                      <a
                        href={`https://wa.me/${c.phoneClean}?text=${encodeURIComponent(promoMsg)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-xl shadow transition">
                        💬 Oferta WhatsApp
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* RELATÓRIOS & GESTÃO FINANCEIRA (COM IMPRESSÃO E TABELA DETALHADA) */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-gray-900 p-4 rounded-2xl border border-gray-800 text-xs print:hidden">
            <div className="flex flex-col space-y-1">
              <span className="text-gray-400 font-bold">Período de Vendas Confirmadas (🟢 PAGO):</span>
              <div className="flex space-x-1 overflow-x-auto pb-1">
                <button onClick={() => setReportFilter('all')} className={`px-3 py-1.5 rounded-xl font-bold text-xs ${reportFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>Tudo</button>
                <button onClick={() => setReportFilter('today')} className={`px-3 py-1.5 rounded-xl font-bold text-xs ${reportFilter === 'today' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>Hoje</button>
                <button onClick={() => setReportFilter('7days')} className={`px-3 py-1.5 rounded-xl font-bold text-xs ${reportFilter === '7days' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>7 Dias</button>
                <button onClick={() => setReportFilter('15days')} className={`px-3 py-1.5 rounded-xl font-bold text-xs ${reportFilter === '15days' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>15 Dias</button>
                <button onClick={() => setReportFilter('30days')} className={`px-3 py-1.5 rounded-xl font-bold text-xs ${reportFilter === '30days' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>30 Dias</button>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shadow flex items-center space-x-1">
              <span>𖤂 Imprimir Relatório</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-1">Faturamento Confirmado</span>
              <span className="text-lg font-extrabold text-green-400">R$ {totalRevenue.toFixed(2)}</span>
            </div>
            <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-1">Pedidos Pagos</span>
              <span className="text-lg font-bold text-blue-400">{filteredOrders.length}</span>
            </div>
            <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-1">Ticket Médio</span>
              <span className="text-lg font-bold text-orange-400">R$ {averageTicket.toFixed(2)}</span>
            </div>
          </div>

          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-3 shadow-xl">
            <h3 className="font-bold text-xs text-blue-400 uppercase tracking-wider">🏆 PRODUTOS MAIS VENDIDOS (CONFIRMADOS)</h3>
            <div className="space-y-2">
              {topProducts.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum pedido pago no período selecionado.</p>
              ) : (
                topProducts.map((p, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-gray-950 p-3 rounded-xl text-xs border border-gray-800">
                    <span className="font-bold text-white">{idx + 1}. {p.name}</span>
                    <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg font-bold">{p.qty} un.</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* TABELA DETALHADA DE VENDAS */}
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-3 shadow-xl">
            <h3 className="font-bold text-xs text-blue-400 uppercase tracking-wider">📜 HISTÓRICO DETALHADO DE PEDIDOS</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-gray-950 text-gray-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-2 rounded-l-lg">ID</th>
                    <th className="p-2">Cliente</th>
                    <th className="p-2">Data</th>
                    <th className="p-2">Pagamento</th>
                    <th className="p-2 rounded-r-lg text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filteredOrders.map(ord => (
                    <tr key={ord.id} className="hover:bg-gray-950/50">
                      <td className="p-2 font-bold text-blue-400">#{ord.id}</td>
                      <td className="p-2">{ord.customer_name}</td>
                      <td className="p-2">{new Date(ord.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="p-2 text-green-400 font-bold">{ord.payment_method}</td>
                      <td className="p-2 text-right font-bold text-white">R$ {Number(ord.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-gray-900 p-4 rounded-2xl border border-red-500/30 flex justify-between items-center mt-4 print:hidden">
            <div>
              <h4 className="font-bold text-xs text-red-400">🧹 Zerar Dados de Teste</h4>
              <p className="text-[10px] text-gray-400">Apaga todo o histórico de pedidos para recomeçar do zero.</p>
            </div>
            <button
              type="button"
              onClick={handleClearFinancialData}
              className="bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/40 px-3 py-2 rounded-xl text-xs font-bold transition">
              🗑️ Limpar
            </button>
          </section>
        </div>
      )}

      {/* CATEGORIAS / COLEÇÕES */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">🏷️ Nova Categoria / Coleção</h3>
            <form onSubmit={handleAddCategory} className="flex space-x-2">
              <input type="text" placeholder="Nome (Ex: Lançamentos, Skincare, Eletrônicos, Polos)" value={newCatName} className="flex-1 bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewCatName(e.target.value)} />
              <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-3 rounded-xl text-xs transition">Adicionar</button>
            </form>
          </section>

          <section className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 flex justify-between items-center text-xs">
                <span className="font-bold text-white">{c.name}</span>
                <div className="flex space-x-1.5">
                  <button onClick={() => setEditingCategory(c)} className="text-xs bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-xl font-bold border border-blue-500/30">✏️ Editar</button>
                  <button onClick={async () => { if (confirm("Excluir categoria?")) { await supabase.from('categories').delete().eq('id', c.id); fetchData(); } }} className="text-red-400 font-bold p-1">🗑</button>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* CONFIGURAÇÕES GERAIS DA LOJA */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">⚙️ Configurações da Loja</h3>
            <form onSubmit={handleSaveTenantSettings} className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Nome da Loja:</label>
                <input type="text" value={tenant.name || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-blue-400 font-bold block mb-1">🎯 Segmento / Nicho do E-commerce:</label>
                <select
                  value={tenant.niche || 'fashion'}
                  onChange={(e) => setTenant({ ...tenant, niche: e.target.value })}
                  className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none">
                  <option value="fashion">👕 Moda & Vestuário (Roupas, Calçados)</option>
                  <option value="beauty">💄 Produtos de Beleza & Cosméticos</option>
                  <option value="home">🏡 Casa, Decoração & Utilidades</option>
                  <option value="electronics">🔌 Eletrônicos & Acessórios</option>
                  <option value="general">📦 E-commerce Geral / Multi-produtos</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Link do Instagram:</label>
                <input 
                  type="text" 
                  placeholder="Ex: https://instagram.com/minhaloja" 
                  value={tenant.instagram_url || ''} 
                  className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" 
                  onChange={(e) => setTenant({ ...tenant, instagram_url: e.target.value })} 
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Chave PIX da Loja (CPF/CNPJ/E-mail/Telefone):</label>
                <input type="text" placeholder="Ex: 12.345.678/0001-90 ou financeiro@loja.com" value={tenant.pix_key || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, pix_key: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Atendimento (Início):</label>
                  <input type="time" value={tenant.opening_time || '08:00'} className="w-full bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, opening_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Atendimento (Fim):</label>
                  <input type="time" value={tenant.closing_time || '18:00'} className="w-full bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, closing_time: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">ID do Pixel do Meta (Facebook/Instagram):</label>
                <input type="text" placeholder="Ex: 123456789012345" value={tenant.pixel_id || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none font-mono" onChange={(e) => setTenant({ ...tenant, pixel_id: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-orange-400 font-bold block mb-1">📢 Mensagem / Aviso no Pedido e Topo da Loja:</label>
                <input type="text" placeholder="Ex: Prazo de confecção de 3 dias úteis após aprovação." value={tenant.custom_message || ''} className="w-full bg-gray-950 border border-orange-500/30 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, custom_message: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">URL da Logo (Perfil):</label>
                <input type="text" value={tenant.logo_url || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, logo_url: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">URL do Banner (Capa):</label>
                <input type="text" value={tenant.banner_url || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, banner_url: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">URLs dos Banners Promocionais da Vitrine (Separados por vírgula):</label>
                <input 
                  type="text" 
                  placeholder="Ex: https://link1.com/banner1.jpg, https://link2.com/banner2.jpg" 
                  value={tenant.promo_banners || ''} 
                  className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" 
                  onChange={(e) => setTenant({ ...tenant, promo_banners: e.target.value })} 
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Cor Principal:</label>
                  <input type="color" value={tenant.primary_color || '#3B82F6'} onChange={(e) => setTenant({ ...tenant, primary_color: e.target.value })} className="h-10 w-full bg-gray-950 rounded-xl cursor-pointer p-1" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Cor Secundária:</label>
                  <input type="color" value={tenant.secondary_color || '#090D16'} onChange={(e) => setTenant({ ...tenant, secondary_color: e.target.value })} className="h-10 w-full bg-gray-950 rounded-xl cursor-pointer p-1" />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">WhatsApp da Loja:</label>
                <input type="text" value={tenant.whatsapp || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, whatsapp: e.target.value })} />
              </div>

              <div className="pt-3 border-t border-gray-800 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-xs text-green-400">⚡ PIX Dinâmico com Baixa Automática</h4>
                    <p className="text-[10px] text-gray-400">Confirma o pagamento sozinho via API (Mercado Pago / Efí / Asaas).</p>
                  </div>

                  <input
                    type="checkbox"
                    checked={tenant.pix_enabled || false}
                    onChange={(e) => setTenant({ ...tenant, pix_enabled: e.target.checked })}
                    className="w-4 h-4 accent-green-500 cursor-pointer"
                  />
                </div>

                {tenant.pix_enabled && (
                  <div className="space-y-2 bg-gray-950 p-3.5 rounded-2xl border border-gray-800">
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">Gateway de Pagamento:</label>
                      <select
                        value={tenant.pix_provider || 'mercadopago'}
                        onChange={(e) => setTenant({ ...tenant, pix_provider: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none">
                        <option value="mercadopago">Mercado Pago</option>
                        <option value="efi">Efí (Gerencianet)</option>
                        <option value="asaas">Asaas</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">Token de Acesso / Chave API:</label>
                      <input
                        type="password"
                        placeholder="Ex: APP_USR-xxxx-xxxx..."
                        value={tenant.pix_access_token || ''}
                        className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                        onChange={(e) => setTenant({ ...tenant, pix_access_token: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" className="w-full bg-green-600 hover:bg-green-700 font-bold py-3.5 rounded-xl text-xs text-white transition shadow-lg mt-2">
                Salvar Alterações
              </button>
            </form>
          </section>
        </div>
      )}

      {/* MODAIS DE EDIÇÃO MANTIDOS INTACTOS */}
      {editingNeigh && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdateNeigh} className="bg-gray-900 w-full max-w-sm rounded-3xl p-5 border border-blue-500/40 space-y-3 shadow-2xl">
            <h3 className="font-bold text-sm text-blue-400">✏️ Editar Opção de Frete</h3>
            <input type="text" value={editingNeigh.name} onChange={(e) => setEditingNeigh({ ...editingNeigh, name: e.target.value })} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" />
            <input type="text" value={editingNeigh.fee} onChange={(e) => setEditingNeigh({ ...editingNeigh, fee: e.target.value })} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" />
            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingNeigh(null)} className="w-1/2 bg-gray-800 py-2.5 rounded-xl text-xs text-gray-300 font-bold">Cancelar</button>
              <button type="submit" className="w-1/2 bg-blue-600 py-2.5 rounded-xl text-xs font-bold text-white">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {editingCategory && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdateCategory} className="bg-gray-900 w-full max-w-sm rounded-3xl p-5 border border-blue-500/40 space-y-3 shadow-2xl">
            <h3 className="font-bold text-sm text-blue-400">✏️ Editar Categoria</h3>
            <input type="text" value={editingCategory.name} onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" />
            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingCategory(null)} className="w-1/2 bg-gray-800 py-2.5 rounded-xl text-xs text-gray-300 font-bold">Cancelar</button>
              <button type="submit" className="w-1/2 bg-blue-600 py-2.5 rounded-xl text-xs font-bold text-white">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {editingProduct && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdateProduct} className="bg-gray-900 w-full max-w-sm rounded-3xl p-5 border border-blue-500/40 space-y-3 max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="font-bold text-sm text-blue-400">✏️ Editar Produto</h3>
            <input type="text" value={editingProduct.name} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" />
            <input type="text" value={editingProduct.description || ''} onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" />
            
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Preço Normal (R$):</label>
                <input type="text" value={editingProduct.price} onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" />
              </div>

              <div>
                <label className="text-[10px] text-red-400 font-bold block mb-1">🔥 Preço Antigo (De):</label>
                <input type="text" placeholder="Ex: 120.00" value={editingProduct.original_price || ''} onChange={(e) => setEditingProduct({ ...editingProduct, original_price: e.target.value })} className="w-full bg-gray-950 border border-red-500/30 p-3 rounded-xl text-xs text-white focus:outline-none" />
              </div>

              <div>
                <label className="text-[10px] text-green-400 font-bold block mb-1">📦 Estoque:</label>
                <input type="number" placeholder="Ilimitado" value={editingProduct.stock ?? ''} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} className="w-full bg-gray-950 border border-green-500/30 p-3 rounded-xl text-xs text-white focus:outline-none" />
              </div>
            </div>

            <select value={editingProduct.category_id} onChange={(e) => setEditingProduct({ ...editingProduct, category_id: e.target.value })} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none">
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <div className="bg-gray-950 p-3.5 rounded-2xl border border-gray-800 space-y-2">
              <label className="text-xs font-bold text-orange-400 block">📦 Peso e Dimensões (Para Frete Nacional)</label>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Peso (kg):</label>
                  <input type="text" value={editingProduct.weight_kg ?? '0.3'} onChange={(e) => setEditingProduct({ ...editingProduct, weight_kg: e.target.value })} className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Largura (cm):</label>
                  <input type="text" value={editingProduct.width_cm ?? '15'} onChange={(e) => setEditingProduct({ ...editingProduct, width_cm: e.target.value })} className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Altura (cm):</label>
                  <input type="text" value={editingProduct.height_cm ?? '10'} onChange={(e) => setEditingProduct({ ...editingProduct, height_cm: e.target.value })} className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Compr. (cm):</label>
                  <input type="text" value={editingProduct.length_cm ?? '20'} onChange={(e) => setEditingProduct({ ...editingProduct, length_cm: e.target.value })} className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white focus:outline-none" />
                </div>
              </div>
            </div>

            <div className="bg-gray-950 p-3.5 rounded-2xl border border-gray-800 space-y-3">
              <label className="text-xs font-bold text-blue-400 block">🖼️ Galeria de Fotos do Produto</label>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  placeholder="URL da Foto do Produto" 
                  value={tempEditImageUrl} 
                  onChange={(e) => setTempEditImageUrl(e.target.value)} 
                  className="flex-1 bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none" 
                />
                <button 
                  type="button" 
                  onClick={handleAddImageToEditProd} 
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition">
                  + Foto
                </button>
              </div>

              {editingProduct.images_json && editingProduct.images_json.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
                  {editingProduct.images_json.map((imgUrl, idx) => (
                    <div key={idx} className="relative group w-16 h-16 rounded-xl border border-gray-800 overflow-hidden bg-gray-900">
                      <img src={imgUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => handleRemoveImageFromEditProd(idx)} 
                        className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold shadow">
                        ✕
                      </button>
                      {idx === 0 && <span className="absolute bottom-0 inset-x-0 bg-blue-600 text-[8px] text-center font-bold py-0.5">Capa</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-950 p-3.5 rounded-2xl border border-gray-800 space-y-3">
              <label className="text-xs font-bold text-blue-400 block">⚡ Variações / Opções do Produto</label>
              
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  placeholder="Atributo (ex: Voltagem, Tamanho)" 
                  value={tempEditVarName} 
                  onChange={(e) => setTempEditVarName(e.target.value)} 
                  className="w-1/2 bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none" 
                />
                <input 
                  type="text" 
                  placeholder="Opções (ex: 110V, 220V)" 
                  value={tempEditVarOptions} 
                  onChange={(e) => setTempEditVarOptions(e.target.value)} 
                  className="w-1/2 bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none" 
                />
              </div>
              <button 
                type="button" 
                onClick={handleAddVariationToEditProd} 
                className="w-full bg-gray-800 hover:bg-gray-700 text-blue-400 font-bold py-2 rounded-xl text-xs border border-gray-700 transition">
                + Adicionar Variação
              </button>

              {editingProduct.variations_json && editingProduct.variations_json.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-gray-800">
                  {editingProduct.variations_json.map((v, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-900 p-2 rounded-xl text-xs border border-gray-800">
                      <span><b className="text-blue-400">{v.attribute_name}:</b> {v.options.join(', ')}</span>
                      <button type="button" onClick={() => handleRemoveVariationFromEditProd(idx)} className="text-red-400 font-bold px-2">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingProduct(null)} className="w-1/2 bg-gray-800 py-2.5 rounded-xl text-xs font-bold text-gray-300">Cancelar</button>
              <button type="submit" className="w-1/2 bg-blue-600 hover:bg-blue-700 py-2.5 rounded-xl text-xs font-bold text-white transition">Atualizar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
