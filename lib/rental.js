// =====================================================================
// MÓDULO LOCAÇÃO — regras de cálculo (usado pela loja, pelo painel e pelo servidor)
// Tudo aqui é configurável pela própria loja em Admin > Locação > Configurações.
// =====================================================================

export const DEFAULT_RENTAL_SETTINGS = {
  // Como contar os dias: 'diarias' (retira dia 10, devolve dia 12 = 2 diárias)
  //                      'inclusivo' (retira dia 10, devolve dia 12 = 3 dias)
  day_count_mode: 'diarias',
  min_advance_days: 1,          // antecedência mínima para reservar (dias)
  max_rental_days: 30,          // máximo de dias por locação
  buffer_days: 0,               // dias de folga entre locações (limpeza/manutenção)

  // Caução: 'nenhuma' | 'percent_total' (% do pedido) | 'percent_reposicao' (% do valor de reposição) | 'fixa'
  deposit_mode: 'nenhuma',
  deposit_value: 0,
  deposit_note: 'A caução é devolvida após a conferência dos itens.',

  // Pagamento: 0 = cliente paga o total; 1..99 = sinal em % para reservar
  down_payment_percent: 0,

  // Entrega / retirada
  allow_pickup: true,
  allow_delivery: true,
  allow_assembly: false,
  assembly_fee: 0,
  ask_times: true,              // pedir horário de entrega e de devolução

  // Cadastro
  require_document: true,       // exigir CPF/CNPJ no pedido
  allow_company_signup: true,   // permitir cadastro de empresas (CNPJ) pela loja

  // Termo de locação (o cliente precisa aceitar)
  require_terms: true,
  terms_text:
    'Declaro que conferi os itens e me responsabilizo pela guarda e conservação durante o período da locação. ' +
    'Em caso de dano, perda ou devolução incompleta, pagarei o valor de reposição indicado para cada item. ' +
    'Atrasos na devolução poderão ser cobrados como diárias adicionais.',

  // Mensagens automáticas (WhatsApp). Campos: {nome} {pedido} {loja} {itens} {data_retirada}
  // {data_devolucao} {dias} {total} {sinal} {caucao} {link} {endereco}
  templates: {
    pedido_recebido:
      'Olá {nome}! Recebemos sua reserva *#{pedido}* na *{loja}*.\n\n{itens}\n\n📅 Retirada/entrega: *{data_retirada}*\n📅 Devolução: *{data_devolucao}* ({dias})\n💰 Total: *{total}*{sinal}{caucao}\n\nAcompanhe: {link}',
    pedido_confirmado:
      'Olá {nome}! Sua reserva *#{pedido}* na *{loja}* está *CONFIRMADA* ✅\n📅 {data_retirada} até {data_devolucao}.\nQualquer dúvida é só chamar!',
    lembrete_entrega:
      'Olá {nome}! Lembrete: amanhã (*{data_retirada}*) é o dia da retirada/entrega da sua reserva *#{pedido}* na *{loja}*. 📦',
    lembrete_devolucao:
      'Olá {nome}! Lembrete: a devolução dos itens da reserva *#{pedido}* é amanhã (*{data_devolucao}*). Obrigado por alugar com a *{loja}*! 🙏',
    atraso:
      'Olá {nome}! A devolução da reserva *#{pedido}* estava prevista para *{data_devolucao}*. Pode nos informar quando fará a entrega dos itens?',
    devolvido:
      'Olá {nome}! Recebemos os itens da reserva *#{pedido}*. Obrigado pela preferência! 💛'
  }
};

export function getRentalSettings(tenant) {
  let saved = tenant?.rental_settings || {};
  if (typeof saved === 'string') {
    try { saved = JSON.parse(saved); } catch (e) { saved = {}; }
  }
  return {
    ...DEFAULT_RENTAL_SETTINGS,
    ...saved,
    templates: { ...DEFAULT_RENTAL_SETTINGS.templates, ...(saved.templates || {}) }
  };
}

// Modo da loja: só vale se o módulo foi liberado pelo master
export function getStoreMode(tenant) {
  if (!tenant?.rental_module_enabled) return 'venda';
  const m = tenant?.store_mode;
  return m === 'aluguel' || m === 'ambos' ? m : 'venda';
}

export const isRentalStore = (tenant) => getStoreMode(tenant) !== 'venda';
export const isSaleStore = (tenant) => getStoreMode(tenant) !== 'aluguel';

