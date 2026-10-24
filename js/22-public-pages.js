'use strict';
// ---------------------------------------------------------------------------
// V3.2: public pages. A private tracking link per order (seguimiento.html) and
// a public catalog of chosen products with a WhatsApp «Lo quiero» button.
// ---------------------------------------------------------------------------
const trackingUrl = token => location.origin + '/seguimiento.html#' + token;
const catalogUrl = slug => location.origin + '/catalogo.html?c=' + slug;
async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Enlace copiado.');
  } catch {
    toast('No se pudo copiar; mantén presionado el enlace para copiarlo.', 'error');
  }
}
async function orderTrackingLink(order, action) {
  const { data, error } = await supabase.rpc('order_tracking_link', { p_order: order.id, p_action: action });
  if (error) throw error;
  order.tracking_token = data || null;
  const cached = (S.orders || []).find(o => o.id === order.id);
  if (cached) cached.tracking_token = order.tracking_token;
  return data;
}
function showTracking(order) {
  if (!canEdit()) return;
  const token = order.tracking_token,
    url = token ? trackingUrl(token) : '',
    customer = (S.customers || []).find(c => c.id === order.customer_id),
    hi = firstName(order.customer_name),
    text =
      'Hola' +
      (hi ? ' ' + hi : '') +
      ', aquí puedes ver el avance de tu pedido PED-' +
      order.order_no +
      ' (' +
      order.title +
      '): ' +
      url;
  const dialog = showDialog(
    'trackingDialog',
    '<div class="section-title"><h2>Seguimiento del pedido</h2><button class="btn btn-ghost" data-close>Volver</button></div>' +
      (token
        ? '<p class="small muted">El cliente ve el estado, la fecha estimada, el saldo y las fotos del trabajo. No ve costos ni notas internas.</p><div class="field"><label for="trackingLink">Enlace del cliente</label><input id="trackingLink" readonly value="' +
          esc(url) +
          '"></div><div class="row wrap-row"><button class="btn btn-primary" id="copyTracking">' +
          icon('copy') +
          'Copiar</button><a class="btn btn-secondary" target="_blank" rel="noopener" href="' +
          esc((whatsappLink(customer?.phone) || 'https://wa.me/') + '?text=' + encodeURIComponent(text)) +
          '">' +
          icon('message-circle') +
          'Enviar por WhatsApp</a><a class="btn btn-ghost" target="_blank" rel="noopener" href="' +
          esc(url) +
          '">Ver página</a></div><button class="btn btn-ghost danger-text" id="revokeTracking">Desactivar enlace</button>'
        : '<p class="muted">Crea un enlace privado para que el cliente vea el avance de su pedido sin escribirte.</p><button class="btn btn-primary" id="createTracking">' +
          icon('link') +
          'Crear enlace de seguimiento</button>') +
      '<div id="trackingFeedback" class="small" role="status"></div>'
  );
  const act = action => async () => {
    try {
      await orderTrackingLink(order, action);
      dialog.close();
      if (action === 'revoke') toast('Enlace desactivado: la página ya no abre.');
      showTracking(order);
    } catch (error) {
      q('#trackingFeedback').textContent = error.message;
    }
  };
  q('#createTracking')?.addEventListener('click', act('create'));
  q('#copyTracking')?.addEventListener('click', () => copyLink(url));
  q('#revokeTracking')?.addEventListener('click', async () => {
    if (
      !(await confirmDialog({
        title: 'Desactivar enlace',
        body: 'El enlace dejará de funcionar. Si creas otro, será distinto.',
        confirmLabel: 'Desactivar',
        danger: true
      }))
    )
      return showTracking(order);
    act('revoke')();
  });
  return dialog;
}
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
