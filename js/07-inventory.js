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
  const priceLabel = kind => (kind === 'filament' ? 'Precio por kg CLP' : 'Precio por unidad CLP');
  const dialog = showDialog(
    'inventoryFormDialog',
    '<div class="section-title"><h2>' +
      (r.id ? 'Editar material' : 'Nuevo material') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="inventoryForm" class="grid"><div class="field"><label for="invKind">Tipo</label><select id="invKind" ' +
      (r.id ? 'disabled' : '') +
      '><option value="supply">Material / insumo</option><option value="filament">Filamento</option></select></div>' +
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
      set: 'Cambiar cantidad',
      out: 'Sacar del stock'
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
      opening: 'Stock inicial',
      purchase: 'Ingreso',
      adjustment: 'Cambio de cantidad',
      loss: 'Salida',
      consumption: 'Usado en pedido'
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
// Lucide icons (ISC license), inlined so the app needs no icon CDN.
