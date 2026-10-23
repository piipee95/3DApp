'use strict';
// ---------------------------------------------------------------------------
// V2.2: loading skeletons, view transitions and a clearer product editor.
// ---------------------------------------------------------------------------
// Placeholder screen shown while a section loads its data.
function skeletonView(mode) {
  const line = (w, h = 12) => '<i class="sk" style="width:' + w + ';height:' + h + 'px"></i>',
    rows = k =>
      Array.from(
        { length: k },
        () =>
          '<div class="sk-row">' +
          line('38px', 38) +
          '<div>' +
          line('45%', 13) +
          line('28%', 10) +
          '</div>' +
          line('70px', 14) +
          '</div>'
      ).join('');
  root.innerHTML =
    header(PAGE_TITLES[mode] || 'KultiApp') +
    '<main class="shell skeleton" aria-busy="true" aria-label="Cargando">' +
    (['home', 'reports', 'quotes', 'inventory'].includes(mode)
      ? '<div class="kpis">' +
        Array.from(
          { length: 4 },
          () => '<div class="kpi">' + line('50%', 11) + line('70%', 24) + line('40%', 10) + '</div>'
        ).join('') +
        '</div>'
      : '<div class="sk-toolbar">' + line('100%', 40) + '</div>') +
    '<section class="panel">' +
    rows(mode === 'home' ? 4 : 6) +
    '</section></main>';
  mountShell();
}
// Animate the content only when the section changes, not on every re-render.
let lastView = '';
function markViewEnter() {
  const key = S.mode + (S.mode === 'product' ? ':' + (S.product?.id || 'new') : '');
  if (key !== lastView) q('main.shell')?.classList.add('view-enter');
  lastView = key;
}
// Product editor: clearer order on the first tab and a price hero on the summary.
function setupV22() {
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
    label.classList.add('label-switch');
    label.textContent = 'IVA %';
    const sw = document.createElement('span');
    sw.className = 'switch';
    sw.append(iva);
    sw.insertAdjacentHTML('beforeend', '<i></i><span>Aplicar</span>');
    label.append(sw);
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
