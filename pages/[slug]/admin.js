import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { apiLogin, checkSession, migrateLegacyLogin, saveToken, clearToken } from '../../lib/clientAuth';
import { linkPushToTenant } from '../../lib/push';

const DEFAULT_WORK_HOURS = {
  1: { open: '08:00', close: '18:00' },
  2: { open: '08:00', close: '18:00' },
  3: { open: '08:00', close: '18:00' },
  4: { open: '08:00', close: '18:00' },
  5: { open: '08:00', close: '18:00' },
  6: { open: '08:00', close: '18:00' },
  0: { open: '08:00', close: '18:00' }
};

const DEFAULT_DAILY_NOTICES = {
  '0': '', // Domingo
  '1': '', // Segunda
  '2': '', // Terça
  '3': '', // Quarta
  '4': '', // Quinta
  '5': '', // Sexta
  '6': ''  // Sábado
};

// FUNÇÃO AUXILIAR PARA FORMATAR MINUTOS EM HORAS E MINUTOS
const formatDuration = (minutes) => {
  const mins = Number(minutes) || 0;
  if (mins <= 0) return '30 min';
  if (mins < 60) return `${mins} min`;

  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;

  if (remMins === 0) return `${hrs}h`;
  return `${hrs}h ${remMins}min`;
};

// COMPONENTE DE SELEÇÃO/ENTRADA DE DURAÇÃO (COM OPÇÃO PERSONALIZADA DE HORAS E MINUTOS)
const PRESET_DURATIONS = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 180, 210, 240];

