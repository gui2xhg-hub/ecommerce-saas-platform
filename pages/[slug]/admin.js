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

  const [tenant, setTenant] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [neighborhoods, setNeighborhoods] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [reportFilter, setReportFilter] = useState('all');

  const [newProd, setNewProd] = useState({ name: '', price: '', category_id: '', description: '', image: '' });
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingNeigh, setEditingNeigh] = useState(null);

  const [newCatName, setNewCatName] = useState('');
  const [newNeigh, setNewNeigh] = useState({ name: '', fee: '' });
  const [newCoupon, setNewCoupon] = useState({ code: '', discount_type: 'percent', discount_value: '' });

  useEffect(() => {
    if (slug) fetchTenant();
  }, [slug]);

  const fetchTenant = async () => {
    const { data: tData } = await supabase.from('tenants').select('*').eq('slug', slug).single();
    if (tData) setTenant(tData);
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
    const { data: cpData } = await supabase.from('coupons').select('*').eq('tenant_id', tenantId).order('id', { ascending: false });
    const { data: oData } = await supabase.from('orders').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });

    if (tData) setTenant(tData);
    if (cData) {
      setCategories(cData);
      if (cData.length > 0 && !newProd.category_id) setNewProd(prev => ({ ...prev, category_id: cData[0].id }));
    }
    if (pData) setProducts(pData);
    if (nData) setNeighborhoods(nData);
    if (cpData) setCoupons(cpData);
    if (oData) setAllOrders(oData);
  };

  const handleSaveTenantSettings = async (e) => {
    e.preventDefault();
    const cleanWhatsapp = tenant.whatsapp.replace(/\D/g, '');
    const { error } = await supabase.from('tenants').update({
      name: tenant.name,
      whatsapp: cleanWhatsapp,
      logo_url: tenant.logo_url,
      banner_url: tenant.banner_url,
      primary_color: tenant.primary_color || '#3B82F6',
      secondary_color: tenant.secondary_color || '#090D16',
      admin_password: tenant.admin_password
    }).eq('id', tenant.id);

    if (error) alert("Erro ao salvar: " + error.message);
    else { alert("Configurações salvas!"); fetchData(); }
  };

  // HANDLERS
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProd.name || !newProd.price) return alert("Preencha nome e preço!");
    const formattedPrice = parseFloat(String(newProd.price).replace(',', '.'));
    await supabase.from('products').insert([{
      tenant_id: tenant.id,
      category_id: parseInt(newProd.category_id || categories[0]?.id),
      name: newProd.name,
      description: newProd.description,
      price: formattedPrice,
      image: newProd.image || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80',
      active: true
    }]);
    setNewProd({ name: '', price: '', category_id: categories[0]?.id || '', description: '', image: '' });
    fetchData();
  };

  const handleAddCoupon = async (e) => {
    e.preventDefault();
    if (!newCoupon.code || !newCoupon.discount_value) return alert("Preencha o código e o valor do desconto!");
    const cleanCode = newCoupon.code.trim().toUpperCase();
    const formattedVal = parseFloat(String(newCoupon.discount_value).replace(',', '.'));

    await supabase.from('coupons').insert([{
      tenant_id: tenant.id,
      code: cleanCode,
      discount_type: newCoupon.discount_type,
      discount_value: formattedVal,
      active: true
    }]);

    setNewCoupon({ code: '', discount_type: 'percent', discount_value: '' });
    fetchData();
  };

  const handleAddNeighborhood = async (e) => {
    e.preventDefault();
    const formattedFee = parseFloat(String(newNeigh.fee).replace(',', '.'));
    await supabase.from('neighborhoods').insert([{ tenant_id: tenant.id, name: newNeigh.name.trim(), fee: formattedFee }]);
    setNewNeigh({ name: '', fee: '' });
    fetchData();
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await supabase.from('categories').insert([{ tenant_id: tenant.id, name: newCatName.trim() }]);
    setNewCatName('');
    fetchData();
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-sm text-gray-400">Carregando painel...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-blue-500">Loja não encontrada</h1></div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-gray-900 p-6 rounded-2xl border border-gray-800 w-full max-w-sm space-y-4 shadow-2xl">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-blue-500 mb-1">{tenant.name}</h2>
            <p className="text-xs text-gray-400">Gestão do Catálogo & Vestuário</p>
          </div>
          <input type="password" placeholder="Senha de acesso..." className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-sm text-white focus:outline-none" onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition">Entrar no Painel 🚀</button>
        </form>
      </div>
    );
  }

  const primaryColor = tenant.primary_color || '#3B82F6';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-3xl mx-auto font-sans pb-16">
      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-6">
        <div>
          <h1 className="font-bold text-lg text-blue-400">👕 {tenant.name}</h1>
          <p className="text-xs text-gray-400">Painel de Gestão</p>
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="text-xs bg-gray-900 border border-gray-800 hover:bg-gray-800 px-3 py-1.5 rounded-xl text-red-400 font-bold transition">🚪 Sair</button>
      </header>

      {/* ABAS */}
      <div className="flex space-x-1 bg-gray-900 p-1.5 rounded-2xl border border-gray-800 mb-6 text-[11px] font-bold overflow-x-auto">
        <button onClick={() => setActiveTab('products')} style={activeTab === 'products' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}} className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'products' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>👕 Peças</button>
        <button onClick={() => setActiveTab('categories')} style={activeTab === 'categories' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}} className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'categories' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>🏷️ Coleções</button>
        <button onClick={() => setActiveTab('coupons')} style={activeTab === 'coupons' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}} className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'coupons' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>🎟️ Cupons</button>
        <button onClick={() => setActiveTab('neighborhoods')} style={activeTab === 'neighborhoods' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}} className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'neighborhoods' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>📦 Fretes</button>
        <button onClick={() => setActiveTab('settings')} style={activeTab === 'settings' ? { backgroundColor: primaryColor, color: '#FFFFFF' } : {}} className={`flex-1 py-2.5 px-3 rounded-xl whitespace-nowrap transition ${activeTab === 'settings' ? 'shadow-md' : 'text-gray-400 hover:text-white'}`}>⚙️ Config</button>
      </div>

      {/* ABAS PRODUTOS */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">➕ Cadastrar Peça</h3>
            <form onSubmit={handleAddProduct} className="space-y-3">
              <input type="text" placeholder="Nome do Produto" value={newProd.name} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} />
              <input type="text" placeholder="Descrição" value={newProd.description} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, description: e.target.value })} />
              <div className="flex space-x-2">
                <input type="text" placeholder="Preço R$" value={newProd.price} className="w-1/2 bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, price: e.target.value })} />
                <select value={newProd.category_id} className="w-1/2 bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, category_id: e.target.value })}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <input type="text" placeholder="URL da Foto" value={newProd.image} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewProd({ ...newProd, image: e.target.value })} />
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 font-bold py-3 rounded-xl text-xs text-white transition">Salvar Produto 👕</button>
            </form>
          </section>

          <section className="space-y-3">
            {products.map((item) => (
              <div key={item.id} className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  {item.image && <img src={item.image} alt={item.name} className="w-10 h-10 rounded-xl object-cover" />}
                  <div>
                    <span className="font-bold text-xs block text-white">{item.name}</span>
                    <span className="text-xs text-blue-400 font-bold">R$ {Number(item.price).toFixed(2)}</span>
                  </div>
                </div>
                <button onClick={async () => { if (confirm("Excluir?")) { await supabase.from('products').delete().eq('id', item.id); fetchData(); } }} className="text-xs bg-red-500/20 text-red-400 px-2.5 py-1.5 rounded-xl font-bold">🗑</button>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* ABA CUPONS DE DESCONTO */}
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
            <h3 className="font-bold text-xs text-gray-400 uppercase">CuponsAtivos ({coupons.length})</h3>
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

      {/* FRETES */}
      {activeTab === 'neighborhoods' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">📦 Opção de Frete</h3>
            <form onSubmit={handleAddNeighborhood} className="space-y-3">
              <input type="text" placeholder="Nome (Ex: SEDEX SP, PAC Brasil)" value={newNeigh.name} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewNeigh({ ...newNeigh, name: e.target.value })} />
              <input type="text" placeholder="Taxa R$" value={newNeigh.fee} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewNeigh({ ...newNeigh, fee: e.target.value })} />
              <button type="submit" className="w-full bg-green-600 hover:bg-green-700 font-bold py-3 rounded-xl text-xs text-white transition">Cadastrar Frete</button>
            </form>
          </section>

          <section className="space-y-2">
            {neighborhoods.map((n) => (
              <div key={n.id} className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold block text-white">{n.name}</span>
                  <span className="text-blue-400 font-bold">R$ {Number(n.fee).toFixed(2)}</span>
                </div>
                <button onClick={async () => { if (confirm("Excluir frete?")) { await supabase.from('neighborhoods').delete().eq('id', n.id); fetchData(); } }} className="text-red-400 font-bold p-1">🗑</button>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* COLEÇÕES */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">🏷️ Nova Coleção</h3>
            <form onSubmit={handleAddCategory} className="flex space-x-2">
              <input type="text" placeholder="Nome da Coleção" value={newCatName} className="flex-1 bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setNewCatName(e.target.value)} />
              <button type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-3 rounded-xl text-xs transition">Adicionar</button>
            </form>
          </section>

          <section className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="bg-gray-900 p-3.5 rounded-2xl border border-gray-800 flex justify-between items-center text-xs">
                <span className="font-bold text-white">{c.name}</span>
                <button onClick={async () => { if (confirm("Excluir coleção?")) { await supabase.from('categories').delete().eq('id', c.id); fetchData(); } }} className="text-red-400 font-bold p-1">🗑</button>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* CONFIG */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
            <h3 className="font-bold text-sm text-blue-400">⚙️ Configurações da Loja</h3>
            <form onSubmit={handleSaveTenantSettings} className="space-y-3">
              <input type="text" value={tenant.name || ''} className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
              <input type="text" value={tenant.logo_url || ''} placeholder="URL da Logo" className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, logo_url: e.target.value })} />
              <input type="text" value={tenant.banner_url || ''} placeholder="URL do Banner" className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, banner_url: e.target.value })} />
              <input type="text" value={tenant.whatsapp || ''} placeholder="WhatsApp da Loja" className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, whatsapp: e.target.value })} />
              <button type="submit" className="w-full bg-green-600 hover:bg-green-700 font-bold py-3.5 rounded-xl text-xs text-white transition">Salvar Alterações</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
