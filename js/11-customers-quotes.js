'use strict';
// Clientes y cotizaciones: clientes, cotizaciones guardadas, documento e imagen de la cotización y archivos que envían los clientes.
const QUOTE_TERMS =
  'Valores en pesos chilenos. Despacho no incluido. Disponibilidad y plazo de producción sujetos a confirmación.';
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
// The PNG mirrors quoteMarkup at 1080 px, a width WhatsApp and Instagram show without resampling.
async function quoteImage(d) {
  const W = 1080,
    P = 64,
    FONT = 'Montserrat,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    INK = '#070A13',
    YELLOW = '#FFD800',
    ACCENT = '#c2126b',
    MUTED = '#697183',
    BODY = '#3d4556',
    SOFT = '#f4f5f8',
    LINE = '#e2e5ea',
    t = quoteTotals(d);
  const load = src =>
    new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      if (/^https?:/.test(src)) i.crossOrigin = 'anonymous';
      i.src = src;
    });
  let photo = null,
    logo = null;
  if (d.photo)
    try {
      photo = await load(d.photo);
    } catch {}
  try {
    logo = await load(LOGO_SRC);
  } catch {}
  // Canvas only uses web fonts that are already loaded.
  try {
    await Promise.all(
      ['400 24px Montserrat', '700 24px Montserrat', '800 24px Montserrat', '900 24px Montserrat'].map(f =>
        document.fonts.load(f)
      )
    );
  } catch {}
  const draw = ctx => {
    const font = (size, weight = 400) => {
        ctx.font = weight + ' ' + size + 'px ' + FONT;
      },
      text = (s, x, y, color, align = 'left') => {
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(s, x, y);
        ctx.textAlign = 'left';
      };
    const fit = (s, max) => {
      s = String(s);
      if (ctx.measureText(s).width <= max) return s;
      while (s && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
      return s + '…';
    };
    const wrap = (s, max) => {
      const lines = [];
      for (const para of String(s || '').split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/)) {
          const next = line ? line + ' ' + word : word;
          if (ctx.measureText(next).width > max && line) {
            lines.push(line);
            line = word;
          } else line = next;
        }
        lines.push(line);
      }
      return lines;
    };
    const box = (x, y, w, h, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    };
    const label = (s, x, y, align) => {
      font(17, 800);
      text(s.toUpperCase(), x, y, MUTED, align);
    };
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, ctx.canvas.height);
    if (logo) ctx.drawImage(logo, P - 8, 26, (logo.width * 138) / logo.height, 138);
    else {
      font(40, 900);
      text('KULTIVERSO POP', P, 112, INK);
    }
    font(17, 800);
    text('COTIZACIÓN', W - P, 84, MUTED, 'right');
    font(30, 800);
    text(d.folio, W - P, 126, INK, 'right');
    const stripe = ctx.createLinearGradient(0, 0, W, 0);
    stripe.addColorStop(0, '#00D7F1');
    stripe.addColorStop(0.5, YELLOW);
    stripe.addColorStop(1, '#FF158F');
    ctx.fillStyle = stripe;
    ctx.fillRect(0, 190, W, 10);
    let y = 262;
    const cols = [P, P + 340, P + 650];
    label('Cliente', cols[0], y);
    label('Fecha', cols[1], y);
    label('Válida hasta', cols[2], y);
    font(23, 700);
    text(fit(d.client || '—', 300), cols[0], y + 38, INK);
    text(fit(longDate(d.date), 295), cols[1], y + 38, INK);
    text(fit(longDate(t.validUntil), W - P - cols[2]), cols[2], y + 38, INK);
    y += 80;
    ctx.fillStyle = LINE;
    ctx.fillRect(P, y, W - 2 * P, 2);
    y += 40;
    if (photo) {
      const h = 420;
      box(P, y, W - 2 * P, h, 20, SOFT);
      const s = Math.min((W - 2 * P - 40) / photo.width, (h - 40) / photo.height),
        w = photo.width * s,
        ph = photo.height * s;
      ctx.drawImage(photo, (W - w) / 2, y + (h - ph) / 2, w, ph);
      y += h + 48;
    }
    font(44, 800);
    for (const line of wrap(d.name, W - 2 * P)) {
      text(line, P, y + 30, INK);
      y += 54;
    }
    if (d.description) {
      y += 6;
      font(26);
      for (const line of wrap(d.description, W - 2 * P)) {
        text(line, P, y + 24, BODY);
        y += 38;
      }
    }
    y += 32;
    const right = W - P - 20,
      cQty = P + 520,
      cPrice = P + 760;
    box(P, y, W - 2 * P, 56, 12, SOFT);
    ctx.textBaseline = 'middle';
    label('Descripción', P + 20, y + 28);
    label('Cant.', cQty, y + 28, 'right');
    label('Precio unit.' + (d.ivaEnabled ? ' c/IVA' : ''), cPrice, y + 28, 'right');
    label('Total', right, y + 28, 'right');
    y += 56;
    font(25, 700);
    const item = wrap(d.name, cQty - P - 110),
      itemLines = item.length > 2 ? [item[0], fit(item.slice(1).join(' '), cQty - P - 110)] : item;
    itemLines.forEach((line, i) => text(line, P + 20, y + 40 + i * 34, INK));
    font(25);
    text(String(d.quantity), cQty, y + 40, INK, 'right');
    text(clp(d.price), cPrice, y + 40, INK, 'right');
    font(25, 800);
    text(clp(t.total), right, y + 40, INK, 'right');
    y += 46 + itemLines.length * 34;
    ctx.fillStyle = LINE;
    ctx.fillRect(P, y, W - 2 * P, 2);
    y += 24;
    const tx = W - P - 440;
    if (d.ivaEnabled)
      for (const [k, v] of [
        ['Neto', clp(t.net)],
        ['IVA (' + pct(d.ivaRate) + ')', clp(t.iva)]
      ]) {
        font(24);
        text(k, tx + 20, y + 22, MUTED);
        font(24, 700);
        text(v, right, y + 22, INK, 'right');
        y += 46;
      }
    box(tx, y + 6, 440, 78, 16, '#fff8d1');
    font(26, 800);
    text('Total a pagar', tx + 24, y + 45, INK);
    font(36, 900);
    text(clp(t.total), W - P - 24, y + 45, ACCENT, 'right');
    ctx.textBaseline = 'alphabetic';
    y += 130;
    ctx.fillStyle = LINE;
    ctx.fillRect(P, y - 30, W - 2 * P, 2);
    label('Plazo de entrega', P, y);
    font(24);
    let ty = y + 38;
    for (const line of wrap(d.delivery || 'Por confirmar', 300)) {
      text(line, P, ty, BODY);
      ty += 34;
    }
    if (d.terms) {
      label('Condiciones', P + 360, y);
      font(24);
      let cy = y + 38;
      for (const line of wrap(d.terms, W - 2 * P - 360)) {
        text(line, P + 360, cy, BODY);
        cy += 34;
      }
      ty = Math.max(ty, cy);
    }
    y = ty + 40;
    const thanks = 'Colecciona · Disfruta · Vive el Kultiverso';
    font(24, 700);
    const contact = d.contact ? wrap(d.contact, W - 2 * P) : [];
    font(22, 700);
    const inline =
        contact.length === 1 &&
        (font(24, 700), ctx.measureText(contact[0]).width) +
          (font(22, 700), ctx.measureText(thanks).width) +
          40 <=
          W - 2 * P,
      footH = inline || !contact.length ? 120 : 80 + contact.length * 36 + 36;
    ctx.fillStyle = INK;
    ctx.fillRect(0, y, W, footH);
    ctx.textBaseline = 'middle';
    if (inline) {
      font(24, 700);
      text(contact[0], P, y + 60, '#fff');
      font(22, 700);
      text(thanks, W - P, y + 60, YELLOW, 'right');
    } else {
      font(24, 700);
      contact.forEach((line, i) => text(line, P, y + 48 + i * 36, '#fff'));
      font(22, 700);
      text(thanks, P, y + 48 + contact.length * 36 + (contact.length ? 8 : 12), YELLOW);
    }
    ctx.textBaseline = 'alphabetic';
    return y + footH;
  };
  // Lay out once to measure, then draw on a canvas of the exact height.
  const probe = document.createElement('canvas');
  probe.width = W;
  probe.height = 4000;
  const height = draw(probe.getContext('2d'));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(Error('No se pudo generar la imagen'))), 'image/png')
  );
}
// ---------------------------------------------------------------------------
// V1.8: saved quotes, customers and remembered screen.
// ---------------------------------------------------------------------------
const quoteFolioNo = no => 'COT-' + String(no).padStart(4, '0');
const QUOTE_STATUS = { open: 'Enviada', expired: 'Vencida', accepted: 'Aceptada', rejected: 'Rechazada' };
const QUOTE_CHIP = { open: 'c-printing', expired: 'c-late', accepted: 'c-ready', rejected: '' };
async function loadQuotes() {
  const { data, error } = await recentOnly(
    () =>
      supabase
        .from('quotes')
        .select('*')
        .eq('workspace_id', S.workspace.id)
        .order('created_at', { ascending: false }),
    'created_at.gte."' + historyCutoff() + '",status.eq.sent'
  );
  if (error) throw error;
  S.quotes = data || [];
}
async function loadCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('name');
  if (error) throw error;
  S.customers = data || [];
}
const sameName = (a, b) =>
  String(a || '')
    .trim()
    .toLocaleLowerCase('es') ===
  String(b || '')
    .trim()
    .toLocaleLowerCase('es');
