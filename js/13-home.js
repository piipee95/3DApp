'use strict';
// Inicio: saludo, accesos rápidos, cifras del mes y pendientes (recordatorios).
// Sales and estimated profit for orders created in a given month (canceled excluded).
function monthTotals(year, month) {
  const list = S.orders.filter(o => {
    if (o.status === 'canceled' || o.kind === 'stock' || !o.created_at) return false;
    const d = new Date(o.created_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  let sales = 0,
    profit = 0,
    net = 0;
  for (const o of list) {
    const t = orderNumbers(o);
    sales += t.sales;
    net += t.net;
    profit += t.actualProfit ?? t.estimatedProfit;
  }
  return { count: list.length, sales, profit, margin: net > 0 ? profit / net : null };
}
function homeView() {
  const now = new Date(),
    cur = monthTotals(now.getFullYear(), now.getMonth()),
    prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1),
    prev = monthTotals(prevDate.getFullYear(), prevDate.getMonth()),
    open = S.orders.filter(orderIsOpen),
    late = open.filter(orderIsLate),
    low = inventoryLow(),
    uncounted = inventoryItems().filter(r => r.active && !r.counted),
    upcoming = [...open]
      .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
      .slice(0, 6),
    stockList = inventoryItems()
      .filter(r => r.active && r.counted && n(r.min_stock) > 0)
      .sort((a, b) => stockLevel(a).ratio - stockLevel(b).ratio)
      .slice(0, 5),
    delta = prev.sales > 0 ? (cur.sales - prev.sales) / prev.sales : null,
    weekday = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }),
    dueOrders = receivables(),
    dueTotal = dueOrders.reduce((s, o) => s + orderBalance(o).due, 0);
  const kpi = (label, ic, value, foot, extra = '') =>
    '<div class="kpi' +
    extra +
    '"><div class="kpi-h"><span>' +
    label +
    '</span>' +
    icon(ic) +
    '</div><div class="kpi-v num">' +
    value +
    '</div><div class="kpi-f">' +
    foot +
    '</div></div>';
  const deltaFoot =
    delta == null
      ? '<span class="muted">' + cur.count + (cur.count === 1 ? ' pedido' : ' pedidos') + ' este mes</span>'
      : '<span class="' +
        (delta >= 0 ? 'up' : 'down') +
        '">' +
        icon(delta >= 0 ? 'trending-up' : 'trending-down') +
        Math.abs(Math.round(delta * 100)) +
        '% vs ' +
        MONTHS[prevDate.getMonth()] +
        '</span>';
  const deliveries = upcoming.length
    ? '<table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Estado</th><th class="r">Total</th></tr></thead><tbody>' +
      upcoming
        .map(
          o =>
            '<tr data-home-order="' +
            o.id +
            '"><td><b>' +
            esc(o.title) +
            '</b><div class="sub">PED-' +
            o.order_no +
            ' · ' +
            o.quantity +
            ' un.</div></td><td>' +
            esc(o.kind === 'stock' ? 'Para stock' : o.customer_name || '—') +
            '</td><td class="num">' +
            shortDate(o.due_date) +
            '</td><td>' +
            orderChip(o) +
            '</td><td class="r num">' +
            (o.kind === 'stock' ? '—' : clp(orderNumbers(o).sales)) +
            '</td></tr>'
        )
        .join('') +
      '</tbody></table><div class="list-rows">' +
      upcoming
        .map(
          o =>
            '<button type="button" class="list-row" data-home-order="' +
            o.id +
            '"><span class="lr-main"><b>' +
            esc(o.title) +
            '</b><span>' +
            esc(orderCustomer(o)) +
            ' · ' +
            shortDate(o.due_date) +
            '</span></span><span class="lr-end"><b class="num">' +
            (o.kind === 'stock' ? o.quantity + ' un.' : clp(orderNumbers(o).sales)) +
            '</b>' +
            orderChip(o) +
            '</span></button>'
        )
        .join('') +
      '</div>'
    : '<div class="panel-empty">' +
      icon('clipboard-list') +
      '<b>No hay pedidos en curso</b><span>Crea uno desde el resumen de un producto.</span></div>';
  const stock = stockList.length
    ? stockList
        .map(r => {
          const s = stockLevel(r),
            tone = s.avail <= s.min * 0.5 ? 'down' : s.avail <= s.min ? 'warn' : 'up';
          return (
            '<button type="button" class="stock-row" data-home-stock="' +
            r.id +
            '"><span class="stock-top"><span>' +
            esc(r.name) +
            '</span><span class="num ' +
            tone +
            '">' +
            stockNumber(s.avail) +
            ' / ' +
            stockNumber(s.min) +
            ' ' +
            esc(r.unit) +
            '</span></span><span class="bar"><b class="' +
            tone +
            '" style="width:' +
            Math.max(4, Math.round(s.ratio * 100)) +
            '%"></b></span></button>'
          );
        })
        .join('')
    : '<div class="panel-empty">' +
      icon('boxes') +
      '<b>Sin alertas de stock</b><span>' +
      (uncounted.length
        ? uncounted.length +
          (uncounted.length === 1 ? ' material pendiente' : ' materiales pendientes') +
          ' de conteo inicial.'
        : 'Define un stock mínimo en tus materiales para ver alertas aquí.') +
      '</span></div>';
  root.innerHTML =
    header(
      'Inicio',
      canEdit()
        ? '<button class="btn btn-primary" id="homeNew" type="button">' +
            icon('plus') +
            '<span>Nuevo</span></button>'
        : ''
    ) +
    '<main class="shell home">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    homeHero(weekday, open, late, dueTotal) +
    remindersPanel() +
    '<div class="kpis">' +
    kpi(
      'Ventas de ' + MONTHS[now.getMonth()],
      'wallet',
      '<span class="full">' +
        clp(cur.sales) +
        '</span><span class="short">' +
        clpShort(cur.sales) +
        '</span>',
      deltaFoot
    ) +
    kpi(
      'Utilidad estimada',
      'trending-up',
      '<span class="full">' +
        clp(cur.profit) +
        '</span><span class="short">' +
        clpShort(cur.profit) +
        '</span>',
      '<span class="muted">' +
        (cur.margin == null ? 'Sin ventas este mes' : 'Margen ' + pct(cur.margin)) +
        '</span>'
    ) +
    kpi(
      'Pedidos en curso',
      'clipboard-list',
      String(open.length),
      late.length
        ? '<span class="down">' +
            icon('triangle-alert') +
            late.length +
            (late.length === 1 ? ' atrasado' : ' atrasados') +
            '</span>'
        : '<span class="muted">Todos al día</span>'
    ) +
    kpi(
      'Inventario',
      'boxes',
      String(low.length),
      low.length
        ? '<span class="warn">' +
            icon('triangle-alert') +
            (low.length === 1 ? 'material bajo mínimo' : 'materiales bajo mínimo') +
            '</span>'
        : '<span class="muted">Stock en orden</span>'
    ) +
    kpi(
      'Productos en stock',
      'package',
      '<span class="full">' +
        clp(stockValuation().goodsCost) +
        '</span><span class="short">' +
        clpShort(stockValuation().goodsCost) +
        '</span>',
      '<button type="button" class="link-btn" id="homeValue">' +
        stockValuation().units +
        ' un. · se venden en ' +
        clpShort(stockValuation().goodsSale) +
        '</button>'
    ) +
    kpi(
      'Materia prima',
      'boxes',
      '<span class="full">' +
        clp(stockValuation().materials) +
        '</span><span class="short">' +
        clpShort(stockValuation().materials) +
        '</span>',
      '<button type="button" class="link-btn" id="homeMaterials">Filamento e insumos</button>'
    ) +
    kpi(
      'Por cobrar',
      'wallet',
      '<span class="full">' + clp(dueTotal) + '</span><span class="short">' + clpShort(dueTotal) + '</span>',
      dueOrders.length
        ? '<button type="button" class="link-btn" id="homeDue">' +
            dueOrders.length +
            (dueOrders.length === 1 ? ' pedido con saldo' : ' pedidos con saldo') +
            '</button>'
        : '<span class="muted">Todo cobrado</span>'
    ) +
    '</div><div class="home-cols"><section class="panel"><div class="panel-h"><h2>Próximas entregas</h2><button type="button" class="link-btn" data-go="production">Ver pedidos</button></div>' +
    deliveries +
    '</section><section class="panel"><div class="panel-h"><h2>Stock bajo</h2><button type="button" class="link-btn" data-go="inventory">Inventario</button></div>' +
    stock +
    '</section></div></main>';
  common();
  q('#homeNew')?.addEventListener('click', showCreateMenu);
  qa('[data-quick-action]').forEach(
    b =>
      (b.onclick = () =>
        ({
          sell: showSellPicker,
          order: () => showQuickJob('order'),
          stock: showStockProductPicker,
          quote: () => showQuickJob('quote')
        })[b.dataset.quickAction]())
  );
  q('#homeValue')?.addEventListener('click', () => {
    S.showArchived = false;
    S.showStock = true;
    goMode('dashboard');
  });
  q('#homeMaterials')?.addEventListener('click', () => goMode('inventory'));
  q('#homeDue')?.addEventListener('click', () => {
    S.orderFilter = 'unpaid';
    goMode('production');
  });
  qa('[data-go]').forEach(b => (b.onclick = () => goMode(b.dataset.go)));
  qa('[data-home-order]').forEach(
    el => (el.onclick = () => showOrder(S.orders.find(o => o.id === el.dataset.homeOrder)))
  );
  qa('[data-home-stock]').forEach(el => (el.onclick = () => goMode('inventory')));
  bindReminders();
}
function homeHero(weekday, open, late, dueTotal) {
  const h = new Date().getHours(),
    hello = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches',
    name = userFirstName(),
    today = open.filter(o => o.due_date === localToday()).length,
    parts = [
      open.length
        ? open.length + (open.length === 1 ? ' pedido en curso' : ' pedidos en curso')
        : 'ningún pedido en curso',
      today ? today + (today === 1 ? ' para entregar hoy' : ' para entregar hoy') : '',
      late.length ? late.length + (late.length === 1 ? ' atrasado' : ' atrasados') : '',
      dueTotal > 0 ? clp(dueTotal) + ' por cobrar' : ''
    ].filter(Boolean),
    sentence =
      'Tienes ' + parts.slice(0, -1).join(', ') + (parts.length > 1 ? ' y ' : '') + parts.at(-1) + '.',
    actions = [
      ['sell', 'wallet', 'Vender', 'Desde el stock'],
      ['order', 'clipboard-list', 'Nuevo pedido', 'Para un cliente'],
      ['stock', 'boxes', 'Fabricar', 'Para stock'],
      ['quote', 'file-text', 'Cotizar', 'Enviar precio']
    ];
  return (
    '<section class="home-hero"><p class="home-date">' +
    weekday.charAt(0).toUpperCase() +
    weekday.slice(1) +
    '</p><h2 class="home-hello">' +
    hello +
    (name ? ', ' + esc(name) : '') +
    ' ' +
    icon('sparkles') +
    '</h2><p class="home-sentence">' +
    sentence +
    '</p>' +
    (canEdit()
      ? '<div class="quick-actions">' +
        actions
          .map(
            ([k, ic, t, d]) =>
              '<button type="button" class="quick-action qa-' +
              k +
              '" data-quick-action="' +
              k +
              '"><span class="qa-ic">' +
              icon(ic) +
              '</span><b>' +
              t +
              '</b><span>' +
              d +
              '</span></button>'
          )
          .join('') +
        '</div>'
      : '') +
    '</section>'
  );
}
// ---------------------------------------------------------------------------
// V3.4: reminders. A "Pendientes" panel on Inicio built from data already loaded
// (orders, payments, quotes, printers, stock) and a once-a-day summary toast.
// They live inside the app: phone push or email would need an external service.
// ---------------------------------------------------------------------------
const DAILY_KEY = 'kultiapp_daily_notice';
function quoteExpiresOn(qt) {
  return new Date(new Date(qt.created_at).getTime() + n(qt.validity_days) * 864e5);
}
// Most urgent first: late, due today, due tomorrow, ready to deliver, quotes about to expire, upkeep.
function reminders() {
  const today = localToday(),
    tomorrow = addDays(today, 1),
    list = [],
    open = (S.orders || []).filter(orderIsOpen),
    ref = o => 'PED-' + o.order_no + ' · ' + o.title;
  for (const o of open.filter(orderIsLate))
    list.push({
      tone: 'down',
      icon: 'triangle-alert',
      text: ref(o),
      sub: 'Atrasado: era para el ' + shortDate(o.due_date),
      order: o.id
    });
  for (const o of open.filter(o => o.due_date === today || o.due_date === tomorrow))
    list.push({
      tone: o.due_date === today ? 'warn' : '',
      icon: 'calendar',
      text: ref(o),
      sub: (o.due_date === today ? 'Se entrega hoy' : 'Se entrega mañana') + ' · ' + ORDER_STATUSES[o.status],
      order: o.id
    });
  for (const o of open.filter(o => o.status === 'ready' && o.kind !== 'stock')) {
    const due = orderBalance(o).due;
    list.push({
      tone: due > 0 ? 'warn' : 'up',
      icon: 'circle-check',
      text: ref(o),
      sub: 'Listo: coordina la entrega' + (due > 0 ? ' y cobra el saldo de ' + clp(due) : ''),
      order: o.id
    });
  }
  // Delivered but still owing money.
  for (const o of (S.orders || []).filter(o => o.status === 'delivered' && orderBalance(o).due > 0))
    list.push({
      tone: 'warn',
      icon: 'wallet',
      text: ref(o),
      sub: 'Entregado con saldo pendiente de ' + clp(orderBalance(o).due),
      order: o.id
    });
  const soon = Date.now() + 2 * 864e5;
  for (const qt of (S.quotes || []).filter(
    qt => quoteState(qt) === 'open' && quoteExpiresOn(qt).getTime() <= soon
  ))
    list.push({
      tone: 'warn',
      icon: 'file-text',
      text: 'COT · ' + qt.title + (qt.client_name ? ' · ' + qt.client_name : ''),
      sub:
        'La cotización vence el ' +
        shortDate(quoteExpiresOn(qt).toLocaleDateString('sv-SE')) +
        ': haz seguimiento',
      quote: qt.id
    });
  for (const r of printersDue())
    list.push({
      tone: 'warn',
      icon: 'wrench',
      text: r.name,
      sub: 'Toca mantención (' + Math.round(printerUsage(r).since) + ' h desde la última)',
      go: 'resources'
    });
  const low = inventoryLow();
  if (low.length)
    list.push({
      tone: 'warn',
      icon: 'boxes',
      text: low.length === 1 ? low[0].name + ' bajo el mínimo' : low.length + ' materiales bajo el mínimo',
      sub: 'Revisa el inventario y compra antes de quedarte sin stock',
      go: 'inventory'
    });
  const uncounted = canEdit() ? countDue() : [];
  if (uncounted.length)
    list.push({
      tone: 'warn',
      icon: 'clipboard-check',
      text: 'Conteo de inventario',
      sub:
        (uncounted.length === 1 ? '1 material lleva' : uncounted.length + ' materiales llevan') +
        ' más de ' +
        COUNT_EVERY_DAYS +
        ' días sin conteo físico: usa el Modo conteo',
      go: 'stockcount'
    });
  return list;
}
// Unique orders/quotes/etc. so an order that is both late and ready counts once.
function reminderCounts(list) {
  const today = localToday(),
    open = (S.orders || []).filter(orderIsOpen);
  return {
    late: open.filter(orderIsLate).length,
    today: open.filter(o => o.due_date === today).length,
    ready: open.filter(o => o.status === 'ready' && o.kind !== 'stock').length,
    quotes: list.filter(x => x.quote).length,
    upkeep: list.filter(x => x.go).length
  };
}
function remindersPanel() {
  const list = reminders(),
    shown = list.slice(0, 6);
  if (!list.length)
    return (
      '<section class="panel reminders done"><span>' +
      icon('circle-check') +
      '</span><b>Todo al día</b><span class="muted">Sin entregas para hoy ni pendientes urgentes.</span></section>'
    );
  return (
    '<section class="panel reminders"><div class="panel-h"><h2>Pendientes</h2><span class="small muted">' +
    list.length +
    (list.length === 1 ? ' aviso' : ' avisos') +
    '</span></div>' +
    shown
      .map(
        (r, i) =>
          '<button type="button" class="list-row reminder" data-reminder="' +
          i +
          '"><span class="rem-ic ' +
          r.tone +
          '">' +
          icon(r.icon) +
          '</span><span class="lr-main"><b>' +
          esc(r.text) +
          '</b><span>' +
          esc(r.sub) +
          '</span></span>' +
          icon('chevron-right') +
          '</button>'
      )
      .join('') +
    (list.length > shown.length
      ? '<button type="button" class="link-btn rem-more" id="remindersMore">Ver los ' +
        list.length +
        ' avisos</button>'
      : '') +
    '</section>'
  );
}
function openReminder(r) {
  if (r.order) return showOrder(S.orders.find(o => o.id === r.order));
  if (r.quote) return showSavedQuote(S.quotes.find(x => x.id === r.quote));
  if (r.go) goMode(r.go);
}
function bindReminders() {
  const list = reminders();
  qa('[data-reminder]').forEach(b => (b.onclick = () => openReminder(list[+b.dataset.reminder])));
  q('#remindersMore')?.addEventListener('click', () => {
    const dialog = showDialog(
      'remindersDialog',
      '<div class="section-title"><h2>Pendientes</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><div class="reminders">' +
        list
          .map(
            (r, i) =>
              '<button type="button" class="list-row reminder" data-all-reminder="' +
              i +
              '"><span class="rem-ic ' +
              r.tone +
              '">' +
              icon(r.icon) +
              '</span><span class="lr-main"><b>' +
              esc(r.text) +
              '</b><span>' +
              esc(r.sub) +
              '</span></span>' +
              icon('chevron-right') +
              '</button>'
          )
          .join('') +
        '</div>'
    );
    dialog.querySelectorAll('[data-all-reminder]').forEach(
      b =>
        (b.onclick = () => {
          dialog.close();
          openReminder(list[+b.dataset.allReminder]);
        })
    );
  });
  dailyNotice(list);
}
// First time the app opens each day: a short summary of what needs attention.
function dailyNotice(list) {
  const today = localToday();
  try {
    if (localStorage.getItem(DAILY_KEY) === today) return;
    localStorage.setItem(DAILY_KEY, today);
  } catch {
    return;
  }
  if (!list.length) return;
  const c = reminderCounts(list),
    parts = [
      c.late && c.late + (c.late === 1 ? ' atrasado' : ' atrasados'),
      c.today && c.today + (c.today === 1 ? ' entrega hoy' : ' entregas hoy'),
      c.ready && c.ready + (c.ready === 1 ? ' listo para entregar' : ' listos para entregar'),
      c.quotes && c.quotes + (c.quotes === 1 ? ' cotización por vencer' : ' cotizaciones por vencer'),
      c.upkeep &&
        c.upkeep + (c.upkeep === 1 ? ' aviso de mantención o stock' : ' avisos de mantención o stock')
    ].filter(Boolean);
  toast('Hoy: ' + (parts.length ? parts.join(' · ') : list.length + ' pendientes') + '.');
}
