'use strict';
// Editor de producto: impresiones, filamentos, costos, precio, fotos y borradores.
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
  setupPhotoAndFilaments();
  setupSellingPrice();
  setupInventoryProduct();
  setupEditorLayout();
  common();
  bindProduct();
}
function bindProduct() {
  bindPhotoAndQuote();
  bindEditorOrders();
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
    else setTimeout(() => offerOrderCostRefresh(id), 0);
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
function setupEditor() {
  const main = q('main'),
    sections = [...main.children].filter(el => el.tagName === 'SECTION');
  main.classList.add('editor');
  const tabs = [
    ['details', 'Producto'],
    ['prints', 'Impresiones'],
    ['costs', 'Costos'],
    ['summary', 'Resumen']
  ];
  sections[0].classList.add('settings-panel');
  const config = document.createElement('details');
  config.className = 'config-details';
  config.innerHTML = '<summary>Parámetros de cálculo <span>Filamento · energía · potencia</span></summary>';
  sections[0].before(config);
  config.append(sections[0]);
  const details = sections[1];
  details.dataset.panel = 'details';
  details.append(config);
  sections[2].dataset.panel = 'prints';
  sections[3].dataset.panel = 'costs';
  sections[4].dataset.panel = 'summary';
  const nav = document.createElement('nav');
  nav.className = 'editor-tabs';
  nav.setAttribute('aria-label', 'Secciones del producto');
  nav.innerHTML = tabs
    .map(
      ([key, label]) =>
        '<button class="btn" type="button" data-editor-tab="' + key + '">' + label + '</button>'
    )
    .join('');
  details.before(nav);
  const feedback = document.createElement('div');
  feedback.className = 'editor-feedback';
  feedback.setAttribute('aria-live', 'polite');
  feedback.innerHTML = (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') + '';
  nav.before(feedback);
  const t = totals();
  const quick = document.createElement('div');
  quick.className = 'quick-summary';
  quick.innerHTML =
    '<div><span>Costo / un.</span><b id="quickCost">' +
    clp(t.unit) +
    '</b></div><div><span>Precio final / un.</span><b id="quickPrice">' +
    clp(t.rounded) +
    '</b></div>';
  const saveHeading = document.createElement('h2');
  saveHeading.className = 'save-heading';
  saveHeading.textContent = 'Resumen del producto';
  q('.sticky-actions').prepend(saveHeading, quick);
  const select = key => {
    S.editorTab = key;
    qa('[data-panel]').forEach(el => (el.hidden = el.dataset.panel !== key));
    qa('[data-editor-tab]').forEach(b => {
      const active = b.dataset.editorTab === key;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  };
  qa('[data-editor-tab]').forEach(
    b =>
      (b.onclick = () => {
        select(b.dataset.editorTab);
        persistDraft();
        updateSyncStatus();
      })
  );
  select(S.editorTab);
  const status = document.createElement('div');
  status.id = 'draftStatus';
  status.className = 'small muted';
  status.setAttribute('role', 'status');
  const syncbar = document.createElement('div');
  syncbar.className = 'editor-syncbar';
  nav.after(syncbar);
  syncbar.append(status);
  if (canEdit()) {
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'btn btn-ghost';
    discard.textContent = 'Descartar borrador';
    discard.onclick = async () => {
      const ok = await confirmDialog({
        title: 'Descartar borrador',
        body: 'Se perderán los cambios que no guardaste en este producto.',
        confirmLabel: 'Descartar',
        danger: true
      });
      if (!ok) return;
      removeDraft(S.product.id || 'new');
      S.product = null;
      S.mode = 'dashboard';
      S.msg = 'Borrador descartado.';
      if (S.settingsDirty) loadSettings().then(render);
      render();
    };
    syncbar.append(discard);
    persistDraft(false);
  }
}
// Drafts remain on this device, isolated by authenticated user and workspace.
function draftPrefix() {
  return S.session?.user?.id && S.workspace?.id
    ? 'kultiapp:draft:v1:' + S.session.user.id + ':' + S.workspace.id + ':'
    : null;
}
function draftKey(id) {
  const prefix = draftPrefix();
  return prefix ? prefix + id : null;
}
function readDraft(id) {
  try {
    const key = draftKey(id);
    if (!key) return null;
    const d = JSON.parse(localStorage.getItem(key) || 'null');
    if (
      !d ||
      d.version !== 1 ||
      !d.product ||
      !Array.isArray(d.product.prints) ||
      !Array.isArray(d.product.directCosts) ||
      !Array.isArray(d.product.additionalCosts)
    )
      return null;
    if (String(d.product.id || 'new') !== String(id)) return null;
    return d;
  } catch {
    return null;
  }
}
function activeDraftId() {
  try {
    const prefix = draftPrefix();
    return prefix ? localStorage.getItem(prefix + 'active') : null;
  } catch {
    return null;
  }
}
function persistDraft(readForm = true) {
  if (S.mode !== 'product' || !canEdit() || !S.product || !S.dirty) return;
  const key = draftKey(S.product.id || 'new');
  if (!key) return;
  try {
    if (readForm && q('#name')) collect();
    const d = {
      version: 1,
      product: S.product,
      editedSettings: S.settingsDirty && {
        filament_price_per_kg: S.settings.filament_price_per_kg,
        electricity_rate_clp_kwh: S.settings.electricity_rate_clp_kwh,
        printer_power_kw: S.settings.printer_power_kw
      },
      tab: S.editorTab,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(key, JSON.stringify(d));
    localStorage.setItem(draftPrefix() + 'active', String(S.product.id || 'new'));
    if (q('#draftStatus'))
      q('#draftStatus').textContent =
        'Borrador guardado en este dispositivo · ' +
        new Date(d.updatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    if (q('#draftStatus'))
      q('#draftStatus').textContent =
        'No se pudo guardar el borrador en este dispositivo. Usa Guardar cambios.';
  }
}
function restoreDraft(id) {
  if (!canEdit()) return false;
  const d = readDraft(id);
  if (!d) return false;
  if (d.product.id && !S.products.some(p => p.id === d.product.id && p.status !== 'archived')) return false;
  S.product = d.product;
  S.dirty = true;
  if (d.editedSettings) {
    S.settings = { ...S.settings, ...d.editedSettings };
    S.settingsDirty = true;
  }
  S.editorTab = ['details', 'prints', 'costs', 'summary'].includes(d.tab) ? d.tab : 'details';
  S.mode = 'product';
  S.msg = 'Recuperamos tu borrador. Continúa donde quedaste.';
  return true;
}
function restoreActiveDraft() {
  const id = activeDraftId();
  return id ? restoreDraft(id) : false;
}
function removeDraft(id) {
  try {
    const key = draftKey(id);
    if (key) localStorage.removeItem(key);
    if (activeDraftId() === String(id)) localStorage.removeItem(draftPrefix() + 'active');
    if (q('#draftStatus')) q('#draftStatus').textContent = 'Cambios sincronizados.';
  } catch {}
}
function showDraftResume() {
  const id = activeDraftId(),
    d = id && readDraft(id);
  if (!d || !canEdit()) return;
  const box = document.createElement('div');
  box.className = 'notice row';
  const text = document.createElement('span');
  text.textContent = 'Borrador pendiente: ' + d.product.name;
  const resume = document.createElement('button');
  resume.type = 'button';
  resume.className = 'btn btn-secondary';
  resume.textContent = 'Continuar borrador';
  resume.onclick = () => {
    if (restoreDraft(id)) render();
  };
  box.append(text, resume);
  q('main')?.prepend(box);
}
window.addEventListener('pagehide', () => persistDraft());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistDraft();
});
// V1.2: material breakdown, product photos and customer-facing quotations.
function validPhoto(data) {
  return (
    typeof data === 'string' &&
    data.length <= 250000 &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data)
  );
}
// V1.5: saved photos live in Storage; photo_data only holds a new or legacy photo until it is uploaded.
const PHOTO_BUCKET = 'product-photos',
  PHOTO_URL_TTL = 43200;
function photoSrc(p) {
  if (validPhoto(p?.photo_data)) return p.photo_data;
  const u = p?.photo_path && S.photoUrls.get(p.photo_path);
  return u && u.exp > Date.now() ? u.url : null;
}
function photoImg(src, alt, cls) {
  return src ? '<img class="' + cls + '" src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy">' : '';
}
function productPhoto(p, cls = 'product-photo') {
  return photoImg(photoSrc(p), p.name, cls);
}
async function loadPhotoUrls(list) {
  const paths = [
    ...new Set(list.map(p => p.photo_path).filter(x => x && !(S.photoUrls.get(x)?.exp > Date.now() + 60000)))
  ];
  if (!paths.length) return;
  try {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_TTL);
    if (error) throw error;
    const exp = Date.now() + PHOTO_URL_TTL * 1000 - 60000;
    for (const x of data || []) if (x.signedUrl) S.photoUrls.set(x.path, { url: x.signedUrl, exp });
  } catch (e) {
    console.warn('No se pudieron cargar las fotos', e);
  }
}
async function loadLegacyPhotos() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id,photo_data')
      .eq('workspace_id', S.workspace.id)
      .not('photo_data', 'is', null);
    if (error) throw error;
    const legacy = new Map((data || []).map(x => [x.id, x.photo_data]));
    for (const p of S.products) if (legacy.has(p.id)) p.photo_data = legacy.get(p.id);
  } catch (e) {
    console.warn('No se pudieron cargar las fotos anteriores', e);
  }
}
async function uploadPhoto(dataUrl) {
  const bin = atob(dataUrl.split(',')[1]),
    blob = new Blob([Uint8Array.from(bin, c => c.charCodeAt(0))], { type: 'image/jpeg' }),
    path = S.workspace.id + '/' + crypto.randomUUID() + '.jpg';
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return path;
}
async function removePhotoObject(path) {
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  } catch {}
}
// Duplicated products share a photo, so an object is removed only when no product references it.
async function cleanupPhoto(path) {
  if (!path) return;
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('workspace_id', S.workspace.id)
      .eq('photo_path', path)
      .limit(1);
    if (error || data?.length) return;
    await removePhotoObject(path);
    S.photoUrls.delete(path);
  } catch {}
}
let photoMigration = null;
function migrateLegacyPhotos() {
  if (photoMigration || !canEdit()) return;
  const pending = S.products.filter(p => validPhoto(p.photo_data));
  if (!pending.length) return;
  photoMigration = (async () => {
    for (const p of pending) {
      try {
        const path = await uploadPhoto(p.photo_data);
        const { error } = await supabase
          .from('products')
          .update({ photo_path: path, photo_data: null })
          .eq('id', p.id)
          .eq('workspace_id', S.workspace.id);
        if (error) {
          await removePhotoObject(path);
          throw error;
        }
        const old = p.photo_path;
        S.photoUrls.set(path, { url: p.photo_data, exp: Infinity });
        p.photo_path = path;
        p.photo_data = null;
        if (old) cleanupPhoto(old);
      } catch (e) {
        console.warn('No se pudo migrar la foto de ' + p.name, e);
      }
    }
  })().finally(() => {
    photoMigration = null;
  });
}
function filamentTotals(items) {
  return items.reduce(
    (a, f) => {
      const grams = Math.max(0, n(f.grams)) + Math.max(0, n(f.purge_grams));
      return { grams: a.grams + grams, cost: a.cost + (grams * Math.max(0, n(f.price_per_kg))) / 1000 };
    },
    { grams: 0, cost: 0 }
  );
}
function collectFilaments(el) {
  return [...el.querySelectorAll('.filament-row')].map(row => ({
    resource_id: row.dataset.resourceId || null,
    name: row.querySelector('.fn').value,
    color: row.querySelector('.fc').value,
    grams: Math.max(0, n(row.querySelector('.fg').value)),
    purge_grams: 0,
    price_per_kg: Math.max(0, n(row.querySelector('.fp').value))
  }));
}
function filamentPanel(x) {
  const items = Array.isArray(x.filaments) ? x.filaments : [];
  return (
    '<div class="filament-panel"><div class="section-title"><h4>Filamentos por color <span class="small muted">' +
    items.length +
    '/7</span></h4><button type="button" class="btn btn-secondary addF" ' +
    (items.length >= 7 ? 'disabled' : '') +
    '>' +
    icon('plus') +
    'Color</button></div><p class="small muted">Consumo total por color según el slicer.</p>' +
    items
      .map(
        f =>
          '<div class="filament-row" data-resource-id="' +
          esc(f.resource_id || '') +
          '"><div class="field color-field"><label>Color / material</label><div class="row"><input class="fc" type="color" aria-label="Muestra de color" value="' +
          (/^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color : '#303030') +
          '"><input class="fn" aria-label="Nombre del filamento" placeholder="Ej. Rojo PLA" value="' +
          esc(f.name || '') +
          '"></div></div><div class="field"><label>Consumo total (g)</label><input class="fg" type="number" min="0" step="0.01" value="' +
          (Math.max(0, n(f.grams)) + Math.max(0, n(f.purge_grams))) +
          '"></div><div class="field"><label>Precio $/kg</label><input class="fp" type="number" min="0" value="' +
          n(f.price_per_kg) +
          '"></div><div class="filament-subtotal small">' +
          clp(filamentTotals([f]).cost) +
          '</div><button class="btn icon-btn rmF" type="button" aria-label="Quitar color" title="Quitar color">' +
          icon('trash-2') +
          '</button></div>'
      )
      .join('') +
    (items.length
      ? ''
      : '<div class="small muted">Sin desglose: se conserva el costo manual de filamento.</div>') +
    '</div>'
  );
}
function setupPhotoAndFilaments() {
  const detail = q('[data-panel="details"]');
  q('#name').closest('.field').classList.add('full-field');
  const photo = document.createElement('div');
  photo.className = 'photo-editor';
  photo.innerHTML =
    '<div class="photo-box">' +
    (productPhoto(S.product) || '<span class="photo-empty">' + icon('image') + '</span>') +
    '</div><div class="photo-actions"><b>Foto del producto</b><span class="small muted">Se muestra en la lista y en la cotización.</span><div class="row"><label class="btn btn-secondary" for="photoFile">' +
    icon('image') +
    (photoSrc(S.product) || S.product.photo_path ? 'Cambiar foto' : 'Subir foto') +
    '</label><input id="photoFile" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"><button class="btn btn-ghost" type="button" id="removePhoto" ' +
    (!photoSrc(S.product) && !S.product.photo_path ? 'hidden' : '') +
    '>Quitar</button></div></div>';
  detail.prepend(photo);
  const more = document.createElement('details');
  more.className = 'editor-more';
  more.innerHTML =
    '<summary class="btn icon-btn" aria-label="Más opciones" title="Más opciones">' +
    icon('ellipsis-vertical') +
    '</summary><div class="menu-pop"></div>';
  const pop = more.querySelector('.menu-pop');
  const discard = qa('main button').find(b => b.textContent === 'Descartar borrador');
  if (discard) pop.append(discard);
  pop.append(q('#del'));
  q('.page-actions').append(more);
  const quote = document.createElement('div');
  quote.className = 'quote-actions row';
  quote.innerHTML =
    '<button type="button" class="btn btn-secondary" id="quote">' +
    icon('file-text') +
    'Compartir cotización</button>';
  q('[data-panel="summary"]').prepend(quote);
  qa('.print-card').forEach(el => {
    const has = el.querySelectorAll('.filament-row').length > 0;
    el.querySelector('.pg').readOnly = has;
    el.querySelector('.pf').readOnly = has;
    if (has) {
      el.querySelector('.pg').title = 'Total de todos los colores, incluida la purga';
      el.querySelector('.pf').title = 'Suma calculada con el precio de cada color';
    }
    const advanced = document.createElement('details');
    advanced.className = 'print-advanced';
    advanced.innerHTML = '<summary>Costos de impresión y notas</summary><div class="grid grid-4"></div>';
    const fields = [...el.querySelector('.grid').children];
    advanced.querySelector('.grid').append(...fields.slice(4));
    el.querySelector('.filament-panel').before(advanced);
  });
  updateSyncStatus();
}
function updateSyncStatus() {
  const el = q('#draftStatus');
  if (!el) return;
  if (S.saving) {
    el.className = 'small sync-saving';
    el.textContent = 'Guardando…';
    return;
  }
  if (!S.dirty && S.product?.id) {
    el.textContent = '✓ Guardado en la nube';
    el.className = 'small sync-cloud';
    return;
  }
  el.className = 'small sync-local';
  if (!el.textContent.startsWith('No se pudo')) el.textContent = '● Borrador sin guardar en la nube';
}
function setupSellingPrice() {
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
    '</div></div><div class="row">' +
    (st.available > 0
      ? '<button type="button" class="btn btn-primary" id="sellStock"' +
        (canEdit() ? '' : ' disabled') +
        '>' +
        icon('wallet') +
        'Vender</button>'
      : '') +
    '<button type="button" class="btn btn-secondary" id="makeStock"' +
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
function bindEditorOrders() {
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
  q('#sellStock')?.addEventListener('click', () =>
    showSell(S.products.find(p => p.id === S.product.id) || S.product)
  );
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
function bindPhotoAndQuote() {
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
// Product editor: clearer order on the first tab and a price hero on the summary.
function setupEditorLayout() {
  const details = q('[data-panel="details"]');
  if (details) {
    const grid = q('#name').closest('.grid'),
      nameField = q('#name').closest('.field'),
      desc = q('#desc').closest('.field'),
      selling = q('.selling-price');
    desc.classList.add('full-field');
    desc.style.marginTop = '';
    nameField.after(desc);
    const heading = document.createElement('div');
    heading.className = 'full-field form-heading';
    heading.innerHTML =
      '<h3>Precio y margen</h3><span class="small muted">Define cómo se calcula el precio de venta.</span>';
    desc.after(heading);
    // "Aplicar IVA" becomes a switch inside the IVA % field.
    const iva = q('#iva'),
      ivaField = iva.closest('.field'),
      ivarField = q('#ivar').closest('.field'),
      label = ivarField.querySelector('label');
    const labelRow = document.createElement('div');
    labelRow.className = 'label-switch';
    label.before(labelRow);
    labelRow.append(label);
    label.htmlFor = 'ivar';
    label.textContent = 'IVA %';
    const sw = document.createElement('label');
    sw.className = 'switch';
    sw.htmlFor = 'iva';
    sw.append(iva);
    sw.insertAdjacentHTML('beforeend', '<i></i><span>Aplicar</span>');
    labelRow.append(sw);
    ivaField.remove();
    q('#ivar').disabled = !iva.checked || !canEdit();
    iva.addEventListener('change', () => (q('#ivar').disabled = !iva.checked));
    if (selling) {
      selling.classList.add('full-field');
      grid.append(selling);
    }
  }
  const summary = q('[data-panel="summary"]');
  if (summary) {
    const hero = document.createElement('div');
    hero.className = 'price-hero';
    hero.id = 'priceHero';
    q('.stock-card')?.before(hero);
    updatePriceHero();
    const fin = [...summary.querySelectorAll('h2')].find(h => h.textContent === 'Resumen financiero');
    if (fin && !fin.closest('details')) {
      const box = document.createElement('details');
      box.className = 'fin-details';
      box.innerHTML = '<summary>Desglose de costos y escenarios de precio</summary>';
      fin.before(box);
      let el = fin;
      const move = [];
      while (el) {
        move.push(el);
        el = el.nextElementSibling;
        if (el?.classList.contains('sticky-actions')) break;
      }
      box.append(...move.filter(x => !x.classList.contains('sticky-actions')));
      fin.remove();
    }
  }
}
function updatePriceHero() {
  const box = q('#priceHero');
  if (!box) return;
  const t = totals(),
    margin = t.rounded > 0 ? t.em : null;
  box.innerHTML =
    '<div class="ph-main"><span>Precio de venta / unidad</span><b class="num">' +
    clp(t.rounded) +
    '</b><small>' +
    (S.product.sale_price == null
      ? 'Calculado con margen objetivo ' + pct(S.product.target_margin)
      : 'Precio fijado manualmente') +
    (S.product.iva_enabled ? ' · IVA incluido' : '') +
    '</small></div><div class="ph-stats"><div><span>Costo / un.</span><b class="num">' +
    clp(t.unit) +
    '</b></div><div><span>Utilidad / un.</span><b class="num ' +
    (t.utilityUnit < 0 ? 'down' : 'up') +
    '">' +
    clp(t.utilityUnit) +
    '</b></div><div><span>Margen</span><b class="num ' +
    (margin != null && margin < 0 ? 'down' : '') +
    '">' +
    (margin == null ? '—' : pct(margin)) +
    '</b></div></div>';
}
