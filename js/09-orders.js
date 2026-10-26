'use strict';
// Pedidos: lista, ficha, creación rápida, vínculo con productos, costos, revisión contra el producto, fotos y ventas desde stock.
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
          ) +
          customerOptions() +
          fieldHtml(
            'WhatsApp del cliente (opcional)',
            'orderPhone',
            '',
            'tel',
            'maxlength="30" inputmode="tel" autocomplete="off" placeholder="+56 9 1234 5678"'
          )) +
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
  bindCustomerPhone('#orderCustomer', '#orderPhone');
  q('#newOrderForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    const qty = Math.max(1, Math.floor(n(q('#orderQty').value))),
      made = forStock && q('#orderAlreadyMade').checked;
    try {
      const customer_id = forStock
        ? null
        : await ensureCustomer(q('#orderCustomer').value, q('#orderPhone')?.value);
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
      S.orderFilter = forStock ? 'stock' : 'open';
      if (made) {
        S.showArchived = false;
        S.showStock = true;
      }
      await goMode(made ? 'dashboard' : 'production');
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
      offerStockCount(error, () => q('#newOrderForm')?.requestSubmit());
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
      // Real costs are optional: folded unless already filled, so the dialog stays short.
      '<details class="real-costs"' +
      (order.actual_cost != null || n(order.failures_cost) > 0 ? ' open' : '') +
      '><summary>Costos reales (opcional)</summary><p class="small muted">Déjalos vacíos mientras estén pendientes. Las fallas se suman aparte.</p><div class="grid grid-2">' +
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
      '</div><div id="actualResult" class="notice small" role="status"></div></details><div class="field"><label for="actualNotes">Notas</label><textarea id="actualNotes">' +
      esc(order.notes) +
      '</textarea></div><div id="actualFeedback" class="small" role="status"></div>' +
      (canEdit()
        ? '<div class="dialog-actions"><button class="btn btn-ghost danger-text" type="button" id="orderDelete">' +
          icon('trash-2') +
          'Eliminar</button><button class="btn btn-ghost" type="button" id="orderFailure">' +
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
  mountCustomerNotify(order, dialog);
  mountOrderCostNotice(order, dialog);
  mountOrderPhotos(order, dialog);
  q('#orderFailure')?.addEventListener('click', () => {
    dialog.close();
    showFailure(order);
  });
  q('#orderDelete')?.addEventListener('click', () => {
    dialog.close();
    deleteOrder(order);
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
      const newStatus = q('#orderStatus').value;
      if (!isFinished(order.status) && isFinished(newStatus)) await addOrderPrinterHours(order);
      await loadOrders();
      await loadResources();
      dialog.close();
      render();
      // A new state is news for the customer: offer the WhatsApp message.
      if (newStatus !== order.status)
        offerStatusMessage(S.orders.find(o => o.id === order.id) || { ...order, status: newStatus });
    } catch (error) {
      q('#actualFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
// V3.7: remove an order. Reserved materials or units are released first by cancelling it,
// so inventory never keeps a reservation for an order that no longer exists.
async function deleteOrder(order) {
  if (!canEdit()) return;
  const reserved = order.inventory_state === 'reserved' || order.stock_state === 'reserved',
    paid = orderPayments(order).reduce((s, p) => s + n(p.amount), 0),
    product = S.products.find(p => p.id === order.product_id);
  const ok = await confirmDialog({
    title: 'Eliminar PED-' + order.order_no,
    body:
      '«' +
      order.title +
      '» se eliminará para todo el equipo.' +
      (order.kind === 'stock' && order.stock_state === 'added'
        ? ' Las unidades que ya sumó al stock' + (product ? ' de ' + product.name : '') + ' se mantienen.'
        : '') +
      (reserved ? ' Primero se cancela para devolver al stock lo que tenía reservado.' : '') +
      (paid > 0 ? ' También se borran sus pagos registrados (' + clp(paid) + ').' : '') +
      ' Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar',
    danger: true
  });
  if (!ok) return;
  try {
    if (reserved) {
      const { error } = await supabase
        .from('production_orders')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (error) throw error;
    }
    const { data, error } = await supabase.from('production_orders').delete().eq('id', order.id).select('id');
    if (error) throw error;
    if (!data?.length) throw Error('No se pudo eliminar: el pedido todavía tiene materiales reservados.');
    await Promise.all([
      loadOrders(),
      loadResources(),
      order.product_id ? refreshProductStock(order.product_id) : null
    ]);
    toast('PED-' + order.order_no + ' eliminado.');
    render();
  } catch (error) {
    toast(error.message, 'error');
    logError('handled', 'Eliminar pedido: ' + error.message);
  }
}
// ---------------------------------------------------------------------------
// V2.5: quick quotes and orders for custom jobs that aren't a product yet.
// The agreed price comes first; costs are broken down later on the order.
// ---------------------------------------------------------------------------
function showCreateMenu() {
  if (!canEdit()) return;
  const dialog = showDialog(
    'createMenu',
    '<div class="section-title"><h2>Crear</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><div class="create-options">' +
      [
        [
          'quote',
          'file-text',
          'Cotización',
          'Precio para un cliente, aunque el trabajo aún no esté en el catálogo.'
        ],
        [
          'order',
          'clipboard-list',
          'Pedido de cliente',
          'Trabajo personalizado con precio cerrado y abono. Los costos se desglosan después.'
        ],
        [
          'stock',
          'boxes',
          'Fabricar para stock',
          'Piezas de un producto del catálogo para tener listas. Descuenta el filamento.'
        ],
        [
          'product',
          'package',
          'Producto',
          'Costeo completo para el catálogo: impresiones, materiales y margen.'
        ]
      ]
        .map(
          ([k, ic, t, d]) =>
            '<button type="button" class="create-option" data-create="' +
            k +
            '">' +
            icon(ic) +
            '<span><b>' +
            t +
            '</b><span>' +
            d +
            '</span></span>' +
            icon('chevron-right') +
            '</button>'
        )
        .join('') +
      '</div>'
  );
  dialog.classList.add('sheet');
  const go = {
    quote: () => showQuickJob('quote'),
    order: () => showQuickJob('order'),
    stock: () => showStockProductPicker(),
    product: () => newProduct()
  };
  dialog.querySelectorAll('[data-create]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        go[b.dataset.create]();
      })
  );
  return dialog;
}
// kind 'quote' or 'order'. Optional prefill from a customer.
function showQuickJob(kind, prefill = {}) {
  if (!canEdit()) return;
  const isOrder = kind === 'order',
    ivaRate = 0.19;
  const dialog = showDialog(
    'quickJobDialog',
    '<div class="section-title"><h2>' +
      (isOrder ? 'Nuevo pedido' : 'Nueva cotización') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="quickJobForm" class="grid">' +
      fieldHtml(
        'Cliente',
        'qjClient',
        prefill.client || '',
        'text',
        'maxlength="120" list="customerList" autocomplete="off" placeholder="Nombre o empresa"' +
          (isOrder ? ' required' : '')
      ) +
      customerOptions() +
      fieldHtml(
        'WhatsApp del cliente (opcional)',
        'qjPhone',
        prefill.phone || '',
        'tel',
        'maxlength="30" inputmode="tel" autocomplete="off" placeholder="+56 9 1234 5678"'
      ) +
      priceListPicker() +
      fieldHtml(
        'Trabajo',
        'qjTitle',
        prefill.title || '',
        'text',
        'required maxlength="200" placeholder="Ej. Cuadro 3D personalizado mascota"'
      ) +
      '<div class="field"><label for="qjDetail">' +
      (isOrder ? 'Detalle para producción' : 'Descripción para el cliente') +
      ' (opcional)</label><textarea id="qjDetail" maxlength="1500" placeholder="Medidas, colores, fotos de referencia…"></textarea></div><div class="grid grid-2">' +
      fieldHtml('Cantidad', 'qjQty', 1, 'number', 'min="1" max="100000" step="1" required') +
      fieldHtml(
        'Precio final por unidad',
        'qjPrice',
        '',
        'number',
        'min="0" step="1" required placeholder="Lo acordado con el cliente"'
      ) +
      '</div><label class="check-row"><input type="checkbox" id="qjIva" checked> <span><b>El precio incluye IVA (19%)</b><span class="small muted">Desmárcalo si cobras sin boleta/factura.</span></span></label>' +
      (isOrder
        ? '<div class="grid grid-2">' +
          fieldHtml('Fecha de entrega', 'qjDue', '', 'date') +
          '<div class="field"><label for="qjDeposit">Abono recibido</label><div class="input-with-btn"><input id="qjDeposit" type="number" min="0" step="1" placeholder="0"><button type="button" class="btn btn-secondary btn-sm" id="qjHalf">50%</button></div></div></div><div class="field"><label for="qjMethod">Medio del abono</label><select id="qjMethod">' +
          Object.entries(PAY_METHODS)
            .map(([k, v]) => '<option value="' + k + '">' + v + '</option>')
            .join('') +
          '</select></div>' +
          partnerField('qjReceiver', 'Lo recibió')
        : fieldHtml(
            'Plazo de entrega (opcional)',
            'qjDelivery',
            S.settings.quote_delivery || '',
            'text',
            'maxlength="200" placeholder="Ej. 5 a 7 días hábiles"'
          )) +
      '<div id="qjTotal" class="notice small" role="status"></div><p class="small muted">' +
      (isOrder
        ? 'Queda como trabajo a medida: no reserva materiales. Después registra sus costos reales en el pedido o crea el producto para el catálogo.'
        : 'Se guarda con folio y se abre para compartir por WhatsApp o PDF. Si la aceptan, crea el pedido desde Cotizaciones.') +
      '</p><div id="qjFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">' +
      (isOrder ? 'Crear pedido' : 'Crear y compartir cotización') +
      '</button></form>'
  );
  const read = () => {
    const qty = Math.max(1, Math.floor(n(q('#qjQty').value))),
      price = Math.max(0, Math.round(n(q('#qjPrice').value))),
      iva = q('#qjIva').checked;
    return { qty, price, iva, total: qty * price };
  };
  const preview = () => {
    const v = read();
    q('#qjTotal').innerHTML =
      'Total: <b>' +
      clp(v.total) +
      '</b>' +
      (v.iva && v.total ? ' (neto ' + clp(Math.round(v.total / (1 + ivaRate))) + ' + IVA)' : '') +
      (isOrder && v.total ? ' · 50% = ' + clp(Math.round(v.total / 2)) : '');
  };
  dialog.querySelectorAll('input').forEach(el => el.addEventListener('input', preview));
  q('#qjIva').onchange = preview;
  mountPriceListPicker(preview);
  bindCustomerPhone('#qjClient', '#qjPhone');
  q('#qjHalf')?.addEventListener('click', () => {
    q('#qjDeposit').value = Math.round(read().total / 2);
  });
  preview();
  q('#quickJobForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    const v = read(),
      client = q('#qjClient').value.trim(),
      title = q('#qjTitle').value.trim(),
      detail = q('#qjDetail').value.trim();
    try {
      const customer_id = await ensureCustomer(client, q('#qjPhone').value);
      if (isOrder) {
        const deposit = Math.round(n(q('#qjDeposit').value));
        if (deposit > v.total) throw new Error('El abono no puede superar el total del pedido.');
        const { data: order, error } = await supabase
          .from('production_orders')
          .insert({
            workspace_id: S.workspace.id,
            product_id: null,
            ...(customer_id ? { customer_id } : {}),
            title,
            kind: 'customer',
            from_stock: false,
            customer_name: client,
            quantity: v.qty,
            unit_price: v.price,
            iva_enabled: v.iva,
            iva_rate: ivaRate,
            estimated_cost: 0,
            estimated_grams: 0,
            estimated_minutes: 0,
            due_date: q('#qjDue').value || null,
            notes: detail
          })
          .select()
          .single();
        if (error) throw error;
        if (deposit > 0)
          await addPayment(
            order,
            deposit,
            q('#qjMethod').value,
            null,
            'Abono inicial',
            rememberPartner(q('#qjReceiver')?.value)
          );
        dialog.close();
        S.orderFilter = 'open';
        await goMode('production');
        S.msg =
          'Pedido PED-' +
          order.order_no +
          ' creado' +
          (deposit > 0 ? ' con abono de ' + clp(deposit) : '') +
          '.';
        render();
        const fresh = S.orders.find(o => o.id === order.id);
        if (fresh) showOrder(fresh);
      } else {
        const defaults = quoteDefaults();
        const { data: quote, error } = await supabase
          .from('quotes')
          .insert({
            workspace_id: S.workspace.id,
            customer_id,
            client_name: client,
            product_id: null,
            title,
            description: detail,
            quantity: v.qty,
            unit_price: v.price,
            iva_enabled: v.iva,
            iva_rate: ivaRate,
            unit_cost: 0,
            validity_days: defaults.validityDays,
            delivery: q('#qjDelivery').value.trim(),
            terms: defaults.terms,
            contact: defaults.contact
          })
          .select()
          .single();
        if (error) throw error;
        S.quotes = [quote, ...(S.quotes || []).filter(x => x.id !== quote.id)];
        dialog.close();
        S.quoteFilter = 'open';
        await goMode('quotes');
        showQuote(savedQuoteData(quote));
      }
    } catch (error) {
      q('#qjFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  return dialog;
}
// Stock fabrication needs a costed product: pick it, open it and start the fabrication dialog.
function showStockProductPicker() {
  const list = S.products
    .filter(p => p.status !== 'archived')
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!list.length) return toast('Primero crea y costea el producto que vas a fabricar.', 'error');
  const dialog = showDialog(
    'stockPicker',
    '<div class="section-title"><h2>Fabricar para stock</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><p class="small muted">Elige el producto. Si ya está hecho, marca «Ya está fabricado» y se descuenta el filamento al instante.</p>' +
      searchBox('stockPickSearch', 'Buscar producto', '') +
      '<div class="stock-pick-list" id="stockPickList"></div><button type="button" class="btn btn-ghost" id="stockPickNew">' +
      icon('plus') +
      'Es un producto nuevo: costearlo primero</button>'
  );
  const draw = () => {
    const term = q('#stockPickSearch').value;
    q('#stockPickList').innerHTML =
      list
        .filter(p => searchMatches(p.name, term))
        .map(
          p =>
            '<button type="button" class="list-row" data-stock-pick="' +
            p.id +
            '">' +
            productThumb(p) +
            '<span class="lr-main"><b>' +
            esc(p.name) +
            '</b><span>Costo ' +
            clp(productNumbers(p).unit) +
            ' · En stock ' +
            productStock(p).available +
            '</span></span>' +
            icon('chevron-right') +
            '</button>'
        )
        .join('') || '<p class="small muted">Sin coincidencias.</p>';
    qa('[data-stock-pick]').forEach(
      b =>
        (b.onclick = async () => {
          dialog.close();
          await openProduct(b.dataset.stockPick);
          if (S.mode !== 'product' || S.product?.id !== b.dataset.stockPick) return;
          S.editorTab = 'summary';
          render();
          showNewOrder('stock');
        })
    );
  };
  q('#stockPickSearch').oninput = draw;
  q('#stockPickNew').onclick = () => {
    dialog.close();
    newProduct();
  };
  draw();
  return dialog;
}
// Links a costed product to a custom-job order: reserves its materials (or consumes them if finished).
async function linkOrderProduct(order, product) {
  const { data, error } = await supabase.rpc('link_order_product', {
    p_order: order.id,
    p_product: product.id
  });
  if (error) throw error;
  await Promise.all([loadOrders(), loadResources()]);
  const r = data || {};
  return (
    'PED-' +
    order.order_no +
    ' vinculado a ' +
    product.name +
    '. ' +
    (!r.lines
      ? 'El producto no tiene materiales del inventario vinculados.'
      : r.consumed
        ? 'Como ya estaba listo, se descontaron sus materiales.'
        : 'Materiales reservados; se descuentan al marcarlo «Listo».')
  );
}
function showLinkProduct(order) {
  if (!canEdit()) return;
  const list = S.products
    .filter(p => p.status !== 'archived')
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const dialog = showDialog(
    'linkProductDialog',
    '<div class="section-title"><h2>Vincular producto</h2><button class="btn btn-ghost" data-close>Volver</button></div><p class="small muted">PED-' +
      order.order_no +
      ' · ' +
      esc(order.title) +
      ' · ' +
      order.quantity +
      ' un. El precio acordado no cambia; se usa el costo del producto y se reservan sus materiales.</p>' +
      searchBox('linkSearch', 'Buscar producto', '') +
      '<div class="stock-pick-list" id="linkList"></div><div id="linkFeedback" class="small" role="status"></div><button type="button" class="btn btn-ghost" id="linkNew">' +
      icon('plus') +
      'Crear el producto desde este trabajo</button>'
  );
  const draw = () => {
    const term = q('#linkSearch').value;
    q('#linkList').innerHTML =
      list
        .filter(p => searchMatches(p.name, term))
        .map(
          p =>
            '<button type="button" class="list-row" data-link-product="' +
            p.id +
            '">' +
            productThumb(p) +
            '<span class="lr-main"><b>' +
            esc(p.name) +
            '</b><span>Costo ' +
            clp(productNumbers(p).unit) +
            ' / un. · ' +
            clp(productNumbers(p).unit * order.quantity) +
            ' el pedido</span></span>' +
            icon('chevron-right') +
            '</button>'
        )
        .join('') || '<p class="small muted">Sin productos. Crea uno desde este trabajo.</p>';
    qa('[data-link-product]').forEach(
      b =>
        (b.onclick = async () => {
          const product = list.find(p => p.id === b.dataset.linkProduct);
          qa('[data-link-product]').forEach(x => (x.disabled = true));
          try {
            const msg = await linkOrderProduct(order, product);
            dialog.close();
            S.msg = msg;
            render();
            const fresh = S.orders.find(o => o.id === order.id);
            if (fresh) showOrder(fresh);
          } catch (error) {
            qa('[data-link-product]').forEach(x => (x.disabled = false));
            if (await offerStockCount(error, () => b.click())) return dialog.close();
            q('#linkFeedback').textContent = error.message;
          }
        })
    );
  };
  q('#linkSearch').oninput = draw;
  q('#linkNew').onclick = () => {
    dialog.close();
    productFromJob(order);
  };
  draw();
  return dialog;
}
async function offerPendingLink(productId) {
  const orderId = S.pendingLink;
  S.pendingLink = null;
  let order = S.orders.find(o => o.id === orderId);
  if (!order) {
    try {
      await loadOrders();
    } catch {}
    order = S.orders.find(o => o.id === orderId);
  }
  if (!order || order.product_id || !S.product || S.product.id !== productId) return;
  const ok = await confirmDialog({
    title: 'Vincular al pedido PED-' + order.order_no,
    body:
      '¿Usar «' +
      S.product.name +
      '» en el pedido de ' +
      (order.customer_name || 'cliente') +
      '? Se reservan sus materiales (o se descuentan si ya está listo).',
    confirmLabel: 'Vincular'
  });
  if (!ok) return;
  try {
    await loadProducts();
    const product = S.products.find(p => p.id === productId) || S.product;
    toast(await linkOrderProduct(order, product));
  } catch (error) {
    const retry = async () => {
      try {
        toast(await linkOrderProduct(order, product));
        S.err = '';
      } catch (again) {
        toast(again.message, 'error');
      }
    };
    if (!(await offerStockCount(error, retry))) toast(error.message, 'error');
  }
}
// A custom job (order without product) can become a catalogue product to cost it.
function productFromJob(order) {
  newProduct();
  S.pendingLink = order.id;
  S.product.name = order.title;
  S.product.description = order.notes || '';
  S.product.quantity = 1;
  S.product.iva_enabled = order.iva_enabled;
  S.product.sale_price = Math.round(n(order.unit_price));
  S.editorTab = 'prints';
  S.msg =
    'Producto creado desde PED-' + order.order_no + ' con su precio acordado. Agrega impresiones y costos.';
  render();
}
const ORDER_CHIP = {
  pending: 'c-pend',
  printing: 'c-print',
  assembly: 'c-asm',
  ready: 'c-ready',
  delivered: 'c-done',
  canceled: 'c-cancel'
};
// A fabrication for stock is done once it is «Listo»: its units are already in the product's stock.
function orderIsOpen(o) {
  if (o.kind === 'stock') return !['ready', 'delivered', 'canceled'].includes(o.status);
  return !['delivered', 'canceled'].includes(o.status);
}
function orderIsLate(o) {
  return orderIsOpen(o) && o.due_date && o.due_date < localToday();
}
function orderChip(o) {
  const late = orderIsLate(o);
  return (
    '<span class="chip ' +
    (late ? 'c-late' : ORDER_CHIP[o.status] || '') +
    '"><i></i>' +
    (late ? 'Atrasado' : ORDER_STATUSES[o.status] || o.status) +
    '</span>'
  );
}
// Finished fabrications for stock only show under «Fabricación»: they are stock, not orders.
function orderMatches(o, filter) {
  if (filter === 'stock') return o.kind === 'stock';
  if (filter === 'open') return orderIsOpen(o);
  if (filter === 'late') return orderIsLate(o);
  if (o.kind === 'stock' && !orderIsOpen(o)) return false;
  if (filter === 'all') return true;
  if (filter === 'unpaid') return orderBalance(o).due > 0;
  return o.status === filter;
}
function orderCustomer(o) {
  if (o.kind === 'stock') return 'Para stock';
  return (o.customer_name || 'Sin cliente') + (o.from_stock ? ' · desde stock' : '');
}
function orderProfitCell(o) {
  if (o.kind === 'stock') return '<span class="muted">—</span>';
  const t = orderNumbers(o),
    real = t.actualProfit != null,
    v = real ? t.actualProfit : t.estimatedProfit;
  return (
    '<span class="' +
    (v < 0 ? 'down' : '') +
    '">' +
    clp(v) +
    '</span><div class="sub">' +
    (real ? 'real' : 'estimada') +
    '</div>'
  );
}
function productionView() {
  const term = (S.orderSearch || '').toLocaleLowerCase('es'),
    filter = S.orderFilter || 'open',
    count = f => S.orders.filter(o => orderMatches(o, f)).length,
    list = S.orders
      .filter(o => orderMatches(o, filter))
      .filter(o =>
        (o.title + ' ' + (o.customer_name || '') + ' PED-' + o.order_no)
          .toLocaleLowerCase('es')
          .includes(term)
      )
      .sort((a, b) =>
        orderIsOpen(a) && orderIsOpen(b)
          ? String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))
          : String(b.created_at || '').localeCompare(String(a.created_at || ''))
      );
  const pills = [
    ['open', 'En curso', count('open')],
    ['late', 'Atrasados', count('late')],
    ['unpaid', 'Por cobrar', count('unpaid')],
    ['stock', 'Fabricación', count('stock')],
    ...Object.entries(ORDER_STATUSES).map(([k, label]) => [k, label, count(k)]),
    ['all', 'Todos', count('all')]
  ].filter(([k, , c]) => c > 0 || ['open', 'all', filter].includes(k));
  const due = o =>
    '<span class="' + (orderIsLate(o) ? 'down' : '') + '">' + shortDate(o.due_date) + '</span>';
  root.innerHTML =
    header(
      'Pedidos',
      '<button class="btn icon-btn" id="reloadOrders" type="button" aria-label="Actualizar" title="Actualizar">' +
        icon('refresh-cw') +
        '</button>' +
        (canEdit()
          ? '<button class="btn btn-primary" id="newJobOrder" type="button">' +
            icon('plus') +
            '<span>Nuevo pedido</span></button>'
          : '')
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="toolbar">' +
    searchBox('orderSearch', 'Buscar pedido, cliente o PED-…', S.orderSearch) +
    '</div>' +
    filterPills(pills, filter, 'data-order-filter') +
    '<section class="panel">' +
    (list.length
      ? '<table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Estado</th><th class="r">Venta</th><th class="r">Utilidad</th></tr></thead><tbody>' +
        list
          .map(
            o =>
              '<tr data-order="' +
              o.id +
              '"><td><b>' +
              esc(o.title) +
              '</b><div class="sub">PED-' +
              o.order_no +
              ' · ' +
              o.quantity +
              ' un.</div></td><td>' +
              (o.kind === 'stock'
                ? '<span class="chip c-stock">Para stock</span>'
                : esc(o.customer_name || '—') + (o.from_stock ? '<div class="sub">desde stock</div>' : '')) +
              '</td><td class="num">' +
              due(o) +
              '</td><td>' +
              orderChip(o) +
              '</td><td class="r num">' +
              (o.kind === 'stock'
                ? '<span class="muted">—</span>'
                : clp(orderNumbers(o).sales) +
                  (orderBalance(o).due > 0
                    ? '<div class="sub warn">Saldo ' + clp(orderBalance(o).due) + '</div>'
                    : orderBalance(o).state === 'paid'
                      ? '<div class="sub up">Pagado</div>'
                      : '')) +
              '</td><td class="r num">' +
              orderProfitCell(o) +
              '</td></tr>'
          )
          .join('') +
        '</tbody></table><div class="list-rows">' +
        list
          .map(
            o =>
              '<button type="button" class="list-row" data-order="' +
              o.id +
              '"><span class="lr-main"><b>' +
              esc(o.title) +
              '</b><span>PED-' +
              o.order_no +
              ' · ' +
              esc(orderCustomer(o)) +
              ' · ' +
              due(o) +
              '</span></span><span class="lr-end"><b class="num">' +
              (o.kind === 'stock' ? o.quantity + ' un.' : clp(orderNumbers(o).sales)) +
              '</b>' +
              (orderBalance(o).due > 0
                ? '<span class="sub warn">Saldo ' + clp(orderBalance(o).due) + '</span>'
                : orderChip(o)) +
              '</span></button>'
          )
          .join('') +
        '</div>'
      : '<div class="panel-empty">' +
        icon(term ? 'search' : 'clipboard-list') +
        '<b>' +
        (term ? 'Sin resultados' : S.orders.length ? 'No hay pedidos en esta vista' : 'Aún no hay pedidos') +
        '</b><span>' +
        (S.orders.length ? 'Prueba con otro filtro.' : 'Crea uno desde el resumen de un producto.') +
        '</span></div>') +
    '</section></main>';
  common();
  mountOrderReview();
  bindSearch('orderSearch', v => (S.orderSearch = v), productionView);
  qa('[data-order-filter]').forEach(
    b =>
      (b.onclick = () => {
        S.orderFilter = b.dataset.orderFilter;
        productionView();
      })
  );
  q('#reloadOrders').onclick = () => goMode('production');
  q('#newJobOrder')?.addEventListener('click', () => showQuickJob('order'));
  qa('[data-order]').forEach(
    b => (b.onclick = () => showOrder(S.orders.find(o => o.id === b.dataset.order)))
  );
}
// ---- Photos of finished work (stored with product photos, under orders/) -----
const orderPhotoFolder = order => S.workspace.id + '/orders/' + order.id;
async function loadOrderPhotos(order) {
  const folder = orderPhotoFolder(order);
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .list(folder, { limit: 20, sortBy: { column: 'created_at', order: 'asc' } });
  if (error) throw error;
  const paths = (data || []).filter(f => f.name && !f.name.startsWith('.')).map(f => folder + '/' + f.name);
  if (!paths.length) return [];
  const { data: signed, error: se } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
  if (se) throw se;
  return (signed || []).map((s, i) => ({ path: paths[i], url: s.signedUrl })).filter(p => p.url);
}
async function mountOrderPhotos(order, dialog) {
  let box = dialog.querySelector('#orderPhotos');
  if (!box) {
    box = document.createElement('section');
    box.id = 'orderPhotos';
    box.className = 'pay-card';
    dialog.querySelector('#orderForm').before(box);
  }
  box.innerHTML =
    '<div class="pay-head"><h3>Fotos del trabajo</h3></div><p class="small muted">Cargando…</p>';
  let photos;
  try {
    photos = await loadOrderPhotos(order);
  } catch (error) {
    box.querySelector('p').textContent = 'No se pudieron cargar las fotos: ' + error.message;
    return;
  }
  if (!dialog.isConnected) return;
  box.innerHTML =
    '<div class="pay-head"><h3>Fotos del trabajo</h3>' +
    (canEdit()
      ? '<label class="btn btn-secondary btn-sm" for="orderPhotoFile">' +
        icon('image') +
        'Agregar foto</label><input id="orderPhotoFile" class="visually-hidden" type="file" accept="image/*">'
      : '') +
    '</div>' +
    (photos.length
      ? '<div class="order-photos">' +
        photos
          .map(
            p =>
              '<figure><a href="' +
              esc(p.url) +
              '" target="_blank" rel="noopener"><img src="' +
              esc(p.url) +
              '" alt="Trabajo terminado" loading="lazy"></a>' +
              (canEdit()
                ? '<button type="button" class="btn icon-btn" data-del-photo="' +
                  esc(p.path) +
                  '" aria-label="Quitar foto">' +
                  icon('trash-2') +
                  '</button>'
                : '') +
              '</figure>'
          )
          .join('') +
        '</div>'
      : '<p class="small muted">Sube la foto del trabajo terminado: queda como registro y para tu portafolio.</p>') +
    '<div class="small" id="orderPhotoFeedback" role="status"></div>';
  box.querySelector('#orderPhotoFile')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    box.querySelector('#orderPhotoFeedback').textContent = 'Subiendo…';
    try {
      const dataUrl = await optimizePhoto(file),
        bin = atob(dataUrl.split(',')[1]),
        blob = new Blob([Uint8Array.from(bin, c => c.charCodeAt(0))], { type: 'image/jpeg' });
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(orderPhotoFolder(order) + '/' + crypto.randomUUID() + '.jpg', blob, {
          contentType: 'image/jpeg',
          upsert: false
        });
      if (error) throw error;
      toast('Foto agregada.');
      mountOrderPhotos(order, dialog);
    } catch (error) {
      box.querySelector('#orderPhotoFeedback').textContent = error.message;
    }
  });
  box.querySelectorAll('[data-del-photo]').forEach(
    b =>
      (b.onclick = async () => {
        if (
          !(await confirmDialog({
            title: 'Quitar foto',
            body: 'La foto se eliminará del pedido.',
            confirmLabel: 'Quitar',
            danger: true
          }))
        )
          return;
        const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([b.dataset.delPhoto]);
        if (error) return toast(error.message, 'error');
        mountOrderPhotos(order, dialog);
      })
  );
}
// ---------------------------------------------------------------------------
// V4.3: orders keep the product cost they were created with (history doesn't move on
// its own). When the product cost changes, open orders can take the new cost: offered
// after saving the product, and from each order.
// ---------------------------------------------------------------------------
function productUnitCost(productId) {
  if (S.product?.id === productId && typeof totals === 'function') return n(totals().unit);
  const p = S.products.find(x => x.id === productId);
  return p ? n(productNumbers(p).unit) : 0;
}
const orderCostFor = (o, unit) => Math.round(unit * n(o.quantity));
function staleOrders(productId, unit) {
  return (S.orders || []).filter(
    o =>
      o.product_id === productId &&
      orderIsOpen(o) &&
      unit > 0 &&
      Math.abs(orderCostFor(o, unit) - Math.round(n(o.estimated_cost))) >= 1
  );
}
// V4.6: the order also takes the product's current materials (refresh_order_materials):
// a reservation is redone, and consumed stock moves only by the difference.
async function updateOrderCosts(list, unit) {
  let materials = false;
  for (const o of list) {
    if (o.product_id && !o.from_stock) {
      const { data, error } = await supabase.rpc('refresh_order_materials', { p_order: o.id });
      if (!error) {
        o.estimated_cost = n(data?.estimated_cost ?? orderCostFor(o, unit));
        if (data?.state) o.inventory_state = data.state;
        materials = true;
        continue;
      }
      // Without the database function (not deployed yet) only the cost is updated.
      if (!/refresh_order_materials|PGRST202|schema cache/i.test(error.message + ' ' + error.code))
        throw error;
    }
    const { error } = await supabase
      .from('production_orders')
      .update({ estimated_cost: orderCostFor(o, unit), updated_at: new Date().toISOString() })
      .eq('id', o.id);
    if (error) throw error;
    o.estimated_cost = orderCostFor(o, unit);
  }
  if (materials) await Promise.all([loadResources(), loadOrders()]).catch(() => {});
  return materials;
}
// After saving a product: offer to carry its new cost to the open orders that use it.
async function offerOrderCostRefresh(productId) {
  if (!canEdit()) return;
  if (!S.orders?.length) await loadOrders().catch(() => {});
  const unit = productUnitCost(productId),
    list = staleOrders(productId, unit);
  if (!list.length) return;
  const ok = await confirmDialog({
    title: 'Actualizar costo en pedidos abiertos',
    body:
      'El costo del producto ahora es ' +
      clp(unit) +
      ' por unidad. ' +
      (list.length === 1 ? 'Este pedido abierto usa' : 'Estos ' + list.length + ' pedidos abiertos usan') +
      ' el costo anterior: ' +
      list
        .map(
          o => 'PED-' + o.order_no + ' (' + clp(o.estimated_cost) + ' → ' + clp(orderCostFor(o, unit)) + ')'
        )
        .join(', ') +
      '. También toman los materiales actuales del producto (reserva o consumo se ajustan por la diferencia). Los pedidos entregados o cancelados no cambian.',
    confirmLabel: 'Actualizar'
  });
  if (!ok) return;
  try {
    const materials = await updateOrderCosts(list, unit),
      what = materials ? 'Costo y materiales' : 'Costo';
    toast(
      list.length === 1
        ? what + ' del pedido actualizados.'
        : what + ' actualizados en ' + list.length + ' pedidos.'
    );
  } catch (error) {
    toast(error.message, 'error');
  }
}
// In the order: a notice when its product costs something different now.
function mountOrderCostNotice(order, dialog) {
  if (!order.product_id || !orderIsOpen(order)) return;
  const unit = productUnitCost(order.product_id),
    next = orderCostFor(order, unit),
    now = Math.round(n(order.estimated_cost));
  if (!(unit > 0) || Math.abs(next - now) < 1) return;
  const box = document.createElement('div');
  box.className = 'notice small cost-notice';
  box.innerHTML =
    '<span>El costo del producto cambió: este pedido usa <b>' +
    clp(now) +
    '</b> y con el costo actual sería <b>' +
    clp(next) +
    '</b>.</span>' +
    (canEdit()
      ? '<button type="button" class="btn btn-secondary btn-sm" id="refreshOrderCost">' +
        icon('refresh-cw') +
        (order.product_id && !order.from_stock ? 'Actualizar costo y materiales' : 'Actualizar costo') +
        '</button>'
      : '');
  (dialog.querySelector('.facts') || dialog.querySelector('.order-head')).after(box);
  box.querySelector('#refreshOrderCost')?.addEventListener('click', async () => {
    try {
      const materials = await updateOrderCosts([order], unit);
      toast(
        (materials ? 'Materiales y costo del pedido actualizados: ' : 'Costo del pedido actualizado a ') +
          clp(order.estimated_cost) +
          '.'
      );
      dialog.close();
      render();
      showOrder(S.orders.find(o => o.id === order.id) || order);
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}
// ---------------------------------------------------------------------------
// V4.8: order review and shopping list.
// The review compares every open order with its product's current recipe (materials and
// cost) and fixes them in one go with refresh_order_materials. The shopping list says what
// to buy to cover reservations, open orders without a reservation and each minimum stock.
// ---------------------------------------------------------------------------
const reviewOrders = () =>
  (S.orders || []).filter(o => orderIsOpen(o) && o.product_id && !o.from_stock && o.status !== 'canceled');
const sameQty = (a, b) => Math.abs(n(a) - n(b)) <= Math.max(0.01, Math.abs(n(b)) * 0.001);
// Per product: {quantity, recipe: Map(resource_id → amount per batch)}, as the database reserves it.
async function loadRecipes(productIds) {
  const ids = [...new Set(productIds)];
  if (!ids.length) return new Map();
  const [{ data: products, error: pe }, { data: jobs, error: je }] = await Promise.all([
    supabase.from('products').select('id,quantity,materials').in('id', ids),
    supabase.from('print_jobs').select('product_id,filaments').in('product_id', ids)
  ]);
  if (pe) throw pe;
  if (je) throw je;
  const out = new Map();
  for (const p of products || []) {
    const recipe = new Map(),
      add = (id, q) => id && n(q) > 0 && recipe.set(id, (recipe.get(id) || 0) + n(q));
    for (const m of p.materials || []) add(m.resource_id, m.quantity);
    for (const j of (jobs || []).filter(x => x.product_id === p.id))
      for (const f of j.filaments || []) add(f.resource_id, n(f.grams) + n(f.purge_grams));
    out.set(p.id, { quantity: Math.max(1, n(p.quantity) || 1), recipe });
  }
  return out;
}
const resourceLabel = (id, fallback) => {
  const r = S.resources.find(x => x.id === id);
  return { name: r?.name || fallback || 'Material', unit: r?.unit || '' };
};
// Differences of one order against its product. Consumed orders keep the real quantities
// entered (with waste), so only missing or extra materials count for them.
function orderDifferences(o, lines, product) {
  const notes = [];
  if (!product) return notes;
  const expected = new Map(
      [...product.recipe].map(([id, q]) => [id, (q * n(o.quantity)) / product.quantity])
    ),
    have = new Map(lines.map(l => [l.resource_id, l])),
    consumed = o.inventory_state === 'consumed',
    fmt = (id, q, name) => {
      const r = resourceLabel(id, name);
      return r.name + ' ' + stockNumber(q) + ' ' + r.unit;
    };
  const missing = [...expected].filter(([id]) => !have.has(id)).map(([id, q]) => fmt(id, q));
  const extra = lines
    .filter(l => !expected.has(l.resource_id))
    .map(l => fmt(l.resource_id, l.quantity, l.name));
  const changed = consumed
    ? []
    : [...expected]
        .filter(([id, q]) => have.has(id) && !sameQty(have.get(id).quantity, q))
        .map(([id, q]) => {
          const r = resourceLabel(id, have.get(id).name);
          return r.name + ' ' + stockNumber(have.get(id).quantity) + ' → ' + stockNumber(q) + ' ' + r.unit;
        });
  if (missing.length) notes.push('Faltan: ' + missing.join(', '));
  if (extra.length) notes.push('Sobran: ' + extra.join(', '));
  if (changed.length) notes.push('Cambian: ' + changed.join(', '));
  const unit = productUnitCost(o.product_id),
    cost = orderCostFor(o, unit);
  if (unit > 0 && Math.abs(cost - Math.round(n(o.estimated_cost))) >= 1)
    notes.push('Costo: ' + clp(o.estimated_cost) + ' → ' + clp(cost));
  return notes;
}
// Reviews every open order. Also returns what unreserved orders still need (for the shopping list).
// Kept for a minute while the orders do not change, so re-rendering Pedidos does not query again.
const reviewKey = () =>
  reviewOrders()
    .map(o => o.id + o.inventory_state + n(o.estimated_cost) + o.quantity + (o.updated_at || ''))
    .join('|');
async function reviewAllOrders({ fresh = false } = {}) {
  const key = reviewKey();
  if (!fresh && S.orderReview?.key === key && Date.now() - S.orderReview.at < 60000) return S.orderReview;
  const orders = reviewOrders();
  if (!orders.length) return (S.orderReview = { key, at: Date.now(), issues: [], pending: new Map() });
  const linesOf = async ids => {
    const { data, error } = await supabase
      .from('inventory_order_lines')
      .select('order_id,resource_id,name,unit,quantity,consumed_qty')
      .eq('workspace_id', S.workspace.id)
      .in('order_id', ids);
    if (error) throw error;
    return data || [];
  };
  const [recipes, lines] = await Promise.all([
    loadRecipes(orders.map(o => o.product_id)),
    linesOf(orders.map(o => o.id))
  ]);
  const issues = [],
    pending = new Map();
  for (const o of orders) {
    const product = recipes.get(o.product_id),
      own = lines.filter(l => l.order_id === o.id),
      notes = orderDifferences(o, own, product);
    if (notes.length) issues.push({ order: o, notes });
    // Orders without a reservation still need their materials: they count for the shopping list.
    if (product && o.inventory_state !== 'reserved' && o.inventory_state !== 'consumed')
      for (const [id, q] of product.recipe)
        pending.set(id, (pending.get(id) || 0) + (q * n(o.quantity)) / product.quantity);
  }
  return (S.orderReview = { key, at: Date.now(), issues, pending });
}
// Notice at the top of Pedidos when an order no longer matches its product.
async function mountOrderReview() {
  if (S.mode !== 'production') return;
  let review;
  try {
    review = await reviewAllOrders();
  } catch (e) {
    return console.warn('No se pudo revisar los pedidos', e);
  }
  q('#orderReview')?.remove();
  if (S.mode !== 'production' || !review.issues.length) return;
  const k = review.issues.length,
    el = document.createElement('button');
  el.type = 'button';
  el.id = 'orderReview';
  el.className = 'notice inventory-alert review-alert';
  el.innerHTML =
    icon('triangle-alert') +
    '<span>' +
    k +
    (k === 1 ? ' pedido no coincide' : ' pedidos no coinciden') +
    ' con los materiales o el costo actual de su producto. <b>Revisar →</b></span>';
  el.onclick = () => showOrderReview();
  (q('#inventoryAlert') || q('main .toolbar'))?.before(el);
}
function showOrderReview() {
  const review = S.orderReview || { issues: [] },
    edit = canEdit();
  const dialog = showDialog(
    'reviewDialog',
    '<div class="section-title"><h2>Revisión de pedidos</h2><button class="btn btn-ghost" data-close>Cerrar</button></div>' +
      (review.issues.length
        ? '<p class="small muted">Estos pedidos abiertos no coinciden con la receta o el costo actual de su producto. Al corregir, el pedido toma los materiales y el costo del producto: la reserva se rehace o, si ya se consumió, el stock se ajusta solo por la diferencia.</p><div class="review-list">' +
          review.issues
            .map(
              ({ order: o, notes }) =>
                '<div class="review-item" data-review="' +
                o.id +
                '"><div class="review-head"><b>PED-' +
                o.order_no +
                ' · ' +
                esc(o.title) +
                '</b><span class="small muted">' +
                esc(o.customer_name || (o.kind === 'stock' ? 'Fabricación para stock' : '')) +
                '</span></div><ul class="small">' +
                notes.map(t => '<li>' + esc(t) + '</li>').join('') +
                '</ul><div class="review-actions"><button type="button" class="btn btn-ghost btn-sm" data-review-open="' +
                o.id +
                '">Ver pedido</button>' +
                (edit
                  ? '<button type="button" class="btn btn-secondary btn-sm" data-review-fix="' +
                    o.id +
                    '">' +
                    icon('refresh-cw') +
                    'Corregir</button>'
                  : '') +
                '</div><div class="small review-error" role="status"></div></div>'
            )
            .join('') +
          '</div>' +
          (edit && review.issues.length > 1
            ? '<div class="dialog-actions"><button type="button" class="btn btn-primary" id="reviewFixAll">' +
              icon('check') +
              'Corregir todos (' +
              review.issues.length +
              ')</button></div>'
            : '')
        : '<div class="panel-empty">' +
          icon('circle-check') +
          '<b>Todo en orden</b><span>Los pedidos abiertos coinciden con sus productos.</span></div>')
  );
  const fix = async (o, item) => {
    try {
      await updateOrderCosts([o], productUnitCost(o.product_id));
      item?.classList.add('fixed');
      if (item) item.querySelector('.review-actions').innerHTML = '<span class="small up">Corregido</span>';
      return true;
    } catch (error) {
      if (item) item.querySelector('.review-error').textContent = error.message;
      return false;
    }
  };
  const after = async done => {
    if (done) toast(done === 1 ? 'Pedido corregido.' : done + ' pedidos corregidos.');
    await reviewAllOrders({ fresh: true }).catch(() => {});
    if (S.mode === 'production') render();
  };
  dialog.querySelectorAll('[data-review-open]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        showOrder(S.orders.find(o => o.id === b.dataset.reviewOpen));
      })
  );
  dialog.querySelectorAll('[data-review-fix]').forEach(
    b =>
      (b.onclick = async () => {
        b.disabled = true;
        const item = b.closest('.review-item'),
          ok = await fix(
            S.orders.find(o => o.id === b.dataset.reviewFix),
            item
          );
        if (!ok) b.disabled = false;
        await after(ok ? 1 : 0);
      })
  );
  dialog.querySelector('#reviewFixAll')?.addEventListener('click', async e => {
    const b = e.currentTarget;
    b.disabled = true;
    let done = 0;
    // One by one: an order without stock shows its reason and the rest still get fixed.
    for (const { order } of review.issues) {
      const item = dialog.querySelector('[data-review="' + order.id + '"]');
      if (item?.classList.contains('fixed')) continue;
      if (await fix(S.orders.find(o => o.id === order.id) || order, item)) done++;
    }
    b.remove();
    await after(done);
  });
  return dialog;
}
