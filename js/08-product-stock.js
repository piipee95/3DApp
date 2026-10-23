'use strict';
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