// Links a typed client name to a customer, creating it the first time it is used.
// Finds or creates the customer by name; a WhatsApp typed in the form is saved on it.
async function ensureCustomer(name, phone = '') {
  name = String(name || '').trim();
  phone = String(phone || '').trim();
  if (!name || !canEdit()) return null;
  const found = S.customers.find(c => sameName(c.name, name));
  if (found) {
    if (phone && phone !== found.phone) {
      const { error } = await supabase.from('customers').update({ phone }).eq('id', found.id);
      if (!error) found.phone = phone;
    }
    return found.id;
  }
  const { data, error } = await supabase
    .from('customers')
    .insert({ workspace_id: S.workspace.id, name: name.slice(0, 120), ...(phone ? { phone } : {}) })
    .select()
    .single();
  if (error) {
    // Someone else created it at the same time: use theirs.
    await loadCustomers().catch(() => {});
    return S.customers.find(c => sameName(c.name, name))?.id || null;
  }
  S.customers.push(data);
  return data.id;
}
// Choosing a known customer fills their WhatsApp if the field is still empty.
function bindCustomerPhone(nameSel, phoneSel) {
  const name = q(nameSel),
    phone = q(phoneSel);
  if (!name || !phone) return;
  let auto = '';
  const fill = () => {
    const c = S.customers.find(x => sameName(x.name, name.value));
    if (c?.phone && (!phone.value || phone.value === auto)) phone.value = auto = c.phone;
  };
  name.addEventListener('input', fill);
  name.addEventListener('change', fill);
  fill();
}
function customerOptions() {
  return (
    '<datalist id="customerList">' +
    S.customers.map(c => '<option value="' + esc(c.name) + '"></option>').join('') +
    '</datalist>'
  );
}
function quoteState(qt) {
  if (qt.status !== 'sent') return qt.status;
  const until = new Date(qt.created_at).getTime() + n(qt.validity_days) * 864e5;
  return until < Date.now() ? 'expired' : 'open';
}
function quoteSums(qt) {
  const total = Math.round(n(qt.unit_price)) * n(qt.quantity),
    net = qt.iva_enabled ? total / (1 + n(qt.iva_rate)) : total,
    // 5.0: a quick quote saved without cost takes the cost of the product it was linked to later.
    unit = n(qt.unit_cost) || (qt.product_id ? productUnitCost(qt.product_id) : 0),
    cost = unit * n(qt.quantity);
  return { total, net, cost, profit: net - cost, margin: net > 0 && cost > 0 ? (net - cost) / net : null };
}
function quoteChip(qt) {
  const s = quoteState(qt);
  return '<span class="chip ' + QUOTE_CHIP[s] + '"><i></i>' + QUOTE_STATUS[s] + '</span>';
}
// Quote dialog data for a saved quote.
function savedQuoteData(qt) {
  const product = S.products.find(p => p.id === qt.product_id);
  return {
    savedId: qt.id,
    folio: quoteFolioNo(qt.quote_no),
    date: new Date(qt.created_at),
    client: qt.client_name,
    name: qt.title,
    description: qt.description,
    photo: product ? photoSrc(product) : null,
    quantity: qt.quantity,
    price: n(qt.unit_price),
    ivaEnabled: qt.iva_enabled,
    ivaRate: n(qt.iva_rate),
    validityDays: qt.validity_days,
    delivery: qt.delivery,
    terms: qt.terms,
    contact: qt.contact
  };
}
// Saves (or updates) the quote shown in the dialog so it gets a folio and appears in Cotizaciones.
async function saveQuoteRecord(d) {
  if (!canEdit() || d.fromOrder) return false;
  const customer_id = await ensureCustomer(d.client),
    common = {
      customer_id,
      client_name: d.client.slice(0, 120),
      validity_days: d.validityDays,
      delivery: d.delivery.slice(0, 200),
      terms: d.terms.slice(0, 1000),
      contact: d.contact.slice(0, 300)
    };
  if (d.savedId) {
    const { error } = await supabase
      .from('quotes')
      .update({ ...common, updated_at: new Date().toISOString() })
      .eq('id', d.savedId);
    if (error) throw error;
    const row = S.quotes.find(x => x.id === d.savedId);
    if (row) Object.assign(row, common);
    return true;
  }
  const { data, error } = await supabase
    .from('quotes')
    .insert({
      ...common,
      workspace_id: S.workspace.id,
      product_id: d.productId || null,
      title: (d.name || 'Producto').slice(0, 200),
      description: (d.description || '').slice(0, 2000),
      quantity: d.quantity,
      unit_price: Math.round(n(d.price)),
      iva_enabled: !!d.ivaEnabled,
      iva_rate: n(d.ivaRate),
      unit_cost: Math.max(0, n(d.unitCost))
    })
    .select()
    .single();
  if (error) throw error;
  d.savedId = data.id;
  d.folio = quoteFolioNo(data.quote_no);
  d.date = new Date(data.created_at);
  S.quotes = [data, ...(S.quotes || []).filter(x => x.id !== data.id)];
  return true;
}
function quotesView() {
  const term = (S.quoteSearch || '').toLocaleLowerCase('es'),
    filter = S.quoteFilter || 'open',
    matches = (qt, f) => f === 'all' || quoteState(qt) === f,
    count = f => S.quotes.filter(qt => matches(qt, f)).length,
    list = S.quotes
      .filter(qt => matches(qt, filter))
      .filter(qt =>
        (quoteFolioNo(qt.quote_no) + ' ' + qt.client_name + ' ' + qt.title)
          .toLocaleLowerCase('es')
          .includes(term)
      );
  const pills = [
    ['open', 'Abiertas', count('open')],
    ['expired', 'Vencidas', count('expired')],
    ['accepted', 'Aceptadas', count('accepted')],
    ['rejected', 'Rechazadas', count('rejected')],
    ['all', 'Todas', S.quotes.length]
  ].filter(([k, , c]) => c > 0 || ['open', 'all', filter].includes(k));
  const open = S.quotes.filter(qt => quoteState(qt) === 'open'),
    accepted = S.quotes.filter(qt => qt.status === 'accepted'),
    decided = S.quotes.filter(qt => ['accepted', 'rejected'].includes(qt.status)).length;
  root.innerHTML =
    header(
      'Cotizaciones',
      '<button class="btn icon-btn" id="reloadQuotes" type="button" aria-label="Actualizar" title="Actualizar">' +
        icon('refresh-cw') +
        '</button>' +
        (canEdit()
          ? '<button class="btn btn-primary" id="newJobQuote" type="button">' +
            icon('plus') +
            '<span>Nueva cotización</span></button>'
          : '')
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="summary-strip three"><div><span>Abiertas</span><b>' +
    open.length +
    '</b><small>' +
    clp(open.reduce((s, qt) => s + quoteSums(qt).total, 0)) +
    ' por cerrar</small></div><div><span>Aceptadas</span><b>' +
    accepted.length +
    '</b><small>' +
    clp(accepted.reduce((s, qt) => s + quoteSums(qt).total, 0)) +
    '</small></div><div><span>Tasa de cierre</span><b>' +
    (decided ? pct(accepted.length / decided) : '—') +
    '</b><small>de las respondidas</small></div></div><div class="toolbar">' +
    searchBox('quoteSearch', 'Buscar folio, cliente o producto', S.quoteSearch) +
    '</div>' +
    filterPills(pills, filter, 'data-quote-filter') +
    '<section class="panel">' +
    (list.length
      ? '<table class="data-table"><thead><tr><th>Cotización</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th class="r">Total</th></tr></thead><tbody>' +
        list
          .map(
            qt =>
              '<tr data-quote="' +
              qt.id +
              '"><td><b>' +
              esc(qt.title) +
              '</b><div class="sub">' +
              quoteFolioNo(qt.quote_no) +
              ' · ' +
              qt.quantity +
              ' un.</div></td><td>' +
              esc(qt.client_name || '—') +
              '</td><td class="sub">' +
              relativeDate(qt.created_at) +
              '</td><td>' +
              quoteChip(qt) +
              '</td><td class="r num"><b>' +
              clp(quoteSums(qt).total) +
              '</b></td></tr>'
          )
          .join('') +
        '</tbody></table><div class="list-rows">' +
        list
          .map(
            qt =>
              '<button type="button" class="list-row" data-quote="' +
              qt.id +
              '"><span class="lr-main"><b>' +
              esc(qt.title) +
              '</b><span>' +
              quoteFolioNo(qt.quote_no) +
              ' · ' +
              esc(qt.client_name || 'Sin cliente') +
              '</span></span><span class="lr-end"><b class="num">' +
              clp(quoteSums(qt).total) +
              '</b>' +
              quoteChip(qt) +
              '</span></button>'
          )
          .join('') +
        '</div>'
      : '<div class="panel-empty">' +
        icon(term ? 'search' : 'file-text') +
        '<b>' +
        (term
          ? 'Sin resultados'
          : S.quotes.length
            ? 'No hay cotizaciones en esta vista'
            : 'Aún no hay cotizaciones') +
        '</b><span>' +
        (S.quotes.length
          ? ''
          : 'Desde un producto, en Resumen → «Compartir cotización». Se guardan al compartir o imprimir.') +
        '</span></div>') +
    '</section></main>';
  common();
  bindSearch('quoteSearch', v => (S.quoteSearch = v), quotesView);
  qa('[data-quote-filter]').forEach(
    b =>
      (b.onclick = () => {
        S.quoteFilter = b.dataset.quoteFilter;
        quotesView();
      })
  );
  qa('[data-quote]').forEach(
    b => (b.onclick = () => showSavedQuote(S.quotes.find(x => x.id === b.dataset.quote)))
  );
  q('#reloadQuotes').onclick = () => goMode('quotes');
  q('#newJobQuote')?.addEventListener('click', () => showQuickJob('quote'));
}
function showSavedQuote(qt) {
  if (!qt) return;
  const s = quoteSums(qt),
    state = quoteState(qt),
    order = qt.order_id && S.orders.find(o => o.id === qt.order_id),
    until = new Date(new Date(qt.created_at).getTime() + n(qt.validity_days) * 864e5);
  const dialog = showDialog(
    'savedQuoteDialog',
    '<div class="section-title"><h2>Cotización ' +
      quoteFolioNo(qt.quote_no) +
      '</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><div class="order-head"><div><b>' +
      esc(qt.title) +
      '</b>' +
      quoteChip(qt) +
      '</div><button class="btn btn-secondary btn-sm" id="reopenQuote" type="button">' +
      icon('share-2') +
      'Ver y compartir</button></div><dl class="facts"><div><dt>Cliente</dt><dd>' +
      esc(qt.client_name || '—') +
      '</dd></div><div><dt>Cantidad</dt><dd>' +
      qt.quantity +
      ' un.</dd></div><div><dt>Total</dt><dd>' +
      clp(s.total) +
      '</dd></div><div><dt>Fecha</dt><dd>' +
      new Date(qt.created_at).toLocaleDateString('es-CL') +
      '</dd></div><div><dt>Válida hasta</dt><dd class="' +
      (state === 'expired' ? 'down' : '') +
      '">' +
      until.toLocaleDateString('es-CL') +
      '</dd></div><div><dt>Utilidad estimada</dt><dd class="' +
      (s.profit < 0 ? 'down' : 'up') +
      '">' +
      (s.cost > 0 ? clp(s.profit) + (s.margin == null ? '' : ' · ' + pct(s.margin)) : '—') +
      '</dd></div></dl>' +
      (order
        ? '<p class="notice small">Convertida en el pedido <b>PED-' +
          order.order_no +
          '</b>. <button type="button" class="btn btn-ghost btn-sm" id="quoteOrder">Ver pedido</button></p>'
        : '') +
      (canEdit()
        ? '<div class="dialog-actions">' +
          (qt.status === 'sent'
            ? '<button type="button" class="btn btn-ghost" id="rejectQuote">Marcar rechazada</button><button type="button" class="btn btn-primary" id="acceptQuote">' +
              icon('clipboard-list') +
              'Aceptada: crear pedido</button>'
            : '<button type="button" class="btn btn-ghost" id="reopenStatus">Volver a «Enviada»</button>') +
          '<button type="button" class="btn btn-ghost danger-text" id="deleteQuote">' +
          icon('trash-2') +
          'Eliminar</button></div>'
        : '')
  );
  const setStatus = async status => {
    const { error } = await supabase
      .from('quotes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', qt.id);
    if (error) return toast(error.message, 'error');
    qt.status = status;
    dialog.close();
    render();
  };
  q('#reopenQuote').onclick = () => {
    dialog.close();
    showQuote(savedQuoteData(qt));
  };
  q('#quoteOrder')?.addEventListener('click', () => {
    dialog.close();
    showOrder(order);
  });
  q('#rejectQuote')?.addEventListener('click', () => setStatus('rejected'));
  q('#reopenStatus')?.addEventListener('click', () => {
    if (qt.order_id)
      return toast('Ya tiene un pedido. Cancélalo en Pedidos si el cliente se arrepintió.', 'error');
    setStatus('sent');
  });
  q('#acceptQuote')?.addEventListener('click', () => {
    dialog.close();
    showQuoteToOrder(qt);
  });
  q('#deleteQuote')?.addEventListener('click', async () => {
    dialog.close();
    const ok = await confirmDialog({
      title: 'Eliminar cotización',
      body:
        quoteFolioNo(qt.quote_no) +
        ' se eliminará del historial. Los pedidos creados desde ella se conservan.',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (!ok) return;
    const { error } = await supabase.from('quotes').delete().eq('id', qt.id);
    if (error) return toast(error.message, 'error');
    S.quotes = S.quotes.filter(x => x.id !== qt.id);
    S.msg = 'Cotización eliminada.';
    render();
  });
  return dialog;
}
// Accepting a quote creates a customer order with the quoted price and quantity.
function showQuoteToOrder(qt) {
  if (!canEdit()) return;
  const product = S.products.find(p => p.id === qt.product_id),
    stock = productStock(product);
  const dialog = showDialog(
    'quoteOrderDialog',
    '<div class="section-title"><h2>Crear pedido</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="quoteOrderForm" class="grid"><p class="small muted">' +
      quoteFolioNo(qt.quote_no) +
      ' · ' +
      esc(qt.client_name || 'Sin cliente') +
      ' · ' +
      qt.quantity +
      ' × ' +
      esc(qt.title) +
      ' a ' +
      clp(qt.unit_price) +
      '</p>' +
      fieldHtml('Fecha de entrega', 'qoDue', '', 'date') +
      depositField(quoteSums(qt).total) +
      (product && stock.available >= qt.quantity
        ? '<label class="check-row"><input type="checkbox" id="qoFromStock"> <span><b>Entregar desde stock</b><span class="small muted">' +
          stock.available +
          ' unidades disponibles. No reserva materiales.</span></span></label>'
        : product
          ? ''
          : '<p class="notice small">' +
            (qt.product_id
              ? 'El producto ya no existe: el pedido se crea sin reservar materiales.'
              : 'Trabajo a medida: no reserva materiales. Registra sus costos reales en el pedido.') +
            '</p>') +
      '<div class="field"><label for="qoNotes">Notas de producción</label><textarea id="qoNotes"></textarea></div><div id="qoFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Confirmar pedido</button></form>'
  );
  q('#quoteOrderForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const customer_id = qt.customer_id || (await ensureCustomer(qt.client_name));
      const { data: order, error } = await supabase
        .from('production_orders')
        .insert({
          workspace_id: S.workspace.id,
          product_id: product ? product.id : null,
          customer_id,
          title: qt.title,
          kind: 'customer',
          from_stock: !!q('#qoFromStock')?.checked,
          customer_name: qt.client_name,
          quantity: qt.quantity,
          unit_price: n(qt.unit_price),
          iva_enabled: qt.iva_enabled,
          iva_rate: n(qt.iva_rate),
          estimated_cost: Math.round(n(qt.unit_cost) * qt.quantity),
          due_date: q('#qoDue').value || null,
          notes: (quoteFolioNo(qt.quote_no) + '. ' + q('#qoNotes').value.trim()).trim()
        })
        .select()
        .single();
      if (error) throw error;
      const { error: qe } = await supabase
        .from('quotes')
        .update({ status: 'accepted', order_id: order.id, customer_id, updated_at: new Date().toISOString() })
        .eq('id', qt.id);
      if (qe) throw qe;
      await saveDeposit(order);
      Object.assign(qt, { status: 'accepted', order_id: order.id, customer_id });
      dialog.close();
      S.orderFilter = 'open';
      await goMode('production');
      S.msg = 'Pedido PED-' + order.order_no + ' creado desde ' + quoteFolioNo(qt.quote_no) + '.';
      render();
    } catch (error) {
      q('#qoFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  return dialog;
}
function customerHistory(c) {
  const quotes = S.quotes.filter(
      qt => qt.customer_id === c.id || (!qt.customer_id && sameName(qt.client_name, c.name))
    ),
    orders = S.orders.filter(
      o =>
        o.kind !== 'stock' &&
        (o.customer_id === c.id || (!o.customer_id && sameName(o.customer_name, c.name)))
    ),
    sold = orders.filter(o => o.status !== 'canceled').reduce((s, o) => s + orderNumbers(o).sales, 0),
    last = [...quotes.map(x => x.created_at), ...orders.map(x => x.created_at)].sort().pop(),
    due = orders.reduce((s, o) => s + orderBalance(o).due, 0);
  return { quotes, orders, sold, last, due };
}
function customerContact(c) {
  return [c.phone, c.instagram, c.email].filter(Boolean).join(' · ');
}
function whatsappLink(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('9')) digits = '56' + digits;
  return digits.length >= 8 ? 'https://wa.me/' + digits : '';
}
function customersView() {
  const term = (S.customerSearch || '').toLocaleLowerCase('es'),
    rows = S.customers
      .map(c => ({ c, h: customerHistory(c) }))
      .filter(({ c }) => (c.name + ' ' + customerContact(c)).toLocaleLowerCase('es').includes(term))
      .sort((a, b) => b.h.sold - a.h.sold || a.c.name.localeCompare(b.c.name, 'es'));
  root.innerHTML =
    header(
      'Clientes',
      canEdit()
        ? '<button class="btn btn-primary" id="newCustomer" type="button">' +
            icon('plus') +
            '<span>Nuevo cliente</span></button>'
        : ''
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="toolbar">' +
    searchBox('customerSearch', 'Buscar cliente, teléfono o Instagram', S.customerSearch) +
    '</div><section class="panel">' +
    (rows.length
      ? '<table class="data-table"><thead><tr><th>Cliente</th><th>Contacto</th><th class="r">Cotizaciones</th><th class="r">Pedidos</th><th class="r">Vendido</th></tr></thead><tbody>' +
        rows
          .map(
            ({ c, h }) =>
              '<tr data-customer="' +
              c.id +
              '"><td><b>' +
              esc(c.name) +
              '</b><div class="sub">' +
              (h.last ? 'Último movimiento ' + relativeDate(h.last) : 'Sin movimientos') +
              '</div></td><td class="sub">' +
              esc(customerContact(c) || '—') +
              '</td><td class="r num">' +
              h.quotes.length +
              '</td><td class="r num">' +
              h.orders.length +
              '</td><td class="r num"><b>' +
              clp(h.sold) +
              '</b></td></tr>'
          )
          .join('') +
        '</tbody></table><div class="list-rows">' +
        rows
          .map(
            ({ c, h }) =>
              '<button type="button" class="list-row" data-customer="' +
              c.id +
              '"><span class="avatar">' +
              esc((c.name.trim()[0] || '?').toUpperCase()) +
              '</span><span class="lr-main"><b>' +
              esc(c.name) +
              '</b><span>' +
              h.quotes.length +
              ' cot. · ' +
              h.orders.length +
              (h.orders.length === 1 ? ' pedido' : ' pedidos') +
              (customerContact(c) ? ' · ' + esc(customerContact(c)) : '') +
              '</span></span><span class="lr-end"><b class="num">' +
              clp(h.sold) +
              '</b></span></button>'
          )
          .join('') +
        '</div>'
      : '<div class="panel-empty">' +
        icon(term ? 'search' : 'users') +
        '<b>' +
        (term ? 'Sin resultados' : 'Aún no hay clientes') +
        '</b><span>' +
        (term ? '' : 'Se crean solos al guardar una cotización o un pedido con nombre de cliente.') +
        '</span></div>') +
    '</section></main>';
  common();
  bindSearch('customerSearch', v => (S.customerSearch = v), customersView);
  q('#newCustomer')?.addEventListener('click', () => showCustomer({}));
  qa('[data-customer]').forEach(
    b => (b.onclick = () => showCustomer(S.customers.find(c => c.id === b.dataset.customer)))
  );
}
// 5.0: a saved customer opens as a page (#cliente/<id>); a new one is still a quick dialog.
function showCustomer(c) {
  if (!c) return;
  if (!c.id) return customerSheet(c);
  if (S.mode === 'product') persistDraft();
  S.customerId = c.id;
  S.mode = 'customer';
  render();
  scrollTo(0, 0);
}
function customerView() {
  const c = S.customers.find(x => x.id === S.customerId);
  if (!c) {
    S.mode = 'customers';
    return render();
  }
  root.innerHTML = header(c.name, '', { back: true }) + '<main class="shell narrow customer-page"></main>';
  common();
  q('#back').onclick = () => (history.length > 1 && location.hash ? history.back() : goMode('customers'));
  customerSheet(c);
}
function customerSheet(c) {
  const h = c.id ? customerHistory(c) : { quotes: [], orders: [], sold: 0 },
    edit = canEdit(),
    wa = whatsappLink(c.phone);
  const body =
    (c.id
      ? '<dl class="facts"><div><dt>Cotizaciones</dt><dd>' +
        h.quotes.length +
        '</dd></div><div><dt>Pedidos</dt><dd>' +
        h.orders.length +
        '</dd></div><div><dt>Vendido</dt><dd>' +
        clp(h.sold) +
        '</dd></div><div><dt>Por cobrar</dt><dd class="' +
        (h.due > 0 ? 'warn' : '') +
        '">' +
        clp(h.due) +
        '</dd></div></dl>'
      : '') +
    (wa
      ? '<a class="btn btn-secondary" href="' +
        esc(wa) +
        '" target="_blank" rel="noopener">' +
        icon('share-2') +
        'Escribir por WhatsApp</a>'
      : '') +
    (edit && c.id
      ? '<div class="customer-quick"><button type="button" class="btn btn-secondary btn-sm" data-customer-new="quote">' +
        icon('file-text') +
        'Cotizar</button><button type="button" class="btn btn-secondary btn-sm" data-customer-new="order">' +
        icon('clipboard-list') +
        'Nuevo pedido</button></div>'
      : '') +
    '<form id="customerForm" class="grid">' +
    fieldHtml(
      'Nombre o empresa',
      'cuName',
      c.name || '',
      'text',
      'required maxlength="120"' + (edit ? '' : ' readonly')
    ) +
    '<div class="grid grid-2">' +
    fieldHtml(
      'Teléfono / WhatsApp',
      'cuPhone',
      c.phone || '',
      'tel',
      'maxlength="40" placeholder="+56 9 …"' + (edit ? '' : ' readonly')
    ) +
    fieldHtml(
      'Instagram',
      'cuInstagram',
      c.instagram || '',
      'text',
      'maxlength="80" placeholder="@usuario"' + (edit ? '' : ' readonly')
    ) +
    '</div>' +
    fieldHtml('Correo', 'cuEmail', c.email || '', 'email', 'maxlength="160"' + (edit ? '' : ' readonly')) +
    '<div class="field"><label for="cuNotes">Notas</label><textarea id="cuNotes" maxlength="1000"' +
    (edit ? '' : ' readonly') +
    '>' +
    esc(c.notes || '') +
    '</textarea></div><div id="cuFeedback" class="small" role="status"></div>' +
    (edit
      ? '<div class="dialog-actions">' +
        (c.id
          ? '<button type="button" class="btn btn-ghost danger-text" id="deleteCustomer">' +
            icon('trash-2') +
            'Eliminar</button>'
          : '') +
        '<button class="btn btn-primary" type="submit">Guardar cliente</button></div>'
      : '') +
    '</form>' +
    (h.quotes.length || h.orders.length
      ? '<h3 class="form-section">Historial</h3><div class="history-list">' +
        [
          ...h.quotes.map(qt => ({
            at: qt.created_at,
            html:
              '<button type="button" class="list-row" data-history-quote="' +
              qt.id +
              '"><span class="lr-main"><b>' +
              quoteFolioNo(qt.quote_no) +
              ' · ' +
              esc(qt.title) +
              '</b><span>' +
              new Date(qt.created_at).toLocaleDateString('es-CL') +
              '</span></span><span class="lr-end"><b class="num">' +
              clp(quoteSums(qt).total) +
              '</b>' +
              quoteChip(qt) +
              '</span></button>'
          })),
          ...h.orders.map(o => ({
            at: o.created_at,
            html:
              '<button type="button" class="list-row" data-history-order="' +
              o.id +
              '"><span class="lr-main"><b>PED-' +
              o.order_no +
              ' · ' +
              esc(o.title) +
              '</b><span>' +
              new Date(o.created_at).toLocaleDateString('es-CL') +
              '</span></span><span class="lr-end"><b class="num">' +
              clp(orderNumbers(o).sales) +
              '</b>' +
              orderChip(o) +
              '</span></button>'
          }))
        ]
          .sort((a, b) => String(b.at).localeCompare(String(a.at)))
          .map(x => x.html)
          .join('') +
        '</div>'
      : '');
  const dialog = c.id
    ? pageSheet('customerDialog', body)
    : showDialog(
        'customerDialog',
        '<div class="section-title"><h2>Nuevo cliente</h2><button class="btn btn-ghost" data-close>Cerrar</button></div>' +
          body
      );
  dialog.querySelectorAll('[data-history-quote]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        showSavedQuote(S.quotes.find(x => x.id === b.dataset.historyQuote));
      })
  );
  dialog.querySelectorAll('[data-history-order]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        showOrder(S.orders.find(x => x.id === b.dataset.historyOrder));
      })
  );
  dialog.querySelectorAll('[data-customer-new]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        showQuickJob(b.dataset.customerNew, { client: c.name });
      })
  );
  q('#customerForm').onsubmit = async e => {
    e.preventDefault();
    if (!edit) return;
    const b = e.submitter || e.target.querySelector('button[type=submit]'),
      v = {
        name: q('#cuName').value.trim(),
        phone: q('#cuPhone').value.trim(),
        instagram: q('#cuInstagram').value.trim(),
        email: q('#cuEmail').value.trim(),
        notes: q('#cuNotes').value.trim()
      };
    if (S.customers.some(x => x.id !== c.id && sameName(x.name, v.name)))
      return (q('#cuFeedback').textContent = 'Ya existe un cliente con ese nombre.');
    b.disabled = true;
    try {
      const { error } = c.id
        ? await supabase
            .from('customers')
            .update({ ...v, updated_at: new Date().toISOString() })
            .eq('id', c.id)
        : await supabase.from('customers').insert({ ...v, workspace_id: S.workspace.id });
      if (error) throw error;
      await loadCustomers();
      dialog.close();
      S.msg = 'Cliente guardado.';
      render();
    } catch (error) {
      q('#cuFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  q('#deleteCustomer')?.addEventListener('click', async () => {
    dialog.close();
    const ok = await confirmDialog({
      title: 'Eliminar cliente',
      body: '«' + c.name + '» se eliminará. Sus cotizaciones y pedidos se conservan con el nombre escrito.',
      confirmLabel: 'Eliminar',
      danger: true
    });
    if (!ok) return;
    const { error } = await supabase.from('customers').delete().eq('id', c.id);
    if (error) return toast(error.message, 'error');
    S.customers = S.customers.filter(x => x.id !== c.id);
    S.msg = 'Cliente eliminado.';
    render();
  });
  return dialog;
}
// Customer's phone for an order or quote: linked customer first, then by name.
function customerFor(id, name) {
  return S.customers.find(c => c.id === id) || S.customers.find(c => sameName(c.name, name)) || null;
}
const firstName = name =>
  String(name || '')
    .trim()
    .split(/\s+/)[0] || '';
