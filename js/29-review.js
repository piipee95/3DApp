'use strict';
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

// ---- Shopping list ----
// To buy = reserved + needed by unreserved open orders + minimum − physical stock.
function shoppingList(pending = S.orderReview?.pending || new Map()) {
  return inventoryItems()
    .filter(r => r.active && r.counted)
    .map(r => {
      const reserved = n(r.reserved_qty),
        waiting = n(pending.get(r.id)),
        min = n(r.min_stock),
        stock = n(r.stock_qty),
        buy = reserved + waiting + min - stock;
      return {
        r,
        reserved,
        waiting,
        min,
        stock,
        buy: buy > 0.0001 ? buy : 0,
        cost: Math.max(0, buy) * n(r.unit_cost)
      };
    })
    .filter(x => x.buy > 0)
    .sort((a, b) => a.r.kind.localeCompare(b.r.kind) || a.r.name.localeCompare(b.r.name, 'es'));
}
const buyLabel = x =>
  x.r.kind === 'filament'
    ? stockNumber(Math.ceil(x.buy)) +
      ' g' +
      ' (' +
      Math.ceil(x.buy / 1000) +
      (Math.ceil(x.buy / 1000) === 1 ? ' rollo de 1 kg)' : ' rollos de 1 kg)')
    : stockNumber(Math.ceil(x.buy * 1000) / 1000) + ' ' + (INVENTORY_UNITS[x.r.unit] || x.r.unit);
function shoppingText(list) {
  return (
    'Lista de compras · ' +
    (S.workspace?.name || 'Kultiverso Pop') +
    '\n' +
    list
      .map(x => '• ' + x.r.name + (x.r.material ? ' (' + x.r.material + ')' : '') + ': ' + buyLabel(x))
      .join('\n') +
    '\nTotal estimado: ' +
    clp(list.reduce((s, x) => s + x.cost, 0))
  );
}
async function showShoppingList() {
  // The open orders without a reservation also need materials: review them first.
  await reviewAllOrders().catch(e => console.warn('No se pudo revisar los pedidos', e));
  const list = shoppingList(),
    total = list.reduce((s, x) => s + x.cost, 0),
    uncounted = inventoryItems().filter(r => r.active && !r.counted).length,
    group = (kind, title) => {
      const rows = list.filter(x =>
        kind === 'filament' ? x.r.kind === 'filament' : x.r.kind !== 'filament'
      );
      return rows.length
        ? '<h3 class="shop-group">' +
            title +
            '</h3>' +
            rows
              .map(
                x =>
                  '<div class="shop-row"><span class="shop-main"><b>' +
                  esc(x.r.name) +
                  (x.r.material ? ' <span class="muted">· ' + esc(x.r.material) + '</span>' : '') +
                  '</b><span class="small muted">Tienes ' +
                  stockNumber(x.stock) +
                  ' · reservado ' +
                  stockNumber(x.reserved) +
                  (x.waiting
                    ? ' · pedidos sin reservar ' + stockNumber(Math.round(x.waiting * 100) / 100)
                    : '') +
                  ' · mínimo ' +
                  stockNumber(x.min) +
                  ' ' +
                  esc(x.r.unit) +
                  '</span></span><span class="shop-end"><b class="num">' +
                  esc(buyLabel(x)) +
                  '</b><span class="small muted num">' +
                  clp(x.cost) +
                  '</span>' +
                  (canEdit()
                    ? '<button type="button" class="btn btn-ghost btn-sm" data-shop-buy="' +
                      x.r.id +
                      '">' +
                      icon('plus') +
                      'Registrar compra</button>'
                    : '') +
                  '</span></div>'
              )
              .join('')
        : '';
    };
  const dialog = showDialog(
    'shoppingDialog',
    '<div class="section-title"><h2>Lista de compras</h2><button class="btn btn-ghost" data-close>Cerrar</button></div>' +
      (list.length
        ? '<div class="sell-summary"><div><span>Materiales</span><b class="num">' +
          list.length +
          '</b></div><div><span>Total estimado</span><b class="num">' +
          clp(total) +
          '</b></div></div><p class="small muted">Lo que falta para cubrir lo reservado, los pedidos abiertos sin reserva y el stock mínimo de cada material, al costo promedio actual.</p>' +
          group('filament', 'Filamentos') +
          group('supply', 'Insumos') +
          '<div class="dialog-actions"><button type="button" class="btn btn-secondary" id="shopCopy">' +
          icon('copy') +
          'Copiar lista</button></div>'
        : '<div class="panel-empty">' +
          icon('circle-check') +
          '<b>No necesitas comprar nada</b><span>El stock cubre lo reservado, los pedidos abiertos y los mínimos.</span></div>') +
      (uncounted
        ? '<p class="small muted">' +
          uncounted +
          (uncounted === 1
            ? ' material sin conteo inicial no se incluye.'
            : ' materiales sin conteo inicial no se incluyen.') +
          '</p>'
        : '')
  );
  dialog.querySelectorAll('[data-shop-buy]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        showStockMovement(
          S.resources.find(r => r.id === b.dataset.shopBuy),
          'in'
        );
      })
  );
  dialog.querySelector('#shopCopy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shoppingText(list));
      toast('Lista copiada.');
    } catch {
      toast('No se pudo copiar en este navegador.', 'error');
    }
  });
  return dialog;
}
