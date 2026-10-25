'use strict';
function relativeDate(iso) {
  if (!iso) return '';
  const d = new Date(iso),
    today = new Date(),
    day = 864e5,
    start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(),
    diff = Math.round((start(today) - start(d)) / day);
  if (diff === 0) return 'hoy, ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'ayer';
  return shortDate(
    d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
  );
}
function marginChip(p) {
  const { unit, margin } = productNumbers(p);
  if (margin == null) return '<span class="chip">' + (unit === 0 ? 'Sin costo' : 'Sin venta') + '</span>';
  return '<span class="chip ' + (margin < 0 ? 'c-late' : 'c-ready') + '">' + pct(margin) + '</span>';
}
function productThumb(p) {
  const src = photoSrc(p);
  return src
    ? '<img class="product-thumb" src="' + esc(src) + '" alt="" loading="lazy">'
    : '<span class="thumb-empty">' + icon('package') + '</span>';
}
function stockCell(p) {
  const s = productStock(p);
  if (!s.qty) return '<span class="muted">—</span>';
  return (
    '<b>' + s.available + '</b>' + (s.reserved ? '<span class="sub"> +' + s.reserved + ' res.</span>' : '')
  );
}
function productMenu(p) {
  if (!canEdit()) return '';
  return (
    '<details class="row-menu"><summary class="btn icon-btn" aria-label="Acciones de ' +
    esc(p.name) +
    '">' +
    icon('ellipsis-vertical') +
    '</summary><div class="menu-pop">' +
    (p.status === 'archived'
      ? '<button type="button" class="btn" data-rest="' +
        p.id +
        '">' +
        icon('archive-restore') +
        'Restaurar</button>'
      : '<button type="button" class="btn" data-dup="' +
        p.id +
        '">' +
        icon('copy') +
        'Duplicar</button><button type="button" class="btn" data-quick="' +
        p.id +
        '">' +
        icon('pencil') +
        'Precio y stock</button><button type="button" class="btn" data-arc="' +
        p.id +
        '">' +
        icon('archive') +
        'Archivar</button>') +
    '<button type="button" class="btn btn-danger" data-del="' +
    p.id +
    '">' +
    icon('trash-2') +
    'Eliminar</button></div></details>'
  );
}
function dashboard() {
  const active = S.products.filter(p => p.status !== 'archived'),
    arch = S.products.filter(p => p.status === 'archived'),
    inStock = active.filter(p => productStock(p).qty > 0),
    list = S.showArchived ? arch : S.showStock ? inStock : active,
    term = S.search.toLocaleLowerCase('es');
  const rows = list
    .filter(p => (p.name + ' ' + (p.description || '')).toLocaleLowerCase('es').includes(term))
    .filter(p => matchesProfit(p))
    .sort(compareProducts);
  const cost = p => {
    const { unit } = productNumbers(p);
    return unit > 0 ? clp(unit) : '<span class="muted">—</span>';
  };
  const price = p => {
    const { unit, price: v } = productNumbers(p);
    return unit > 0 || p.sale_price != null ? '<b>' + clp(v) + '</b>' : '<span class="muted">—</span>';
  };
  const empty =
    '<div class="panel-empty">' +
    icon(S.search ? 'search' : 'package') +
    '<b>' +
    (S.search
      ? 'Sin resultados para «' + esc(S.search) + '»'
      : S.showArchived
        ? 'No hay productos archivados'
        : 'Aún no hay productos') +
    '</b><span>' +
    (S.search
      ? 'Prueba con otro nombre.'
      : S.showArchived
        ? ''
        : 'Crea el primero para comenzar a costear.') +
    '</span></div>';
  root.innerHTML =
    header(
      'Productos',
      '<button class="btn btn-secondary" id="priceListsBtn" type="button">' +
        icon('calculator') +
        '<span>Precios rápidos</span></button><button class="btn btn-secondary" id="catalogBtn" type="button">' +
        icon('store') +
        '<span>Catálogo</span></button>' +
        (canEdit()
          ? '<button class="btn btn-primary" id="new">' +
            icon('plus') +
            '<span>Nuevo producto</span></button>'
          : '')
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="toolbar"><label class="search-box">' +
    icon('search') +
    '<input id="searchProducts" type="search" placeholder="Buscar en ' +
    active.length +
    (active.length === 1 ? ' producto' : ' productos') +
    '" aria-label="Buscar productos" value="' +
    esc(S.search) +
    '"></label><div class="view-tabs" role="tablist"><button class="btn ' +
    (!S.showArchived && !S.showStock ? 'btn-primary' : 'btn-secondary') +
    '" id="showActive" role="tab">Activos <span class="seg-count">' +
    active.length +
    '</span></button><button class="btn ' +
    (S.showStock && !S.showArchived ? 'btn-primary' : 'btn-secondary') +
    '" id="showStock" role="tab">En stock <span class="seg-count">' +
    inStock.reduce((t, p) => t + productStock(p).available, 0) +
    '</span></button><button class="btn ' +
    (S.showArchived ? 'btn-primary' : 'btn-secondary') +
    '" id="showArchived" role="tab">Archivados <span class="seg-count">' +
    arch.length +
    '</span></button></div><select id="profitFilter" class="select-compact" aria-label="Rentabilidad"><option value="all">Margen: todos</option><option value="positive">Sin pérdida</option><option value="loss">Con pérdida</option><option value="uncosted">Sin costos registrados</option></select><select id="productSort" class="select-compact" aria-label="Ordenar"><option value="recent">Más recientes</option><option value="name">Nombre A–Z</option><option value="price">Precio mayor a menor</option><option value="cost">Costo mayor a menor</option><option value="margin">Margen mayor a menor</option></select></div><section class="panel product-panel">' +
    (rows.length
      ? '<table class="data-table products-table"><thead><tr><th>Producto</th><th class="r">Costo unit.</th><th class="r">Precio final</th><th>Margen</th><th class="r">Stock</th><th>Actualizado</th><th></th></tr></thead><tbody>' +
        rows
          .map(
            p =>
              '<tr data-open="' +
              p.id +
              '" class="' +
              (p.status === 'archived' ? 'archived' : '') +
              '"><td><div class="prod-cell">' +
              productThumb(p) +
              '<div><b>' +
              esc(p.name) +
              '</b><span>' +
              esc(p.description || 'Sin descripción') +
              '</span></div></div></td><td class="r num">' +
              cost(p) +
              '</td><td class="r num">' +
              price(p) +
              '</td><td>' +
              marginChip(p) +
              '</td><td class="r num">' +
              stockCell(p) +
              '</td><td class="sub">' +
              relativeDate(p.updated_at) +
              '</td><td class="r">' +
              productMenu(p) +
              '</td></tr>'
          )
          .join('') +
        '</tbody></table><div class="list-rows">' +
        rows
          .map(
            p =>
              '<div class="list-row product-row' +
              (p.status === 'archived' ? ' archived' : '') +
              '" data-open="' +
              p.id +
              '" role="button" tabindex="0">' +
              productThumb(p) +
              '<span class="lr-main"><b>' +
              esc(p.name) +
              '</b><span>' +
              (productNumbers(p).unit > 0
                ? 'Costo ' + clp(productNumbers(p).unit)
                : 'Sin costos registrados') +
              (productStock(p).qty ? ' · Stock ' + productStock(p).available : '') +
              '</span></span><span class="lr-end"><b class="num">' +
              (productNumbers(p).unit > 0 || p.sale_price != null ? clp(productNumbers(p).price) : '') +
              '</b>' +
              marginChip(p) +
              '</span>' +
              productMenu(p) +
              '</div>'
          )
          .join('') +
        '</div>'
      : empty) +
    '</section></main>';
  common();
  q('#productSort').value = S.sort;
  q('#profitFilter').value = S.profitFilter;
  q('#productSort').onchange = e => {
    S.sort = e.target.value;
    dashboard();
  };
  q('#profitFilter').onchange = e => {
    S.profitFilter = e.target.value;
    dashboard();
  };
  q('#searchProducts').oninput = e => {
    const pos = e.target.selectionStart;
    S.search = e.target.value;
    dashboard();
    q('#searchProducts').focus();
    q('#searchProducts').setSelectionRange(pos, pos);
  };
  q('#new') && (q('#new').onclick = newProduct);
  q('#priceListsBtn').onclick = showPriceLists;
  q('#catalogBtn').onclick = showCatalog;
  q('#showActive').onclick = () => {
    S.showArchived = false;
    S.showStock = false;
    dashboard();
  };
  q('#showStock').onclick = () => {
    S.showArchived = false;
    S.showStock = true;
    dashboard();
  };
  q('#showArchived').onclick = () => {
    S.showArchived = true;
    S.showStock = false;
    dashboard();
  };
  // Rows open the product; the ⋯ menu and its actions don't.
  qa('[data-open]').forEach(row => {
    row.onclick = e => {
      if (e.target.closest('.row-menu')) return;
      openProduct(row.dataset.open);
    };
    row.onkeydown = e => {
      if (e.key === 'Enter' && e.target === row) openProduct(row.dataset.open);
    };
  });
  qa('[data-dup]').forEach(b => (b.onclick = () => duplicateProduct(b.dataset.dup)));
  qa('[data-arc]').forEach(b => (b.onclick = () => archiveProduct(b.dataset.arc)));
  qa('[data-quick]').forEach(
    b => (b.onclick = () => showQuickEdit(S.products.find(p => p.id === b.dataset.quick)))
  );
  qa('[data-rest]').forEach(b => (b.onclick = () => restoreProduct(b.dataset.rest)));
  qa('[data-del]').forEach(
    b => (b.onclick = () => deleteProduct(S.products.find(p => p.id === b.dataset.del)))
  );
}
function newProduct() {
  if (restoreDraft('new')) return render();
  S.dirty = true;
  S.product = {
    id: null,
    photo_data: null,
    name: 'Nuevo producto',
    description: '',
    quantity: 1,
    iva_enabled: true,
    iva_rate: 0.19,
    target_margin: 0.4,
    round_to: 1000,
    prints: [],
    directCosts: [
      { name: 'Impresión foto / póster', amount: 0 },
      { name: 'Cuadro / marco', amount: 0 },
      { name: 'Caja / empaque', amount: 0 },
      { name: 'Adhesivos / consumibles', amount: 0 }
    ],
    additionalCosts: [
      { name: 'Mano de obra / armado', amount: 0 },
      { name: 'Desgaste impresora', amount: 0 },
      { name: 'Fallas / mermas', amount: 0 },
      { name: 'Publicidad', amount: 0 }
    ]
  };
  S.editorTab = 'details';
  S.mode = 'product';
  render();
}
async function openProduct(id, { restore = true } = {}) {
  if (restore && restoreDraft(id)) return render();
  let { data: p, error } = await supabase.from('products').select('*').eq('id', id).single();
  if (error) return fail(error.message);
  let [{ data: prints }, { data: costs }] = await Promise.all([
    supabase.from('print_jobs').select('*').eq('product_id', id).order('print_no'),
    supabase.from('cost_items').select('*').eq('product_id', id).order('sort_order')
  ]);
  p.prints = prints || [];
  p.directCosts = (costs || []).filter(x => x.category === 'direct' && !x.inventory_material);
  p.additionalCosts = (costs || []).filter(x => x.category === 'additional');
  p.saved_photo_path = p.photo_path ?? null;
  await loadPhotoUrls([p]);
  S.product = p;
  S.dirty = false;
  S.editorTab = 'details';
  S.mode = 'product';
  render();
}
function collect() {
  const p = S.product;
  collectMaterials();
  if (q('#salePrice'))
    p.sale_price = q('#salePrice').value === '' ? null : Math.max(0, n(q('#salePrice').value));
  if (q('#cfgFilament')) S.settings.filament_price_per_kg = n(q('#cfgFilament').value);
  if (q('#cfgElec')) S.settings.electricity_rate_clp_kwh = n(q('#cfgElec').value);
  if (q('#cfgPower')) S.settings.printer_power_kw = n(q('#cfgPower').value);
  p.name = q('#name').value.trim() || 'Producto';
  p.description = q('#desc').value.trim();
  p.quantity = Math.max(1, parseInt(q('#qty').value || 1));
  p.iva_enabled = q('#iva').checked;
  p.iva_rate = n(q('#ivar').value) / 100;
  p.target_margin = Math.min(0.94, Math.max(0, n(q('#margin').value) / 100));
  p.round_to = Math.max(1, parseInt(q('#round').value || 1000));
  p.prints = qa('.print-card').map((el, i) => ({
    printer_name: el.querySelector('.printerLabel')?.value || null,
    power_kw:
      el.querySelector('.printPower')?.value === '' || !el.querySelector('.printPower')
        ? null
        : Math.max(0, n(el.querySelector('.printPower').value)),
    filaments: collectFilaments(el),
    label: el.querySelector('.pl').value.trim() || 'Impresión ' + (i + 1),
    grams: n(el.querySelector('.pg').value),
    hours: parseInt(el.querySelector('.ph').value || 0),
    minutes: parseInt(el.querySelector('.pm').value || 0),
    filament_cost: n(el.querySelector('.pf').value),
    electricity_cost: n(el.querySelector('.pe').value),
    other_print_cost: n(el.querySelector('.po').value),
    notes: el.querySelector('.pn').value.trim()
  }));
  p.prints.forEach((x, i) => {
    if (x.filaments.length) {
      const f = filamentTotals(x.filaments);
      x.grams = f.grams;
      x.filament_cost = Math.round(f.cost);
      const el = qa('.print-card')[i];
      el.querySelector('.pg').value = x.grams;
      el.querySelector('.pf').value = x.filament_cost;
    }
  });
  p.directCosts = qa('.cost-row.direct').map(el => ({
    name: el.querySelector('.cn').value.trim() || 'Costo',
    amount: n(el.querySelector('.ca').value)
  }));
  p.additionalCosts = qa('.cost-row.additional').map(el => ({
    name: el.querySelector('.cn').value.trim() || 'Costo',
    amount: n(el.querySelector('.ca').value)
  }));
  return p;
}
function totals(p = S.product) {
  const pc = (p.prints || []).reduce(
      (s, x) => s + n(x.filament_cost) + n(x.electricity_cost) + n(x.other_print_cost),
      0
    ),
    dc =
      (p.directCosts || []).reduce((s, x) => s + n(x.amount), 0) +
      (p.materials || []).reduce((s, x) => s + n(x.quantity) * n(x.unit_cost), 0),
    ac = (p.additionalCosts || []).reduce((s, x) => s + n(x.amount), 0),
    batch = pc + dc + ac,
    qty = Math.max(1, parseInt(p.quantity || 1)),
    unit = batch / qty,
    m = n(p.target_margin),
    net = unit / (1 - m || 1),
    iva = p.iva_enabled ? net * n(p.iva_rate) : 0,
    gross = net + iva,
    suggested = commercial(gross, p.round_to),
    rounded = p.sale_price == null ? suggested : Math.max(0, n(p.sale_price)),
    effectiveNet = p.iva_enabled ? rounded / (1 + n(p.iva_rate)) : rounded,
    utilityUnit = effectiveNet - unit,
    utility = utilityUnit * qty,
    em = effectiveNet ? utilityUnit / effectiveNet : 0,
    sales = rounded * qty,
    finalNet = effectiveNet,
    finalIva = rounded - effectiveNet;
  return {
    suggested,
    finalNet,
    finalIva,
    pc,
    direct: pc + dc,
    ac,
    total: batch,
    batch,
    qty,
    unit,
    net,
    iva,
    rounded,
    utilityUnit,
    utility,
    em,
    sales
  };
}
function pRows(list) {
  return (
    (list || [])
      .map(
        (x, i) =>
          '<div class="print-card"><div class="section-title"><h3>Impresión ' +
          (i + 1) +
          '</h3><div class="row"><button type="button" class="btn btn-secondary dupP">Duplicar</button><button class="btn icon-btn danger-icon rmP" type="button" aria-label="Quitar impresión" title="Quitar impresión">' +
          icon('trash-2') +
          '</button></div></div><div class="grid grid-4"><div class="field"><label>Etiqueta</label><input class="pl" value="' +
          esc(x.label || 'Impresión ' + (i + 1)) +
          '"></div><div class="field"><label>Gramos</label><input class="pg live" type="number" value="' +
          n(x.grams) +
          '"></div><div class="field"><label>Horas</label><input class="ph live" type="number" value="' +
          n(x.hours) +
          '"></div><div class="field"><label>Minutos</label><input class="pm live" type="number" value="' +
          n(x.minutes) +
          '"></div><div class="field"><label>Costo filamento</label><input class="pf live" type="number" value="' +
          n(x.filament_cost) +
          '"></div><div class="field"><label>Electricidad</label><input class="pe live" type="number" value="' +
          n(x.electricity_cost) +
          '"></div><div class="field"><label>Otros costos</label><input class="po live" type="number" value="' +
          n(x.other_print_cost) +
          '"></div><div class="field"><label>Notas</label><input class="pn" value="' +
          esc(x.notes || '') +
          '"></div></div>' +
          filamentPanel(x) +
          '<div class="row" style="margin-top:12px"><button type="button" class="btn btn-secondary calcP">' +
          icon('calculator') +
          'Calcular filamento y electricidad</button></div></div>'
      )
      .join('') || '<p class="muted">Aún no agregas impresiones.</p>'
  );
}
function cRows(list, cat) {
  return (
    (list || [])
      .map(
        x =>
          '<div class="cost-row ' +
          cat +
          '"><div class="cost-grid"><div class="field"><label>Concepto</label><input class="cn" value="' +
          esc(x.name || '') +
          '"></div><div class="field"><label>Monto</label><input class="ca live" type="number" value="' +
          n(x.amount) +
          '"></div><button class="btn icon-btn danger-icon rmC" type="button" aria-label="Quitar costo" title="Quitar costo">' +
          icon('trash-2') +
          '</button></div></div>'
      )
      .join('') || '<p class="muted">Sin costos agregados.</p>'
  );
}
function scenario(name, m) {
  const t = totals({ ...S.product, target_margin: m, sale_price: null });
  return (
    '<div class="scenario"><h4>' +
    name +
    '</h4><div class="small muted">Margen ' +
    pct(m) +
    '</div><div class="price">' +
    clp(t.rounded) +
    '</div><div class="small">Utilidad / un. ' +
    clp(t.utilityUnit) +
    '</div></div>'
  );
}
// Scenario margins stay ordered: Mínimo ≤ Promo ≤ Recomendado ≤ Premium.
function scenarios(m) {
  const min = Math.min(m, Math.max(0.15, m - 0.15)),
    promo = Math.min(m, Math.max(0.2, m - 0.05)),
    premium = Math.max(m, Math.min(0.8, m + 0.1));
  return (
    scenario('Mínimo', min) +
    scenario('Promo', promo) +
    scenario('Recomendado', m) +
    scenario('Premium', premium)
  );
}
function product() {
  const p = S.product,
    t = totals(p);
  root.innerHTML =
    header(p.name || 'Producto', '', { back: true }) +
    '<main class="shell"><section class="card"><div class="section-title"><div><h2>Parámetros generales</h2><div class="small muted">Se comparten con tu socio y se usan para calcular automáticamente cada impresión.</div></div></div><div class="grid grid-4"><div class="field"><label>Filamento $/kg</label><input id="cfgFilament" class="live" type="number" value="' +
    n(S.settings.filament_price_per_kg) +
    '"></div><div class="field"><label>Electricidad $/kWh</label><input id="cfgElec" class="live" type="number" step="0.01" value="' +
    n(S.settings.electricity_rate_clp_kwh) +
    '"></div><div class="field"><label>Potencia máxima kW</label><input id="cfgPower" class="live" type="number" step="0.01" value="' +
    n(S.settings.printer_power_kw) +
    '"></div><div class="field"><label>Criterio</label><div class="notice" style="margin:0">Costo conservador por consumo máximo</div></div></div></section><section class="card" style="margin-top:16px"><div class="grid grid-4"><div class="field"><label>Nombre</label><input id="name" value="' +
    esc(p.name) +
    '"></div><div class="field"><label>Cantidad</label><input id="qty" type="number" value="' +
    p.quantity +
    '"></div><div class="field"><label>Margen objetivo %</label><input id="margin" class="live" type="number" value="' +
    Math.round(p.target_margin * 100) +
    '"></div><div class="field"><label>Redondeo CLP</label><input id="round" class="live" type="number" value="' +
    p.round_to +
    '"></div><div class="field"><label><input id="iva" class="live" type="checkbox" ' +
    (p.iva_enabled ? 'checked' : '') +
    '> Aplicar IVA</label></div><div class="field"><label>IVA %</label><input id="ivar" class="live" type="number" value="' +
    Math.round(p.iva_rate * 100) +
    '"></div></div><div class="field" style="margin-top:12px"><label>Descripción</label><textarea id="desc">' +
    esc(p.description || '') +
    '</textarea></div></section><section class="card" style="margin-top:16px"><div class="section-title"><h2>Impresiones 3D</h2><button class="btn btn-primary" id="addP">' +
    icon('plus') +
    'Agregar impresión</button></div><div id="prints" class="grid">' +
    pRows(p.prints) +
    '</div></section><section class="grid grid-2" style="margin-top:16px"><div class="card"><div class="section-title"><h2>Costos directos</h2><button class="btn btn-secondary" id="addD">' +
    icon('plus') +
    'Agregar</button></div><div class="grid">' +
    cRows(p.directCosts, 'direct') +
    '</div></div><div class="card"><div class="section-title"><h2>Costos adicionales</h2><button class="btn btn-secondary" id="addA">' +
    icon('plus') +
    'Agregar</button></div><div class="grid">' +
    cRows(p.additionalCosts, 'additional') +
    '</div></div></section><section class="card" style="margin-top:16px"><h2>Resumen financiero</h2><div class="grid grid-4"><div class="metric"><div class="label">Impresiones 3D</div><div class="value" id="m1">' +
    clp(t.pc) +
    '</div></div><div class="metric"><div class="label">Costo directo</div><div class="value" id="m2">' +
    clp(t.direct) +
    '</div></div><div class="metric"><div class="label">Costos adicionales</div><div class="value" id="m3">' +
    clp(t.ac) +
    '</div></div><div class="metric primary"><div class="label">Costo total lote</div><div class="value" id="m4">' +
    clp(t.total) +
    '</div><div class="small muted" id="m10">' +
    clp(t.unit) +
    ' por unidad</div></div><div class="metric"><div class="label">Neto final / unidad</div><div class="value" id="m5">' +
    clp(t.finalNet) +
    '</div></div><div class="metric"><div class="label">IVA final / unidad</div><div class="value" id="m6">' +
    clp(t.finalIva) +
    '</div></div><div class="metric gold"><div class="label">Precio final / unidad</div><div class="value" id="m7">' +
    clp(t.rounded) +
    '</div></div><div class="metric good"><div class="label">Utilidad lote</div><div class="value" id="m8">' +
    clp(t.utility) +
    '</div><div class="small" id="m11">' +
    clp(t.utilityUnit) +
    ' por unidad</div><div class="small" id="m9">Margen efectivo ' +
    pct(t.em) +
    '</div></div></div><div class="divider"></div><div class="grid grid-4" id="sc">' +
    scenarios(p.target_margin) +
    '</div></section><div class="sticky-actions"><button class="btn btn-danger" id="del" ' +
    (p.id ? '' : 'disabled') +
    '>Eliminar</button><button class="btn btn-primary" id="save">Guardar cambios</button></div></main>';
  setupEditor();
  setupV12();
  setupV13();
  setupInventoryProduct();
  setupV22();
  common();
  bindProduct();
}
function bindProduct() {
  bindV12();
  bindV13();
  bindInventoryProduct();
  q('#back').onclick = async () => {
    persistDraft();
    await loadProducts();
    S.mode = 'dashboard';
    render();
  };
  if (!canEdit()) {
    qa('main input,main textarea,main select,main button').forEach(el => {
      if (!['back', 'quote', 'createOrder'].includes(el.id) && !el.hasAttribute('data-editor-tab'))
        el.disabled = true;
    });
    return;
  }
  q('#addP').onclick = () => {
    collect();
    S.dirty = true;
    S.product.prints.push({
      label: 'Impresión ' + (S.product.prints.length + 1),
      grams: 0,
      hours: 0,
      minutes: 0,
      filament_cost: 0,
      electricity_cost: 0,
      other_print_cost: 0,
      notes: ''
    });
    render();
  };
  q('#addD').onclick = () => {
    collect();
    S.dirty = true;
    S.product.directCosts.push({ name: 'Nuevo costo directo', amount: 0 });
    render();
  };
  q('#addA').onclick = () => {
    collect();
    S.dirty = true;
    S.product.additionalCosts.push({ name: 'Nuevo costo adicional', amount: 0 });
    render();
  };
  qa('.rmP').forEach(
    (b, i) =>
      (b.onclick = () => {
        collect();
        S.dirty = true;
        S.product.prints.splice(i, 1);
        render();
      })
  );
  qa('.calcP').forEach(b => (b.onclick = () => calcPrintCosts(b.closest('.print-card'))));
  qa('.rmC').forEach(
    b =>
      (b.onclick = () => {
        const el = b.closest('.cost-row'),
          cat = el.classList.contains('direct') ? 'directCosts' : 'additionalCosts',
          idx = [...el.parentNode.querySelectorAll('.cost-row')].indexOf(el);
        collect();
        S.dirty = true;
        S.product[cat].splice(idx, 1);
        render();
      })
  );
  qa('main input,main textarea').forEach(el => (el.oninput = refresh));
  qa('#cfgFilament,#cfgElec,#cfgPower').forEach(
    el =>
      (el.oninput = () => {
        S.settingsDirty = true;
        refresh();
      })
  );
  q('#save').onclick = saveProduct;
  q('#del').onclick = () => deleteProduct();
}
function calcPrintCosts(el) {
  collect();
  const grams = n(el.querySelector('.pg').value),
    hours = n(el.querySelector('.ph').value),
    minutes = n(el.querySelector('.pm').value),
    fil = collectFilaments(el).length
      ? filamentTotals(collectFilaments(el)).cost
      : (grams * n(S.settings.filament_price_per_kg)) / 1000,
    elec =
      (hours + minutes / 60) *
      n(
        el.querySelector('.printPower')?.value === '' || !el.querySelector('.printPower')
          ? S.settings.printer_power_kw
          : el.querySelector('.printPower').value
      ) *
      n(S.settings.electricity_rate_clp_kwh);
  el.querySelector('.pf').value = Math.round(fil);
  el.querySelector('.pe').value = Math.round(elec);
  refresh();
}
// Typing saves the draft after a short pause; pagehide/visibilitychange still flush it immediately.
let draftTimer = null;
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => persistDraft(false), 400);
}
function refresh() {
  S.dirty = true;
  collect();
  scheduleDraft();
  const t = totals(),
    set = (id, v) => (q(id).textContent = v);
  set('#m1', clp(t.pc));
  set('#m2', clp(t.direct));
  set('#m3', clp(t.ac));
  set('#m4', clp(t.total));
  set('#m10', clp(t.unit) + ' por unidad');
  set('#m5', clp(t.finalNet));
  set('#m6', clp(t.finalIva));
  set('#m7', clp(t.rounded));
  set('#m8', clp(t.utility));
  set('#m11', clp(t.utilityUnit) + ' por unidad');
  set('#m9', 'Margen efectivo ' + pct(t.em));
  q('#quickPrice').textContent = clp(t.rounded);
  q('#quickCost').textContent = clp(t.unit);
  updatePriceHero();
  q('#sc').innerHTML = scenarios(S.product.target_margin);
  updatePriceStatus();
  updateMaterialStatus();
  qa('.filament-row').forEach(
    row =>
      (row.querySelector('.filament-subtotal').textContent = clp(
        filamentTotals(
          collectFilaments(row.closest('.print-card')).slice(
            [...row.parentNode.querySelectorAll('.filament-row')].indexOf(row),
            [...row.parentNode.querySelectorAll('.filament-row')].indexOf(row) + 1
          )
        ).cost
      ))
  );
  updateSyncStatus();
}
async function saveProduct() {
  if (S.saving || S.photoBusy || !canEdit()) return;
  const p = collect(),
    oldDraftId = p.id || 'new';
  let uploadedPath = null;
  S.saving = true;
  S.err = '';
  persistDraft(false);
  q('#save').disabled = true;
  q('#save').textContent = 'Guardando…';
  q('main').inert = true;
  updateSyncStatus();
  try {
    if (S.settingsDirty) {
      await saveSettings();
      S.settingsDirty = false;
    }
    const prints = p.prints.map((x, i) => ({ ...x, print_no: i + 1 }));
    const costs = [
      ...p.directCosts.map((x, i) => ({ ...x, category: 'direct', sort_order: i })),
      ...p.additionalCosts.map((x, i) => ({ ...x, category: 'additional', sort_order: i }))
    ];
    if (validPhoto(p.photo_data)) uploadedPath = await uploadPhoto(p.photo_data);
    const photoPath = uploadedPath || p.photo_path || null;
    const { data: id, error } = await supabase.rpc('save_product_bundle_v5', {
      p_materials: p.materials || [],
      p_sale_price: p.sale_price ?? null,
      p_photo_path: photoPath,
      p_product_id: p.id,
      p_workspace_id: S.workspace.id,
      p_name: p.name,
      p_description: p.description,
      p_quantity: p.quantity,
      p_iva_enabled: p.iva_enabled,
      p_iva_rate: p.iva_rate,
      p_target_margin: p.target_margin,
      p_round_to: p.round_to,
      p_prints: prints,
      p_costs: costs
    });
    if (error) throw error;
    if (uploadedPath) {
      S.photoUrls.set(uploadedPath, { url: p.photo_data, exp: Infinity });
      p.photo_data = null;
    }
    const oldPath = p.saved_photo_path;
    p.photo_path = p.saved_photo_path = photoPath;
    uploadedPath = null;
    if (oldPath && oldPath !== photoPath) cleanupPhoto(oldPath);
    p.id = id;
    S.dirty = false;
    removeDraft(oldDraftId);
    removeDraft(id);
    // The successful atomic response already confirms the full snapshot. Keep it
    // in memory, avoiding an extra reload that could fail after a successful save.
    S.product = p;
    S.msg = 'Producto guardado y sincronizado correctamente.';
    render();
    if (S.pendingLink) setTimeout(() => offerPendingLink(id), 0);
  } catch (e) {
    if (uploadedPath) removePhotoObject(uploadedPath);
    S.dirty = true;
    persistDraft(false);
    fail(e.message);
  } finally {
    S.saving = false;
    if (q('main')) q('main').inert = false;
    if (q('#save')) {
      q('#save').disabled = false;
      q('#save').textContent = 'Guardar cambios';
    }
    updateSyncStatus();
  }
}
// Works from the editor (open product) and from the product list (any product).
async function deleteProduct(p = S.product) {
  if (!p?.id || !canEdit()) return;
  if (n(p.stock_reserved) > 0)
    return toast(
      'Tiene ' + n(p.stock_reserved) + ' un. reservadas para pedidos. Entrégalos o cancélalos primero.',
      'error'
    );
  const ok = await confirmDialog({
    title: 'Eliminar producto',
    body:
      '«' +
      p.name +
      '» se eliminará para todo el equipo' +
      (n(p.stock_qty) > 0 ? ', junto con su stock de ' + n(p.stock_qty) + ' un.' : '') +
      '. Los pedidos existentes se conservan. Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar',
    danger: true
  });
  if (!ok) return;
  let { error } = await supabase.from('products').delete().eq('id', p.id);
  if (error) return fail(error.message);
  removeDraft(p.id);
  cleanupPhoto(p.saved_photo_path ?? p.photo_path);
  await loadProducts();
  S.mode = 'dashboard';
  S.msg = 'Producto eliminado.';
  render();
}
async function duplicateProduct(id) {
  await openProduct(id);
  S.dirty = true;
  S.product = { ...structuredClone(S.product), id: null, name: S.product.name + ' - copia' };
  S.product.prints = S.product.prints.map(x => ({ ...x, id: null }));
  S.product.directCosts = S.product.directCosts.map(x => ({ ...x, id: null }));
  S.product.additionalCosts = S.product.additionalCosts.map(x => ({ ...x, id: null }));
  render();
}
async function archiveProduct(id) {
  if (!canEdit()) return;
  let { error } = await supabase.from('products').update({ status: 'archived' }).eq('id', id);
  if (error) return fail(error.message);
  await loadProducts();
  S.msg = 'Producto archivado.';
  render();
}
async function restoreProduct(id) {
  if (!canEdit()) return;
  let { error } = await supabase.from('products').update({ status: 'active' }).eq('id', id);
  if (error) return fail(error.message);
  await loadProducts();
  S.msg = 'Producto restaurado.';
  render();
}
