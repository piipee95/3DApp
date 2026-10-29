'use strict';
// Productos: lista y galería, números del producto, stock de productos, edición rápida, listas de precios y catálogo.
const PRODUCT_LIST_COLUMNS =
  'id,workspace_id,name,description,quantity,iva_enabled,iva_rate,target_margin,round_to,status,sale_price,photo_path,stock_qty,stock_reserved,catalog_visible,catalog_price,created_at,updated_at';
async function loadProducts() {
  let { data, error } = await supabase
    .from('products')
    .select(PRODUCT_LIST_COLUMNS)
    .eq('workspace_id', S.workspace.id)
    .order('updated_at', { ascending: false });
  if (error) return fail(error.message);
  S.products = data || [];
  let { data: sums, error: se } = await supabase
    .from('product_cost_summary')
    .select('product_id,total_cost')
    .eq('workspace_id', S.workspace.id);
  if (se) S.err = 'No se pudieron cargar los costos: ' + se.message;
  S.summaries = new Map((sums || []).map(x => [x.product_id, x]));
  await loadLegacyPhotos();
  await loadPhotoUrls(S.products);
  migrateLegacyPhotos();
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
const sellButton = p =>
  canEdit() && p.status !== 'archived' && productStock(p).available > 0
    ? '<button type="button" class="btn btn-secondary btn-sm sell-btn" data-sell="' +
      p.id +
      '">' +
      icon('wallet') +
      'Vender</button>'
    : '';
// The preview only reads loaded products; editing and stock actions keep their existing handlers.
let productPreviewId = null;
function productMetrics(p) {
  const t = productNumbers(p), s = productStock(p);
  return '<dl class="product-metrics"><div><dt>Costo unitario</dt><dd>' +
    (t.unit > 0 ? clp(t.unit) : '—') + '</dd></div><div><dt>Precio final</dt><dd>' +
    (t.unit > 0 || p.sale_price != null ? clp(t.price) : '—') +
    '</dd></div><div><dt>Margen</dt><dd>' + (t.margin == null ? '—' : pct(t.margin)) +
    '</dd></div><div><dt>Disponible</dt><dd>' + s.available + ' un.</dd></div></dl>';
}
function productGrid(rows) {
  return '<div class="product-grid">' + rows.map(p => {
    const src = photoSrc(p);
    return '<article class="product-card' + (p.status === 'archived' ? ' archived' : '') +
      (p.id === productPreviewId ? ' selected' : '') + '"><button type="button" class="pc-preview" data-preview="' +
      esc(p.id) + '" aria-label="Vista previa de ' + esc(p.name) + '" aria-pressed="' +
      (p.id === productPreviewId) + '"><span class="pc-photo">' + (src ? '<img src="' + esc(src) +
      '" alt="" loading="lazy">' : '<span class="pc-empty">' + icon('package') +
      '</span>') + '</span><b class="pc-name">' + esc(p.name) + '</b></button><div class="pc-body">' +
      productMetrics(p) + '<div class="pc-actions"><button type="button" class="btn btn-secondary btn-sm" data-open="' +
      esc(p.id) + '">Abrir</button>' + sellButton(p) + productMenu(p) + '</div></div></article>';
  }).join('') + '</div>';
}
function productPreview(p) {
  const src = photoSrc(p);
  return '<aside class="product-preview" aria-labelledby="previewTitle"><div class="preview-heading"><h2 id="previewTitle">' +
    esc(p.name) + '</h2><button type="button" class="btn icon-btn" id="closeProductPreview" aria-label="Cerrar vista previa">' +
    icon('x') + '</button></div>' + (src ? '<img class="preview-photo" src="' + esc(src) + '" alt="' +
    esc(p.name) + '">' : '<div class="preview-no-photo">' + icon('package') + '<span>Sin fotografía</span></div>') +
    '<p class="preview-description">' + esc(p.description || 'Sin descripción') + '</p>' + productMetrics(p) +
    '<p class="small muted">' + (p.status === 'archived' ? 'Archivado' : 'Activo') +
    (productStock(p).reserved ? ' · ' + productStock(p).reserved + ' un. reservadas' : '') +
    '</p><button type="button" class="btn btn-primary" data-open="' + esc(p.id) +
    '">Abrir producto</button></aside>';
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
  if (!S.productView)
    try {
      S.productView = localStorage.getItem('kultiapp_product_view') || 'list';
    } catch {
      S.productView = 'list';
    }
  const active = S.products.filter(p => p.status !== 'archived'),
    arch = S.products.filter(p => p.status === 'archived'),
    inStock = active.filter(p => productStock(p).qty > 0),
    list = S.showArchived ? arch : S.showStock ? inStock : active,
    term = S.search.toLocaleLowerCase('es');
  const rows = list
    .filter(p => (p.name + ' ' + (p.description || '')).toLocaleLowerCase('es').includes(term))
    .filter(p => matchesProfit(p))
    .sort(compareProducts);
  const preview = rows.find(p => p.id === productPreviewId);
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
      '<button class="btn btn-secondary" id="priceListsBtn" type="button" aria-label="Precios rápidos">' +
        icon('calculator') +
        '<span>Precios rápidos</span></button><button class="btn btn-secondary" id="catalogBtn" type="button" aria-label="Catálogo">' +
        icon('store') +
        '<span>Catálogo</span></button>' +
        (canEdit()
          ? '<button class="btn btn-primary" id="new" type="button" aria-label="Nuevo producto">' +
            icon('plus') +
            '<span>Nuevo producto</span></button>'
          : '')
    ) +
    '<main class="shell products-studio">' +
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
    '</span></button></div><button type="button" class="btn icon-btn view-toggle" id="viewToggle" aria-label="' +
    (S.productView === 'grid' ? 'Ver como lista' : 'Ver como galería') +
    '" title="' +
    (S.productView === 'grid' ? 'Ver como lista' : 'Ver como galería') +
    '">' +
    icon(S.productView === 'grid' ? 'list' : 'layout-grid') +
    '</button><select id="profitFilter" class="select-compact" aria-label="Rentabilidad"><option value="all">Margen: todos</option><option value="positive">Sin pérdida</option><option value="loss">Con pérdida</option><option value="uncosted">Sin costos registrados</option></select><select id="productSort" class="select-compact" aria-label="Ordenar"><option value="recent">Más recientes</option><option value="name">Nombre A–Z</option><option value="price">Precio mayor a menor</option><option value="cost">Costo mayor a menor</option><option value="margin">Margen mayor a menor</option></select></div><div class="product-workspace' + (preview ? ' has-preview' : '') + '"><section class="panel product-panel">' +
    (rows.length
      ? S.productView === 'grid'
        ? productGrid(rows)
        : '<table class="data-table products-table"><thead><tr><th>Producto</th><th class="r">Costo unit.</th><th class="r">Precio final</th><th>Margen</th><th class="r">Stock</th><th>Actualizado</th><th></th></tr></thead><tbody>' +
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
                '</td><td class="r row-actions">' +
                sellButton(p) +
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
                sellButton(p) +
                productMenu(p) +
                '</div>'
            )
            .join('') +
          '</div>'
      : empty) +
    '</section>' + (preview ? productPreview(preview) : '') + '</div></main>';
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
  q('#viewToggle').onclick = () => {
    S.productView = S.productView === 'grid' ? 'list' : 'grid';
    try {
      localStorage.setItem('kultiapp_product_view', S.productView);
    } catch {}
    dashboard();
  };
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
  qa('[data-preview]').forEach(button => {
    button.onclick = () => {
      productPreviewId = button.dataset.preview;
      dashboard();
      q('#closeProductPreview')?.focus();
    };
  });
  const closePreview = () => {
    const id = productPreviewId;
    productPreviewId = null;
    dashboard();
    qa('[data-preview]').find(b => b.dataset.preview === id)?.focus();
  };
  q('#closeProductPreview')?.addEventListener('click', closePreview);
  q('.product-preview')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closePreview(); }
  });
  // Rows open the product; the ⋯ menu and its actions don't.
  qa('[data-open]').forEach(row => {
    row.onclick = e => {
      if (e.target.closest('.row-menu,[data-sell]')) return;
      openProduct(row.dataset.open);
    };
    row.onkeydown = e => {
      if (e.key === 'Enter' && e.target === row) openProduct(row.dataset.open);
    };
  });
  qa('[data-sell]').forEach(b => (b.onclick = () => showSell(S.products.find(p => p.id === b.dataset.sell))));
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
function productNumbers(p) {
  const unit = n(S.summaries.get(p.id)?.total_cost) / Math.max(1, n(p.quantity)),
    net = unit / Math.max(0.01, 1 - n(p.target_margin)),
    suggested = commercial(p.iva_enabled ? net * (1 + n(p.iva_rate)) : net, p.round_to),
    price = p.sale_price == null ? suggested : n(p.sale_price),
    finalNet = p.iva_enabled ? price / (1 + n(p.iva_rate)) : price;
  return {
    unit,
    price,
    profit: finalNet - unit,
    margin: unit > 0 && finalNet > 0 ? (finalNet - unit) / finalNet : null
  };
}
function matchesProfit(p) {
  const t = productNumbers(p);
  return (
    S.profitFilter === 'all' ||
    (S.profitFilter === 'loss' && t.profit < 0) ||
    (S.profitFilter === 'positive' && t.unit > 0 && t.profit >= 0) ||
    (S.profitFilter === 'uncosted' && t.unit === 0)
  );
}
function compareProducts(a, b) {
  const x = productNumbers(a),
    y = productNumbers(b);
  return S.sort === 'name'
    ? a.name.localeCompare(b.name, 'es')
    : S.sort === 'price'
      ? y.price - x.price
      : S.sort === 'cost'
        ? y.unit - x.unit
        : S.sort === 'margin'
          ? (y.margin ?? -Infinity) - (x.margin ?? -Infinity) || 0
          : String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
}
// ---------------------------------------------------------------------------
// V1.7: finished-goods stock, fabrication for stock, quick price/stock edits
// and the filament picker.
// ---------------------------------------------------------------------------
function productStock(p) {
  const qty = n(p?.stock_qty),
    reserved = n(p?.stock_reserved);
  return { qty, reserved, available: Math.max(0, qty - reserved) };
}
// Keep the open product and the list in sync after a stock change.
async function refreshProductStock(id) {
  await loadProducts();
  const listed = S.products.find(p => p.id === id);
  if (listed && S.product?.id === id) {
    S.product.stock_qty = listed.stock_qty;
    S.product.stock_reserved = listed.stock_reserved;
  }
}
const STOCK_MOVES = { production: 'Fabricación', sale: 'Venta', adjustment: 'Ajuste' };
function showStockAdjust(p) {
  if (!canEdit() || !p?.id) return;
  const s = productStock(p);
  const dialog = showDialog(
    'stockAdjustDialog',
    '<div class="section-title"><h2>Stock de ' +
      esc(p.name) +
      '</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><dl class="facts"><div><dt>Disponible</dt><dd>' +
      s.available +
      ' un.</dd></div><div><dt>Reservado</dt><dd>' +
      s.reserved +
      ' un.</dd></div><div><dt>Físico</dt><dd>' +
      s.qty +
      ' un.</dd></div></dl><form id="stockAdjustForm" class="grid">' +
      fieldHtml(
        'Unidades contadas (stock real)',
        'adjustCount',
        s.qty,
        'number',
        'min="' + s.reserved + '" max="100000" step="1" required'
      ) +
      fieldHtml('Motivo', 'adjustNote', '', 'text', 'maxlength="200" placeholder="Ej. conteo de bodega"') +
      '<p class="small muted">El ajuste no descuenta materiales. Para registrar algo que fabricaste usa «Fabricar para stock».</p><div id="adjustFeedback" class="small" role="status"></div><div class="dialog-actions"><button class="btn btn-primary" type="submit">Guardar conteo</button></div></form><h3 class="form-section">Historial</h3><div id="stockHistory" class="small muted">Cargando…</div>'
  );
  q('#stockAdjustForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]'),
      count = Math.round(n(q('#adjustCount').value));
    b.disabled = true;
    try {
      const { error } = await supabase.rpc('adjust_product_stock', {
        p_product: p.id,
        p_count: count,
        p_note: q('#adjustNote').value.trim()
      });
      if (error) throw error;
      await refreshProductStock(p.id);
      dialog.close();
      S.msg = 'Stock actualizado: ' + count + ' un.';
      render();
    } catch (error) {
      q('#adjustFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  loadStockHistory(p.id, dialog);
  return dialog;
}
async function loadStockHistory(productId, dialog) {
  try {
    const { data, error } = await supabase
      .from('product_stock_movements')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    if (!dialog.isConnected) return;
    q('#stockHistory').innerHTML = data?.length
      ? data
          .map(
            m =>
              '<div class="resource-row"><span><b>' +
              STOCK_MOVES[m.kind] +
              '</b> · ' +
              esc(new Date(m.created_at).toLocaleDateString('es-CL')) +
              (m.note ? ' · ' + esc(m.note) : '') +
              '</span><b class="num ' +
              (m.quantity < 0 ? 'down' : 'up') +
              '">' +
              (m.quantity > 0 ? '+' : '') +
              m.quantity +
              ' un.</b></div>'
          )
          .join('')
      : 'Sin movimientos todavía.';
  } catch (error) {
    if (dialog.isConnected)
      q('#stockHistory').textContent = 'No se pudo cargar el historial: ' + error.message;
  }
}
// Quick edit from the product list: selling price, target margin and real stock.
function showQuickEdit(p) {
  if (!canEdit() || !p) return;
  const { unit } = productNumbers(p),
    auto = productNumbers({ ...p, sale_price: null }).price,
    s = productStock(p);
  const dialog = showDialog(
    'quickEditDialog',
    '<div class="section-title"><h2>' +
      esc(p.name) +
      '</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><dl class="facts"><div><dt>Costo unitario</dt><dd>' +
      (unit > 0 ? clp(unit) : '—') +
      '</dd></div><div><dt>Precio automático</dt><dd>' +
      clp(auto) +
      '</dd></div><div><dt>Stock disponible</dt><dd>' +
      s.available +
      ' un.</dd></div></dl><form id="quickEditForm" class="grid"><div class="grid grid-2">' +
      fieldHtml(
        'Precio de venta final' + (p.iva_enabled ? ' (con IVA)' : ''),
        'qePrice',
        p.sale_price == null ? '' : Math.round(n(p.sale_price)),
        'number',
        'min="0" step="1" placeholder="Automático: ' + clp(auto) + '"'
      ) +
      fieldHtml(
        'Margen objetivo %',
        'qeMargin',
        Math.round(n(p.target_margin) * 100),
        'number',
        'min="0" max="94" step="1" required'
      ) +
      fieldHtml(
        'Stock real (unidades)',
        'qeStock',
        s.qty,
        'number',
        'min="' + s.reserved + '" max="100000" step="1" required'
      ) +
      fieldHtml(
        'Motivo del ajuste',
        'qeNote',
        '',
        'text',
        'maxlength="200" placeholder="Solo si cambias el stock"'
      ) +
      '</div><div id="qePreview" class="notice small" role="status"></div><div id="qeFeedback" class="small" role="status"></div><div class="dialog-actions"><button type="button" class="btn btn-ghost" id="qeOpen">Abrir editor completo</button><button class="btn btn-primary" type="submit">Guardar</button></div></form>'
  );
  const read = () => {
    const raw = q('#qePrice').value,
      margin = Math.min(0.94, Math.max(0, n(q('#qeMargin').value) / 100)),
      sale = raw === '' ? null : Math.max(0, Math.round(n(raw)));
    return { sale, margin, count: Math.round(n(q('#qeStock').value)) };
  };
  const preview = () => {
    const v = read(),
      t = productNumbers({ ...p, sale_price: v.sale, target_margin: v.margin });
    q('#qePreview').innerHTML =
      'Precio final: <b>' +
      clp(t.price) +
      '</b>' +
      (v.sale == null ? ' (automático)' : '') +
      (t.margin == null
        ? ''
        : ' · Margen <b class="' +
          (t.margin < 0 ? 'down' : '') +
          '">' +
          pct(t.margin) +
          '</b> · Utilidad / un. ' +
          clp(t.profit));
  };
  dialog.querySelectorAll('input').forEach(el => (el.oninput = preview));
  preview();
  q('#qeOpen').onclick = () => {
    dialog.close();
    openProduct(p.id);
  };
  q('#quickEditForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]'),
      v = read();
    b.disabled = true;
    try {
      if (
        v.sale !== (p.sale_price == null ? null : Math.round(n(p.sale_price))) ||
        Math.abs(v.margin - n(p.target_margin)) > 1e-9
      ) {
        const { error } = await supabase
          .from('products')
          .update({ sale_price: v.sale, target_margin: v.margin })
          .eq('id', p.id)
          .eq('workspace_id', S.workspace.id);
        if (error) throw error;
      }
      if (v.count !== s.qty) {
        const { error } = await supabase.rpc('adjust_product_stock', {
          p_product: p.id,
          p_count: v.count,
          p_note: q('#qeNote').value.trim() || 'Ajuste rápido'
        });
        if (error) throw error;
      }
      await refreshProductStock(p.id);
      dialog.close();
      S.msg = 'Cambios guardados en ' + p.name + '.';
      render();
    } catch (error) {
      q('#qeFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  return dialog;
}
// Filament picker: searchable grid of catalog filaments with color and available grams.
function filamentChip(f) {
  const r = f.resource_id && S.resources.find(x => x.id === f.resource_id);
  if (!r)
    return (
      '<button type="button" class="fil-chip pickF empty">' +
      icon('search') +
      '<span class="fil-text"><b>Elegir del inventario</b><span>o escribe el color abajo</span></span></button>'
    );
  return (
    '<button type="button" class="fil-chip pickF" title="Cambiar filamento"><span class="swatch lg" style="background:' +
    (/^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#303a4d') +
    '"></span><span class="fil-text"><b>' +
    esc(r.name) +
    '</b><span>' +
    (r.material ? esc(r.material) + ' · ' : '') +
    clp(r.price_per_kg) +
    '/kg · ' +
    stockNumber(availableStock(r)) +
    ' g disp.</span></span>' +
    icon('chevron-down') +
    '</button>'
  );
}
function showFilamentPicker(row) {
  const list = activeResources('filament').sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!list.length) return toast('Agrega filamentos en Inventario para elegirlos aquí.', 'error');
  const needed = n(row.querySelector('.fg')?.value),
    current = row.dataset.resourceId || '';
  const dialog = showDialog(
    'filamentPicker',
    '<div class="section-title"><h2>Elegir filamento</h2><button class="btn btn-ghost" data-close>Cerrar</button></div>' +
      searchBox('filSearch', 'Buscar color o marca', '') +
      '<div class="fil-grid" id="filGrid"></div>' +
      (current
        ? '<button type="button" class="btn btn-ghost" id="filUnlink">Usar sin inventario</button>'
        : '')
  );
  const choose = id => {
    const select = row.querySelector('.filamentSelect');
    select.value = id;
    select.dispatchEvent(new Event('change'));
    dialog.close();
    collect();
    render();
  };
  const draw = () => {
    const term = q('#filSearch').value.toLocaleLowerCase('es'),
      rows = list.filter(r => (r.name + ' ' + (r.material || '')).toLocaleLowerCase('es').includes(term));
    q('#filGrid').innerHTML =
      rows
        .map(r => {
          const avail = availableStock(r);
          return (
            '<button type="button" class="fil-option' +
            (r.id === current ? ' on' : '') +
            '" data-pick="' +
            r.id +
            '"><span class="swatch lg" style="background:' +
            (/^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#303a4d') +
            '"></span><span class="fil-text"><b>' +
            esc(r.name) +
            '</b><span>' +
            esc(r.material || 'Sin marca') +
            ' · ' +
            clp(r.price_per_kg) +
            '/kg</span></span><span class="fil-stock ' +
            (!r.counted ? 'warn' : avail < needed ? 'down' : '') +
            '">' +
            (r.counted ? stockNumber(avail) + ' g' : 'Sin conteo') +
            '</span></button>'
          );
        })
        .join('') || '<p class="muted small">Sin coincidencias.</p>';
    qa('#filGrid [data-pick]').forEach(b => (b.onclick = () => choose(b.dataset.pick)));
  };
  q('#filSearch').oninput = draw;
  q('#filUnlink')?.addEventListener('click', () => choose(''));
  draw();
  return dialog;
}
// ---------------------------------------------------------------------------
// V3.0: quick price lists for custom work: a base product with sizes and extras.
// Picking size + extras fills the job title and agreed price in quotes and orders.
// ---------------------------------------------------------------------------
async function loadPriceLists() {
  const { data, error } = await supabase
    .from('price_lists')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('name');
  if (error) throw error;
  S.priceLists = data || [];
}
const activePriceLists = () => (S.priceLists || []).filter(pl => pl.active !== false && pl.sizes?.length);
function showPriceLists() {
  const lists = S.priceLists || [];
  const dialog = showDialog(
    'priceListsDialog',
    '<div class="section-title"><h2>Precios rápidos</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><p class="small muted">Tablas con tamaños y extras para cotizar personalizados en segundos, siempre con el mismo criterio. Se usan en «Nueva cotización» y «Nuevo pedido».</p><div class="stock-pick-list">' +
      (lists.length
        ? lists
            .map(
              pl =>
                '<button type="button" class="list-row" data-price-list="' +
                pl.id +
                '"><span class="lr-main"><b>' +
                esc(pl.name) +
                (pl.active === false ? ' · inactiva' : '') +
                '</b><span>' +
                pl.sizes.map(s => esc(s.label) + ' ' + clp(s.price)).join(' · ') +
                (pl.extras?.length
                  ? ' · ' + pl.extras.length + (pl.extras.length === 1 ? ' extra' : ' extras')
                  : '') +
                '</span></span>' +
                icon('chevron-right') +
                '</button>'
            )
            .join('')
        : '<p class="small muted">Aún no hay tablas. Ejemplo: «Cuadro personalizado» con tamaños 20×30 y 30×40 y extras como luz LED o nombre grabado.</p>') +
      '</div>' +
      (canEdit()
        ? '<button type="button" class="btn btn-primary" id="newPriceList">' +
          icon('plus') +
          'Nueva tabla</button>'
        : '')
  );
  q('#newPriceList')?.addEventListener('click', () => {
    dialog.close();
    showPriceListForm({});
  });
  dialog.querySelectorAll('[data-price-list]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        showPriceListForm(lists.find(pl => pl.id === b.dataset.priceList));
      })
  );
  return dialog;
}
function showPriceListForm(pl) {
  const edit = canEdit(),
    sizes = (pl.sizes?.length ? pl.sizes : [{ label: '', price: '' }]).map(x => ({ ...x })),
    extras = (pl.extras || []).map(x => ({ ...x }));
  const dialog = showDialog(
    'priceListForm',
    '<div class="section-title"><h2>' +
      (pl.id ? esc(pl.name) : 'Nueva tabla de precios') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="priceListFormEl" class="grid">' +
      fieldHtml(
        'Nombre',
        'plName',
        pl.name || '',
        'text',
        'required maxlength="80" placeholder="Ej. Cuadro personalizado"'
      ) +
      '<label class="check-row"><input type="checkbox" id="plIva"' +
      (pl.iva_enabled === false ? '' : ' checked') +
      '> <span><b>Precios con IVA incluido</b></span></label><h3 class="form-section">Tamaños o versiones</h3><div id="plSizes" class="grid"></div><button type="button" class="btn btn-ghost btn-sm" data-add-row="sizes">' +
      icon('plus') +
      'Tamaño</button><h3 class="form-section">Extras (opcionales)</h3><div id="plExtras" class="grid"></div><button type="button" class="btn btn-ghost btn-sm" data-add-row="extras">' +
      icon('plus') +
      'Extra</button>' +
      (pl.id
        ? '<label class="check-row"><input type="checkbox" id="plActive"' +
          (pl.active === false ? '' : ' checked') +
          '> <span><b>Activa</b><span class="small muted">Las inactivas no aparecen al cotizar.</span></span></label>'
        : '') +
      '<div id="plFeedback" class="small" role="status"></div>' +
      (edit
        ? '<div class="dialog-actions">' +
          (pl.id
            ? '<button type="button" class="btn btn-ghost danger-text" id="plDelete">' +
              icon('trash-2') +
              'Eliminar</button>'
            : '') +
          '<button class="btn btn-primary" type="submit">Guardar tabla</button></div>'
        : '') +
      '</form>'
  );
  const rowsOf = { sizes, extras };
  const read = () =>
    ['sizes', 'extras'].forEach(kind =>
      dialog.querySelectorAll('[data-row="' + kind + '"]').forEach((el, i) => {
        rowsOf[kind][i] = {
          label: el.querySelector('.rLabel').value.trim(),
          price: el.querySelector('.rPrice').value
        };
      })
    );
  const draw = () => {
    for (const [kind, box, ph] of [
      ['sizes', '#plSizes', 'Ej. 30×40 cm'],
      ['extras', '#plExtras', 'Ej. Luz LED']
    ])
      q(box).innerHTML = rowsOf[kind]
        .map(
          (r, i) =>
            '<div class="partner-row" data-row="' +
            kind +
            '"><input class="rLabel" aria-label="Nombre" maxlength="60" placeholder="' +
            ph +
            '" value="' +
            esc(r.label) +
            '"><input class="rPrice" aria-label="Precio" type="number" min="0" step="1" placeholder="Precio" value="' +
            esc(r.price) +
            '"><span>$</span><button type="button" class="btn icon-btn" data-rm-row="' +
            kind +
            ':' +
            i +
            '" aria-label="Quitar">' +
            icon('trash-2') +
            '</button></div>'
        )
        .join('');
    dialog.querySelectorAll('[data-rm-row]').forEach(
      b =>
        (b.onclick = () => {
          read();
          const [kind, i] = b.dataset.rmRow.split(':');
          rowsOf[kind].splice(+i, 1);
          draw();
        })
    );
  };
  dialog.querySelectorAll('[data-add-row]').forEach(
    b =>
      (b.onclick = () => {
        read();
        if (rowsOf[b.dataset.addRow].length < 20) rowsOf[b.dataset.addRow].push({ label: '', price: '' });
        draw();
      })
  );
  draw();
  q('#priceListFormEl').onsubmit = async e => {
    e.preventDefault();
    if (!edit) return;
    read();
    const clean = list =>
      list
        .filter(r => r.label && r.price !== '')
        .map(r => ({ label: r.label.slice(0, 60), price: Math.max(0, Math.round(n(r.price))) }));
    const v = {
      name: q('#plName').value.trim(),
      iva_enabled: q('#plIva').checked,
      sizes: clean(sizes),
      extras: clean(extras),
      ...(pl.id ? { active: q('#plActive').checked, updated_at: new Date().toISOString() } : {})
    };
    if (!v.sizes.length) return (q('#plFeedback').textContent = 'Agrega al menos un tamaño con su precio.');
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    b.disabled = true;
    try {
      const { error } = pl.id
        ? await supabase.from('price_lists').update(v).eq('id', pl.id)
        : await supabase.from('price_lists').insert({ ...v, workspace_id: S.workspace.id });
      if (error) throw error;
      await loadPriceLists();
      dialog.close();
      toast('Tabla de precios guardada.');
      showPriceLists();
    } catch (error) {
      q('#plFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  q('#plDelete')?.addEventListener('click', async () => {
    dialog.close();
    if (
      !(await confirmDialog({
        title: 'Eliminar tabla',
        body:
          '«' +
          pl.name +
          '» dejará de aparecer al cotizar. Las cotizaciones y pedidos ya creados no cambian.',
        confirmLabel: 'Eliminar',
        danger: true
      }))
    )
      return;
    const { error } = await supabase.from('price_lists').delete().eq('id', pl.id);
    if (error) return toast(error.message, 'error');
    S.priceLists = S.priceLists.filter(x => x.id !== pl.id);
    showPriceLists();
  });
  return dialog;
}
// Picker inside the quick quote/order form.
function priceListPicker() {
  const lists = activePriceLists();
  if (!lists.length)
    return canEdit()
      ? '<button type="button" class="link-btn price-setup" id="setupPriceLists">' +
          icon('calculator') +
          'Crear tabla de precios rápidos</button>'
      : '';
  return (
    '<div class="price-pick"><div class="field"><label for="plPick">Precio desde tabla (opcional)</label><select id="plPick"><option value="">Precio manual</option>' +
    lists.map(pl => '<option value="' + pl.id + '">' + esc(pl.name) + '</option>').join('') +
    '</select></div><div id="plOptions"></div></div>'
  );
}
function mountPriceListPicker(onChange) {
  q('#setupPriceLists')?.addEventListener('click', () => {
    q('#quickJobDialog')?.close();
    showPriceLists();
  });
  const select = q('#plPick');
  if (!select) return;
  let autoTitle = '';
  const apply = () => {
    const pl = activePriceLists().find(x => x.id === select.value);
    if (!pl) return;
    const size = pl.sizes[+(q('[name=plSize]:checked')?.value ?? 0)] || pl.sizes[0],
      chosen = qa('[name=plExtra]:checked')
        .map(el => pl.extras[+el.value])
        .filter(Boolean),
      price = n(size.price) + chosen.reduce((s, x) => s + n(x.price), 0),
      title = pl.name + ' ' + size.label + (chosen.length ? ' + ' + chosen.map(x => x.label).join(', ') : '');
    q('#qjPrice').value = price;
    q('#qjIva').checked = pl.iva_enabled !== false;
    // Only replace the title while it is still the one generated by the picker.
    if (!q('#qjTitle').value.trim() || q('#qjTitle').value === autoTitle) q('#qjTitle').value = title;
    autoTitle = title;
    onChange();
  };
  select.onchange = () => {
    const pl = activePriceLists().find(x => x.id === select.value);
    q('#plOptions').innerHTML = pl
      ? '<div class="pick-group"><span class="small muted">Tamaño</span><div class="pills">' +
        pl.sizes
          .map(
            (s, i) =>
              '<label class="pill pick-pill"><input type="radio" name="plSize" value="' +
              i +
              '"' +
              (i ? '' : ' checked') +
              '>' +
              esc(s.label) +
              ' <span class="seg-count">' +
              clp(s.price) +
              '</span></label>'
          )
          .join('') +
        '</div></div>' +
        (pl.extras?.length
          ? '<div class="pick-group"><span class="small muted">Extras</span><div class="pills">' +
            pl.extras
              .map(
                (x, i) =>
                  '<label class="pill pick-pill"><input type="checkbox" name="plExtra" value="' +
                  i +
                  '">+ ' +
                  esc(x.label) +
                  ' <span class="seg-count">' +
                  clp(x.price) +
                  '</span></label>'
              )
              .join('') +
            '</div></div>'
          : '')
      : '';
    qa('[name=plSize],[name=plExtra]').forEach(el => (el.onchange = apply));
    apply();
  };
}
const catalogUrl = slug => location.origin + '/catalogo.html?c=' + slug;
// ---- Catalog ------------------------------------------------------------------
const slugify = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
// Starts from the product's selling price; empty when the product has no cost yet.
function suggestedCatalogPrice(p) {
  const price = Math.round(n(productNumbers(p).price));
  return price > 0 ? price : '';
}
function showCatalog() {
  const edit = canEdit(),
    st = S.settings,
    products = (S.products || []).filter(p => p.status !== 'archived'),
    slug = st.catalog_slug || '';
  const dialog = showDialog(
    'catalogDialog',
    '<div class="section-title"><h2>Catálogo público</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><p class="small muted">Una página para compartir en Instagram o WhatsApp con los productos que elijas. Cada uno tiene un botón «Lo quiero» que abre WhatsApp con el producto escrito.</p>' +
      (slug
        ? '<div class="field"><label for="catalogLink">Enlace del catálogo</label><input id="catalogLink" readonly value="' +
          esc(catalogUrl(slug)) +
          '"></div><div class="row wrap-row"><button type="button" class="btn btn-secondary" id="copyCatalog">' +
          icon('copy') +
          'Copiar</button><a class="btn btn-ghost" target="_blank" rel="noopener" href="' +
          esc(catalogUrl(slug)) +
          '">Ver catálogo</a></div>'
        : '') +
      '<form id="catalogForm" class="grid">' +
      fieldHtml(
        'Dirección del catálogo',
        'catSlug',
        slug || slugify(S.workspace?.name),
        'text',
        'required minlength="3" maxlength="40" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="kultiverso-pop"'
      ) +
      fieldHtml(
        'WhatsApp para pedidos',
        'catWhatsapp',
        st.catalog_whatsapp || '',
        'tel',
        'required inputmode="tel" maxlength="20" placeholder="+56 9 1234 5678"'
      ) +
      fieldHtml(
        'Presentación (opcional)',
        'catIntro',
        st.catalog_intro || '',
        'text',
        'maxlength="300" placeholder="Figuras y cuadros 3D hechos en Chile"'
      ) +
      '<h3 class="form-section">Productos publicados</h3>' +
      (products.length
        ? '<div class="catalog-pick">' +
          products
            .map(
              p =>
                '<label class="catalog-pick-row"><input type="checkbox" class="catOn" data-id="' +
                p.id +
                '"' +
                (p.catalog_visible ? ' checked' : '') +
                '><span class="lr-main"><b>' +
                esc(p.name) +
                '</b><span>' +
                (n(p.stock_qty) - n(p.stock_reserved) > 0 ? 'En stock' : 'Por encargo') +
                '</span></span><input class="catPrice" type="number" min="0" step="1" aria-label="Precio público de ' +
                esc(p.name) +
                '" placeholder="Consultar" value="' +
                (p.catalog_price ?? suggestedCatalogPrice(p)) +
                '"></label>'
            )
            .join('') +
          '</div><p class="small muted">Precio vacío: se muestra «Precio a consultar». Solo se publica el nombre, la descripción, la foto, el precio y si hay stock.</p>'
        : '<p class="small muted">Aún no hay productos.</p>') +
      '<div id="catalogFeedback" class="small" role="status"></div>' +
      (edit ? '<button class="btn btn-primary" type="submit">Guardar catálogo</button>' : '') +
      '</form>'
  );
  if (!edit) dialog.querySelectorAll('#catalogForm input').forEach(el => (el.disabled = true));
  q('#copyCatalog')?.addEventListener('click', () => copyLink(catalogUrl(slug)));
  q('#catalogForm').onsubmit = async e => {
    e.preventDefault();
    if (!edit) return;
    const b = e.submitter || e.target.querySelector('button[type=submit]'),
      newSlug = slugify(q('#catSlug').value),
      phone = q('#catWhatsapp').value.replace(/\D/g, ''),
      feedback = q('#catalogFeedback');
    if (newSlug.length < 3)
      return (feedback.textContent = 'La dirección debe tener al menos 3 letras o números.');
    if (phone.length < 8) return (feedback.textContent = 'Escribe un WhatsApp válido, con código de país.');
    b.disabled = true;
    try {
      const settings = {
        catalog_slug: newSlug,
        catalog_whatsapp: phone,
        catalog_intro: q('#catIntro').value.trim()
      };
      const { error } = await supabase
        .from('workspace_settings')
        .update(settings)
        .eq('workspace_id', S.workspace.id);
      if (error)
        throw error.code === '23505' ? new Error('Esa dirección ya está en uso. Prueba con otra.') : error;
      Object.assign(S.settings, settings);
      // Only products whose publication or price changed are written.
      for (const row of dialog.querySelectorAll('.catalog-pick-row')) {
        const p = S.products.find(x => x.id === row.querySelector('.catOn').dataset.id),
          raw = row.querySelector('.catPrice').value,
          v = {
            catalog_visible: row.querySelector('.catOn').checked,
            catalog_price: raw === '' ? null : Math.max(0, Math.round(n(raw)))
          };
        if (!v.catalog_visible && !p.catalog_visible) continue;
        if (v.catalog_visible === !!p.catalog_visible && v.catalog_price === (p.catalog_price ?? null))
          continue;
        const { error: pe } = await supabase.from('products').update(v).eq('id', p.id);
        if (pe) throw pe;
        Object.assign(p, v);
      }
      dialog.close();
      toast('Catálogo guardado.');
      showCatalog();
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  return dialog;
}
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
