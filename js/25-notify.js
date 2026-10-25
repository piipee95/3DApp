'use strict';
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
