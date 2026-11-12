import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../lib/supabase';

// DATA DE HOJE NO FUSO DO APARELHO (antes usava UTC e, depois das 21h, virava "amanhã")
const getTodayLocal = () => new Date().toLocaleDateString('sv-SE');

// MONTA O NÚMERO DO WHATSAPP COM 55 SÓ QUANDO AINDA NÃO TEM
const toWaNumber = (phone) => {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.length <= 11 ? `55${clean}` : clean;
};

// ERRO DEVOLVIDO PELO BANCO QUANDO O HORÁRIO JÁ FOI OCUPADO (trava anti-duplicidade)
const isSlotTakenError = (error) => !!(error && String(error.message || '').includes('HORARIO_OCUPADO'));

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

// MÁSCARA AUXILIAR DE WHATSAPP / TELEFONE
const maskPhone = (value) => {
  if (!value) return '';
  const clean = value.replace(/\D/g, '');
  if (clean.length <= 10) {
    return clean.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  }
  return clean.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').slice(0, 15);
};

// MÁSCARA AUXILIAR DE DATA DE ANIVERSÁRIO (DD/MM)
const maskBirthDate = (value) => {
  if (!value) return '';
  const clean = value.replace(/\D/g, '').slice(0, 4);
  if (clean.length <= 2) return clean;
  return `${clean.slice(0, 2)}/${clean.slice(2, 4)}`;
};

const DAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];

