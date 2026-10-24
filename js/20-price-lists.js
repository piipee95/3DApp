'use strict';
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