export function num(val, fallback = 0) {
  if (val === null || val === undefined || val === '') return fallback;
  const n = parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? fallback : n;
}

export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export const formatBRL = (v) =>
  'R$ ' + round2(num(v)).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function formatDateBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const toUTC = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDaysISO(iso, days) {
  const t = new Date(toUTC(iso) + days * 86400000);
  return t.toISOString().slice(0, 10);
}

export const todayISO = () => new Date().toLocaleDateString('sv-SE');

// Quantos dias serão cobrados entre retirada e devolução
export function countRentalDays(start, end, mode = 'diarias') {
  if (!start || !end) return 0;
  const diff = Math.round((toUTC(end) - toUTC(start)) / 86400000);
  if (diff < 0) return 0;
  return mode === 'inclusivo' ? diff + 1 : Math.max(1, diff);
}

export function getPeriods(product) {
  let list = product?.rental_periods_json || [];
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch (e) { list = []; }
  }
  return (Array.isArray(list) ? list : [])
    .map((p) => ({ label: String(p.label || '').trim(), days: parseInt(p.days, 10) || 0, price: num(p.price) }))
    .filter((p) => p.days > 0 && p.price > 0)
    .sort((a, b) => a.days - b.days);
}

const applyDiscount = (value, percent) => round2(value * (1 - Math.min(Math.max(num(percent), 0), 100) / 100));

// Preço da locação de UMA unidade para N dias.
// Escolhe automaticamente a opção mais barata entre "diária × dias" e os pacotes que cobrem o período.
// O desconto da tabela de preço (ex.: CNPJ -15%) é aplicado por cima.
export function computeRentalUnitPrice(product, days, discountPercent = 0) {
  const d = Math.max(1, parseInt(days, 10) || 1);
  const daily = num(product?.rental_daily_price);
  const dailyOriginal = num(product?.rental_original_price);
  const options = [];

  if (daily > 0) {
    options.push({ mode: 'diaria', label: `${d} diária${d > 1 ? 's' : ''} × ${formatBRL(daily)}`, base: daily * d });
  }
  getPeriods(product).forEach((p) => {
    if (p.days >= d) options.push({ mode: 'pacote', label: p.label || `Pacote até ${p.days} dias`, base: p.price });
  });

  if (options.length === 0) {
    return { available: false, unit: 0, base: 0, original: 0, mode: null, label: 'Sem preço de locação para este período' };
  }

  const best = options.reduce((a, b) => (b.base < a.base ? b : a));
  const unit = applyDiscount(best.base, discountPercent);

  // Valor "De" para mostrar promoção (quando a diária tem preço antigo maior)
  let original = 0;
  if (dailyOriginal > daily && best.mode === 'diaria') original = round2(dailyOriginal * d);
  else if (num(discountPercent) > 0) original = round2(best.base);

  return { available: true, unit, base: round2(best.base), original, mode: best.mode, label: best.label, days: d };
}

// Preço exibido na vitrine (a partir de / por diária)
export function displayDailyPrice(product, discountPercent = 0) {
  const daily = num(product?.rental_daily_price);
  const periods = getPeriods(product);
  if (daily > 0) {
    return {
      price: applyDiscount(daily, discountPercent),
      original: num(product?.rental_original_price) > daily ? applyDiscount(num(product.rental_original_price), discountPercent) : (num(discountPercent) > 0 ? daily : 0),
      suffix: '/dia'
    };
  }
  if (periods.length > 0) {
    return { price: applyDiscount(periods[0].price, discountPercent), original: num(discountPercent) > 0 ? periods[0].price : 0, suffix: ` (${periods[0].label || `até ${periods[0].days} dias`})` };
  }
  return { price: 0, original: 0, suffix: '' };
}

export const hasRentalPromo = (product) => num(product?.rental_original_price) > num(product?.rental_daily_price) && num(product?.rental_daily_price) > 0;

// Caução do pedido
export function computeDeposit(settings, items, rentalSubtotal) {
  const mode = settings?.deposit_mode || 'nenhuma';
  const value = num(settings?.deposit_value);
  if (mode === 'percent_total') return round2(rentalSubtotal * value / 100);
  if (mode === 'percent_reposicao') {
    const totalReplacement = (items || []).reduce((s, it) => s + num(it.replacement_value) * (parseInt(it.quantity, 10) || 1), 0);
    return round2(totalReplacement * value / 100);
  }
  if (mode === 'fixa') return round2(value);
  return 0;
}

