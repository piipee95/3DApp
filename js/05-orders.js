'use strict';
// V1.3: shared resources, selling prices and production snapshots.
async function loadResources() {
  const { data, error } = await supabase
    .from('workspace_resources')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('name');
  if (error) throw error;
  S.resources = data || [];
}
// Startup loads the last 12 months plus anything still open; Reportes fetches older months on demand.
const HISTORY_MONTHS = 12;
function historyCutoff(months = HISTORY_MONTHS) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - months + 1, 1).toISOString();
}
// Applies the startup window; if the filtered query fails, it falls back to the full list
// (and logs it) so the app never opens without its orders. Builders without .or return the full list.
async function recentOnly(build, filter) {
  const query = build();
  if (typeof query.or !== 'function') return query;
  const result = await query.or(filter);
  if (!result.error) return result;
  logError('handled', 'Filtro de carga reciente: ' + result.error.message);
  return build();
}
async function loadOrders() {
  S.historyFrom = historyCutoff();
  const { data, error } = await recentOnly(
    () =>
      supabase
        .from('production_orders')
        .select('*')
        .eq('workspace_id', S.workspace.id)
        .order('created_at', { ascending: false }),
    'created_at.gte."' + S.historyFrom + '",status.not.in.(delivered,canceled)'
  );
  if (error) throw error;
  S.orders = data || [];
  // Balances are extra information: orders still show if payments fail to load.
  try {
    await loadPayments();
  } catch (e) {
    console.warn('No se pudieron cargar los pagos', e);
  }
}
async function goMode(mode) {
  persistDraft();
  S.msg = '';
  S.err = '';
  S.mode = mode;
  // Show the section's outline right away while its data loads.
  if (S.workspace && mode !== 'product') skeletonView(mode);
  try {
    if (mode === 'files') await loadCustomerFileRequests();
    if (mode === 'production') {
      await loadOrders();
      await loadResources();
    }
    if (mode === 'resources' || mode === 'inventory' || mode === 'product') await loadResources();
    if (['resources', 'reports', 'finance'].includes(mode)) await loadFailures();
    if (mode === 'dashboard') await loadProducts();
    if (mode === 'quotes') await Promise.all([loadQuotes(), loadCustomers(), loadOrders()]);
    if (mode === 'customers') await Promise.all([loadCustomers(), loadQuotes(), loadOrders()]);
    if (mode === 'reports') await Promise.all([loadQuotes(), loadOrders()]);
    if (mode === 'finance') await Promise.all([loadOrders(), loadExpenses(), loadTransfers()]);
    if (mode === 'home') await Promise.all([loadProducts(), loadOrders(), loadResources(), loadQuotes()]);
    render();
  } catch (e) {
    fail(e.message);
  }
}
function productNumbers(p) {
  const unit = n(S.summaries.get(p.id)?.total_cost) / Math.max(1, n(p.quantity)),
    net = unit / Math.max(0.01, 1 - n(p.target_margin)),
    suggested = commercial(p.iva_enabled ? net * (1 + n(p.iva_rate)) : net, p.round_to),
    price = p.sale_price == null ? suggested : n(p.sale_price),
    finalNet = p.iva_enabled ? price / (1 + n(p.iva_rate)) : price;
  return {
    unit,
    price,
    profit: finalNet - unit,
    margin: unit > 0 && finalNet > 0 ? (finalNet - unit) / finalNet : null
  };
}
function matchesProfit(p) {
  const t = productNumbers(p);
  return (
    S.profitFilter === 'all' ||
    (S.profitFilter === 'loss' && t.profit < 0) ||
    (S.profitFilter === 'positive' && t.unit > 0 && t.profit >= 0) ||
    (S.profitFilter === 'uncosted' && t.unit === 0)
  );
}
function compareProducts(a, b) {
  const x = productNumbers(a),
    y = productNumbers(b);
  return S.sort === 'name'
    ? a.name.localeCompare(b.name, 'es')
    : S.sort === 'price'
      ? y.price - x.price
      : S.sort === 'cost'
        ? y.unit - x.unit
        : S.sort === 'margin'
          ? (y.margin ?? -Infinity) - (x.margin ?? -Infinity) || 0
          : String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
}
function activeResources(kind) {
  return S.resources.filter(r => r.kind === kind && r.active);
}
function setupV13() {
  const box = document.createElement('div');
  box.className = 'selling-price';
  box.innerHTML =
    '<div class="field"><label for="salePrice">Precio de venta final / unidad (opcional)</label><input id="salePrice" type="number" min="0" step="1" placeholder="Vacío: precio automático" value="' +
    (S.product.sale_price == null ? '' : n(S.product.sale_price)) +
    '"><span class="small muted">' +
    (S.product.iva_enabled ? 'IVA incluido. ' : '') +
    'Déjalo vacío para usar el cálculo automático.</span></div><div id="priceStatus" class="small" role="status"></div>';
  q('#desc').closest('.field').after(box);
  qa('.print-card').forEach(el => {
    const index = qa('.print-card').indexOf(el),
      p = S.product.prints[index];
    const chooser = document.createElement('div');
    chooser.className = 'field printer-choice';
    chooser.innerHTML =
      '<label>Perfil de impresora</label><select class="printerSelect"><option value="">Parámetro general</option>' +
      activeResources('printer')
        .map(r => '<option value="' + esc(r.id) + '">' + esc(r.name) + ' · ' + n(r.power_kw) + ' kW</option>')
        .join('') +
      '</select>';
    el.querySelector('.print-advanced').before(chooser);
    const extras = document.createElement('div');
    extras.className = 'printer-snapshot grid grid-2';
    extras.innerHTML =
      '<div class="field"><label>Impresora registrada</label><input class="printerLabel" readonly value="' +
      esc(p.printer_name || '') +
      '" placeholder="General"></div><div class="field"><label>Potencia kW (vacío: general)</label><input class="printPower" type="number" min="0" max="100" step="0.01" value="' +
      (p.power_kw == null ? '' : n(p.power_kw)) +
      '"></div>';
    el.querySelector('.print-advanced').append(extras);
    const match = activeResources('printer').find(
      r => r.name === p.printer_name && n(r.power_kw) === n(p.power_kw)
    );
    if (match) chooser.querySelector('select').value = match.id;
    [...el.querySelectorAll('.filament-row')].forEach(row => {
      const picker = document.createElement('select');
      picker.className = 'filamentSelect';
      picker.setAttribute('aria-label', 'Elegir filamento del catálogo');
      picker.innerHTML =
        '<option value="">Elegir del catálogo…</option>' +
        activeResources('filament')
          .map(
            r =>
              '<option value="' +
              esc(r.id) +
              '">' +
              esc(r.name) +
              (r.material ? ' · ' + esc(r.material) : '') +
              '</option>'
          )
          .join('');
      row.querySelector('.color-field').prepend(picker);
      picker.value = row.dataset.resourceId || '';
      const f = { resource_id: row.dataset.resourceId };
      row.classList.toggle('linked', !!S.resources.find(r => r.id === f.resource_id));
      row.insertAdjacentHTML('afterbegin', filamentChip(f));
      const chip = row.querySelector('.pickF');
      chip.disabled = !canEdit();
      chip.onclick = () => showFilamentPicker(row);
    });
  });
  const order = document.createElement('button');
  order.id = 'createOrder';
  order.className = 'btn btn-secondary';
  order.innerHTML = icon('clipboard-list') + 'Crear pedido';
  order.disabled = !canEdit();
  q('.quote-actions').append(order);
  const st = productStock(S.product),
    stockBox = document.createElement('section');
  stockBox.className = 'stock-card';
  stockBox.innerHTML =
    '<div class="stock-figure">' +
    icon('boxes') +
    '<div><span class="small muted">En stock</span><b id="stockFigure">' +
    st.available +
    (st.available === 1 ? ' unidad' : ' unidades') +
    '</b>' +
    (st.reserved
      ? '<span class="small muted">' +
        st.reserved +
        (st.reserved === 1 ? ' reservada' : ' reservadas') +
        ' para pedidos</span>'
      : '') +
    '</div></div><div class="row"><button type="button" class="btn btn-secondary" id="makeStock"' +
    (canEdit() ? '' : ' disabled') +
    '>' +
    icon('plus') +
    'Fabricar para stock</button><button type="button" class="btn btn-ghost" id="adjustStock"' +
    (canEdit() && S.product.id ? '' : ' disabled') +
    '>' +
    icon('pencil') +
    'Ajustar conteo</button></div>';
  q('.quote-actions').after(stockBox);
  updatePriceStatus();
  enhanceFields();
}
function updatePriceStatus() {
  const el = q('#priceStatus');
  if (!el) return;
  const t = totals();
  el.className = 'small ' + (t.utilityUnit < 0 ? 'loss-text' : '');
  el.textContent =
    'Automático: ' +
    clp(t.suggested) +
    ' · Margen con precio final: ' +
    (t.rounded > 0 ? pct(t.em) : 'No aplica') +
    ' · Utilidad / un.: ' +
    clp(t.utilityUnit) +
    (t.utilityUnit < 0 ? ' · Este precio genera pérdida.' : '');
}
function bindV13() {
  q('#createOrder').onclick = async () => {
    if (!canEdit()) return;
    if (S.photoBusy || S.saving) return;
    if (!S.product.id || S.dirty) await saveProduct();
    if (S.product.id && !S.dirty) showNewOrder();
  };
  q('#makeStock').onclick = async () => {
    if (!canEdit() || S.photoBusy || S.saving) return;
    if (!S.product.id || S.dirty) await saveProduct();
    if (S.product.id && !S.dirty) showNewOrder('stock');
  };
  q('#adjustStock').onclick = () => showStockAdjust(S.product);
  if (!canEdit()) return;
  qa('.filamentSelect').forEach(
    select =>
      (select.onchange = () => {
        const resource = S.resources.find(r => r.id === select.value);
        const row = select.closest('.filament-row');
        if (!resource) {
          delete row.dataset.resourceId;
          row.querySelector('.fn').readOnly = false;
          row.querySelector('.fc').disabled = false;
          refresh();
          return;
        }
        row.dataset.resourceId = resource.id;
        row.querySelector('.fn').readOnly = true;
        row.querySelector('.fc').disabled = true;
        row.querySelector('.fn').value = resource.name + (resource.material ? ' · ' + resource.material : '');
        row.querySelector('.fc').value = resource.color;
        row.querySelector('.fp').value = resource.price_per_kg;
        refresh();
      })
  );
  qa('.printerSelect').forEach(
    select =>
      (select.onchange = () => {
        const el = select.closest('.print-card'),
          resource = S.resources.find(r => r.id === select.value);
        el.querySelector('.printerLabel').value = resource?.name || '';
        el.querySelector('.printPower').value = resource?.power_kw ?? '';
        calcPrintCosts(el);
      })
  );
}
// Focus the dialog itself so no control shows a focus ring and phones don't open the keyboard.
function focusDialog(dialog) {
  dialog.tabIndex = -1;
  dialog.focus({ preventScroll: true });
}
function closeOnBackdrop(dialog) {
  dialog.addEventListener('mousedown', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      dialog.close();
  });
}
function showDialog(id, html) {
  q('#' + id)?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'quote-dialog workspace-dialog';
  dialog.innerHTML = html;
  dialog.querySelectorAll('.section-title [data-close]').forEach(b => {
    b.className = 'btn icon-btn dialog-close';
    b.setAttribute('aria-label', 'Cerrar');
    b.innerHTML = icon('x');
  });
  document.body.append(dialog);
  dialog.onclose = () => dialog.remove();
  // Forms only close with their buttons or Esc so a stray tap never loses what was typed.
  if (!dialog.querySelector('form')) closeOnBackdrop(dialog);
  dialog.showModal();
  focusDialog(dialog);
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  return dialog;
}
function fieldHtml(label, id, value = '', type = 'text', attrs = '') {
  return (
    '<div class="field"><label for="' +
    id +
    '">' +
    esc(label) +
    '</label><input id="' +
    id +
    '" type="' +
    type +
    '" value="' +
    esc(value ?? '') +
    '" ' +
    attrs +
    '></div>'
  );
}
function showResourceForm(resource) {
  if (!canEdit()) return;
  const isFilament = resource.kind === 'filament';
  const dialog = showDialog(
    'resourceDialog',
    '<div class="section-title"><h2>' +
      (isFilament ? 'Filamento' : 'Impresora') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="resourceForm" class="grid">' +
      fieldHtml('Nombre', 'resourceName', resource.name, 'text', 'required maxlength="160"') +
      (isFilament
        ? fieldHtml('Marca / material', 'resourceMaterial', resource.material) +
          fieldHtml('Color', 'resourceColor', resource.color || '#303030', 'color') +
          fieldHtml(
            'Precio por kilogramo CLP',
            'resourcePrice',
            resource.price_per_kg ?? S.settings.filament_price_per_kg,
            'number',
            'min="0" step="1" required'
          )
        : fieldHtml(
            'Potencia eléctrica kW',
            'resourcePower',
            resource.power_kw ?? S.settings.printer_power_kw,
            'number',
            'min="0" max="100" step="0.01" required'
          ) +
          fieldHtml(
            'Mantención cada (horas de impresión)',
            'resourceMaint',
            resource.maintenance_every_hours || '',
            'number',
            'min="0" max="100000" step="1" placeholder="Ej. 200 · vacío: sin aviso"'
          )) +
      '<label class="small"><input type="checkbox" id="resourceActive" ' +
      (resource.active ? 'checked' : '') +
      '> Disponible para seleccionar</label><div id="resourceFeedback" role="status" class="small"></div><button class="btn btn-primary" type="submit">Guardar recurso</button></form>'
  );
  q('#resourceForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const value = {
        name: q('#resourceName').value.trim(),
        active: q('#resourceActive').checked,
        ...(isFilament
          ? {
              material: q('#resourceMaterial').value.trim(),
              color: q('#resourceColor').value,
              price_per_kg: n(q('#resourcePrice').value)
            }
          : {
              power_kw: n(q('#resourcePower').value),
              maintenance_every_hours: Math.max(0, Math.round(n(q('#resourceMaint').value)))
            })
      };
      // Updates may only touch the columns granted for update; workspace and kind are set once on insert.
      const query = resource.id
        ? supabase
            .from('workspace_resources')
            .update(value)
            .eq('id', resource.id)
            .eq('workspace_id', S.workspace.id)
        : supabase
            .from('workspace_resources')
            .insert({ ...value, workspace_id: S.workspace.id, kind: resource.kind });
      const { error } = await query.select().single();
      if (error) throw error;
      await loadResources();
      dialog.close();
      render();
    } catch (error) {
      q('#resourceFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
const ORDER_STATUSES = {
  pending: 'Pendiente',
  printing: 'Imprimiendo',
  assembly: 'Armado',
  ready: 'Listo',
  delivered: 'Entregado',
  canceled: 'Cancelado'
};
function orderNumbers(order) {
  const sales = n(order.quantity) * n(order.unit_price),
    net = order.iva_enabled ? sales / (1 + n(order.iva_rate)) : sales,
    actual = order.actual_cost == null ? null : n(order.actual_cost) + n(order.failures_cost);
  return {
    sales,
    net,
    estimatedProfit: net - n(order.estimated_cost),
    actualCost: actual,
    actualProfit: actual == null ? null : net - actual,
    variance: actual == null ? null : actual - n(order.estimated_cost)
  };
}
function localToday() {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}
// kind 'customer': sale to a client (optionally served from finished stock);
// kind 'stock': fabrication that adds finished units when it is marked ready.
function showNewOrder(kind = 'customer') {
  if (!canEdit() || !S.product?.id) return;
  const p = S.product,
    t = totals(),
    stock = productStock(p),
    forStock = kind === 'stock',
    grams = p.prints.reduce((s, x) => s + n(x.grams), 0),
    minutes = p.prints.reduce((s, x) => s + n(x.hours) * 60 + n(x.minutes), 0);
  const dialog = showDialog(
    'newOrderDialog',
    '<div class="section-title"><h2>' +
      (forStock ? 'Fabricar para stock' : 'Pedido de cliente') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="newOrderForm" class="grid"><b>' +
      esc(p.name) +
      '</b>' +
      (forStock
        ? '<p class="small muted">Las unidades se suman al stock del producto cuando el pedido pasa a «Listo». Los materiales se reservan ahora y se descuentan al terminar.</p>'
        : fieldHtml(
            'Cliente / referencia',
            'orderCustomer',
            '',
            'text',
            'list="customerList" autocomplete="off"'
          ) + customerOptions()) +
      '<div class="grid grid-2">' +
      fieldHtml('Cantidad', 'orderQty', forStock ? 1 : t.qty, 'number', 'min="1" step="1" required') +
      (forStock
        ? ''
        : fieldHtml(
            'Precio final por unidad',
            'orderPrice',
            t.rounded,
            'number',
            'min="0" step="1" required'
          )) +
      fieldHtml(forStock ? 'Fecha objetivo' : 'Fecha de entrega', 'orderDue', '', 'date') +
      '</div>' +
      (forStock
        ? '<label class="check-row"><input type="checkbox" id="orderAlreadyMade"> <span><b>Ya está fabricado</b><span class="small muted">Descuenta el filamento y suma las unidades al stock ahora.</span></span></label>'
        : stock.available > 0
          ? '<label class="check-row"><input type="checkbox" id="orderFromStock"> <span><b>Entregar desde stock</b><span class="small muted">' +
            stock.available +
            (stock.available === 1 ? ' unidad disponible' : ' unidades disponibles') +
            '. No reserva materiales: descuenta unidades terminadas al entregar.</span></span></label>'
          : '') +
      (forStock ? '' : depositField()) +
      '<details class="print-advanced"><summary>Revisar estimación del lote</summary><p class="small muted">Se ajusta proporcionalmente al cambiar la cantidad. Verifica tiempos y costos si imprimes varias piezas en una misma cama.</p><div class="grid grid-2">' +
      fieldHtml(
        'Costo estimado del lote',
        'orderEstimate',
        forStock ? Math.round(t.total / t.qty) : t.total,
        'number',
        'min="0" step="0.01" required'
      ) +
      fieldHtml(
        'Gramos estimados',
        'orderGrams',
        forStock ? Math.round((grams / t.qty) * 100) / 100 : grams,
        'number',
        'min="0" step="0.01"'
      ) +
      fieldHtml(
        'Horas estimadas',
        'orderHours',
        forStock ? Math.round((minutes / 60 / t.qty) * 100) / 100 : minutes / 60,
        'number',
        'min="0" step="0.01"'
      ) +
      '</div></details><div class="field"><label for="orderNotes">Notas de producción</label><textarea id="orderNotes"></textarea></div><p class="small muted">Se guardará una copia del precio y la estimación. Cambiar el producto después no altera este pedido.</p><div class="small" id="orderFeedback" role="status"></div><button class="btn btn-primary" type="submit">' +
      (forStock ? 'Confirmar fabricación' : 'Confirmar pedido') +
      '</button></form>'
  );
  const fromStock = () => !!q('#orderFromStock')?.checked;
  q('#orderQty').oninput = () => {
    const ratio = Math.max(1, n(q('#orderQty').value)) / t.qty;
    q('#orderEstimate').value = Math.round(t.total * ratio);
    q('#orderGrams').value = Math.round(grams * ratio * 100) / 100;
    q('#orderHours').value = Math.round((minutes / 60) * ratio * 100) / 100;
    updateNewOrderStock();
  };
  mountNewOrderInventory();
  q('#orderFromStock')?.addEventListener('change', () => {
    q('#newOrderStock').closest('.notice').hidden = fromStock();
    q('#orderQty').max = fromStock() ? stock.available : '';
  });
  q('#newOrderForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    const qty = Math.max(1, Math.floor(n(q('#orderQty').value))),
      made = forStock && q('#orderAlreadyMade').checked;
    try {
      const customer_id = forStock ? null : await ensureCustomer(q('#orderCustomer').value);
      const { data, error } = await supabase
        .from('production_orders')
        .insert({
          workspace_id: S.workspace.id,
          product_id: p.id,
          title: p.name,
          ...(customer_id ? { customer_id } : {}),
          kind,
          from_stock: fromStock(),
          customer_name: forStock ? '' : q('#orderCustomer').value.trim(),
          quantity: qty,
          unit_price: forStock ? 0 : n(q('#orderPrice').value),
          iva_enabled: p.iva_enabled,
          iva_rate: p.iva_rate,
          estimated_cost: n(q('#orderEstimate').value),
          estimated_grams: fromStock() ? 0 : n(q('#orderGrams').value),
          estimated_minutes: fromStock() ? 0 : n(q('#orderHours').value) * 60,
          due_date: q('#orderDue').value || null,
          notes: q('#orderNotes').value.trim()
        })
        .select()
        .single();
      if (error) throw error;
      if (!forStock) await saveDeposit(data);
      if (made) {
        const { error: readyError } = await supabase
          .from('production_orders')
          .update({ status: 'ready' })
          .eq('id', data.id);
        if (readyError) throw readyError;
        await addOrderPrinterHours({ ...data, status: 'ready' });
      }
      dialog.close();
      await Promise.all([loadResources(), refreshProductStock(p.id)]);
      S.orderFilter = made ? 'all' : 'open';
      await goMode('production');
      S.msg = made
        ? qty +
          (qty === 1 ? ' unidad sumada' : ' unidades sumadas') +
          ' al stock de ' +
          p.name +
          '. Filamento descontado.'
        : forStock
          ? 'Fabricación creada. Al marcarla «Lista» se suma al stock.'
          : 'Pedido creado.';
      render();
    } catch (error) {
      q('#orderFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  return dialog;
}
function showOrder(order) {
  const t = orderNumbers(order);
  const dialog = showDialog(
    'orderDialog',
    '<div class="section-title"><h2>Pedido PED-' +
      order.order_no +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><div class="order-head"><div><b>' +
      esc(order.title) +
      '</b>' +
      orderChip(order) +
      '</div>' +
      (order.kind === 'stock'
        ? '<span class="chip c-stock">Fabricación para stock</span>'
        : '<button class="btn btn-secondary btn-sm" id="orderQuote" type="button">' +
          icon('file-text') +
          'Cotización</button>') +
      '</div><dl class="facts"><div><dt>Cliente</dt><dd>' +
      esc(orderCustomer(order)) +
      '</dd></div><div><dt>Cantidad</dt><dd>' +
      order.quantity +
      ' un.</dd></div><div><dt>Entrega</dt><dd class="' +
      (orderIsLate(order) ? 'down' : '') +
      '">' +
      shortDate(order.due_date) +
      '</dd></div>' +
      (order.kind === 'stock'
        ? '<div><dt>Costo estimado</dt><dd>' +
          clp(order.estimated_cost) +
          '</dd></div><div><dt>Costo por unidad</dt><dd>' +
          clp(n(order.estimated_cost) / Math.max(1, n(order.quantity))) +
          '</dd></div><div><dt>Stock</dt><dd>' +
          (order.stock_state === 'added' ? 'Sumado' : 'Al quedar listo') +
          '</dd></div>'
        : '<div><dt>Venta</dt><dd>' +
          clp(t.sales) +
          '</dd></div><div><dt>Costo estimado</dt><dd>' +
          clp(order.estimated_cost) +
          '</dd></div><div><dt>Utilidad estimada</dt><dd class="' +
          (t.estimatedProfit < 0 ? 'down' : 'up') +
          '">' +
          clp(t.estimatedProfit) +
          '</dd></div>') +
      '</dl>' +
      (order.from_stock
        ? '<p class="notice small">Se entrega desde el stock de producto terminado: al marcarlo «Listo» o «Entregado» se descuentan ' +
          order.quantity +
          ' un. del stock; no consume materiales.</p>'
        : '') +
      (!order.product_id && order.kind !== 'stock'
        ? '<div class="notice small job-notice"><span><b>Trabajo a medida, sin producto.</b> Vincúlalo a un producto costeado para reservar y descontar su filamento e insumos, o registra abajo sus costos reales.</span>' +
          (canEdit()
            ? '<span class="job-actions"><button type="button" class="btn btn-secondary btn-sm" id="jobLink">' +
              icon('layers') +
              'Vincular producto</button><button type="button" class="btn btn-ghost btn-sm" id="jobToProduct">' +
              icon('plus') +
              'Crear producto</button></span>'
            : '') +
          '</div>'
        : '') +
      '</div><form id="orderForm" class="grid"><div class="field"><label for="orderStatus">Estado</label><select id="orderStatus">' +
      Object.entries(ORDER_STATUSES)
        .map(([key, label]) => '<option value="' + key + '">' + label + '</option>')
        .join('') +
      '</select></div>' +
      fieldHtml('Entrega', 'actualDue', order.due_date, 'date') +
      '<h3 class="form-section">Costos reales del lote</h3><p class="small muted">Déjalos vacíos mientras estén pendientes. Las fallas se suman aparte.</p><div class="grid grid-2">' +
      fieldHtml(
        'Costo real base del lote CLP',
        'actualCost',
        order.actual_cost,
        'number',
        'min="0" step="0.01"'
      ) +
      fieldHtml(
        'Costo adicional por fallas CLP',
        'failuresCost',
        order.failures_cost,
        'number',
        'min="0" step="0.01"'
      ) +
      fieldHtml('Gramos reales totales', 'actualGrams', order.actual_grams, 'number', 'min="0" step="0.01"') +
      fieldHtml(
        'Horas reales',
        'actualHours',
        order.actual_minutes == null ? '' : n(order.actual_minutes) / 60,
        'number',
        'min="0" step="0.01"'
      ) +
      '</div><div id="actualResult" class="notice small" role="status"></div><div class="field"><label for="actualNotes">Notas</label><textarea id="actualNotes">' +
      esc(order.notes) +
      '</textarea></div><div id="actualFeedback" class="small" role="status"></div>' +
      (canEdit()
        ? '<div class="dialog-actions"><button class="btn btn-ghost" type="button" id="orderFailure">' +
          icon('triangle-alert') +
          'Registrar falla</button><button class="btn btn-primary" type="submit">Guardar avance</button></div>'
        : '') +
      '</form>'
  );
  if (canEdit() && order.kind !== 'stock') {
    const filesButton = document.createElement('button');
    filesButton.type = 'button';
    filesButton.id = 'orderFiles';
    filesButton.className = 'btn btn-secondary btn-sm';
    filesButton.innerHTML = icon('image') + 'Pedir fotos';
    filesButton.title = 'Pedir fotos al cliente';
    filesButton.onclick = () => showNewFileRequest(order);
    const quote = q('#orderQuote'),
      actions = document.createElement('div');
    actions.className = 'order-head-actions';
    quote.replaceWith(actions);
    const trackButton = document.createElement('button');
    trackButton.type = 'button';
    trackButton.id = 'orderTracking';
    trackButton.className = 'btn btn-secondary btn-sm';
    trackButton.innerHTML = icon('link') + 'Seguimiento';
    trackButton.title = 'Enlace para que el cliente vea el avance';
    trackButton.onclick = () => {
      dialog.close();
      showTracking(order);
    };
    actions.append(filesButton, trackButton, quote);
  }
  if (q('#orderQuote'))
    q('#orderQuote').onclick = () =>
      showQuote({
        folio: 'PED-' + order.order_no,
        client: order.customer_name || '',
        name: order.title,
        description: '',
        photo: photoSrc(S.products.find(p => p.id === order.product_id)),
        quantity: order.quantity,
        price: n(order.unit_price),
        ivaEnabled: order.iva_enabled,
        ivaRate: n(order.iva_rate),
        ...(order.due_date
          ? { delivery: 'Entrega estimada: ' + order.due_date.split('-').reverse().join('/') }
          : {})
      });
  q('#orderStatus').value = order.status;
  const getActual = () => ({
    actual_cost: q('#actualCost').value === '' ? null : n(q('#actualCost').value),
    failures_cost: n(q('#failuresCost').value),
    actual_grams: q('#actualGrams').value === '' ? null : n(q('#actualGrams').value),
    actual_minutes: q('#actualHours').value === '' ? null : n(q('#actualHours').value) * 60
  });
  const refreshActual = () => {
    const result = orderNumbers({ ...order, ...getActual() });
    q('#actualResult').textContent =
      result.actualCost == null
        ? 'Completa el costo real base para calcular la utilidad.'
        : 'Costo real total: ' +
          clp(result.actualCost) +
          ' · Desviación de costo: ' +
          clp(result.variance) +
          ' · Utilidad real: ' +
          clp(result.actualProfit);
  };
  refreshActual();
  mountOrderInventory(order);
  mountOrderPayments(order, dialog);
  mountOrderPhotos(order, dialog);
  q('#orderFailure')?.addEventListener('click', () => {
    dialog.close();
    showFailure(order);
  });
  q('#jobToProduct')?.addEventListener('click', () => {
    dialog.close();
    productFromJob(order);
  });
  q('#jobLink')?.addEventListener('click', () => {
    dialog.close();
    showLinkProduct(order);
  });
  if (!canEdit()) {
    dialog.querySelectorAll('form input,form select,form textarea').forEach(el => (el.disabled = true));
    return;
  }
  dialog.querySelectorAll('input').forEach(el => (el.oninput = refreshActual));
  q('#orderForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const { error } = await supabase
        .from('production_orders')
        .update({
          ...getActual(),
          status: q('#orderStatus').value,
          due_date: q('#actualDue').value || null,
          notes: q('#actualNotes').value.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)
        .eq('workspace_id', S.workspace.id)
        .select()
        .single();
      if (error) throw error;
      // Finishing the order adds its print time to the printers' usage counters.
      if (!isFinished(order.status) && isFinished(q('#orderStatus').value)) await addOrderPrinterHours(order);
      await loadOrders();
      await loadResources();
      dialog.close();
      render();
    } catch (error) {
      q('#actualFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
function bindV12() {
  q('#quote').onclick = showQuote;
  if (!canEdit()) return;
  q('#photoFile').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    S.photoBusy = true;
    q('#save').disabled = true;
    try {
      const data = await optimizePhoto(file);
      collect();
      S.product.photo_data = data;
      S.dirty = true;
      render();
    } catch (error) {
      S.err = error.message;
      render();
    } finally {
      S.photoBusy = false;
      if (q('#save')) q('#save').disabled = false;
    }
  };
  q('#removePhoto').onclick = () => {
    collect();
    S.product.photo_data = null;
    S.product.photo_path = null;
    S.dirty = true;
    render();
  };
  qa('.dupP').forEach(
    (b, i) =>
      (b.onclick = () => {
        collect();
        S.product.prints.splice(i + 1, 0, structuredClone(S.product.prints[i]));
        S.dirty = true;
        render();
      })
  );
  qa('.addF').forEach(
    b =>
      (b.onclick = () => {
        collect();
        const i = qa('.print-card').indexOf(b.closest('.print-card')),
          p = S.product.prints[i];
        p.filaments ??= [];
        if (p.filaments.length >= 7) return;
        const first = !p.filaments.length;
        p.filaments.push({
          name: first ? 'Filamento 1' : 'Filamento ' + (p.filaments.length + 1),
          color: '#303030',
          grams: first ? n(p.grams) : 0,
          purge_grams: 0,
          price_per_kg:
            first && n(p.grams) > 0 && n(p.filament_cost) > 0
              ? Math.round((n(p.filament_cost) * 1000) / n(p.grams))
              : n(S.settings.filament_price_per_kg)
        });
        const total = filamentTotals(p.filaments);
        p.grams = total.grams;
        p.filament_cost = Math.round(total.cost);
        S.dirty = true;
        render();
        const rows = qa('.print-card')[i]?.querySelectorAll('.filament-row');
        if (rows?.length && activeResources('filament').length) showFilamentPicker(rows[rows.length - 1]);
      })
  );
  qa('.rmF').forEach(
    b =>
      (b.onclick = () => {
        const card = b.closest('.print-card'),
          i = qa('.print-card').indexOf(card),
          j = [...card.querySelectorAll('.filament-row')].indexOf(b.closest('.filament-row'));
        collect();
        const p = S.product.prints[i];
        p.filaments.splice(j, 1);
        const f = filamentTotals(p.filaments);
        p.grams = f.grams;
        p.filament_cost = Math.round(f.cost);
        S.dirty = true;
        render();
      })
  );
}
async function optimizePhoto(file) {
  if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name))
    throw Error('Selecciona una imagen.');
  if (file.size > 20 * 1024 * 1024) throw Error('La foto supera 20 MB. Usa una imagen más pequeña.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const x = new Image();
      x.onload = () => resolve(x);
      x.onerror = () => reject(Error('No se pudo abrir la foto. Usa JPEG, PNG o WebP.'));
      x.src = url;
    });
    const canvas = document.createElement('canvas'),
      scale = Math.min(1, 800 / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (validPhoto(data)) return data;
    }
    throw Error('No se pudo optimizar la foto. Prueba una imagen más simple.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
