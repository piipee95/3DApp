'use strict';
// ---------------------------------------------------------------------------
// V2.0: deposits and balances per order, and WhatsApp messages.
// ---------------------------------------------------------------------------
const PAY_METHODS = { transfer: 'Transferencia', cash: 'Efectivo', card: 'Tarjeta', other: 'Otro' };
async function loadPayments() {
  // Two years covers deposits of any order still open from the last 12 months.
  let query = supabase
    .from('order_payments')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('paid_on', { ascending: true });
  if (typeof query.gte === 'function') query = query.gte('paid_on', historyCutoff(24).slice(0, 10));
  const { data, error } = await query;
  if (error) throw error;
  S.payments = data || [];
}
function orderPayments(o) {
  return [...(S.payments || []), ...(S.older?.payments || [])].filter(p => p.order_id === o.id);
}
// Stock fabrication and canceled orders owe nothing.
function orderBalance(o) {
  const total = o.kind === 'stock' ? 0 : Math.round(orderNumbers(o).sales),
    paid = orderPayments(o).reduce((s, p) => s + n(p.amount), 0),
    due = o.kind === 'stock' || o.status === 'canceled' ? 0 : Math.max(0, total - paid);
  return {
    total,
    paid,
    due,
    state: total <= 0 ? 'none' : paid <= 0 ? 'unpaid' : due > 0 ? 'partial' : 'paid'
  };
}
const PAY_CHIP = {
  unpaid: ['c-late', 'Sin pago'],
  partial: ['c-printing', 'Abonado'],
  paid: ['c-ready', 'Pagado']
};
function payChip(o) {
  const b = orderBalance(o);
  if (b.state === 'none' || o.status === 'canceled') return '';
  return '<span class="chip ' + PAY_CHIP[b.state][0] + '"><i></i>' + PAY_CHIP[b.state][1] + '</span>';
}
function receivables() {
  return S.orders.filter(o => orderBalance(o).due > 0);
}
// Customer's phone for an order or quote: linked customer first, then by name.
function customerFor(id, name) {
  return S.customers.find(c => c.id === id) || S.customers.find(c => sameName(c.name, name)) || null;
}
const firstName = name =>
  String(name || '')
    .trim()
    .split(/\s+/)[0] || '';
