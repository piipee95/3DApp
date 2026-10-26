'use strict';
// Impresoras: horas de uso, mantención y fallas de impresión.
function showResourceForm(resource) {
  if (!canEdit()) return;
  const isFilament = resource.kind === 'filament';
  const dialog = showDialog(
    'resourceDialog',
    '<div class="section-title"><h2>' +
      (isFilament ? 'Filamento' : 'Impresora') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="resourceForm" class="grid">' +
      fieldHtml('Nombre', 'resourceName', resource.name, 'text', 'required maxlength="160"') +
      (isFilament
        ? fieldHtml('Marca / material', 'resourceMaterial', resource.material) +
          fieldHtml('Color', 'resourceColor', resource.color || '#303030', 'color') +
          fieldHtml(
            'Precio por kilogramo CLP',
            'resourcePrice',
            resource.price_per_kg ?? S.settings.filament_price_per_kg,
            'number',
            'min="0" step="1" required'
          )
        : fieldHtml(
            'Potencia eléctrica kW',
            'resourcePower',
            resource.power_kw ?? S.settings.printer_power_kw,
            'number',
            'min="0" max="100" step="0.01" required'
          ) +
          fieldHtml(
            'Mantención cada (horas de impresión)',
            'resourceMaint',
            resource.maintenance_every_hours || '',
            'number',
            'min="0" max="100000" step="1" placeholder="Ej. 200 · vacío: sin aviso"'
          )) +
      '<label class="small"><input type="checkbox" id="resourceActive" ' +
      (resource.active ? 'checked' : '') +
      '> Disponible para seleccionar</label><div id="resourceFeedback" role="status" class="small"></div><button class="btn btn-primary" type="submit">Guardar recurso</button></form>'
  );
  q('#resourceForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const value = {
        name: q('#resourceName').value.trim(),
        active: q('#resourceActive').checked,
        ...(isFilament
          ? {
              material: q('#resourceMaterial').value.trim(),
              color: q('#resourceColor').value,
              price_per_kg: n(q('#resourcePrice').value)
            }
          : {
              power_kw: n(q('#resourcePower').value),
              maintenance_every_hours: Math.max(0, Math.round(n(q('#resourceMaint').value)))
            })
      };
      // Updates may only touch the columns granted for update; workspace and kind are set once on insert.
      const query = resource.id
        ? supabase
            .from('workspace_resources')
            .update(value)
            .eq('id', resource.id)
            .eq('workspace_id', S.workspace.id)
        : supabase
            .from('workspace_resources')
            .insert({ ...value, workspace_id: S.workspace.id, kind: resource.kind });
      const { error } = await query.select().single();
      if (error) throw error;
      await loadResources();
      dialog.close();
      render();
    } catch (error) {
      q('#resourceFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
function resourcesView() {
  const printers = S.resources.filter(r => r.kind === 'printer');
  root.innerHTML =
    header(
      'Impresoras',
      canEdit()
        ? '<button class="btn btn-secondary" id="newFailureBtn">' +
            icon('triangle-alert') +
            '<span>Registrar falla</span></button><button class="btn btn-primary" data-add-resource="printer">' +
            icon('plus') +
            '<span>Impresora</span></button>'
        : ''
    ) +
    '<main class="shell narrow">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<section class="panel">' +
    (printers.length
      ? printers
          .map(
            r =>
              '<div class="list-row static printer-row' +
              (!r.active ? ' archived' : '') +
              '"><span class="thumb-empty">' +
              icon('printer') +
              '</span><span class="lr-main"><b>' +
              esc(r.name) +
              '</b><span>' +
              n(r.power_kw).toLocaleString('es-CL') +
              ' kW de consumo máximo</span>' +
              printerUsageMarkup(r) +
              (canEdit() && r.active
                ? '<span class="printer-actions"><button class="btn btn-ghost btn-sm" type="button" data-printer-hours="' +
                  r.id +
                  '">' +
                  icon('plus') +
                  'Sumar horas</button><button class="btn btn-ghost btn-sm" type="button" data-printer-maint="' +
                  r.id +
                  '">' +
                  icon('wrench') +
                  'Mantención hecha</button></span>'
                : '') +
              '</span><span class="chip ' +
              (r.active ? 'c-ready' : 'c-cancel') +
              '">' +
              (r.active ? 'Disponible' : 'Inactiva') +
              '</span>' +
              (canEdit()
                ? '<button class="btn icon-btn" type="button" data-edit-resource="' +
                  r.id +
                  '" aria-label="Editar ' +
                  esc(r.name) +
                  '" title="Editar">' +
                  icon('pencil') +
                  '</button>'
                : '') +
              '</div>'
          )
          .join('')
      : '<div class="panel-empty">' +
        icon('printer') +
        '<b>Aún no hay impresoras</b><span>Regístralas con su potencia para calcular la electricidad.</span></div>') +
    '</section><section class="panel" id="failuresPanel" hidden></section><p class="small muted footnote">La potencia se copia a cada impresión al elegir la impresora; cambiarla aquí no modifica productos anteriores.</p></main>';
  common();
  qa('[data-add-resource]').forEach(
    b => (b.onclick = () => showResourceForm({ kind: b.dataset.addResource, active: true }))
  );
  qa('[data-edit-resource]').forEach(
    b => (b.onclick = () => showResourceForm(S.resources.find(r => r.id === b.dataset.editResource)))
  );
  qa('[data-printer-hours]').forEach(
    b =>
      (b.onclick = () =>
        printerAction(
          S.resources.find(r => r.id === b.dataset.printerHours),
          'add'
        ))
  );
  qa('[data-printer-maint]').forEach(
    b =>
      (b.onclick = () =>
        printerAction(
          S.resources.find(r => r.id === b.dataset.printerMaint),
          'maintenance'
        ))
  );
  q('#newFailureBtn')?.addEventListener('click', () => showFailure());
  failuresSummary();
}
// ---------------------------------------------------------------------------
// V3.1: failed prints, printer hours/maintenance and photos of finished work.
// ---------------------------------------------------------------------------
const FAILURE_REASONS = {
  adherencia: 'Se despegó de la cama',
  spaghetti: 'Spaghetti / capa corrida',
  atasco: 'Atasco de filamento',
  corte_luz: 'Corte de luz',
  diseno: 'Error de diseño o laminado',
  calibracion: 'Calibración / nivelación',
  otro: 'Otro'
};
async function loadFailures() {
  const { data, error } = await supabase
    .from('print_failures')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('occurred_on', { ascending: false });
  if (error) throw error;
  S.failures = data || [];
}
// Lost filament + electricity of the failed time, using the printer's power or the general one.
function failureCost(grams, minutes, filament, printer) {
  const kg = n(grams) / 1000,
    kw = printer ? n(printer.power_kw) : n(S.settings.printer_power_kw);
  return Math.round(
    kg * n(filament?.price_per_kg ?? S.settings.filament_price_per_kg) +
      (n(minutes) / 60) * kw * n(S.settings.electricity_rate_clp_kwh)
  );
}
function showFailure(order = null) {
  if (!canEdit()) return;
  const printers = activeResources('printer'),
    filaments = activeResources('filament');
  const dialog = showDialog(
    'failureDialog',
    '<div class="section-title"><h2>Registrar falla</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="failureForm" class="grid">' +
      (order ? '<p class="small muted">PED-' + order.order_no + ' · ' + esc(order.title) + '</p>' : '') +
      '<div class="grid grid-2"><div class="field"><label for="faReason">Motivo</label><select id="faReason">' +
      Object.entries(FAILURE_REASONS)
        .map(([k, v]) => '<option value="' + k + '">' + v + '</option>')
        .join('') +
      '</select></div>' +
      fieldHtml('Fecha', 'faDate', new Date().toLocaleDateString('sv-SE'), 'date', 'required') +
      '<div class="field"><label for="faPrinter">Impresora</label><select id="faPrinter"><option value="">Sin indicar</option>' +
      printers.map(r => '<option value="' + r.id + '">' + esc(r.name) + '</option>').join('') +
      '</select></div><div class="field"><label for="faFilament">Filamento perdido</label><select id="faFilament"><option value="">Sin indicar</option>' +
      filaments
        .map(
          r =>
            '<option value="' +
            r.id +
            '">' +
            esc(r.name) +
            (r.material ? ' · ' + esc(r.material) : '') +
            '</option>'
        )
        .join('') +
      '</select></div>' +
      fieldHtml('Gramos perdidos', 'faGrams', '', 'number', 'min="0" step="0.1" placeholder="0"') +
      fieldHtml('Tiempo perdido (horas)', 'faHours', '', 'number', 'min="0" step="0.1" placeholder="0"') +
      fieldHtml(
        'Costo de la falla',
        'faCost',
        '',
        'number',
        'min="0" step="1" placeholder="Se calcula solo"'
      ) +
      '</div><label class="check-row" id="faDeductRow" hidden><input type="checkbox" id="faDeduct" checked> <span><b>Descontar el filamento del inventario</b><span class="small muted">Se registra como merma del material elegido.</span></span></label>' +
      '<div class="field"><label for="faNote">Nota (opcional)</label><input id="faNote" maxlength="500" placeholder="Qué pasó y qué se cambió"></div>' +
      (order
        ? '<p class="small muted">El costo se suma a «fallas» del pedido y descuenta su utilidad real.</p>'
        : '') +
      '<div id="faFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Registrar falla</button></form>'
  );
  let costTouched = false;
  const auto = () => {
    const fil = filaments.find(r => r.id === q('#faFilament').value),
      pr = printers.find(r => r.id === q('#faPrinter').value);
    q('#faDeductRow').hidden = !fil || !fil.counted || !(n(q('#faGrams').value) > 0);
    if (!costTouched)
      q('#faCost').value = failureCost(q('#faGrams').value, n(q('#faHours').value) * 60, fil, pr) || '';
  };
  ['#faFilament', '#faPrinter'].forEach(id => (q(id).onchange = auto));
  ['#faGrams', '#faHours'].forEach(id => (q(id).oninput = auto));
  q('#faCost').oninput = () => (costTouched = true);
  q('#failureForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    const fil = filaments.find(r => r.id === q('#faFilament').value),
      printerId = q('#faPrinter').value || null,
      grams = Math.max(0, n(q('#faGrams').value)),
      minutes = Math.max(0, n(q('#faHours').value) * 60),
      cost = Math.max(0, Math.round(n(q('#faCost').value))),
      deduct = !q('#faDeductRow').hidden && q('#faDeduct').checked;
    try {
      if (deduct) {
        const { error } = await supabase.from('inventory_movements').insert({
          workspace_id: S.workspace.id,
          resource_id: fil.id,
          kind: 'loss',
          quantity: -grams,
          unit_cost: n(fil.unit_cost),
          note:
            'Falla de impresión' +
            (order ? ' PED-' + order.order_no : '') +
            ': ' +
            FAILURE_REASONS[q('#faReason').value],
          request_key: crypto.randomUUID()
        });
        if (error) throw error;
      }
      const { error } = await supabase.from('print_failures').insert({
        workspace_id: S.workspace.id,
        occurred_on: q('#faDate').value,
        order_id: order?.id || null,
        product_id: order?.product_id || null,
        printer_id: printerId,
        resource_id: fil?.id || null,
        reason: q('#faReason').value,
        grams,
        minutes,
        cost,
        deducted: deduct,
        note: q('#faNote').value.trim()
      });
      if (error) throw error;
      if (order && cost > 0) {
        const { error: oe } = await supabase
          .from('production_orders')
          .update({ failures_cost: n(order.failures_cost) + cost, updated_at: new Date().toISOString() })
          .eq('id', order.id);
        if (oe) throw oe;
      }
      // Failed time also wears the printer.
      if (printerId && minutes > 0) await addPrinterHours(printerId, minutes / 60);
      await Promise.all([loadFailures(), loadResources(), order ? loadOrders() : null]);
      dialog.close();
      S.msg = 'Falla registrada' + (deduct ? ' y filamento descontado' : '') + '.';
      render();
      if (order) {
        const fresh = S.orders.find(o => o.id === order.id);
        if (fresh) showOrder(fresh);
      }
    } catch (error) {
      q('#faFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  return dialog;
}
function failuresOfMonth(y, m) {
  const list = (S.failures || []).filter(f => inMonth(f.occurred_on, y, m)),
    by = {};
  for (const f of list) by[f.reason] = (by[f.reason] || 0) + 1;
  return {
    list,
    count: list.length,
    grams: list.reduce((s, f) => s + n(f.grams), 0),
    hours: list.reduce((s, f) => s + n(f.minutes), 0) / 60,
    cost: list.reduce((s, f) => s + n(f.cost), 0),
    top: Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  };
}
// ---- Printer hours and maintenance ------------------------------------------
async function addPrinterHours(printerId, hours) {
  const h = Math.round(n(hours) * 100) / 100;
  if (!(h > 0)) return;
  const { error } = await supabase.rpc('printer_hours', {
    p_printer: printerId,
    p_action: 'add',
    p_hours: Math.min(h, 1000)
  });
  if (error) throw error;
}
// When an order is finished, its print time (from the product's print jobs) is added to each printer used.
async function addOrderPrinterHours(order) {
  if (!order?.product_id) return;
  const product = S.products.find(p => p.id === order.product_id);
  try {
    const { data, error } = await supabase
      .from('print_jobs')
      .select('printer_name,hours,minutes')
      .eq('product_id', order.product_id);
    if (error) throw error;
    const ratio = n(order.quantity) / Math.max(1, n(product?.quantity) || 1),
      byPrinter = new Map();
    for (const j of data || []) {
      const pr = activeResources('printer').find(r => j.printer_name && r.name === j.printer_name);
      if (pr) byPrinter.set(pr.id, (byPrinter.get(pr.id) || 0) + (n(j.hours) + n(j.minutes) / 60) * ratio);
    }
    for (const [id, hours] of byPrinter) await addPrinterHours(id, hours);
  } catch (error) {
    logError('handled', 'Horas de impresora: ' + error.message);
  }
}
const isFinished = status => ['ready', 'delivered'].includes(status);
function printerUsage(r) {
  const since = Math.max(0, n(r.hours_used) - n(r.hours_at_maintenance)),
    every = n(r.maintenance_every_hours);
  return { since, every, ratio: every > 0 ? since / every : 0, due: every > 0 && since >= every };
}
function printersDue() {
  return S.resources.filter(r => r.kind === 'printer' && r.active && printerUsage(r).due);
}
function printerUsageMarkup(r) {
  const u = printerUsage(r);
  return (
    '<div class="printer-usage"><div class="pu-line"><span>' +
    Math.round(n(r.hours_used)).toLocaleString('es-CL') +
    ' h impresas' +
    (u.every
      ? ' · ' +
        Math.round(u.since).toLocaleString('es-CL') +
        ' de ' +
        u.every.toLocaleString('es-CL') +
        ' h hasta la mantención'
      : ' · define cada cuántas horas mantenerla') +
    '</span>' +
    (u.due ? '<b class="down">Toca mantención</b>' : '') +
    '</div>' +
    (u.every
      ? '<div class="pay-bar"><i class="' +
        (u.due ? 'due' : '') +
        '" style="width:' +
        Math.min(100, Math.round(u.ratio * 100)) +
        '%"></i></div>'
      : '') +
    (r.last_maintenance_on
      ? '<span class="small muted">Última mantención: ' + shortDate(r.last_maintenance_on) + '</span>'
      : '') +
    '</div>'
  );
}
async function printerAction(r, action) {
  try {
    if (action === 'maintenance') {
      if (
        !(await confirmDialog({
          title: 'Mantención de ' + r.name,
          body: 'Se reinicia el contador de horas hasta la próxima mantención.',
          confirmLabel: 'Registrar mantención'
        }))
      )
        return;
      const { error } = await supabase.rpc('printer_hours', { p_printer: r.id, p_action: 'maintenance' });
      if (error) throw error;
      toast('Mantención registrada.');
    } else {
      const dialog = showDialog(
        'printerHoursDialog',
        '<div class="section-title"><h2>Sumar horas · ' +
          esc(r.name) +
          '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="printerHoursForm" class="grid">' +
          fieldHtml(
            'Horas de impresión',
            'phHours',
            '',
            'number',
            'min="0.1" max="1000" step="0.1" required'
          ) +
          '<p class="small muted">Las horas de los pedidos con producto se suman solas al marcarlos «Listo». Usa esto para impresiones sueltas.</p><div id="phFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Sumar</button></form>'
      );
      q('#printerHoursForm').onsubmit = async e => {
        e.preventDefault();
        try {
          await addPrinterHours(r.id, q('#phHours').value);
          await loadResources();
          dialog.close();
          render();
        } catch (error) {
          q('#phFeedback').textContent = error.message;
        }
      };
      return;
    }
    await loadResources();
    render();
  } catch (error) {
    toast(error.message, 'error');
  }
}
// Failures not already part of an order's real cost (loose or on orders without a real cost) reduce real profit.
function failureWaste(y, m) {
  return failuresOfMonth(y, m).list.reduce((s, f) => {
    const order = f.order_id && (S.orders || []).find(o => o.id === f.order_id);
    return s + (order && order.actual_cost != null ? 0 : n(f.cost));
  }, 0);
}
function failuresPanelMarkup(y, m) {
  const f = failuresOfMonth(y, m);
  return (
    '<section class="panel report-panel"><div class="panel-h"><h2>Fallas y merma</h2></div>' +
    (f.count
      ? '<dl class="facts"><div><dt>Fallas</dt><dd>' +
        f.count +
        '</dd></div><div><dt>Filamento perdido</dt><dd>' +
        Math.round(f.grams).toLocaleString('es-CL') +
        ' g</dd></div><div><dt>Horas perdidas</dt><dd>' +
        (Math.round(f.hours * 10) / 10).toLocaleString('es-CL') +
        ' h</dd></div><div><dt>Costo</dt><dd class="down">' +
        clp(f.cost) +
        '</dd></div>' +
        (f.top ? '<div><dt>Motivo más común</dt><dd>' + FAILURE_REASONS[f.top] + '</dd></div>' : '') +
        '</dl>'
      : '<p class="small muted report-empty">Sin fallas registradas este mes.</p>') +
    '</section>'
  );
}
// Recent failures under the printers list, with undo for editors.
function failuresSummary() {
  const box = q('#failuresPanel');
  if (!box) return;
  const recent = (S.failures || []).slice(0, 8),
    now = new Date();
  box.hidden = !recent.length;
  if (!recent.length) return;
  const month = failuresOfMonth(now.getFullYear(), now.getMonth()),
    names = id => S.resources.find(r => r.id === id)?.name;
  box.innerHTML =
    '<div class="panel-h"><h2>Fallas recientes</h2><span class="small muted">Este mes: ' +
    month.count +
    ' · ' +
    clp(month.cost) +
    '</span></div>' +
    recent
      .map(
        f =>
          '<div class="list-row static"><span class="thumb-empty">' +
          icon('triangle-alert') +
          '</span><span class="lr-main"><b>' +
          FAILURE_REASONS[f.reason] +
          '</b><span>' +
          [
            shortDate(f.occurred_on),
            names(f.printer_id),
            f.grams
              ? Math.round(n(f.grams)) + ' g' + (names(f.resource_id) ? ' de ' + names(f.resource_id) : '')
              : '',
            f.note
          ]
            .filter(Boolean)
            .map(esc)
            .join(' · ') +
          '</span></span><b class="num">' +
          clp(f.cost) +
          '</b>' +
          (canEdit()
            ? '<button class="btn icon-btn" type="button" data-del-failure="' +
              f.id +
              '" aria-label="Borrar registro">' +
              icon('trash-2') +
              '</button>'
            : '') +
          '</div>'
      )
      .join('');
  box.querySelectorAll('[data-del-failure]').forEach(
    b =>
      (b.onclick = async () => {
        if (
          !(await confirmDialog({
            title: 'Borrar registro de falla',
            body: 'Solo se borra el registro. El filamento descontado y el costo sumado al pedido no se revierten.',
            confirmLabel: 'Borrar',
            danger: true
          }))
        )
          return;
        const { error } = await supabase.from('print_failures').delete().eq('id', b.dataset.delFailure);
        if (error) return toast(error.message, 'error');
        S.failures = S.failures.filter(f => f.id !== b.dataset.delFailure);
        failuresSummary();
      })
  );
}
