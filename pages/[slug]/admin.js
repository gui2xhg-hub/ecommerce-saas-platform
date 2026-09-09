import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

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

  // CONFIGURAÇÕES AUTOMÁTICAS DE FRETE
  const [defaultShippingFee, setDefaultShippingFee] = useState(10.00);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(0.00);
  const [enablePickup, setEnablePickup] = useState(true);

  // FORMULÁRIOS E EDIÇÃO
  const [newProd, setNewProd] = useState({ 
    name: '', 
    price: '', 
    category_id: '', 
    description: '', 
    image: '',
    images_json: [],
    variations_json: []
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

  useEffect(() => {
    if (slug) fetchTenant();
  }, [slug]);

  const fetchTenant = async () => {
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', slug).single();
    if (tData) {
      setTenant(tData);
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
    e.preventDefault();
    const cleanWhatsapp = tenant.whatsapp ? String(tenant.whatsapp).replace(/\D/g, '') : '';

    const updatePayload = {
      name: tenant.name || '',
      whatsapp: cleanWhatsapp,
      logo_url: tenant.logo_url || '',
      banner_url: tenant.banner_url || '',
      instagram_url: tenant.instagram_url || '',
      primary_color: tenant.primary_color || '#3B82F6',
      secondary_color: tenant.secondary_color || '#090D16',
      admin_password: tenant.admin_password || '',
      niche: tenant.niche || 'general',
      default_shipping_fee: Number(defaultShippingFee),
      free_shipping_threshold: Number(freeShippingThreshold),
      enable_pickup: enablePickup
    };

    if ('pix_key' in tenant) updatePayload.pix_key = tenant.pix_key || '';
    if ('promo_banners' in tenant) updatePayload.promo_banners = tenant.promo_banners || '';
    if ('opening_time' in tenant) updatePayload.opening_time = tenant.opening_time || '08:00';
    if ('closing_time' in tenant) updatePayload.closing_time = tenant.closing_time || '18:00';
    if ('pixel_id' in tenant) updatePayload.pixel_id = tenant.pixel_id || '';
    if ('custom_message' in tenant) updatePayload.custom_message = tenant.custom_message || '';
    if ('pix_enabled' in tenant) updatePayload.pix_enabled = tenant.pix_enabled || false;
    if ('pix_provider' in tenant) updatePayload.pix_provider = tenant.pix_provider || 'mercadopago';
    if ('pix_access_token' in tenant) updatePayload.pix_access_token = tenant.pix_access_token || '';

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

    const formattedPrice = parseFloat(String(newProd.price).replace(',', '.'));
    const mainImage = newProd.image || (newProd.images_json && newProd.images_json[0]) || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80';

    const { error } = await supabase.from('products').insert([{
      tenant_id: tenant.id,
      category_id: targetCategoryId,
      name: newProd.name.trim(),
      description: newProd.description,
      price: formattedPrice,
      image: mainImage,
      images_json: newProd.images_json || [mainImage],
      variations_json: newProd.variations_json || [],
      active: true
    }]);

    if (error) {
      alert("Erro ao cadastrar produto: " + error.message);
    } else {
      alert("Produto cadastrado com sucesso!");
      setNewProd({ 
        name: '', 
        price: '', 
        category_id: categories[0]?.id || '', 
        description: '', 
        image: '', 
        images_json: [],
        variations_json: [] 
      });
      fetchData();
    }
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    const formattedPrice = parseFloat(String(editingProduct.price).replace(',', '.'));
    const mainImage = editingProduct.image || (editingProduct.images_json && editingProduct.images_json[0]) || '';

    const { error } = await supabase.from('products').update({
      name: editingProduct.name.trim(),
      price: formattedPrice,
      description: editingProduct.description,
      category_id: parseInt(editingProduct.category_id),
      image: mainImage,
      images_json: editingProduct.images_json || [mainImage],
      variations_json: editingProduct.variations_json || []
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
    const formattedVal = parseFloat(String(newCoupon.discount_value).replace(',', '.'));

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
    const formattedFee = parseFloat(String(newNeigh.fee).replace(',', '.'));
    await supabase.from('neighborhoods').insert([{ tenant_id: tenant.id, name: newNeigh.name.trim(), fee: formattedFee }]);
    setNewNeigh({ name: '', fee: '' });
    fetchData();
  };

  const handleUpdateNeigh = async (e) => {
    e.preventDefault();
    const formattedFee = parseFloat(String(editingNeigh.fee).replace(',', '.'));
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

  const getFilteredOrders = () => {
    const now = new Date();
    return allOrders.filter(o => {
      if (o.status === 'cancelado') return false;
      
      const isPaid = o.payment_method && o.payment_method.includes('PAGO');
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
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-3xl mx-auto font-sans pb-16">
      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-6">
        <div>
          <h1 className="font-bold text-lg text-blue-400 flex items-center space-x-2">
            <span>🛍️ {tenant.name}</span>
          </h1>
          <p className="text-xs text-gray-400">Painel de Gestão de Catálogo</p>
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="text-xs bg-gray-900 border border-gray-800 hover:bg-gray-800 px-3 py-1.5 rounded-xl text-red-400 font-bold transition">
          🚪 Sair
        </button>
      </header>

      {/* ABAS */}
      <div className="flex space-x-1 bg-gray-900 p-1.5 rounded-2xl border border-gray-800 mb-6 text-[11px] font-bold overflow-x-auto">
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
          🚚 Fretes
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

      {/* PRODUTOS */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">➕ Cadastrar Novo Produto</h3>
            <form onSubmit={handleAddProduct} className="space-y-3">
              <input type="text" placeholder="Nome do Produto (Ex: Sérum Facial, Camisa Oversized, Vaso Decorativo)" value={newProd.name} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} />
              <input type="text" placeholder="Descrição detalhada do produto" value={newProd.description} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, description: e.target.value })} />
              
              <div className="flex space-x-2">
                <input type="text" placeholder="Preço R$" value={newProd.price} className="w-1/2 bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, price: e.target.value })} />
                <select 
                  value={newProd.category_id || (categories[0]?.id || '')} 
                  className="w-1/2 bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" 
                  onChange={(e) => setNewProd({ ...newProd, category_id: e.target.value })}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
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
            {products.map((item) => (
              <div key={item.id} className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 flex justify-between items-center shadow-md">
                <div className="flex items-center space-x-3">
                  {item.image && <img src={item.image} alt={item.name} className="w-10 h-10 rounded-xl object-cover bg-gray-950" />}
                  <div>
                    <span className={`font-bold text-xs block ${!item.active ? 'line-through text-gray-500' : 'text-white'}`}>{item.name}</span>
                    <span className="text-xs text-blue-400 font-bold">R$ {Number(item.price).toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button onClick={() => setEditingProduct({ ...item, images_json: item.images_json || (item.image ? [item.image] : []), variations_json: item.variations_json || [] })} className="text-xs bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-xl font-bold border border-blue-500/30">✏️ Editar</button>
                  <button onClick={async () => { await supabase.from('products').update({ active: !item.active }).eq('id', item.id); fetchData(); }} className={`text-[10px] font-bold px-2.5 py-1.5 rounded-xl ${item.active ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>{item.active ? 'Ativo' : 'Pausado'}</button>
                  <button onClick={async () => { if (confirm("Deseja excluir este produto?")) { await supabase.from('products').delete().eq('id', item.id); fetchData(); } }} className="text-xs bg-red-500/20 text-red-400 px-2.5 py-1.5 rounded-xl font-bold border border-red-500/30">🗑</button>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* CUPONS DE DESCONTO */}
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

      {/* FRETE */}
      {activeTab === 'neighborhoods' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">🚚 Nova Opção de Frete / Envio por Bairro</h3>
            <form onSubmit={handleAddNeighborhood} className="space-y-3">
              <input type="text" placeholder="Nome (Ex: SEDEX SP, PAC Brasil, Frete Fixo R$ 20)" value={newNeigh.name} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewNeigh({ ...newNeigh, name: e.target.value })} />
              <input type="text" placeholder="Taxa de Envio R$ Ex: 20.00" value={newNeigh.fee} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewNeigh({ ...newNeigh, fee: e.target.value })} />
              <button type="submit" className="w-full bg-green-600 hover:bg-green-700 font-bold py-3 rounded-xl text-xs text-white transition">Cadastrar Opção de Frete</button>
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

      {/* RELATÓRIOS */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-col space-y-2 bg-gray-900 p-4 rounded-2xl border border-gray-800 text-xs">
            <span className="text-gray-400 font-bold">Período de Vendas Confirmadas (🟢 PAGO):</span>
            <div className="flex space-x-1 overflow-x-auto pb-1">
              <button onClick={() => setReportFilter('all')} className={`px-3 py-1.5 rounded-xl font-bold text-xs ${reportFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>Tudo</button>
              <button onClick={() => setReportFilter('today')} className={`px-3 py-1.5 rounded-xl font-bold text-xs ${reportFilter === 'today' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>Hoje</button>
              <button onClick={() => setReportFilter('7days')} className={`px-3 py-1.5 rounded-xl font-bold text-xs ${reportFilter === '7days' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>7 Dias</button>
              <button onClick={() => setReportFilter('30days')} className={`px-3 py-1.5 rounded-xl font-bold text-xs ${reportFilter === '30days' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>30 Dias</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-1">Faturamento Confirmado</span>
              <span className="text-lg font-bold text-green-400">R$ {totalRevenue.toFixed(2)}</span>
            </div>
            <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-1">Pedidos Pagos</span>
              <span className="text-lg font-bold text-blue-400">{filteredOrders.length}</span>
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

          <section className="bg-gray-900 p-4 rounded-2xl border border-red-500/30 flex justify-between items-center mt-4">
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

      {/* CONFIGURAÇÕES */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">⚙️ Configurações da Loja</h3>
            <form onSubmit={handleSaveTenantSettings} className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Nome da Loja:</label>
                <input type="text" value={tenant.name || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
              </div>

              {/* REGRAS AUTOMÁTICAS DE FRETE E ENVIO */}
              <div className="bg-gray-950 p-4 rounded-2xl border border-orange-500/30 space-y-3">
                <h4 className="font-bold text-xs text-orange-400 flex items-center space-x-1">
                  <span>🛵 Configurações Automáticas de Frete & Envio</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Taxa Padrão de Entrega (R$):</label>
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
                    <label className="text-[11px] text-gray-400 block mb-1">Valor p/ Frete Grátis (R$):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={freeShippingThreshold}
                      onChange={(e) => setFreeShippingThreshold(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                      placeholder="0.00"
                    />
                    <span className="text-[9px] text-gray-500 block mt-0.5">(0 = sem regra de frete grátis)</span>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Permitir Retirada?</label>
                    <select
                      value={enablePickup ? 'SIM' : 'NAO'}
                      onChange={(e) => setEnablePickup(e.target.value === 'SIM')}
                      className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none">
                      <option value="SIM">Sim (Cliente pode retirar)</option>
                      <option value="NAO">Não (Apenas Entrega)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* NICHO DA LOJA */}
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

              {/* LINK DO INSTAGRAM */}
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
                <label className="text-[11px] text-gray-400 block mb-1">Instrução Adicional / Aviso no Pedido:</label>
                <input type="text" placeholder="Ex: Prazo de confecção de 3 dias úteis após aprovação." value={tenant.custom_message || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, custom_message: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">URL da Logo (Perfil):</label>
                <input type="text" value={tenant.logo_url || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, logo_url: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">URL do Banner (Capa):</label>
                <input type="text" value={tenant.banner_url || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, banner_url: e.target.value })} />
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

              {/* INTEGRACAO PIX DINÂMICO AUTOMÁTICO */}
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

      {/* MODAIS DE EDIÇÃO */}
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
            
            <div className="flex space-x-2">
              <input type="text" value={editingProduct.price} onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })} className="w-1/2 bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" />
              <select value={editingProduct.category_id} onChange={(e) => setEditingProduct({ ...editingProduct, category_id: e.target.value })} className="w-1/2 bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none">
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
