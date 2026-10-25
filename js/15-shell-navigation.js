'use strict';
// ---------------------------------------------------------------------------
// App shell: icons, navigation (sidebar on desktop, tab bar + "Más" sheet on
// phones), page header, toasts and in-app dialogs instead of alert/confirm.
// ---------------------------------------------------------------------------
function icon(name, cls = '') {
  return (
    '<svg class="i' +
    (cls ? ' ' + cls : '') +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || '') +
    '</svg>'
  );
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
  files: 'Archivos del cliente',
  resources: 'Impresoras'
};
function navActive(mode) {
  return S.mode === mode || (mode === 'dashboard' && S.mode === 'product');
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
function userInitials() {
  const email = S.session?.user?.email || '';
  const name = email
    .split('@')[0]
    .replace(/[^a-zA-ZÀ-ÿ]+/g, ' ')
    .trim();
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] || 'K') + (parts[1]?.[0] || '')).toUpperCase();
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
    '<button type="button" class="menu-item" id="backupData">' +
    icon('database') +
    'Respaldo de datos</button><button type="button" class="menu-item" id="changePassword">' +
    icon('key-round') +
    'Cambiar contraseña</button><button type="button" class="menu-item danger" id="logout">' +
    icon('log-out') +
    'Cerrar sesión</button>'
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
    themeSwitch() +
    '</div><button type="button" class="user-chip" id="accountButton" aria-haspopup="menu" aria-expanded="false"><span class="avatar">' +
    esc(userInitials()) +
    '</span><span class="user-text"><b>' +
    esc(S.session?.user?.email || '') +
    '</b><span>' +
    roleName() +
    '</span></span>' +
    icon('ellipsis-vertical') +
    '</button><p class="powered">Powered by <b>ELARA</b></p></div>';
  root.prepend(side);
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
  q('#backupData')?.addEventListener('click', showBackup);
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
// ⋯ menus float above lists and cards (which clip overflow): placed on screen next to their
// button, opening upwards when there is no room below. Scrolling closes them.
function placeMenu(d) {
  const pop = d.querySelector(':scope > .menu-pop');
  if (!pop) return;
  if (!d.open) return pop.classList.remove('floating');
  const r = d.querySelector('summary').getBoundingClientRect();
  pop.classList.add('floating');
  Object.assign(pop.style, { top: '0px', left: '0px', bottom: 'auto', right: 'auto', maxHeight: '' });
  // An animated (transformed) ancestor moves the origin of fixed elements: measure and compensate.
  const origin = pop.getBoundingClientRect(),
    w = pop.offsetWidth,
    below = innerHeight - r.bottom - 12,
    up = pop.offsetHeight > below && r.top > below,
    room = Math.max(160, up ? r.top - 12 : below),
    h = Math.min(pop.offsetHeight, room),
    top = up ? r.top - 6 - h : r.bottom + 6,
    left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
  Object.assign(pop.style, {
    top: top - origin.top + 'px',
    left: left - origin.left + 'px',
    maxHeight: room + 'px'
  });
}
document.addEventListener(
  'toggle',
  e => {
    if (e.target.matches?.('details.row-menu')) placeMenu(e.target);
  },
  true
);
const closeFloatingMenus = e => {
  if (e?.target?.closest?.('.menu-pop')) return;
  qa('details.row-menu[open]').forEach(d => {
    if (d.querySelector('.menu-pop.floating')) d.open = false;
  });
};
addEventListener('scroll', closeFloatingMenus, { passive: true, capture: true });
addEventListener('resize', closeFloatingMenus);
function showMoreSheet() {
  const dialog = showDialog(
    'moreSheet',
    '<div class="section-title"><h2>Más</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><div class="sheet-user"><span class="avatar">' +
      esc(userInitials()) +
      '</span><div><b>' +
      esc(S.session?.user?.email || '') +
      '</b><span>' +
      roleName() +
      ' · ' +
      esc(S.workspace?.name || 'Kultiverso Pop') +
      '</span></div></div><div class="menu-list"><button type="button" class="menu-item" data-more="quotes">' +
      icon('file-text') +
      'Cotizaciones</button><button type="button" class="menu-item" data-more="customers">' +
      icon('users') +
      'Clientes</button><button type="button" class="menu-item" data-more="reports">' +
      icon('chart-column') +
      'Reportes</button><button type="button" class="menu-item" data-more="finance">' +
      icon('wallet') +
      'Finanzas</button><button type="button" class="menu-item" data-more="resources">' +
      icon('printer') +
      'Impresoras</button><button type="button" class="menu-item" data-more="files">' +
      icon('image') +
      'Archivos de clientes</button>' +
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
      '<button type="button" class="menu-item" data-more="backup">' +
      icon('database') +
      'Respaldo de datos</button><button type="button" class="menu-item" data-more="password">' +
      icon('key-round') +
      'Cambiar contraseña</button><button type="button" class="menu-item danger" data-more="logout">' +
      icon('log-out') +
      'Cerrar sesión</button></div>' +
      themeSwitch() +
      '<p class="powered">Kultiverso Pop · Powered by <b>ELARA</b> · ' +
      APP_VERSION +
      '</p>'
  );
  dialog.classList.add('sheet');
  const actions = {
    invite: () => invite(),
    password: () => showPasswordDialog(),
    logout: () => supabase.auth.signOut(),
    resources: () => goMode('resources'),
    quotes: () => goMode('quotes'),
    install: () => installApp(),
    reports: () => goMode('reports'),
    finance: () => goMode('finance'),
    backup: () => showBackup(),
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
// Success messages become a toast once; errors stay as a banner on the page.
let lastToast = '';
function toast(message, kind = 'ok') {
  let host = q('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = icon(kind === 'error' ? 'circle-alert' : 'circle-check') + '<span></span>';
  el.querySelector('span').textContent = message;
  host.append(el);
  setTimeout(() => el.classList.add('leaving'), 3200);
  setTimeout(() => el.remove(), 3600);
}
function flashMessages() {
  if (S.msg && S.msg !== lastToast) toast(S.msg);
  lastToast = S.msg || '';
}
// In-app replacement for window.confirm. Resolves true when confirmed.
function confirmDialog({ title, body = '', confirmLabel = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const dialog = showDialog(
      'confirmDialog',
      '<div class="section-title"><h2>' +
        esc(title) +
        '</h2><button class="btn btn-ghost" data-close>Cerrar</button></div>' +
        (body ? '<p class="muted">' + esc(body) + '</p>' : '') +
        '<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancelar</button><button type="button" class="btn ' +
        (danger ? 'btn-danger-solid' : 'btn-primary') +
        '" data-confirm>' +
        esc(confirmLabel) +
        '</button></div>'
    );
    dialog.classList.add('confirm');
    // Escape or tapping outside counts as cancel.
    dialog.addEventListener('close', () => finish(false));
    dialog.querySelector('[data-cancel]').onclick = () => {
      finish(false);
      dialog.close();
    };
    dialog.querySelector('[data-confirm]').onclick = () => {
      finish(true);
      dialog.close();
    };
  });
}
