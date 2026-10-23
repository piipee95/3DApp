'use strict';
// V1.4: counted inventory, durable material recipes and atomic order stock.
const INVENTORY_UNITS = {
  un: 'unidades',
  hoja: 'hojas',
  m: 'metros',
  g: 'gramos',
  kg: 'kilogramos',
  l: 'litros'
};
const stockNumber = v => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(n(v));
const preciseCost = v =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 3 }).format(
    n(v)
  );
const availableStock = r => n(r.stock_qty) - n(r.reserved_qty);
function inventoryItems() {
  return S.resources.filter(r => r.kind !== 'printer');
}
function inventoryLow() {
  return inventoryItems().filter(r => r.active && r.counted && availableStock(r) <= n(r.min_stock));
}
function mountInventoryAlert() {
  q('#inventoryAlert')?.remove();
  if (S.mode !== 'production') return;
  const low = inventoryLow(),
    uncounted = inventoryItems().filter(r => r.active && !r.counted);
  if (!low.length && !uncounted.length) return;
  const el = document.createElement('button');
  el.id = 'inventoryAlert';
  el.className = 'notice inventory-alert';
  el.textContent =
    (low.length
      ? low.length + (low.length === 1 ? ' material con stock bajo. ' : ' materiales con stock bajo. ')
      : '') +
    (uncounted.length
      ? uncounted.length + (uncounted.length === 1 ? ' pendiente' : ' pendientes') + ' de conteo inicial. '
      : '') +
    'Revisar inventario →';
  el.onclick = () => goMode('inventory');
  q('main')?.prepend(el);
}
function showInventoryForm(r = { kind: 'supply', active: true, unit: 'un' }) {
  if (!canEdit()) return;
  const dialog = showDialog(
    'inventoryFormDialog',
    '<div class="section-title"><h2>' +
      (r.id ? 'Editar material' : 'Nuevo material') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="inventoryForm" class="grid"><div class="field"><label for="invKind">Tipo</label><select id="invKind" ' +
      (r.id ? 'disabled' : '') +
      '><option value="supply">Material / insumo</option><option value="filament">Filamento</option></select></div>' +
      fieldHtml('Nombre', 'invName', r.name, 'text', 'required maxlength="160"') +
      fieldHtml('Marca / material / referencia', 'invMaterial', r.material) +
      '<div class="grid grid-2"><div class="field"><label for="invUnit">Unidad de control</label><select id="invUnit" ' +
      (r.counted ? 'disabled' : '') +
      '>' +
      Object.entries(INVENTORY_UNITS)
        .map(([k, v]) => '<option value="' + k + '">' + v + '</option>')
        .join('') +
      '</select></div>' +
      fieldHtml('Color', 'invColor', r.color || '#303030', 'color') +
      fieldHtml(
        r.kind === 'filament' ? 'Precio por kg CLP' : 'Costo por unidad de control CLP',
        'invCost',
        r.kind === 'filament' ? Math.round(n(r.price_per_kg) * 100) / 100 : (r.unit_cost ?? 0),
        'number',
        'min="0" max="1000000000" step="0.001" required'
      ) +
      fieldHtml(
        'Stock mínimo de alerta',
        'invMin',
        r.min_stock ?? 0,
        'number',
        'min="0" max="1000000000" step="0.001" required'
      ) +
      '</div><p class="small muted">' +
      (r.counted
        ? 'Las compras promedian el costo automáticamente; aquí puedes corregirlo. Los productos toman el nuevo precio al usar «Actualizar precios». Para corregir una existencia utiliza Movimiento.'
        : 'Después de guardar podrás registrar la cantidad inicial contada y su costo.') +
      '</p><label class="small"><input id="invActive" type="checkbox" ' +
      (r.active ? 'checked' : '') +
      '> Disponible para nuevos productos y pedidos</label><div id="invFeedback" role="status" class="small"></div><button class="btn btn-primary" type="submit">Guardar material</button></form>'
  );
  q('#invKind').value = r.kind;
  q('#invUnit').value = r.unit || 'un';
  const updateKind = () => {
    q('label[for=invCost]').textContent =
      q('#invKind').value === 'filament' ? 'Precio por kg CLP' : 'Costo por unidad de control CLP';
    if (q('#invKind').value === 'filament') {
      q('#invUnit').value = 'g';
      q('#invUnit').disabled = true;
    } else q('#invUnit').disabled = !!r.counted;
  };
  updateKind();
  q('#invKind').onchange = updateKind;
  q('#inventoryForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    b.disabled = true;
    try {
      const kind = q('#invKind').value,
        cost = n(q('#invCost').value),
        v = {
          name: q('#invName').value.trim(),
          material: q('#invMaterial').value.trim(),
          unit: kind === 'filament' ? 'g' : q('#invUnit').value,
          color: q('#invColor').value,
          min_stock: n(q('#invMin').value),
          active: q('#invActive').checked,
          unit_cost: kind === 'filament' ? cost / 1000 : cost,
          price_per_kg: kind === 'filament' ? cost : 0
        };
      const query = r.id
        ? supabase.from('workspace_resources').update(v).eq('id', r.id).eq('workspace_id', S.workspace.id)
        : supabase.from('workspace_resources').insert({ ...v, kind, workspace_id: S.workspace.id });
      const { data, error } = await query.select().single();
      if (error) throw error;
      await loadResources();
      dialog.close();
      inventoryView();
      if (!r.id) showStockMovement(S.resources.find(x => x.id === data.id));
    } catch (error) {
      q('#invFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  enhanceFields();
}
function showStockMovement(r) {
  if (!canEdit()) return;
  const key = crypto.randomUUID();
  const dialog = showDialog(
    'stockDialog',
    '<div class="section-title"><h2>' +
      esc(r.name) +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><p class="small muted">Físico ' +
      stockNumber(r.stock_qty) +
      ' · Reservado ' +
      stockNumber(r.reserved_qty) +
      ' ' +
      esc(r.unit) +
      '</p><form id="stockForm" class="grid"><div class="field"><label for="stockKind">Movimiento</label><select id="stockKind">' +
      (!r.counted
        ? '<option value="opening">Conteo inicial</option>'
        : '<option value="purchase">Compra / entrada</option><option value="loss">Pérdida / merma</option><option value="adjustment">Reconteo físico</option>') +
      '</select></div><div class="grid grid-2">' +
      fieldHtml(
        'Cantidad en ' + r.unit,
        'stockQuantity',
        '',
        'number',
        'min="0" max="1000000000" step="0.001" required'
      ) +
      fieldHtml(
        'Costo total de la entrada CLP',
        'stockPrice',
        '',
        'number',
        'min="0" max="1000000000000" step="0.01" required'
      ) +
      '</div><div id="stockPreview" class="notice small" role="status"></div><div class="field"><label for="stockNote">Motivo / proveedor / referencia</label><textarea id="stockNote" required maxlength="1000"></textarea></div><div id="stockFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Registrar movimiento</button></form>'
  );
  const preview = () => {
    const kind = q('#stockKind').value,
      qty = n(q('#stockQuantity').value),
      costed = ['opening', 'purchase'].includes(kind);
    q('#stockPrice').closest('.field').hidden = !costed;
    q('#stockPrice').required = costed;
    q('#stockPreview').textContent =
      kind === 'adjustment'
        ? 'Ingresa el stock físico contado. Se registrará la diferencia: ' +
          stockNumber(qty - n(r.stock_qty)) +
          ' ' +
          r.unit +
          '.'
        : kind === 'loss'
          ? 'Se descontarán ' + stockNumber(qty) + ' ' + r.unit + ' del stock disponible.'
          : 'Cantidad en ' +
            r.unit +
            '; costo unitario: ' +
            preciseCost(qty > 0 ? n(q('#stockPrice').value) / qty : n(r.unit_cost)) +
            ' / ' +
            r.unit +
            '.';
  };
  q('#stockKind').onchange = preview;
  q('#stockQuantity').oninput = preview;
  q('#stockPrice').oninput = preview;
  preview();
  q('#stockForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      const kind = q('#stockKind').value,
        qty = n(q('#stockQuantity').value),
        quantity = kind === 'adjustment' ? qty - n(r.stock_qty) : kind === 'loss' ? -qty : qty;
      if (kind !== 'opening' && quantity === 0) throw Error('La cantidad no produce un movimiento.');
      const cost =
        ['opening', 'purchase'].includes(kind) && qty > 0 ? n(q('#stockPrice').value) / qty : n(r.unit_cost);
      const { error } = await supabase.from('inventory_movements').insert({
        workspace_id: S.workspace.id,
        resource_id: r.id,
        kind,
        quantity,
        unit_cost: cost,
        note: q('#stockNote').value.trim(),
        request_key: key
      });
      if (error && error.code !== '23505') throw error;
      await loadResources();
      dialog.close();
      inventoryView();
    } catch (error) {
      q('#stockFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  enhanceFields();
}
async function showInventoryLedger(r) {
  const dialog = showDialog(
    'ledgerDialog',
    '<div class="section-title"><h2>Historial · ' +
      esc(r.name) +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><div id="ledgerBody" role="status">Cargando movimientos…</div>'
  );
  try {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('workspace_id', S.workspace.id)
      .eq('resource_id', r.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    if (!dialog.isConnected) return;
    const kinds = {
      opening: 'Conteo inicial',
      purchase: 'Compra',
      adjustment: 'Reconteo',
      loss: 'Merma',
      consumption: 'Producción'
    };
    q('#ledgerBody').innerHTML =
      (data || [])
        .map(
          m =>
            '<div class="resource-row"><div><b>' +
            kinds[m.kind] +
            ' · ' +
            stockNumber(m.quantity) +
            ' ' +
            esc(r.unit) +
            '</b><div class="small muted">' +
            esc(new Date(m.created_at).toLocaleString('es-CL')) +
            ' · ' +
            preciseCost(m.unit_cost) +
            ' / ' +
            esc(r.unit) +
            '</div><p class="small">' +
            esc(m.note) +
            '</p></div></div>'
        )
        .join('') || 'Sin movimientos. El stock aún no ha sido contado.';
  } catch (error) {
    if (dialog.isConnected) q('#ledgerBody').textContent = error.message;
  }
}
function collectMaterials() {
  if (!S.product || !q('#materialRecipe')) return;
  S.product.materials = qa('.recipe-row').map(row => ({
    resource_id: row.dataset.resourceId,
    name: row.dataset.name,
    unit: row.dataset.unit,
    unit_cost: n(row.dataset.unitCost),
    quantity: Math.max(0, n(row.querySelector('.recipeQty').value))
  }));
}
function recipeRequirements(p = S.product, quantity = p.quantity) {
  const map = new Map(),
    ratio = n(quantity) / Math.max(1, n(p.quantity));
  const add = (id, qty) => {
    if (id && qty > 0) map.set(id, (map.get(id) || 0) + qty * ratio);
  };
  for (const m of p.materials || []) add(m.resource_id, n(m.quantity));
  for (const print of p.prints || [])
    for (const f of print.filaments || []) add(f.resource_id, n(f.grams) + n(f.purge_grams));
  return [...map].map(([id, qty]) => ({ id, quantity: qty, resource: S.resources.find(r => r.id === id) }));
}
function stockRequirementsMarkup(requirements) {
  return (
    requirements
      .map(x => {
        const r = x.resource,
          bad = !r || !r.active || !r.counted || availableStock(r) < x.quantity;
        return (
          '<div class="resource-row small ' +
          (bad ? 'loss-text' : '') +
          '"><span>' +
          esc(r?.name || 'Material no disponible') +
          '</span><b>' +
          stockNumber(x.quantity) +
          ' ' +
          esc(r?.unit || '') +
          ' / ' +
          (!r?.counted ? 'sin contar' : stockNumber(availableStock(r)) + ' disponibles') +
          '</b></div>'
        );
      })
      .join('') ||
    '<p class="small muted">Sin materiales vinculados al inventario. Los costos manuales no reservan existencias.</p>'
  );
}
function mountNewOrderInventory() {
  const box = document.createElement('section');
  box.className = 'notice';
  box.innerHTML =
    '<b>Reserva de materiales</b><div id="newOrderStock"></div><p class="small muted">Se reservarán al confirmar el pedido. Si falta stock o el conteo inicial, el pedido no se creará.</p>';
  q('#orderFeedback').before(box);
  updateNewOrderStock();
}
function updateNewOrderStock() {
  if (q('#newOrderStock'))
    q('#newOrderStock').innerHTML = stockRequirementsMarkup(
      recipeRequirements(S.product, Math.max(1, n(q('#orderQty').value)))
    );
}
function setupInventoryProduct() {
  const box = document.createElement('section');
  box.id = 'materialRecipe';
  box.className = 'card recipe-card';
  box.innerHTML =
    '<div class="section-title"><h2>Materiales del lote</h2><button type="button" id="addRecipe" class="btn btn-secondary">' +
    icon('plus') +
    'Material</button></div><p class="small muted">Cantidades para ' +
    (Math.max(1, n(S.product.quantity)) === 1 ? '1 unidad' : 'las ' + n(S.product.quantity) + ' unidades') +
    ' del lote. Se suman a los costos directos; los filamentos se vinculan en Impresiones.</p><div class="grid">' +
    (S.product.materials || [])
      .map(
        (m, i) =>
          '<div class="recipe-row" data-resource-id="' +
          esc(m.resource_id) +
          '" data-name="' +
          esc(m.name) +
          '" data-unit="' +
          esc(m.unit) +
          '" data-unit-cost="' +
          n(m.unit_cost) +
          '"><div><b>' +
          esc(m.name) +
          '</b><div class="small muted">' +
          preciseCost(m.unit_cost) +
          ' / ' +
          esc(m.unit) +
          '</div></div><div class="field"><label>Cantidad (' +
          esc(m.unit) +
          ')</label><input class="recipeQty" type="number" min="0" step="0.001" value="' +
          n(m.quantity) +
          '"></div><b class="recipeSubtotal">' +
          clp(n(m.quantity) * n(m.unit_cost)) +
          '</b><button class="btn icon-btn" data-remove-material="' +
          i +
          '" type="button" aria-label="Quitar material" title="Quitar material">' +
          icon('trash-2') +
          '</button></div>'
      )
      .join('') +
    '</div><button id="refreshMaterialPrices" type="button" class="btn btn-secondary">Actualizar precios desde inventario</button><details><summary>Disponibilidad para este lote</summary><div id="recipeStock"></div></details>';
  q('[data-panel="costs"]').prepend(box);
  updateMaterialStatus();
  qa('.filament-row').forEach(row => {
    if (row.dataset.resourceId) {
      row.querySelector('.fn').readOnly = true;
      row.querySelector('.fc').disabled = true;
    }
  });
}
function updateMaterialStatus() {
  if (!q('#materialRecipe')) return;
  qa('.recipe-row').forEach(
    row =>
      (row.querySelector('.recipeSubtotal').textContent = clp(
        n(row.querySelector('.recipeQty').value) * n(row.dataset.unitCost)
      ))
  );
  q('#recipeStock').innerHTML = stockRequirementsMarkup(recipeRequirements());
}
function bindInventoryProduct() {
  if (!canEdit()) return;
  q('#addRecipe').onclick = () => {
    collect();
    const choices = activeResources('supply');
    if (!choices.length) {
      showDialog(
        'recipeDialog',
        '<h2>Agrega materiales al inventario</h2><p>Registra tus marcos, papel y otros insumos en Inventario. Tu producto se conserva como borrador.</p><button class="btn btn-primary" data-close>Volver</button>'
      );
      return;
    }
    const dialog = showDialog(
      'recipeDialog',
      '<div class="section-title"><h2>Material del inventario</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="recipeForm" class="grid"><div class="field"><label for="recipeSelect">Material</label><select id="recipeSelect">' +
        choices
          .map(
            r =>
              '<option value="' +
              r.id +
              '">' +
              esc(r.name) +
              ' · ' +
              preciseCost(r.unit_cost) +
              ' / ' +
              r.unit +
              '</option>'
          )
          .join('') +
        '</select></div>' +
        fieldHtml('Cantidad para el lote', 'recipeAmount', 1, 'number', 'min="0.001" step="0.001" required') +
        '<button class="btn btn-primary" type="submit">Agregar material</button></form>'
    );
    q('#recipeForm').onsubmit = e => {
      e.preventDefault();
      const r = choices.find(x => x.id === q('#recipeSelect').value);
      S.product.materials ??= [];
      S.product.materials.push({
        resource_id: r.id,
        name: r.name,
        unit: r.unit,
        unit_cost: n(r.unit_cost),
        quantity: n(q('#recipeAmount').value)
      });
      S.dirty = true;
      dialog.close();
      render();
    };
  };
  qa('[data-remove-material]').forEach(
    b =>
      (b.onclick = () => {
        collect();
        S.product.materials.splice(n(b.dataset.removeMaterial), 1);
        S.dirty = true;
        render();
      })
  );
  q('#refreshMaterialPrices').onclick = async () => {
    const b = q('#refreshMaterialPrices');
    b.disabled = true;
    try {
      collect();
      await loadResources();
      for (const m of S.product.materials || []) {
        const r = S.resources.find(x => x.id === m.resource_id);
        if (r) {
          m.unit_cost = n(r.unit_cost);
          m.name = r.name;
          m.unit = r.unit;
        }
      }
      for (const p of S.product.prints)
        for (const f of p.filaments || []) {
          const r = S.resources.find(x => x.id === f.resource_id);
          if (r) f.price_per_kg = n(r.price_per_kg);
        }
      for (const p of S.product.prints)
        if (p.filaments?.length) p.filament_cost = Math.round(filamentTotals(p.filaments).cost);
      S.dirty = true;
      render();
    } catch (error) {
      S.err = error.message;
      render();
    } finally {
      b.disabled = false;
    }
  };
}
async function mountOrderInventory(order) {
  const dialog = q('#orderDialog');
  if (!dialog) return;
  const box = document.createElement('section');
  box.className = 'order-inventory';
  box.innerHTML = '<h3>Materiales y stock</h3><div role="status">Cargando reserva…</div>';
  q('#orderForm').before(box);
  try {
    const { data: lines, error } = await supabase
      .from('inventory_order_lines')
      .select('*')
      .eq('workspace_id', S.workspace.id)
      .eq('order_id', order.id)
      .order('name');
    if (error) throw error;
    if (!dialog.isConnected) return;
    const states = {
      none: 'Sin reserva de inventario',
      reserved: 'Reservado · pendiente de consumo',
      consumed: 'Consumo registrado',
      released: 'Reserva liberada'
    };
    box.innerHTML =
      '<h3>Materiales y stock</h3><p class="small"><b>' +
      states[order.inventory_state || 'none'] +
      '</b></p>' +
      (lines || [])
        .map(
          l =>
            '<div class="resource-row small"><span>' +
            esc(l.name) +
            '</span><b>' +
            stockNumber(l.consumed_qty ?? l.quantity) +
            ' ' +
            esc(l.unit) +
            '</b></div>'
        )
        .join('') +
      (order.inventory_state === 'reserved' && canEdit()
        ? '<button id="consumeOrder" class="btn btn-secondary" type="button">Confirmar consumo real</button><p class="small muted">Puedes ajustar las cantidades incluyendo mermas. Marcar Listo o Entregado consume la reserva automáticamente si aún no se confirmó.</p>'
        : order.inventory_state === 'none'
          ? '<p class="small muted">Pedido anterior o producto sin materiales vinculados. No descuenta stock automáticamente.</p>'
          : '');
    box.querySelector('#consumeOrder')?.addEventListener('click', () => showOrderConsumption(order, lines));
  } catch (error) {
    if (dialog.isConnected) box.textContent = 'No se pudo cargar el inventario: ' + error.message;
  }
}
function showOrderConsumption(order, lines) {
  const dialog = showDialog(
    'consumeDialog',
    '<div class="section-title"><h2>Consumo · Pedido #' +
      order.order_no +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="consumeForm" class="grid"><p class="small muted">Ingresa las cantidades realmente utilizadas, incluyendo pérdidas. El stock se descontará una sola vez. Los demás costos del pedido se conservan.</p>' +
      lines
        .map((l, i) =>
          fieldHtml(
            l.name + ' (' + l.unit + ')',
            'consumeQty' + i,
            l.quantity,
            'number',
            'min="0" max="1000000000" step="any" required'
          )
        )
        .join('') +
      '<div id="consumeFeedback" role="status" class="small"></div><button class="btn btn-primary" type="submit">Registrar consumo</button></form>'
  );
  q('#consumeForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      const actual = Object.fromEntries(lines.map((l, i) => [l.resource_id, n(q('#consumeQty' + i).value)]));
      const { error } = await supabase.rpc('inventory_consume_order', {
        p_order: order.id,
        p_actual: actual
      });
      if (error) throw error;
      await loadOrders();
      await loadResources();
      dialog.close();
      q('#orderDialog')?.close();
      render();
      showOrder(S.orders.find(o => o.id === order.id));
    } catch (error) {
      q('#consumeFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
// The PNG mirrors quoteMarkup at 1080 px, a width WhatsApp and Instagram show without resampling.
async function quoteImage(d) {
  const W = 1080,
    P = 64,
    FONT = 'Montserrat,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    INK = '#070A13',
    YELLOW = '#FFD800',
    ACCENT = '#c2126b',
    MUTED = '#697183',
    BODY = '#3d4556',
    SOFT = '#f4f5f8',
    LINE = '#e2e5ea',
    t = quoteTotals(d);
  const load = src =>
    new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      if (/^https?:/.test(src)) i.crossOrigin = 'anonymous';
      i.src = src;
    });
  let photo = null,
    logo = null;
  if (d.photo)
    try {
      photo = await load(d.photo);
    } catch {}
  try {
    logo = await load(LOGO_SRC);
  } catch {}
  // Canvas only uses web fonts that are already loaded.
  try {
    await Promise.all(
      ['400 24px Montserrat', '700 24px Montserrat', '800 24px Montserrat', '900 24px Montserrat'].map(f =>
        document.fonts.load(f)
      )
    );
  } catch {}
  const draw = ctx => {
    const font = (size, weight = 400) => {
        ctx.font = weight + ' ' + size + 'px ' + FONT;
      },
      text = (s, x, y, color, align = 'left') => {
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(s, x, y);
        ctx.textAlign = 'left';
      };
    const fit = (s, max) => {
      s = String(s);
      if (ctx.measureText(s).width <= max) return s;
      while (s && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
      return s + '…';
    };
    const wrap = (s, max) => {
      const lines = [];
      for (const para of String(s || '').split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/)) {
          const next = line ? line + ' ' + word : word;
          if (ctx.measureText(next).width > max && line) {
            lines.push(line);
            line = word;
          } else line = next;
        }
        lines.push(line);
      }
      return lines;
    };
    const box = (x, y, w, h, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    };
    const label = (s, x, y, align) => {
      font(17, 800);
      text(s.toUpperCase(), x, y, MUTED, align);
    };
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, ctx.canvas.height);
    if (logo) ctx.drawImage(logo, P - 8, 26, (logo.width * 138) / logo.height, 138);
    else {
      font(40, 900);
      text('KULTIVERSO POP', P, 112, INK);
    }
    font(17, 800);
    text('COTIZACIÓN', W - P, 84, MUTED, 'right');
    font(30, 800);
    text(d.folio, W - P, 126, INK, 'right');
    const stripe = ctx.createLinearGradient(0, 0, W, 0);
    stripe.addColorStop(0, '#00D7F1');
    stripe.addColorStop(0.5, YELLOW);
    stripe.addColorStop(1, '#FF158F');
    ctx.fillStyle = stripe;
    ctx.fillRect(0, 190, W, 10);
    let y = 262;
    const cols = [P, P + 340, P + 650];
    label('Cliente', cols[0], y);
    label('Fecha', cols[1], y);
    label('Válida hasta', cols[2], y);
    font(23, 700);
    text(fit(d.client || '—', 300), cols[0], y + 38, INK);
    text(fit(longDate(d.date), 295), cols[1], y + 38, INK);
    text(fit(longDate(t.validUntil), W - P - cols[2]), cols[2], y + 38, INK);
    y += 80;
    ctx.fillStyle = LINE;
    ctx.fillRect(P, y, W - 2 * P, 2);
    y += 40;
    if (photo) {
      const h = 420;
      box(P, y, W - 2 * P, h, 20, SOFT);
      const s = Math.min((W - 2 * P - 40) / photo.width, (h - 40) / photo.height),
        w = photo.width * s,
        ph = photo.height * s;
      ctx.drawImage(photo, (W - w) / 2, y + (h - ph) / 2, w, ph);
      y += h + 48;
    }
    font(44, 800);
    for (const line of wrap(d.name, W - 2 * P)) {
      text(line, P, y + 30, INK);
      y += 54;
    }
    if (d.description) {
      y += 6;
      font(26);
      for (const line of wrap(d.description, W - 2 * P)) {
        text(line, P, y + 24, BODY);
        y += 38;
      }
    }
    y += 32;
    const right = W - P - 20,
      cQty = P + 520,
      cPrice = P + 760;
    box(P, y, W - 2 * P, 56, 12, SOFT);
    ctx.textBaseline = 'middle';
    label('Descripción', P + 20, y + 28);
    label('Cant.', cQty, y + 28, 'right');
    label('Precio unit.' + (d.ivaEnabled ? ' c/IVA' : ''), cPrice, y + 28, 'right');
    label('Total', right, y + 28, 'right');
    y += 56;
    font(25, 700);
    const item = wrap(d.name, cQty - P - 110),
      itemLines = item.length > 2 ? [item[0], fit(item.slice(1).join(' '), cQty - P - 110)] : item;
    itemLines.forEach((line, i) => text(line, P + 20, y + 40 + i * 34, INK));
    font(25);
    text(String(d.quantity), cQty, y + 40, INK, 'right');
    text(clp(d.price), cPrice, y + 40, INK, 'right');
    font(25, 800);
    text(clp(t.total), right, y + 40, INK, 'right');
    y += 46 + itemLines.length * 34;
    ctx.fillStyle = LINE;
    ctx.fillRect(P, y, W - 2 * P, 2);
    y += 24;
    const tx = W - P - 440;
    if (d.ivaEnabled)
      for (const [k, v] of [
        ['Neto', clp(t.net)],
        ['IVA (' + pct(d.ivaRate) + ')', clp(t.iva)]
      ]) {
        font(24);
        text(k, tx + 20, y + 22, MUTED);
        font(24, 700);
        text(v, right, y + 22, INK, 'right');
        y += 46;
      }
    box(tx, y + 6, 440, 78, 16, '#fff8d1');
    font(26, 800);
    text('Total a pagar', tx + 24, y + 45, INK);
    font(36, 900);
    text(clp(t.total), W - P - 24, y + 45, ACCENT, 'right');
    ctx.textBaseline = 'alphabetic';
    y += 130;
    ctx.fillStyle = LINE;
    ctx.fillRect(P, y - 30, W - 2 * P, 2);
    label('Plazo de entrega', P, y);
    font(24);
    let ty = y + 38;
    for (const line of wrap(d.delivery || 'Por confirmar', 300)) {
      text(line, P, ty, BODY);
      ty += 34;
    }
    if (d.terms) {
      label('Condiciones', P + 360, y);
      font(24);
      let cy = y + 38;
      for (const line of wrap(d.terms, W - 2 * P - 360)) {
        text(line, P + 360, cy, BODY);
        cy += 34;
      }
      ty = Math.max(ty, cy);
    }
    y = ty + 40;
    const thanks = 'Colecciona · Disfruta · Vive el Kultiverso';
    font(24, 700);
    const contact = d.contact ? wrap(d.contact, W - 2 * P) : [];
    font(22, 700);
    const inline =
        contact.length === 1 &&
        (font(24, 700), ctx.measureText(contact[0]).width) +
          (font(22, 700), ctx.measureText(thanks).width) +
          40 <=
          W - 2 * P,
      footH = inline || !contact.length ? 120 : 80 + contact.length * 36 + 36;
    ctx.fillStyle = INK;
    ctx.fillRect(0, y, W, footH);
    ctx.textBaseline = 'middle';
    if (inline) {
      font(24, 700);
      text(contact[0], P, y + 60, '#fff');
      font(22, 700);
      text(thanks, W - P, y + 60, YELLOW, 'right');
    } else {
      font(24, 700);
      contact.forEach((line, i) => text(line, P, y + 48 + i * 36, '#fff'));
      font(22, 700);
      text(thanks, P, y + 48 + contact.length * 36 + (contact.length ? 8 : 12), YELLOW);
    }
    ctx.textBaseline = 'alphabetic';
    return y + footH;
  };
  // Lay out once to measure, then draw on a canvas of the exact height.
  const probe = document.createElement('canvas');
  probe.width = W;
  probe.height = 4000;
  const height = draw(probe.getContext('2d'));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(Error('No se pudo generar la imagen'))), 'image/png')
  );
}
// Password policy. The free Supabase plan cannot reject leaked passwords on the server, so new
// passwords are checked here against Have I Been Pwned using k-anonymity: only the first five
// characters of the SHA-1 hash leave the device.
const PASSWORD_MIN = 10,
  PASSWORD_HINT =
    'Mínimo ' +
    PASSWORD_MIN +
    ' caracteres, con letras y números. Se revisa que no aparezca en filtraciones conocidas.';
function passwordProblem(pw) {
  if (pw.length < PASSWORD_MIN) return 'La contraseña debe tener al menos ' + PASSWORD_MIN + ' caracteres.';
  if (!/[a-zA-ZÀ-ÿ]/.test(pw) || !/\d/.test(pw)) return 'La contraseña debe combinar letras y números.';
  return '';
}
async function pwnedCount(pw) {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw)))]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase(),
    prefix = hash.slice(0, 5),
    suffix = hash.slice(5);
  const res = await fetch('https://api.pwnedpasswords.com/range/' + prefix);
  if (!res.ok) throw Error('HIBP ' + res.status);
  for (const line of (await res.text()).split('\n')) {
    const [s, c] = line.trim().split(':');
    if (s === suffix) return parseInt(c, 10) || 0;
  }
  return 0;
}
// The leak check fails open: if the service is unreachable, the length and character rules still apply.
async function checkNewPassword(pw) {
  const problem = passwordProblem(pw);
  if (problem) return problem;
  try {
    if ((await pwnedCount(pw)) > 0)
      return 'Esta contraseña aparece en filtraciones de datos conocidas. Elige otra distinta.';
  } catch (e) {
    console.warn('No se pudo revisar la contraseña en filtraciones', e);
  }
  return '';
}
function showPasswordDialog() {
  const dialog = showDialog(
    'passwordDialog',
    '<div class="section-title"><h2>Cambiar contraseña</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="passwordForm" class="grid"><p class="small muted">' +
      esc(PASSWORD_HINT) +
      '</p>' +
      fieldHtml(
        'Nueva contraseña',
        'newPassword',
        '',
        'password',
        'required autocomplete="new-password" minlength="' + PASSWORD_MIN + '"'
      ) +
      fieldHtml(
        'Repite la contraseña',
        'repeatPassword',
        '',
        'password',
        'required autocomplete="new-password"'
      ) +
      '<div id="passwordFeedback" role="status" class="small"></div><button class="btn btn-primary" type="submit">Guardar contraseña</button></form>'
  );
  enhanceFields();
  q('#passwordForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]'),
      feedback = q('#passwordFeedback'),
      pw = q('#newPassword').value;
    if (b.disabled) return;
    if (pw !== q('#repeatPassword').value) {
      feedback.textContent = 'Las contraseñas no coinciden.';
      return;
    }
    b.disabled = true;
    feedback.textContent = 'Revisando…';
    try {
      const problem = await checkNewPassword(pw);
      if (problem) throw Error(problem);
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      dialog.close();
      S.msg = 'Contraseña actualizada.';
      render();
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}

// Lucide icons (ISC license), inlined so the app needs no icon CDN.
