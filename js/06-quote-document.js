'use strict';
// V1.5: one quotation model drives the dialog, the print/PDF view and the shared PNG.
const LOGO_SRC = 'assets/kultiverso-pop-logo.webp';
const QUOTE_TERMS =
  'Valores en pesos chilenos. Despacho no incluido. Disponibilidad y plazo de producción sujetos a confirmación.';
const longDate = d => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
function quoteFolio(prefix = 'COT') {
  const d = new Date();
  return (
    prefix +
    '-' +
    String(d.getFullYear()).slice(2) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') +
    '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')
  );
}
function quoteDefaults() {
  const s = S.settings;
  return {
    client: '',
    validityDays: Math.min(365, Math.max(1, Math.round(n(s.quote_validity_days) || 15))),
    delivery: s.quote_delivery || '',
    terms: s.quote_terms ?? QUOTE_TERMS,
    contact: s.quote_contact || '',
    folio: quoteFolio(),
    date: new Date()
  };
}
// Totals derive from the rounded unit price so neto + IVA always equals the total.
function quoteTotals(d) {
  const total = Math.round(n(d.price)) * d.quantity,
    net = d.ivaEnabled ? Math.round(total / (1 + n(d.ivaRate))) : total;
  return { total, net, iva: total - net, validUntil: new Date(d.date.getTime() + d.validityDays * 864e5) };
}
function quoteData() {
  const p = S.product,
    t = totals(p);
  return {
    ...quoteDefaults(),
    name: p.name,
    description: p.description,
    photo: photoSrc(p),
    quantity: t.qty,
    price: t.rounded,
    ivaEnabled: p.iva_enabled,
    ivaRate: n(p.iva_rate),
    productId: p.id || null,
    unitCost: t.unit
  };
}
function quoteMarkup(d) {
  const t = quoteTotals(d),
    row = (k, v, cls = '') => '<div class="q-row ' + cls + '"><span>' + k + '</span><b>' + v + '</b></div>';
  return (
    '<header class="q-head"><img class="q-logo" src="' +
    LOGO_SRC +
    '" alt="Kultiverso Pop"><div class="q-title"><span>Cotización</span><b>' +
    esc(d.folio) +
    '</b></div></header><div class="q-stripe"></div><div class="q-meta"><div><span>Cliente</span><b>' +
    esc(d.client || '—') +
    '</b></div><div><span>Fecha</span><b>' +
    longDate(d.date) +
    '</b></div><div><span>Válida hasta</span><b>' +
    longDate(t.validUntil) +
    '</b></div></div><section class="q-product">' +
    photoImg(d.photo, d.name, 'quote-photo') +
    '<div><h2>' +
    esc(d.name) +
    '</h2>' +
    (d.description ? '<p class="quote-description">' + esc(d.description) + '</p>' : '') +
    '</div></section><table class="q-items"><thead><tr><th>Descripción</th><th>Cant.</th><th>Precio unit.' +
    (d.ivaEnabled ? ' c/IVA' : '') +
    '</th><th>Total</th></tr></thead><tbody><tr><td>' +
    esc(d.name) +
    '</td><td>' +
    d.quantity +
    '</td><td>' +
    clp(d.price) +
    '</td><td>' +
    clp(t.total) +
    '</td></tr></tbody></table><div class="q-totals">' +
    (d.ivaEnabled ? row('Neto', clp(t.net)) + row('IVA (' + pct(d.ivaRate) + ')', clp(t.iva)) : '') +
    row('Total a pagar', clp(t.total), 'q-grand') +
    '</div><section class="q-terms"><div><span>Plazo de entrega</span><p>' +
    esc(d.delivery || 'Por confirmar') +
    '</p></div>' +
    (d.terms ? '<div><span>Condiciones</span><p>' + esc(d.terms) + '</p></div>' : '') +
    '</section><footer class="q-foot">' +
    (d.contact ? '<b>' + esc(d.contact) + '</b>' : '') +
    '<span>Colecciona · Disfruta · Vive el Kultiverso</span></footer>'
  );
}
async function saveQuoteDefaults(d) {
  const v = {
    quote_contact: d.contact,
    quote_terms: d.terms,
    quote_delivery: d.delivery,
    quote_validity_days: d.validityDays
  };
  if (Object.entries(v).every(([k, x]) => S.settings[k] === x)) return;
  const { error } = await supabase.from('workspace_settings').update(v).eq('workspace_id', S.workspace.id);
  if (error) throw error;
  Object.assign(S.settings, v);
}
function showQuote(override = null) {
  const fromOrder = override?.quantity != null && override?.price != null;
  if (!fromOrder && canEdit()) {
    collect();
    persistDraft(false);
  }
  const d = override?.savedId
    ? { ...quoteDefaults(), ...override }
    : fromOrder
      ? { ...quoteDefaults(), ...override, fromOrder: true }
      : quoteData();
  const saves = canEdit() && !d.fromOrder;
  q('#quoteDialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'quoteDialog';
  dialog.className = 'quote-dialog';
  dialog.innerHTML =
    '<div class="quote-toolbar"><h2>Cotización</h2><button class="btn btn-secondary" id="printQuote">' +
    icon('printer') +
    '<span>Imprimir / PDF</span></button><button class="btn btn-primary" id="shareQuote">' +
    icon('share-2') +
    '<span>Compartir</span></button><button class="btn btn-secondary" id="waQuote">' +
    icon('message-circle') +
    '<span>WhatsApp</span></button>' +
    (saves
      ? '<button class="btn btn-secondary" id="saveQuote">' +
        icon('check') +
        '<span>' +
        (d.savedId ? 'Guardar cambios' : 'Guardar') +
        '</span></button>'
      : '') +
    '<button class="btn icon-btn dialog-close" id="closeQuote" aria-label="Cerrar">' +
    icon('x') +
    '</button></div><details class="quote-options"><summary>Datos de la cotización · cliente, plazo y condiciones</summary><div class="grid grid-2">' +
    fieldHtml(
      'Cliente',
      'quoteClient',
      d.client,
      'text',
      'maxlength="120" placeholder="Nombre o empresa" list="customerList" autocomplete="off"'
    ) +
    fieldHtml('Válida por (días)', 'quoteValidity', d.validityDays, 'number', 'min="1" max="365" step="1"') +
    fieldHtml(
      'Plazo de entrega',
      'quoteDelivery',
      d.delivery,
      'text',
      'maxlength="200" placeholder="Ej. 5 a 7 días hábiles"'
    ) +
    fieldHtml(
      'Contacto',
      'quoteContact',
      d.contact,
      'text',
      'maxlength="300" placeholder="WhatsApp, Instagram o correo"'
    ) +
    '</div><div class="field"><label for="quoteTerms">Condiciones</label><textarea id="quoteTerms" maxlength="1000">' +
    esc(d.terms) +
    '</textarea></div>' +
    (canEdit()
      ? '<label class="small"><input type="checkbox" id="quoteRemember" checked> Guardar plazo, condiciones, contacto y vigencia para las próximas cotizaciones del equipo</label>'
      : '') +
    '</details><article id="quoteSheet" class="quote-sheet">' +
    quoteMarkup(d) +
    '</article><p id="quoteFeedback" role="status" class="small muted"></p>' +
    customerOptions();
  document.body.append(dialog);
  dialog.showModal();
  focusDialog(dialog);
  enhanceFields();
  const feedback = t => {
    q('#quoteFeedback').textContent = t;
  };
  const update = () => {
    Object.assign(d, {
      client: q('#quoteClient').value.trim(),
      validityDays: Math.min(365, Math.max(1, Math.round(n(q('#quoteValidity').value) || 1))),
      delivery: q('#quoteDelivery').value.trim(),
      contact: q('#quoteContact').value.trim(),
      terms: q('#quoteTerms').value.trim()
    });
    q('#quoteSheet').innerHTML = quoteMarkup(d);
  };
  dialog
    .querySelectorAll('.quote-options input:not([type=checkbox]),.quote-options textarea')
    .forEach(el => (el.oninput = update));
  const remember = async () => {
    if (!q('#quoteRemember')?.checked) return;
    try {
      await saveQuoteDefaults(d);
    } catch (error) {
      feedback('No se pudieron guardar los datos predeterminados: ' + error.message);
    }
  };
  // Editors keep a record of every quote they print or share (folio COT-0001…).
  const persist = async () => {
    if (!saves) return;
    try {
      await saveQuoteRecord(d);
      q('#quoteSheet').innerHTML = quoteMarkup(d);
      const label = q('#saveQuote span');
      if (label) label.textContent = 'Guardar cambios';
      feedback('Guardada como ' + d.folio + ' en Cotizaciones.');
    } catch (error) {
      feedback('No se pudo guardar la cotización: ' + error.message);
    }
  };
  q('#closeQuote').onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  q('#saveQuote')?.addEventListener('click', async () => {
    const b = q('#saveQuote');
    b.disabled = true;
    update();
    remember();
    await persist();
    b.disabled = false;
  });
  // Opens the customer's chat with a ready-to-send summary (the image goes with «Compartir»).
  q('#waQuote').onclick = async () => {
    const win = window.open('', '_blank');
    update();
    remember();
    await persist();
    openWhatsApp(customerFor(null, d.client)?.phone, quoteMessage(d), win);
  };
  q('#printQuote').onclick = async () => {
    update();
    remember();
    await persist();
    window.print();
  };
  q('#shareQuote').onclick = async () => {
    const b = q('#shareQuote');
    b.disabled = true;
    update();
    remember();
    await persist();
    const name = 'Cotizacion-' + d.folio + '.png';
    try {
      const blob = await quoteImage(d),
        file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          files: [file],
          title: 'Cotización ' + d.folio + ' · ' + d.name,
          text: quoteMessage(d)
        });
      } else {
        downloadBlob(blob, name);
        feedback('Imagen descargada. Puedes adjuntarla en WhatsApp.');
      }
    } catch (error) {
      if (error.name !== 'AbortError')
        feedback('No se pudo compartir. Usa Imprimir / PDF para guardar la cotización.');
    } finally {
      b.disabled = false;
    }
  };
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
