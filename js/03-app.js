'use strict';
// Aplicación: sesión y espacio de trabajo, navegación (barra, «Más», secciones y enlaces), búsqueda, instalación y modo sin conexión.
let workspaceLoad = null;
async function init() {
  registerServiceWorker();
  const inv = new URLSearchParams(location.search).get('invite');
  if (inv) localStorage.setItem('kultiapp_invite', inv);
  const {
    data: { session }
  } = await supabase.auth.getSession();
  S.session = session;
  supabase.auth.onAuthStateChange((_, s) => {
    const previousUser = S.session?.user?.id;
    S.session = s;
    if (!s) {
      S.workspace = null;
      S.product = null;
      S.mode = 'auth';
      render();
      return;
    }
    if (previousUser !== s.user?.id) {
      S.workspace = null;
      S.product = null;
      S.mode = 'auth';
    }
    if (!S.workspace || S.mode === 'auth') setTimeout(() => ensureWorkspace().catch(e => fail(e.message)), 0);
  });
  if (session) await ensureWorkspace();
  else render();
}
function ensureWorkspace() {
  if (!workspaceLoad)
    workspaceLoad = loadWorkspace().finally(() => {
      workspaceLoad = null;
    });
  return workspaceLoad;
}
async function loadWorkspace() {
  S.err = '';
  if (!S.workspace && S.session) skeletonView('home');
  let inviteError = '';
  const inv = localStorage.getItem('kultiapp_invite');
  if (inv) {
    const { error: ie } = await supabase.rpc('accept_workspace_invite', { invite_token: inv });
    localStorage.removeItem('kultiapp_invite');
    history.replaceState({}, '', location.pathname);
    if (ie) inviteError = 'No se pudo aceptar la invitación: ' + ie.message;
  }
  let { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id,role,workspaces(id,name)')
    .order('created_at');
  if (error) return fail(error.message);
  if (!data?.length) {
    let { data: wid, error: e } = await supabase.rpc('bootstrap_workspace', {
      workspace_name: 'Kultiverso Pop'
    });
    if (e) return fail(e.message);
    S.workspace = { id: wid, role: 'owner', name: 'Kultiverso Pop' };
  } else {
    const m = data[data.length - 1];
    S.workspace = { id: m.workspace_id, role: m.role, name: m.workspaces?.name || 'Kultiverso Pop' };
  }
  await loadSettings();
  await loadResources();
  await loadProducts();
  // Orders, quotes and customers feed Inicio and forms; the app still opens if they fail to load.
  await Promise.all(
    [loadOrders, loadQuotes, loadCustomers, loadCustomerFileRequests, loadPriceLists].map(load =>
      load().catch(e => console.warn('No se pudieron cargar los datos', e))
    )
  );
  S.mode = 'home';
  if (!restoreActiveDraft()) await restoreView();
  if (inviteError) S.err = inviteError;
  render();
}
async function loadSettings() {
  let { data, error } = await supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) {
    let { data: d, error: e } = await supabase
      .from('workspace_settings')
      .insert({ workspace_id: S.workspace.id })
      .select()
      .single();
    if (e) return fail(e.message);
    data = d;
  }
  S.settings = { ...S.settings, ...data };
  S.settingsDirty = false;
}
async function saveSettings() {
  const v = {
    workspace_id: S.workspace.id,
    filament_price_per_kg: n(q('#cfgFilament')?.value ?? S.settings.filament_price_per_kg),
    electricity_rate_clp_kwh: n(q('#cfgElec')?.value ?? S.settings.electricity_rate_clp_kwh),
    printer_power_kw: n(q('#cfgPower')?.value ?? S.settings.printer_power_kw),
    updated_at: new Date().toISOString()
  };
  let { error } = await supabase.from('workspace_settings').upsert(v, { onConflict: 'workspace_id' });
  if (error) throw error;
  S.settings = { ...S.settings, ...v };
}
function common() {
  mountShell();
  markViewEnter();
  mountInventoryAlert();
  enhanceFields();
  flashMessages();
  if (S.mode === 'dashboard' || S.mode === 'home') showDraftResume();
  q('#invite')?.addEventListener('click', invite);
  q('#editProfile')?.addEventListener('click', showProfile);
}
function render() {
  if (!S.session || S.mode === 'auth') return authView();
  saveView();
  if (S.mode === 'files') return customerFilesView();
  if (S.mode === 'quotes') return quotesView();
  if (S.mode === 'customers') return customersView();
  if (S.mode === 'reports') return reportsView();
  if (S.mode === 'finance') return financeView();
  if (S.mode === 'inventory') return inventoryView();
  if (S.mode === 'resources') return resourcesView();
  if (S.mode === 'production') return productionView();
  if (S.mode === 'product') return product();
  if (S.mode === 'home') return homeView();
  if (S.mode === 'profile') return profileView();
  if (S.mode === 'material') return materialView();
  if (S.mode === 'order') return orderView();
  if (S.mode === 'customer') return customerView();
  if (S.mode === 'stockcount') return stockCountView();
  dashboard();
}
async function goMode(mode) {
  persistDraft();
  S.msg = '';
  S.err = '';
  S.mode = mode;
  // Show the section's outline right away while its data loads.
  if (S.workspace && mode !== 'product') skeletonView(mode);
  try {
    if (mode === 'files') await loadCustomerFileRequests();
    if (mode === 'production') {
      await loadOrders();
      await loadResources();
    }
    if (['resources', 'inventory', 'product', 'material', 'stockcount'].includes(mode)) await loadResources();
    if (['resources', 'reports', 'finance'].includes(mode)) await loadFailures();
    if (mode === 'dashboard') await loadProducts();
    if (mode === 'quotes') await Promise.all([loadQuotes(), loadCustomers(), loadOrders()]);
    if (mode === 'customers') await Promise.all([loadCustomers(), loadQuotes(), loadOrders()]);
    if (mode === 'reports') await Promise.all([loadQuotes(), loadOrders()]);
    if (mode === 'finance')
      await Promise.all([loadOrders(), loadExpenses(), loadTransfers(), loadResources(), loadProducts()]);
    if (mode === 'home') await Promise.all([loadProducts(), loadOrders(), loadResources(), loadQuotes()]);
    render();
  } catch (e) {
    fail(e.message);
  }
}
// Remembers the open screen so a reload (or reopening the app) returns to it.
const VIEW_MODES = [
  'home',
  'dashboard',
  'quotes',
  'production',
  'customers',
  'reports',
  'finance',
  'inventory',
  'resources',
  'profile',
  'material',
  'stockcount',
  'order',
  'customer',
  'product',
  'files'
];
const viewKey = () => 'kultiapp_view_' + (S.session?.user?.id || '');
// V4.5: each section has its own link (#pedidos, #producto/<id>…), so the back button and
// shared links work. Supabase login links also use the hash: those are left alone.
const VIEW_SLUGS = {
  home: 'inicio',
  dashboard: 'productos',
  quotes: 'cotizaciones',
  production: 'pedidos',
  customers: 'clientes',
  reports: 'reportes',
  finance: 'finanzas',
  inventory: 'inventario',
  resources: 'impresoras',
  profile: 'perfil',
  files: 'archivos',
  product: 'producto',
  material: 'material',
  stockcount: 'conteo',
  order: 'pedido',
  customer: 'cliente'
};
// 5.0: «fichas» with their own page and link: which state field holds the open record.
const ID_PAGES = { material: 'materialId', order: 'orderId', customer: 'customerId' };
const isId = id => /^[0-9a-f-]{36}$/.test(id || '');
function viewHash() {
  const slug = VIEW_SLUGS[S.mode];
  if (!slug) return '';
  if (ID_PAGES[S.mode]) return S[ID_PAGES[S.mode]] ? '#' + slug + '/' + S[ID_PAGES[S.mode]] : '';
  return '#' + slug + (S.mode === 'product' && S.product?.id ? '/' + S.product.id : '');
}
function viewFromHash() {
  const [slug, id] = decodeURIComponent(location.hash.slice(1)).split('/'),
    mode = Object.keys(VIEW_SLUGS).find(k => VIEW_SLUGS[k] === slug);
  if (!mode) return null;
  if (mode === 'product') return isId(id) ? { mode, product: id } : null;
  if (ID_PAGES[mode]) return isId(id) ? { mode, id } : null;
  return { mode };
}
// Opens a «ficha» by id; false when the record is not loaded (deleted or from another team).
function openIdPage(mode, id) {
  if (mode === 'material') {
    if (!S.resources.some(r => r.id === id)) return false;
    openMaterial(id);
  } else if (mode === 'order') {
    const o = S.orders.find(x => x.id === id);
    if (!o) return false;
    showOrder(o);
  } else if (mode === 'customer') {
    const c = S.customers.find(x => x.id === id);
    if (!c) return false;
    showCustomer(c);
  }
  return true;
}
function syncViewUrl() {
  const h = viewHash();
  if (!h || location.hash === h || /access_token|error_description|type=/.test(location.hash)) return;
  // A fresh product (no id yet) or the first screen replaces; moving between sections adds history.
  if (!location.hash || !viewFromHash()) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
}
addEventListener('popstate', () => {
  const v = viewFromHash();
  if (!v || !S.workspace || !S.session) return;
  if (v.mode === 'product') {
    if (S.mode !== 'product' || S.product?.id !== v.product) {
      persistDraft();
      openProduct(v.product);
    }
  } else if (ID_PAGES[v.mode]) {
    if (S.mode !== v.mode || S[ID_PAGES[v.mode]] !== v.id) openIdPage(v.mode, v.id);
  } else if (v.mode !== S.mode) goMode(v.mode);
});
function saveView() {
  if (!S.workspace || !VIEW_MODES.includes(S.mode)) return;
  syncViewUrl();
  try {
    localStorage.setItem(
      viewKey(),
      JSON.stringify({
        mode: S.mode,
        product: S.mode === 'product' ? S.product?.id || null : null,
        id: ID_PAGES[S.mode] ? S[ID_PAGES[S.mode]] || null : null,
        tab: S.editorTab
      })
    );
  } catch {}
}
async function restoreView() {
  let v;
  try {
    v = JSON.parse(localStorage.getItem(viewKey()) || 'null');
  } catch {}
  // A section link (#pedidos…) wins over the last screen used.
  v = viewFromHash() || v;
  // Home-screen shortcuts open a section with ?view=…
  const asked = new URLSearchParams(location.search).get('view');
  if (asked) {
    history.replaceState({}, '', location.pathname);
    if (VIEW_MODES.includes(asked) && asked !== 'product') v = { mode: asked };
  }
  if (!v || !VIEW_MODES.includes(v.mode) || v.mode === 'home') return false;
  try {
    if (v.mode === 'product') {
      if (!v.product || !S.products.some(p => p.id === v.product)) return false;
      await openProduct(v.product, { restore: false });
      if (['details', 'prints', 'costs', 'summary'].includes(v.tab)) S.editorTab = v.tab;
      return true;
    }
    if (ID_PAGES[v.mode]) {
      if (v.mode === 'customer') await loadCustomers();
      const id = v.id || v.material,
        found =
          v.mode === 'material'
            ? S.resources.some(r => r.id === id)
            : v.mode === 'order'
              ? S.orders.some(o => o.id === id)
              : S.customers.some(c => c.id === id);
      if (!found) return false;
      S[ID_PAGES[v.mode]] = id;
    }
    if (v.mode === 'files') await loadCustomerFileRequests();
    if (v.mode === 'quotes' || v.mode === 'customers') await Promise.all([loadQuotes(), loadCustomers()]);
    if (v.mode === 'finance') await Promise.all([loadExpenses(), loadTransfers()]);
    S.mode = v.mode;
    return true;
  } catch (e) {
    console.warn('No se pudo restaurar la vista', e);
    return false;
  }
}
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
// Sections shown in the sidebar; the first four are also the phone tab bar.
const NAV_ITEMS = [
  { mode: 'home', label: 'Inicio', icon: 'house' },
  { mode: 'dashboard', label: 'Productos', icon: 'package' },
  { mode: 'quotes', label: 'Cotizaciones', icon: 'file-text' },
  { mode: 'production', label: 'Pedidos', icon: 'clipboard-list' },
  { mode: 'customers', label: 'Clientes', icon: 'users' },
  { mode: 'files', label: 'Archivos', icon: 'image' },
  { mode: 'reports', label: 'Reportes', icon: 'chart-column' },
  { mode: 'finance', label: 'Finanzas', icon: 'wallet' },
  { mode: 'inventory', label: 'Inventario', icon: 'boxes' },
  { mode: 'resources', label: 'Impresoras', icon: 'printer' }
];
const PAGE_TITLES = {
  home: 'Inicio',
  dashboard: 'Productos',
  quotes: 'Cotizaciones',
  production: 'Pedidos',
  customers: 'Clientes',
  reports: 'Reportes',
  finance: 'Finanzas',
  inventory: 'Inventario',
  files: 'Archivos de clientes',
  resources: 'Impresoras',
  profile: 'Mi perfil',
  material: 'Material',
  order: 'Pedido',
  customer: 'Cliente',
  stockcount: 'Modo conteo'
};
function navActive(mode) {
  return (
    S.mode === mode ||
    (mode === 'dashboard' && S.mode === 'product') ||
    (mode === 'inventory' && ['material', 'stockcount'].includes(S.mode)) ||
    (mode === 'production' && S.mode === 'order') ||
    (mode === 'customers' && S.mode === 'customer')
  );
}
function navCount(mode) {
  if (mode === 'files')
    return (S.fileRequests || []).filter(
      r => r.submitted_at && !r.reviewed_at && !r.archived_at && !r.deleting_at
    ).length;
  if (mode === 'dashboard') return S.products.filter(p => p.status !== 'archived').length;
  if (mode === 'production')
    return S.orders.filter(o => !['delivered', 'canceled'].includes(o.status)).length;
  if (mode === 'quotes') return S.quotes.filter(qt => quoteState(qt) === 'open').length;
  return 0;
}
function header(title = PAGE_TITLES[S.mode] || 'KultiApp', actions = '', { back = false } = {}) {
  return (
    '<header class="page-top">' +
    (back
      ? '<button class="btn icon-btn" id="back" type="button" aria-label="Volver">' +
        icon('arrow-left') +
        '</button>'
      : '<img class="page-mark" src="favicon.svg" alt="">') +
    '<h1 class="page-title">' +
    esc(title) +
    '</h1><span class="app-version" aria-label="Versión de la aplicación">' +
    APP_VERSION +
    '</span><div class="page-actions">' +
    (back
      ? ''
      : '<button class="btn icon-btn header-search" type="button" data-open-search aria-label="Buscar" title="Buscar">' +
        icon('search') +
        '</button>') +
    actions +
    '</div></header>'
  );
}
function accountMenuItems() {
  return (
    (canInstall()
      ? '<button type="button" class="menu-item" id="installApp">' +
        icon('download') +
        'Instalar app</button>'
      : '') +
    (isOwner()
      ? '<button type="button" class="menu-item" id="invite">' + icon('user-plus') + 'Invitar socio</button>'
      : '') +
    '<button type="button" class="menu-item" id="editProfile">' +
    icon('user') +
    'Mi perfil</button>'
  );
}
function mountShell() {
  root.classList.add('has-shell');
  root.classList.toggle('is-detail', S.mode === 'product');
  qa('.sidebar,.tabbar').forEach(el => el.remove());
  const side = document.createElement('aside');
  side.className = 'sidebar';
  side.innerHTML =
    '<img class="side-logo" src="' +
    LOGO_SRC +
    '" alt="Kultiverso Pop">' +
    (canEdit()
      ? '<button type="button" class="btn btn-primary side-new" data-open-create>' +
        icon('plus') +
        'Nuevo</button>'
      : '') +
    '<button type="button" class="side-search" data-open-search>' +
    icon('search') +
    '<span>Buscar</span><kbd>' +
    (/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K') +
    '</kbd></button><nav class="side-nav app-nav" aria-label="Navegación principal">' +
    NAV_ITEMS.map(item => {
      const on = navActive(item.mode),
        count = navCount(item.mode);
      return (
        '<button type="button" class="nav-item' +
        (on ? ' active' : '') +
        '" data-app-mode="' +
        item.mode +
        '"' +
        (on ? ' aria-current="page"' : '') +
        '>' +
        icon(item.icon) +
        '<span>' +
        item.label +
        '</span>' +
        (count ? '<span class="nav-count">' + count + '</span>' : '') +
        '</button>'
      );
    }).join('') +
    '</nav><div class="side-user"><div class="account-menu" id="accountMenu" hidden>' +
    accountMenuItems() +
    '</div><button type="button" class="user-chip" id="accountButton" aria-haspopup="menu" aria-expanded="false">' +
    userAvatar() +
    '<span class="user-text"><b>' +
    esc(displayName() || S.session?.user?.email || '') +
    '</b><span>' +
    roleName() +
    '</span></span>' +
    icon('ellipsis-vertical') +
    '</button><p class="powered">Powered by <b>ELARA</b></p></div>';
  root.prepend(side);
  loadAvatarUrl();
  const tabs = document.createElement('nav');
  tabs.className = 'tabbar';
  tabs.setAttribute('aria-label', 'Navegación');
  tabs.innerHTML =
    NAV_ITEMS.filter(
      item => !['resources', 'quotes', 'customers', 'reports', 'files', 'finance'].includes(item.mode)
    )
      .map(
        item =>
          '<button type="button" class="tab-item' +
          (navActive(item.mode) ? ' active' : '') +
          '" data-tab-mode="' +
          item.mode +
          '">' +
          icon(item.icon) +
          '<span>' +
          item.label +
          '</span></button>'
      )
      .join('') +
    '<button type="button" class="tab-item" id="moreTab">' +
    icon('menu') +
    '<span>Más</span></button>';
  root.append(tabs);
  qa('[data-app-mode],[data-tab-mode]').forEach(
    b => (b.onclick = () => goMode(b.dataset.appMode || b.dataset.tabMode))
  );
  const menu = q('#accountMenu'),
    button = q('#accountButton');
  button.onclick = e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
  };
  q('#moreTab').onclick = showMoreSheet;
  qa('[data-open-search]').forEach(b => (b.onclick = showSearch));
  qa('[data-open-create]').forEach(b => (b.onclick = showCreateMenu));
  q('#installApp')?.addEventListener('click', installApp);
}
// Close the account menu and any open ⋯ menu when clicking anywhere else.
document.addEventListener('click', e => {
  qa('details.row-menu[open],details.editor-more[open]').forEach(d => {
    if (!d.contains(e.target)) d.open = false;
  });
  const menu = q('#accountMenu');
  if (menu && !menu.hidden && !e.target.closest('.side-user')) {
    menu.hidden = true;
    q('#accountButton')?.setAttribute('aria-expanded', 'false');
  }
});
function showMoreSheet() {
  const dialog = showDialog(
    'moreSheet',
    '<div class="section-title"><h2>Más</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><button type="button" class="sheet-user" data-more="profile">' +
      userAvatar() +
      '<div><b>' +
      esc(displayName() || S.session?.user?.email || '') +
      '</b><span>' +
      (userName() ? '@' + esc(userName()) + ' · ' : '') +
      roleName() +
      ' · ' +
      esc(S.workspace?.name || 'Kultiverso Pop') +
      '</span></div>' +
      icon('chevron-right') +
      '</button><div class="menu-list"><button type="button" class="menu-item" data-more="quotes">' +
      icon('file-text') +
      'Cotizaciones</button><button type="button" class="menu-item" data-more="customers">' +
      icon('users') +
      'Clientes</button><button type="button" class="menu-item" data-more="files">' +
      icon('image') +
      'Archivos de clientes</button><button type="button" class="menu-item" data-more="reports">' +
      icon('chart-column') +
      'Reportes</button><button type="button" class="menu-item" data-more="finance">' +
      icon('wallet') +
      'Finanzas</button><button type="button" class="menu-item" data-more="resources">' +
      icon('printer') +
      'Impresoras</button>' +
      (isOwner()
        ? '<button type="button" class="menu-item" data-more="invite">' +
          icon('user-plus') +
          'Invitar socio</button>'
        : '') +
      (canInstall()
        ? '<button type="button" class="menu-item" data-more="install">' +
          icon('download') +
          'Instalar app</button>'
        : '') +
      '</div>' +
      '<p class="powered">Kultiverso Pop · Powered by <b>ELARA</b> · ' +
      APP_VERSION +
      '</p>'
  );
  dialog.classList.add('sheet');
  const actions = {
    invite: () => invite(),
    profile: () => showProfile(),
    resources: () => goMode('resources'),
    quotes: () => goMode('quotes'),
    install: () => installApp(),
    reports: () => goMode('reports'),
    finance: () => goMode('finance'),
    files: () => goMode('files'),
    customers: () => goMode('customers')
  };
  dialog.querySelectorAll('[data-more]').forEach(
    b =>
      (b.onclick = () => {
        dialog.close();
        actions[b.dataset.more]();
      })
  );
}
