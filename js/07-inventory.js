'use strict';
// Inventario: materiales, movimientos de stock, ficha del material, modo conteo, recetas, reservas de pedidos y lista de compras.
// V1.3: shared resources, selling prices and production snapshots.
async function loadResources() {
  const { data, error } = await supabase
    .from('workspace_resources')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('name');
  if (error) throw error;
  // Deleted materials and printers stay in the database for past history only.
  S.resources = (data || []).filter(r => !r.deleted_at);
}
function activeResources(kind) {
  return S.resources.filter(r => r.kind === kind && r.active);
}
// V1.4: counted inventory, durable material recipes and atomic order stock.
const INVENTORY_UNITS = {
  un: 'unidades',
  hoja: 'hojas',
  m: 'metros',
  g: 'gramos',
  kg: 'kilogramos',
  l: 'litros'
};
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
    (low.length ? 'Ver lista de compras →' : 'Revisar inventario →');
  el.onclick = () => (low.length ? showShoppingList() : goMode('inventory'));
  q('main')?.prepend(el);
}
function showInventoryForm(r = { kind: 'supply', active: true, unit: 'un' }) {
  if (!canEdit()) return;
  const priceLabel = kind => (kind === 'filament' ? 'Precio por kg CLP' : 'Precio por unidad CLP');
  const dialog = showDialog(
    'inventoryFormDialog',
    '<div class="section-title"><h2>' +
      (r.id ? 'Editar material' : 'Nuevo material') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="inventoryForm" class="grid"><div class="field"><label for="invKind">Tipo</label><select id="invKind" ' +
      (r.id ? 'disabled' : '') +
      '><option value="supply">Insumo</option><option value="filament">Filamento</option></select></div>' +
      fieldHtml('Nombre', 'invName', r.name, 'text', 'required maxlength="160"') +
      fieldHtml('Marca / material / referencia', 'invMaterial', r.material) +
      '<div class="grid grid-2"><div class="field"><label for="invUnit">Se cuenta en</label><select id="invUnit" ' +
      (r.counted ? 'disabled' : '') +
      '>' +
      Object.entries(INVENTORY_UNITS)
        .map(([k, v]) => '<option value="' + k + '">' + v + '</option>')
        .join('') +
      '</select></div>' +
      fieldHtml('Color', 'invColor', r.color || '#303030', 'color') +
      fieldHtml(
        priceLabel(r.kind),
        'invCost',
        r.kind === 'filament' ? Math.round(n(r.price_per_kg) * 100) / 100 : (r.unit_cost ?? 0),
        'number',
        'min="0" max="1000000000" step="any" required inputmode="decimal"'
      ) +
      fieldHtml(
        'Cantidad que tienes',
        'invQty',
        r.counted ? Math.round(n(r.stock_qty) * 1000) / 1000 : '',
        'number',
        'min="0" max="1000000000" step="any" inputmode="decimal" placeholder="' +
          (r.counted ? '' : 'Ej. 10') +
          '"'
      ) +
      fieldHtml(
        'Avisarme cuando queden',
        'invMin',
        r.min_stock ?? 0,
        'number',
        'min="0" max="1000000000" step="any" required inputmode="decimal"'
      ) +
      '</div><p class="small muted">' +
      (r.counted
        ? 'Si cambias la cantidad se guarda como corrección en el historial. Para registrar una compra usa «+ Ingreso», que además promedia el precio. Los productos toman el precio nuevo al tocar «Actualizar precios».'
        : 'Escribe cuánto tienes ahora para empezar a controlar el stock. Puedes dejarlo vacío y hacerlo después.') +
      '</p><label class="small"><input id="invActive" type="checkbox" ' +
      (r.active ? 'checked' : '') +
      '> Disponible para nuevos productos y pedidos</label><div id="invFeedback" role="status" class="small"></div><div class="dialog-actions">' +
      (r.id
        ? '<button type="button" class="btn btn-ghost" id="invArchive">' +
          icon(r.active ? 'archive' : 'archive-restore') +
          (r.active ? 'Archivar' : 'Restaurar') +
          '</button><button type="button" class="btn btn-ghost danger-text" id="invDelete">' +
          icon('trash-2') +
          'Eliminar</button>'
        : '') +
      '<button class="btn btn-primary" type="submit">Guardar</button></div></form>'
  );
  q('#invKind').value = r.kind;
  q('#invUnit').value = r.unit || 'un';
  const updateKind = () => {
    q('label[for=invCost]').textContent = priceLabel(q('#invKind').value);
    if (q('#invKind').value === 'filament') {
      q('#invUnit').value = 'g';
      q('#invUnit').disabled = true;
    } else q('#invUnit').disabled = !!r.counted;
    q('label[for=invQty]').textContent = 'Cantidad que tienes (' + INVENTORY_UNITS[q('#invUnit').value] + ')';
  };
  updateKind();
  q('#invKind').onchange = updateKind;
  q('#invUnit').onchange = updateKind;
  q('#invArchive')?.addEventListener('click', async () => {
    dialog.close();
    await archiveResource(r, !r.active);
  });
  q('#invDelete')?.addEventListener('click', async () => {
    dialog.close();
    await deleteResource(r);
  });
  q('#inventoryForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const kind = q('#invKind').value,
        cost = n(q('#invCost').value),
        unitCost = kind === 'filament' ? cost / 1000 : cost,
        qtyText = q('#invQty').value.trim(),
        v = {
          name: q('#invName').value.trim(),
          material: q('#invMaterial').value.trim(),
          unit: kind === 'filament' ? 'g' : q('#invUnit').value,
          color: q('#invColor').value,
          min_stock: n(q('#invMin').value),
          active: q('#invActive').checked,
          unit_cost: unitCost,
          price_per_kg: kind === 'filament' ? cost : 0
        };
      const query = r.id
        ? supabase.from('workspace_resources').update(v).eq('id', r.id).eq('workspace_id', S.workspace.id)
        : supabase.from('workspace_resources').insert({ ...v, kind, workspace_id: S.workspace.id });
      const { data, error } = await query.select().single();
      if (error) throw error;
      // The quantity typed here becomes the first count, or a correction of the current one.
      if (qtyText !== '') {
        const qty = Math.max(0, n(qtyText)),
          id = r.id || data.id,
          change = r.counted ? qty - n(r.stock_qty) : qty;
        if (r.counted && qty < n(r.reserved_qty))
          throw Error(
            'No puedes quedar con menos de ' +
              stockNumber(r.reserved_qty) +
              ': están reservadas para pedidos.'
          );
        if (!r.counted || change !== 0) {
          const { error: me } = await supabase.from('inventory_movements').insert({
            workspace_id: S.workspace.id,
            resource_id: id,
            kind: r.counted ? 'adjustment' : 'opening',
            quantity: change,
            unit_cost: unitCost,
            note: r.counted ? 'Cantidad corregida' : 'Stock inicial',
            request_key: crypto.randomUUID()
          });
          if (me) throw me;
        }
        await markCounted([id]);
      }
      await loadResources();
      dialog.close();
      toast('Material guardado.');
      inventoryView();
    } catch (error) {
      q('#invFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  enhanceFields();
}
async function archiveResource(r, active) {
  const { error } = await supabase
    .from('workspace_resources')
    .update({ active })
    .eq('id', r.id)
    .eq('workspace_id', S.workspace.id);
  if (error) return toast(error.message, 'error');
  await loadResources();
  toast(
    active
      ? '«' + r.name + '» vuelve a estar disponible.'
      : '«' + r.name + '» archivado: ya no aparece al crear productos.'
  );
  if (S.mode === 'inventory') inventoryView();
  else render();
}
// What still depends on a material: orders that reserved or used it and product recipes or prints.
async function resourceUsage(r) {
  const [lines, products, prints] = await Promise.all([
    supabase
      .from('inventory_order_lines')
      .select('order_id')
      .eq('workspace_id', S.workspace.id)
      .eq('resource_id', r.id)
      .limit(1),
    supabase
      .from('products')
      .select('name')
      .eq('workspace_id', S.workspace.id)
      .contains('materials', JSON.stringify([{ resource_id: r.id }])),
    supabase
      .from('print_jobs')
      .select('product_id')
      .contains('filaments', JSON.stringify([{ resource_id: r.id }]))
  ]);
  for (const x of [lines, products, prints]) if (x.error) throw x.error;
  const names = new Set((products.data || []).map(p => p.name));
  for (const j of prints.data || []) {
    const p = S.products.find(x => x.id === j.product_id);
    if (p) names.add(p.name);
  }
  return { orders: (lines.data || []).length > 0, products: [...names] };
}
// Deleting hides the material for good (its history stays for past orders); used ones must be archived.
async function deleteResource(r) {
  let usage;
  try {
    usage = await resourceUsage(r);
  } catch (error) {
    return toast(error.message, 'error');
  }
  if (usage.orders || usage.products.length) {
    const archive = await confirmDialog({
      title: 'No se puede eliminar',
      body:
        (usage.products.length
          ? '«' +
            r.name +
            '» lo usan estos productos: ' +
            usage.products.join(', ') +
            '. Quítalo de ellos primero. '
          : '«' + r.name + '» ya se usó en pedidos. ') +
        'Puedes archivarlo: deja de aparecer al crear productos y se conserva el historial.',
      confirmLabel: r.active ? 'Archivar' : 'Entendido'
    });
    if (archive && r.active) await archiveResource(r, false);
    return;
  }
  if (
    !(await confirmDialog({
      title: 'Eliminar ' + r.name,
      body: 'Desaparece del inventario y de las listas. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true
    }))
  )
    return;
  const { error } = await supabase
    .from('workspace_resources')
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq('id', r.id)
    .eq('workspace_id', S.workspace.id);
  if (error) return toast(error.message, 'error');
  await loadResources();
  toast('«' + r.name + '» eliminado.');
  if (S.mode === 'inventory') inventoryView();
  else render();
}
// V3.6: plain-language stock changes. mode: 'in' (purchase), 'set' (fix the count), 'out' (use, loss, gift).
// A material that was never counted always starts with its first count.
const STOCK_OUT_REASONS = ['Usado en un trabajo', 'Se dañó o se perdió', 'Regalo o muestra', 'Otro motivo'];
function stockPriceLabel(r) {
  const one = { un: 'unidad', hoja: 'hoja', m: 'metro', g: 'gramo', kg: 'kilo', l: 'litro' };
  return r.kind === 'filament' ? 'Precio por kg' : 'Precio por ' + (one[r.unit] || r.unit);
}
const shownPrice = r =>
  r.kind === 'filament' ? Math.round(n(r.unit_cost) * 1000) : Math.round(n(r.unit_cost) * 1000) / 1000;
const priceToUnitCost = (r, price) => (r.kind === 'filament' ? n(price) / 1000 : n(price));
function showStockMovement(r, mode = 'in') {
  if (!canEdit()) return;
  if (!r.counted) mode = 'first';
  const key = crypto.randomUUID(),
    titles = {
      first: 'Stock inicial',
      in: 'Ingreso',
      set: 'Ajustar al real',
      out: 'Salida'
    },
    unitName = INVENTORY_UNITS[r.unit] || r.unit,
    priced = mode === 'first' || mode === 'in';
  const dialog = showDialog(
    'stockDialog',
    '<div class="section-title"><h2>' +
      titles[mode] +
      ' · ' +
      esc(r.name) +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><p class="small muted">' +
      (r.counted
        ? 'Tienes ' +
          stockNumber(r.stock_qty) +
          ' ' +
          esc(unitName) +
          (n(r.reserved_qty) ? ' (' + stockNumber(r.reserved_qty) + ' reservadas para pedidos)' : '') +
          '.'
        : 'Aún no registras cuánto tienes. Escribe la cantidad actual para empezar a controlarlo.') +
      '</p><form id="stockForm" class="grid"><input type="hidden" id="stockKind" value="' +
      { first: 'opening', in: 'purchase', set: 'adjustment', out: 'loss' }[mode] +
      '">' +
      fieldHtml(
        mode === 'set' || mode === 'first'
          ? 'Cantidad que tienes ahora (' + unitName + ')'
          : mode === 'in'
            ? 'Cantidad que entra (' + unitName + ')'
            : 'Cantidad que sale (' + unitName + ')',
        'stockQuantity',
        mode === 'set' ? String(Math.round(n(r.stock_qty) * 1000) / 1000) : '',
        'number',
        'min="0" max="1000000000" step="any" required inputmode="decimal"'
      ) +
      (priced
        ? fieldHtml(
            stockPriceLabel(r) + ' (CLP)',
            'stockPrice',
            shownPrice(r) || '',
            'number',
            'min="0" max="1000000000" step="any" required inputmode="decimal"'
          )
        : '') +
      (mode === 'out'
        ? '<div class="field"><label for="stockReason">Motivo</label><select id="stockReason">' +
          STOCK_OUT_REASONS.map(x => '<option>' + x + '</option>').join('') +
          '</select></div>'
        : '') +
      '<div id="stockPreview" class="notice small" role="status"></div><div class="field"><label for="stockNote">Nota (opcional)</label><input id="stockNote" maxlength="500" placeholder="' +
      (mode === 'in' ? 'Proveedor o boleta' : 'Detalle') +
      '"></div><div id="stockFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Guardar</button></form>'
  );
  const values = () => {
    const qty = Math.max(0, n(q('#stockQuantity').value)),
      quantity = mode === 'set' ? qty - n(r.stock_qty) : mode === 'out' ? -qty : qty,
      unitCost = priced ? priceToUnitCost(r, q('#stockPrice').value) : n(r.unit_cost);
    return { qty, quantity, unitCost };
  };
  const preview = () => {
    const { qty, quantity, unitCost } = values(),
      after = mode === 'first' ? qty : n(r.stock_qty) + quantity;
    q('#stockPreview').textContent =
      (priced && qty > 0
        ? 'Total: ' + clp(qty * unitCost) + ' · ' + preciseCost(unitCost) + ' por ' + r.unit + '. '
        : '') +
      (qty > 0 || mode === 'set'
        ? 'Quedarás con ' + stockNumber(Math.max(0, after)) + ' ' + unitName + '.'
        : '');
  };
  q('#stockQuantity').oninput = preview;
  q('#stockPrice')?.addEventListener('input', preview);
  mountStockHelpers(r, mode);
  preview();
  q('#stockForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const { quantity, unitCost } = values();
      if (mode !== 'first' && quantity === 0)
        throw Error('La cantidad es la misma: no hay nada que cambiar.');
      if (mode !== 'first' && n(r.stock_qty) + quantity < n(r.reserved_qty))
        throw Error(
          'No puedes quedar con menos de ' +
            stockNumber(r.reserved_qty) +
            ' ' +
            unitName +
            ': están reservadas para pedidos.'
        );
      const note = [mode === 'out' ? q('#stockReason').value : '', q('#stockNote').value.trim()]
        .filter(Boolean)
        .join(' · ');
      const { error } = await supabase.from('inventory_movements').insert({
        workspace_id: S.workspace.id,
        resource_id: r.id,
        kind: q('#stockKind').value,
        quantity,
        unit_cost: unitCost,
        note,
        request_key: key
      });
      if (error && error.code !== '23505') throw error;
      if (mode === 'set' || mode === 'first') await markCounted([r.id]);
      await loadResources();
      dialog.close();
      toast('Stock de ' + r.name + ' actualizado.');
      if (S.mode === 'inventory') inventoryView();
      else render();
      dialog.dispatchEvent(new CustomEvent('stocksaved'));
    } catch (error) {
      q('#stockFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  enhanceFields();
  return dialog;
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
          : '') +
      // V4.7: take the product's current recipe even when the cost did not change.
      (canEdit() && order.product_id && !order.from_stock && order.status !== 'canceled'
        ? '<button id="syncOrderMaterials" class="btn btn-ghost btn-sm" type="button">' +
          icon('refresh-cw') +
          'Usar materiales actuales del producto</button>'
        : '');
    box.querySelector('#consumeOrder')?.addEventListener('click', () => showOrderConsumption(order, lines));
    box.querySelector('#syncOrderMaterials')?.addEventListener('click', async e => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        await updateOrderCosts([order], productUnitCost(order.product_id));
        toast('Materiales del pedido actualizados según el producto.');
        dialog.close();
        render();
        showOrder(S.orders.find(o => o.id === order.id) || order);
      } catch (error) {
        toast(error.message, 'error');
        b.disabled = false;
      }
    });
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
// After saving a product created from a custom job, offer to link it to that order.
// A material without its first count blocks reserving it. Offer to count it now and retry the action.
async function offerStockCount(error, retry) {
  const m = /stock inicial de (.+?) antes/.exec(error?.message || '');
  if (!m || !canEdit()) return false;
  if (!S.resources.length) await loadResources().catch(() => {});
  const r = S.resources.find(x => x.name === m[1] && !x.counted);
  if (!r) return false;
  const ok = await confirmDialog({
    title: 'Falta la cantidad de ' + r.name,
    body:
      'Para reservar materiales, la app necesita saber cuántas «' +
      r.name +
      '» tienes. Escríbelo ahora y la acción se completa sola.',
    confirmLabel: 'Registrar cantidad'
  });
  if (!ok) {
    toast('Cuando registres la cantidad de ' + r.name + ' en Inventario, podrás vincularlo desde el pedido.');
    return true;
  }
  const dialog = showStockMovement(r);
  dialog?.addEventListener('stocksaved', () => retry(), { once: true });
  return true;
}
function stockLevel(r) {
  const min = n(r.min_stock),
    avail = availableStock(r);
  return { avail, min, ratio: min > 0 ? Math.max(0, Math.min(1, avail / (min * 2))) : 1 };
}
function inventoryState(r) {
  if (!r.active) return ['Inactivo', 'c-cancel'];
  if (!r.counted) return ['Sin conteo', 'c-pend'];
  if (availableStock(r) <= n(r.min_stock)) return ['Stock bajo', 'c-late'];
  return ['Disponible', 'c-ready'];
}
function inventoryMatches(r, filter) {
  if (filter === 'low') return r.active && r.counted && availableStock(r) <= n(r.min_stock);
  if (filter === 'uncounted') return r.active && !r.counted;
  if (filter === 'filament') return r.kind === 'filament';
  if (filter === 'supply') return r.kind === 'supply';
  return true;
}
function inventoryActions(r) {
  const item = (attr, ic, label, cls = '') =>
    '<button type="button" class="btn' +
    cls +
    '" ' +
    attr +
    '="' +
    r.id +
    '">' +
    icon(ic) +
    label +
    '</button>';
  return (
    (canEdit()
      ? r.counted
        ? '<button class="btn btn-secondary btn-sm icon-only" type="button" data-stock="' +
          r.id +
          '" aria-label="Ingreso de ' +
          esc(r.name) +
          '" title="Ingreso">' +
          icon('plus') +
          '</button><button class="btn btn-secondary btn-sm icon-only" type="button" data-stock-out="' +
          r.id +
          '" aria-label="Salida de ' +
          esc(r.name) +
          '" title="Salida">' +
          icon('minus') +
          '</button>'
        : '<button class="btn btn-secondary btn-sm" type="button" data-stock="' +
          r.id +
          '">Contar stock</button>'
      : '') +
    '<details class="row-menu"><summary class="btn icon-btn" aria-label="Acciones de ' +
    esc(r.name) +
    '">' +
    icon('ellipsis-vertical') +
    '</summary><div class="menu-pop">' +
    item('data-material', 'layers', canEdit() ? 'Abrir ficha (editar todo)' : 'Abrir ficha') +
    (canEdit() && r.counted ? item('data-stock-set', 'refresh-cw', 'Ajustar al real') : '') +
    (canEdit()
      ? item(
          'data-inventory-archive',
          r.active ? 'archive' : 'archive-restore',
          r.active ? 'Archivar' : 'Restaurar'
        ) + item('data-inventory-delete', 'trash-2', 'Eliminar', ' danger-text')
      : '') +
    '</div></details>'
  );
}
function inventoryView() {
  if (S.inventoryOnlyLow) S.inventoryFilter = 'low';
  const items = inventoryItems(),
    filter = S.inventoryFilter || 'all',
    term = (S.inventorySearch || '').toLocaleLowerCase('es'),
    list = items
      .filter(r => inventoryMatches(r, filter))
      .filter(r => (r.name + ' ' + (r.material || '')).toLocaleLowerCase('es').includes(term))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es')),
    value = items.filter(r => r.counted).reduce((sum, r) => sum + n(r.stock_qty) * n(r.unit_cost), 0),
    count = f => items.filter(r => inventoryMatches(r, f)).length;
  const qty = (v, r) => stockNumber(v) + ' <span class="unit">' + esc(r.unit) + '</span>';
  root.innerHTML =
    header(
      'Inventario',
      '<button id="shoppingList" class="btn btn-secondary" type="button" aria-label="Lista de compras" title="Lista de compras">' +
        icon('shopping-cart') +
        '<span>Lista de compras</span></button>' +
        (canEdit()
          ? '<button id="addInventory" class="btn btn-primary">' +
            icon('plus') +
            '<span>Material</span></button>'
          : '')
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="summary-strip"><div><span>Valor materia prima</span><b class="num">' +
    clp(value) +
    '</b></div><div><span>Bajo mínimo</span><b class="num ' +
    (count('low') ? 'down' : '') +
    '">' +
    count('low') +
    '</b></div><div><span>Sin conteo</span><b class="num ' +
    (count('uncounted') ? 'warn' : '') +
    '">' +
    count('uncounted') +
    '</b></div><div><span>Materiales</span><b class="num">' +
    items.length +
    '</b></div></div>' +
    countReminder() +
    '<div class="toolbar">' +
    searchBox('inventorySearch', 'Buscar material', S.inventorySearch) +
    (canEdit()
      ? '<button id="stockCount" class="btn btn-secondary" type="button">' +
        icon('clipboard-check') +
        '<span>Modo conteo</span></button>'
      : '') +
    '<button id="reloadInventory" class="btn icon-btn" type="button" aria-label="Actualizar" title="Actualizar">' +
    icon('refresh-cw') +
    '</button></div>' +
    filterPills(
      [
        ['all', 'Todos', items.length],
        ['low', 'Bajo mínimo', count('low')],
        ['uncounted', 'Sin conteo', count('uncounted')],
        ['filament', 'Filamentos', count('filament')],
        ['supply', 'Insumos', count('supply')]
      ],
      filter,
      'data-inventory-filter'
    ) +
    '<section class="panel">' +
    (list.length
      ? '<div class="inv-head"><span>Material</span><span>Disponible</span><span>Reservado</span><span>Mínimo</span><span>Costo</span><span>Estado</span><span></span></div>' +
        list
          .map(r => {
            const [label, cls] = inventoryState(r);
            return (
              '<div class="inv-row' +
              (!r.active ? ' archived' : '') +
              '" data-material-row="' +
              r.id +
              '"><div class="prod-cell inv-name"><span class="swatch" style="background:' +
              (/^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#303a4d') +
              '"></span><div><b>' +
              esc(r.name) +
              '</b><span>' +
              (r.kind === 'filament' ? 'Filamento' : 'Insumo') +
              (r.material ? ' · ' + esc(r.material) : '') +
              '</span>' +
              (r.counted ? levelBar(r) : '') +
              '</div></div><div class="inv-num inv-avail" data-label="Disponible"><b>' +
              qty(availableStock(r), r) +
              '</b></div><div class="inv-num inv-reserved" data-label="Reservado">' +
              qty(r.reserved_qty, r) +
              '</div><div class="inv-num inv-min" data-label="Mínimo">' +
              qty(r.min_stock, r) +
              '</div><div class="inv-num inv-cost" data-label="Costo">' +
              preciseCost(r.unit_cost) +
              ' <span class="unit">/ ' +
              esc(r.unit) +
              '</span></div><div class="inv-state"><span class="chip ' +
              cls +
              '">' +
              label +
              '</span></div><div class="row-actions">' +
              inventoryActions(r) +
              '</div></div>'
            );
          })
          .join('')
      : '<div class="panel-empty">' +
        icon('boxes') +
        '<b>' +
        (items.length ? 'Sin materiales para este filtro' : 'Aún no hay materiales') +
        '</b><span>' +
        (items.length ? 'Prueba con otro filtro.' : 'Agrega filamentos, marcos, papel y otros insumos.') +
        '</span></div>') +
    '</section><p class="small muted footnote">Disponible = físico − reservado. Costo promedio ponderado; filamentos en gramos.</p></main>';
  common();
  bindSearch('inventorySearch', v => (S.inventorySearch = v), inventoryView);
  qa('[data-inventory-filter]').forEach(
    b =>
      (b.onclick = () => {
        S.inventoryOnlyLow = false;
        S.inventoryFilter = b.dataset.inventoryFilter;
        inventoryView();
      })
  );
  q('#reloadInventory').onclick = () => goMode('inventory');
  q('#addInventory')?.addEventListener('click', () => showInventoryForm());
  q('#shoppingList').onclick = () => showShoppingList();
  qa('[data-stock]').forEach(
    b => (b.onclick = () => showStockMovement(S.resources.find(r => r.id === b.dataset.stock)))
  );
  qa('[data-material]').forEach(b => (b.onclick = () => openMaterial(b.dataset.material)));
  q('#stockCount')?.addEventListener('click', () => goMode('stockcount'));
  q('#countReminder')?.addEventListener('click', () => goMode('stockcount'));
  // Tapping a row (outside its buttons and menu) opens the material sheet.
  qa('[data-material-row]').forEach(
    row =>
      (row.onclick = e => {
        if (e.target.closest('button,summary,details,a,input')) return;
        openMaterial(row.dataset.materialRow);
      })
  );
  const byId = id => S.resources.find(r => r.id === id);
  qa('[data-stock-set]').forEach(b => (b.onclick = () => showStockMovement(byId(b.dataset.stockSet), 'set')));
  qa('[data-stock-out]').forEach(b => (b.onclick = () => showStockMovement(byId(b.dataset.stockOut), 'out')));
  qa('[data-inventory-archive]').forEach(
    b =>
      (b.onclick = () =>
        archiveResource(byId(b.dataset.inventoryArchive), !byId(b.dataset.inventoryArchive).active))
  );
  qa('[data-inventory-delete]').forEach(
    b => (b.onclick = () => deleteResource(byId(b.dataset.inventoryDelete)))
  );
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
// ---------------------------------------------------------------------------
// V4.9: «Ficha del material». Everything about one material on its own page: summary,
// stock actions (in, out, set to the real count, weighing the spool), editable data, price,
// history with undo, and where it is used. Plus «Modo conteo» to count everything at once.
// ---------------------------------------------------------------------------
const MOVEMENT_KINDS = {
  opening: 'Stock inicial',
  purchase: 'Ingreso',
  adjustment: 'Ajuste',
  loss: 'Salida',
  consumption: 'Usado en pedido'
};
const isFilament = r => r?.kind === 'filament';
const unitWord = r => INVENTORY_UNITS[r.unit] || r.unit;
const qtyText = (v, r) =>
  stockNumber(Math.round(n(v) * 1000) / 1000) + ' ' + (isFilament(r) ? 'g' : unitWord(r));
// Grams left on a spool weighed with its empty spool (tare).
const spoolGrams = (gross, tare) => Math.max(0, Math.round((n(gross) - n(tare)) * 10) / 10);
// Physical count reminder: every material should be counted at least once a month.
const COUNT_EVERY_DAYS = 30;
const daysSince = iso => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null);
function countAgo(r) {
  const d = daysSince(r.counted_at);
  return d == null
    ? 'Nunca contado'
    : d < 1
      ? 'Contado hoy'
      : d === 1
        ? 'Contado ayer'
        : 'Contado hace ' + d + ' días';
}
const countIsDue = r => r.active && (!r.counted_at || daysSince(r.counted_at) >= COUNT_EVERY_DAYS);
const countDue = () => inventoryItems().filter(countIsDue);
async function markCounted(ids) {
  if (!ids.length) return;
  const at = new Date().toISOString(),
    { error } = await supabase
      .from('workspace_resources')
      .update({ counted_at: at })
      .eq('workspace_id', S.workspace.id)
      .in('id', ids);
  if (error) throw error;
  for (const r of S.resources) if (ids.includes(r.id)) r.counted_at = at;
}
function countReminder() {
  const due = canEdit() ? countDue() : [];
  if (!due.length) return '';
  return (
    '<button type="button" class="notice inventory-alert count-alert" id="countReminder">' +
    icon('clipboard-check') +
    '<span>' +
    (due.length === 1
      ? '«' + esc(due[0].name) + '» lleva más de ' + COUNT_EVERY_DAYS + ' días sin conteo físico.'
      : due.length + ' materiales llevan más de ' + COUNT_EVERY_DAYS + ' días sin conteo físico.') +
    ' <b>Hacer conteo →</b></span></button>'
  );
}
function openMaterial(id) {
  if (!S.resources.some(r => r.id === id)) return toast('Ese material ya no existe.', 'error');
  S.materialId = id;
  goMode('material');
}
const currentMaterial = () => S.resources.find(r => r.id === S.materialId);
function levelBar(r) {
  const avail = Math.max(0, availableStock(r)),
    min = n(r.min_stock),
    full = Math.max(avail, min * 2, 1),
    pct = Math.round((avail / full) * 100),
    cls = !r.counted ? '' : avail <= 0 ? 'empty' : avail <= min ? 'low' : 'ok';
  return (
    '<span class="level ' +
    cls +
    '" role="img" aria-label="Nivel de stock"><i style="width:' +
    Math.min(100, pct) +
    '%"></i>' +
    (min > 0 ? '<b style="left:' + Math.min(100, Math.round((min / full) * 100)) + '%"></b>' : '') +
    '</span>'
  );
}
// ---- The page ----
function materialView() {
  const r = currentMaterial();
  if (!r) {
    S.mode = 'inventory';
    return render();
  }
  const edit = canEdit(),
    [state, stateCls] = inventoryState(r),
    swatch = /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#303a4d',
    value = r.counted ? n(r.stock_qty) * n(r.unit_cost) : 0,
    tile = (label, v, cls = '') =>
      '<div class="mat-num ' + cls + '"><span>' + label + '</span><b class="num">' + v + '</b></div>';
  root.innerHTML =
    header(r.name, '', { back: true }) +
    '<main class="shell material-page">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<section class="panel mat-hero"><div class="mat-title"><span class="swatch big" style="background:' +
    swatch +
    '"></span><div><h2>' +
    esc(r.name) +
    '</h2><span class="small muted">' +
    (isFilament(r) ? 'Filamento' : 'Insumo') +
    (r.material ? ' · ' + esc(r.material) : '') +
    '</span></div><span class="chip ' +
    stateCls +
    '">' +
    state +
    '</span></div>' +
    (r.counted
      ? '<div class="mat-nums">' +
        tile('Tienes', qtyText(r.stock_qty, r)) +
        tile('Reservado', qtyText(r.reserved_qty, r)) +
        tile(
          'Disponible',
          qtyText(availableStock(r), r),
          availableStock(r) <= n(r.min_stock) ? 'down' : 'up'
        ) +
        tile('Mínimo', qtyText(r.min_stock, r)) +
        '</div>' +
        levelBar(r) +
        '<p class="small muted mat-value">Valor en stock <b>' +
        clp(value) +
        '</b>' +
        (isFilament(r) && n(r.spool_net_g) > 0
          ? ' · ≈ ' +
            stockNumber(Math.round((n(r.stock_qty) / n(r.spool_net_g)) * 10) / 10) +
            ' rollos de ' +
            stockNumber(r.spool_net_g) +
            ' g'
          : '') +
        '</p><p class="small mat-counted ' +
        (countIsDue(r) ? 'warn' : 'muted') +
        '">' +
        icon('clipboard-check') +
        countAgo(r) +
        (countIsDue(r) ? ' · conviene contarlo de nuevo' : '') +
        '</p>'
      : '<p class="notice small">Aún no registras cuánto tienes de este material. Cuéntalo para empezar a controlar su stock.</p>') +
    (edit
      ? '<div class="mat-actions">' +
        (r.counted
          ? '<button type="button" class="btn btn-primary" data-mat-move="in">' +
            icon('plus') +
            'Ingreso</button><button type="button" class="btn btn-secondary" data-mat-move="out">' +
            icon('minus') +
            'Salida</button><button type="button" class="btn btn-secondary" data-mat-move="set">' +
            icon(isFilament(r) ? 'scale' : 'refresh-cw') +
            'Ajustar al real</button>'
          : '<button type="button" class="btn btn-primary" data-mat-move="first">' +
            icon(isFilament(r) ? 'scale' : 'plus') +
            'Contar stock</button>') +
        '</div>'
      : '') +
    '</section><div class="mat-grid">' +
    materialDataForm(r, edit) +
    '<div class="mat-col">' +
    materialPriceCard(r, edit) +
    '<section class="panel mat-card"><div class="panel-h"><h2>' +
    icon('layers') +
    'Dónde se usa</h2></div><div class="mat-body" id="matUsage"><span class="small muted">Cargando…</span></div></section></div></div>' +
    '<section class="panel mat-card"><div class="panel-h"><h2>' +
    icon('history') +
    'Historial</h2></div><div class="mat-body" id="matHistory"><span class="small muted">Cargando movimientos…</span></div></section>' +
    (edit
      ? '<div class="mat-danger"><button type="button" class="btn btn-ghost" id="matArchive">' +
        icon(r.active ? 'archive' : 'archive-restore') +
        (r.active ? 'Archivar' : 'Restaurar') +
        '</button><button type="button" class="btn btn-ghost danger-text" id="matDelete">' +
        icon('trash-2') +
        'Eliminar</button></div>'
      : '') +
    '</main>';
  common();
  q('#back').onclick = () => (history.length > 1 && location.hash ? history.back() : goMode('inventory'));
  bindMaterialPage(r);
  loadMaterialHistory(r);
  loadMaterialUsage(r);
}
function materialDataForm(r, edit) {
  const dis = edit ? '' : ' disabled';
  return (
    '<section class="panel mat-card"><div class="panel-h"><h2>' +
    icon('pencil') +
    'Datos</h2></div><form id="matForm" class="mat-body grid">' +
    fieldHtml('Nombre', 'matName', r.name, 'text', 'required maxlength="160"' + dis) +
    fieldHtml('Marca / referencia', 'matBrand', r.material, 'text', 'maxlength="160"' + dis) +
    '<div class="grid grid-2">' +
    fieldHtml(
      'Color',
      'matColor',
      /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#303030',
      'color',
      dis
    ) +
    fieldHtml(
      'Avisarme cuando queden (' + (isFilament(r) ? 'g' : r.unit) + ')',
      'matMin',
      n(r.min_stock),
      'number',
      'min="0" max="1000000000" step="any" required inputmode="decimal"' + dis
    ) +
    '</div>' +
    (isFilament(r)
      ? '<div class="grid grid-2">' +
        fieldHtml(
          'Filamento por rollo (g)',
          'matSpoolNet',
          n(r.spool_net_g) || 1000,
          'number',
          'min="1" max="100000" step="any" required inputmode="decimal"' + dis
        ) +
        fieldHtml(
          'Carrete vacío (g)',
          'matSpoolTare',
          n(r.spool_tare_g),
          'number',
          'min="0" max="100000" step="any" required inputmode="decimal"' + dis
        ) +
        '</div><p class="small muted">Con el peso del carrete vacío puedes pesar el rollo en la balanza y la app calcula los gramos que quedan.</p>'
      : '<div class="grid grid-2"><div class="field"><label for="matUnit">Se cuenta en</label><select id="matUnit"' +
        (r.counted || !edit ? ' disabled' : '') +
        '>' +
        Object.entries(INVENTORY_UNITS)
          .filter(([k]) => k !== 'g' || r.unit === 'g')
          .map(
            ([k, v]) =>
              '<option value="' + k + '"' + (k === r.unit ? ' selected' : '') + '>' + v + '</option>'
          )
          .join('') +
        '</select></div>' +
        fieldHtml(
          'Unidades por paquete',
          'matPack',
          n(r.pack_size) || 1,
          'number',
          'min="0.001" max="1000000" step="any" required inputmode="decimal"' + dis
        ) +
        '</div><p class="small muted">Si lo compras en paquetes (ej. 20 hojas), al registrar un ingreso puedes poner cuántos paquetes y el precio de cada uno.</p>') +
    '<div class="field"><label for="matNotes">Notas</label><textarea id="matNotes" maxlength="1000" rows="3" placeholder="Dónde lo compras, links, observaciones"' +
    dis +
    '>' +
    esc(r.notes || '') +
    '</textarea></div><label class="check-row"><input type="checkbox" id="matActive"' +
    (r.active ? ' checked' : '') +
    dis +
    '> <span><b>Disponible</b><span class="small muted">Aparece al crear productos y pedidos.</span></span></label>' +
    (edit
      ? '<div id="matFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Guardar datos</button>'
      : '') +
    '</form></section>'
  );
}
function materialPriceCard(r, edit) {
  return (
    '<section class="panel mat-card"><div class="panel-h"><h2>' +
    icon('wallet') +
    'Precio</h2>' +
    (edit
      ? '<button type="button" class="btn btn-ghost btn-sm" id="matPriceFix">' +
        icon('pencil') +
        'Corregir</button>'
      : '') +
    '</div><div class="mat-body"><div class="mat-price"><b class="num">' +
    clp(shownPrice(r)) +
    '</b><span class="small muted">' +
    stockPriceLabel(r).toLowerCase() +
    ' · costo promedio de lo que tienes' +
    (isFilament(r) && n(r.spool_net_g) > 0
      ? ' · ' +
        clp(Math.round(n(r.unit_cost) * n(r.spool_net_g))) +
        ' por rollo de ' +
        stockNumber(r.spool_net_g) +
        ' g'
      : !isFilament(r) && n(r.pack_size) > 1
        ? ' · ' + clp(n(r.unit_cost) * n(r.pack_size)) + ' por paquete de ' + stockNumber(r.pack_size)
        : '') +
    '</span></div><div id="matPrices" class="small"></div></div></section>'
  );
}
function bindMaterialPage(r) {
  qa('[data-mat-move]').forEach(b => (b.onclick = () => showStockMovement(r, b.dataset.matMove)));
  q('#matPriceFix')?.addEventListener('click', () => showPriceFix(r));
  q('#matArchive')?.addEventListener('click', () => archiveResource(r, !r.active));
  q('#matDelete')?.addEventListener('click', async () => {
    await deleteResource(r);
    if (!S.resources.some(x => x.id === r.id)) goMode('inventory');
  });
  const form = q('#matForm');
  if (!canEdit() || !form) return;
  form.onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || form.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const v = {
        name: q('#matName').value.trim(),
        material: q('#matBrand').value.trim(),
        color: q('#matColor').value,
        min_stock: Math.max(0, n(q('#matMin').value)),
        notes: q('#matNotes').value.trim().slice(0, 1000),
        active: q('#matActive').checked
      };
      if (!v.name) throw Error('Escribe un nombre.');
      if (isFilament(r)) {
        v.spool_net_g = Math.max(1, n(q('#matSpoolNet').value));
        v.spool_tare_g = Math.max(0, n(q('#matSpoolTare').value));
      } else {
        v.pack_size = Math.max(0.001, n(q('#matPack').value));
        if (!r.counted) v.unit = q('#matUnit').value;
      }
      const { error } = await supabase
        .from('workspace_resources')
        .update(v)
        .eq('id', r.id)
        .eq('workspace_id', S.workspace.id);
      if (error) throw error;
      await loadResources();
      toast('Datos de ' + v.name + ' guardados.');
      render();
    } catch (error) {
      q('#matFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
// Correct the price without a purchase (e.g. a typo): what you have is valued at the new price.
function showPriceFix(r) {
  const dialog = showDialog(
    'priceFixDialog',
    '<div class="section-title"><h2>Corregir precio · ' +
      esc(r.name) +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="priceFixForm" class="grid"><p class="small muted">Úsalo para arreglar un precio mal ingresado. Si compraste, usa «Ingreso»: ahí el precio se promedia con lo que ya tienes.</p>' +
      fieldHtml(
        stockPriceLabel(r) + ' (CLP)',
        'priceFix',
        shownPrice(r),
        'number',
        'min="0" max="1000000000" step="any" required inputmode="decimal"'
      ) +
      '<p class="small muted">Los productos toman el precio nuevo al tocar «Actualizar precios» en su ficha.</p><div id="priceFixFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Guardar precio</button></form>'
  );
  q('#priceFixForm').onsubmit = async e => {
    e.preventDefault();
    const price = Math.max(0, n(q('#priceFix').value)),
      cost = priceToUnitCost(r, price);
    const { error } = await supabase
      .from('workspace_resources')
      .update(isFilament(r) ? { price_per_kg: price, unit_cost: cost } : { unit_cost: cost })
      .eq('id', r.id)
      .eq('workspace_id', S.workspace.id);
    if (error) return (q('#priceFixFeedback').textContent = error.message);
    await loadResources();
    dialog.close();
    toast('Precio de ' + r.name + ' corregido.');
    render();
  };
  enhanceFields();
  return dialog;
}
// ---- History: running balance, price history and undo of the last movement ----
async function loadMaterialHistory(r) {
  const box = q('#matHistory');
  try {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('workspace_id', S.workspace.id)
      .eq('resource_id', r.id)
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    if (!box.isConnected) return;
    const list = data || [];
    let balance = n(r.stock_qty);
    const rows = list.map(m => {
      const after = balance;
      balance -= n(m.quantity);
      return { m, after };
    });
    const last = list[0],
      canUndo =
        canEdit() &&
        last &&
        ['purchase', 'adjustment', 'loss'].includes(last.kind) &&
        Date.now() - new Date(last.created_at).getTime() < 7 * 864e5;
    box.innerHTML = rows.length
      ? rows
          .map(
            ({ m, after }, i) =>
              '<div class="mov-row"><span class="mov-sign ' +
              (n(m.quantity) >= 0 ? 'up' : 'down') +
              '">' +
              (n(m.quantity) >= 0 ? '+' : '−') +
              '</span><div class="mov-main"><b>' +
              MOVEMENT_KINDS[m.kind] +
              ' · ' +
              qtyText(Math.abs(n(m.quantity)), r) +
              '</b><span class="small muted">' +
              esc(
                new Date(m.created_at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
              ) +
              (m.note ? ' · ' + esc(m.note) : '') +
              '</span></div><div class="mov-end"><span class="small muted">Quedó</span><b class="num">' +
              qtyText(after, r) +
              '</b>' +
              (i === 0 && canUndo
                ? '<button type="button" class="btn btn-ghost btn-sm" id="matUndo">' +
                  icon('undo-2') +
                  'Deshacer</button>'
                : '') +
              '</div></div>'
          )
          .join('')
      : '<span class="small muted">Sin movimientos todavía.</span>';
    // Prices paid: purchases and the first count.
    const prices = list.filter(m => ['purchase', 'opening'].includes(m.kind)).slice(0, 6);
    const pbox = q('#matPrices');
    if (pbox)
      pbox.innerHTML = prices.length
        ? '<span class="muted">Precios registrados</span>' +
          prices
            .map(
              m =>
                '<div class="price-row"><span>' +
                esc(new Date(m.created_at).toLocaleDateString('es-CL')) +
                ' · ' +
                MOVEMENT_KINDS[m.kind].toLowerCase() +
                '</span><b class="num">' +
                clp(isFilament(r) ? n(m.unit_cost) * 1000 : n(m.unit_cost)) +
                '</b></div>'
            )
            .join('')
        : '';
    q('#matUndo')?.addEventListener('click', () => undoMovement(r, last));
  } catch (error) {
    if (box.isConnected) box.textContent = 'No se pudo cargar el historial: ' + error.message;
  }
}
// Undo = the opposite movement (history stays complete). A purchase also restores the previous average cost.
async function undoMovement(r, m) {
  const ok = await confirmDialog({
    title: 'Deshacer ' + MOVEMENT_KINDS[m.kind].toLowerCase(),
    body:
      'Se registra el movimiento contrario (' +
      (n(m.quantity) >= 0 ? '−' : '+') +
      qtyText(Math.abs(n(m.quantity)), r) +
      ') y ' +
      (m.kind === 'purchase' ? 'el costo promedio vuelve al anterior. ' : '') +
      'el historial lo muestra como ajuste.',
    confirmLabel: 'Deshacer'
  });
  if (!ok) return;
  try {
    const qty = -n(m.quantity),
      stock = n(r.stock_qty);
    if (stock + qty < n(r.reserved_qty))
      throw Error('No se puede: quedarías con menos de lo reservado para pedidos.');
    const { error } = await supabase.from('inventory_movements').insert({
      workspace_id: S.workspace.id,
      resource_id: r.id,
      kind: 'adjustment',
      quantity: qty,
      unit_cost: n(r.unit_cost),
      note:
        'Deshace: ' +
        MOVEMENT_KINDS[m.kind].toLowerCase() +
        ' del ' +
        new Date(m.created_at).toLocaleDateString('es-CL'),
      request_key: crypto.randomUUID()
    });
    if (error) throw error;
    if (m.kind === 'purchase') {
      const before = stock - n(m.quantity),
        cost =
          before > 0
            ? Math.max(0, (stock * n(r.unit_cost) - n(m.quantity) * n(m.unit_cost)) / before)
            : n(r.unit_cost);
      const { error: ce } = await supabase
        .from('workspace_resources')
        .update(isFilament(r) ? { price_per_kg: cost * 1000, unit_cost: cost } : { unit_cost: cost })
        .eq('id', r.id)
        .eq('workspace_id', S.workspace.id);
      if (ce) throw ce;
    }
    await loadResources();
    toast('Movimiento deshecho.');
    render();
  } catch (error) {
    toast(error.message, 'error');
  }
}
async function loadMaterialUsage(r) {
  const box = q('#matUsage');
  try {
    const [products, prints, lines] = await Promise.all([
      (async () => {
        const { data, error } = await supabase
          .from('products')
          .select('id,name,quantity,materials')
          .eq('workspace_id', S.workspace.id)
          .contains('materials', JSON.stringify([{ resource_id: r.id }]));
        if (error) throw error;
        return data || [];
      })(),
      (async () => {
        const { data, error } = await supabase
          .from('print_jobs')
          .select('product_id,filaments')
          .contains('filaments', JSON.stringify([{ resource_id: r.id }]));
        if (error) throw error;
        return data || [];
      })(),
      (async () => {
        const { data, error } = await supabase
          .from('inventory_order_lines')
          .select('order_id,quantity,consumed_qty')
          .eq('workspace_id', S.workspace.id)
          .eq('resource_id', r.id);
        if (error) throw error;
        return data || [];
      })()
    ]);
    if (!box.isConnected) return;
    const per = new Map();
    for (const p of products)
      for (const m of p.materials || [])
        if (m.resource_id === r.id)
          per.set(p.id, (per.get(p.id) || 0) + n(m.quantity) / Math.max(1, n(p.quantity)));
    for (const j of prints)
      for (const f of j.filaments || [])
        if (f.resource_id === r.id) {
          const p = S.products.find(x => x.id === j.product_id);
          per.set(
            j.product_id,
            (per.get(j.product_id) || 0) + (n(f.grams) + n(f.purge_grams)) / Math.max(1, n(p?.quantity) || 1)
          );
        }
    const reserved = lines
      .map(l => ({ l, o: S.orders.find(o => o.id === l.order_id) }))
      .filter(x => x.o && x.o.inventory_state === 'reserved');
    const name = id =>
      S.products.find(p => p.id === id)?.name || products.find(p => p.id === id)?.name || 'Producto';
    box.innerHTML =
      (per.size
        ? '<span class="small muted">Productos (por unidad)</span>' +
          [...per]
            .sort((a, b) => name(a[0]).localeCompare(name(b[0]), 'es'))
            .map(
              ([id, qty]) =>
                '<button type="button" class="use-row" data-use-product="' +
                id +
                '"><span>' +
                esc(name(id)) +
                '</span><b class="num">' +
                qtyText(qty, r) +
                '</b></button>'
            )
            .join('')
        : '<span class="small muted">Ningún producto lo usa.</span>') +
      (reserved.length
        ? '<span class="small muted use-sub">Reservado en pedidos</span>' +
          reserved
            .map(
              ({ l, o }) =>
                '<button type="button" class="use-row" data-use-order="' +
                o.id +
                '"><span>PED-' +
                o.order_no +
                ' · ' +
                esc(o.title) +
                '</span><b class="num">' +
                qtyText(l.quantity, r) +
                '</b></button>'
            )
            .join('')
        : '');
    box
      .querySelectorAll('[data-use-product]')
      .forEach(b => (b.onclick = () => openProduct(b.dataset.useProduct)));
    box
      .querySelectorAll('[data-use-order]')
      .forEach(b => (b.onclick = () => showOrder(S.orders.find(o => o.id === b.dataset.useOrder))));
  } catch (error) {
    if (box.isConnected) box.textContent = 'No se pudo cargar: ' + error.message;
  }
}
// ---- Helpers inside the stock dialog: weigh the spool, rolls and packs ----
function mountStockHelpers(r, mode) {
  const preview = q('#stockPreview'),
    qtyInput = q('#stockQuantity');
  if (!preview || !qtyInput) return;
  const fill = (input, value) => {
    input.value = String(Math.round(value * 1000) / 1000);
    input.dispatchEvent(new Event('input'));
  };
  const box = document.createElement('div');
  box.className = 'stock-helper';
  if (isFilament(r) && (mode === 'set' || mode === 'first')) {
    box.innerHTML =
      '<details' +
      (n(r.spool_tare_g) > 0 ? ' open' : '') +
      '><summary>' +
      icon('scale') +
      'Pesar el rollo en la balanza</summary><div class="grid grid-2">' +
      fieldHtml(
        'Peso en la balanza (g)',
        'scaleGross',
        '',
        'number',
        'min="0" max="100000" step="any" inputmode="decimal"'
      ) +
      fieldHtml(
        'Carrete vacío (g)',
        'scaleTare',
        n(r.spool_tare_g),
        'number',
        'min="0" max="100000" step="any" inputmode="decimal"'
      ) +
      '</div><p class="small muted" id="scaleResult">Pesa el rollo con su carrete: la app descuenta el carrete vacío. Si tienes varios rollos abiertos, suma sus pesos y sus carretes.</p></details>';
    preview.before(box);
    const calc = () => {
      const gross = q('#scaleGross').value;
      if (gross === '') return;
      const g = spoolGrams(gross, q('#scaleTare').value);
      q('#scaleResult').textContent = '= ' + stockNumber(g) + ' g de filamento.';
      fill(qtyInput, g);
    };
    q('#scaleGross').oninput = calc;
    q('#scaleTare').oninput = calc;
    // A new empty-spool weight is remembered for next time.
    q('#stockDialog').addEventListener('stocksaved', async () => {
      const tare = n(q('#scaleTare')?.value);
      if (q('#scaleGross')?.value !== '' && tare !== n(r.spool_tare_g))
        await supabase
          .from('workspace_resources')
          .update({ spool_tare_g: tare })
          .eq('id', r.id)
          .eq('workspace_id', S.workspace.id);
    });
  } else if (mode === 'in' && (isFilament(r) || n(r.pack_size) > 1)) {
    const size = isFilament(r) ? n(r.spool_net_g) || 1000 : n(r.pack_size),
      word = isFilament(r) ? 'rollos' : 'paquetes',
      what = isFilament(r) ? 'rollo de ' + stockNumber(size) + ' g' : 'paquete de ' + stockNumber(size);
    box.innerHTML =
      '<div class="grid grid-2">' +
      fieldHtml(
        '¿Cuántos ' + word + '?',
        'packCount',
        '',
        'number',
        'min="0" max="100000" step="any" inputmode="decimal"'
      ) +
      fieldHtml(
        'Precio por ' + what,
        'packPrice',
        '',
        'number',
        'min="0" max="1000000000" step="any" inputmode="decimal"'
      ) +
      '</div>';
    qtyInput.closest('.field').before(box);
    q('#packCount').oninput = () => fill(qtyInput, n(q('#packCount').value) * size);
    q('#packPrice').oninput = () =>
      fill(
        q('#stockPrice'),
        isFilament(r) ? (n(q('#packPrice').value) / size) * 1000 : n(q('#packPrice').value) / size
      );
  }
}
// ---- Modo conteo: the physical count of every material in one go ----
function stockCountView() {
  if (!canEdit()) {
    S.mode = 'inventory';
    return render();
  }
  const items = inventoryItems()
    .filter(r => r.active)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'es'));
  S.countDraft ??= {};
  const row = r => {
    const d = S.countDraft[r.id] || {},
      weigh = isFilament(r) && d.weigh;
    return (
      '<div class="count-row" data-count="' +
      r.id +
      '"><div class="count-name"><span class="swatch" style="background:' +
      (/^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#303a4d') +
      '"></span><div><b>' +
      esc(r.name) +
      '</b><span class="small muted">' +
      (r.counted ? 'En la app: ' + qtyText(r.stock_qty, r) : 'Sin conteo') +
      ' · ' +
      (countIsDue(r) ? '<span class="warn">' + countAgo(r) + '</span>' : countAgo(r)) +
      (n(r.reserved_qty) ? ' · reservado ' + qtyText(r.reserved_qty, r) : '') +
      '</span></div></div><div class="count-input">' +
      (isFilament(r)
        ? '<button type="button" class="btn btn-ghost btn-sm count-mode" data-count-weigh="' +
          r.id +
          '" aria-pressed="' +
          !!weigh +
          '">' +
          icon('scale') +
          (weigh ? 'Peso balanza' : 'Gramos') +
          '</button>'
        : '') +
      '<input type="number" min="0" max="1000000000" step="any" inputmode="decimal" data-count-input="' +
      r.id +
      '" aria-label="' +
      esc((weigh ? 'Peso en la balanza de ' : 'Cantidad real de ') + r.name) +
      '" placeholder="' +
      (weigh
        ? 'Peso con carrete'
        : r.counted
          ? stockNumber(Math.round(n(r.stock_qty) * 1000) / 1000)
          : 'Cantidad') +
      '" value="' +
      esc(d.value ?? '') +
      '"><span class="count-unit">' +
      (isFilament(r) ? 'g' : esc(r.unit)) +
      '</span></div><div class="count-diff small" data-count-diff="' +
      r.id +
      '"></div></div>'
    );
  };
  const group = (kind, title) => {
    const rows = items.filter(r => (kind === 'filament' ? isFilament(r) : !isFilament(r)));
    return rows.length ? '<h3 class="shop-group">' + title + '</h3>' + rows.map(row).join('') : '';
  };
  root.innerHTML =
    header('Modo conteo', '', { back: true }) +
    '<main class="shell narrow count-page"><p class="small muted">Escribe lo que realmente tienes de cada material. Deja vacío lo que no contaste: no cambia. En los filamentos puedes poner el <b>peso en la balanza</b> con el carrete y la app descuenta el carrete vacío.</p><section class="panel count-list">' +
    group('filament', 'Filamentos') +
    group('supply', 'Insumos') +
    '</section><div class="count-bar"><span id="countSummary" class="small"></span><button type="button" class="btn btn-ghost" id="countClear">Limpiar</button><button type="button" class="btn btn-primary" id="countSave">' +
    icon('check') +
    'Guardar conteo</button></div></main>';
  common();
  q('#back').onclick = () => goMode('inventory');
  const grams = r => {
    const d = S.countDraft[r.id];
    if (!d || d.value === '' || d.value == null) return null;
    return isFilament(r) && d.weigh ? spoolGrams(d.value, r.spool_tare_g) : Math.max(0, n(d.value));
  };
  const filled = () => items.map(r => ({ r, qty: grams(r) })).filter(x => x.qty != null);
  const changes = () => filled().filter(x => !x.r.counted || Math.abs(x.qty - n(x.r.stock_qty)) > 0.0005);
  const refresh = () => {
    for (const r of items) {
      const el = q('[data-count-diff="' + r.id + '"]'),
        qty = grams(r);
      if (!el) continue;
      if (qty == null) {
        el.textContent = '';
        el.className = 'count-diff small';
        continue;
      }
      const diff = qty - (r.counted ? n(r.stock_qty) : 0);
      el.className = 'count-diff small ' + (Math.abs(diff) < 0.0005 ? 'muted' : diff > 0 ? 'up' : 'down');
      el.textContent =
        (isFilament(r) && S.countDraft[r.id]?.weigh ? '= ' + qtyText(qty, r) + ' · ' : '') +
        (!r.counted
          ? 'Stock inicial'
          : Math.abs(diff) < 0.0005
            ? 'Sin cambio'
            : (diff > 0 ? '+' : '−') + qtyText(Math.abs(diff), r));
    }
    const k = changes().length,
      f = filled().length;
    q('#countSummary').textContent = f
      ? f +
        (f === 1 ? ' contado' : ' contados') +
        ' · ' +
        (k ? k + (k === 1 ? ' cambia' : ' cambian') : 'sin cambios')
      : 'Escribe lo que cuentes';
    q('#countSave').disabled = !f;
  };
  qa('[data-count-input]').forEach(
    input =>
      (input.oninput = () => {
        const id = input.dataset.countInput;
        S.countDraft[id] = { ...(S.countDraft[id] || {}), value: input.value };
        refresh();
      })
  );
  qa('[data-count-weigh]').forEach(
    b =>
      (b.onclick = () => {
        const id = b.dataset.countWeigh;
        S.countDraft[id] = { weigh: !S.countDraft[id]?.weigh, value: '' };
        stockCountView();
        q('[data-count-input="' + id + '"]')?.focus();
      })
  );
  q('#countClear').onclick = () => {
    S.countDraft = {};
    stockCountView();
  };
  q('#countSave').onclick = async () => {
    const list = changes(),
      counted = filled().map(x => x.r.id),
      b = q('#countSave');
    b.disabled = true;
    const failed = [],
      failedIds = new Set();
    let done = 0;
    for (const { r, qty } of list) {
      try {
        if (r.counted && qty < n(r.reserved_qty))
          throw Error('menos de lo reservado (' + qtyText(r.reserved_qty, r) + ')');
        const { error } = await supabase.from('inventory_movements').insert({
          workspace_id: S.workspace.id,
          resource_id: r.id,
          kind: r.counted ? 'adjustment' : 'opening',
          quantity: r.counted ? qty - n(r.stock_qty) : qty,
          unit_cost: n(r.unit_cost),
          note: r.counted ? 'Conteo físico' : 'Stock inicial (conteo)',
          request_key: crypto.randomUUID()
        });
        if (error) throw error;
        done++;
      } catch (error) {
        failedIds.add(r.id);
        failed.push(r.name + ': ' + error.message);
      }
    }
    // Everything counted gets today's date, also what did not change.
    const ok = counted.filter(id => !failedIds.has(id));
    try {
      await markCounted(ok);
      for (const id of ok) delete S.countDraft[id];
    } catch (error) {
      failed.push(error.message);
    }
    await loadResources();
    if (ok.length)
      toast(
        'Conteo guardado: ' +
          ok.length +
          (ok.length === 1 ? ' material contado' : ' materiales contados') +
          (done ? ' (' + done + ' con ajuste).' : ', sin diferencias.')
      );
    if (failed.length) toast('No se guardó ' + failed.join(' · '), 'error');
    if (!failed.length) {
      S.countDraft = {};
      goMode('inventory');
    } else stockCountView();
  };
  refresh();
}
