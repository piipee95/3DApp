'use strict';
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
