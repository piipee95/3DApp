'use strict';
// ---------------------------------------------------------------------------
// V3.4: reminders. A "Pendientes" panel on Inicio built from data already loaded
// (orders, payments, quotes, printers, stock) and a once-a-day summary toast.
// They live inside the app: phone push or email would need an external service.
// ---------------------------------------------------------------------------
const DAILY_KEY = 'kultiapp_daily_notice';
function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d + days).toLocaleDateString('sv-SE');
}
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
