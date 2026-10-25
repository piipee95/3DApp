'use strict';
// ---------------------------------------------------------------------------
// V1.8: saved quotes, customers and remembered screen.
// ---------------------------------------------------------------------------
const quoteFolioNo = no => 'COT-' + String(no).padStart(4, '0');
const QUOTE_STATUS = { open: 'Enviada', expired: 'Vencida', accepted: 'Aceptada', rejected: 'Rechazada' };
const QUOTE_CHIP = { open: 'c-printing', expired: 'c-late', accepted: 'c-ready', rejected: '' };
async function loadQuotes() {
  const { data, error } = await recentOnly(
    () =>
      supabase
        .from('quotes')
        .select('*')
        .eq('workspace_id', S.workspace.id)
        .order('created_at', { ascending: false }),
    'created_at.gte."' + historyCutoff() + '",status.eq.sent'
  );
  if (error) throw error;
  S.quotes = data || [];
}
async function loadCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('name');
  if (error) throw error;
  S.customers = data || [];
}
const sameName = (a, b) =>
  String(a || '')
    .trim()
    .toLocaleLowerCase('es') ===
  String(b || '')
    .trim()
    .toLocaleLowerCase('es');
// Links a typed client name to a customer, creating it the first time it is used.
// Finds or creates the customer by name; a WhatsApp typed in the form is saved on it.
async function ensureCustomer(name, phone = '') {
  name = String(name || '').trim();
  phone = String(phone || '').trim();
  if (!name || !canEdit()) return null;
  const found = S.customers.find(c => sameName(c.name, name));
  if (found) {
    if (phone && phone !== found.phone) {
      const { error } = await supabase.from('customers').update({ phone }).eq('id', found.id);
      if (!error) found.phone = phone;
    }
    return found.id;
  }
  const { data, error } = await supabase
    .from('customers')
    .insert({ workspace_id: S.workspace.id, name: name.slice(0, 120), ...(phone ? { phone } : {}) })
    .select()
    .single();
  if (error) {
    // Someone else created it at the same time: use theirs.
    await loadCustomers().catch(() => {});
    return S.customers.find(c => sameName(c.name, name))?.id || null;
  }
  S.customers.push(data);
  return data.id;
}
// Choosing a known customer fills their WhatsApp if the field is still empty.
function bindCustomerPhone(nameSel, phoneSel) {
  const name = q(nameSel),
    phone = q(phoneSel);
  if (!name || !phone) return;
  let auto = '';
  const fill = () => {
    const c = S.customers.find(x => sameName(x.name, name.value));
    if (c?.phone && (!phone.value || phone.value === auto)) phone.value = auto = c.phone;
  };
  name.addEventListener('input', fill);
  name.addEventListener('change', fill);
  fill();
}
function customerOptions() {
  return (
    '<datalist id="customerList">' +
    S.customers.map(c => '<option value="' + esc(c.name) + '"></option>').join('') +
    '</datalist>'
  );
}
function quoteState(qt) {
  if (qt.status !== 'sent') return qt.status;
  const until = new Date(qt.created_at).getTime() + n(qt.validity_days) * 864e5;
  return until < Date.now() ? 'expired' : 'open';
}
function quoteSums(qt) {
  const total = Math.round(n(qt.unit_price)) * n(qt.quantity),
    net = qt.iva_enabled ? total / (1 + n(qt.iva_rate)) : total,
    cost = n(qt.unit_cost) * n(qt.quantity);
  return { total, net, profit: net - cost, margin: net > 0 && cost > 0 ? (net - cost) / net : null };
}
function quoteChip(qt) {
  const s = quoteState(qt);
  return '<span class="chip ' + QUOTE_CHIP[s] + '"><i></i>' + QUOTE_STATUS[s] + '</span>';
}
// Quote dialog data for a saved quote.
function savedQuoteData(qt) {
  const product = S.products.find(p => p.id === qt.product_id);
  return {
    savedId: qt.id,
    folio: quoteFolioNo(qt.quote_no),
    date: new Date(qt.created_at),
    client: qt.client_name,
    name: qt.title,
    description: qt.description,
    photo: product ? photoSrc(product) : null,
    quantity: qt.quantity,
    price: n(qt.unit_price),
    ivaEnabled: qt.iva_enabled,
    ivaRate: n(qt.iva_rate),
    validityDays: qt.validity_days,
    delivery: qt.delivery,
    terms: qt.terms,
    contact: qt.contact
  };
}
// Saves (or updates) the quote shown in the dialog so it gets a folio and appears in Cotizaciones.
async function saveQuoteRecord(d) {
  if (!canEdit() || d.fromOrder) return false;
  const customer_id = await ensureCustomer(d.client),
    common = {
      customer_id,
      client_name: d.client.slice(0, 120),
      validity_days: d.validityDays,
      delivery: d.delivery.slice(0, 200),
      terms: d.terms.slice(0, 1000),
      contact: d.contact.slice(0, 300)
    };
  if (d.savedId) {
    const { error } = await supabase
      .from('quotes')
      .update({ ...common, updated_at: new Date().toISOString() })
      .eq('id', d.savedId);
    if (error) throw error;
    const row = S.quotes.find(x => x.id === d.savedId);
    if (row) Object.assign(row, common);
    return true;
  }
  const { data, error } = await supabase
    .from('quotes')
    .insert({
      ...common,
      workspace_id: S.workspace.id,
      product_id: d.productId || null,
      title: (d.name || 'Producto').slice(0, 200),
      description: (d.description || '').slice(0, 2000),
      quantity: d.quantity,
      unit_price: Math.round(n(d.price)),
      iva_enabled: !!d.ivaEnabled,
      iva_rate: n(d.ivaRate),
      unit_cost: Math.max(0, n(d.unitCost))
    })
    .select()
    .single();
  if (error) throw error;
  d.savedId = data.id;
  d.folio = quoteFolioNo(data.quote_no);
  d.date = new Date(data.created_at);
  S.quotes = [data, ...(S.quotes || []).filter(x => x.id !== data.id)];
  return true;
}
function quotesView() {
  const term = (S.quoteSearch || '').toLocaleLowerCase('es'),
    filter = S.quoteFilter || 'open',
    matches = (qt, f) => f === 'all' || quoteState(qt) === f,
    count = f => S.quotes.filter(qt => matches(qt, f)).length,
    list = S.quotes
      .filter(qt => matches(qt, filter))
      .filter(qt =>
        (quoteFolioNo(qt.quote_no) + ' ' + qt.client_name + ' ' + qt.title)
          .toLocaleLowerCase('es')
          .includes(term)
      );
  const pills = [
    ['open', 'Abiertas', count('open')],
    ['expired', 'Vencidas', count('expired')],
    ['accepted', 'Aceptadas', count('accepted')],
    ['rejected', 'Rechazadas', count('rejected')],
    ['all', 'Todas', S.quotes.length]
  ].filter(([k, , c]) => c > 0 || ['open', 'all', filter].includes(k));
  const open = S.quotes.filter(qt => quoteState(qt) === 'open'),
    accepted = S.quotes.filter(qt => qt.status === 'accepted'),
    decided = S.quotes.filter(qt => ['accepted', 'rejected'].includes(qt.status)).length;
  root.innerHTML =
    header(
      'Cotizaciones',
      '<button class="btn icon-btn" id="reloadQuotes" type="button" aria-label="Actualizar" title="Actualizar">' +
        icon('refresh-cw') +
        '</button>' +
        (canEdit()
          ? '<button class="btn btn-primary" id="newJobQuote" type="button">' +
            icon('plus') +
            '<span>Nueva cotización</span></button>'
          : '')
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="summary-strip three"><div><span>Abiertas</span><b>' +
    open.length +
    '</b><small>' +
    clp(open.reduce((s, qt) => s + quoteSums(qt).total, 0)) +
    ' por cerrar</small></div><div><span>Aceptadas</span><b>' +
    accepted.length +
    '</b><small>' +
    clp(accepted.reduce((s, qt) => s + quoteSums(qt).total, 0)) +
    '</small></div><div><span>Tasa de cierre</span><b>' +
    (decided ? pct(accepted.length / decided) : '—') +
    '</b><small>de las respondidas</small></div></div><div class="toolbar">' +
    searchBox('quoteSearch', 'Buscar folio, cliente o producto', S.quoteSearch) +
    '</div>' +
    filterPills(pills, filter, 'data-quote-filter') +
    '<section class="panel">' +
    (list.length
      ? '<table class="data-table"><thead><tr><th>Cotización</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th class="r">Total</th></tr></thead><tbody>' +
        list
          .map(
            qt =>
              '<tr data-quote="' +
              qt.id +
              '"><td><b>' +
              esc(qt.title) +
              '</b><div class="sub">' +
              quoteFolioNo(qt.quote_no) +
              ' · ' +
              qt.quantity +
              ' un.</div></td><td>' +
              esc(qt.client_name || '—') +
              '</td><td class="sub">' +
              relativeDate(qt.created_at) +
              '</td><td>' +
              quoteChip(qt) +
              '</td><td class="r num"><b>' +
              clp(quoteSums(qt).total) +
              '</b></td></tr>'
          )
          .join('') +
        '</tbody></table><div class="list-rows">' +
        list
          .map(
            qt =>
              '<button type="button" class="list-row" data-quote="' +
              qt.id +
              '"><span class="lr-main"><b>' +
              esc(qt.title) +
              '</b><span>' +
              quoteFolioNo(qt.quote_no) +
              ' · ' +
              esc(qt.client_name || 'Sin cliente') +
              '</span></span><span class="lr-end"><b class="num">' +
              clp(quoteSums(qt).total) +
              '</b>' +
              quoteChip(qt) +
              '</span></button>'
          )
          .join('') +
        '</div>'
      : '<div class="panel-empty">' +
        icon(term ? 'search' : 'file-text') +
        '<b>' +
        (term
          ? 'Sin resultados'
          : S.quotes.length
            ? 'No hay cotizaciones en esta vista'
            : 'Aún no hay cotizaciones') +
        '</b><span>' +
        (S.quotes.length
          ? ''
          : 'Desde un producto, en Resumen → «Compartir cotización». Se guardan al compartir o imprimir.') +
        '</span></div>') +
    '</section></main>';
  common();
  bindSearch('quoteSearch', v => (S.quoteSearch = v), quotesView);
  qa('[data-quote-filter]').forEach(
    b =>
      (b.onclick = () => {
        S.quoteFilter = b.dataset.quoteFilter;
        quotesView();
      })
  );
  qa('[data-quote]').forEach(
    b => (b.onclick = () => showSavedQuote(S.quotes.find(x => x.id === b.dataset.quote)))
  );
  q('#reloadQuotes').onclick = () => goMode('quotes');
  q('#newJobQuote')?.addEventListener('click', () => showQuickJob('quote'));
}
function showSavedQuote(qt) {
  if (!qt) return;
  const s = quoteSums(qt),
    state = quoteState(qt),
    order = qt.order_id && S.orders.find(o => o.id === qt.order_id),
    until = new Date(new Date(qt.created_at).getTime() + n(qt.validity_days) * 864e5);
  const dialog = showDialog(
    'savedQuoteDialog',
    '<div class="section-title"><h2>Cotización ' +
      quoteFolioNo(qt.quote_no) +
      '</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><div class="order-head"><div><b>' +
      esc(qt.title) +
      '</b>' +
      quoteChip(qt) +
      '</div><button class="btn btn-secondary btn-sm" id="reopenQuote" type="button">' +
      icon('share-2') +
      'Ver y compartir</button></div><dl class="facts"><div><dt>Cliente</dt><dd>' +
      esc(qt.client_name || '—') +
      '</dd></div><div><dt>Cantidad</dt><dd>' +
      qt.quantity +
      ' un.</dd></div><div><dt>Total</dt><dd>' +
      clp(s.total) +
      '</dd></div><div><dt>Fecha</dt><dd>' +
      new Date(qt.created_at).toLocaleDateString('es-CL') +
      '</dd></div><div><dt>Válida hasta</dt><dd class="' +
      (state === 'expired' ? 'down' : '') +
      '">' +
      until.toLocaleDateString('es-CL') +
      '</dd></div><div><dt>Utilidad estimada</dt><dd class="' +
      (s.profit < 0 ? 'down' : 'up') +
      '">' +
      (n(qt.unit_cost) > 0 ? clp(s.profit) + (s.margin == null ? '' : ' · ' + pct(s.margin)) : '—') +
      '</dd></div></dl>' +
      (order
        ? '<p class="notice small">Convertida en el pedido <b>PED-' +
          order.order_no +
          '</b>. <button type="button" class="btn btn-ghost btn-sm" id="quoteOrder">Ver pedido</button></p>'
        : '') +
      (canEdit()
        ? '<div class="dialog-actions">' +
          (qt.status === 'sent'
            ? '<button type="button" class="btn btn-ghost" id="rejectQuote">Marcar rechazada</button><button type="button" class="btn btn-primary" id="acceptQuote">' +
              icon('clipboard-list') +
              'Aceptada: crear pedido</button>'
            : '<button type="button" class="btn btn-ghost" id="reopenStatus">Volver a «Enviada»</button>') +
          '<button type="button" class="btn btn-ghost danger-text" id="deleteQuote">' +
          icon('trash-2') +
          'Eliminar</button></div>'
        : '')
  );
  const setStatus = async status => {
    const { error } = await supabase
      .from('quotes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', qt.id);
    if (error) return toast(error.message, 'error');
    qt.status = status;
    dialog.close();
    render();
  };
  q('#reopenQuote').onclick = () => {
    dialog.close();
    showQuote(savedQuoteData(qt));
  };
  q('#quoteOrder')?.addEventListener('click', () => {
    dialog.close();
    showOrder(order);
  });
  q('#rejectQuote')?.addEventListener('click', () => setStatus('rejected'));
  q('#reopenStatus')?.addEventListener('click', () => {
    if (qt.order_id)
      return toast('Ya tiene un pedido. Cancélalo en Pedidos si el cliente se arrepintió.', 'error');
    setStatus('sent');
  });
  q('#acceptQuote')?.addEventListener('click', () => {
    dialog.close();
    showQuoteToOrder(qt);
  });
  q('#deleteQuote')?.addEventListener('click', async () => {
    dialog.close();
    const ok = await confirmDialog({
      title: 'Eliminar cotización',
      body:
        quoteFolioNo(qt.quote_no) +
        ' se eliminará del historial. Los pedidos creados desde ella se conservan.',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (!ok) return;
    const { error } = await supabase.from('quotes').delete().eq('id', qt.id);
    if (error) return toast(error.message, 'error');
    S.quotes = S.quotes.filter(x => x.id !== qt.id);
    S.msg = 'Cotización eliminada.';
    render();
  });
  return dialog;
}
// Accepting a quote creates a customer order with the quoted price and quantity.
function showQuoteToOrder(qt) {
  if (!canEdit()) return;
  const product = S.products.find(p => p.id === qt.product_id),
    stock = productStock(product);
  const dialog = showDialog(
    'quoteOrderDialog',
    '<div class="section-title"><h2>Crear pedido</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="quoteOrderForm" class="grid"><p class="small muted">' +
      quoteFolioNo(qt.quote_no) +
      ' · ' +
      esc(qt.client_name || 'Sin cliente') +
      ' · ' +
      qt.quantity +
      ' × ' +
      esc(qt.title) +
      ' a ' +
      clp(qt.unit_price) +
      '</p>' +
      fieldHtml('Fecha de entrega', 'qoDue', '', 'date') +
      depositField(quoteSums(qt).total) +
      (product && stock.available >= qt.quantity
        ? '<label class="check-row"><input type="checkbox" id="qoFromStock"> <span><b>Entregar desde stock</b><span class="small muted">' +
          stock.available +
          ' unidades disponibles. No reserva materiales.</span></span></label>'
        : product
          ? ''
          : '<p class="notice small">' +
            (qt.product_id
              ? 'El producto ya no existe: el pedido se crea sin reservar materiales.'
              : 'Trabajo a medida: no reserva materiales. Registra sus costos reales en el pedido.') +
            '</p>') +
      '<div class="field"><label for="qoNotes">Notas de producción</label><textarea id="qoNotes"></textarea></div><div id="qoFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Confirmar pedido</button></form>'
  );
  q('#quoteOrderForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const customer_id = qt.customer_id || (await ensureCustomer(qt.client_name));
      const { data: order, error } = await supabase
        .from('production_orders')
        .insert({
          workspace_id: S.workspace.id,
          product_id: product ? product.id : null,
          customer_id,
          title: qt.title,
          kind: 'customer',
          from_stock: !!q('#qoFromStock')?.checked,
          customer_name: qt.client_name,
          quantity: qt.quantity,
          unit_price: n(qt.unit_price),
          iva_enabled: qt.iva_enabled,
          iva_rate: n(qt.iva_rate),
          estimated_cost: Math.round(n(qt.unit_cost) * qt.quantity),
          due_date: q('#qoDue').value || null,
          notes: (quoteFolioNo(qt.quote_no) + '. ' + q('#qoNotes').value.trim()).trim()
        })
        .select()
        .single();
      if (error) throw error;
      const { error: qe } = await supabase
        .from('quotes')
        .update({ status: 'accepted', order_id: order.id, customer_id, updated_at: new Date().toISOString() })
        .eq('id', qt.id);
      if (qe) throw qe;
      await saveDeposit(order);
      Object.assign(qt, { status: 'accepted', order_id: order.id, customer_id });
      dialog.close();
      S.orderFilter = 'open';
      await goMode('production');
      S.msg = 'Pedido PED-' + order.order_no + ' creado desde ' + quoteFolioNo(qt.quote_no) + '.';
      render();
    } catch (error) {
      q('#qoFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  return dialog;
}
function customerHistory(c) {
  const quotes = S.quotes.filter(
      qt => qt.customer_id === c.id || (!qt.customer_id && sameName(qt.client_name, c.name))
    ),
    orders = S.orders.filter(
      o =>
        o.kind !== 'stock' &&
        (o.customer_id === c.id || (!o.customer_id && sameName(o.customer_name, c.name)))
    ),
    sold = orders.filter(o => o.status !== 'canceled').reduce((s, o) => s + orderNumbers(o).sales, 0),
    last = [...quotes.map(x => x.created_at), ...orders.map(x => x.created_at)].sort().pop(),
    due = orders.reduce((s, o) => s + orderBalance(o).due, 0);
  return { quotes, orders, sold, last, due };
}
function customerContact(c) {
  return [c.phone, c.instagram, c.email].filter(Boolean).join(' · ');
}
function whatsappLink(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('9')) digits = '56' + digits;
  return digits.length >= 8 ? 'https://wa.me/' + digits : '';
}
function customersView() {
  const term = (S.customerSearch || '').toLocaleLowerCase('es'),
    rows = S.customers
      .map(c => ({ c, h: customerHistory(c) }))
      .filter(({ c }) => (c.name + ' ' + customerContact(c)).toLocaleLowerCase('es').includes(term))
      .sort((a, b) => b.h.sold - a.h.sold || a.c.name.localeCompare(b.c.name, 'es'));
  root.innerHTML =
    header(
      'Clientes',
      canEdit()
        ? '<button class="btn btn-primary" id="newCustomer" type="button">' +
            icon('plus') +
            '<span>Nuevo cliente</span></button>'
        : ''
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="toolbar">' +
    searchBox('customerSearch', 'Buscar cliente, teléfono o Instagram', S.customerSearch) +
    '</div><section class="panel">' +
    (rows.length
      ? '<table class="data-table"><thead><tr><th>Cliente</th><th>Contacto</th><th class="r">Cotizaciones</th><th class="r">Pedidos</th><th class="r">Vendido</th></tr></thead><tbody>' +
        rows
          .map(
            ({ c, h }) =>
              '<tr data-customer="' +
              c.id +
              '"><td><b>' +
              esc(c.name) +
              '</b><div class="sub">' +
              (h.last ? 'Último movimiento ' + relativeDate(h.last) : 'Sin movimientos') +
              '</div></td><td class="sub">' +
              esc(customerContact(c) || '—') +
              '</td><td class="r num">' +
              h.quotes.length +
              '</td><td class="r num">' +
              h.orders.length +
              '</td><td class="r num"><b>' +
              clp(h.sold) +
              '</b></td></tr>'
          )
          .join('') +
        '</tbody></table><div class="list-rows">' +
        rows
          .map(
            ({ c, h }) =>
              '<button type="button" class="list-row" data-customer="' +
              c.id +
              '"><span class="avatar">' +
              esc((c.name.trim()[0] || '?').toUpperCase()) +
              '</span><span class="lr-main"><b>' +
              esc(c.name) +
              '</b><span>' +
              h.quotes.length +
              ' cot. · ' +
              h.orders.length +
              (h.orders.length === 1 ? ' pedido' : ' pedidos') +
              (customerContact(c) ? ' · ' + esc(customerContact(c)) : '') +
              '</span></span><span class="lr-end"><b class="num">' +
              clp(h.sold) +
              '</b></span></button>'
          )
          .join('') +
        '</div>'
      : '<div class="panel-empty">' +
        icon(term ? 'search' : 'users') +
        '<b>' +
        (term ? 'Sin resultados' : 'Aún no hay clientes') +
        '</b><span>' +
        (term ? '' : 'Se crean solos al guardar una cotización o un pedido con nombre de cliente.') +
        '</span></div>') +
    '</section></main>';
  common();
  bindSearch('customerSearch', v => (S.customerSearch = v), customersView);
  q('#newCustomer')?.addEventListener('click', () => showCustomer({}));
  qa('[data-customer]').forEach(
    b => (b.onclick = () => showCustomer(S.customers.find(c => c.id === b.dataset.customer)))
  );
}
function showCustomer(c) {
  const h = c.id ? customerHistory(c) : { quotes: [], orders: [], sold: 0 },
    edit = canEdit(),
    wa = whatsappLink(c.phone);
  const dialog = showDialog(
    'customerDialog',
    '<div class="section-title"><h2>' +
      (c.id ? esc(c.name) : 'Nuevo cliente') +
      '</h2><button class="btn btn-ghost" data-close>Cerrar</button></div>' +
      (c.id
        ? '<dl class="facts"><div><dt>Cotizaciones</dt><dd>' +
          h.quotes.length +
          '</dd></div><div><dt>Pedidos</dt><dd>' +
          h.orders.length +
          '</dd></div><div><dt>Vendido</dt><dd>' +
          clp(h.sold) +
          '</dd></div><div><dt>Por cobrar</dt><dd class="' +
          (h.due > 0 ? 'warn' : '') +
          '">' +
          clp(h.due) +
          '</dd></div></dl>'
        : '') +
      (wa
        ? '<a class="btn btn-secondary" href="' +
          esc(wa) +
          '" target="_blank" rel="noopener">' +
          icon('share-2') +
          'Escribir por WhatsApp</a>'
        : '') +
      (edit && c.id
        ? '<div class="customer-quick"><button type="button" class="btn btn-secondary btn-sm" data-customer-new="quote">' +
          icon('file-text') +
          'Cotizar</button><button type="button" class="btn btn-secondary btn-sm" data-customer-new="order">' +
          icon('clipboard-list') +
          'Nuevo pedido</button></div>'
        : '') +
      '<form id="customerForm" class="grid">' +
      fieldHtml(
        'Nombre o empresa',
        'cuName',
        c.name || '',
        'text',
        'required maxlength="120"' + (edit ? '' : ' readonly')
      ) +
      '<div class="grid grid-2">' +
      fieldHtml(
        'Teléfono / WhatsApp',
        'cuPhone',
        c.phone || '',
        'tel',
        'maxlength="40" placeholder="+56 9 …"' + (edit ? '' : ' readonly')
      ) +
      fieldHtml(
        'Instagram',
        'cuInstagram',
        c.instagram || '',
        'text',
        'maxlength="80" placeholder="@usuario"' + (edit ? '' : ' readonly')
      ) +
      '</div>' +
      fieldHtml('Correo', 'cuEmail', c.email || '', 'email', 'maxlength="160"' + (edit ? '' : ' readonly')) +
      '<div class="field"><label for="cuNotes">Notas</label><textarea id="cuNotes" maxlength="1000"' +
      (edit ? '' : ' readonly') +
      '>' +
      esc(c.notes || '') +
      '</textarea></div><div id="cuFeedback" class="small" role="status"></div>' +
      (edit
        ? '<div class="dialog-actions">' +
          (c.id
            ? '<button type="button" class="btn btn-ghost danger-text" id="deleteCustomer">' +
              icon('trash-2') +
              'Eliminar</button>'
            : '') +
          '<button class="btn btn-primary" type="submit">Guardar cliente</button></div>'
        : '') +
      '</form>' +
      (h.quotes.length || h.orders.length
        ? '<h3 class="form-section">Historial</h3><div class="history-list">' +
          [
            ...h.quotes.map(qt => ({
              at: qt.created_at,
              html:
                '<button type="button" class="list-row" data-history-quote="' +
                qt.id +
                '"><span class="lr-main"><b>' +
                quoteFolioNo(qt.quote_no) +
                ' · ' +
                esc(qt.title) +
                '</b><span>' +
                new Date(qt.created_at).toLocaleDateString('es-CL') +
                '</span></span><span class="lr-end"><b class="num">' +
                clp(quoteSums(qt).total) +
                '</b>' +
                quoteChip(qt) +
                '</span></button>'
            })),
            ...h.orders.map(o => ({
              at: o.created_at,
              html:
                '<button type="button" class="list-row" data-history-order="' +
                o.id +
                '"><span class="lr-main"><b>PED-' +
                o.order_no +
                ' · ' +
                esc(o.title) +
                '</b><span>' +
                new Date(o.created_at).toLocaleDateString('es-CL') +
                '</span></span><span class="lr-end"><b class="num">' +
                clp(orderNumbers(o).sales) +
                '</b>' +
                orderChip(o) +
                '</span></button>'
            }))
          ]
            .sort((a, b) => String(b.at).localeCompare(String(a.at)))
            .map(x => x.html)
            .join('') +
          '</div>'
        : '')
  );
  dialog.querySelectorAll('[data-history-quote]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        showSavedQuote(S.quotes.find(x => x.id === b.dataset.historyQuote));
      })
  );
  dialog.querySelectorAll('[data-history-order]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        showOrder(S.orders.find(x => x.id === b.dataset.historyOrder));
      })
  );
  dialog.querySelectorAll('[data-customer-new]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        showQuickJob(b.dataset.customerNew, { client: c.name });
      })
  );
  q('#customerForm').onsubmit = async e => {
    e.preventDefault();
    if (!edit) return;
    const b = e.submitter || e.target.querySelector('button[type=submit]'),
      v = {
        name: q('#cuName').value.trim(),
        phone: q('#cuPhone').value.trim(),
        instagram: q('#cuInstagram').value.trim(),
        email: q('#cuEmail').value.trim(),
        notes: q('#cuNotes').value.trim()
      };
    if (S.customers.some(x => x.id !== c.id && sameName(x.name, v.name)))
      return (q('#cuFeedback').textContent = 'Ya existe un cliente con ese nombre.');
    b.disabled = true;
    try {
      const { error } = c.id
        ? await supabase
            .from('customers')
            .update({ ...v, updated_at: new Date().toISOString() })
            .eq('id', c.id)
        : await supabase.from('customers').insert({ ...v, workspace_id: S.workspace.id });
      if (error) throw error;
      await loadCustomers();
      dialog.close();
      S.msg = 'Cliente guardado.';
      render();
    } catch (error) {
      q('#cuFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  q('#deleteCustomer')?.addEventListener('click', async () => {
    dialog.close();
    const ok = await confirmDialog({
      title: 'Eliminar cliente',
      body: '«' + c.name + '» se eliminará. Sus cotizaciones y pedidos se conservan con el nombre escrito.',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (!ok) return;
    const { error } = await supabase.from('customers').delete().eq('id', c.id);
    if (error) return toast(error.message, 'error');
    S.customers = S.customers.filter(x => x.id !== c.id);
    S.msg = 'Cliente eliminado.';
    render();
  });
  return dialog;
}
// Remembers the open screen so a reload (or reopening the app) returns to it.
const VIEW_MODES = [
  'home',
  'dashboard',
  'quotes',
  'production',
  'customers',
  'reports',
  'finance',
  'inventory',
  'resources',
  'product',
  'files'
];
const viewKey = () => 'kultiapp_view_' + (S.session?.user?.id || '');
function saveView() {
  if (!S.workspace || !VIEW_MODES.includes(S.mode)) return;
  try {
    localStorage.setItem(
      viewKey(),
      JSON.stringify({
        mode: S.mode,
        product: S.mode === 'product' ? S.product?.id || null : null,
        tab: S.editorTab
      })
    );
  } catch {}
}
async function restoreView() {
  let v;
  try {
    v = JSON.parse(localStorage.getItem(viewKey()) || 'null');
  } catch {}
  // Home-screen shortcuts open a section with ?view=…
  const asked = new URLSearchParams(location.search).get('view');
  if (asked) {
    history.replaceState({}, '', location.pathname);
    if (VIEW_MODES.includes(asked) && asked !== 'product') v = { mode: asked };
  }
  if (!v || !VIEW_MODES.includes(v.mode) || v.mode === 'home') return false;
  try {
    if (v.mode === 'product') {
      if (!v.product || !S.products.some(p => p.id === v.product)) return false;
      await openProduct(v.product, { restore: false });
      if (['details', 'prints', 'costs', 'summary'].includes(v.tab)) S.editorTab = v.tab;
      return true;
    }
    if (v.mode === 'files') await loadCustomerFileRequests();
    if (v.mode === 'quotes' || v.mode === 'customers') await Promise.all([loadQuotes(), loadCustomers()]);
    if (v.mode === 'finance') await Promise.all([loadExpenses(), loadTransfers()]);
    S.mode = v.mode;
    return true;
  } catch (e) {
    console.warn('No se pudo restaurar la vista', e);
    return false;
  }
}
