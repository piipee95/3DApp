'use strict';
// ---------------------------------------------------------------------------
// V1.9: global search (Ctrl/⌘ K) and installable app.
// ---------------------------------------------------------------------------
const fold = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es');
// Every word typed must appear somewhere in the item's text.
function searchMatches(text, term) {
  const hay = fold(text);
  return fold(term)
    .split(/\s+/)
    .filter(Boolean)
    .every(w => hay.includes(w));
}
const SEARCH_LIMIT = 5;
function searchResults(term) {
  const groups = [],
    add = (label, items) => items.length && groups.push({ label, items: items.slice(0, SEARCH_LIMIT) });
  if (!term.trim()) {
    add(
      'Ir a',
      NAV_ITEMS.map(item => ({ icon: item.icon, title: item.label, sub: '', go: () => goMode(item.mode) }))
    );
    if (canEdit())
      add('Acciones', [
        { icon: 'plus', title: 'Nuevo producto', sub: '', go: () => newProduct() },
        {
          icon: 'user-plus',
          title: 'Nuevo cliente',
          sub: '',
          go: async () => {
            await goMode('customers');
            showCustomer({});
          }
        }
      ]);
    return groups;
  }
  add(
    'Productos',
    S.products
      .filter(p => searchMatches(p.name + ' ' + (p.description || ''), term))
      .map(p => ({
        icon: 'package',
        title: p.name,
        sub: (p.status === 'archived' ? 'Archivado · ' : '') + clp(productNumbers(p).price),
        go: () => openProduct(p.id)
      }))
  );
  add(
    'Cotizaciones',
    S.quotes
      .filter(qt => searchMatches(quoteFolioNo(qt.quote_no) + ' ' + qt.title + ' ' + qt.client_name, term))
      .map(qt => ({
        icon: 'file-text',
        title: quoteFolioNo(qt.quote_no) + ' · ' + qt.title,
        sub:
          (qt.client_name || 'Sin cliente') +
          ' · ' +
          QUOTE_STATUS[quoteState(qt)] +
          ' · ' +
          clp(quoteSums(qt).total),
        go: async () => {
          await goMode('quotes');
          showSavedQuote(S.quotes.find(x => x.id === qt.id));
        }
      }))
  );
  add(
    'Pedidos',
    S.orders
      .filter(o => searchMatches('PED-' + o.order_no + ' ' + o.title + ' ' + (o.customer_name || ''), term))
      .map(o => ({
        icon: 'clipboard-list',
        title: 'PED-' + o.order_no + ' · ' + o.title,
        sub: orderCustomer(o) + ' · ' + ORDER_STATUSES[o.status],
        go: async () => {
          await goMode('production');
          showOrder(S.orders.find(x => x.id === o.id));
        }
      }))
  );
  add(
    'Clientes',
    S.customers
      .filter(c => searchMatches(c.name + ' ' + customerContact(c), term))
      .map(c => ({
        icon: 'user',
        title: c.name,
        sub: customerContact(c) || 'Sin contacto',
        go: async () => {
          await goMode('customers');
          showCustomer(S.customers.find(x => x.id === c.id));
        }
      }))
  );
  add(
    'Inventario',
    S.resources
      .filter(r => searchMatches(r.name + ' ' + (r.material || ''), term))
      .map(r => ({
        icon: r.kind === 'printer' ? 'printer' : 'boxes',
        title: r.name,
        sub:
          r.kind === 'printer'
            ? 'Impresora · ' + n(r.power_kw) + ' kW'
            : (r.material ? r.material + ' · ' : '') +
              (r.counted ? stockNumber(availableStock(r)) + ' ' + r.unit + ' disponibles' : 'Sin conteo'),
        go: () => {
          if (r.kind !== 'printer') S.inventorySearch = r.name;
          return goMode(r.kind === 'printer' ? 'resources' : 'inventory');
        }
      }))
  );
  return groups;
}
function showSearch() {
  if (!S.workspace || q('#searchDialog')) return;
  const dialog = showDialog(
    'searchDialog',
    '<label class="search-box search-big">' +
      icon('search') +
      '<input id="globalSearchInput" type="search" placeholder="Buscar productos, cotizaciones, pedidos, clientes…" aria-label="Buscar en KultiApp" autocomplete="off"><kbd>Esc</kbd></label><div id="searchResults" class="search-results" role="listbox"></div>'
  );
  dialog.classList.add('search-dialog');
  const input = q('#globalSearchInput');
  let items = [],
    active = 0;
  const draw = () => {
    const groups = searchResults(input.value);
    items = groups.flatMap(g => g.items);
    active = Math.min(active, Math.max(0, items.length - 1));
    let i = 0;
    q('#searchResults').innerHTML = groups.length
      ? groups
          .map(
            g =>
              '<div class="search-group"><span>' +
              g.label +
              '</span>' +
              g.items
                .map(
                  it =>
                    '<button type="button" role="option" class="search-item' +
                    (i === active ? ' on' : '') +
                    '" data-search-index="' +
                    i++ +
                    '">' +
                    icon(it.icon) +
                    '<span class="si-text"><b>' +
                    esc(it.title) +
                    '</b>' +
                    (it.sub ? '<span>' + esc(it.sub) + '</span>' : '') +
                    '</span>' +
                    icon('chevron-right') +
                    '</button>'
                )
                .join('') +
              '</div>'
          )
          .join('')
      : '<div class="panel-empty">' +
        icon('search') +
        '<b>Sin resultados</b><span>Prueba con otra palabra o un folio (COT-…, PED-…).</span></div>';
    qa('[data-search-index]').forEach(b => {
      b.onclick = () => choose(+b.dataset.searchIndex);
      b.onmousemove = () => {
        if (active === +b.dataset.searchIndex) return;
        active = +b.dataset.searchIndex;
        mark();
      };
    });
  };
  const mark = () =>
    qa('[data-search-index]').forEach(b => {
      b.classList.toggle('on', +b.dataset.searchIndex === active);
      if (+b.dataset.searchIndex === active) b.scrollIntoView?.({ block: 'nearest' });
    });
  const choose = index => {
    const it = items[index];
    if (!it) return;
    dialog.close();
    persistDraft();
    it.go();
  };
  input.oninput = () => {
    active = 0;
    draw();
  };
  input.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      mark();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    }
  };
  draw();
  input.focus();
  return dialog;
}
// Ctrl/⌘ K anywhere, or "/" when not typing, opens the search.
document.addEventListener('keydown', e => {
  const typing = e.target.closest?.('input,textarea,select,[contenteditable]');
  if (
    ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') ||
    (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey)
  ) {
    if (!S.session || !S.workspace || S.mode === 'auth') return;
    if (q('dialog[open]') && !q('#searchDialog')) return;
    e.preventDefault();
    showSearch();
  }
});
// Installable app: service worker, install prompt and offline notice.
let installPrompt = null;
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
function canInstall() {
  return !isStandalone() && (!!installPrompt || isIOS());
}
async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice.catch(() => ({}));
    installPrompt = null;
    if (outcome === 'accepted') toast('KultiApp instalada.');
    render();
    return;
  }
  showDialog(
    'installDialog',
    '<div class="section-title"><h2>Instalar KultiApp</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><ol class="install-steps"><li>Abre esta página en <b>Safari</b>.</li><li>Toca <b>Compartir</b> ' +
      icon('share-2') +
      ' en la barra inferior.</li><li>Elige <b>«Agregar a inicio»</b> y confirma.</li></ol><p class="small muted">Se abrirá a pantalla completa como una app, con el ícono de Kultiverso Pop.</p>'
  );
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  if (S.workspace && S.mode !== 'auth') mountShell();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
});
window.addEventListener('offline', () =>
  toast('Sin conexión: los cambios no se guardarán hasta reconectar.', 'error')
);
window.addEventListener('online', () => toast('Conexión recuperada.'));
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/localhost/.test(location.href)) return;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker no registrado', e));
}