// Sinal para reservar (0 = paga o total)
export function computeDownPayment(settings, total) {
  const pct = Math.min(Math.max(num(settings?.down_payment_percent), 0), 100);
  if (pct <= 0 || pct >= 100) return round2(total);
  return round2(total * pct / 100);
}

// Valida as datas escolhidas pelo cliente. Retorna '' se estiver tudo certo, ou a mensagem de erro.
export function validateRentalDates(settings, start, end, today = todayISO()) {
  if (!start || !end) return 'Escolha a data de retirada e a de devolução.';
  if (toUTC(end) < toUTC(start)) return 'A devolução não pode ser antes da retirada.';
  const minStart = addDaysISO(today, parseInt(settings?.min_advance_days, 10) || 0);
  if (toUTC(start) < toUTC(minStart)) {
    return `A retirada precisa ser a partir de ${formatDateBR(minStart)} (antecedência mínima de ${settings.min_advance_days} dia(s)).`;
  }
  const days = countRentalDays(start, end, settings?.day_count_mode);
  const max = parseInt(settings?.max_rental_days, 10) || 0;
  if (max > 0 && days > max) return `O período máximo de locação é de ${max} dias.`;
  return '';
}

// Preenche os campos {nome}, {pedido}... de uma mensagem
export function renderTemplate(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, key) => (vars && vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ''));
}

// Variáveis da mensagem a partir de um pedido de locação
export function buildOrderMessageVars(order, tenant, baseUrl = '') {
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemsText = items.map((i) => `• ${i.quantity}x ${i.name}`).join('\n');
  const days = order?.rental_days ? `${order.rental_days} dia${order.rental_days > 1 ? 's' : ''}` : '';
  const down = num(order?.down_payment_value);
  const dep = num(order?.deposit_value);
  return {
    nome: String(order?.customer_name || '').split(' ')[0],
    pedido: order?.id,
    loja: tenant?.name || '',
    itens: itemsText,
    data_retirada: formatDateBR(order?.rental_start) + (order?.delivery_time ? ` às ${order.delivery_time}` : ''),
    data_devolucao: formatDateBR(order?.rental_end) + (order?.return_time ? ` às ${order.return_time}` : ''),
    dias: days,
    total: formatBRL(order?.total),
    sinal: down > 0 && down < num(order?.total) ? `\n💳 Sinal para reservar: *${formatBRL(down)}*` : '',
    caucao: dep > 0 ? `\n🔒 Caução: *${formatBRL(dep)}*` : '',
    endereco: order?.address || '',
    link: baseUrl && tenant?.slug && order?.id ? `${baseUrl}/${tenant.slug}/pedido/${order.id}` : ''
  };
}

// ---------------------------------------------------------------------
// CPF / CNPJ
// ---------------------------------------------------------------------
export const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

export function isValidCPF(value) {
  const c = onlyDigits(value);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(c[i], 10) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(c[9], 10) && calc(10) === parseInt(c[10], 10);
}

export function isValidCNPJ(value) {
  const c = onlyDigits(value);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, w, i) => s + parseInt(c[i], 10) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(c[12], 10) && calc(13) === parseInt(c[13], 10);
}

export function formatDocument(value) {
  const c = onlyDigits(value);
  if (c.length === 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (c.length === 14) return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value || '';
}

// Situação da locação para a agenda do lojista
export function rentalStage(order, today = todayISO()) {
  const st = order?.rental_status || 'reservado';
  if (st === 'cancelado' || order?.status === 'cancelado') return 'cancelado';
  if (st === 'devolvido') return 'devolvido';
  if (st === 'entregue') return order?.rental_end && toUTC(order.rental_end) < toUTC(today) ? 'atrasado' : 'em_uso';
  return st; // reservado | confirmado
}

export const RENTAL_STATUS_LABELS = {
  reservado: '🟡 Reservado',
  confirmado: '🔵 Confirmado',
  entregue: '📦 Entregue / Em uso',
  em_uso: '📦 Em uso',
  atrasado: '🔴 Devolução atrasada',
  devolvido: '✅ Devolvido',
  cancelado: '⚫ Cancelado'
};