function DurationInput({ value, onChange }) {
  const currentMins = Number(value) || 30;
  const isPreset = PRESET_DURATIONS.includes(currentMins);
  const [isCustom, setIsCustom] = useState(!isPreset);

  useEffect(() => {
    if (!PRESET_DURATIONS.includes(Number(value) || 30)) {
      setIsCustom(true);
    }
  }, [value]);

  const hours = Math.floor(currentMins / 60);
  const mins = currentMins % 60;

  const handleSelectChange = (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustom(true);
    } else {
      setIsCustom(false);
      onChange(val);
    }
  };

  const handleCustomChange = (newH, newM) => {
    const h = Math.max(0, parseInt(newH) || 0);
    const m = Math.max(0, parseInt(newM) || 0);
    const total = h * 60 + m;
    onChange(total.toString());
  };

  return (
    <div className="w-1/3 flex flex-col gap-1">
      <select
        value={isCustom ? 'custom' : currentMins.toString()}
        onChange={handleSelectChange}
        className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
      >
        <option value="15">15 min</option>
        <option value="30">30 min</option>
        <option value="45">45 min</option>
        <option value="60">1 hora</option>
        <option value="75">1h 15min</option>
        <option value="90">1h 30min</option>
        <option value="105">1h 45min</option>
        <option value="120">2 horas</option>
        <option value="135">2h 15min</option>
        <option value="150">2h 30min</option>
        <option value="180">3 horas</option>
        <option value="210">3h 30min</option>
        <option value="240">4 horas</option>
        <option value="custom">✏️ Outro (Personalizado)...</option>
      </select>

      {isCustom && (
        <div className="flex items-center space-x-1 bg-gray-800 border border-gray-700 p-1.5 rounded-lg text-xs">
          <div className="flex items-center space-x-1 flex-1">
            <input
              type="number"
              min="0"
              max="24"
              placeholder="0"
              value={hours || ''}
              onChange={(e) => handleCustomChange(e.target.value, mins)}
              className="w-full bg-gray-900 border border-gray-700 p-1 rounded text-center text-xs text-white focus:outline-none font-bold"
            />
            <span className="text-[10px] text-gray-400">h</span>
          </div>
          <div className="flex items-center space-x-1 flex-1">
            <input
              type="number"
              min="0"
              max="59"
              placeholder="0"
              value={mins || ''}
              onChange={(e) => handleCustomChange(hours, e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 p-1 rounded text-center text-xs text-white focus:outline-none font-bold"
            />
            <span className="text-[10px] text-gray-400">min</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminTenant() {
  const router = useRouter();
  const { slug } = router.query;

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('services'); // services, professionals, customers, appointments, reports, bot, links, settings
  const [loading, setLoading] = useState(true);

  const [tenant, setTenant] = useState(null);
  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [reportFilter, setReportFilter] = useState('all');

  // FILTRO CUSTOMIZADO DE DATAS NO FINANCEIRO
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // GESTÃO DA AGENDA DE AGENDAMENTOS
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState('all');
  const [appointmentProfFilter, setAppointmentProfFilter] = useState('');
  const [appointmentSearch, setAppointmentSearch] = useState('');

  // PROTEÇÃO DE VALORES NA ABA AGENDA POR PIN
  const [isAgendaPricesUnlocked, setIsAgendaPricesUnlocked] = useState(false);
  const [showAgendaPinModal, setShowAgendaPinModal] = useState(false);
  const [agendaPinInput, setAgendaPinInput] = useState('');

  // GESTÃO DE CLIENTES & OBSERVAÇÕES & FIDELIDADE
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerProfFilter, setCustomerProfFilter] = useState('');
  const [customerNotesMap, setCustomerNotesMap] = useState({});
  const [customerStampsMap, setCustomerStampsMap] = useState({});
  const [savingNotePhone, setSavingNotePhone] = useState(null);

  // CONTROLE DO FINANCEIRO GERAL / SENHA FINANCIAL
  const [isGlobalFinUnlocked, setIsGlobalFinUnlocked] = useState(false);
  const [adminFinPass, setAdminFinPass] = useState('');

  // CONTROLE DE SEGURANÇA PARA ALTERAÇÃO DE SENHA FINANCEIRA
  const [originalFinPass, setOriginalFinPass] = useState('');
  const [oldFinPassInput, setOldFinPassInput] = useState('');
  const [newFinPassInput, setNewFinPassInput] = useState('');

  // CONTROLE DO FINANCEIRO INDIVIDUAL / PIN
  const [finViewMode, setFinViewMode] = useState('global'); // 'global' ou 'individual'
  const [selectedProfForFin, setSelectedProfForFin] = useState('');
  const [inputProfPin, setInputProfPin] = useState('');
  const [isProfFinUnlocked, setIsProfFinUnlocked] = useState(false);
  const [unlockedProfData, setUnlockedProfData] = useState(null);

  // CONTROLE DE DIVULGAÇÃO & LINKS
  const [selectedProfForLink, setSelectedProfForLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // NORMAS DE DIAS DA SEMANA (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
  const ALL_DAYS = [
    { id: 1, label: 'Seg' },
    { id: 2, label: 'Ter' },
    { id: 3, label: 'Qua' },
    { id: 4, label: 'Qui' },
    { id: 5, label: 'Sex' },
    { id: 6, label: 'Sáb' },
    { id: 0, label: 'Dom' }
  ];

  const [newService, setNewService] = useState({ 
    name: '', 
    price: '', 
    duration_minutes: '30', 
    category: '', 
    professional_ids: [],
    image_url: ''
  });
  const [editingService, setEditingService] = useState(null);

  const [newProf, setNewProf] = useState({ 
    name: '', 
    phone: '', 
    specialty: '',
    avatar_url: '', 
    instagram_url: '',
    commission_percentage: '50',
    work_days: [1, 2, 3, 4, 5, 6],
    work_hours: DEFAULT_WORK_HOURS,
    break_start: '12:00',
    break_end: '13:00',
    pin: '1234',
    bot_message_template: ''
  });
  const [editingProf, setEditingProf] = useState(null);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenant();
    }
  }, [router.isReady, slug]);

  const fetchTenant = async () => {
    setLoading(true);
    const cleanSlug = String(slug).toLowerCase().trim();
    let tData = null;
    try {
      const resp = await fetch(`/api/public-tenant?slug=${encodeURIComponent(cleanSlug)}`);
      const json = await resp.json();
      tData = json.tenant || null;
    } catch (err) {
      console.error('Erro ao carregar estabelecimento:', err);
    }

    if (tData) {
      const currentFinPass = tData.financial_password || '';
      setTenant({
        ...tData,
        financial_password: currentFinPass,
        share_template: tData.share_template || 'Olá! Agende seu horário no *{empresa}* com *{profissional}* acessando: {link}',
        bot_enabled: tData.bot_enabled || false,
        bot_send_time: tData.bot_send_time || '08:00',
        bot_message_template: tData.bot_message_template || 'Olá {cliente}! 👋 Passando para lembrar do seu agendamento de *{servico}* amanhã ({data}) às *{horario}* no *{empresa}* com *{profissional}*.',
        bot_whatsapp_instance: tData.bot_whatsapp_instance || '',
        bot_whatsapp_token: tData.bot_whatsapp_token || '',
        loyalty_enabled: tData.loyalty_enabled || false,
        loyalty_target_visits: tData.loyalty_target_visits ?? 10,
        loyalty_reward_text: tData.loyalty_reward_text || '1 Atendimento Cortesia',
        daily_notices: tData.daily_notices && typeof tData.daily_notices === 'object'
          ? { ...DEFAULT_DAILY_NOTICES, ...tData.daily_notices }
          : DEFAULT_DAILY_NOTICES
      });

      setOriginalFinPass(currentFinPass);
      setNewFinPassInput(currentFinPass);

      // Login lembrado neste aparelho (o login antigo é convertido automaticamente, sem pedir senha de novo)
      let level = await checkSession(cleanSlug);
      if (level !== 'admin') level = await migrateLegacyLogin(cleanSlug);
      if (level === 'admin') {
        setIsAuthenticated(true);
        linkPushToTenant(tData.id);
        await fetchData(tData.id);
      }
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    // A senha é conferida no servidor (a senha mestra não fica mais no código do site)
    const res = await apiLogin(tenant.slug, 'admin', password);

    if (res.ok && res.token) {
      saveToken(tenant.slug, res.token);
      setIsAuthenticated(true);
      linkPushToTenant(tenant.id);
      fetchData(tenant.id);
    } else {
      alert(res.error && res.error !== 'Senha incorreta' ? res.error : 'Senha incorreta!');
    }
  };

  const fetchData = async (tenantId = tenant?.id) => {
    if (!tenantId) return;
    const { data: tData } = await supabase.from('tenants').select('*').eq('id', tenantId).single();

    const { data: sData } = await supabase
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: true })
      .order('id', { ascending: true });

    const { data: pData } = await supabase.from('professionals').select('*').eq('tenant_id', tenantId).order('id', { ascending: true });
    const { data: aData } = await supabase.from('appointments').select('*').eq('tenant_id', tenantId).order('appointment_date', { ascending: false });

    const { data: cData } = await supabase.from('tenant_customers').select('customer_phone, notes, loyalty_stamps').eq('tenant_id', tenantId);

    if (tData) {
      const currentFinPass = tData.financial_password || '';
      setTenant({
        ...tData,
        financial_password: currentFinPass,
        share_template: tData.share_template || 'Olá! Agende seu horário no *{empresa}* com *{profissional}* acessando: {link}',
        bot_enabled: tData.bot_enabled || false,
        bot_send_time: tData.bot_send_time || '08:00',
        bot_message_template: tData.bot_message_template || 'Olá {cliente}! 👋 Passando para lembrar do seu agendamento de *{servico}* amanhã ({data}) às *{horario}* no *{empresa}* com *{profissional}*.',
        bot_whatsapp_instance: tData.bot_whatsapp_instance || '',
        bot_whatsapp_token: tData.bot_whatsapp_token || '',
        loyalty_enabled: tData.loyalty_enabled || false,
        loyalty_target_visits: tData.loyalty_target_visits ?? 10,
        loyalty_reward_text: tData.loyalty_reward_text || '1 Atendimento Cortesia',
        daily_notices: tData.daily_notices && typeof tData.daily_notices === 'object'
          ? { ...DEFAULT_DAILY_NOTICES, ...tData.daily_notices }
          : DEFAULT_DAILY_NOTICES
      });

      setOriginalFinPass(currentFinPass);
      setNewFinPassInput(currentFinPass);
    }
    if (sData) setServices(sData);
    if (pData) setProfessionals(pData);
    if (aData) setAppointments(aData);

    if (cData) {
      const nMap = {};
      const sMap = {};
      cData.forEach(cn => {
        if (cn.customer_phone) {
          const cleanP = cn.customer_phone.replace(/\D/g, '');
          nMap[cleanP] = cn.notes || '';
          sMap[cleanP] = cn.loyalty_stamps ?? 0;
        }
      });
      setCustomerNotesMap(nMap);
      setCustomerStampsMap(sMap);
    }
  };

  const handleMoveService = async (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= services.length) return;

    const newServices = [...services];
    const temp = newServices[index];
    newServices[index] = newServices[targetIndex];
    newServices[targetIndex] = temp;

    setServices(newServices);

    await Promise.all(
      newServices.map((service, i) =>
        supabase
          .from('services')
          .update({ position: i })
          .eq('id', service.id)
      )
    );
  };

  const existingCategories = Array.from(
    new Set(
      services
        .map(s => (s.category ? s.category.trim() : ''))
        .filter(c => c !== '')
    )
  );

  const handleSaveCustomerNote = async (phone, name, noteText) => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) return;

    setSavingNotePhone(cleanPhone);

    const { error } = await supabase
      .from('tenant_customers')
      .upsert({
        tenant_id: tenant.id,
        customer_phone: cleanPhone,
        customer_name: name,
        notes: noteText
      }, { onConflict: 'tenant_id,customer_phone' });

    setSavingNotePhone(null);

    if (error) {
      alert("Erro ao salvar observação: " + error.message);
    } else {
      setCustomerNotesMap(prev => ({ ...prev, [cleanPhone]: noteText }));
      alert("✓ Observação do cliente salva com sucesso!");
    }
  };

  const handleResetCustomerStamps = async (phone, name) => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) return;

    if (!confirm(`🎁 Confirmar resgate da recompensa de ${name}?\n\nIsso zerará a cartela de selos para que ele(a) recomece um novo ciclo.`)) return;

    const { error } = await supabase
      .from('tenant_customers')
      .upsert({
        tenant_id: tenant.id,
        customer_phone: cleanPhone,
        customer_name: name,
        loyalty_stamps: 0
      }, { onConflict: 'tenant_id,customer_phone' });

    if (error) {
      alert("Erro ao resgatar cartão fidelidade: " + error.message);
    } else {
      setCustomerStampsMap(prev => ({ ...prev, [cleanPhone]: 0 }));
      alert(`🎉 Prêmio resgatado com sucesso! Cartão Fidelidade de ${name} foi zerado.`);
    }
  };

  const handleAdjustCustomerStamps = async (phone, name, currentStamps, delta) => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) return;
    const newStamps = Math.max(0, (currentStamps || 0) + delta);

    const { error } = await supabase
      .from('tenant_customers')
      .upsert({
        tenant_id: tenant.id,
        customer_phone: cleanPhone,
        customer_name: name,
        loyalty_stamps: newStamps
      }, { onConflict: 'tenant_id,customer_phone' });

    if (error) {
      alert("Erro ao atualizar selos: " + error.message);
    } else {
      setCustomerStampsMap(prev => ({ ...prev, [cleanPhone]: newStamps }));
    }
  };

  const handleSaveTenantSettings = async (e) => {
    if (e) e.preventDefault();

    let finalFinPassword = originalFinPass;

    if (originalFinPass && originalFinPass.trim() !== '') {
      if (newFinPassInput.trim() !== originalFinPass) {
        if (oldFinPassInput.trim() !== originalFinPass) {
          const chk = await apiLogin(tenant.slug, 'change_fin_pass', oldFinPassInput);
          if (!chk.ok) {
            return alert("❌ Para alterar a Senha Financeira, você precisa informar a Senha Financeira ATUAL (antiga) corretamente!");
          }
        }
        finalFinPassword = newFinPassInput.trim();
      }
    } else {
      finalFinPassword = newFinPassInput.trim();
    }

    const cleanWhatsapp = tenant.whatsapp ? tenant.whatsapp.replace(/\D/g, '') : '';
    const { error } = await supabase.from('tenants').update({
      name: tenant.name,
      whatsapp: cleanWhatsapp,
      logo_url: tenant.logo_url,
      banner_url: tenant.banner_url,
      instagram_url: tenant.instagram_url || '',
      primary_color: tenant.primary_color || '#FF8C00',
      secondary_color: tenant.secondary_color || '#111827',
      custom_message: tenant.custom_message || '',
      share_template: tenant.share_template || '',
      admin_password: tenant.admin_password,
      financial_password: finalFinPassword,
      pix_enabled: tenant.pix_enabled || false,
      pix_provider: tenant.pix_provider || 'mercadopago',
      pix_access_token: tenant.pix_access_token || '',
      bot_enabled: tenant.bot_enabled || false,
      bot_send_time: tenant.bot_send_time || '08:00',
      bot_message_template: tenant.bot_message_template || '',
      bot_whatsapp_instance: tenant.bot_whatsapp_instance || '',
      bot_whatsapp_token: tenant.bot_whatsapp_token || '',
      loyalty_enabled: tenant.loyalty_enabled || false,
      loyalty_target_visits: parseInt(tenant.loyalty_target_visits || 10),
      loyalty_reward_text: tenant.loyalty_reward_text || '',
      daily_notices: tenant.daily_notices || DEFAULT_DAILY_NOTICES
    }).eq('id', tenant.id);

    if (error) {
      alert("Erro ao salvar configurações: " + error.message);
    } else { 
      alert("Configurações salvas com sucesso!"); 
      setOldFinPassInput('');
      fetchData(); 
    }
  };

  const handleClearFinancialData = async () => {
    if (confirm("⚠️ ATENÇÃO: Tem certeza que deseja zerar TODOS os agendamentos e dados financeiros?\n\nEsta ação vai apagar definitivamente todos os agendamentos de teste. Não poderá ser desfeito!")) {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('tenant_id', tenant.id);

      if (error) {
        alert("Erro ao limpar financeiro: " + error.message);
      } else {
        alert("Histórico financeiro e agendamentos zerados com sucesso!");
        fetchData();
      }
    }
  };

  const handleAddService = async (e) => {
    e.preventDefault();
    if (!newService.name || !newService.price) return alert("Preencha nome e preço do serviço!");
    const formattedPrice = parseFloat(String(newService.price).replace(',', '.'));

    let cleanImage = (newService.image_url || '').trim();
    if (cleanImage.startsWith('blob:')) cleanImage = '';

    const categoryVal = newService.category && newService.category.trim() !== '' 
      ? newService.category.trim() 
      : 'Geral';

    const nextPosition = services.length;

    const { error } = await supabase.from('services').insert([{
      tenant_id: tenant.id,
      name: newService.name.trim(),
      price: formattedPrice,
      duration_minutes: parseInt(newService.duration_minutes || 30),
      category: categoryVal,
      professional_ids: newService.professional_ids || [],
      image_url: cleanImage,
      position: nextPosition,
      active: true
    }]);

    if (error) {
      alert("Erro ao cadastrar serviço: " + error.message);
    } else {
      alert("Serviço cadastrado com sucesso!");
      setNewService({ name: '', price: '', duration_minutes: '30', category: '', professional_ids: [], image_url: '' });
      fetchData();
    }
  };

  const handleUpdateService = async (e) => {
    e.preventDefault();
    const formattedPrice = parseFloat(String(editingService.price).replace(',', '.'));

    let cleanImage = (editingService.image_url || '').trim();
    if (cleanImage.startsWith('blob:')) cleanImage = '';

    const categoryVal = editingService.category && editingService.category.trim() !== '' 
      ? editingService.category.trim() 
      : 'Geral';

    const { error } = await supabase.from('services').update({
      name: editingService.name.trim(),
      price: formattedPrice,
      duration_minutes: parseInt(editingService.duration_minutes || 30),
      category: categoryVal,
      professional_ids: editingService.professional_ids || [],
      image_url: cleanImage
    }).eq('id', editingService.id);

    if (error) {
      alert("Erro ao atualizar serviço: " + error.message);
    } else {
      setEditingService(null);
      fetchData();
    }
  };

  const handleAddProf = async (e) => {
    e.preventDefault();
    if (!newProf.name || !newProf.name.trim()) return alert("Digite o nome do profissional!");

    let cleanAvatar = (newProf.avatar_url || '').trim();
    if (cleanAvatar.startsWith('blob:')) {
      cleanAvatar = '';
    }

    const payload = {
      tenant_id: tenant.id,
      name: newProf.name.trim(),
      phone: newProf.phone ? newProf.phone.replace(/\D/g, '') : '',
      specialty: newProf.specialty ? newProf.specialty.trim() : '',
      avatar_url: cleanAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
      photo_url: cleanAvatar,
      photo: cleanAvatar,
      instagram_url: newProf.instagram_url ? newProf.instagram_url.trim() : '',
      commission_percentage: parseFloat(newProf.commission_percentage || 50),
      work_days: newProf.work_days || [1, 2, 3, 4, 5, 6],
      work_hours: newProf.work_hours || DEFAULT_WORK_HOURS,
      break_start: newProf.break_start || '12:00',
      break_end: newProf.break_end || '13:00',
      pin: newProf.pin ? String(newProf.pin).trim() : '1234',
      bot_message_template: newProf.bot_message_template ? newProf.bot_message_template.trim() : '',
      active: true
    };

    const { error } = await supabase.from('professionals').insert([payload]);

    if (error) {
      console.error("Erro no Supabase ao adicionar profissional:", error);
      alert("Erro ao cadastrar profissional: " + error.message);
    } else {
      alert("Profissional cadastrado com sucesso!");
      setNewProf({ 
        name: '', 
        phone: '', 
        specialty: '', 
        avatar_url: '', 
        instagram_url: '', 
        commission_percentage: '50', 
        work_days: [1, 2, 3, 4, 5, 6], 
        work_hours: DEFAULT_WORK_HOURS, 
        break_start: '12:00',
        break_end: '13:00',
        pin: '1234', 
        bot_message_template: '' 
      });
      fetchData();
    }
  };

  const handleUpdateProf = async (e) => {
    e.preventDefault();
    if (!editingProf.name || !editingProf.name.trim()) return alert("Digite o nome do profissional!");

    let cleanAvatar = (editingProf.avatar_url || '').trim();
    if (cleanAvatar.startsWith('blob:')) {
      cleanAvatar = '';
    }

    const { error } = await supabase.from('professionals').update({
      name: editingProf.name.trim(),
      phone: editingProf.phone ? editingProf.phone.replace(/\D/g, '') : '',
      specialty: editingProf.specialty ? editingProf.specialty.trim() : '',
      avatar_url: cleanAvatar,
      photo_url: cleanAvatar,
      photo: cleanAvatar,
      instagram_url: editingProf.instagram_url ? editingProf.instagram_url.trim() : '',
      commission_percentage: parseFloat(editingProf.commission_percentage || 50),
      work_days: editingProf.work_days || [1, 2, 3, 4, 5, 6],
      work_hours: editingProf.work_hours || DEFAULT_WORK_HOURS,
      break_start: editingProf.break_start || '12:00',
      break_end: editingProf.break_end || '13:00',
      pin: editingProf.pin ? String(editingProf.pin).trim() : '1234',
      bot_message_template: editingProf.bot_message_template ? editingProf.bot_message_template.trim() : ''
    }).eq('id', editingProf.id);

    if (error) {
      console.error("Erro no Supabase ao atualizar profissional:", error);
      alert("Erro ao atualizar profissional: " + error.message);
    } else {
      setEditingProf(null);
      fetchData();
    }
  };

  const toggleDaySelection = (currentDays, dayId) => {
    const arr = [...(currentDays || [])];
    if (arr.includes(dayId)) {
      return arr.filter(d => d !== dayId);
    } else {
      return [...arr, dayId].sort();
    }
  };

  const handleUpdateAppointmentStatus = async (appointmentId, newStatus) => {
    const { error } = await supabase
      .from('appointments')
      .update({ status: newStatus })
      .eq('id', appointmentId);

    if (error) {
      alert("Erro ao atualizar status: " + error.message);
    } else {
      fetchData();
    }
  };

  const handleUnlockAgendaPrices = async (e) => {
    e.preventDefault();
    const pin = agendaPinInput.trim();
    const chk = await apiLogin(tenant.slug, 'agenda_prices', pin);

    if (chk.ok) {
      setIsAgendaPricesUnlocked(true);
      setShowAgendaPinModal(false);
      setAgendaPinInput('');
    } else {
      alert('❌ PIN ou Senha incorreta!');
    }
  };

  const getFilteredAppointments = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    return appointments.filter(a => {
      if (a.status === 'cancelado' && reportFilter !== 'custom') return false;
      if (reportFilter === 'all') return true;
      if (reportFilter === 'custom') {
        if (!a.appointment_date) return false;
        const appDateStr = a.appointment_date.split('T')[0];
        if (customStartDate && appDateStr < customStartDate) return false;
        if (customEndDate && appDateStr > customEndDate) return false;
        return true;
      }
      if (!a.appointment_date) return true;
      const appDateStr = a.appointment_date.split('T')[0];
      const appDate = new Date(`${appDateStr}T00:00:00`);
      const diffMs = now.getTime() - appDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (reportFilter === 'today') return appDateStr === todayStr;
      if (reportFilter === '7days') return diffDays >= 0 && diffDays <= 7;
      if (reportFilter === '30days') return diffDays >= 0 && diffDays <= 30;
      return true;
    });
  };

  const filteredApps = getFilteredAppointments();
  const totalRevenue = filteredApps.reduce((sum, a) => sum + Number(a.total_price || a.price || 0), 0);

  const profCommissionsMap = {};
  filteredApps.forEach(a => {
    if (a.status === 'cancelado') return;
    const prof = professionals.find(p => String(p.id) === String(a.professional_id));
    if (prof) {
      const commRate = Number(prof.commission_percentage || 50) / 100;
      const commValue = Number(a.total_price || a.price || 0) * commRate;
      profCommissionsMap[prof.name] = (profCommissionsMap[prof.name] || 0) + commValue;
    }
  });

  const getProcessedCustomers = () => {
    const custMap = {};

    appointments.forEach(app => {
      if (app.status === 'cancelado') return;

      const rawPhone = app.customer_phone || app.client_phone || app.phone || '';
      const cleanPhone = rawPhone.replace(/\D/g, '');
      const name = app.customer_name || app.client_name || 'Cliente';

      if (!cleanPhone) return;

      if (!custMap[cleanPhone]) {
        custMap[cleanPhone] = {
          name: name,
          phone: cleanPhone,
          total_spent: 0,
          total_visits: 0,
          prof_ids: new Set(),
          appointments: []
        };
      }

      custMap[cleanPhone].total_spent += Number(app.total_price || app.price || 0);
      custMap[cleanPhone].total_visits += 1;
      if (app.professional_id) custMap[cleanPhone].prof_ids.add(String(app.professional_id));
      custMap[cleanPhone].appointments.push(app);
    });

    let list = Object.values(custMap).map(c => {
      const sortedApps = c.appointments.sort((a, b) => 
        new Date(b.appointment_date || b.created_at) - new Date(a.appointment_date || a.created_at)
      );

      const lastApp = sortedApps[0] || {};
      const lastServices = Array.isArray(lastApp.services_json) 
        ? lastApp.services_json.map(s => s.name).join(', ')
        : (lastApp.service_name || 'Atendimento');

      const rawStamps = customerStampsMap[c.phone];
      const currentStamps = rawStamps !== undefined ? rawStamps : c.total_visits;

      return {
        ...c,
        prof_ids: Array.from(c.prof_ids),
        last_date: lastApp.appointment_date ? lastApp.appointment_date.split('T')[0].split('-').reverse().join('/') : '—',
        last_services: lastServices,
        notes: customerNotesMap[c.phone] || '',
        stamps: currentStamps
      };
    });

    if (customerProfFilter) {
      list = list.filter(c => c.prof_ids.includes(String(customerProfFilter)));
    }

    if (customerSearch) {
      const q = customerSearch.toLowerCase().trim();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }

    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    return list;
  };

  const processedCustomers = getProcessedCustomers();

  const topVipCustomers = [...processedCustomers]
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, 3);

  const exportCustomersCSV = () => {
    if (processedCustomers.length === 0) return alert("Nenhum cliente para exportar.");
    let csvContent = "\uFEFFData:text/csv;charset=utf-8,Nome,Telefone,Visitas,Selos Fidelidade,Total Gasto (R$),Ultimo Atendimento,Observacoes\n";
    processedCustomers.forEach(c => {
      const notesClean = (c.notes || '').replace(/"/g, '""');
      csvContent += `"${c.name}","${c.phone}",${c.total_visits},${c.stamps},"${c.total_spent.toFixed(2)}","${c.last_services}","${notesClean}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `clientes_${tenant?.slug || 'salao'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportFinancialCSV = () => {
    if (filteredApps.length === 0) return alert("Nenhum registro para exportar.");
    let csvContent = "\uFEFFData:text/csv;charset=utf-8,Data,Cliente,Telefone,Profissional,Servico,Valor (R$),Status\n";
    filteredApps.forEach(a => {
      const prof = professionals.find(p => String(p.id) === String(a.professional_id));
      const profName = prof ? prof.name : '—';
      const cName = a.customer_name || a.client_name || 'Cliente';
      const cPhone = a.customer_phone || a.client_phone || a.phone || '';
      const sName = a.service_name || (Array.isArray(a.services_json) ? a.services_json.map(s => s.name).join(' + ') : 'Serviço');
      const price = Number(a.total_price || a.price || 0).toFixed(2);
      csvContent += `"${a.appointment_date || ''}","${cName}","${cPhone}","${profName}","${sName}","${price}","${a.status || 'confirmado'}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_financeiro_${tenant?.slug || 'salao'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUnlockGlobalFin = async (e) => {
    e.preventDefault();
    const hasFinPass = tenant && tenant.financial_password && tenant.financial_password.trim() !== '';
    const chk = await apiLogin(tenant.slug, 'financial', adminFinPass);

    if (chk.ok) {
      setIsGlobalFinUnlocked(true);
      setAdminFinPass('');
    } else {
      alert(hasFinPass ? '❌ Senha Financeira incorreta!' : '❌ Senha de Admin incorreta!');
    }
  };

  const handleUnlockProfFin = (e) => {
    e.preventDefault();
    const prof = professionals.find(p => String(p.id) === String(selectedProfForFin));
    if (!prof) return alert('Selecione um profissional.');

    if (prof.pin && String(prof.pin) === String(inputProfPin).trim()) {
      setIsProfFinUnlocked(true);
      setUnlockedProfData(prof);
    } else {
      alert('PIN / Senha do profissional incorreta!');
    }
  };

  const getShareLinkAndMsg = () => {
    const baseUrl = `https://agendamento.sinergemkt.com/${tenant?.slug || ''}`;
    const selectedProfObj = professionals.find(p => String(p.id) === String(selectedProfForLink));

    const finalLink = selectedProfObj ? `${baseUrl}?prof=${selectedProfObj.id}` : baseUrl;
    const profName = selectedProfObj ? selectedProfObj.name : 'Nossa Equipe';

    const customMsg = (tenant?.share_template || 'Olá! Agende seu horário no *{empresa}* com *{profissional}* acessando: {link}')
      .replace('{empresa}', tenant?.name || '')
      .replace('{profissional}', profName)
      .replace('{link}', finalLink);

    return { finalLink, customMsg };
  };

  const { finalLink, customMsg } = getShareLinkAndMsg();

  const getManageAppointmentsList = () => {
    let list = [...appointments];

    if (appointmentStatusFilter !== 'all') {
      list = list.filter(a => (a.status || 'confirmado') === appointmentStatusFilter);
    }

    if (appointmentProfFilter) {
      list = list.filter(a => String(a.professional_id) === String(appointmentProfFilter));
    }

    if (appointmentSearch) {
      const q = appointmentSearch.toLowerCase().trim();
      list = list.filter(a => {
        const name = (a.customer_name || a.client_name || '').toLowerCase();
        const phone = (a.customer_phone || a.client_phone || a.phone || '');
        return name.includes(q) || phone.includes(q);
      });
    }

    return list;
  };

  const manageAppointments = getManageAppointmentsList();

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-sm text-gray-400">Carregando painel...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-gray-900 p-6 rounded-2xl border border-gray-800 w-full max-w-sm space-y-4 shadow-2xl">
          <h2 className="text-xl font-bold text-orange-500 text-center">{tenant.name}</h2>
          <p className="text-xs text-gray-400 text-center">Painel Administrativo de Agendamento</p>
          <input type="password" placeholder="Senha de acesso..." className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500" onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl text-xs transition">Entrar no Painel 🚀</button>
        </form>
      </div>
    );
  }

  const profApps = unlockedProfData
    ? filteredApps.filter(a => String(a.professional_id) === String(unlockedProfData.id))
    : [];
  const profTotalRev = profApps.reduce((sum, a) => sum + Number(a.total_price || a.price || 0), 0);
  const profCommEarned = profTotalRev * (Number(unlockedProfData?.commission_percentage || 50) / 100);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-4xl mx-auto font-sans pb-12">
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-prof-receipt, #print-prof-receipt * { visibility: visible !important; }
          #print-prof-receipt {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; color: #000 !important; background: #fff !important; padding: 15px !important; font-family: sans-serif !important;
          }
        }
      `}</style>

      <datalist id="existing-categories-list">
        {existingCategories.map((cat, i) => (
          <option key={i} value={cat} />
        ))}
      </datalist>

      <header className="flex justify-between items-center py-4 border-b border-gray-800 mb-4">
        <div className="flex items-center space-x-2">
          <button onClick={() => router.push('/')} className="text-xs bg-gray-800 px-2.5 py-1.5 rounded-lg text-gray-300 font-bold border border-gray-700">
            ← Voltar
          </button>
          <div>
            <h1 className="font-bold text-lg text-orange-500">{tenant.name}</h1>
            <p className="text-xs text-gray-400">Gestão do Estabelecimento</p>
          </div>
        </div>
        <button 
          onClick={() => {
            localStorage.removeItem('sinerge_tenant_pass');
            clearToken(tenant.slug);
            setIsAuthenticated(false);
            router.push('/');
          }} 
          className="text-xs bg-gray-800 px-3 py-1.5 rounded-lg text-red-400 font-bold">
          Sair
        </button>
      </header>

      {/* BARRA DE TABS */}
      <div className="flex space-x-1 bg-gray-900 p-1 rounded-xl border border-gray-800 mb-6 text-[11px] font-bold overflow-x-auto scrollbar-none">
        <button onClick={() => setActiveTab('services')} className={`flex-1 py-2 px-3 rounded-lg whitespace-nowrap transition ${activeTab === 'services' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>💈 Serviços</button>
        <button onClick={() => setActiveTab('professionals')} className={`flex-1 py-2 px-3 rounded-lg whitespace-nowrap transition ${activeTab === 'professionals' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>👨‍🔬 Equipe</button>
        <button onClick={() => setActiveTab('appointments')} className={`flex-1 py-2 px-3 rounded-lg whitespace-nowrap transition ${activeTab === 'appointments' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>📅 Agenda</button>
        <button onClick={() => setActiveTab('customers')} className={`flex-1 py-2 px-3 rounded-lg whitespace-nowrap transition ${activeTab === 'customers' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>👥 Clientes</button>
        <button onClick={() => setActiveTab('reports')} className={`flex-1 py-2 px-3 rounded-lg whitespace-nowrap transition ${activeTab === 'reports' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>📊 Financeiro</button>
        <button onClick={() => setActiveTab('bot')} className={`flex-1 py-2 px-3 rounded-lg whitespace-nowrap transition ${activeTab === 'bot' ? 'bg-green-600 text-white' : 'text-gray-400'}`}>🤖 Robô Zap</button>
        <button onClick={() => setActiveTab('links')} className={`flex-1 py-2 px-3 rounded-lg whitespace-nowrap transition ${activeTab === 'links' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>🔗 Divulgação</button>
        <button onClick={() => setActiveTab('settings')} className={`flex-1 py-2 px-3 rounded-lg whitespace-nowrap transition ${activeTab === 'settings' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>⚙️ Config</button>
      </div>

      {/* ABA 1: SERVIÇOS */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">➕ Cadastrar Novo Serviço</h3>
            <form onSubmit={handleAddService} className="space-y-3">
              <input type="text" placeholder="Nome Ex: Corte Degradê ou Unha em Gel" value={newService.name} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, name: e.target.value })} />

              <div className="flex space-x-2 items-start">
                <input type="text" placeholder="Preço R$" value={newService.price} className="w-1/3 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewService({ ...newService, price: e.target.value })} />

                <DurationInput 
                  value={newService.duration_minutes} 
                  onChange={(val) => setNewService({ ...newService, duration_minutes: val })} 
                />

                <input 
                  type="text" 
                  list="existing-categories-list"
                  placeholder="Categoria (Ex: Cabelos, Unhas)" 
                  value={newService.category} 
                  className="w-1/3 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" 
                  onChange={(e) => setNewService({ ...newService, category: e.target.value })} 
                />
              </div>

              <input 
                type="text" 
                placeholder="URL da Foto do Serviço (Opcional)" 
                value={newService.image_url} 
                className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" 
                onChange={(e) => setNewService({ ...newService, image_url: e.target.value })} 
              />

              {professionals.length > 0 && (
                <div className="border-t border-gray-800 pt-2">
                  <label className="text-[11px] text-gray-400 font-bold block mb-1">
                    Profissionais que realizam este serviço:
                  </label>
                  <p className="text-[10px] text-gray-500 mb-2">*(Se nenhum for marcado, toda a equipe fará)*</p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                    {professionals.map(p => {
                      const isChecked = (newService.professional_ids || []).map(String).includes(String(p.id));
                      return (
                        <label key={p.id} className={`flex items-center space-x-2 p-2 rounded-lg text-xs cursor-pointer border transition ${isChecked ? 'bg-orange-500/10 border-orange-500 text-orange-400' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              let currentArr = [...(newService.professional_ids || [])];
                              if (e.target.checked) currentArr.push(p.id);
                              else currentArr = currentArr.filter(id => String(id) !== String(p.id));
                              setNewService({ ...newService, professional_ids: currentArr });
                            }}
                            className="accent-orange-500"
                          />
                          <span className="truncate font-semibold">{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <button type="submit" className="w-full bg-green-600 font-bold py-2.5 rounded-lg text-xs">Salvar Serviço 🚀</button>
            </form>
          </section>

          <section className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm text-gray-300">📋 Catálogo de Serviços ({services.length})</h3>
              <span className="text-[10px] text-gray-400">Ordene a exibição com ⬆️ e ⬇️</span>
            </div>

            {services.map((s, index) => {
              let assignedProfIds = s.professional_ids || [];
              if (typeof assignedProfIds === 'string') {
                try { assignedProfIds = JSON.parse(assignedProfIds); } catch(e) { assignedProfIds = []; }
              }
              const assignedProfs = professionals.filter(p => assignedProfIds.map(String).includes(String(p.id)));
              const serviceImg = s.image_url || s.image;
              const displayCategory = s.category && s.category.trim() !== '' ? s.category.trim() : 'Geral';

              return (
                <div key={s.id} className="bg-gray-900 p-3 rounded-xl border border-gray-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="flex flex-col space-y-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveService(index, 'up')}
                          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-200 text-[10px] px-1.5 py-0.5 rounded border border-gray-700 transition cursor-pointer"
                          title="Mover para cima"
                        >
                          ⬆️
                        </button>
                        <button
                          type="button"
                          disabled={index === services.length - 1}
                          onClick={() => handleMoveService(index, 'down')}
                          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-200 text-[10px] px-1.5 py-0.5 rounded border border-gray-700 transition cursor-pointer"
                          title="Mover para baixo"
                        >
                          ⬇️
                        </button>
                      </div>

                      {serviceImg && (
                        <img 
                          src={serviceImg} 
                          alt={s.name} 
                          className="w-12 h-12 rounded-lg object-cover border border-gray-700 bg-gray-800 shrink-0" 
                        />
                      )}
                      <div>
                        <span className={`font-bold text-xs block ${!s.active ? 'line-through text-gray-500' : 'text-white'}`}>
                          {s.name} <span className="text-[10px] text-orange-400 font-bold bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded ml-1">📁 {displayCategory}</span>
                        </span>
                        <span className="text-xs text-orange-400 font-bold">R$ {Number(s.price).toFixed(2)} • <span className="text-gray-400 font-normal">{formatDuration(s.duration_minutes)}</span></span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button onClick={() => setEditingService({ ...s, image_url: s.image_url || s.image || '' })} className="text-xs bg-blue-600/20 text-blue-400 p-1.5 rounded-lg font-bold border border-blue-500/30">✏️ Editar</button>
                      <button onClick={async () => { await supabase.from('services').update({ active: !s.active }).eq('id', s.id); fetchData(); }} className={`text-[10px] font-bold px-2 py-1.5 rounded-lg ${s.active ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{s.active ? 'Ativo' : 'Pausado'}</button>
                      <button onClick={async () => { if (confirm("Excluir serviço?")) { await supabase.from('services').delete().eq('id', s.id); fetchData(); } }} className="text-xs bg-red-500/20 text-red-400 p-1.5 rounded-lg font-bold">🗑</button>
                    </div>
                  </div>

                  <div className="text-[10px] text-gray-400 border-t border-gray-800/60 pt-1.5">
                    <span className="font-semibold text-gray-500">Realizado por: </span>
                    {assignedProfs.length > 0 ? (
                      <span className="text-purple-300 font-medium">{assignedProfs.map(p => p.name).join(', ')}</span>
                    ) : (
                      <span className="text-gray-400 italic">Toda a Equipe</span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* ABA 2: EQUIPE */}
      {activeTab === 'professionals' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-sm text-orange-400">➕ Novo Profissional da Equipe</h3>
            <form onSubmit={handleAddProf} className="space-y-3">
              <input type="text" placeholder="Nome Completo Ex: Daniel Eladio" value={newProf.name} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, name: e.target.value })} />

              <div>
                <label className="text-[10px] text-purple-400 font-bold block mb-1">💅 Especialidade / Descrição do Trabalho:</label>
                <input type="text" placeholder="Ex: Barbeiro, Corte e Barba..." value={newProf.specialty} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, specialty: e.target.value })} />
                <span className="text-[9px] text-gray-500 block mt-0.5">Aparece logo abaixo do nome na seleção do cliente.</span>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">WhatsApp Individual (Agendamentos diretos):</label>
                <input type="text" placeholder="Ex: 47999999999" value={newProf.phone} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, phone: e.target.value })} />
              </div>

              <div>
                <label className="text-[10px] text-purple-400 font-bold block mb-1">📸 Instagram do Profissional (Opcional):</label>
                <input type="text" placeholder="Ex: @triunfobarbearia ou URL" value={newProf.instagram_url} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, instagram_url: e.target.value })} />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">PIN / Senha Secreta (Para extrato individual):</label>
                <input type="password" placeholder="****" value={newProf.pin} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, pin: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">☕ Início Pausa/Almoço:</label>
                  <input type="time" value={newProf.break_start || '12:00'} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white font-mono" onChange={(e) => setNewProf({ ...newProf, break_start: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">☕ Fim Pausa/Almoço:</label>
                  <input type="time" value={newProf.break_end || '13:00'} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white font-mono" onChange={(e) => setNewProf({ ...newProf, break_end: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-green-400 font-bold block mb-1">🤖 Mensagem Personalizada do Robô para este Profissional (Opcional):</label>
                <textarea rows={2} placeholder="Ex: Olá {cliente}! Lembrete do seu horário comigo ({profissional}) amanhã..." value={newProf.bot_message_template} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none font-mono" onChange={(e) => setNewProf({ ...newProf, bot_message_template: e.target.value })} />
              </div>

              <input type="text" placeholder="URL da Foto de Perfil (Avatar)" value={newProf.avatar_url} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, avatar_url: e.target.value })} />

              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Porcentagem de Comissão (%):</label>
                <input type="number" value={newProf.commission_percentage} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setNewProf({ ...newProf, commission_percentage: e.target.value })} />
              </div>

              <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 space-y-2">
                <label className="text-[11px] font-bold text-purple-400 block">📅 Dias e Horários de Atendimento:</label>
                <p className="text-[10px] text-gray-500 mb-1">Selecione os dias e ajuste o horário de entrada e saída:</p>

                <div className="space-y-2">
                  {ALL_DAYS.map(day => {
                    const isSelected = (newProf.work_days || []).includes(day.id);
                    const dayHours = (newProf.work_hours || DEFAULT_WORK_HOURS)[day.id] || { open: '08:00', close: '18:00' };

                    return (
                      <div key={day.id} className={`p-2 rounded-lg border transition text-xs flex items-center justify-between ${isSelected ? 'bg-purple-950/40 border-purple-500/50' : 'bg-gray-900 border-gray-800 opacity-60'}`}>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const updatedDays = toggleDaySelection(newProf.work_days, day.id);
                              setNewProf({ ...newProf, work_days: updatedDays });
                            }}
                            className="accent-purple-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="font-bold text-white w-8">{day.label}</span>
                        </div>

                        {isSelected && (
                          <div className="flex items-center space-x-1.5 text-[10px]">
                            <span className="text-gray-400">De:</span>
                            <input
                              type="time"
                              value={dayHours.open || '08:00'}
                              onChange={(e) => {
                                const updatedHours = {
                                  ...(newProf.work_hours || DEFAULT_WORK_HOURS),
                                  [day.id]: { ...dayHours, open: e.target.value }
                                };
                                setNewProf({ ...newProf, work_hours: updatedHours });
                              }}
                              className="bg-gray-800 border border-gray-700 p-1 rounded text-white font-mono"
                            />
                            <span className="text-gray-400">Até:</span>
                            <input
                              type="time"
                              value={dayHours.close || '18:00'}
                              onChange={(e) => {
                                const updatedHours = {
                                  ...(newProf.work_hours || DEFAULT_WORK_HOURS),
                                  [day.id]: { ...dayHours, close: e.target.value }
                                };
                                setNewProf({ ...newProf, work_hours: updatedHours });
                              }}
                              className="bg-gray-800 border border-gray-700 p-1 rounded text-white font-mono"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button type="submit" className="w-full bg-green-600 font-bold py-2.5 rounded-lg text-xs">Cadastrar Profissional</button>
            </form>
          </section>

          <section className="space-y-2">
            <h3 className="font-bold text-sm text-gray-300">💈 Equipe ({professionals.length})</h3>
            {professionals.map((p) => {
              let pWorkDays = p.work_days || [1, 2, 3, 4, 5, 6];
              if (typeof pWorkDays === 'string') {
                try { pWorkDays = JSON.parse(pWorkDays); } catch (e) { pWorkDays = [1, 2, 3, 4, 5, 6]; }
              }
              let pWorkHours = p.work_hours || DEFAULT_WORK_HOURS;
              if (typeof pWorkHours === 'string') {
                try { pWorkHours = JSON.parse(pWorkHours); } catch (e) { pWorkHours = DEFAULT_WORK_HOURS; }
              }
              const isProfActive = p.active !== false;

              return (
                <div key={p.id} className="bg-gray-900 p-3 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                      <img src={p.avatar_url || p.photo_url || p.photo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'} alt={p.name} className="w-9 h-9 rounded-full object-cover border border-gray-700" />
                      <div>
                        <span className={`font-bold block ${isProfActive ? 'text-white' : 'line-through text-gray-500'}`}>
                          {p.name} {p.specialty && <span className="text-purple-400 text-[10px] font-normal">({p.specialty})</span>}
                        </span>
                        <span className="text-gray-400 text-[10px]">Comissão: <b className="text-green-400">{p.commission_percentage}%</b> {p.phone ? `• 📱 ${p.phone}` : '• Central'}</span>
                        {p.instagram_url && <span className="text-[10px] text-pink-400 block">📸 Insta: {p.instagram_url}</span>}
                        <span className="text-[10px] text-gray-500 block">☕ Almoço: {p.break_start || '12:00'} - {p.break_end || '13:00'}</span>
                      </div>
                    </div>
                    <div className="flex space-x-1.5 items-center">
                      <button 
                        onClick={async () => {
                          await supabase.from('professionals').update({ active: !isProfActive }).eq('id', p.id);
                          fetchData();
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg ${isProfActive ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {isProfActive ? 'Ativo' : 'Pausado'}
                      </button>
                      <button onClick={() => setEditingProf({ ...p, work_days: pWorkDays, work_hours: pWorkHours, break_start: p.break_start || '12:00', break_end: p.break_end || '13:00', pin: p.pin || '1234', instagram_url: p.instagram_url || '', specialty: p.specialty || '', bot_message_template: p.bot_message_template || '', avatar_url: p.avatar_url || p.photo_url || p.photo || '' })} className="bg-blue-600/20 text-blue-400 p-1.5 rounded-lg font-bold border border-blue-500/30">✏️ Editar</button>
                      <button onClick={async () => { if (confirm("Excluir profissional?")) { await supabase.from('professionals').delete().eq('id', p.id); fetchData(); } }} className="text-red-400 font-bold p-1.5">🗑</button>
                    </div>
                  </div>

                  <div className="text-[10px] text-gray-400 border-t border-gray-800/60 pt-1.5 space-y-1">
                    <span className="font-semibold text-gray-500 block">Jornada de Trabalho:</span>
                    <div className="flex flex-wrap gap-1">
                      {ALL_DAYS.filter(d => pWorkDays.includes(d.id)).map(d => {
                        const h = pWorkHours[d.id] || { open: '08:00', close: '18:00' };
                        return (
                          <span key={d.id} className="bg-gray-800 text-purple-300 border border-gray-700 px-1.5 py-0.5 rounded font-mono">
                            {d.label}: {h.open}-{h.close}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* ABA 3: AGENDA DE AGENDAMENTOS */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-2xl border border-gray-800 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider">
                  📅 Central de Agendamentos ({manageAppointments.length})
                </h3>
                <p className="text-[11px] text-gray-400">Gerencie status, confirme ou cancele horários marcados</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                {isAgendaPricesUnlocked ? (
                  <button
                    onClick={() => setIsAgendaPricesUnlocked(false)}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                  >
                    <span>🔒 Ocultar Valores</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowAgendaPinModal(true)}
                    className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/40 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                  >
                    <span>👁️ Mostrar Valores (PIN)</span>
                  </button>
                )}

                <select
                  value={appointmentStatusFilter}
                  onChange={(e) => setAppointmentStatusFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 p-2 rounded-xl text-xs text-white focus:outline-none">
                  <option value="all">-- Todos Status --</option>
                  <option value="agendado">Agendados</option>
                  <option value="confirmado">Confirmados</option>
                  <option value="concluido">Concluídos</option>
                  <option value="cancelado">Cancelados</option>
                </select>

                <select
                  value={appointmentProfFilter}
                  onChange={(e) => setAppointmentProfFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 p-2 rounded-xl text-xs text-white focus:outline-none">
                  <option value="">-- Todos Profissionais --</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="🔍 Cliente ou Telefone..."
                  value={appointmentSearch}
                  onChange={(e) => setAppointmentSearch(e.target.value)}
                  className="bg-gray-800 border border-gray-700 p-2 rounded-xl text-xs text-white focus:outline-none w-full sm:w-auto"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {manageAppointments.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">Nenhum agendamento encontrado com os filtros selecionados.</p>
              ) : (
                manageAppointments.map((app) => {
                  const prof = professionals.find(p => String(p.id) === String(app.professional_id));
                  const clientName = app.customer_name || app.client_name || 'Cliente';
                  const clientPhone = (app.customer_phone || app.client_phone || app.phone || '').replace(/\D/g, '');
                  const serviceTitle = app.service_name || (Array.isArray(app.services_json) ? app.services_json.map(s => s.name).join(', ') : 'Serviço');
                  const status = app.status || 'agendado';

                  let statusBadgeClass = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
                  if (status === 'confirmado') statusBadgeClass = "bg-green-500/20 text-green-400 border-green-500/30";
                  if (status === 'cancelado') statusBadgeClass = "bg-red-500/20 text-red-400 border-red-500/30";
                  if (status === 'concluido') statusBadgeClass = "bg-blue-500/20 text-blue-400 border-blue-500/30";

                  const formattedDate = app.appointment_date ? app.appointment_date.split('T')[0].split('-').reverse().join('/') : '';
                  const zapMsg = `Olá ${clientName}! Confirmando seu agendamento de *${serviceTitle}* no *${tenant.name}* no dia *${formattedDate}* às *${app.start_time || app.appointment_time || app.time || ''}* com *${prof?.name || 'nossa equipe'}*.`;

                  return (
                    <div key={app.id} className="bg-gray-950 p-3.5 rounded-xl border border-gray-800 space-y-2 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">{clientName}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClass}`}>
                              {status.toUpperCase()}
                            </span>
                          </div>
                          <span className="text-[11px] text-orange-400 block font-semibold mt-0.5">✂️ {serviceTitle}</span>
                          <span className="text-[10px] text-gray-400 block font-mono">
                            📅 {formattedDate} • ⏰ {app.start_time || app.appointment_time || app.time || 'Horário N/I'} • Profissional: <b className="text-purple-300">{prof?.name || 'Toda Equipe'}</b>
                          </span>
                        </div>

                        <span className="font-bold text-green-400 text-sm">
                          {isAgendaPricesUnlocked 
                            ? `R$ ${Number(app.total_price || app.price || 0).toFixed(2)}` 
                            : 'R$ •••••'}
                        </span>
                      </div>

                      <div className="flex flex-wrap justify-between items-center border-t border-gray-800/80 pt-2 gap-2">
                        {clientPhone && (
                          <a
                            href={`https://wa.me/${String(clientPhone || "").length > 11 ? clientPhone : "55" + clientPhone}?text=${encodeURIComponent(zapMsg)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center space-x-1">
                            <span>💬 WhatsApp Cliente</span>
                          </a>
                        )}

                        <div className="flex items-center space-x-1 ml-auto">
                          {status !== 'concluido' && (
                            <button
                              onClick={() => handleUpdateAppointmentStatus(app.id, 'concluido')}
                              className="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded-lg text-[10px] font-bold">
                              ✓ Concluir
                            </button>
                          )}
                          {status !== 'confirmado' && (
                            <button
                              onClick={() => handleUpdateAppointmentStatus(app.id, 'confirmado')}
                              className="bg-green-600/20 text-green-400 border border-green-500/30 px-2 py-1 rounded-lg text-[10px] font-bold">
                              ✓ Confirmar
                            </button>
                          )}
                          {status !== 'cancelado' && (
                            <button
                              onClick={() => handleUpdateAppointmentStatus(app.id, 'cancelado')}
                              className="bg-red-600/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg text-[10px] font-bold">
                              ✕ Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}

      {/* ABA 4: GESTÃO DE CLIENTES & CARTÃO FIDELIDADE */}
      {activeTab === 'customers' && (
        <div className="space-y-6">
          {topVipCustomers.length > 0 && (
            <section className="bg-gradient-to-r from-orange-950/40 via-gray-900 to-amber-950/40 p-4 rounded-2xl border border-orange-500/30 space-y-3 shadow-xl">
              <div className="flex items-center space-x-2">
                <span className="text-lg">🏆</span>
                <div>
                  <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider">Top Clientes VIPs</h3>
                  <p className="text-[10px] text-gray-400">Clientes com maior faturamento acumulado na loja</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {topVipCustomers.map((vip, i) => (
                  <div key={i} className="bg-gray-950/80 p-3 rounded-xl border border-orange-500/20 text-xs relative overflow-hidden">
                    <span className="absolute -top-1 -right-1 bg-orange-500 text-white font-bold text-[9px] px-2 py-0.5 rounded-bl-lg">
                      #{i + 1} VIP
                    </span>
                    <span className="font-bold text-white block truncate pr-8">{vip.name}</span>
                    <span className="text-[10px] text-gray-400 block font-mono">📱 {vip.phone}</span>
                    <div className="flex justify-between items-center mt-2 pt-1 border-t border-gray-800 text-[11px]">
                      <span className="text-gray-400">{vip.total_visits} visitas</span>
                      <span className="font-bold text-green-400">R$ {vip.total_spent.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-gray-900 p-4 rounded-2xl border border-gray-800 space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex items-center space-x-3">
                <h3 className="font-bold text-xs text-gray-300 uppercase tracking-wider">
                  👥 Diretório de Clientes ({processedCustomers.length})
                </h3>
                <button
                  onClick={exportCustomersCSV}
                  className="bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold transition">
                  📥 Exportar CSV
                </button>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <select
                  value={customerProfFilter}
                  onChange={(e) => setCustomerProfFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 p-2 rounded-xl text-xs text-white focus:outline-none cursor-pointer w-1/2 sm:w-auto">
                  <option value="">-- Todos os Profissionais --</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="🔍 Buscar cliente..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="bg-gray-800 border border-gray-700 p-2 rounded-xl text-xs text-white focus:outline-none w-1/2 sm:w-auto"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {processedCustomers.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">Nenhum cliente encontrado com os filtros aplicados.</p>
              ) : (
                processedCustomers.map((cust) => {
                  const isSavingThisNote = savingNotePhone === cust.phone;
                  const loyaltyTarget = Number(tenant?.loyalty_target_visits || 10);
                  const isLoyaltyActive = tenant?.loyalty_enabled;
                  const currentStamps = cust.stamps || 0;
                  const hasWonReward = isLoyaltyActive && currentStamps >= loyaltyTarget;

                  return (
                    <div key={cust.phone} className="bg-gray-950 p-4 rounded-2xl border border-gray-800 space-y-3 text-xs shadow-md">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-800 pb-2.5">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 font-bold flex items-center justify-center text-sm shrink-0">
                            {cust.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-bold text-white text-xs flex items-center space-x-2">
                              <span>{cust.name}</span>
                              <a
                                href={`https://wa.me/${String(cust.phone || "").length > 11 ? cust.phone : "55" + cust.phone}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] bg-green-500/20 hover:bg-green-500/40 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-normal">
                                💬 WhatsApp
                              </a>
                            </h4>
                            <span className="text-[10px] text-gray-400 block font-mono">📱 {cust.phone}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3 text-[11px]">
                          <div className="text-right">
                            <span className="text-gray-400 block text-[10px]">Visitas Totais:</span>
                            <span className="font-bold text-white">{cust.total_visits}x</span>
                          </div>
                          <div className="text-right border-l border-gray-800 pl-3">
                            <span className="text-gray-400 block text-[10px]">Total Gasto:</span>
                            <span className="font-bold text-green-400">R$ {cust.total_spent.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {isLoyaltyActive && (
                        <div className={`p-3 rounded-xl border space-y-2 transition ${hasWonReward ? 'bg-amber-950/30 border-amber-500/60' : 'bg-gray-900 border-gray-800'}`}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-sm">🎁</span>
                              <span className="font-bold text-xs text-amber-400 uppercase tracking-wide">
                                Cartão Fidelidade ({currentStamps}/{loyaltyTarget} Selos)
                              </span>
                            </div>

                            {hasWonReward && (
                              <span className="bg-amber-500 text-black font-extrabold text-[10px] px-2 py-0.5 rounded-full uppercase animate-pulse">
                                🎉 PRÊMIO DISPONÍVEL!
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1 items-center bg-gray-950 p-2 rounded-lg border border-gray-800/60 font-mono text-sm">
                            {Array.from({ length: loyaltyTarget }).map((_, i) => (
                              <span key={i} title={`Selo ${i + 1}`}>
                                {i < currentStamps ? '🟢' : '⚪'}
                              </span>
                            ))}
                          </div>

                          <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
                            <span className="text-[10px] text-gray-400">
                              Recompensa: <b className="text-amber-300">{tenant.loyalty_reward_text || 'Prêmio Especial'}</b>
                            </span>

                            <div className="flex items-center space-x-1 ml-auto">
                              <button
                                type="button"
                                onClick={() => handleAdjustCustomerStamps(cust.phone, cust.name, currentStamps, -1)}
                                className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-2 py-1 rounded-lg text-[10px] font-bold">
                                -1
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustCustomerStamps(cust.phone, cust.name, currentStamps, 1)}
                                className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-2 py-1 rounded-lg text-[10px] font-bold">
                                +1 Selo
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResetCustomerStamps(cust.phone, cust.name)}
                                className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-500/40 px-2.5 py-1 rounded-lg text-[10px] font-bold transition">
                                🎁 Resgatar / Zerar
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-gray-900 p-2.5 rounded-xl border border-gray-800/80 text-[11px] flex justify-between items-center">
                        <div>
                          <span className="text-gray-400 text-[10px] block">Último Procedimento:</span>
                          <span className="font-bold text-orange-300">{cust.last_services}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 bg-gray-800 px-2 py-1 rounded-lg">
                          📅 {cust.last_date}
                        </span>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold text-purple-300 block">
                            📌 Observações Internas da Cliente:
                          </label>
                          {isSavingThisNote && <span className="text-[10px] text-orange-400 animate-pulse">Salvando...</span>}
                        </div>

                        <div className="flex space-x-2">
                          <input
                            type="text"
                            placeholder="Ex: Prefere café sem açúcar, alergia a esmalte X, tom de tinta 6.0..."
                            value={cust.notes}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomerNotesMap(prev => ({ ...prev, [cust.phone]: val }));
                            }}
                            className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveCustomerNote(cust.phone, cust.name, cust.notes)}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap">
                            💾 Salvar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}

      {/* ABA 5: FINANCEIRO */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex space-x-2 bg-gray-900 p-1.5 rounded-xl border border-gray-800 text-xs font-bold">
            <button 
              onClick={() => { setFinViewMode('global'); setIsProfFinUnlocked(false); }} 
              className={`flex-1 py-2 rounded-lg transition ${finViewMode === 'global' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>
              🌐 Visão Geral (Admin)
            </button>
            <button 
              onClick={() => { setFinViewMode('individual'); setIsGlobalFinUnlocked(false); }} 
              className={`flex-1 py-2 rounded-lg transition ${finViewMode === 'individual' ? 'bg-orange-500 text-white' : 'text-gray-400'}`}>
              🔒 Extrato do Profissional (PIN)
            </button>
          </div>

          {finViewMode === 'global' && (
            <div className="space-y-4">
              {!isGlobalFinUnlocked ? (
                <form onSubmit={handleUnlockGlobalFin} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl space-y-4 shadow-xl">
                  <div>
                    <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider flex items-center space-x-1">
                      <span>🔒 Financeiro Geral Protegido</span>
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Digite a Senha Financeira exclusiva para visualizar o faturamento total e o repasse de comissões.
                    </p>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Senha Financeira Exclusiva:</label>
                    <input
                      type="password"
                      placeholder="Digite a senha financeira..."
                      value={adminFinPass}
                      onChange={(e) => setAdminFinPass(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 font-bold py-3 rounded-xl text-xs text-white transition shadow-lg">
                    Visualizar Financeiro Geral 🔓
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-gray-900/80 p-3 rounded-xl border border-gray-800">
                    <span className="text-xs font-bold text-green-400">🔓 Financeiro Desbloqueado</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={exportFinancialCSV}
                        className="bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/30 px-3 py-1 rounded-lg text-xs font-bold transition">
                        📥 Exportar CSV
                      </button>
                      <button
                        onClick={() => setIsGlobalFinUnlocked(false)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-3 py-1 rounded-lg text-xs font-bold transition">
                        🔒 Ocultar Dados
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col space-y-2 bg-gray-900 p-3 rounded-xl border border-gray-800 text-xs">
                    <span className="text-gray-400 font-bold">Filtro de Período:</span>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => setReportFilter('all')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === 'all' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>Tudo</button>
                      <button onClick={() => setReportFilter('today')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === 'today' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>Hoje</button>
                      <button onClick={() => setReportFilter('7days')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === '7days' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>7 Dias</button>
                      <button onClick={() => setReportFilter('30days')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === '30days' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>30 Dias</button>
                      <button onClick={() => setReportFilter('custom')} className={`px-3 py-1.5 rounded-lg font-bold text-xs ${reportFilter === 'custom' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}>📅 Personalizado</button>
                    </div>

                    {reportFilter === 'custom' && (
                      <div className="flex items-center space-x-2 pt-2 border-t border-gray-800">
                        <div>
                          <label className="text-[10px] text-gray-400 block">De:</label>
                          <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="bg-gray-800 border border-gray-700 p-1.5 rounded-lg text-xs text-white" />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 block">Até:</label>
                          <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="bg-gray-800 border border-gray-700 p-1.5 rounded-lg text-xs text-white" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
                      <span className="text-[11px] text-gray-400 block mb-1">Faturamento Bruto</span>
                      <span className="text-lg font-bold text-green-400">R$ {totalRevenue.toFixed(2)}</span>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-xl border border-gray-800">
                      <span className="text-[11px] text-gray-400 block mb-1">Total Atendimentos</span>
                      <span className="text-lg font-bold text-orange-400">{filteredApps.length}</span>
                    </div>
                  </div>

                  <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
                    <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider">💰 REPASSE DE COMISSÕES</h3>
                    <div className="space-y-2">
                      {Object.keys(profCommissionsMap).length === 0 ? (
                        <p className="text-xs text-gray-400">Nenhum cálculo de comissão no período.</p>
                      ) : (
                        Object.entries(profCommissionsMap).map(([profName, val], idx) => (
                          <div key={idx} className="flex justify-between items-center bg-gray-800 p-2.5 rounded-lg text-xs">
                            <span className="font-bold text-white">{profName}</span>
                            <span className="bg-green-500/20 text-green-400 px-2.5 py-1 rounded-md font-bold">A pagar: R$ {val.toFixed(2)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="bg-gray-900 p-4 rounded-xl border border-red-500/30 flex justify-between items-center mt-4">
                    <div>
                      <h4 className="font-bold text-xs text-red-400">🧹 Zerar Dados de Teste</h4>
                      <p className="text-[10px] text-gray-400">Apaga todo o histórico de agendamentos.</p>
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
            </div>
          )}

          {finViewMode === 'individual' && (
            <div className="space-y-4">
              {!isProfFinUnlocked ? (
                <form onSubmit={handleUnlockProfFin} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl space-y-4">
                  <div>
                    <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider">🔒 Extrato do Profissional</h3>
                    <p className="text-[11px] text-gray-400 mt-1">Selecione seu perfil e digite seu PIN para abrir seu extrato privado.</p>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Selecione Seu Nome:</label>
                    <select
                      value={selectedProfForFin}
                      onChange={(e) => setSelectedProfForFin(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
                    >
                      <option value="">-- Selecionar Profissional --</option>
                      {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">PIN / Senha de 4 Dígitos:</label>
                    <input
                      type="password"
                      placeholder="****"
                      value={inputProfPin}
                      onChange={(e) => setInputProfPin(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none"
                    />
                  </div>

                  <button type="submit" className="w-full bg-green-600 hover:bg-green-700 font-bold py-3 rounded-xl text-xs text-white transition">
                    Desbloquear Meu Extrato 🔓
                  </button>
                </form>
              ) : (
                <div id="print-prof-receipt" className="bg-gray-900 border border-gray-800 p-5 rounded-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                    <div>
                      <h3 className="font-bold text-sm text-white">👤 Extrato — <span className="text-orange-400">{unlockedProfData.name}</span></h3>
                      <p className="text-[11px] text-gray-400">Comissão: {unlockedProfData.commission_percentage}%</p>
                    </div>

                    <div className="flex space-x-1.5">
                      <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 font-bold px-3 py-1.5 rounded-lg text-xs text-white transition">
                        🖨️ Imprimir
                      </button>
                      <button onClick={() => { setIsProfFinUnlocked(false); setInputProfPin(''); }} className="bg-gray-800 text-gray-300 font-bold px-3 py-1.5 rounded-lg text-xs">
                        🔒 Sair
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Total Atendido</span>
                      <span className="text-base font-bold text-white">R$ {profTotalRev.toFixed(2)}</span>
                      <span className="text-[10px] text-gray-500 block">{profApps.length} serviços</span>
                    </div>

                    <div className="bg-gray-950 p-3 rounded-xl border border-gray-800">
                      <span className="text-[10px] font-bold text-green-400 uppercase block">Sua Comissão</span>
                      <span className="text-base font-bold text-green-400">R$ {profCommEarned.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-gray-300">Serviços Realizados:</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {profApps.length === 0 ? (
                        <p className="text-xs text-gray-500">Nenhum atendimento finalizado no período.</p>
                      ) : (
                        profApps.map(a => (
                          <div key={a.id} className="bg-gray-950 p-2.5 rounded-xl border border-gray-800/80 flex justify-between items-center text-xs">
                            <div>
                              <span className="font-bold text-white block">{a.client_name || a.customer_name}</span>
                              <span className="text-[10px] text-gray-400">{a.service_name || (Array.isArray(a.services_json) ? a.services_json.map(s=>s.name).join(', ') : 'Serviço')} • {a.appointment_date || a.date}</span>
                            </div>
                            <span className="font-bold text-green-400">R$ {Number(a.total_price || a.price || 0).toFixed(2)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ABA 6: ROBÔ WHATSAPP / LEMBRETES AUTOMÁTICOS */}
      {activeTab === 'bot' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-5 rounded-2xl border border-green-500/30 space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-green-400 flex items-center space-x-1.5">
                  <span>🤖 Robô Lembrete de Agendamento</span>
                </h3>
                <p className="text-[11px] text-gray-400">Envia mensagens automáticas de lembrete 1 dia antes da agenda.</p>
              </div>

              <input
                type="checkbox"
                checked={tenant.bot_enabled || false}
                onChange={(e) => setTenant({ ...tenant, bot_enabled: e.target.checked })}
                className="w-5 h-5 accent-green-500 cursor-pointer"
              />
            </div>

            {tenant.bot_enabled && (
              <div className="space-y-4 pt-3 border-t border-gray-800">
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">⏰ Horário Diário de Disparo:</label>
                  <input
                    type="time"
                    value={tenant.bot_send_time || '08:00'}
                    onChange={(e) => setTenant({ ...tenant, bot_send_time: e.target.value })}
                    className="bg-gray-950 border border-gray-800 p-2.5 rounded-xl text-xs text-white focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-500 block mt-1">Neste horário, o robô enviará mensagem para os clientes com horário marcado para amanhã.</span>
                </div>

                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">✍️ Modelo Padrão da Mensagem (Geral do Salão):</label>
                  <textarea
                    rows="4"
                    value={tenant.bot_message_template || ''}
                    onChange={(e) => setTenant({ ...tenant, bot_message_template: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 p-3 rounded-xl text-xs text-white focus:outline-none font-mono"
                    placeholder="Digite a mensagem padrão do robô..."
                  />
                  <div className="text-[10px] text-gray-400 mt-1 flex flex-wrap gap-1">
                    <span>Variáveis:</span>
                    <b className="text-green-400 font-mono">{'{cliente}'}</b>
                    <b className="text-green-400 font-mono">{'{servico}'}</b>
                    <b className="text-green-400 font-mono">{'{data}'}</b>
                    <b className="text-green-400 font-mono">{'{horario}'}</b>
                    <b className="text-green-400 font-mono">{'{empresa}'}</b>
                    <b className="text-green-400 font-mono">{'{profissional}'}</b>
                  </div>
                </div>

                <div className="bg-gray-950 p-3.5 rounded-xl border border-gray-800 space-y-3">
                  <h4 className="font-bold text-xs text-green-400">🔑 Credenciais da API do WhatsApp (Gateway)</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-1">Instância / Session ID:</label>
                      <input
                        type="text"
                        placeholder="Ex: salao-lanna-wp"
                        value={tenant.bot_whatsapp_instance || ''}
                        onChange={(e) => setTenant({ ...tenant, bot_whatsapp_instance: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-1">Token de Acesso (API Key):</label>
                      <input
                        type="password"
                        placeholder="Token do Gateway"
                        value={tenant.bot_whatsapp_token || ''}
                        onChange={(e) => setTenant({ ...tenant, bot_whatsapp_token: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-800 p-2 rounded-xl text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-950 p-3 rounded-xl border border-gray-800/80">
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    💡 <b className="text-white">Multi-Profissional:</b> Cada agendamento fica isolado por profissional. O robô substituirá automaticamente as variáveis <b className="text-green-400">{'{profissional}'}</b> com quem a cliente agendou. Além disso, você pode definir um texto exclusivo para cada profissional na aba <b>👨‍🔬 Equipe</b>.
                  </p>
                </div>
              </div>
            )}

            <button onClick={handleSaveTenantSettings} className="w-full bg-green-600 hover:bg-green-700 font-bold py-3 rounded-xl text-xs text-white transition shadow-lg">
              💾 Salvar Configurações do Robô
            </button>
          </section>
        </div>
      )}

      {/* ABA 7: DIVULGAÇÃO & LINKS PERSONALIZADOS */}
      {activeTab === 'links' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider">✍️ Modelo de Mensagem de Divulgação</h3>
            <p className="text-[10px] text-gray-400">Variáveis automáticas: <b className="text-white">{'{empresa}'}</b>, <b className="text-white">{'{profissional}'}</b> e <b className="text-white">{'{link}'}</b>.</p>

            <textarea
              rows={3}
              value={tenant.share_template || ''}
              onChange={(e) => setTenant({ ...tenant, share_template: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none font-mono"
            />

            <button onClick={handleSaveTenantSettings} className="bg-green-600 font-bold px-4 py-2 rounded-lg text-xs text-white transition">
              💾 Salvar Modelo
            </button>
          </section>

          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="font-bold text-xs text-gray-200 uppercase tracking-wider">🔗 Gerar Link Individual por Profissional</h3>

            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Filtrar Link para um Profissional:</label>
              <select
                value={selectedProfForLink}
                onChange={(e) => setSelectedProfForLink(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="">-- Link Geral do Estabelecimento --</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase block">Prévia da Mensagem:</span>
              <p className="text-xs text-gray-200 font-mono whitespace-pre-wrap">{customMsg}</p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(customMsg);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="flex-1 bg-orange-500 hover:bg-orange-600 font-bold py-2.5 rounded-lg text-xs text-white transition"
              >
                {copiedLink ? '✓ Copiado!' : '📋 Copiar Mensagem + Link'}
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(customMsg)}`}
                target="_blank"
                rel="noreferrer"
                className="bg-green-600 hover:bg-green-700 font-bold px-3 py-2.5 rounded-lg text-xs text-white transition flex items-center"
              >
                💬 Zap
              </a>
            </div>
          </section>
        </div>
      )}

      {/* ABA 8: CONFIGURAÇÕES DA LOJA, FIDELIDADE E AVISOS DIÁRIOS */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <section className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-4">
            <h3 className="font-bold text-sm text-orange-400">⚙️ Configurações da Loja</h3>
            <form onSubmit={handleSaveTenantSettings} className="space-y-4">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Nome do Estabelecimento:</label>
                <input type="text" value={tenant.name || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Link do Instagram Geral do Salão:</label>
                <input 
                  type="text" 
                  placeholder="Ex: https://instagram.com/lanna_designer" 
                  value={tenant.instagram_url || ''} 
                  className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" 
                  onChange={(e) => setTenant({ ...tenant, instagram_url: e.target.value })} 
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Instrução Customizada no WhatsApp:</label>
                <input type="text" placeholder="Ex: Por favor, chegue com 5 minutos de antecedência." value={tenant.custom_message || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, custom_message: e.target.value })} />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">WhatsApp Geral de Recebimento:</label>
                <input type="text" value={tenant.whatsapp || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, whatsapp: e.target.value })} />
              </div>

              {/* SEÇÃO DE AVISOS DIÁRIOS PERSONALIZADOS POR DIA DA SEMANA */}
              <div className="bg-gray-950 p-4 rounded-xl border border-yellow-500/30 space-y-3">
                <div>
                  <h4 className="font-bold text-xs text-yellow-400 flex items-center space-x-1">
                    <span>📢 Avisos Diários Personalizados (por dia da semana)</span>
                  </h4>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Defina avisos ou informações específicas para serem exibidas aos clientes de acordo com o dia da semana escolhido.
                  </p>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-gray-800">
                  {[
                    { id: '0', label: 'Domingo' },
                    { id: '1', label: 'Segunda-feira' },
                    { id: '2', label: 'Terça-feira' },
                    { id: '3', label: 'Quarta-feira' },
                    { id: '4', label: 'Quinta-feira' },
                    { id: '5', label: 'Sexta-feira' },
                    { id: '6', label: 'Sábado' }
                  ].map((day) => (
                    <div key={day.id} className="flex flex-col space-y-1">
                      <label className="text-[10px] text-gray-300 font-bold">{day.label}:</label>
                      <input
                        type="text"
                        placeholder={`Ex: Mensagem ou aviso especial para ${day.label}...`}
                        value={tenant.daily_notices?.[day.id] || ''}
                        onChange={(e) => {
                          const updatedNotices = {
                            ...(tenant.daily_notices || DEFAULT_DAILY_NOTICES),
                            [day.id]: e.target.value
                          };
                          setTenant({ ...tenant, daily_notices: updatedNotices });
                        }}
                        className="bg-gray-900 border border-gray-800 p-2.5 rounded-lg text-xs text-white focus:outline-none focus:border-yellow-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* SEÇÃO DO CARTÃO FIDELIDADE DIGITAL */}
              <div className="bg-gray-950 p-4 rounded-xl border border-amber-500/30 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-xs text-amber-400 flex items-center space-x-1">
                      <span>🎁 Cartão Fidelidade Digital</span>
                    </h4>
                    <p className="text-[10px] text-gray-400">Recompense suas clientes fiéis a cada ciclo de visitas.</p>
                  </div>

                  <input
                    type="checkbox"
                    checked={tenant.loyalty_enabled || false}
                    onChange={(e) => setTenant({ ...tenant, loyalty_enabled: e.target.checked })}
                    className="w-5 h-5 accent-amber-500 cursor-pointer"
                  />
                </div>

                {tenant.loyalty_enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-800">
                    <div>
                      <label className="text-[10px] text-gray-300 font-bold block mb-1">Meta de Visitas / Selos:</label>
                      <input
                        type="number"
                        placeholder="Ex: 10"
                        value={tenant.loyalty_target_visits || 10}
                        onChange={(e) => setTenant({ ...tenant, loyalty_target_visits: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-lg text-xs text-white font-bold focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-[9px] text-gray-500 block mt-1">Quantidade de agendamentos para ganhar o prêmio.</span>
                    </div>

                    <div>
                      <label className="text-[10px] text-gray-300 font-bold block mb-1">Descrição do Prêmio / Recompensa:</label>
                      <input
                        type="text"
                        placeholder="Ex: 1 Atendimento Cortesia / 50% Off"
                        value={tenant.loyalty_reward_text || ''}
                        onChange={(e) => setTenant({ ...tenant, loyalty_reward_text: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-800 p-2.5 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-[9px] text-gray-500 block mt-1">Exibido para a cliente e na notificação da equipe.</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Senha de Admin:</label>
                  <input type="password" value={tenant.admin_password || ''} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, admin_password: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] text-green-400 font-bold block">
                    Senha Financeira Exclusiva:
                  </label>

                  {originalFinPass ? (
                    <>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Senha Financeira ATUAL (Obrigatória):</label>
                        <input
                          type="password"
                          placeholder="Digite a senha atual..."
                          value={oldFinPassInput}
                          onChange={(e) => setOldFinPassInput(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">NOVA Senha Financeira:</label>
                        <input
                          type="password"
                          placeholder="••••••"
                          value={newFinPassInput}
                          onChange={(e) => setNewFinPassInput(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none"
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="text-[10px] text-gray-400 block mb-0.5">Criar Senha Financeira Exclusiva:</label>
                      <input
                        type="password"
                        placeholder="••••••"
                        value={newFinPassInput}
                        onChange={(e) => setNewFinPassInput(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none"
                      />
                    </div>
                  )}
                  <span className="text-[9px] text-gray-500 block">
                    {originalFinPass 
                      ? 'Para alterar esta senha, é obrigatório informar a senha atual.' 
                      : 'Se preenchida, apenas quem tiver esta senha poderá acessar a aba Financeiro.'}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-800 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-xs text-green-400">⚡ Pagamento via PIX Automático</h4>
                    <p className="text-[10px] text-gray-400">Confirma agendamentos com sinal/pré-pagamento.</p>
                  </div>
                  <input type="checkbox" checked={tenant.pix_enabled || false} onChange={(e) => setTenant({ ...tenant, pix_enabled: e.target.checked })} className="w-4 h-4 accent-green-500 cursor-pointer" />
                </div>

                {tenant.pix_enabled && (
                  <div className="space-y-2 bg-gray-800/60 p-3 rounded-xl border border-gray-700">
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">Provedor PIX:</label>
                      <select value={tenant.pix_provider || 'mercadopago'} onChange={(e) => setTenant({ ...tenant, pix_provider: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none">
                        <option value="mercadopago">Mercado Pago</option>
                        <option value="efi">Efí (Gerencianet)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">Token de Acesso / Chave API:</label>
                      <input type="password" value={tenant.pix_access_token || ''} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none" onChange={(e) => setTenant({ ...tenant, pix_access_token: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" className="w-full bg-green-600 hover:bg-green-700 font-bold py-3 rounded-xl text-xs text-white transition shadow-lg">
                💾 Salvar Configurações
              </button>
            </form>
          </section>
        </div>
      )}

      {/* MODAL PARA DIGITAR PIN/SENHA E DESBLOQUEAR PREÇOS NA AGENDA */}
      {showAgendaPinModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUnlockAgendaPrices} className="bg-gray-900 w-full max-w-xs rounded-2xl p-5 border border-orange-500/40 space-y-4 shadow-2xl">
            <h3 className="font-bold text-sm text-orange-400 text-center">🔒 Desbloquear Valores</h3>
            <p className="text-[11px] text-gray-400 text-center">
              Digite seu PIN de profissional ou senha administrativa para visualizar os preços na agenda.
            </p>

            <input
              type="password"
              placeholder="Digite o PIN / Senha..."
              value={agendaPinInput}
              onChange={(e) => setAgendaPinInput(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 p-3 rounded-xl text-white text-center font-mono focus:outline-none focus:border-orange-500 text-base"
              autoFocus
            />

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => { setShowAgendaPinModal(false); setAgendaPinInput(''); }}
                className="w-1/2 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-xl text-xs font-bold text-gray-300 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="w-1/2 bg-orange-500 hover:bg-orange-600 py-2.5 rounded-xl text-xs font-bold text-white transition"
              >
                Desbloquear
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL EDIÇÃO DE SERVIÇO */}
      {editingService && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdateService} className="bg-gray-900 w-full max-w-sm rounded-2xl p-5 border border-blue-500/40 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-blue-400">✏️ Editar Serviço</h3>

            <input type="text" value={editingService.name} onChange={(e) => setEditingService({ ...editingService, name: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />

            <div className="flex space-x-2 items-start">
              <input type="text" value={editingService.price} onChange={(e) => setEditingService({ ...editingService, price: e.target.value })} className="w-1/3 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" />

              <DurationInput 
                value={editingService.duration_minutes} 
                onChange={(val) => setEditingService({ ...editingService, duration_minutes: val })} 
              />

              <input 
                type="text" 
                list="existing-categories-list"
                placeholder="Categoria"
                value={editingService.category || ''} 
                onChange={(e) => setEditingService({ ...editingService, category: e.target.value })} 
                className="w-1/3 bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" 
              />
            </div>

            <input 
              type="text" 
              placeholder="URL da Foto do Serviço (Opcional)" 
              value={editingService.image_url || ''} 
              onChange={(e) => setEditingService({ ...editingService, image_url: e.target.value })} 
              className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" 
            />

            {professionals.length > 0 && (
              <div className="border-t border-gray-800 pt-2">
                <label className="text-[11px] text-gray-400 font-bold block mb-1">
                  Profissionais que realizam este serviço:
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                  {professionals.map(p => {
                    let currentAssigned = editingService.professional_ids || [];
                    if (typeof currentAssigned === 'string') {
                      try { currentAssigned = JSON.parse(currentAssigned); } catch(e) { currentAssigned = []; }
                    }
                    const isChecked = currentAssigned.map(String).includes(String(p.id));
                    return (
                      <label key={p.id} className={`flex items-center space-x-2 p-2 rounded-lg text-xs cursor-pointer border transition ${isChecked ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let currentArr = [...currentAssigned];
                            if (e.target.checked) currentArr.push(p.id);
                            else currentArr = currentArr.filter(id => String(id) !== String(p.id));
                            setEditingService({ ...editingService, professional_ids: currentArr });
                          }}
                          className="accent-blue-500"
                        />
                        <span className="truncate font-semibold">{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingService(null)} className="w-1/2 bg-gray-800 py-2 rounded-lg text-xs">Cancelar</button>
              <button type="submit" className="w-1/2 bg-blue-600 py-2 rounded-lg text-xs font-bold text-white">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL EDIÇÃO DE PROFISSIONAL */}
      {editingProf && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleUpdateProf} className="bg-gray-900 w-full max-w-sm rounded-2xl p-5 border border-blue-500/40 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-blue-400">✏️ Editar Profissional</h3>
            <input type="text" value={editingProf.name} onChange={(e) => setEditingProf({ ...editingProf, name: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="Nome Completo" />
            <input type="text" value={editingProf.specialty || ''} onChange={(e) => setEditingProf({ ...editingProf, specialty: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="Especialidade (Ex: Pé e mão, Cabelos)" />
            <input type="text" value={editingProf.phone || ''} onChange={(e) => setEditingProf({ ...editingProf, phone: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="WhatsApp Individual" />
            <input type="text" value={editingProf.instagram_url || ''} onChange={(e) => setEditingProf({ ...editingProf, instagram_url: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="Instagram (Ex: @ana_designer)" />
            <input type="password" value={editingProf.pin || ''} onChange={(e) => setEditingProf({ ...editingProf, pin: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="PIN de 4 Dígitos" />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Início Almoço:</label>
                <input type="time" value={editingProf.break_start || '12:00'} onChange={(e) => setEditingProf({ ...editingProf, break_start: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-1.5 rounded-lg text-xs text-white font-mono" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Fim Almoço:</label>
                <input type="time" value={editingProf.break_end || '13:00'} onChange={(e) => setEditingProf({ ...editingProf, break_end: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-1.5 rounded-lg text-xs text-white font-mono" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-green-400 font-bold block mb-1">🤖 Mensagem Personalizada do Robô para este Profissional (Opcional):</label>
              <textarea rows={2} placeholder="Ex: Olá {cliente}! Lembrete do seu horário comigo ({profissional}) amanhã..." value={editingProf.bot_message_template || ''} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-xs text-white focus:outline-none font-mono" onChange={(e) => setEditingProf({ ...editingProf, bot_message_template: e.target.value })} />
            </div>

            <input type="text" value={editingProf.avatar_url || ''} onChange={(e) => setEditingProf({ ...editingProf, avatar_url: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="URL Avatar" />
            <input type="number" value={editingProf.commission_percentage || ''} onChange={(e) => setEditingProf({ ...editingProf, commission_percentage: e.target.value })} className="w-full bg-gray-800 border border-gray-700 p-2.5 rounded-lg text-xs text-white focus:outline-none" placeholder="% Comissão" />

            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 space-y-2">
              <label className="text-[11px] font-bold text-purple-400 block">📅 Dias e Horários de Atendimento:</label>
              <div className="space-y-2">
                {ALL_DAYS.map(day => {
                  let editDays = editingProf.work_days || [1, 2, 3, 4, 5, 6];
                  if (typeof editDays === 'string') {
                    try { editDays = JSON.parse(editDays); } catch (e) { editDays = [1, 2, 3, 4, 5, 6]; }
                  }
                  let editHours = editingProf.work_hours || DEFAULT_WORK_HOURS;
                  if (typeof editHours === 'string') {
                    try { editHours = JSON.parse(editHours); } catch (e) { editHours = DEFAULT_WORK_HOURS; }
                  }

                  const isSelected = editDays.includes(day.id);
                  const dayHours = editHours[day.id] || { open: '08:00', close: '18:00' };

                  return (
                    <div key={day.id} className={`p-2 rounded-lg border transition text-xs flex items-center justify-between ${isSelected ? 'bg-purple-950/40 border-purple-500/50' : 'bg-gray-900 border-gray-800 opacity-60'}`}>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const updatedDays = toggleDaySelection(editDays, day.id);
                            setEditingProf({ ...editingProf, work_days: updatedDays });
                          }}
                          className="accent-purple-500 w-4 h-4 cursor-pointer"
                        />
                        <span className="font-bold text-white w-8">{day.label}</span>
                      </div>

                      {isSelected && (
                        <div className="flex items-center space-x-1.5 text-[10px]">
                          <span className="text-gray-400">De:</span>
                          <input
                            type="time"
                            value={dayHours.open || '08:00'}
                            onChange={(e) => {
                              const updatedHours = {
                                ...editHours,
                                [day.id]: { ...dayHours, open: e.target.value }
                              };
                              setEditingProf({ ...editingProf, work_hours: updatedHours });
                            }}
                            className="bg-gray-800 border border-gray-700 p-1 rounded text-white font-mono"
                          />
                          <span className="text-gray-400">Até:</span>
                          <input
                            type="time"
                            value={dayHours.close || '18:00'}
                            onChange={(e) => {
                              const updatedHours = {
                                ...editHours,
                                [day.id]: { ...dayHours, close: e.target.value }
                              };
                              setEditingProf({ ...editingProf, work_hours: updatedHours });
                            }}
                            className="bg-gray-800 border border-gray-700 p-1 rounded text-white font-mono"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex space-x-2">
              <button type="button" onClick={() => setEditingProf(null)} className="w-1/2 bg-gray-800 py-2 rounded-lg text-xs">Cancelar</button>
              <button type="submit" className="w-1/2 bg-blue-600 py-2 rounded-lg text-xs font-bold text-white">Atualizar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
