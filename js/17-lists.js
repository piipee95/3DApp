'use strict';
// ---------------------------------------------------------------------------
// Pedidos, Inventario e Impresoras (V1.6 stage 3).
// ---------------------------------------------------------------------------
// Filter chips with counts, shared by Pedidos and Inventario.
function filterPills(items, active, attr) {
  return (
    '<div class="pills" role="tablist">' +
    items
      .map(
        ([key, label, count]) =>
          '<button type="button" class="pill' +
          (key === active ? ' on' : '') +
          '" ' +
          attr +
          '="' +
          key +
          '" role="tab" aria-selected="' +
          (key === active) +
          '">' +
          label +
          (count != null ? '<span>' + count + '</span>' : '') +
          '</button>'
      )
      .join('') +
    '</div>'
  );
}
function searchBox(id, placeholder, value) {
  return (
    '<label class="search-box">' +
    icon('search') +
    '<input id="' +
    id +
    '" type="search" placeholder="' +
    esc(placeholder) +
    '" aria-label="' +
    esc(placeholder) +
    '" value="' +
    esc(value || '') +
    '"></label>'
  );
}
// Re-render on typing without losing the caret.
function bindSearch(id, apply, view) {
  q('#' + id).oninput = e => {
    const pos = e.target.selectionStart;
    apply(e.target.value);
    view();
    q('#' + id).focus();
    q('#' + id).setSelectionRange(pos, pos);
  };
}
function orderMatches(o, filter) {
  if (filter === 'all') return true;
  if (filter === 'open') return orderIsOpen(o);
  if (filter === 'late') return orderIsLate(o);
  if (filter === 'stock') return o.kind === 'stock';
  if (filter === 'unpaid') return orderBalance(o).due > 0;
  return o.status === filter;
}
function orderCustomer(o) {
  if (o.kind === 'stock') return 'Para stock';
  return (o.customer_name || 'Sin cliente') + (o.from_stock ? ' · desde stock' : '');
}
function orderProfitCell(o) {
  if (o.kind === 'stock') return '<span class="muted">—</span>';
  const t = orderNumbers(o),
    real = t.actualProfit != null,
    v = real ? t.actualProfit : t.estimatedProfit;
  return (
    '<span class="' +
    (v < 0 ? 'down' : '') +
    '">' +
    clp(v) +
    '</span><div class="sub">' +
    (real ? 'real' : 'estimada') +
    '</div>'
  );
}
function productionView() {
  const term = (S.orderSearch || '').toLocaleLowerCase('es'),
    filter = S.orderFilter || 'open',
    count = f => S.orders.filter(o => orderMatches(o, f)).length,
    list = S.orders
      .filter(o => orderMatches(o, filter))
      .filter(o =>
        (o.title + ' ' + (o.customer_name || '') + ' PED-' + o.order_no)
          .toLocaleLowerCase('es')
          .includes(term)
      )
      .sort((a, b) =>
        orderIsOpen(a) && orderIsOpen(b)
          ? String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))
          : String(b.created_at || '').localeCompare(String(a.created_at || ''))
      );
  const pills = [
    ['open', 'En curso', count('open')],
    ['late', 'Atrasados', count('late')],
    ['unpaid', 'Por cobrar', count('unpaid')],
    ['stock', 'Fabricación', count('stock')],
    ...Object.entries(ORDER_STATUSES).map(([k, label]) => [k, label, count(k)]),
    ['all', 'Todos', S.orders.length]
  ].filter(([k, , c]) => c > 0 || ['open', 'all', filter].includes(k));
  const due = o =>
    '<span class="' + (orderIsLate(o) ? 'down' : '') + '">' + shortDate(o.due_date) + '</span>';
  root.innerHTML =
    header(
      'Pedidos',
      '<button class="btn icon-btn" id="reloadOrders" type="button" aria-label="Actualizar" title="Actualizar">' +
        icon('refresh-cw') +
        '</button>' +
        (canEdit()
          ? '<button class="btn btn-primary" id="newJobOrder" type="button">' +
            icon('plus') +
            '<span>Nuevo pedido</span></button>'
          : '')
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="toolbar">' +
    searchBox('orderSearch', 'Buscar pedido, cliente o PED-…', S.orderSearch) +
    '</div>' +
    filterPills(pills, filter, 'data-order-filter') +
    '<section class="panel">' +
    (list.length
      ? '<table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Estado</th><th class="r">Venta</th><th class="r">Utilidad</th></tr></thead><tbody>' +
        list
          .map(
            o =>
              '<tr data-order="' +
              o.id +
              '"><td><b>' +
              esc(o.title) +
              '</b><div class="sub">PED-' +
              o.order_no +
              ' · ' +
              o.quantity +
              ' un.</div></td><td>' +
              (o.kind === 'stock'
                ? '<span class="chip c-stock">Para stock</span>'
                : esc(o.customer_name || '—') + (o.from_stock ? '<div class="sub">desde stock</div>' : '')) +
              '</td><td class="num">' +
              due(o) +
              '</td><td>' +
              orderChip(o) +
              '</td><td class="r num">' +
              (o.kind === 'stock'
                ? '<span class="muted">—</span>'
                : clp(orderNumbers(o).sales) +
                  (orderBalance(o).due > 0
                    ? '<div class="sub warn">Saldo ' + clp(orderBalance(o).due) + '</div>'
                    : orderBalance(o).state === 'paid'
                      ? '<div class="sub up">Pagado</div>'
                      : '')) +
              '</td><td class="r num">' +
              orderProfitCell(o) +
              '</td></tr>'
          )
          .join('') +
        '</tbody></table><div class="list-rows">' +
        list
          .map(
            o =>
              '<button type="button" class="list-row" data-order="' +
              o.id +
              '"><span class="lr-main"><b>' +
              esc(o.title) +
              '</b><span>PED-' +
              o.order_no +
              ' · ' +
              esc(orderCustomer(o)) +
              ' · ' +
              due(o) +
              '</span></span><span class="lr-end"><b class="num">' +
              (o.kind === 'stock' ? o.quantity + ' un.' : clp(orderNumbers(o).sales)) +
              '</b>' +
              (orderBalance(o).due > 0
                ? '<span class="sub warn">Saldo ' + clp(orderBalance(o).due) + '</span>'
                : orderChip(o)) +
              '</span></button>'
          )
          .join('') +
        '</div>'
      : '<div class="panel-empty">' +
        icon(term ? 'search' : 'clipboard-list') +
        '<b>' +
        (term ? 'Sin resultados' : S.orders.length ? 'No hay pedidos en esta vista' : 'Aún no hay pedidos') +
        '</b><span>' +
        (S.orders.length ? 'Prueba con otro filtro.' : 'Crea uno desde el resumen de un producto.') +
        '</span></div>') +
    '</section></main>';
  common();
  bindSearch('orderSearch', v => (S.orderSearch = v), productionView);
  qa('[data-order-filter]').forEach(
    b =>
      (b.onclick = () => {
        S.orderFilter = b.dataset.orderFilter;
        productionView();
      })
  );
  q('#reloadOrders').onclick = () => goMode('production');
  q('#newJobOrder')?.addEventListener('click', () => showQuickJob('order'));
  qa('[data-order]').forEach(
    b => (b.onclick = () => showOrder(S.orders.find(o => o.id === b.dataset.order)))
  );
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
      ? '<button class="btn btn-secondary btn-sm" type="button" data-stock="' +
        r.id +
        '">' +
        (r.counted ? icon('plus') + 'Ingreso' : 'Contar stock') +
        '</button>'
      : '') +
    '<details class="row-menu"><summary class="btn icon-btn" aria-label="Acciones de ' +
    esc(r.name) +
    '">' +
    icon('ellipsis-vertical') +
    '</summary><div class="menu-pop">' +
    (canEdit()
      ? item('data-inventory-edit', 'pencil', 'Editar precio y datos') +
        (r.counted
          ? item('data-stock-set', 'refresh-cw', 'Cambiar cantidad') +
            item('data-stock-out', 'log-out', 'Sacar del stock')
          : '')
      : '') +
    item('data-ledger', 'history', 'Historial') +
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
      canEdit()
        ? '<button id="addInventory" class="btn btn-primary">' +
            icon('plus') +
            '<span>Material</span></button>'
        : ''
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="summary-strip"><div><span>Valor del stock</span><b class="num">' +
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
    '</b></div></div><div class="toolbar">' +
    searchBox('inventorySearch', 'Buscar material', S.inventorySearch) +
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
              '"><div class="prod-cell inv-name"><span class="swatch" style="background:' +
              (/^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#303a4d') +
              '"></span><div><b>' +
              esc(r.name) +
              '</b><span>' +
              (r.kind === 'filament' ? 'Filamento' : 'Insumo') +
              (r.material ? ' · ' + esc(r.material) : '') +
              '</span></div></div><div class="inv-num inv-avail" data-label="Disponible"><b>' +
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
  qa('[data-stock]').forEach(
    b => (b.onclick = () => showStockMovement(S.resources.find(r => r.id === b.dataset.stock)))
  );
  qa('[data-inventory-edit]').forEach(
    b => (b.onclick = () => showInventoryForm(S.resources.find(r => r.id === b.dataset.inventoryEdit)))
  );
  qa('[data-ledger]').forEach(
    b => (b.onclick = () => showInventoryLedger(S.resources.find(r => r.id === b.dataset.ledger)))
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
