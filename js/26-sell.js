'use strict';
// ---------------------------------------------------------------------------
// V4.1: sell finished goods from stock at the price actually agreed. The sale is a
// customer order delivered from stock (stock goes down, sales and profit count it)
// and, when already paid, its payment is recorded.
// ---------------------------------------------------------------------------
function showSell(p) {
  if (!canEdit() || !p) return;
  const st = productStock(p),
    t = productNumbers(p);
  if (st.available < 1) return toast('«' + p.name + '» no tiene unidades disponibles en stock.', 'error');
  const dialog = showDialog(
    'sellDialog',
    '<div class="section-title"><h2>Vender · ' +
      esc(p.name) +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><p class="small muted">Disponibles: ' +
      st.available +
      (st.available === 1 ? ' unidad' : ' unidades') +
      (t.unit > 0 ? ' · costo ' + clp(t.unit) + ' c/u' : '') +
      '</p><form id="sellForm" class="grid"><div class="grid grid-2">' +
      fieldHtml(
        'Cantidad',
        'sellQty',
        1,
        'number',
        'min="1" max="' + st.available + '" step="1" required inputmode="numeric"'
      ) +
      fieldHtml(
        'Precio de venta por unidad' + (p.iva_enabled ? ' (con IVA)' : ''),
        'sellPrice',
        Math.round(t.price) || '',
        'number',
        'min="0" max="100000000" step="1" required inputmode="numeric"'
      ) +
      '</div><p class="small muted" id="sellHint">Precio sugerido ' +
      clp(t.price) +
      ': cámbialo por el precio al que realmente lo vendiste.</p><div id="sellSummary" class="sell-summary" role="status"></div>' +
      fieldHtml(
        'Cliente (opcional)',
        'sellClient',
        '',
        'text',
        'maxlength="120" list="customerList" autocomplete="off" placeholder="Venta directa"'
      ) +
      customerOptions() +
      fieldHtml(
        'WhatsApp del cliente (opcional)',
        'sellPhone',
        '',
        'tel',
        'maxlength="30" inputmode="tel" autocomplete="off"'
      ) +
      '<label class="check-row"><input type="checkbox" id="sellPaid" checked> <span><b>Ya me pagaron</b><span class="small muted">Registra el pago completo.</span></span></label><div class="field" id="sellMethodField"><label for="sellMethod">Medio de pago</label><select id="sellMethod">' +
      Object.entries(PAY_METHODS)
        .map(([k, v]) => '<option value="' + k + '">' + v + '</option>')
        .join('') +
      '</select></div>' +
      partnerField('sellReceiver', 'Recibió el pago') +
      '<div id="sellFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">' +
      icon('circle-check') +
      'Registrar venta</button></form>'
  );
  const read = () => {
    const qty = Math.max(1, Math.min(st.available, Math.floor(n(q('#sellQty').value)))),
      price = Math.max(0, Math.round(n(q('#sellPrice').value))),
      total = qty * price,
      net = p.iva_enabled ? total / (1 + n(p.iva_rate)) : total,
      profit = net - qty * t.unit;
    return { qty, price, total, net, profit };
  };
  const summary = () => {
    const v = read(),
      margin = v.net > 0 ? v.profit / v.net : null,
      diff = v.price - Math.round(t.price);
    q('#sellSummary').innerHTML =
      '<div><span>Total</span><b class="num">' +
      clp(v.total) +
      '</b></div>' +
      (t.unit > 0
        ? '<div><span>Ganancia</span><b class="num ' +
          (v.profit < 0 ? 'down' : 'up') +
          '">' +
          clp(v.profit) +
          (margin == null ? '' : ' · ' + pct(margin)) +
          '</b></div>'
        : '') +
      (diff && t.price > 0
        ? '<div><span>Vs sugerido</span><b class="num ' +
          (diff < 0 ? 'down' : 'up') +
          '">' +
          (diff > 0 ? '+' : '−') +
          clp(Math.abs(diff)) +
          ' c/u</b></div>'
        : '');
  };
  ['#sellQty', '#sellPrice'].forEach(id => (q(id).oninput = summary));
  q('#sellPaid').onchange = () => {
    q('#sellMethodField').hidden = !q('#sellPaid').checked;
    if (q('#sellReceiver')) q('#sellReceiver').closest('.field').hidden = !q('#sellPaid').checked;
  };
  bindCustomerPhone('#sellClient', '#sellPhone');
  summary();
  q('#sellForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    const v = read(),
      client = q('#sellClient').value.trim();
    try {
      const customer_id = client ? await ensureCustomer(client, q('#sellPhone').value) : null;
      const { data: order, error } = await supabase
        .from('production_orders')
        .insert({
          workspace_id: S.workspace.id,
          product_id: p.id,
          title: p.name,
          ...(customer_id ? { customer_id } : {}),
          kind: 'customer',
          from_stock: true,
          customer_name: client || 'Venta directa',
          quantity: v.qty,
          unit_price: v.price,
          iva_enabled: p.iva_enabled,
          iva_rate: p.iva_rate,
          estimated_cost: Math.round(v.qty * t.unit),
          estimated_grams: 0,
          estimated_minutes: 0,
          due_date: localToday(),
          notes: 'Venta desde stock'
        })
        .select()
        .single();
      if (error) throw error;
      // Delivered right away: this is what takes the units out of stock.
      const { error: de } = await supabase
        .from('production_orders')
        .update({ status: 'delivered', updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (de) throw de;
      if (q('#sellPaid').checked && v.total > 0)
        await addPayment(
          { ...order, status: 'delivered' },
          v.total,
          q('#sellMethod').value,
          null,
          'Venta desde stock',
          rememberPartner(q('#sellReceiver')?.value)
        );
      await Promise.all([refreshProductStock(p.id), loadOrders()]);
      dialog.close();
      toast(
        'Vendido: ' +
          v.qty +
          ' × ' +
          p.name +
          ' a ' +
          clp(v.price) +
          (t.unit > 0 ? '. Ganancia ' + clp(v.profit) + '.' : '.')
      );
      render();
    } catch (error) {
      q('#sellFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  return dialog;
}

// Pick what to sell: products with available units, with photo and suggested price.
function showSellPicker() {
  const list = S.products
    .filter(p => p.status !== 'archived' && productStock(p).available > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!list.length)
    return toast('No tienes productos en stock. Usa «Fabricar» para sumar unidades.', 'error');
  const dialog = showDialog(
    'sellPicker',
    '<div class="section-title"><h2>¿Qué vendiste?</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><div class="stock-pick-list">' +
      list
        .map(
          p =>
            '<button type="button" class="list-row" data-sell-pick="' +
            p.id +
            '">' +
            productThumb(p) +
            '<span class="lr-main"><b>' +
            esc(p.name) +
            '</b><span>' +
            productStock(p).available +
            ' en stock · sugerido ' +
            clp(productNumbers(p).price) +
            '</span></span>' +
            icon('chevron-right') +
            '</button>'
        )
        .join('') +
      '</div>'
  );
  dialog.querySelectorAll('[data-sell-pick]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        showSell(list.find(p => p.id === b.dataset.sellPick));
      })
  );
  return dialog;
}