export default function AgendamentoCliente() {
  const router = useRouter();
  const { slug, prof, staff } = router.query;

  const [tenant, setTenant] = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [services, setServices] = useState([]);
  const [profServices, setProfServices] = useState([]);
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [loading, setLoading] = useState(true);

  // ESTADOS DO AGENDAMENTO
  const [selectedProf, setSelectedProf] = useState('');
  const [selectedServices, setSelectedServices] = useState([]); // Guarda 0 ou 1 serviço
  const [selectedDate, setSelectedDate] = useState(getTodayLocal());
  const [selectedTime, setSelectedTime] = useState('');
  const [existingAppointments, setExistingAppointments] = useState([]);

  // DADOS DO CLIENTE E CARTÃO FIDELIDADE
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerBirthDate, setCustomerBirthDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('No Local');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false); // trava imediata contra toque duplo
  const [bookingDone, setBookingDone] = useState(null); // tela de sucesso após agendar
  const [loyaltyCount, setLoyaltyCount] = useState(0);

  // MODAL MEUS AGENDAMENTOS
  const [showMyAppsModal, setShowMyAppsModal] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [myAppointments, setMyAppointments] = useState([]);
  const [isSearchingApps, setIsSearchingApps] = useState(false);

  // ESTADOS DE REAGENDAMENTO
  const [editingUserApp, setEditingUserApp] = useState(null);
  const [userNewDate, setUserNewDate] = useState('');
  const [userNewTime, setUserNewTime] = useState('');
  const [isSavingUserReschedule, setIsSavingUserReschedule] = useState(false);

  useEffect(() => {
    if (router.isReady && slug) {
      fetchTenantData();
    }

    // CARREGA TELEFONE E ANIVERSÁRIO SALVO DO CLIENTE (SE HOUVER)
    const savedPhone = localStorage.getItem('client_saved_phone');
    const savedBirth = localStorage.getItem('client_saved_birth');
    if (savedPhone) {
      setCustomerPhone(maskPhone(savedPhone));
      setSearchPhone(maskPhone(savedPhone));
    }
    if (savedBirth) {
      setCustomerBirthDate(maskBirthDate(savedBirth));
    }
  }, [router.isReady, slug]);

  useEffect(() => {
    if (professionals.length === 1) {
      setSelectedProf(professionals[0].id);
    } else if (professionals.length > 1) {
      const urlProfId = prof || staff;
      if (urlProfId) {
        const urlMatch = professionals.find(p => String(p.id) === String(urlProfId));
        if (urlMatch) {
          setSelectedProf(urlMatch.id);
        }
      }
    }
  }, [professionals, prof, staff]);

  useEffect(() => {
    const targetDate = editingUserApp ? userNewDate : selectedDate;
    const targetProf = editingUserApp ? editingUserApp.professional_id : selectedProf;

    if (tenant?.id && targetDate && targetProf) {
      fetchExistingAppointmentsAndBlocks(targetDate, targetProf);
    }
  }, [tenant?.id, selectedDate, selectedProf, userNewDate, editingUserApp]);

  // ATUALIZA OS HORÁRIOS AO VOLTAR PARA A PÁGINA (ex.: voltou do WhatsApp) E A CADA 1 MINUTO
  useEffect(() => {
    if (!tenant?.id) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const targetDate = editingUserApp ? userNewDate : selectedDate;
      const targetProf = editingUserApp ? editingUserApp.professional_id : selectedProf;
      if (targetDate && targetProf) fetchExistingAppointmentsAndBlocks(targetDate, targetProf);
    };
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(timer);
    };
  }, [tenant?.id, selectedDate, selectedProf, userNewDate, editingUserApp]);

  // BUSCA OS DADOS DE FIDELIDADE SEMPRE QUE O TELEFONE DO CLIENTE FOR ALTERADO
  useEffect(() => {
    if (tenant?.id && tenant?.loyalty_enabled && customerPhone) {
      fetchCustomerLoyalty(customerPhone);
    }
  }, [tenant?.id, tenant?.loyalty_enabled, customerPhone]);

  const fetchTenantData = async () => {
    setLoading(true);
    const cleanSlug = String(slug).toLowerCase().trim();

    // DADOS DA LOJA VÊM DO SERVIDOR, SEM SENHAS/TOKENS (antes iam para o navegador de qualquer visitante)
    let tData = null;
    let pData = [];
    try {
      const resp = await fetch(`/api/public-tenant?slug=${encodeURIComponent(cleanSlug)}`);
      const json = await resp.json();
      tData = json.tenant || null;
      pData = json.professionals || [];
    } catch (err) {
      console.error('Erro ao carregar estabelecimento:', err);
    }

    if (tData) {
      setTenant({
        ...tData,
        work_days: tData.work_days || [1, 2, 3, 4, 5, 6],
        loyalty_enabled: tData.loyalty_enabled || false,
        loyalty_target_visits: tData.loyalty_target_visits || 10,
        loyalty_reward_text: tData.loyalty_reward_text || '1 Atendimento Grátis',
        daily_notices: tData.daily_notices || {}
      });

      // BUSCA OS SERVIÇOS ATIVOS ORDENADOS POR 'position' ASCENDENTE E DEPOIS 'id'
      const { data: sData } = await supabase
        .from('services')
        .select('*')
        .eq('tenant_id', tData.id)
        .eq('active', true)
        .order('position', { ascending: true })
        .order('id', { ascending: true });

      // SÓ OS VÍNCULOS DOS PROFISSIONAIS DESTA LOJA (antes buscava de todas as lojas)
      const profIds = (pData || []).map(p => p.id);
      const { data: psData } = profIds.length > 0
        ? await supabase.from('professional_services').select('*').in('professional_id', profIds)
        : { data: [] };

      if (pData) setProfessionals(pData);
      if (sData) setServices(sData);
      if (psData) setProfServices(psData);
    }
    setLoading(false);
  };

  // BUSCA SELOS UNIFICADA NA TABELA tenant_customers PARA SINCRONIA COM ADMIN E AGENDA
  const fetchCustomerLoyalty = async (phone) => {
    if (!tenant?.id || !phone) return;
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) return;

    const { data } = await supabase
      .from('tenant_customers')
      .select('loyalty_stamps')
      .eq('tenant_id', tenant.id)
      .eq('customer_phone', clean)
      .maybeSingle();

    if (data) {
      setLoyaltyCount(data.loyalty_stamps || 0);
    } else {
      setLoyaltyCount(0);
    }
  };

  const fetchExistingAppointmentsAndBlocks = async (targetDate = selectedDate, targetProf = selectedProf) => {
    if (!tenant?.id) return;

    let appQuery = supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('appointment_date', targetDate)
      .neq('status', 'cancelado');

    if (targetProf) {
      appQuery = appQuery.eq('professional_id', targetProf);
    }

    let blockQuery = supabase
      .from('blocked_times')
      .select('*')
      .eq('tenant_id', tenant.id);

    const { data: apps } = await appQuery;
    const { data: blocks } = await blockQuery;

    if (apps) setExistingAppointments(apps);
    if (blocks) setBlockedTimes(blocks);
  };

  const handleSearchMyAppointments = async (e) => {
    if (e) e.preventDefault();
    const clean = searchPhone.replace(/\D/g, '');
    // EXIGE O NÚMERO COMPLETO (antes digitar "9" listava agendamentos de outras pessoas)
    if (clean.length < 10) return alert("Digite seu WhatsApp completo com DDD!");

    localStorage.setItem('client_saved_phone', clean);
    setIsSearchingApps(true);

    fetchCustomerLoyalty(clean);

    const { data } = await supabase
      .from('appointments')
      .select('*')
      .eq('tenant_id', tenant.id)
      .ilike('customer_phone', `%${clean}`)
      .order('appointment_date', { ascending: false });

    if (data) setMyAppointments(data);
    setIsSearchingApps(false);
  };

  const handleUserCancelApp = async (app) => {
    const formattedDate = app.appointment_date.split('-').reverse().join('/');
    if (!confirm(`Deseja realmente cancelar seu agendamento do dia ${formattedDate} às ${app.start_time}?`)) return;

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelado' })
      .eq('id', app.id)
      .eq('tenant_id', tenant.id);

    if (error) {
      alert("Erro ao cancelar: " + error.message);
    } else {
      alert("Agendamento cancelado com sucesso!");

      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: tenant.id,
            title: '❌ Agendamento Cancelado',
            message: `O cliente ${app.customer_name} cancelou o agendamento do dia ${formattedDate} às ${app.start_time}.`,
            url: `https://agendamento.sinergemkt.com/${tenant.slug}/agenda`
          })
        });
      } catch (err) {
        console.error("Erro ao disparar notificação:", err);
      }

      const appProfObj = professionals.find(p => String(p.id) === String(app.professional_id));
      const targetPhone = (appProfObj && appProfObj.phone) ? appProfObj.phone : tenant.whatsapp;
      const cleanWhatsapp = targetPhone ? targetPhone.replace(/\D/g, '') : '';

      if (cleanWhatsapp) {
        const msg = `*CANCELAMENTO DE AGENDAMENTO #${app.id} - ${tenant.name.toUpperCase()}*\n\n` +
          `Olá, o cliente *${app.customer_name}* cancelou o agendamento do dia *${formattedDate}* às *${app.start_time}*.`;

        const waTarget = cleanWhatsapp.length <= 11 ? `55${cleanWhatsapp}` : cleanWhatsapp;
        window.location.href = `https://wa.me/${waTarget}?text=${encodeURIComponent(msg)}`;
      } else {
        handleSearchMyAppointments();
      }
    }
  };

  const handleOpenUserReschedule = (app) => {
    setEditingUserApp(app);
    setUserNewDate(app.appointment_date);
    setUserNewTime('');
  };

  const handleSaveUserReschedule = async (e) => {
    e.preventDefault();
    if (!userNewDate || !userNewTime) return alert("Selecione nova data e um horário disponível!");

    setIsSavingUserReschedule(true);

    const duration = editingUserApp.total_duration_minutes || 30;
    const [h, m] = userNewTime.split(':').map(Number);
    const endDateObj = new Date();
    endDateObj.setHours(h, m + duration, 0, 0);
    const endTime = endDateObj.toTimeString().substring(0, 5);

    const { error } = await supabase
      .from('appointments')
      .update({
        appointment_date: userNewDate,
        start_time: userNewTime,
        end_time: endTime,
        status: 'agendado'
      })
      .eq('id', editingUserApp.id)
      .eq('tenant_id', tenant.id);

    setIsSavingUserReschedule(false);

    if (error) {
      if (isSlotTakenError(error)) {
        setUserNewTime('');
        fetchExistingAppointmentsAndBlocks(userNewDate, editingUserApp.professional_id);
        return alert("⚠️ Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.");
      }
      return alert("Erro ao reagendar: " + error.message);
    }

    const formattedDate = userNewDate.split('-').reverse().join('/');

    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant.id,
          title: '🔄 Horário Reagendado!',
          message: `${editingUserApp.customer_name} reagendou o atendimento para ${formattedDate} às ${userNewTime}.`,
          url: `https://agendamento.sinergemkt.com/${tenant.slug}/agenda`
        })
      });
    } catch (err) {
      console.error("Erro ao disparar notificação:", err);
    }

    const appProfObj = professionals.find(p => String(p.id) === String(editingUserApp.professional_id));
    const targetPhone = (appProfObj && appProfObj.phone) ? appProfObj.phone : tenant.whatsapp;
    const cleanWhatsapp = targetPhone ? targetPhone.replace(/\D/g, '') : '';

    if (cleanWhatsapp) {
      const msg = `*SOLICITAÇÃO DE REAGENDAMENTO #${editingUserApp.id} - ${tenant.name.toUpperCase()}*\n\n` +
        `Cliente: *${editingUserApp.customer_name}*\n` +
        `Nova Data: *${formattedDate}*\n` +
        `Novo Horário: *${userNewTime}*`;

      const waTarget = cleanWhatsapp.length <= 11 ? `55${cleanWhatsapp}` : cleanWhatsapp;
      // Fecha o formulário antes de sair, para não reenviar ao voltar do WhatsApp
      setEditingUserApp(null);
      setMyAppointments(prev => prev.map(a => a.id === editingUserApp.id ? { ...a, appointment_date: userNewDate, start_time: userNewTime, end_time: endTime } : a));
      window.location.href = `https://wa.me/${waTarget}?text=${encodeURIComponent(msg)}`;
    } else {
      alert("Agendamento reagendado com sucesso!");
      setEditingUserApp(null);
      handleSearchMyAppointments();
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><p className="text-xs text-gray-400">Carregando...</p></div>;
  if (!tenant) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center font-sans"><h1 className="text-xl font-bold text-orange-500">Estabelecimento não encontrado</h1></div>;

  // MAPEAMENTO DAS CORES CONFIGURADAS NO PAINEL MASTER
  const primaryColor = tenant.primary_color || tenant.button_color || '#121212';
  const btnTextColor = tenant.button_text_color || '#FFFFFF';
  const bgColor = tenant.background_color || tenant.secondary_color || '#6C7B5B';
  const cardColor = tenant.card_color || tenant.card_bg_color || '#FFFFFF';
  const textColor = tenant.text_color || '#192F19';
  const priceColor = tenant.price_color || '#6C7B5B';

  const totalDuration = selectedServices.reduce((acc, s) => acc + (s.duration_minutes || 30), 0);
  const totalPrice = selectedServices.reduce((acc, s) => acc + Number(s.price || 0), 0);

  const selectedProfObj = professionals.find(p => String(p.id) === String(selectedProf));
  const activeInstagram = (selectedProfObj && selectedProfObj.instagram_url) 
    ? selectedProfObj.instagram_url 
    : (tenant?.instagram_url || '');

  const formattedInstagramUrl = activeInstagram
    ? (activeInstagram.startsWith('http') ? activeInstagram : `https://instagram.com/${activeInstagram.replace('@', '').trim()}`)
    : '';

  // IDENTIFICAÇÃO DO DIA DA SEMANA E AVISO DIÁRIO CORRESPONDENTE
  const selectedDayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
  let parsedDailyNotices = tenant?.daily_notices || {};
  if (typeof parsedDailyNotices === 'string') {
    try { parsedDailyNotices = JSON.parse(parsedDailyNotices); } catch (e) { parsedDailyNotices = {}; }
  }
  const currentDayNotice = parsedDailyNotices[selectedDayOfWeek] || parsedDailyNotices[String(selectedDayOfWeek)] || '';

  const displayedServices = services.filter(srv => {
    if (!selectedProf) return false;

    let allowedProfIds = srv.professional_ids;
    if (typeof allowedProfIds === 'string') {
      try { allowedProfIds = JSON.parse(allowedProfIds); } catch (e) { allowedProfIds = []; }
    }

    if (Array.isArray(allowedProfIds) && allowedProfIds.length > 0) {
      return allowedProfIds.some(id => String(id) === String(selectedProf));
    }

    const hasTableRel = profServices.some(ps => String(ps.service_id) === String(srv.id));
    if (hasTableRel) {
      return profServices.some(ps => String(ps.service_id) === String(srv.id) && String(ps.professional_id) === String(selectedProf));
    }

    return true;
  });

  // AGRUPAMENTO DE SERVIÇOS POR CATEGORIA (MANTÉM A ORDEM ORIGINAL DE EXIBIÇÃO)
  const groupedServices = displayedServices.reduce((acc, srv) => {
    const categoryName = (srv.category && srv.category.trim() !== '') ? srv.category.trim() : 'Serviços Gerais';
    if (!acc[categoryName]) {
      acc[categoryName] = [];
    }
    acc[categoryName].push(srv);
    return acc;
  }, {});

  const handleSelectProf = (profId) => {
    setSelectedProf(profId);
    setSelectedServices([]);
    setSelectedTime('');
  };

  const handleToggleService = (srv) => {
    const isSelected = selectedServices.some(s => s.id === srv.id);
    if (isSelected) {
      setSelectedServices([]);
    } else {
      setSelectedServices([srv]);
    }
    setSelectedTime('');
  };

  // FUNÇÃO DE VERIFICAÇÃO DE HORÁRIOS COM SALTO INTELIGENTE E INTERVALO DE 15 MINUTOS
  const getSlotAvailability = (targetProfId = selectedProf, targetServices = selectedServices, targetDate = selectedDate, ignoreAppId = null) => {
    if (targetServices.length === 0 || !targetDate) {
      return { slots: [], status: 'select_service', message: 'Selecione o serviço desejado.' };
    }

    if (!targetProfId) {
      return { slots: [], status: 'select_prof', message: '💈 Selecione um profissional.' };
    }

    const totalDur = targetServices.reduce((acc, s) => acc + (s.duration_minutes || 30), 0);
    const dateObj = new Date(targetDate + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();

    const profObj = professionals.find(p => String(p.id) === String(targetProfId));
    if (!profObj) {
      return { slots: [], status: 'no_prof', message: 'Profissional não encontrado.' };
    }

    // Tratamento para pDays em Array numérico
    let pDays = profObj.work_days || [1, 2, 3, 4, 5, 6];
    if (typeof pDays === 'string') {
      try { pDays = JSON.parse(pDays); } catch (e) { pDays = [1, 2, 3, 4, 5, 6]; }
    }
    const numericPDays = (Array.isArray(pDays) ? pDays : []).map(Number);

    if (!numericPDays.includes(dayOfWeek)) {
      return { slots: [], status: 'prof_off', message: `💈 ${profObj.name} não atende neste dia da semana.` };
    }

    let profWorkHours = profObj.work_hours || {};
    if (typeof profWorkHours === 'string') {
      try { profWorkHours = JSON.parse(profWorkHours); } catch (e) { profWorkHours = {}; }
    }

    const dayHours = profWorkHours[dayOfWeek] || { open: '08:00', close: '18:00' };

    const openHour = parseInt((dayHours.open || '08:00').split(':')[0]);
    const openMin = parseInt((dayHours.open || '08:00').split(':')[1] || '0');
    const closeHour = parseInt((dayHours.close || '18:00').split(':')[0]);
    const closeMin = parseInt((dayHours.close || '18:00').split(':')[1] || '0');

    let breakStartMin = -1;
    let breakEndMin = -1;
    if (profObj.break_start && profObj.break_end) {
      const [bStartH, bStartM] = profObj.break_start.split(':').map(Number);
      const [bEndH, bEndM] = profObj.break_end.split(':').map(Number);
      breakStartMin = bStartH * 60 + bStartM;
      breakEndMin = bEndH * 60 + bEndM;
    }

    const dayBlocks = blockedTimes.filter(b => {
      const isProfTarget = b.professional_id === null || b.professional_id === undefined || String(b.professional_id) === String(targetProfId);
      if (!isProfTarget) return false;

      if (b.block_date === targetDate) return true;
      const isRec = b.is_recurring || (b.reason && b.reason.includes('[RECORRENTE]'));
      if (isRec && Number(b.recurring_day) === dayOfWeek) return true;
      return false;
    });

    let currentMin = openHour * 60 + openMin;
    const endMin = closeHour * 60 + closeMin;
    const slots = new Set();

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = targetDate === todayStr;
    const nowInMinutes = now.getHours() * 60 + now.getMinutes();

    const profApps = existingAppointments.filter(app => String(app.professional_id) === String(targetProfId) && app.id !== ignoreAppId);

    while (currentMin + totalDur <= endMin) {
      if (isToday && currentMin <= nowInMinutes) {
        currentMin += 15;
        continue;
      }

      const slotStartMin = currentMin;
      const slotEndMin = currentMin + totalDur;

      let conflictingAppEndMin = null;
      const hasAppConflict = profApps.some(app => {
        const [aStartH, aStartM] = app.start_time.split(':').map(Number);
        const aStartMin = aStartH * 60 + aStartM;
        const aEndMin = aStartMin + (app.total_duration_minutes || 30);
        const isConflicting = Math.max(slotStartMin, aStartMin) < Math.min(slotEndMin, aEndMin);
        if (isConflicting && aEndMin > slotStartMin) {
          conflictingAppEndMin = Math.max(conflictingAppEndMin || 0, aEndMin);
        }
        return isConflicting;
      });

      let conflictingBlockEndMin = null;
      const hasBlockConflict = dayBlocks.some(b => {
        const [bStartH, bStartM] = b.start_time.split(':').map(Number);
        const [bEndH, bEndM] = b.end_time.split(':').map(Number);
        const bStartMin = bStartH * 60 + bStartM;
        const bEndMin = bEndH * 60 + bEndM;
        const isConflicting = Math.max(slotStartMin, bStartMin) < Math.min(slotEndMin, bEndMin);
        if (isConflicting && bEndMin > slotStartMin) {
          conflictingBlockEndMin = Math.max(conflictingBlockEndMin || 0, bEndMin);
        }
        return isConflicting;
      });

      const hasBreakConflict = (breakStartMin !== -1 && breakEndMin !== -1) && 
        (Math.max(slotStartMin, breakStartMin) < Math.min(slotEndMin, breakEndMin));

      if (!hasAppConflict && !hasBlockConflict && !hasBreakConflict) {
        const h = Math.floor(currentMin / 60);
        const m = currentMin % 60;
        const timeString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        slots.add(timeString);
        
        currentMin += 15;
      } else {
        let nextJumpMin = currentMin + 15;

        if (hasAppConflict && conflictingAppEndMin) {
          nextJumpMin = Math.max(nextJumpMin, conflictingAppEndMin);
        }
        if (hasBlockConflict && conflictingBlockEndMin) {
          nextJumpMin = Math.max(nextJumpMin, conflictingBlockEndMin);
        }
        if (hasBreakConflict) {
          nextJumpMin = Math.max(nextJumpMin, breakEndMin);
        }

        currentMin = nextJumpMin;
      }
    }

    return { slots: Array.from(slots), status: 'ok' };
  };

  const slotData = getSlotAvailability(selectedProf, selectedServices, selectedDate);
  const availableSlots = slotData.slots;

  const rescheduleSlotData = editingUserApp 
    ? getSlotAvailability(editingUserApp.professional_id, editingUserApp.services_json || [{ duration_minutes: editingUserApp.total_duration_minutes }], userNewDate, editingUserApp.id)
    : { slots: [] };

  const handleConfirmAppointment = async (e) => {
    e.preventDefault();
    // TRAVA IMEDIATA: impede dois envios por toque duplo
    if (submittingRef.current) return;

    const cleanPhone = customerPhone.replace(/\D/g, '');

    if (!selectedProf) return alert("Selecione a profissional!");
    if (selectedServices.length === 0) return alert("Selecione o serviço desejado!");
    if (!selectedTime) return alert("Selecione o horário desejado!");
    if (!customerName || cleanPhone.length < 10) return alert("Preencha seu Nome e WhatsApp válido!");

    submittingRef.current = true;
    setIsSubmitting(true);
    localStorage.setItem('client_saved_phone', cleanPhone);
    if (customerBirthDate) {
      localStorage.setItem('client_saved_birth', customerBirthDate);
    }

    const [h, m] = selectedTime.split(':').map(Number);
    const startMinutes = h * 60 + m;
    const endMinutesTotal = startMinutes + totalDuration;
    const endTime = `${String(Math.floor(endMinutesTotal / 60) % 24).padStart(2, '0')}:${String(endMinutesTotal % 60).padStart(2, '0')}`;

    // TRATAMENTO SEGURO DE ID DO PROFISSIONAL (NUMÉRICO OU STRING/UUID)
    const chosenProfId = isNaN(Number(selectedProf)) ? String(selectedProf) : Number(selectedProf);
    const chosenProfObj = professionals.find(p => String(p.id) === String(selectedProf));
    const chosenProfName = chosenProfObj?.name || '';
    const formattedDate = selectedDate.split('-').reverse().join('/');

    const finishWithError = (message) => {
      submittingRef.current = false;
      setIsSubmitting(false);
      if (message) alert(message);
    };

    // 1) CONFERE NO BANCO, NA HORA, SE O HORÁRIO AINDA ESTÁ LIVRE
    const { data: freshApps, error: freshError } = await supabase
      .from('appointments')
      .select('id, start_time, end_time, total_duration_minutes, customer_phone, status')
      .eq('tenant_id', tenant.id)
      .eq('appointment_date', selectedDate)
      .eq('professional_id', chosenProfId)
      .neq('status', 'cancelado');

    if (!freshError && freshApps) {
      const toMin = (t) => { const [hh, mm] = String(t || '0:0').split(':').map(Number); return hh * 60 + (mm || 0); };
      const conflicts = freshApps.filter(a => {
        const aStart = toMin(a.start_time);
        const aEnd = a.end_time ? toMin(a.end_time) : aStart + (a.total_duration_minutes || 30);
        return startMinutes < aEnd && endMinutesTotal > aStart;
      });

      // A mesma cliente já tem este horário (ex.: tocou duas vezes / voltou e confirmou de novo)
      const ownBooking = conflicts.find(a => String(a.customer_phone || '').replace(/\D/g, '').endsWith(cleanPhone) && toMin(a.start_time) === startMinutes);
      if (ownBooking) {
        submittingRef.current = false;
        setIsSubmitting(false);
        setSelectedTime('');
        setBookingDone({ id: ownBooking.id, date: formattedDate, time: selectedTime, profName: chosenProfName, waUrl: '', alreadyExisted: true });
        return;
      }

      if (conflicts.length > 0) {
        setSelectedTime('');
        setExistingAppointments(freshApps);
        return finishWithError("⚠️ Este horário acabou de ser reservado por outra pessoa. Escolha outro horário disponível.");
      }
    }

    const appointmentData = {
      tenant_id: tenant.id,
      professional_id: chosenProfId,
      customer_name: customerName,
      customer_phone: cleanPhone,
      client_birth_date: customerBirthDate || '',
      services_json: selectedServices,
      total_price: totalPrice,
      total_duration_minutes: totalDuration,
      appointment_date: selectedDate,
      start_time: selectedTime,
      end_time: endTime,
      payment_method: paymentMethod,
      status: 'agendado',
      is_paid: false
    };

    // 2) GRAVA (o banco também recusa se outra pessoa gravou no mesmo instante)
    const { data: createdApp, error } = await supabase.from('appointments').insert([appointmentData]).select().single();

    if (error) {
      if (isSlotTakenError(error)) {
        setSelectedTime('');
        fetchExistingAppointmentsAndBlocks(selectedDate, selectedProf);
        return finishWithError("⚠️ Este horário acabou de ser reservado por outra pessoa. Escolha outro horário disponível.");
      }
      return finishWithError("Erro ao agendar: " + error.message);
    }

    const servicesListText = selectedServices.map(s => `• ${s.name} (R$ ${Number(s.price).toFixed(2)})`).join('\n');

    // Notificação para a equipe deste estabelecimento (não espera terminar)
    try {
      fetch('/api/notify', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant.id,
          title: '✂️ Novo Agendamento Recebido!',
          message: `${customerName} agendou para ${formattedDate} às ${selectedTime} (${chosenProfName}).`,
          url: `https://agendamento.sinergemkt.com/${tenant.slug}/agenda`
        })
      }).catch(err => console.error("Erro ao disparar notificação:", err));
    } catch (err) {
      console.error("Erro ao disparar notificação:", err);
    }

    let msg = `*NOVO AGENDAMENTO #${createdApp.id} - ${tenant.name.toUpperCase()}*\n\n`;
    msg += `*Cliente:* ${customerName}\n*Telefone:* ${customerPhone}\n`;
    if (customerBirthDate) {
      msg += `*Aniversário:* ${customerBirthDate}\n`;
    }
    msg += `*Data:* ${formattedDate} às *${selectedTime}*\n`;
    msg += `*Profissional:* ${chosenProfName}\n\n`;
    msg += `*SERVIÇO:*\n${servicesListText}\n\n`;
    msg += `*Tempo Total:* ${formatDuration(totalDuration)}\n`;
    msg += `*TOTAL:* *R$ ${totalPrice.toFixed(2)}* (${paymentMethod})`;

    if (tenant.custom_message) {
      msg += `\n\n📌 _${tenant.custom_message}_`;
    }

    const targetPhone = (chosenProfObj && chosenProfObj.phone && chosenProfObj.phone.trim() !== '') 
      ? chosenProfObj.phone 
      : tenant.whatsapp;

    const waTarget = toWaNumber(targetPhone);
    const waUrl = waTarget ? `https://wa.me/${waTarget}?text=${encodeURIComponent(msg)}` : '';

    // 3) MOSTRA A TELA DE SUCESSO E LIMPA A SELEÇÃO.
    //    Se a cliente voltar do WhatsApp, verá "Agendamento confirmado" — e não o formulário preenchido.
    submittingRef.current = false;
    setIsSubmitting(false);
    setSelectedTime('');
    setBookingDone({ id: createdApp.id, date: formattedDate, time: selectedTime, profName: chosenProfName, waUrl });
    fetchExistingAppointmentsAndBlocks(selectedDate, selectedProf);

    // Mantém o comportamento de antes: abre o WhatsApp automaticamente
    if (waUrl) {
      setTimeout(() => { window.location.href = waUrl; }, 900);
    }
  };

  const handleNewBooking = () => {
    setBookingDone(null);
    setSelectedServices([]);
    setSelectedTime('');
    if (selectedProf) fetchExistingAppointmentsAndBlocks(selectedDate, selectedProf);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const targetLoyaltyVisits = tenant?.loyalty_target_visits || 10;
  const isRewardReady = loyaltyCount >= targetLoyaltyVisits;

  return (
    <div className="min-h-screen font-sans pb-12 transition-colors duration-300 flex flex-col justify-between" style={{ backgroundColor: bgColor, color: textColor }}>
      
      {/* PWA & METATAGS DINÂMICAS */}
      <Head>
        <title>{tenant?.name ? `${tenant.name} - Agendamento Online` : 'Agendamento Online'}</title>
        {slug && <link rel="manifest" href={`/api/manifest?slug=${slug}&app=catalogo`} />}
        <meta name="theme-color" content={primaryColor} />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={tenant?.name || 'Agendamento'} />
      </Head>

      {/* CONTAINER RESPONSIVO */}
      <div className="w-full max-w-md sm:max-w-2xl md:max-w-4xl mx-auto px-0 sm:px-4 md:px-6">
        
        {/* BANNER / CAPA DA LOJA */}
        <div className="relative h-36 sm:h-48 md:h-56 bg-gray-900 sm:rounded-2xl overflow-hidden shadow-md border-b sm:border border-black/10">
          <img src={tenant.banner_url || 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80'} alt="Capa" className="w-full h-full object-cover opacity-60" />

          {formattedInstagramUrl && (
            <a
              href={formattedInstagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-3 left-3 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white font-bold text-[10px] sm:text-xs px-3 py-1.5 rounded-full shadow-lg transition flex items-center space-x-1 hover:opacity-90 z-10">
              <span>📸 Instagram</span>
            </a>
          )}

          <button
            onClick={() => {
              setShowMyAppsModal(true);
              if (searchPhone) handleSearchMyAppointments();
            }}
            style={{ backgroundColor: primaryColor, color: btnTextColor }}
            className="absolute top-3 right-3 font-bold text-[10px] sm:text-xs px-3 py-1.5 rounded-full shadow-lg transition z-10">
            📋 Meus Agendamentos
          </button>
        </div>

        {/* CABEÇALHO DO PROFISSIONAL / ESTABELECIMENTO */}
        <div className="relative px-4 sm:px-2 -mt-8 sm:-mt-10 flex items-end space-x-3 sm:space-x-4 mb-4 z-10">
          <img 
            src={selectedProfObj?.avatar_url || tenant.logo_url || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=150&auto=format&fit=crop&q=80'} 
            alt="Foto Profissional" 
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 shadow-xl object-cover bg-gray-800 shrink-0" 
            style={{ borderColor: cardColor }}
          />
          <div className="pb-1">
            <h1 className="font-bold text-lg sm:text-2xl leading-tight" style={{ color: textColor }}>
              {selectedProfObj ? selectedProfObj.name : tenant.name}
            </h1>
            <p className="text-xs sm:text-sm opacity-80 font-medium">
              {selectedProfObj?.specialty ? selectedProfObj.specialty : (selectedProfObj ? `💈 ${tenant.name}` : '📅 Agendamento Online')}
            </p>
          </div>
        </div>

        <div className="px-4 sm:px-0 space-y-6">

          {/* BANNER DE AVISO GERAL / MENSAGEM CUSTOMIZADA DO ESTABELECIMENTO */}
          {tenant.custom_message && tenant.custom_message.trim() !== '' && (
            <div 
              style={{ backgroundColor: cardColor, color: textColor, borderColor: priceColor }} 
              className="p-4 rounded-2xl border-l-4 shadow-sm space-y-1 text-xs">
              <div className="flex items-center space-x-1.5 font-bold">
                <span>📢</span>
                <span style={{ color: priceColor }}>Aviso Importante</span>
              </div>
              <p className="opacity-90 leading-relaxed text-[11px] sm:text-xs">
                {tenant.custom_message}
              </p>
            </div>
          )}

          {/* CARTÃO FIDELIDADE DIGITAL */}
          {tenant.loyalty_enabled && customerPhone.replace(/\D/g, '').length >= 10 && (
            <div 
              style={{ backgroundColor: cardColor, color: textColor }} 
              className="p-4 rounded-2xl border border-black/10 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-xs flex items-center space-x-1" style={{ color: priceColor }}>
                    <span>💳 Cartão Fidelidade</span>
                  </h4>
                  <p className="text-[10px] opacity-70">
                    {isRewardReady 
                      ? `🎉 Parabéns! Atingiu a meta. Resgate: ${tenant.loyalty_reward_text}` 
                      : `Complete ${targetLoyaltyVisits} selos e ganhe: ${tenant.loyalty_reward_text}`}
                  </p>
                </div>
                <span 
                  className="text-xs font-bold px-2.5 py-1 rounded-lg border border-black/10" 
                  style={{ backgroundColor: bgColor, color: textColor }}>
                  {loyaltyCount}/{targetLoyaltyVisits}
                </span>
              </div>

              {/* GRID DE SELOS */}
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 pt-1">
                {Array.from({ length: targetLoyaltyVisits }).map((_, index) => {
                  const isStamped = index < loyaltyCount;
                  return (
                    <div
                      key={index}
                      style={{
                        backgroundColor: isStamped ? primaryColor : bgColor,
                        color: isStamped ? btnTextColor : textColor,
                        borderColor: 'rgba(0,0,0,0.1)'
                      }}
                      className={`h-8 sm:h-9 rounded-xl flex items-center justify-center text-xs font-bold border transition-all ${
                        isStamped ? 'shadow-md scale-105' : 'opacity-40'
                      }`}
                    >
                      {isStamped ? '✂️' : index + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PASSO 1: ESCOLHA O PROFISSIONAL */}
          {professionals.length > 1 && (
            <div className="space-y-2">
              <label className="text-xs font-bold block uppercase tracking-wider opacity-80">1. Escolha a Profissional</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
                {professionals.map(p => {
                  const isSelected = String(selectedProf) === String(p.id);

                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => handleSelectProf(p.id)}
                      style={{ 
                        backgroundColor: isSelected ? primaryColor : cardColor,
                        color: isSelected ? btnTextColor : textColor,
                        borderColor: isSelected ? primaryColor : 'rgba(0,0,0,0.1)'
                      }}
                      className="p-3 rounded-2xl border flex items-center space-x-2.5 text-left transition shadow-md relative overflow-hidden">
                      <img 
                        src={p.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'} 
                        alt={p.name} 
                        className="w-10 h-10 rounded-full object-cover border border-black/20 shrink-0 bg-gray-800" 
                      />
                      <div className="truncate">
                        <span className="font-bold text-xs block truncate">{p.name}</span>
                        <span className="text-[10px] opacity-80 block truncate font-medium">
                          {p.specialty || 'Atendimento'}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="absolute top-1.5 right-2 text-[10px] font-bold">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* PASSO 2: ESCOLHA O SERVIÇO (ORGANIZADO POR CATEGORIA) */}
          {selectedProf ? (
            <div className="space-y-4 pt-2 border-t border-black/10">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold block uppercase tracking-wider opacity-80">
                  {professionals.length > 1 ? `2. Serviço de ${selectedProfObj?.name}` : `1. Escolha o Serviço de ${selectedProfObj?.name}`}
                </label>
                {selectedServices.length > 0 && (
                  <span className="text-[10px] font-bold opacity-80" style={{ color: priceColor }}>
                    1 selecionado ({formatDuration(totalDuration)})
                  </span>
                )}
              </div>

              {displayedServices.length === 0 ? (
                <p className="text-xs opacity-60 p-4 rounded-xl text-center border border-black/10" style={{ backgroundColor: cardColor, color: textColor }}>
                  Nenhum serviço cadastrado para esta profissional.
                </p>
              ) : (
                <div className="space-y-5">
                  {Object.entries(groupedServices).map(([categoryName, categoryServices]) => (
                    <div key={categoryName} className="space-y-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider opacity-70 border-b border-black/10 pb-1 flex items-center space-x-1" style={{ color: priceColor }}>
                        <span>📁</span>
                        <span>{categoryName}</span>
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {categoryServices.map(srv => {
                          const isSelected = selectedServices.some(s => s.id === srv.id);
                          const serviceImg = srv.image_url || srv.image;

                          return (
                            <div
                              key={srv.id}
                              onClick={() => handleToggleService(srv)}
                              style={{
                                backgroundColor: cardColor,
                                borderColor: isSelected ? primaryColor : 'rgba(0,0,0,0.1)',
                                color: textColor
                              }}
                              className="p-3 rounded-xl border flex justify-between items-center cursor-pointer transition shadow-sm hover:opacity-95">
                              <div className="flex items-center space-x-3">
                                {serviceImg && (
                                  <img 
                                    src={serviceImg} 
                                    alt={srv.name} 
                                    className="w-12 h-12 rounded-xl object-cover border border-black/10 bg-gray-800 shrink-0" 
                                  />
                                )}
                                <div>
                                  <h3 className="font-bold text-xs">{srv.name}</h3>
                                  <p className="text-[10px] opacity-60">⏱️ {formatDuration(srv.duration_minutes)}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-xs block" style={{ color: priceColor }}>
                                  R$ {Number(srv.price).toFixed(2)}
                                </span>
                                <span className="block text-[10px] font-bold mt-0.5" style={{ color: isSelected ? priceColor : 'rgba(0,0,0,0.4)' }}>
                                  {isSelected ? '✓ Selecionado' : 'Selecionar'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-2xl border border-dashed border-black/20 text-center" style={{ backgroundColor: cardColor, color: textColor }}>
              <span className="text-lg block mb-1">👆</span>
              <p className="text-xs opacity-60">Selecione uma profissional acima para ver os serviços e valores.</p>
            </div>
          )}

          {/* PASSO 3: DATA E HORÁRIO */}
          {selectedProf && selectedServices.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-black/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold block uppercase tracking-wider opacity-80">
                    {professionals.length > 1 ? '3. Escolha a Data' : '2. Escolha a Data'}
                  </label>
                  <input
                    type="date"
                    min={getTodayLocal()}
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setSelectedTime('');
                    }}
                    style={{ backgroundColor: cardColor, color: textColor }}
                    className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none cursor-pointer shadow-sm"
                  />

                  {/* BANNER DE AVISO ESPECÍFICO DO DIA SELECIONADO (SE HOUVER) */}
                  {currentDayNotice && currentDayNotice.trim() !== '' && (
                    <div 
                      style={{ backgroundColor: cardColor, color: textColor, borderColor: priceColor }} 
                      className="p-3.5 rounded-xl border-l-4 shadow-sm space-y-1 text-xs animate-fadeIn">
                      <div className="flex items-center space-x-1.5 font-bold">
                        <span>⚠️</span>
                        <span style={{ color: priceColor }}>Aviso para {DAY_NAMES[selectedDayOfWeek]}</span>
                      </div>
                      <p className="opacity-90 leading-relaxed text-[11px] sm:text-xs">
                        {currentDayNotice}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold block uppercase tracking-wider opacity-80">
                    {professionals.length > 1 ? `4. Horários Disponíveis (${availableSlots.length})` : `3. Horários Disponíveis (${availableSlots.length})`}
                  </label>
                  
                  {slotData.status !== 'ok' ? (
                    <p className="text-xs text-red-500 bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-center font-semibold">
                      {slotData.message}
                    </p>
                  ) : availableSlots.length === 0 ? (
                    <div className="text-xs text-red-500 bg-red-500/10 p-3.5 rounded-xl border border-red-500/20 text-center space-y-1">
                      <p className="font-bold">Nenhum horário disponível nesta data para este procedimento.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto pt-1">
                      {availableSlots.map(slot => {
                        const isSelected = selectedTime === slot;
                        return (
                          <button
                            type="button"
                            key={slot}
                            onClick={() => setSelectedTime(slot)}
                            style={{ 
                              backgroundColor: isSelected ? primaryColor : cardColor,
                              color: isSelected ? btnTextColor : textColor
                            }}
                            className="py-2 rounded-lg border border-black/10 text-xs font-bold text-center transition shadow-sm hover:scale-105">
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* PASSO 4: CONFIRMAÇÃO DE DADOS */}
          {selectedTime && (
            <form onSubmit={handleConfirmAppointment} className="space-y-3 pt-4 border-t border-black/10">
              <h3 className="font-bold text-xs uppercase tracking-wider opacity-80">
                {professionals.length > 1 ? '5. Seus Dados' : '4. Seus Dados'}
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Seu Nome Completo"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  style={{ backgroundColor: cardColor, color: textColor }}
                  className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none shadow-sm"
                />
                <input
                  type="text"
                  required
                  placeholder="Seu WhatsApp (DDD + Número)"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(maskPhone(e.target.value))}
                  style={{ backgroundColor: cardColor, color: textColor }}
                  className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none shadow-sm"
                />
                <input
                  type="text"
                  placeholder="Aniversário (Dia/Mês - Ex: 15/08)"
                  value={customerBirthDate}
                  onChange={(e) => setCustomerBirthDate(maskBirthDate(e.target.value))}
                  style={{ backgroundColor: cardColor, color: textColor }}
                  className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none shadow-sm"
                />
              </div>

              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ backgroundColor: cardColor, color: textColor }}
                className="w-full border border-black/10 p-3 rounded-xl text-xs focus:outline-none shadow-sm">
                <option value="No Local">Pagar no Local (Dinheiro / Cartão / PIX)</option>
                <option value="PIX Antecipado">PIX Antecipado</option>
              </select>

              <div style={{ backgroundColor: cardColor, color: textColor }} className="p-3.5 rounded-xl border border-black/10 flex justify-between items-center text-xs shadow-sm">
                <div>
                  <span className="opacity-60 block text-[10px]">Duração: {formatDuration(totalDuration)}</span>
                  <span className="font-bold text-sm">TOTAL: R$ {totalPrice.toFixed(2)}</span>
                </div>
                <span className="font-bold text-sm" style={{ color: priceColor }}>{selectedDate.split('-').reverse().join('/')} às {selectedTime}</span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{ backgroundColor: primaryColor, color: btnTextColor }}
                className="w-full font-bold py-3.5 rounded-xl text-xs shadow-lg transition hover:opacity-90 disabled:opacity-60">
                {isSubmitting ? 'Agendando...' : 'Confirmar Agendamento no WhatsApp 🚀'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* RODAPÉ DO ESTABELECIMENTO */}
      <footer className="mt-12 pt-6 border-t border-black/10 text-center space-y-2 px-4 pb-4 opacity-80">
        <div className="flex justify-center items-center space-x-2">
          {tenant.logo_url && (
            <img src={tenant.logo_url} alt={tenant.name} className="w-5 h-5 rounded-full object-cover border border-black/10" />
          )}
          <span className="font-bold text-xs">{tenant.name}</span>
        </div>

        {formattedInstagramUrl && (
          <a
            href={formattedInstagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1 text-[11px] font-semibold opacity-90 hover:underline">
            <span>📸 Acompanhe no Instagram</span>
          </a>
        )}

        <p className="text-[10px] opacity-60">
          © {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.
        </p>
        <p className="text-[9px] opacity-40">
          Tecnologia por Sinerge MKT
        </p>
      </footer>

      {/* TELA DE SUCESSO DO AGENDAMENTO */}
      {bookingDone && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div style={{ backgroundColor: cardColor, color: textColor }} className="border border-black/10 w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl text-center">
            <div className="text-4xl">✅</div>
            <div>
              <h3 className="font-bold text-base" style={{ color: priceColor }}>
                {bookingDone.alreadyExisted ? 'Você já está agendada(o)!' : 'Agendamento confirmado!'}
              </h3>
              <p className="text-xs opacity-80 mt-1">
                Código <b>#{bookingDone.id}</b>
              </p>
            </div>
            <div style={{ backgroundColor: bgColor }} className="p-3 rounded-xl text-xs space-y-1 border border-black/10">
              <p><b>📅 {bookingDone.date}</b> às <b>{bookingDone.time}</b></p>
              {bookingDone.profName && <p>👤 {bookingDone.profName}</p>}
            </div>
            <p className="text-[11px] opacity-70">
              Seu horário já está reservado. Não é preciso agendar de novo.
            </p>
            {bookingDone.waUrl && (
              <a
                href={bookingDone.waUrl}
                style={{ backgroundColor: primaryColor, color: btnTextColor }}
                className="block w-full font-bold py-3 rounded-xl text-xs shadow-lg">
                💬 Enviar confirmação no WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={handleNewBooking}
              className="w-full py-2.5 rounded-xl text-xs font-bold border border-black/10 opacity-80">
              Fazer outro agendamento
            </button>
          </div>
        </div>
      )}

      {/* MODAL MEUS AGENDAMENTOS */}
      {showMyAppsModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div style={{ backgroundColor: cardColor, color: textColor }} className="border border-black/10 w-full max-w-sm sm:max-w-md rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-black/10 pb-2">
              <h3 className="font-bold text-sm" style={{ color: priceColor }}>📋 Meus Agendamentos</h3>
              <button onClick={() => { setShowMyAppsModal(false); setEditingUserApp(null); }} className="opacity-60 font-bold text-xs">✕ Fechar</button>
            </div>

            {!editingUserApp ? (
              <>
                <form onSubmit={handleSearchMyAppointments} className="space-y-2">
                  <label className="text-[11px] opacity-70 block">Digite seu WhatsApp para consultar:</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="(DDD) 99999-9999"
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(maskPhone(e.target.value))}
                      style={{ backgroundColor: bgColor, color: textColor }}
                      className="w-full border border-black/10 p-2.5 rounded-xl text-xs focus:outline-none"
                    />
                    <button type="submit" disabled={isSearchingApps} style={{ backgroundColor: primaryColor, color: btnTextColor }} className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap">
                      {isSearchingApps ? '...' : 'Buscar'}
                    </button>
                  </div>
                </form>

                {/* VISUALIZAÇÃO DO CARTÃO FIDELIDADE DENTRO DO MODAL */}
                {tenant.loyalty_enabled && searchPhone.replace(/\D/g, '').length >= 10 && (
                  <div style={{ backgroundColor: bgColor }} className="p-3.5 rounded-xl border border-black/10 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs" style={{ color: priceColor }}>💳 Seu Cartão Fidelidade</span>
                      <span className="font-bold text-xs">{loyaltyCount}/{targetLoyaltyVisits} Selos</span>
                    </div>
                    <p className="text-[10px] opacity-70">
                      {isRewardReady 
                        ? `🎉 Meta atingida! Prêmio disponível: ${tenant.loyalty_reward_text}` 
                        : `Complete ${targetLoyaltyVisits} selos e ganhe: ${tenant.loyalty_reward_text}`}
                    </p>
                    <div className="grid grid-cols-5 gap-1.5 pt-1">
                      {Array.from({ length: targetLoyaltyVisits }).map((_, index) => {
                        const isStamped = index < loyaltyCount;
                        return (
                          <div
                            key={index}
                            style={{
                              backgroundColor: isStamped ? primaryColor : cardColor,
                              color: isStamped ? btnTextColor : textColor
                            }}
                            className={`h-7 rounded-lg flex items-center justify-center text-[10px] font-bold border border-black/10 ${
                              isStamped ? 'shadow-sm scale-105' : 'opacity-50'
                            }`}
                          >
                            {isStamped ? '✂️' : index + 1}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {myAppointments.length === 0 ? (
                    <p className="text-xs opacity-50 text-center py-4">Nenhum agendamento encontrado.</p>
                  ) : (
                    myAppointments.map(app => {
                      const canManage = app.status === 'agendado';

                      return (
                        <div key={app.id} style={{ backgroundColor: bgColor, color: textColor }} className="p-3 rounded-xl border border-black/10 text-xs space-y-2">
                          <div className="flex justify-between font-bold">
                            <span style={{ color: priceColor }}>📅 {app.appointment_date.split('-').reverse().join('/')} às {app.start_time}</span>
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              app.status === 'agendado' ? 'bg-yellow-500/20 text-yellow-500' :
                              app.status === 'concluido' ? 'bg-green-500/20 text-green-500' :
                              'bg-red-500/20 text-red-500'
                            }`}>
                              {app.status}
                            </span>
                          </div>

                          <p className="opacity-80"><b>Valor:</b> R$ {Number(app.total_price).toFixed(2)} ({app.payment_method})</p>

                          {canManage && (
                            <div className="flex space-x-2 pt-1 border-t border-black/10">
                              <button
                                onClick={() => handleOpenUserReschedule(app)}
                                className="flex-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-600 py-1.5 rounded-lg font-bold text-[10px] border border-purple-500/30">
                                ✏️ Reagendar
                              </button>
                              <button
                                onClick={() => handleUserCancelApp(app)}
                                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-600 py-1.5 rounded-lg font-bold text-[10px] border border-red-500/30">
                                ❌ Cancelar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              /* FORMULÁRIO DE REAGENDAMENTO */
              <form onSubmit={handleSaveUserReschedule} className="space-y-3">
                <div className="bg-purple-500/10 border border-purple-500/30 p-2.5 rounded-xl text-xs">
                  <span className="text-purple-600 font-bold block">Reagendando Atendimento #{editingUserApp.id}</span>
                  <span className="opacity-60 text-[10px]">Data Atual: {editingUserApp.appointment_date.split('-').reverse().join('/')} às {editingUserApp.start_time}</span>
                </div>

                <div>
                  <label className="text-[11px] opacity-70 block mb-1">Nova Data:</label>
                  <input
                    type="date"
                    min={getTodayLocal()}
                    value={userNewDate}
                    onChange={(e) => {
                      setUserNewDate(e.target.value);
                      setUserNewTime('');
                    }}
                    style={{ backgroundColor: bgColor, color: textColor }}
                    className="w-full border border-black/10 p-2.5 rounded-xl text-xs focus:outline-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[11px] opacity-70 block mb-1">Escolha o Novo Horário Livre:</label>
                  {rescheduleSlotData.slots.length === 0 ? (
                    <p className="text-[11px] text-red-500 bg-red-500/10 p-2 rounded-lg text-center font-semibold">
                      Sem horários vagos nesta data.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto pt-1">
                      {rescheduleSlotData.slots.map(slot => (
                        <button
                          type="button"
                          key={slot}
                          onClick={() => setUserNewTime(slot)}
                          style={{
                            backgroundColor: userNewTime === slot ? primaryColor : bgColor,
                            color: userNewTime === slot ? btnTextColor : textColor
                          }}
                          className="py-1.5 rounded-lg border border-black/10 text-xs font-bold text-center transition">
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingUserApp(null)}
                    className="w-1/2 bg-gray-300 text-gray-800 py-2.5 rounded-xl text-xs font-bold">
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingUserReschedule || !userNewTime}
                    style={{ backgroundColor: primaryColor, color: btnTextColor }}
                    className="w-1/2 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-50">
                    {isSavingUserReschedule ? 'Salvando...' : 'Confirmar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
