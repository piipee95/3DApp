'use strict';
// Cobros y avisos: pagos y abonos, saldo, mensajes de WhatsApp al cliente y enlace de seguimiento.
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
async function addPayment(
  order,
  amount,
  method = 'transfer',
  paidOn = null,
  note = '',
  receivedBy = currentPartner()
) {
  const { error } = await supabase.from('order_payments').insert({
    workspace_id: S.workspace.id,
    order_id: order.id,
    amount: Math.round(n(amount)),
    method,
    note: note.slice(0, 300),
    ...(paidOn ? { paid_on: paidOn } : {}),
    ...(receivedBy ? { received_by: receivedBy } : {})
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
              (p.received_by ? ' · ' + esc(p.received_by) : '') +
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
        partnerField('payReceiver', 'Lo recibió') +
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
        (['ready', 'shipped', 'delivered'].includes(order.status) || order.status === 'assembly'
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
          q('#payNote').value.trim(),
          rememberPartner(q('#payReceiver')?.value)
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
// ---------------------------------------------------------------------------
// V3.2: public pages. A private tracking link per order (seguimiento.html) and
// a public catalog of chosen products with a WhatsApp «Lo quiero» button.
// ---------------------------------------------------------------------------
const trackingUrl = token => location.origin + '/seguimiento.html#' + token;
async function orderTrackingLink(order, action) {
  const { data, error } = await supabase.rpc('order_tracking_link', { p_order: order.id, p_action: action });
  if (error) throw error;
  order.tracking_token = data || null;
  const cached = (S.orders || []).find(o => o.id === order.id);
  if (cached) cached.tracking_token = order.tracking_token;
  return data;
}
function showTracking(order) {
  if (!canEdit()) return;
  const token = order.tracking_token,
    url = token ? trackingUrl(token) : '',
    customer = (S.customers || []).find(c => c.id === order.customer_id),
    hi = firstName(order.customer_name),
    text =
      'Hola' +
      (hi ? ' ' + hi : '') +
      ', aquí puedes ver el avance de tu pedido PED-' +
      order.order_no +
      ' (' +
      order.title +
      '): ' +
      url;
  const dialog = showDialog(
    'trackingDialog',
    '<div class="section-title"><h2>Seguimiento del pedido</h2><button class="btn btn-ghost" data-close>Volver</button></div>' +
      (token
        ? '<p class="small muted">El cliente ve el estado, la fecha estimada, el saldo y las fotos del trabajo. No ve costos ni notas internas.</p><div class="field"><label for="trackingLink">Enlace del cliente</label><input id="trackingLink" readonly value="' +
          esc(url) +
          '"></div><div class="row wrap-row"><button class="btn btn-primary" id="copyTracking">' +
          icon('copy') +
          'Copiar</button><a class="btn btn-secondary" target="_blank" rel="noopener" href="' +
          esc((whatsappLink(customer?.phone) || 'https://wa.me/') + '?text=' + encodeURIComponent(text)) +
          '">' +
          icon('message-circle') +
          'Enviar por WhatsApp</a><a class="btn btn-ghost" target="_blank" rel="noopener" href="' +
          esc(url) +
          '">Ver página</a></div><button class="btn btn-ghost danger-text" id="revokeTracking">Desactivar enlace</button>'
        : '<p class="muted">Crea un enlace privado para que el cliente vea el avance de su pedido sin escribirte.</p><button class="btn btn-primary" id="createTracking">' +
          icon('link') +
          'Crear enlace de seguimiento</button>') +
      '<div id="trackingFeedback" class="small" role="status"></div>'
  );
  const act = action => async () => {
    try {
      await orderTrackingLink(order, action);
      dialog.close();
      if (action === 'revoke') toast('Enlace desactivado: la página ya no abre.');
      showTracking(order);
    } catch (error) {
      q('#trackingFeedback').textContent = error.message;
    }
  };
  q('#createTracking')?.addEventListener('click', act('create'));
  q('#copyTracking')?.addEventListener('click', () => copyLink(url));
  q('#revokeTracking')?.addEventListener('click', async () => {
    if (
      !(await confirmDialog({
        title: 'Desactivar enlace',
        body: 'El enlace dejará de funcionar. Si creas otro, será distinto.',
        confirmLabel: 'Desactivar',
        danger: true
      }))
    )
      return showTracking(order);
    act('revoke')();
  });
  return dialog;
}
// ---------------------------------------------------------------------------
// V4.0: keep the customer informed. The order shows the customer's WhatsApp and a ready
// message for its current state (with the tracking link); changing the state offers to send it.
// Messages open WhatsApp already written: sending without a tap needs the paid WhatsApp Business API.
// ---------------------------------------------------------------------------
function statusMessage(o) {
  const hi = firstName(o.customer_name),
    who = 'Hola' + (hi ? ' ' + hi : ''),
    ref = 'PED-' + o.order_no + ' (' + o.title + ')',
    due = o.due_date ? ' Entrega estimada: ' + shortDate(o.due_date) + '.' : '',
    track = o.tracking_token ? '\nPuedes ver el avance aquí: ' + trackingUrl(o.tracking_token) : '',
    texts = {
      pending: who + ', recibimos tu pedido ' + ref + '. Te avisaremos cuando empecemos a imprimirlo.' + due,
      printing: who + ', tu pedido ' + ref + ' ya está en impresión.' + due,
      assembly: who + ', estamos dando los últimos detalles a tu pedido ' + ref + '.' + due,
      ready: orderMessage(o, 'ready'),
      shipped:
        who +
        ', tu pedido ' +
        ref +
        ' ya va en camino.' +
        (orderBalance(o).due > 0 ? ' Saldo pendiente: ' + clp(orderBalance(o).due) + '.' : ''),
      delivered: who + ', ¡gracias por tu compra! Esperamos que disfrutes tu pedido ' + ref + '.'
    };
  return texts[o.status] ? texts[o.status] + (o.status === 'delivered' ? '' : track) : '';
}
const waUrl = (phone, text) =>
  (whatsappLink(phone) || 'https://wa.me/') + '?text=' + encodeURIComponent(text);
function customerOf(o) {
  return customerFor(o.customer_id, o.customer_name);
}
async function saveCustomerPhone(o, phone) {
  const c = customerOf(o),
    id = c?.id || (await ensureCustomer(o.customer_name || 'Cliente PED-' + o.order_no, phone));
  if (c) {
    const { error } = await supabase.from('customers').update({ phone }).eq('id', c.id);
    if (error) throw error;
    c.phone = phone;
  }
  if (id && !o.customer_id) {
    const { error } = await supabase.from('production_orders').update({ customer_id: id }).eq('id', o.id);
    if (!error) o.customer_id = id;
  }
}
// "Cliente" card in the order dialog: WhatsApp number and the update for the current state.
function mountCustomerNotify(order, dialog) {
  if (order.kind === 'stock') return;
  let box = dialog.querySelector('#orderNotify');
  if (!box) {
    box = document.createElement('section');
    box.id = 'orderNotify';
    box.className = 'pay-card notify-card';
    (dialog.querySelector('.facts') || dialog.querySelector('.order-head')).after(box);
  }
  const phone = customerOf(order)?.phone || '',
    text = statusMessage(order),
    edit = canEdit();
  box.innerHTML =
    '<div class="pay-head"><h3>Avisar al cliente</h3>' +
    (phone ? '<span class="small muted">' + esc(phone) + '</span>' : '') +
    '</div>' +
    (phone
      ? text
        ? '<p class="notify-preview">' +
          esc(text) +
          '</p><div class="wrap-row"><a class="btn btn-primary btn-sm" target="_blank" rel="noopener" id="notifySend" href="' +
          esc(waUrl(phone, text)) +
          '">' +
          icon('message-circle') +
          'Enviar por WhatsApp</a>' +
          (edit && !order.tracking_token
            ? '<button type="button" class="btn btn-ghost btn-sm" id="notifyTrack">' +
              icon('link') +
              'Agregar enlace de seguimiento</button>'
            : '') +
          (edit
            ? '<button type="button" class="btn btn-ghost btn-sm" id="notifyEditPhone">' +
              icon('pencil') +
              'Cambiar número</button>'
            : '') +
          '</div>'
        : '<p class="small muted">Pedido cancelado: no hay mensaje que enviar.</p>'
      : edit
        ? '<form id="notifyPhoneForm" class="notify-phone"><input id="notifyPhone" type="tel" inputmode="tel" maxlength="30" required placeholder="WhatsApp del cliente, ej. +56 9 1234 5678" aria-label="WhatsApp del cliente"><button class="btn btn-secondary btn-sm" type="submit">Guardar</button></form><p class="small muted">Con su número podrás avisarle cada avance del pedido con un toque.</p>'
        : '<p class="small muted">Sin WhatsApp registrado.</p>') +
    '<div id="notifyFeedback" class="small" role="status"></div>';
  const askPhone = () => {
    box.querySelector('.wrap-row')?.remove();
    box.querySelector('.notify-preview')?.remove();
    const form = document.createElement('form');
    form.id = 'notifyPhoneForm';
    form.className = 'notify-phone';
    form.innerHTML =
      '<input id="notifyPhone" type="tel" inputmode="tel" maxlength="30" required aria-label="WhatsApp del cliente" value="' +
      esc(phone) +
      '"><button class="btn btn-secondary btn-sm" type="submit">Guardar</button>';
    box.querySelector('#notifyFeedback').before(form);
    bindPhoneForm();
  };
  const bindPhoneForm = () =>
    box.querySelector('#notifyPhoneForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const value = box.querySelector('#notifyPhone').value.trim();
      if (!whatsappLink(value))
        return (box.querySelector('#notifyFeedback').textContent =
          'Revisa el número: incluye código de país.');
      try {
        await saveCustomerPhone(order, value);
        toast('WhatsApp del cliente guardado.');
        mountCustomerNotify(order, dialog);
      } catch (error) {
        box.querySelector('#notifyFeedback').textContent = error.message;
      }
    });
  bindPhoneForm();
  box.querySelector('#notifyEditPhone')?.addEventListener('click', askPhone);
  box.querySelector('#notifyTrack')?.addEventListener('click', async () => {
    try {
      await orderTrackingLink(order, 'create');
      mountCustomerNotify(order, dialog);
    } catch (error) {
      box.querySelector('#notifyFeedback').textContent = error.message;
    }
  });
}
// After a state change: offer the matching message, one tap away (a real link, so no popup blocking).
function offerStatusMessage(order) {
  if (order.kind === 'stock' || !canEdit()) return;
  const phone = customerOf(order)?.phone,
    text = statusMessage(order);
  if (!phone || !text) return;
  const dialog = showDialog(
    'notifyDialog',
    '<div class="section-title"><h2>¿Avisar a ' +
      esc(firstName(order.customer_name) || 'tu cliente') +
      '?</h2><button class="btn btn-ghost" data-close>Ahora no</button></div><p class="small muted">PED-' +
      order.order_no +
      ' pasó a «' +
      ORDER_STATUSES[order.status] +
      '». Este mensaje se abrirá en WhatsApp listo para enviar:</p><p class="notify-preview">' +
      esc(text) +
      '</p><div class="dialog-actions"><button type="button" class="btn btn-ghost" data-close>Ahora no</button><a class="btn btn-primary" target="_blank" rel="noopener" id="notifyNow" href="' +
      esc(waUrl(phone, text)) +
      '">' +
      icon('message-circle') +
      'Enviar por WhatsApp</a></div>'
  );
  dialog.querySelectorAll('.dialog-actions [data-close]').forEach(b => (b.onclick = () => dialog.close()));
  q('#notifyNow').addEventListener('click', () => setTimeout(() => dialog.close(), 300));
  return dialog;
}