// win: a tab opened beforehand during the click, so Safari doesn't block it after an await.
function openWhatsApp(phone, text, win = null) {
  const link = whatsappLink(phone),
    url = (link || 'https://wa.me/') + '?text=' + encodeURIComponent(text);
  if (win) win.location.href = url;
  else window.open(url, '_blank', 'noopener');
}
function quoteMessage(d) {
  const t = quoteTotals(d),
    hi = firstName(d.client);
  return (
    'Hola' +
    (hi ? ' ' + hi : '') +
    ', te envío la cotización ' +
    d.folio +
    ' de Kultiverso Pop:\n' +
    '• ' +
    d.name +
    ' × ' +
    d.quantity +
    '\nTotal: ' +
    clp(t.total) +
    (d.ivaEnabled ? ' (IVA incluido)' : '') +
    '\nVálida hasta el ' +
    t.validUntil.toLocaleDateString('es-CL') +
    '.' +
    (d.delivery ? '\n' + d.delivery + '.' : '') +
    '\n¿Te la confirmo?'
  ).replace(/\.\./g, '.');
}
// V2.3: customer uploads keep the original private file, separate from catalogue photos.
async function loadCustomerFileRequests() {
  const { data, error } = await supabase
    .from('customer_file_requests')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  S.fileRequests = data || [];
}
function fileRequestState(r) {
  if (r.deleting_at) return 'Eliminación pendiente';
  if (r.archived_at) return 'Archivado';
  return r.submitted_at
    ? 'Recibido'
    : r.revoked
      ? 'Desactivado'
      : new Date(r.expires_at) <= new Date()
        ? 'Vencido'
        : 'Esperando fotos';
}
const FILE_STATE = {
  'Esperando fotos': ['waiting', 'c-printing'],
  Recibido: ['received', 'c-ready'],
  Vencido: ['closed', ''],
  Desactivado: ['closed', ''],
  Archivado: ['archived', ''],
  'Eliminación pendiente': ['closed', 'c-late']
};
function customerFileLink(r) {
  return location.origin + '/subir.html#' + r.access_token;
}
function timeLeft(iso) {
  const ms = new Date(iso) - Date.now(),
    h = Math.floor(ms / 36e5);
  if (ms <= 0) return 'vencido';
  return h >= 1 ? 'quedan ' + h + ' h' : 'quedan ' + Math.max(1, Math.round(ms / 6e4)) + ' min';
}
function customerFilesView() {
  const archived = S.fileRequestsTab === 'archived',
    requests = S.fileRequests || [],
    all = requests.filter(r => !!r.archived_at === archived),
    filter = archived ? 'all' : S.fileFilter || 'all',
    group = r => FILE_STATE[fileRequestState(r)][0],
    count = k => all.filter(r => k === 'all' || group(r) === k).length,
    list = all.filter(r => filter === 'all' || group(r) === filter),
    fresh = requests.filter(r => r.submitted_at && !r.reviewed_at && !r.archived_at && !r.deleting_at).length,
    archivedCount = requests.filter(r => r.archived_at).length;
  const pills = [
    ['all', 'Todos', all.length],
    ['waiting', 'Esperando', count('waiting')],
    ['received', 'Recibidos', count('received')],
    ['closed', 'Cerrados', count('closed')]
  ].filter(([k, , c]) => c > 0 || ['all', filter].includes(k));
  const row = r => {
    const state = fileRequestState(r),
      open = state === 'Esperando fotos',
      deleting = !!r.deleting_at,
      isNew = r.submitted_at && !r.reviewed_at && !r.archived_at && !deleting,
      order = r.order_id && S.orders.find(o => o.id === r.order_id);
    return (
      '<div class="list-row file-row' +
      (isNew ? ' is-new' : '') +
      '"><span class="file-ic">' +
      icon(r.submitted_at ? 'image' : open ? 'clock' : 'x') +
      '</span><span class="lr-main"><b>' +
      esc(r.label) +
      '</b><span>' +
      (order ? 'PED-' + order.order_no + ' · ' : '') +
      (deleting
        ? 'El borrado no terminó: reinténtalo'
        : r.submitted_at
          ? 'Recibido ' + relativeDate(r.submitted_at)
          : open
            ? 'Creado ' + relativeDate(r.created_at) + ' · ' + timeLeft(r.expires_at)
            : state + ' · ' + new Date(r.expires_at).toLocaleDateString('es-CL')) +
      '</span></span><span class="chip ' +
      FILE_STATE[state][1] +
      '"><i></i>' +
      (isNew ? 'Nuevo' : state) +
      '</span><span class="row-actions">' +
      (r.submitted_at && !deleting
        ? '<button class="btn btn-sm ' +
          (isNew ? 'btn-primary' : 'btn-secondary') +
          '" data-received-files="' +
          r.id +
          '">' +
          icon('download') +
          'Ver archivos</button>'
        : '') +
      (open
        ? '<button class="btn btn-sm btn-secondary" data-copy-files="' +
          r.id +
          '">' +
          icon('share-2') +
          'Enlace</button>'
        : '') +
      (open && canEdit()
        ? '<button class="btn icon-btn" data-revoke-files="' +
          r.id +
          '" aria-label="Desactivar enlace" title="Desactivar enlace">' +
          icon('x') +
          '</button>'
        : '') +
      (canEdit() && deleting
        ? '<button class="btn btn-sm btn-danger" data-manage-files="' +
          r.id +
          '" data-files-action="delete">' +
          icon('refresh-cw') +
          'Reintentar eliminación</button>'
        : '') +
      (canEdit() && !deleting
        ? '<details class="row-menu"><summary class="btn icon-btn" aria-label="Más acciones">' +
          icon('ellipsis-vertical') +
          '</summary><div class="menu-pop"><button type="button" class="btn" data-manage-files="' +
          r.id +
          '" data-files-action="' +
          (r.archived_at ? 'restore' : 'archive') +
          '">' +
          icon(r.archived_at ? 'archive-restore' : 'archive') +
          (r.archived_at ? 'Restaurar' : 'Archivar') +
          '</button><button type="button" class="btn btn-danger" data-manage-files="' +
          r.id +
          '" data-files-action="delete">' +
          icon('trash-2') +
          'Eliminar con sus fotos</button></div></details>'
        : '') +
      '</span></div>'
    );
  };
  root.innerHTML =
    header(
      'Archivos de clientes',
      canEdit()
        ? '<button class="btn btn-primary" id="newFileRequest" type="button">' +
            icon('plus') +
            '<span>Pedir fotos</span></button>'
        : ''
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<p class="page-lead muted">Pide a tus clientes las fotos originales con un enlace seguro: sin cuenta, válido 48 horas y de un solo envío. Solo tu equipo puede verlas.' +
    (fresh
      ? ' <b class="warn">' + fresh + (fresh === 1 ? ' envío nuevo' : ' envíos nuevos') + ' por revisar.</b>'
      : '') +
    '</p><div class="toolbar"><div class="view-tabs" role="group" aria-label="Estado de solicitudes"><button class="btn ' +
    (!archived ? 'btn-primary' : 'btn-secondary') +
    '" data-files-tab="active" aria-pressed="' +
    !archived +
    '">Activos <span class="seg-count">' +
    (requests.length - archivedCount) +
    '</span></button><button class="btn ' +
    (archived ? 'btn-primary' : 'btn-secondary') +
    '" data-files-tab="archived" aria-pressed="' +
    archived +
    '">Archivados <span class="seg-count">' +
    archivedCount +
    '</span></button></div></div>' +
    (archived ? '' : filterPills(pills, filter, 'data-file-filter')) +
    '<section class="panel">' +
    (list.length
      ? '<div class="file-list">' + list.map(row).join('') + '</div>'
      : '<div class="panel-empty">' +
        icon('image') +
        '<b>' +
        (archived
          ? 'No hay solicitudes archivadas'
          : all.length
            ? 'Nada en esta vista'
            : 'Aún no hay solicitudes activas') +
        '</b><span>' +
        (archived
          ? 'Las archivadas conservan sus fotos y pueden restaurarse.'
          : all.length
            ? ''
            : 'Crea un enlace y compártelo con tu cliente por WhatsApp. También desde un pedido: «Pedir fotos».') +
        '</span></div>') +
    '</section><p class="footnote small muted">Hasta 5 fotos de 50 MB por enlace, sin compresión. Se muestran las últimas 100 solicitudes.</p></main>';
  common();
  q('#newFileRequest')?.addEventListener('click', () => showNewFileRequest());
  qa('[data-files-tab]').forEach(
    b =>
      (b.onclick = () => {
        S.fileRequestsTab = b.dataset.filesTab;
        customerFilesView();
      })
  );
  qa('[data-manage-files]').forEach(
    b =>
      (b.onclick = () =>
        manageCustomerFileRequest(
          requests.find(r => r.id === b.dataset.manageFiles),
          b.dataset.filesAction,
          b
        ))
  );
  qa('[data-file-filter]').forEach(
    b =>
      (b.onclick = () => {
        S.fileFilter = b.dataset.fileFilter;
        customerFilesView();
      })
  );
  qa('[data-received-files]').forEach(
    b =>
      (b.onclick = async () => {
        await showReceivedCustomerFiles(S.fileRequests.find(r => r.id === b.dataset.receivedFiles));
        customerFilesView();
      })
  );
  qa('[data-copy-files]').forEach(
    b => (b.onclick = () => showFileRequestLink(S.fileRequests.find(r => r.id === b.dataset.copyFiles)))
  );
  qa('[data-revoke-files]').forEach(
    b =>
      (b.onclick = async () => {
        if (
          !(await confirmDialog({
            title: '¿Desactivar el enlace?',
            body: 'El cliente ya no podrá cargar nuevas fotos. Los archivos recibidos se conservan.',
            confirmLabel: 'Desactivar'
          }))
        )
          return;
        try {
          const { error } = await supabase
            .from('customer_file_requests')
            .update({ revoked: true })
            .eq('id', b.dataset.revokeFiles)
            .eq('workspace_id', S.workspace.id);
          if (error) throw error;
          await goMode('files');
        } catch (error) {
          toast(error.message, 'error');
        }
      })
  );
}
function showNewFileRequest(order = null) {
  if (!canEdit()) return;
  const dialog = showDialog(
    'newFileRequestDialog',
    '<div class="section-title"><h2>Recibir fotos del cliente</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="fileRequestForm" class="grid">' +
      fieldHtml(
        'Nombre de la solicitud',
        'fileRequestLabel',
        order ? 'Pedido ' + order.order_no + ' · ' + order.title : 'Trabajo personalizado',
        'text',
        'required maxlength="160"'
      ) +
      '<p class="notice small">Válido por 48 horas. Se cierra automáticamente al completar el envío.</p>' +
      '<p class="small muted">El cliente solo verá el formulario de fotos y este nombre. No necesita cuenta ni correo.</p><p id="fileRequestFeedback" role="status" class="small"></p><button type="submit" class="btn btn-primary">Crear enlace</button></form>'
  );
  q('#fileRequestForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button');
    b.disabled = true;
    try {
      const { data, error } = await supabase
        .from('customer_file_requests')
        .insert({
          workspace_id: S.workspace.id,
          order_id: order?.id || null,
          label: q('#fileRequestLabel').value.trim()
        })
        .select()
        .single();
      if (error) throw error;
      dialog.close();
      showFileRequestLink(data);
    } catch (error) {
      q('#fileRequestFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
function fileRequestMessage(r, customer, url) {
  const hi = firstName(customer?.name);
  return (
    'Hola' +
    (hi ? ' ' + hi : '') +
    ', para trabajar tu pedido en Kultiverso Pop sube aquí las fotos originales (desde Fotos o Archivos, sin capturas). El enlace es válido por 48 horas: ' +
    url
  );
}
function showFileRequestLink(r) {
  const order = r.order_id && S.orders.find(o => o.id === r.order_id),
    customer = order ? customerFor(order.customer_id, order.customer_name) : null,
    url = customerFileLink(r),
    dialog = showDialog(
      'fileRequestLinkDialog',
      '<div class="section-title"><h2>Enlace para el cliente</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><p>' +
        esc(r.label) +
        '</p><div class="field"><label for="customerFileLink">Comparte este enlace</label><input id="customerFileLink" readonly value="' +
        esc(url) +
        '"></div><div class="row"><button class="btn btn-primary" id="copyCustomerFileLink">' +
        icon('copy') +
        'Copiar enlace</button><a class="btn btn-secondary" href="' +
        esc(
          (whatsappLink(customer?.phone) || 'https://wa.me/') +
            '?text=' +
            encodeURIComponent(fileRequestMessage(r, customer, url))
        ) +
        '" target="_blank" rel="noopener noreferrer">' +
        icon('message-circle') +
        (customer?.phone ? 'Enviar a ' + esc(firstName(customer.name)) : 'Compartir por WhatsApp') +
        '</a></div><p class="small muted">El enlace vence el ' +
        esc(new Date(r.expires_at).toLocaleDateString('es-CL')) +
        '.</p>'
    );
  q('#copyCustomerFileLink').onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado.');
    } catch {
      q('#customerFileLink').select();
    }
  };
  return dialog;
}
async function showReceivedCustomerFiles(r) {
  const dialog = showDialog(
    'receivedFilesDialog',
    '<div class="section-title"><h2>' +
      esc(r.label) +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><div id="receivedFilesBody" role="status">Cargando archivos…</div>'
  );
  try {
    const { data, error } = await supabase
      .from('customer_files')
      .select('*')
      .eq('workspace_id', S.workspace.id)
      .eq('request_id', r.id)
      .order('created_at');
    if (error) throw error;
    if (!dialog.isConnected) return;
    const files = (data || []).filter(f => f.received_at);
    q('#receivedFilesBody').innerHTML = files.length
      ? files
          .map(
            f =>
              '<article class="customer-file-row"><h3>' +
              esc(f.original_name) +
              '</h3><p class="small muted">' +
              esc(f.customer_name) +
              ' · ' +
              (f.byte_size / 1048576).toFixed(2) +
              ' MB · ' +
              esc(new Date(f.received_at).toLocaleString('es-CL')) +
              '</p>' +
              (f.note ? '<p class="customer-file-note">' + esc(f.note) + '</p>' : '') +
              '<div class="row"><button class="btn btn-primary" data-download-original="' +
              f.id +
              '">Descargar original</button>' +
              (['image/jpeg', 'image/png', 'image/webp'].includes(f.mime_type)
                ? '<button class="btn btn-secondary" data-preview-original="' +
                  f.id +
                  '">Vista previa</button>'
                : '') +
              '</div></article>'
          )
          .join('')
      : 'Todavía no hay fotos recibidas.';
    dialog.querySelectorAll('[data-download-original]').forEach(
      b =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            const f = files.find(x => x.id === b.dataset.downloadOriginal);
            const { data: blob, error } = await supabase.storage
              .from('customer-originals')
              .download(f.object_path);
            if (error) throw error;
            downloadBlob(blob, f.original_name.replace(/[\\/\x00-\x1f]/g, '_'));
          } catch (error) {
            toast(error.message, 'error');
          } finally {
            b.disabled = false;
          }
        })
    );
    dialog.querySelectorAll('[data-preview-original]').forEach(
      b =>
        (b.onclick = async () => {
          try {
            const f = files.find(x => x.id === b.dataset.previewOriginal),
              { data, error } = await supabase.storage
                .from('customer-originals')
                .createSignedUrl(f.object_path, 300);
            if (error) throw error;
            const preview = showDialog(
              'originalPreviewDialog',
              '<div class="section-title"><h2>' +
                esc(f.original_name) +
                '</h2><button class="btn btn-ghost" data-close>Volver</button></div><img class="customer-file-preview" src="' +
                esc(data.signedUrl) +
                '" alt="' +
                esc(f.original_name) +
                '">'
            );
            return preview;
          } catch (error) {
            toast(error.message, 'error');
          }
        })
    );
    if (r.submitted_at && canEdit()) {
      const { error } = await supabase
        .from('customer_file_requests')
        .update({ reviewed_at: new Date().toISOString() })
        .eq('id', r.id)
        .eq('workspace_id', S.workspace.id);
      if (!error) r.reviewed_at = new Date().toISOString();
    }
  } catch (error) {
    if (dialog.isConnected) q('#receivedFilesBody').textContent = error.message;
  }
}
async function manageCustomerFileRequest(r, action, button) {
  if (!canEdit() || !r || !['archive', 'restore', 'delete'].includes(action) || S.fileRequestBusy) return;
  const workspaceId = S.workspace.id;
  if (action !== 'restore') {
    const accepted = await confirmDialog(
      action === 'archive'
        ? {
            title: '¿Archivar la solicitud?',
            body: 'Las fotos se conservan y podrás restaurar la solicitud. El enlace quedará desactivado.',
            confirmLabel: 'Archivar'
          }
        : {
            title: '¿Eliminar la solicitud y sus fotos?',
            body:
              'Se borrarán permanentemente todos los originales de «' +
              r.label +
              '» y su enlace. Esta acción no se puede deshacer.',
            confirmLabel: 'Eliminar definitivamente',
            danger: true
          }
    );
    if (!accepted) return;
  }
  if (S.fileRequestBusy || S.workspace?.id !== workspaceId || !canEdit()) return;
  S.fileRequestBusy = true;
  if (button) button.disabled = true;
  const call = async p_action => {
    const { data, error } = await supabase.rpc('manage_customer_file_request', { p_id: r.id, p_action });
    if (error) throw error;
    return data;
  };
  try {
    if (action === 'delete') {
      const result = await call('delete_start');
      r.deleting_at = r.deleting_at || new Date().toISOString();
      r.revoked = true;
      if (result.paths.length) {
        const { error } = await supabase.storage.from('customer-originals').remove(result.paths);
        if (error) throw error;
      }
      await call('delete_finish');
      S.fileRequests = (S.fileRequests || []).filter(item => item.id !== r.id);
    } else {
      await call(action);
      r.archived_at = action === 'archive' ? new Date().toISOString() : null;
      if (action === 'archive') r.revoked = true;
    }
    toast(
      action === 'delete'
        ? 'Solicitud y originales eliminados.'
        : action === 'archive'
          ? 'Solicitud archivada. Fotos conservadas.'
          : 'Solicitud restaurada. El enlace sigue desactivado.'
    );
  } catch (error) {
    toast(
      (r.deleting_at ? 'No se completó la eliminación. Puedes reintentar. ' : '') + error.message,
      'error'
    );
  } finally {
    S.fileRequestBusy = false;
    if (button) button.disabled = false;
    if (S.mode === 'files' && S.workspace?.id === workspaceId) customerFilesView();
  }
}
