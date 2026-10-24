'use strict';
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
      const customer_id = await ensureCustomer(client);
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
            q('#linkFeedback').textContent = error.message;
            qa('[data-link-product]').forEach(x => (x.disabled = false));
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
// After saving a product created from a custom job, offer to link it to that order.
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
    toast(error.message, 'error');
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
const ICONS = {
  house:
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />',
  package:
    '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /><path d="M12 22V12" /><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7" /><path d="m7.5 4.27 9 5.15" />',
  'file-text':
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />',
  'clipboard-list':
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />',
  boxes:
    '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" /><path d="m7 16.5-4.74-2.85" /><path d="m7 16.5 5-3" /><path d="M7 16.5v5.17" /><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" /><path d="m17 16.5-5-3" /><path d="m17 16.5 4.74-2.85" /><path d="M17 16.5v5.17" /><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" /><path d="M12 8 7.26 5.15" /><path d="m12 8 4.74-2.85" /><path d="M12 13.5V8" />',
  printer:
    '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" />',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />',
  search: '<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />',
  plus: '<path d="M5 12h14" /><path d="M12 5v14" />',
  'ellipsis-vertical':
    '<circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />',
  ellipsis: '<circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />',
  'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" />',
  'triangle-alert':
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />',
  'chevron-right': '<path d="m9 18 6-6-6-6" />',
  'chevron-down': '<path d="m6 9 6 6 6-6" />',
  'arrow-left': '<path d="m12 19-7-7 7-7" /><path d="M19 12H5" />',
  x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
  'log-out':
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />',
  'key-round':
    '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" /><circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />',
  'user-plus':
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" />',
  menu: '<line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />',
  'refresh-cw':
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
  check: '<path d="M20 6 9 17l-5-5" />',
  'trash-2':
    '<path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />',
  archive:
    '<rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />',
  'archive-restore':
    '<rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h2" /><path d="M20 8v11a2 2 0 0 1-2 2h-2" /><path d="m9 15 3-3 3 3" /><path d="M12 12v9" />',
  'share-2':
    '<circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />',
  calendar:
    '<path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />',
  'circle-check': '<circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />',
  info: '<circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />',
  history:
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" />',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />',
  wallet:
    '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />',
  layers:
    '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />',
  'list-filter': '<path d="M3 6h18" /><path d="M7 12h10" /><path d="M10 18h4" />',
  calculator:
    '<rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" />',
  clock: '<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />',
  'chart-column':
    '<path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />',
  database:
    '<ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />',
  'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />',
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />',
  store:
    '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" /><path d="M2 7h20" /><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />',
  'circle-alert':
    '<circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />'
};