// win: a tab opened beforehand during the click, so Safari doesn't block it after an await.
function openWhatsApp(phone, text, win = null) {
  const link = whatsappLink(phone),
    url = (link || 'https://wa.me/') + '?text=' + encodeURIComponent(text);
  if (win) win.location.href = url;
  else window.open(url, '_blank', 'noopener');
}
function quoteMessage(d) {
  const t = quoteTotals(d),
    hi = firstName(d.client);
  return (
    'Hola' +
    (hi ? ' ' + hi : '') +
    ', te envío la cotización ' +
    d.folio +
    ' de Kultiverso Pop:\n' +
    '• ' +
    d.name +
    ' × ' +
    d.quantity +
    '\nTotal: ' +
    clp(t.total) +
    (d.ivaEnabled ? ' (IVA incluido)' : '') +
    '\nVálida hasta el ' +
    t.validUntil.toLocaleDateString('es-CL') +
    '.' +
    (d.delivery ? '\n' + d.delivery + '.' : '') +
    '\n¿Te la confirmo?'
  ).replace(/\.\./g, '.');
}
function orderMessage(o, kind) {
  const b = orderBalance(o),
    hi = firstName(o.customer_name),
    who = 'Hola' + (hi ? ' ' + hi : ''),
    ref = 'PED-' + o.order_no + ' (' + o.title + ')';
  if (kind === 'ready')
    return (
      who +
      ', tu pedido ' +
      ref +
      ' ya está listo.' +
      (b.due > 0 ? ' Saldo pendiente: ' + clp(b.due) + '.' : '') +
      ' ¿Coordinamos la entrega?'
    );
  if (kind === 'paid') {
    const last = orderPayments(o).at(-1);
    return (
      who +
      ', recibimos tu pago' +
      (last ? ' de ' + clp(last.amount) : '') +
      ' del pedido ' +
      ref +
      '. ' +
      (b.due > 0 ? 'Saldo pendiente: ' + clp(b.due) + '.' : 'Tu pedido quedó pagado.') +
      ' ¡Gracias!'
    );
  }
  return (
    who +
    ', te recuerdo el saldo de tu pedido ' +
    ref +
    ': ' +
    clp(b.due) +
    ' (total ' +
    clp(b.total) +
    ', abonado ' +
    clp(b.paid) +
    '). ¡Gracias!'
  );
}
async function addPayment(order, amount, method = 'transfer', paidOn = null, note = '') {
  const { error } = await supabase.from('order_payments').insert({
    workspace_id: S.workspace.id,
    order_id: order.id,
    amount: Math.round(n(amount)),
    method,
    note: note.slice(0, 300),
    ...(paidOn ? { paid_on: paidOn } : {})
  });
  if (error) throw error;
  await loadPayments();
}
function paymentsMarkup(order) {
  const b = orderBalance(order),
    list = orderPayments(order),
    ratio = b.total > 0 ? Math.min(1, b.paid / b.total) : 0;
  return (
    '<div class="pay-head"><h3>Pagos</h3>' +
    payChip(order) +
    '</div><div class="pay-sum"><div><span>Total</span><b>' +
    clp(b.total) +
    '</b></div><div><span>Pagado</span><b class="up">' +
    clp(b.paid) +
    '</b></div><div><span>Saldo</span><b class="' +
    (b.due > 0 ? 'warn' : '') +
    '">' +
    clp(b.due) +
    '</b></div></div><div class="pay-bar"><i style="width:' +
    Math.round(ratio * 100) +
    '%"></i></div>' +
    (list.length
      ? '<div class="pay-list">' +
        list
          .map(
            p =>
              '<div class="pay-row"><span><b>' +
              new Date(p.paid_on + 'T12:00').toLocaleDateString('es-CL') +
              '</b> · ' +
              PAY_METHODS[p.method] +
              (p.note ? ' · ' + esc(p.note) : '') +
              '</span><b class="num">' +
              clp(p.amount) +
              '</b>' +
              (canEdit()
                ? '<button type="button" class="btn icon-btn" data-del-payment="' +
                  p.id +
                  '" aria-label="Eliminar pago" title="Eliminar pago">' +
                  icon('trash-2') +
                  '</button>'
                : '') +
              '</div>'
          )
          .join('') +
        '</div>'
      : '<p class="small muted">Sin pagos registrados.</p>') +
    (canEdit() && b.due > 0 && order.status !== 'canceled'
      ? '<details class="pay-add"' +
        (list.length ? '' : ' open') +
        '><summary class="btn btn-secondary btn-sm">' +
        icon('plus') +
        'Registrar pago</summary><form id="payForm" class="pay-form"><div class="grid grid-2">' +
        fieldHtml('Monto recibido', 'payAmount', b.due, 'number', 'min="1" step="1" required') +
        '<div class="field"><label for="payMethod">Medio</label><select id="payMethod">' +
        Object.entries(PAY_METHODS)
          .map(([k, v]) => '<option value="' + k + '">' + v + '</option>')
          .join('') +
        '</select></div>' +
        fieldHtml('Fecha', 'payDate', new Date().toLocaleDateString('sv-SE'), 'date', 'required') +
        fieldHtml('Nota', 'payNote', '', 'text', 'maxlength="300" placeholder="Ej. abono 50%"') +
        '</div><div class="row pay-quick">' +
        (b.paid <= 0
          ? '<button type="button" class="btn btn-ghost btn-sm" data-pay-fill="half">50%</button>'
          : '') +
        '<button type="button" class="btn btn-ghost btn-sm" data-pay-fill="due">Saldo completo</button><button class="btn btn-secondary" type="submit">' +
        icon('wallet') +
        'Guardar pago</button></div><div id="payFeedback" class="small" role="status"></div></form></details>'
      : '') +
    (order.kind !== 'stock'
      ? '<div class="wa-actions"><span class="small muted">Avisar por WhatsApp:</span>' +
        (['ready', 'delivered'].includes(order.status) || order.status === 'assembly'
          ? '<button type="button" class="btn btn-ghost btn-sm" data-wa="ready">' +
            icon('message-circle') +
            'Pedido listo</button>'
          : '') +
        (b.due > 0
          ? '<button type="button" class="btn btn-ghost btn-sm" data-wa="due">' +
            icon('message-circle') +
            'Recordar saldo</button>'
          : '') +
        (b.paid > 0
          ? '<button type="button" class="btn btn-ghost btn-sm" data-wa="paid">' +
            icon('message-circle') +
            'Confirmar pago</button>'
          : '') +
        '</div>'
      : '')
  );
}
function mountOrderPayments(order, dialog) {
  if (order.kind === 'stock') return;
  let box = dialog.querySelector('#orderPayments');
  if (!box) {
    box = document.createElement('section');
    box.id = 'orderPayments';
    box.className = 'pay-card';
    (
      dialog.querySelector('.job-notice') ||
      dialog.querySelector('.facts') ||
      dialog.querySelector('.order-head')
    ).after(box);
  }
  box.innerHTML = paymentsMarkup(order);
  const b = orderBalance(order);
  box
    .querySelectorAll('[data-pay-fill]')
    .forEach(
      btn =>
        (btn.onclick = () =>
          (q('#payAmount').value = btn.dataset.payFill === 'half' ? Math.round(b.total / 2) : b.due))
    );
  box
    .querySelectorAll('[data-wa]')
    .forEach(
      btn =>
        (btn.onclick = () =>
          openWhatsApp(
            customerFor(order.customer_id, order.customer_name)?.phone,
            orderMessage(order, btn.dataset.wa)
          ))
    );
  box.querySelectorAll('[data-del-payment]').forEach(
    btn =>
      (btn.onclick = async () => {
        btn.disabled = true;
        const { error } = await supabase.from('order_payments').delete().eq('id', btn.dataset.delPayment);
        if (error) {
          btn.disabled = false;
          return toast(error.message, 'error');
        }
        S.payments = S.payments.filter(p => p.id !== btn.dataset.delPayment);
        mountOrderPayments(order, dialog);
      })
  );
  const form = box.querySelector('#payForm');
  if (form)
    form.onsubmit = async e => {
      e.preventDefault();
      const btn = e.submitter || form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await addPayment(
          order,
          q('#payAmount').value,
          q('#payMethod').value,
          q('#payDate').value,
          q('#payNote').value.trim()
        );
        toast('Pago registrado.');
        mountOrderPayments(order, dialog);
      } catch (error) {
        q('#payFeedback').textContent = error.message;
        btn.disabled = false;
      }
    };
  enhanceFields();
}
// Optional deposit field for new customer orders.
function depositField(total = 0) {
  return (
    '<div class="field"><label for="orderDeposit">Abono recibido (opcional)</label><div class="input-with-btn"><input id="orderDeposit" type="number" min="0" step="1" placeholder="0">' +
    (total > 0
      ? '<button type="button" class="btn btn-secondary btn-sm" data-deposit-half="' +
        Math.round(total / 2) +
        '">50%</button>'
      : '') +
    '</div></div>'
  );
}
// The 50% shortcut next to any deposit field.
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-deposit-half]');
  if (b) q('#orderDeposit').value = b.dataset.depositHalf;
});
async function saveDeposit(order) {
  const amount = Math.round(n(q('#orderDeposit')?.value));
  if (amount > 0) await addPayment(order, amount, 'transfer', null, 'Abono inicial');
}
