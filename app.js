import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const SUPABASE_URL = 'https://fczmkdkhyalksmczeyda.supabase.co',
  SUPABASE_KEY = 'sb_publishable_M0tikDD2Y9L3B83lJpTcsA_IWuEz5JR';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const root = document.querySelector('#app');
const S = {
  session: null,
  workspace: null,
  products: [],
  summaries: new Map(),
  photoUrls: new Map(),
  product: null,
  settings: { filament_price_per_kg: 15990, electricity_rate_clp_kwh: 236, printer_power_kw: 1.75 },
  mode: 'auth',
  settingsDirty: false,
  showArchived: false,
  editorTab: 'details',
  search: '',
  dirty: false,
  saving: false,
  photoBusy: false,
  resources: [],
  orders: [],
  quotes: [],
  customers: [],
  payments: [],
  quoteFilter: 'open',
  sort: 'recent',
  profitFilter: 'all',
  orderFilter: 'open',
  msg: '',
  err: ''
};
const q = s => document.querySelector(s),
  qa = s => [...document.querySelectorAll(s)],
  n = v => Number(String(v ?? '').replace(',', '.')) || 0,
  clp = v =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(
      n(v)
    ),
  pct = v => Math.round(n(v) * 100) + '%',
  esc = s =>
    String(s ?? '').replace(
      /[&<>'"]/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]
    ),
  canEdit = () => ['owner', 'editor'].includes(S.workspace?.role),
  isOwner = () => S.workspace?.role === 'owner',
  roleName = () =>
    ({ owner: 'Propietario', editor: 'Editor', viewer: 'Solo lectura' })[S.workspace?.role] || 'Miembro',
  commercial = (v, st) => {
    v = Math.max(0, n(v));
    st = Math.max(1, Math.round(n(st) || 1000));
    if (!v) return 0;
    if (st < 100) return Math.ceil(v / st) * st;
    let x = Math.ceil(v / st) * st - 10;
    if (x < v) x += st;
    return x;
  };
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
    [loadOrders, loadQuotes, loadCustomers].map(load =>
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
const PRODUCT_LIST_COLUMNS =
  'id,workspace_id,name,description,quantity,iva_enabled,iva_rate,target_margin,round_to,status,sale_price,photo_path,stock_qty,stock_reserved,created_at,updated_at';
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
function fail(m) {
  S.err = m;
  render();
}
function authView() {
  root.innerHTML =
    '<div class="shell"><div class="auth card"><img class="auth-logo" src="' +
    LOGO_SRC +
    '" alt="Kultiverso Pop"><h1>KultiApp</h1><p class="muted">Costos y producción 3D</p><p class="small muted">Kultiverso Pop · Powered by ELARA</p>' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    (S.msg ? '<div class="success">' + esc(S.msg) + '</div>' : '') +
    '<div class="login-tabs"><button class="btn tab active" data-mode="login">Ingresar</button><button class="btn tab" data-mode="signup">Crear cuenta</button></div><form id="authForm" class="grid"><div class="field"><label>Email</label><input id="email" type="email" required></div><div class="field"><label>Contraseña</label><input id="password" type="password" minlength="6" required><span id="passwordHint" class="small muted" hidden>' +
    PASSWORD_HINT +
    '</span></div><button class="btn btn-primary" type="submit">Ingresar</button></form></div></div>';
  let mode = 'login';
  qa('[data-mode]').forEach(
    b =>
      (b.onclick = () => {
        mode = b.dataset.mode;
        qa('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
        q('#authForm button[type=submit]').textContent = mode === 'login' ? 'Ingresar' : 'Crear cuenta';
        q('#password').minLength = mode === 'login' ? 6 : PASSWORD_MIN;
        q('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
        q('#passwordHint').hidden = mode === 'login';
      })
  );
  q('#authForm').onsubmit = async e => {
    e.preventDefault();
    const email = q('#email').value.trim(),
      password = q('#password').value;
    if (mode === 'login') {
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) fail(error.message);
    } else {
      const problem = await checkNewPassword(password);
      if (problem) return fail(problem);
      let { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: location.origin + location.pathname }
      });
      if (error) fail(error.message);
      else {
        S.msg = 'Cuenta creada. Revisa tu correo si se solicita verificación.';
        render();
      }
    }
  };
}
function relativeDate(iso) {
  if (!iso) return '';
  const d = new Date(iso),
    today = new Date(),
    day = 864e5,
    start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(),
    diff = Math.round((start(today) - start(d)) / day);
  if (diff === 0) return 'hoy, ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'ayer';
  return shortDate(
    d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
  );
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
  const active = S.products.filter(p => p.status !== 'archived'),
    arch = S.products.filter(p => p.status === 'archived'),
    list = S.showArchived ? arch : active,
    term = S.search.toLocaleLowerCase('es');
  const rows = list
    .filter(p => (p.name + ' ' + (p.description || '')).toLocaleLowerCase('es').includes(term))
    .filter(p => matchesProfit(p))
    .sort(compareProducts);
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
      canEdit()
        ? '<button class="btn btn-primary" id="new">' + icon('plus') + '<span>Nuevo producto</span></button>'
        : ''
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="toolbar"><label class="search-box">' +
    icon('search') +
    '<input id="searchProducts" type="search" placeholder="Buscar en ' +
    active.length +
    (active.length === 1 ? ' producto' : ' productos') +
    '" aria-label="Buscar productos" value="' +
    esc(S.search) +
    '"></label><div class="view-tabs" role="tablist"><button class="btn ' +
    (!S.showArchived ? 'btn-primary' : 'btn-secondary') +
    '" id="showActive" role="tab">Activos <span class="seg-count">' +
    active.length +
    '</span></button><button class="btn ' +
    (S.showArchived ? 'btn-primary' : 'btn-secondary') +
    '" id="showArchived" role="tab">Archivados <span class="seg-count">' +
    arch.length +
    '</span></button></div><select id="profitFilter" class="select-compact" aria-label="Rentabilidad"><option value="all">Margen: todos</option><option value="positive">Sin pérdida</option><option value="loss">Con pérdida</option><option value="uncosted">Sin costos registrados</option></select><select id="productSort" class="select-compact" aria-label="Ordenar"><option value="recent">Más recientes</option><option value="name">Nombre A–Z</option><option value="price">Precio mayor a menor</option><option value="cost">Costo mayor a menor</option><option value="margin">Margen mayor a menor</option></select></div><section class="panel product-panel">' +
    (rows.length
      ? '<table class="data-table products-table"><thead><tr><th>Producto</th><th class="r">Costo unit.</th><th class="r">Precio final</th><th>Margen</th><th class="r">Stock</th><th>Actualizado</th><th></th></tr></thead><tbody>' +
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
              '</td><td class="r">' +
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
              productMenu(p) +
              '</div>'
          )
          .join('') +
        '</div>'
      : empty) +
    '</section></main>';
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
  q('#showActive').onclick = () => {
    S.showArchived = false;
    dashboard();
  };
  q('#showArchived').onclick = () => {
    S.showArchived = true;
    dashboard();
  };
  // Rows open the product; the ⋯ menu and its actions don't.
  qa('[data-open]').forEach(row => {
    row.onclick = e => {
      if (e.target.closest('.row-menu')) return;
      openProduct(row.dataset.open);
    };
    row.onkeydown = e => {
      if (e.key === 'Enter' && e.target === row) openProduct(row.dataset.open);
    };
  });
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
function newProduct() {
  if (restoreDraft('new')) return render();
  S.dirty = true;
  S.product = {
    id: null,
    photo_data: null,
    name: 'Nuevo producto',
    description: '',
    quantity: 1,
    iva_enabled: true,
    iva_rate: 0.19,
    target_margin: 0.4,
    round_to: 1000,
    prints: [],
    directCosts: [
      { name: 'Impresión foto / póster', amount: 0 },
      { name: 'Cuadro / marco', amount: 0 },
      { name: 'Caja / empaque', amount: 0 },
      { name: 'Adhesivos / consumibles', amount: 0 }
    ],
    additionalCosts: [
      { name: 'Mano de obra / armado', amount: 0 },
      { name: 'Desgaste impresora', amount: 0 },
      { name: 'Fallas / mermas', amount: 0 },
      { name: 'Publicidad', amount: 0 }
    ]
  };
  S.editorTab = 'details';
  S.mode = 'product';
  render();
}
async function openProduct(id, { restore = true } = {}) {
  if (restore && restoreDraft(id)) return render();
  let { data: p, error } = await supabase.from('products').select('*').eq('id', id).single();
  if (error) return fail(error.message);
  let [{ data: prints }, { data: costs }] = await Promise.all([
    supabase.from('print_jobs').select('*').eq('product_id', id).order('print_no'),
    supabase.from('cost_items').select('*').eq('product_id', id).order('sort_order')
  ]);
  p.prints = prints || [];
  p.directCosts = (costs || []).filter(x => x.category === 'direct' && !x.inventory_material);
  p.additionalCosts = (costs || []).filter(x => x.category === 'additional');
  p.saved_photo_path = p.photo_path ?? null;
  await loadPhotoUrls([p]);
  S.product = p;
  S.dirty = false;
  S.editorTab = 'details';
  S.mode = 'product';
  render();
}
function collect() {
  const p = S.product;
  collectMaterials();
  if (q('#salePrice'))
    p.sale_price = q('#salePrice').value === '' ? null : Math.max(0, n(q('#salePrice').value));
  if (q('#cfgFilament')) S.settings.filament_price_per_kg = n(q('#cfgFilament').value);
  if (q('#cfgElec')) S.settings.electricity_rate_clp_kwh = n(q('#cfgElec').value);
  if (q('#cfgPower')) S.settings.printer_power_kw = n(q('#cfgPower').value);
  p.name = q('#name').value.trim() || 'Producto';
  p.description = q('#desc').value.trim();
  p.quantity = Math.max(1, parseInt(q('#qty').value || 1));
  p.iva_enabled = q('#iva').checked;
  p.iva_rate = n(q('#ivar').value) / 100;
  p.target_margin = Math.min(0.94, Math.max(0, n(q('#margin').value) / 100));
  p.round_to = Math.max(1, parseInt(q('#round').value || 1000));
  p.prints = qa('.print-card').map((el, i) => ({
    printer_name: el.querySelector('.printerLabel')?.value || null,
    power_kw:
      el.querySelector('.printPower')?.value === '' || !el.querySelector('.printPower')
        ? null
        : Math.max(0, n(el.querySelector('.printPower').value)),
    filaments: collectFilaments(el),
    label: el.querySelector('.pl').value.trim() || 'Impresión ' + (i + 1),
    grams: n(el.querySelector('.pg').value),
    hours: parseInt(el.querySelector('.ph').value || 0),
    minutes: parseInt(el.querySelector('.pm').value || 0),
    filament_cost: n(el.querySelector('.pf').value),
    electricity_cost: n(el.querySelector('.pe').value),
    other_print_cost: n(el.querySelector('.po').value),
    notes: el.querySelector('.pn').value.trim()
  }));
  p.prints.forEach((x, i) => {
    if (x.filaments.length) {
      const f = filamentTotals(x.filaments);
      x.grams = f.grams;
      x.filament_cost = Math.round(f.cost);
      const el = qa('.print-card')[i];
      el.querySelector('.pg').value = x.grams;
      el.querySelector('.pf').value = x.filament_cost;
    }
  });
  p.directCosts = qa('.cost-row.direct').map(el => ({
    name: el.querySelector('.cn').value.trim() || 'Costo',
    amount: n(el.querySelector('.ca').value)
  }));
  p.additionalCosts = qa('.cost-row.additional').map(el => ({
    name: el.querySelector('.cn').value.trim() || 'Costo',
    amount: n(el.querySelector('.ca').value)
  }));
  return p;
}
function totals(p = S.product) {
  const pc = (p.prints || []).reduce(
      (s, x) => s + n(x.filament_cost) + n(x.electricity_cost) + n(x.other_print_cost),
      0
    ),
    dc =
      (p.directCosts || []).reduce((s, x) => s + n(x.amount), 0) +
      (p.materials || []).reduce((s, x) => s + n(x.quantity) * n(x.unit_cost), 0),
    ac = (p.additionalCosts || []).reduce((s, x) => s + n(x.amount), 0),
    batch = pc + dc + ac,
    qty = Math.max(1, parseInt(p.quantity || 1)),
    unit = batch / qty,
    m = n(p.target_margin),
    net = unit / (1 - m || 1),
    iva = p.iva_enabled ? net * n(p.iva_rate) : 0,
    gross = net + iva,
    suggested = commercial(gross, p.round_to),
    rounded = p.sale_price == null ? suggested : Math.max(0, n(p.sale_price)),
    effectiveNet = p.iva_enabled ? rounded / (1 + n(p.iva_rate)) : rounded,
    utilityUnit = effectiveNet - unit,
    utility = utilityUnit * qty,
    em = effectiveNet ? utilityUnit / effectiveNet : 0,
    sales = rounded * qty,
    finalNet = effectiveNet,
    finalIva = rounded - effectiveNet;
  return {
    suggested,
    finalNet,
    finalIva,
    pc,
    direct: pc + dc,
    ac,
    total: batch,
    batch,
    qty,
    unit,
    net,
    iva,
    rounded,
    utilityUnit,
    utility,
    em,
    sales
  };
}
function pRows(list) {
  return (
    (list || [])
      .map(
        (x, i) =>
          '<div class="print-card"><div class="section-title"><h3>Impresión ' +
          (i + 1) +
          '</h3><div class="row"><button type="button" class="btn btn-secondary dupP">Duplicar</button><button class="btn icon-btn danger-icon rmP" type="button" aria-label="Quitar impresión" title="Quitar impresión">' +
          icon('trash-2') +
          '</button></div></div><div class="grid grid-4"><div class="field"><label>Etiqueta</label><input class="pl" value="' +
          esc(x.label || 'Impresión ' + (i + 1)) +
          '"></div><div class="field"><label>Gramos</label><input class="pg live" type="number" value="' +
          n(x.grams) +
          '"></div><div class="field"><label>Horas</label><input class="ph live" type="number" value="' +
          n(x.hours) +
          '"></div><div class="field"><label>Minutos</label><input class="pm live" type="number" value="' +
          n(x.minutes) +
          '"></div><div class="field"><label>Costo filamento</label><input class="pf live" type="number" value="' +
          n(x.filament_cost) +
          '"></div><div class="field"><label>Electricidad</label><input class="pe live" type="number" value="' +
          n(x.electricity_cost) +
          '"></div><div class="field"><label>Otros costos</label><input class="po live" type="number" value="' +
          n(x.other_print_cost) +
          '"></div><div class="field"><label>Notas</label><input class="pn" value="' +
          esc(x.notes || '') +
          '"></div></div>' +
          filamentPanel(x) +
          '<div class="row" style="margin-top:12px"><button type="button" class="btn btn-secondary calcP">' +
          icon('calculator') +
          'Calcular filamento y electricidad</button></div></div>'
      )
      .join('') || '<p class="muted">Aún no agregas impresiones.</p>'
  );
}
function cRows(list, cat) {
  return (
    (list || [])
      .map(
        x =>
          '<div class="cost-row ' +
          cat +
          '"><div class="cost-grid"><div class="field"><label>Concepto</label><input class="cn" value="' +
          esc(x.name || '') +
          '"></div><div class="field"><label>Monto</label><input class="ca live" type="number" value="' +
          n(x.amount) +
          '"></div><button class="btn icon-btn danger-icon rmC" type="button" aria-label="Quitar costo" title="Quitar costo">' +
          icon('trash-2') +
          '</button></div></div>'
      )
      .join('') || '<p class="muted">Sin costos agregados.</p>'
  );
}
function scenario(name, m) {
  const t = totals({ ...S.product, target_margin: m, sale_price: null });
  return (
    '<div class="scenario"><h4>' +
    name +
    '</h4><div class="small muted">Margen ' +
    pct(m) +
    '</div><div class="price">' +
    clp(t.rounded) +
    '</div><div class="small">Utilidad / un. ' +
    clp(t.utilityUnit) +
    '</div></div>'
  );
}
// Scenario margins stay ordered: Mínimo ≤ Promo ≤ Recomendado ≤ Premium.
function scenarios(m) {
  const min = Math.min(m, Math.max(0.15, m - 0.15)),
    promo = Math.min(m, Math.max(0.2, m - 0.05)),
    premium = Math.max(m, Math.min(0.8, m + 0.1));
  return (
    scenario('Mínimo', min) +
    scenario('Promo', promo) +
    scenario('Recomendado', m) +
    scenario('Premium', premium)
  );
}
function product() {
  const p = S.product,
    t = totals(p);
  root.innerHTML =
    header(p.name || 'Producto', '', { back: true }) +
    '<main class="shell"><section class="card"><div class="section-title"><div><h2>Parámetros generales</h2><div class="small muted">Se comparten con tu socio y se usan para calcular automáticamente cada impresión.</div></div></div><div class="grid grid-4"><div class="field"><label>Filamento $/kg</label><input id="cfgFilament" class="live" type="number" value="' +
    n(S.settings.filament_price_per_kg) +
    '"></div><div class="field"><label>Electricidad $/kWh</label><input id="cfgElec" class="live" type="number" step="0.01" value="' +
    n(S.settings.electricity_rate_clp_kwh) +
    '"></div><div class="field"><label>Potencia máxima kW</label><input id="cfgPower" class="live" type="number" step="0.01" value="' +
    n(S.settings.printer_power_kw) +
    '"></div><div class="field"><label>Criterio</label><div class="notice" style="margin:0">Costo conservador por consumo máximo</div></div></div></section><section class="card" style="margin-top:16px"><div class="grid grid-4"><div class="field"><label>Nombre</label><input id="name" value="' +
    esc(p.name) +
    '"></div><div class="field"><label>Cantidad</label><input id="qty" type="number" value="' +
    p.quantity +
    '"></div><div class="field"><label>Margen objetivo %</label><input id="margin" class="live" type="number" value="' +
    Math.round(p.target_margin * 100) +
    '"></div><div class="field"><label>Redondeo CLP</label><input id="round" class="live" type="number" value="' +
    p.round_to +
    '"></div><div class="field"><label><input id="iva" class="live" type="checkbox" ' +
    (p.iva_enabled ? 'checked' : '') +
    '> Aplicar IVA</label></div><div class="field"><label>IVA %</label><input id="ivar" class="live" type="number" value="' +
    Math.round(p.iva_rate * 100) +
    '"></div></div><div class="field" style="margin-top:12px"><label>Descripción</label><textarea id="desc">' +
    esc(p.description || '') +
    '</textarea></div></section><section class="card" style="margin-top:16px"><div class="section-title"><h2>Impresiones 3D</h2><button class="btn btn-primary" id="addP">' +
    icon('plus') +
    'Agregar impresión</button></div><div id="prints" class="grid">' +
    pRows(p.prints) +
    '</div></section><section class="grid grid-2" style="margin-top:16px"><div class="card"><div class="section-title"><h2>Costos directos</h2><button class="btn btn-secondary" id="addD">' +
    icon('plus') +
    'Agregar</button></div><div class="grid">' +
    cRows(p.directCosts, 'direct') +
    '</div></div><div class="card"><div class="section-title"><h2>Costos adicionales</h2><button class="btn btn-secondary" id="addA">' +
    icon('plus') +
    'Agregar</button></div><div class="grid">' +
    cRows(p.additionalCosts, 'additional') +
    '</div></div></section><section class="card" style="margin-top:16px"><h2>Resumen financiero</h2><div class="grid grid-4"><div class="metric"><div class="label">Impresiones 3D</div><div class="value" id="m1">' +
    clp(t.pc) +
    '</div></div><div class="metric"><div class="label">Costo directo</div><div class="value" id="m2">' +
    clp(t.direct) +
    '</div></div><div class="metric"><div class="label">Costos adicionales</div><div class="value" id="m3">' +
    clp(t.ac) +
    '</div></div><div class="metric primary"><div class="label">Costo total lote</div><div class="value" id="m4">' +
    clp(t.total) +
    '</div><div class="small muted" id="m10">' +
    clp(t.unit) +
    ' por unidad</div></div><div class="metric"><div class="label">Neto final / unidad</div><div class="value" id="m5">' +
    clp(t.finalNet) +
    '</div></div><div class="metric"><div class="label">IVA final / unidad</div><div class="value" id="m6">' +
    clp(t.finalIva) +
    '</div></div><div class="metric gold"><div class="label">Precio final / unidad</div><div class="value" id="m7">' +
    clp(t.rounded) +
    '</div></div><div class="metric good"><div class="label">Utilidad lote</div><div class="value" id="m8">' +
    clp(t.utility) +
    '</div><div class="small" id="m11">' +
    clp(t.utilityUnit) +
    ' por unidad</div><div class="small" id="m9">Margen efectivo ' +
    pct(t.em) +
    '</div></div></div><div class="divider"></div><div class="grid grid-4" id="sc">' +
    scenarios(p.target_margin) +
    '</div></section><div class="sticky-actions"><button class="btn btn-danger" id="del" ' +
    (p.id ? '' : 'disabled') +
    '>Eliminar</button><button class="btn btn-primary" id="save">Guardar cambios</button></div></main>';
  setupEditor();
  setupV12();
  setupV13();
  setupInventoryProduct();
  setupV22();
  common();
  bindProduct();
}
function bindProduct() {
  bindV12();
  bindV13();
  bindInventoryProduct();
  q('#back').onclick = async () => {
    persistDraft();
    await loadProducts();
    S.mode = 'dashboard';
    render();
  };
  if (!canEdit()) {
    qa('main input,main textarea,main select,main button').forEach(el => {
      if (!['back', 'quote', 'createOrder'].includes(el.id) && !el.hasAttribute('data-editor-tab'))
        el.disabled = true;
    });
    return;
  }
  q('#addP').onclick = () => {
    collect();
    S.dirty = true;
    S.product.prints.push({
      label: 'Impresión ' + (S.product.prints.length + 1),
      grams: 0,
      hours: 0,
      minutes: 0,
      filament_cost: 0,
      electricity_cost: 0,
      other_print_cost: 0,
      notes: ''
    });
    render();
  };
  q('#addD').onclick = () => {
    collect();
    S.dirty = true;
    S.product.directCosts.push({ name: 'Nuevo costo directo', amount: 0 });
    render();
  };
  q('#addA').onclick = () => {
    collect();
    S.dirty = true;
    S.product.additionalCosts.push({ name: 'Nuevo costo adicional', amount: 0 });
    render();
  };
  qa('.rmP').forEach(
    (b, i) =>
      (b.onclick = () => {
        collect();
        S.dirty = true;
        S.product.prints.splice(i, 1);
        render();
      })
  );
  qa('.calcP').forEach(b => (b.onclick = () => calcPrintCosts(b.closest('.print-card'))));
  qa('.rmC').forEach(
    b =>
      (b.onclick = () => {
        const el = b.closest('.cost-row'),
          cat = el.classList.contains('direct') ? 'directCosts' : 'additionalCosts',
          idx = [...el.parentNode.querySelectorAll('.cost-row')].indexOf(el);
        collect();
        S.dirty = true;
        S.product[cat].splice(idx, 1);
        render();
      })
  );
  qa('main input,main textarea').forEach(el => (el.oninput = refresh));
  qa('#cfgFilament,#cfgElec,#cfgPower').forEach(
    el =>
      (el.oninput = () => {
        S.settingsDirty = true;
        refresh();
      })
  );
  q('#save').onclick = saveProduct;
  q('#del').onclick = () => deleteProduct();
}
function calcPrintCosts(el) {
  collect();
  const grams = n(el.querySelector('.pg').value),
    hours = n(el.querySelector('.ph').value),
    minutes = n(el.querySelector('.pm').value),
    fil = collectFilaments(el).length
      ? filamentTotals(collectFilaments(el)).cost
      : (grams * n(S.settings.filament_price_per_kg)) / 1000,
    elec =
      (hours + minutes / 60) *
      n(
        el.querySelector('.printPower')?.value === '' || !el.querySelector('.printPower')
          ? S.settings.printer_power_kw
          : el.querySelector('.printPower').value
      ) *
      n(S.settings.electricity_rate_clp_kwh);
  el.querySelector('.pf').value = Math.round(fil);
  el.querySelector('.pe').value = Math.round(elec);
  refresh();
}
// Typing saves the draft after a short pause; pagehide/visibilitychange still flush it immediately.
let draftTimer = null;
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => persistDraft(false), 400);
}
function refresh() {
  S.dirty = true;
  collect();
  scheduleDraft();
  const t = totals(),
    set = (id, v) => (q(id).textContent = v);
  set('#m1', clp(t.pc));
  set('#m2', clp(t.direct));
  set('#m3', clp(t.ac));
  set('#m4', clp(t.total));
  set('#m10', clp(t.unit) + ' por unidad');
  set('#m5', clp(t.finalNet));
  set('#m6', clp(t.finalIva));
  set('#m7', clp(t.rounded));
  set('#m8', clp(t.utility));
  set('#m11', clp(t.utilityUnit) + ' por unidad');
  set('#m9', 'Margen efectivo ' + pct(t.em));
  q('#quickPrice').textContent = clp(t.rounded);
  q('#quickCost').textContent = clp(t.unit);
  updatePriceHero();
  q('#sc').innerHTML = scenarios(S.product.target_margin);
  updatePriceStatus();
  updateMaterialStatus();
  qa('.filament-row').forEach(
    row =>
      (row.querySelector('.filament-subtotal').textContent = clp(
        filamentTotals(
          collectFilaments(row.closest('.print-card')).slice(
            [...row.parentNode.querySelectorAll('.filament-row')].indexOf(row),
            [...row.parentNode.querySelectorAll('.filament-row')].indexOf(row) + 1
          )
        ).cost
      ))
  );
  updateSyncStatus();
}
async function saveProduct() {
  if (S.saving || S.photoBusy || !canEdit()) return;
  const p = collect(),
    oldDraftId = p.id || 'new';
  let uploadedPath = null;
  S.saving = true;
  S.err = '';
  persistDraft(false);
  q('#save').disabled = true;
  q('#save').textContent = 'Guardando…';
  q('main').inert = true;
  updateSyncStatus();
  try {
    if (S.settingsDirty) {
      await saveSettings();
      S.settingsDirty = false;
    }
    const prints = p.prints.map((x, i) => ({ ...x, print_no: i + 1 }));
    const costs = [
      ...p.directCosts.map((x, i) => ({ ...x, category: 'direct', sort_order: i })),
      ...p.additionalCosts.map((x, i) => ({ ...x, category: 'additional', sort_order: i }))
    ];
    if (validPhoto(p.photo_data)) uploadedPath = await uploadPhoto(p.photo_data);
    const photoPath = uploadedPath || p.photo_path || null;
    const { data: id, error } = await supabase.rpc('save_product_bundle_v5', {
      p_materials: p.materials || [],
      p_sale_price: p.sale_price ?? null,
      p_photo_path: photoPath,
      p_product_id: p.id,
      p_workspace_id: S.workspace.id,
      p_name: p.name,
      p_description: p.description,
      p_quantity: p.quantity,
      p_iva_enabled: p.iva_enabled,
      p_iva_rate: p.iva_rate,
      p_target_margin: p.target_margin,
      p_round_to: p.round_to,
      p_prints: prints,
      p_costs: costs
    });
    if (error) throw error;
    if (uploadedPath) {
      S.photoUrls.set(uploadedPath, { url: p.photo_data, exp: Infinity });
      p.photo_data = null;
    }
    const oldPath = p.saved_photo_path;
    p.photo_path = p.saved_photo_path = photoPath;
    uploadedPath = null;
    if (oldPath && oldPath !== photoPath) cleanupPhoto(oldPath);
    p.id = id;
    S.dirty = false;
    removeDraft(oldDraftId);
    removeDraft(id);
    // The successful atomic response already confirms the full snapshot. Keep it
    // in memory, avoiding an extra reload that could fail after a successful save.
    S.product = p;
    S.msg = 'Producto guardado y sincronizado correctamente.';
    render();
  } catch (e) {
    if (uploadedPath) removePhotoObject(uploadedPath);
    S.dirty = true;
    persistDraft(false);
    fail(e.message);
  } finally {
    S.saving = false;
    if (q('main')) q('main').inert = false;
    if (q('#save')) {
      q('#save').disabled = false;
      q('#save').textContent = 'Guardar cambios';
    }
    updateSyncStatus();
  }
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
function common() {
  mountShell();
  markViewEnter();
  mountInventoryAlert();
  enhanceFields();
  flashMessages();
  if (S.mode === 'dashboard' || S.mode === 'home') showDraftResume();
  q('#logout')?.addEventListener('click', () => supabase.auth.signOut());
  q('#invite')?.addEventListener('click', invite);
  q('#changePassword')?.addEventListener('click', showPasswordDialog);
}
async function invite() {
  if (!isOwner()) return toast('Solo el propietario puede invitar.', 'error');
  const dialog = showDialog(
    'inviteDialog',
    '<div class="section-title"><h2>Invitar socio</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><form id="inviteForm" class="grid"><div class="field"><label for="inviteRole">Permisos</label><select id="inviteRole"><option value="editor">Editor · crea y modifica productos, pedidos e inventario</option><option value="viewer">Solo lectura · consulta sin modificar</option></select></div><div id="inviteResult" role="status"></div><div class="dialog-actions"><button class="btn btn-primary" type="submit">Crear enlace</button></div></form>'
  );
  q('#inviteForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    b.disabled = true;
    const { data, error } = await supabase.rpc('create_workspace_invite', {
      wid: S.workspace.id,
      invite_role: q('#inviteRole').value,
      valid_hours: 168
    });
    b.disabled = false;
    if (error) return (q('#inviteResult').innerHTML = '<div class="error">' + esc(error.message) + '</div>');
    const url = location.origin + location.pathname + '?invite=' + encodeURIComponent(data);
    q('#inviteResult').innerHTML =
      '<div class="field"><label for="inviteLink">Enlace de invitación · válido por 7 días</label><div class="input-action"><input id="inviteLink" readonly value="' +
      esc(url) +
      '"><button type="button" class="btn btn-secondary" id="copyInvite">' +
      icon('copy') +
      '<span>Copiar</span></button></div></div>';
    b.textContent = 'Crear otro enlace';
    q('#copyInvite').onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast('Enlace copiado.');
      } catch {
        q('#inviteLink').select();
      }
    };
  };
  return dialog;
}
function render() {
  if (!S.session || S.mode === 'auth') return authView();
  saveView();
  if (S.mode === 'quotes') return quotesView();
  if (S.mode === 'customers') return customersView();
  if (S.mode === 'reports') return reportsView();
  if (S.mode === 'inventory') return inventoryView();
  if (S.mode === 'resources') return resourcesView();
  if (S.mode === 'production') return productionView();
  if (S.mode === 'product') return product();
  if (S.mode === 'home') return homeView();
  dashboard();
}
function enhanceFields() {
  qa('.field').forEach((field, i) => {
    const input = field.querySelector('input,textarea,select'),
      label = field.querySelector('label');
    if (input && label) {
      if (!input.id) input.id = 'field-' + i;
      label.htmlFor = input.id;
    }
  });
  q('#email')?.setAttribute('autocomplete', 'email');
  q('#password')?.setAttribute('autocomplete', 'current-password');
}
function setupEditor() {
  const main = q('main'),
    sections = [...main.children].filter(el => el.tagName === 'SECTION');
  main.classList.add('editor');
  const tabs = [
    ['details', 'Producto'],
    ['prints', 'Impresiones'],
    ['costs', 'Costos'],
    ['summary', 'Resumen']
  ];
  sections[0].classList.add('settings-panel');
  const config = document.createElement('details');
  config.className = 'config-details';
  config.innerHTML = '<summary>Parámetros de cálculo <span>Filamento · energía · potencia</span></summary>';
  sections[0].before(config);
  config.append(sections[0]);
  const details = sections[1];
  details.dataset.panel = 'details';
  details.append(config);
  sections[2].dataset.panel = 'prints';
  sections[3].dataset.panel = 'costs';
  sections[4].dataset.panel = 'summary';
  const nav = document.createElement('nav');
  nav.className = 'editor-tabs';
  nav.setAttribute('aria-label', 'Secciones del producto');
  nav.innerHTML = tabs
    .map(
      ([key, label]) =>
        '<button class="btn" type="button" data-editor-tab="' + key + '">' + label + '</button>'
    )
    .join('');
  details.before(nav);
  const feedback = document.createElement('div');
  feedback.setAttribute('aria-live', 'polite');
  feedback.innerHTML = (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') + '';
  nav.before(feedback);
  const t = totals();
  const quick = document.createElement('div');
  quick.className = 'quick-summary';
  quick.innerHTML =
    '<div><span>Costo / un.</span><b id="quickCost">' +
    clp(t.unit) +
    '</b></div><div><span>Precio final / un.</span><b id="quickPrice">' +
    clp(t.rounded) +
    '</b></div>';
  q('.sticky-actions').prepend(quick);
  const select = key => {
    S.editorTab = key;
    qa('[data-panel]').forEach(el => (el.hidden = el.dataset.panel !== key));
    qa('[data-editor-tab]').forEach(b => {
      const active = b.dataset.editorTab === key;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  };
  qa('[data-editor-tab]').forEach(
    b =>
      (b.onclick = () => {
        select(b.dataset.editorTab);
        persistDraft();
        updateSyncStatus();
      })
  );
  select(S.editorTab);
  const status = document.createElement('div');
  status.id = 'draftStatus';
  status.className = 'small muted';
  status.setAttribute('role', 'status');
  nav.after(status);
  if (canEdit()) {
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'btn btn-ghost';
    discard.textContent = 'Descartar borrador';
    discard.onclick = async () => {
      const ok = await confirmDialog({
        title: 'Descartar borrador',
        body: 'Se perderán los cambios que no guardaste en este producto.',
        confirmLabel: 'Descartar',
        danger: true
      });
      if (!ok) return;
      removeDraft(S.product.id || 'new');
      S.product = null;
      S.mode = 'dashboard';
      S.msg = 'Borrador descartado.';
      if (S.settingsDirty) loadSettings().then(render);
      render();
    };
    status.after(discard);
    persistDraft(false);
  }
}

// Drafts remain on this device, isolated by authenticated user and workspace.
function draftPrefix() {
  return S.session?.user?.id && S.workspace?.id
    ? 'kultiapp:draft:v1:' + S.session.user.id + ':' + S.workspace.id + ':'
    : null;
}
function draftKey(id) {
  const prefix = draftPrefix();
  return prefix ? prefix + id : null;
}
function readDraft(id) {
  try {
    const key = draftKey(id);
    if (!key) return null;
    const d = JSON.parse(localStorage.getItem(key) || 'null');
    if (
      !d ||
      d.version !== 1 ||
      !d.product ||
      !Array.isArray(d.product.prints) ||
      !Array.isArray(d.product.directCosts) ||
      !Array.isArray(d.product.additionalCosts)
    )
      return null;
    if (String(d.product.id || 'new') !== String(id)) return null;
    return d;
  } catch {
    return null;
  }
}
function activeDraftId() {
  try {
    const prefix = draftPrefix();
    return prefix ? localStorage.getItem(prefix + 'active') : null;
  } catch {
    return null;
  }
}
function persistDraft(readForm = true) {
  if (S.mode !== 'product' || !canEdit() || !S.product || !S.dirty) return;
  const key = draftKey(S.product.id || 'new');
  if (!key) return;
  try {
    if (readForm && q('#name')) collect();
    const d = {
      version: 1,
      product: S.product,
      editedSettings: S.settingsDirty && {
        filament_price_per_kg: S.settings.filament_price_per_kg,
        electricity_rate_clp_kwh: S.settings.electricity_rate_clp_kwh,
        printer_power_kw: S.settings.printer_power_kw
      },
      tab: S.editorTab,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(key, JSON.stringify(d));
    localStorage.setItem(draftPrefix() + 'active', String(S.product.id || 'new'));
    if (q('#draftStatus'))
      q('#draftStatus').textContent =
        'Borrador guardado en este dispositivo · ' +
        new Date(d.updatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    if (q('#draftStatus'))
      q('#draftStatus').textContent =
        'No se pudo guardar el borrador en este dispositivo. Usa Guardar cambios.';
  }
}
function restoreDraft(id) {
  if (!canEdit()) return false;
  const d = readDraft(id);
  if (!d) return false;
  if (d.product.id && !S.products.some(p => p.id === d.product.id && p.status !== 'archived')) return false;
  S.product = d.product;
  S.dirty = true;
  if (d.editedSettings) {
    S.settings = { ...S.settings, ...d.editedSettings };
    S.settingsDirty = true;
  }
  S.editorTab = ['details', 'prints', 'costs', 'summary'].includes(d.tab) ? d.tab : 'details';
  S.mode = 'product';
  S.msg = 'Recuperamos tu borrador. Continúa donde quedaste.';
  return true;
}
function restoreActiveDraft() {
  const id = activeDraftId();
  return id ? restoreDraft(id) : false;
}
function removeDraft(id) {
  try {
    const key = draftKey(id);
    if (key) localStorage.removeItem(key);
    if (activeDraftId() === String(id)) localStorage.removeItem(draftPrefix() + 'active');
    if (q('#draftStatus')) q('#draftStatus').textContent = 'Cambios sincronizados.';
  } catch {}
}
function showDraftResume() {
  const id = activeDraftId(),
    d = id && readDraft(id);
  if (!d || !canEdit()) return;
  const box = document.createElement('div');
  box.className = 'notice row';
  const text = document.createElement('span');
  text.textContent = 'Borrador pendiente: ' + d.product.name;
  const resume = document.createElement('button');
  resume.type = 'button';
  resume.className = 'btn btn-secondary';
  resume.textContent = 'Continuar borrador';
  resume.onclick = () => {
    if (restoreDraft(id)) render();
  };
  box.append(text, resume);
  q('main')?.prepend(box);
}
window.addEventListener('pagehide', () => persistDraft());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistDraft();
});

// V1.2: material breakdown, product photos and customer-facing quotations.
function validPhoto(data) {
  return (
    typeof data === 'string' &&
    data.length <= 250000 &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data)
  );
}
// V1.5: saved photos live in Storage; photo_data only holds a new or legacy photo until it is uploaded.
const PHOTO_BUCKET = 'product-photos',
  PHOTO_URL_TTL = 43200;
function photoSrc(p) {
  if (validPhoto(p?.photo_data)) return p.photo_data;
  const u = p?.photo_path && S.photoUrls.get(p.photo_path);
  return u && u.exp > Date.now() ? u.url : null;
}
function photoImg(src, alt, cls) {
  return src ? '<img class="' + cls + '" src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy">' : '';
}
function productPhoto(p, cls = 'product-photo') {
  return photoImg(photoSrc(p), p.name, cls);
}
async function loadPhotoUrls(list) {
  const paths = [
    ...new Set(list.map(p => p.photo_path).filter(x => x && !(S.photoUrls.get(x)?.exp > Date.now() + 60000)))
  ];
  if (!paths.length) return;
  try {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_TTL);
    if (error) throw error;
    const exp = Date.now() + PHOTO_URL_TTL * 1000 - 60000;
    for (const x of data || []) if (x.signedUrl) S.photoUrls.set(x.path, { url: x.signedUrl, exp });
  } catch (e) {
    console.warn('No se pudieron cargar las fotos', e);
  }
}
async function loadLegacyPhotos() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id,photo_data')
      .eq('workspace_id', S.workspace.id)
      .not('photo_data', 'is', null);
    if (error) throw error;
    const legacy = new Map((data || []).map(x => [x.id, x.photo_data]));
    for (const p of S.products) if (legacy.has(p.id)) p.photo_data = legacy.get(p.id);
  } catch (e) {
    console.warn('No se pudieron cargar las fotos anteriores', e);
  }
}
async function uploadPhoto(dataUrl) {
  const bin = atob(dataUrl.split(',')[1]),
    blob = new Blob([Uint8Array.from(bin, c => c.charCodeAt(0))], { type: 'image/jpeg' }),
    path = S.workspace.id + '/' + crypto.randomUUID() + '.jpg';
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return path;
}
async function removePhotoObject(path) {
  try {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  } catch {}
}
// Duplicated products share a photo, so an object is removed only when no product references it.
async function cleanupPhoto(path) {
  if (!path) return;
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('workspace_id', S.workspace.id)
      .eq('photo_path', path)
      .limit(1);
    if (error || data?.length) return;
    await removePhotoObject(path);
    S.photoUrls.delete(path);
  } catch {}
}
let photoMigration = null;
function migrateLegacyPhotos() {
  if (photoMigration || !canEdit()) return;
  const pending = S.products.filter(p => validPhoto(p.photo_data));
  if (!pending.length) return;
  photoMigration = (async () => {
    for (const p of pending) {
      try {
        const path = await uploadPhoto(p.photo_data);
        const { error } = await supabase
          .from('products')
          .update({ photo_path: path, photo_data: null })
          .eq('id', p.id)
          .eq('workspace_id', S.workspace.id);
        if (error) {
          await removePhotoObject(path);
          throw error;
        }
        const old = p.photo_path;
        S.photoUrls.set(path, { url: p.photo_data, exp: Infinity });
        p.photo_path = path;
        p.photo_data = null;
        if (old) cleanupPhoto(old);
      } catch (e) {
        console.warn('No se pudo migrar la foto de ' + p.name, e);
      }
    }
  })().finally(() => {
    photoMigration = null;
  });
}
function filamentTotals(items) {
  return items.reduce(
    (a, f) => {
      const grams = Math.max(0, n(f.grams)) + Math.max(0, n(f.purge_grams));
      return { grams: a.grams + grams, cost: a.cost + (grams * Math.max(0, n(f.price_per_kg))) / 1000 };
    },
    { grams: 0, cost: 0 }
  );
}
function collectFilaments(el) {
  return [...el.querySelectorAll('.filament-row')].map(row => ({
    resource_id: row.dataset.resourceId || null,
    name: row.querySelector('.fn').value,
    color: row.querySelector('.fc').value,
    grams: Math.max(0, n(row.querySelector('.fg').value)),
    purge_grams: 0,
    price_per_kg: Math.max(0, n(row.querySelector('.fp').value))
  }));
}
function filamentPanel(x) {
  const items = Array.isArray(x.filaments) ? x.filaments : [];
  return (
    '<div class="filament-panel"><div class="section-title"><h4>Filamentos por color <span class="small muted">' +
    items.length +
    '/7</span></h4><button type="button" class="btn btn-secondary addF" ' +
    (items.length >= 7 ? 'disabled' : '') +
    '>' +
    icon('plus') +
    'Color</button></div><p class="small muted">Consumo total por color según el slicer.</p>' +
    items
      .map(
        f =>
          '<div class="filament-row" data-resource-id="' +
          esc(f.resource_id || '') +
          '"><div class="field color-field"><label>Color / material</label><div class="row"><input class="fc" type="color" aria-label="Muestra de color" value="' +
          (/^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color : '#303030') +
          '"><input class="fn" aria-label="Nombre del filamento" placeholder="Ej. Rojo PLA" value="' +
          esc(f.name || '') +
          '"></div></div><div class="field"><label>Consumo total (g)</label><input class="fg" type="number" min="0" step="0.01" value="' +
          (Math.max(0, n(f.grams)) + Math.max(0, n(f.purge_grams))) +
          '"></div><div class="field"><label>Precio $/kg</label><input class="fp" type="number" min="0" value="' +
          n(f.price_per_kg) +
          '"></div><div class="filament-subtotal small">' +
          clp(filamentTotals([f]).cost) +
          '</div><button class="btn icon-btn rmF" type="button" aria-label="Quitar color" title="Quitar color">' +
          icon('trash-2') +
          '</button></div>'
      )
      .join('') +
    (items.length
      ? ''
      : '<div class="small muted">Sin desglose: se conserva el costo manual de filamento.</div>') +
    '</div>'
  );
}
function setupV12() {
  const detail = q('[data-panel="details"]');
  q('#name').closest('.field').classList.add('full-field');
  const photo = document.createElement('div');
  photo.className = 'photo-editor';
  photo.innerHTML =
    '<div class="photo-box">' +
    (productPhoto(S.product) || '<span class="photo-empty">' + icon('image') + '</span>') +
    '</div><div class="photo-actions"><b>Foto del producto</b><span class="small muted">Se muestra en la lista y en la cotización.</span><div class="row"><label class="btn btn-secondary" for="photoFile">' +
    icon('image') +
    (photoSrc(S.product) || S.product.photo_path ? 'Cambiar foto' : 'Subir foto') +
    '</label><input id="photoFile" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"><button class="btn btn-ghost" type="button" id="removePhoto" ' +
    (!photoSrc(S.product) && !S.product.photo_path ? 'hidden' : '') +
    '>Quitar</button></div></div>';
  detail.prepend(photo);
  const more = document.createElement('details');
  more.className = 'editor-more';
  more.innerHTML =
    '<summary class="btn icon-btn" aria-label="Más opciones" title="Más opciones">' +
    icon('ellipsis-vertical') +
    '</summary><div class="menu-pop"></div>';
  const pop = more.querySelector('.menu-pop');
  const discard = qa('main button').find(b => b.textContent === 'Descartar borrador');
  if (discard) pop.append(discard);
  pop.append(q('#del'));
  q('.page-actions').append(more);
  const quote = document.createElement('div');
  quote.className = 'quote-actions row';
  quote.innerHTML =
    '<button type="button" class="btn btn-primary" id="quote">' +
    icon('file-text') +
    'Compartir cotización</button>';
  q('[data-panel="summary"]').prepend(quote);
  qa('.print-card').forEach(el => {
    const has = el.querySelectorAll('.filament-row').length > 0;
    el.querySelector('.pg').readOnly = has;
    el.querySelector('.pf').readOnly = has;
    if (has) {
      el.querySelector('.pg').title = 'Total de todos los colores, incluida la purga';
      el.querySelector('.pf').title = 'Suma calculada con el precio de cada color';
    }
    const advanced = document.createElement('details');
    advanced.className = 'print-advanced';
    advanced.innerHTML = '<summary>Costos de impresión y notas</summary><div class="grid grid-4"></div>';
    const fields = [...el.querySelector('.grid').children];
    advanced.querySelector('.grid').append(...fields.slice(4));
    el.querySelector('.filament-panel').before(advanced);
  });
  updateSyncStatus();
}
function updateSyncStatus() {
  const el = q('#draftStatus');
  if (!el) return;
  if (S.saving) {
    el.textContent = 'Guardando…';
    return;
  }
  if (!S.dirty && S.product?.id) {
    el.textContent = '✓ Guardado en la nube';
    el.className = 'small sync-cloud';
    return;
  }
  el.className = 'small sync-local';
  if (!el.textContent.startsWith('No se pudo')) el.textContent = '● Borrador sin guardar en la nube';
}
// V1.3: shared resources, selling prices and production snapshots.
async function loadResources() {
  const { data, error } = await supabase
    .from('workspace_resources')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('name');
  if (error) throw error;
  S.resources = data || [];
}
async function loadOrders() {
  const { data, error } = await supabase
    .from('production_orders')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  S.orders = data || [];
  // Balances are extra information: orders still show if payments fail to load.
  try {
    await loadPayments();
  } catch (e) {
    console.warn('No se pudieron cargar los pagos', e);
  }
}
async function goMode(mode) {
  persistDraft();
  S.msg = '';
  S.err = '';
  S.mode = mode;
  // Show the section's outline right away while its data loads.
  if (S.workspace && mode !== 'product') skeletonView(mode);
  try {
    if (mode === 'production') {
      await loadOrders();
      await loadResources();
    }
    if (mode === 'resources' || mode === 'inventory' || mode === 'product') await loadResources();
    if (mode === 'dashboard') await loadProducts();
    if (mode === 'quotes') await Promise.all([loadQuotes(), loadCustomers(), loadOrders()]);
    if (mode === 'customers') await Promise.all([loadCustomers(), loadQuotes(), loadOrders()]);
    if (mode === 'reports') await Promise.all([loadQuotes(), loadOrders()]);
    if (mode === 'home') await Promise.all([loadProducts(), loadOrders(), loadResources()]);
    render();
  } catch (e) {
    fail(e.message);
  }
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
function activeResources(kind) {
  return S.resources.filter(r => r.kind === kind && r.active);
}
function setupV13() {
  const box = document.createElement('div');
  box.className = 'selling-price';
  box.innerHTML =
    '<div class="field"><label for="salePrice">Precio de venta final / unidad (opcional)</label><input id="salePrice" type="number" min="0" step="1" placeholder="Vacío: precio automático" value="' +
    (S.product.sale_price == null ? '' : n(S.product.sale_price)) +
    '"><span class="small muted">' +
    (S.product.iva_enabled ? 'IVA incluido. ' : '') +
    'Déjalo vacío para usar el cálculo automático.</span></div><div id="priceStatus" class="small" role="status"></div>';
  q('#desc').closest('.field').after(box);
  qa('.print-card').forEach(el => {
    const index = qa('.print-card').indexOf(el),
      p = S.product.prints[index];
    const chooser = document.createElement('div');
    chooser.className = 'field printer-choice';
    chooser.innerHTML =
      '<label>Perfil de impresora</label><select class="printerSelect"><option value="">Parámetro general</option>' +
      activeResources('printer')
        .map(r => '<option value="' + esc(r.id) + '">' + esc(r.name) + ' · ' + n(r.power_kw) + ' kW</option>')
        .join('') +
      '</select>';
    el.querySelector('.print-advanced').before(chooser);
    const extras = document.createElement('div');
    extras.className = 'printer-snapshot grid grid-2';
    extras.innerHTML =
      '<div class="field"><label>Impresora registrada</label><input class="printerLabel" readonly value="' +
      esc(p.printer_name || '') +
      '" placeholder="General"></div><div class="field"><label>Potencia kW (vacío: general)</label><input class="printPower" type="number" min="0" max="100" step="0.01" value="' +
      (p.power_kw == null ? '' : n(p.power_kw)) +
      '"></div>';
    el.querySelector('.print-advanced').append(extras);
    const match = activeResources('printer').find(
      r => r.name === p.printer_name && n(r.power_kw) === n(p.power_kw)
    );
    if (match) chooser.querySelector('select').value = match.id;
    [...el.querySelectorAll('.filament-row')].forEach(row => {
      const picker = document.createElement('select');
      picker.className = 'filamentSelect';
      picker.setAttribute('aria-label', 'Elegir filamento del catálogo');
      picker.innerHTML =
        '<option value="">Elegir del catálogo…</option>' +
        activeResources('filament')
          .map(
            r =>
              '<option value="' +
              esc(r.id) +
              '">' +
              esc(r.name) +
              (r.material ? ' · ' + esc(r.material) : '') +
              '</option>'
          )
          .join('');
      row.querySelector('.color-field').prepend(picker);
      picker.value = row.dataset.resourceId || '';
      const f = { resource_id: row.dataset.resourceId };
      row.classList.toggle('linked', !!S.resources.find(r => r.id === f.resource_id));
      row.insertAdjacentHTML('afterbegin', filamentChip(f));
      const chip = row.querySelector('.pickF');
      chip.disabled = !canEdit();
      chip.onclick = () => showFilamentPicker(row);
    });
  });
  const order = document.createElement('button');
  order.id = 'createOrder';
  order.className = 'btn btn-secondary';
  order.innerHTML = icon('clipboard-list') + 'Crear pedido';
  order.disabled = !canEdit();
  q('.quote-actions').append(order);
  const st = productStock(S.product),
    stockBox = document.createElement('section');
  stockBox.className = 'stock-card';
  stockBox.innerHTML =
    '<div class="stock-figure">' +
    icon('boxes') +
    '<div><span class="small muted">En stock</span><b id="stockFigure">' +
    st.available +
    (st.available === 1 ? ' unidad' : ' unidades') +
    '</b>' +
    (st.reserved
      ? '<span class="small muted">' +
        st.reserved +
        (st.reserved === 1 ? ' reservada' : ' reservadas') +
        ' para pedidos</span>'
      : '') +
    '</div></div><div class="row"><button type="button" class="btn btn-secondary" id="makeStock"' +
    (canEdit() ? '' : ' disabled') +
    '>' +
    icon('plus') +
    'Fabricar para stock</button><button type="button" class="btn btn-ghost" id="adjustStock"' +
    (canEdit() && S.product.id ? '' : ' disabled') +
    '>' +
    icon('pencil') +
    'Ajustar conteo</button></div>';
  q('.quote-actions').after(stockBox);
  updatePriceStatus();
  enhanceFields();
}
function updatePriceStatus() {
  const el = q('#priceStatus');
  if (!el) return;
  const t = totals();
  el.className = 'small ' + (t.utilityUnit < 0 ? 'loss-text' : '');
  el.textContent =
    'Automático: ' +
    clp(t.suggested) +
    ' · Margen con precio final: ' +
    (t.rounded > 0 ? pct(t.em) : 'No aplica') +
    ' · Utilidad / un.: ' +
    clp(t.utilityUnit) +
    (t.utilityUnit < 0 ? ' · Este precio genera pérdida.' : '');
}
function bindV13() {
  q('#createOrder').onclick = async () => {
    if (!canEdit()) return;
    if (S.photoBusy || S.saving) return;
    if (!S.product.id || S.dirty) await saveProduct();
    if (S.product.id && !S.dirty) showNewOrder();
  };
  q('#makeStock').onclick = async () => {
    if (!canEdit() || S.photoBusy || S.saving) return;
    if (!S.product.id || S.dirty) await saveProduct();
    if (S.product.id && !S.dirty) showNewOrder('stock');
  };
  q('#adjustStock').onclick = () => showStockAdjust(S.product);
  if (!canEdit()) return;
  qa('.filamentSelect').forEach(
    select =>
      (select.onchange = () => {
        const resource = S.resources.find(r => r.id === select.value);
        const row = select.closest('.filament-row');
        if (!resource) {
          delete row.dataset.resourceId;
          row.querySelector('.fn').readOnly = false;
          row.querySelector('.fc').disabled = false;
          refresh();
          return;
        }
        row.dataset.resourceId = resource.id;
        row.querySelector('.fn').readOnly = true;
        row.querySelector('.fc').disabled = true;
        row.querySelector('.fn').value = resource.name + (resource.material ? ' · ' + resource.material : '');
        row.querySelector('.fc').value = resource.color;
        row.querySelector('.fp').value = resource.price_per_kg;
        refresh();
      })
  );
  qa('.printerSelect').forEach(
    select =>
      (select.onchange = () => {
        const el = select.closest('.print-card'),
          resource = S.resources.find(r => r.id === select.value);
        el.querySelector('.printerLabel').value = resource?.name || '';
        el.querySelector('.printPower').value = resource?.power_kw ?? '';
        calcPrintCosts(el);
      })
  );
}
// Focus the dialog itself so no control shows a focus ring and phones don't open the keyboard.
function focusDialog(dialog) {
  dialog.tabIndex = -1;
  dialog.focus({ preventScroll: true });
}
function closeOnBackdrop(dialog) {
  dialog.addEventListener('mousedown', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      dialog.close();
  });
}
function showDialog(id, html) {
  q('#' + id)?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'quote-dialog workspace-dialog';
  dialog.innerHTML = html;
  dialog.querySelectorAll('.section-title [data-close]').forEach(b => {
    b.className = 'btn icon-btn dialog-close';
    b.setAttribute('aria-label', 'Cerrar');
    b.innerHTML = icon('x');
  });
  document.body.append(dialog);
  dialog.onclose = () => dialog.remove();
  // Forms only close with their buttons or Esc so a stray tap never loses what was typed.
  if (!dialog.querySelector('form')) closeOnBackdrop(dialog);
  dialog.showModal();
  focusDialog(dialog);
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  return dialog;
}
function fieldHtml(label, id, value = '', type = 'text', attrs = '') {
  return (
    '<div class="field"><label for="' +
    id +
    '">' +
    esc(label) +
    '</label><input id="' +
    id +
    '" type="' +
    type +
    '" value="' +
    esc(value ?? '') +
    '" ' +
    attrs +
    '></div>'
  );
}
function showResourceForm(resource) {
  if (!canEdit()) return;
  const isFilament = resource.kind === 'filament';
  const dialog = showDialog(
    'resourceDialog',
    '<div class="section-title"><h2>' +
      (isFilament ? 'Filamento' : 'Impresora') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="resourceForm" class="grid">' +
      fieldHtml('Nombre', 'resourceName', resource.name, 'text', 'required maxlength="160"') +
      (isFilament
        ? fieldHtml('Marca / material', 'resourceMaterial', resource.material) +
          fieldHtml('Color', 'resourceColor', resource.color || '#303030', 'color') +
          fieldHtml(
            'Precio por kilogramo CLP',
            'resourcePrice',
            resource.price_per_kg ?? S.settings.filament_price_per_kg,
            'number',
            'min="0" step="1" required'
          )
        : fieldHtml(
            'Potencia eléctrica kW',
            'resourcePower',
            resource.power_kw ?? S.settings.printer_power_kw,
            'number',
            'min="0" max="100" step="0.01" required'
          )) +
      '<label class="small"><input type="checkbox" id="resourceActive" ' +
      (resource.active ? 'checked' : '') +
      '> Disponible para seleccionar</label><div id="resourceFeedback" role="status" class="small"></div><button class="btn btn-primary" type="submit">Guardar recurso</button></form>'
  );
  q('#resourceForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const value = {
        name: q('#resourceName').value.trim(),
        active: q('#resourceActive').checked,
        ...(isFilament
          ? {
              material: q('#resourceMaterial').value.trim(),
              color: q('#resourceColor').value,
              price_per_kg: n(q('#resourcePrice').value)
            }
          : { power_kw: n(q('#resourcePower').value) })
      };
      // Updates may only touch the columns granted for update; workspace and kind are set once on insert.
      const query = resource.id
        ? supabase
            .from('workspace_resources')
            .update(value)
            .eq('id', resource.id)
            .eq('workspace_id', S.workspace.id)
        : supabase
            .from('workspace_resources')
            .insert({ ...value, workspace_id: S.workspace.id, kind: resource.kind });
      const { error } = await query.select().single();
      if (error) throw error;
      await loadResources();
      dialog.close();
      render();
    } catch (error) {
      q('#resourceFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
const ORDER_STATUSES = {
  pending: 'Pendiente',
  printing: 'Imprimiendo',
  assembly: 'Armado',
  ready: 'Listo',
  delivered: 'Entregado',
  canceled: 'Cancelado'
};
function orderNumbers(order) {
  const sales = n(order.quantity) * n(order.unit_price),
    net = order.iva_enabled ? sales / (1 + n(order.iva_rate)) : sales,
    actual = order.actual_cost == null ? null : n(order.actual_cost) + n(order.failures_cost);
  return {
    sales,
    net,
    estimatedProfit: net - n(order.estimated_cost),
    actualCost: actual,
    actualProfit: actual == null ? null : net - actual,
    variance: actual == null ? null : actual - n(order.estimated_cost)
  };
}
function localToday() {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}
// kind 'customer': sale to a client (optionally served from finished stock);
// kind 'stock': fabrication that adds finished units when it is marked ready.
function showNewOrder(kind = 'customer') {
  if (!canEdit() || !S.product?.id) return;
  const p = S.product,
    t = totals(),
    stock = productStock(p),
    forStock = kind === 'stock',
    grams = p.prints.reduce((s, x) => s + n(x.grams), 0),
    minutes = p.prints.reduce((s, x) => s + n(x.hours) * 60 + n(x.minutes), 0);
  const dialog = showDialog(
    'newOrderDialog',
    '<div class="section-title"><h2>' +
      (forStock ? 'Fabricar para stock' : 'Pedido de cliente') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="newOrderForm" class="grid"><b>' +
      esc(p.name) +
      '</b>' +
      (forStock
        ? '<p class="small muted">Las unidades se suman al stock del producto cuando el pedido pasa a «Listo». Los materiales se reservan ahora y se descuentan al terminar.</p>'
        : fieldHtml(
            'Cliente / referencia',
            'orderCustomer',
            '',
            'text',
            'list="customerList" autocomplete="off"'
          ) + customerOptions()) +
      '<div class="grid grid-2">' +
      fieldHtml('Cantidad', 'orderQty', forStock ? 1 : t.qty, 'number', 'min="1" step="1" required') +
      (forStock
        ? ''
        : fieldHtml(
            'Precio final por unidad',
            'orderPrice',
            t.rounded,
            'number',
            'min="0" step="1" required'
          )) +
      fieldHtml(forStock ? 'Fecha objetivo' : 'Fecha de entrega', 'orderDue', '', 'date') +
      '</div>' +
      (forStock
        ? '<label class="check-row"><input type="checkbox" id="orderAlreadyMade"> <span><b>Ya está fabricado</b><span class="small muted">Descuenta el filamento y suma las unidades al stock ahora.</span></span></label>'
        : stock.available > 0
          ? '<label class="check-row"><input type="checkbox" id="orderFromStock"> <span><b>Entregar desde stock</b><span class="small muted">' +
            stock.available +
            (stock.available === 1 ? ' unidad disponible' : ' unidades disponibles') +
            '. No reserva materiales: descuenta unidades terminadas al entregar.</span></span></label>'
          : '') +
      (forStock ? '' : depositField()) +
      '<details class="print-advanced"><summary>Revisar estimación del lote</summary><p class="small muted">Se ajusta proporcionalmente al cambiar la cantidad. Verifica tiempos y costos si imprimes varias piezas en una misma cama.</p><div class="grid grid-2">' +
      fieldHtml(
        'Costo estimado del lote',
        'orderEstimate',
        forStock ? Math.round(t.total / t.qty) : t.total,
        'number',
        'min="0" step="0.01" required'
      ) +
      fieldHtml(
        'Gramos estimados',
        'orderGrams',
        forStock ? Math.round((grams / t.qty) * 100) / 100 : grams,
        'number',
        'min="0" step="0.01"'
      ) +
      fieldHtml(
        'Horas estimadas',
        'orderHours',
        forStock ? Math.round((minutes / 60 / t.qty) * 100) / 100 : minutes / 60,
        'number',
        'min="0" step="0.01"'
      ) +
      '</div></details><div class="field"><label for="orderNotes">Notas de producción</label><textarea id="orderNotes"></textarea></div><p class="small muted">Se guardará una copia del precio y la estimación. Cambiar el producto después no altera este pedido.</p><div class="small" id="orderFeedback" role="status"></div><button class="btn btn-primary" type="submit">' +
      (forStock ? 'Confirmar fabricación' : 'Confirmar pedido') +
      '</button></form>'
  );
  const fromStock = () => !!q('#orderFromStock')?.checked;
  q('#orderQty').oninput = () => {
    const ratio = Math.max(1, n(q('#orderQty').value)) / t.qty;
    q('#orderEstimate').value = Math.round(t.total * ratio);
    q('#orderGrams').value = Math.round(grams * ratio * 100) / 100;
    q('#orderHours').value = Math.round((minutes / 60) * ratio * 100) / 100;
    updateNewOrderStock();
  };
  mountNewOrderInventory();
  q('#orderFromStock')?.addEventListener('change', () => {
    q('#newOrderStock').closest('.notice').hidden = fromStock();
    q('#orderQty').max = fromStock() ? stock.available : '';
  });
  q('#newOrderForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    const qty = Math.max(1, Math.floor(n(q('#orderQty').value))),
      made = forStock && q('#orderAlreadyMade').checked;
    try {
      const customer_id = forStock ? null : await ensureCustomer(q('#orderCustomer').value);
      const { data, error } = await supabase
        .from('production_orders')
        .insert({
          workspace_id: S.workspace.id,
          product_id: p.id,
          title: p.name,
          ...(customer_id ? { customer_id } : {}),
          kind,
          from_stock: fromStock(),
          customer_name: forStock ? '' : q('#orderCustomer').value.trim(),
          quantity: qty,
          unit_price: forStock ? 0 : n(q('#orderPrice').value),
          iva_enabled: p.iva_enabled,
          iva_rate: p.iva_rate,
          estimated_cost: n(q('#orderEstimate').value),
          estimated_grams: fromStock() ? 0 : n(q('#orderGrams').value),
          estimated_minutes: fromStock() ? 0 : n(q('#orderHours').value) * 60,
          due_date: q('#orderDue').value || null,
          notes: q('#orderNotes').value.trim()
        })
        .select()
        .single();
      if (error) throw error;
      if (!forStock) await saveDeposit(data);
      if (made) {
        const { error: readyError } = await supabase
          .from('production_orders')
          .update({ status: 'ready' })
          .eq('id', data.id);
        if (readyError) throw readyError;
      }
      dialog.close();
      await Promise.all([loadResources(), refreshProductStock(p.id)]);
      S.orderFilter = made ? 'all' : 'open';
      await goMode('production');
      S.msg = made
        ? qty +
          (qty === 1 ? ' unidad sumada' : ' unidades sumadas') +
          ' al stock de ' +
          p.name +
          '. Filamento descontado.'
        : forStock
          ? 'Fabricación creada. Al marcarla «Lista» se suma al stock.'
          : 'Pedido creado.';
      render();
    } catch (error) {
      q('#orderFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  return dialog;
}
function showOrder(order) {
  const t = orderNumbers(order);
  const dialog = showDialog(
    'orderDialog',
    '<div class="section-title"><h2>Pedido PED-' +
      order.order_no +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><div class="order-head"><div><b>' +
      esc(order.title) +
      '</b>' +
      orderChip(order) +
      '</div>' +
      (order.kind === 'stock'
        ? '<span class="chip c-stock">Fabricación para stock</span>'
        : '<button class="btn btn-secondary btn-sm" id="orderQuote" type="button">' +
          icon('file-text') +
          'Cotización</button>') +
      '</div><dl class="facts"><div><dt>Cliente</dt><dd>' +
      esc(orderCustomer(order)) +
      '</dd></div><div><dt>Cantidad</dt><dd>' +
      order.quantity +
      ' un.</dd></div><div><dt>Entrega</dt><dd class="' +
      (orderIsLate(order) ? 'down' : '') +
      '">' +
      shortDate(order.due_date) +
      '</dd></div>' +
      (order.kind === 'stock'
        ? '<div><dt>Costo estimado</dt><dd>' +
          clp(order.estimated_cost) +
          '</dd></div><div><dt>Costo por unidad</dt><dd>' +
          clp(n(order.estimated_cost) / Math.max(1, n(order.quantity))) +
          '</dd></div><div><dt>Stock</dt><dd>' +
          (order.stock_state === 'added' ? 'Sumado' : 'Al quedar listo') +
          '</dd></div>'
        : '<div><dt>Venta</dt><dd>' +
          clp(t.sales) +
          '</dd></div><div><dt>Costo estimado</dt><dd>' +
          clp(order.estimated_cost) +
          '</dd></div><div><dt>Utilidad estimada</dt><dd class="' +
          (t.estimatedProfit < 0 ? 'down' : 'up') +
          '">' +
          clp(t.estimatedProfit) +
          '</dd></div>') +
      '</dl>' +
      (order.from_stock
        ? '<p class="notice small">Se entrega desde el stock de producto terminado: al marcarlo «Listo» o «Entregado» se descuentan ' +
          order.quantity +
          ' un. del stock; no consume materiales.</p>'
        : '') +
      '</div><form id="orderForm" class="grid"><div class="field"><label for="orderStatus">Estado</label><select id="orderStatus">' +
      Object.entries(ORDER_STATUSES)
        .map(([key, label]) => '<option value="' + key + '">' + label + '</option>')
        .join('') +
      '</select></div>' +
      fieldHtml('Entrega', 'actualDue', order.due_date, 'date') +
      '<h3 class="form-section">Costos reales del lote</h3><p class="small muted">Déjalos vacíos mientras estén pendientes. Las fallas se suman aparte.</p><div class="grid grid-2">' +
      fieldHtml(
        'Costo real base del lote CLP',
        'actualCost',
        order.actual_cost,
        'number',
        'min="0" step="0.01"'
      ) +
      fieldHtml(
        'Costo adicional por fallas CLP',
        'failuresCost',
        order.failures_cost,
        'number',
        'min="0" step="0.01"'
      ) +
      fieldHtml('Gramos reales totales', 'actualGrams', order.actual_grams, 'number', 'min="0" step="0.01"') +
      fieldHtml(
        'Horas reales',
        'actualHours',
        order.actual_minutes == null ? '' : n(order.actual_minutes) / 60,
        'number',
        'min="0" step="0.01"'
      ) +
      '</div><div id="actualResult" class="notice small" role="status"></div><div class="field"><label for="actualNotes">Notas</label><textarea id="actualNotes">' +
      esc(order.notes) +
      '</textarea></div><div id="actualFeedback" class="small" role="status"></div>' +
      (canEdit() ? '<button class="btn btn-primary" type="submit">Guardar avance</button>' : '') +
      '</form>'
  );
  if (q('#orderQuote'))
    q('#orderQuote').onclick = () =>
      showQuote({
        folio: 'PED-' + order.order_no,
        client: order.customer_name || '',
        name: order.title,
        description: '',
        photo: photoSrc(S.products.find(p => p.id === order.product_id)),
        quantity: order.quantity,
        price: n(order.unit_price),
        ivaEnabled: order.iva_enabled,
        ivaRate: n(order.iva_rate),
        ...(order.due_date
          ? { delivery: 'Entrega estimada: ' + order.due_date.split('-').reverse().join('/') }
          : {})
      });
  q('#orderStatus').value = order.status;
  const getActual = () => ({
    actual_cost: q('#actualCost').value === '' ? null : n(q('#actualCost').value),
    failures_cost: n(q('#failuresCost').value),
    actual_grams: q('#actualGrams').value === '' ? null : n(q('#actualGrams').value),
    actual_minutes: q('#actualHours').value === '' ? null : n(q('#actualHours').value) * 60
  });
  const refreshActual = () => {
    const result = orderNumbers({ ...order, ...getActual() });
    q('#actualResult').textContent =
      result.actualCost == null
        ? 'Completa el costo real base para calcular la utilidad.'
        : 'Costo real total: ' +
          clp(result.actualCost) +
          ' · Desviación de costo: ' +
          clp(result.variance) +
          ' · Utilidad real: ' +
          clp(result.actualProfit);
  };
  refreshActual();
  mountOrderInventory(order);
  mountOrderPayments(order, dialog);
  if (!canEdit()) {
    dialog.querySelectorAll('form input,form select,form textarea').forEach(el => (el.disabled = true));
    return;
  }
  dialog.querySelectorAll('input').forEach(el => (el.oninput = refreshActual));
  q('#orderForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const { error } = await supabase
        .from('production_orders')
        .update({
          ...getActual(),
          status: q('#orderStatus').value,
          due_date: q('#actualDue').value || null,
          notes: q('#actualNotes').value.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)
        .eq('workspace_id', S.workspace.id)
        .select()
        .single();
      if (error) throw error;
      await loadOrders();
      await loadResources();
      dialog.close();
      render();
    } catch (error) {
      q('#actualFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
function bindV12() {
  q('#quote').onclick = showQuote;
  if (!canEdit()) return;
  q('#photoFile').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    S.photoBusy = true;
    q('#save').disabled = true;
    try {
      const data = await optimizePhoto(file);
      collect();
      S.product.photo_data = data;
      S.dirty = true;
      render();
    } catch (error) {
      S.err = error.message;
      render();
    } finally {
      S.photoBusy = false;
      if (q('#save')) q('#save').disabled = false;
    }
  };
  q('#removePhoto').onclick = () => {
    collect();
    S.product.photo_data = null;
    S.product.photo_path = null;
    S.dirty = true;
    render();
  };
  qa('.dupP').forEach(
    (b, i) =>
      (b.onclick = () => {
        collect();
        S.product.prints.splice(i + 1, 0, structuredClone(S.product.prints[i]));
        S.dirty = true;
        render();
      })
  );
  qa('.addF').forEach(
    b =>
      (b.onclick = () => {
        collect();
        const i = qa('.print-card').indexOf(b.closest('.print-card')),
          p = S.product.prints[i];
        p.filaments ??= [];
        if (p.filaments.length >= 7) return;
        const first = !p.filaments.length;
        p.filaments.push({
          name: first ? 'Filamento 1' : 'Filamento ' + (p.filaments.length + 1),
          color: '#303030',
          grams: first ? n(p.grams) : 0,
          purge_grams: 0,
          price_per_kg:
            first && n(p.grams) > 0 && n(p.filament_cost) > 0
              ? Math.round((n(p.filament_cost) * 1000) / n(p.grams))
              : n(S.settings.filament_price_per_kg)
        });
        const total = filamentTotals(p.filaments);
        p.grams = total.grams;
        p.filament_cost = Math.round(total.cost);
        S.dirty = true;
        render();
        const rows = qa('.print-card')[i]?.querySelectorAll('.filament-row');
        if (rows?.length && activeResources('filament').length) showFilamentPicker(rows[rows.length - 1]);
      })
  );
  qa('.rmF').forEach(
    b =>
      (b.onclick = () => {
        const card = b.closest('.print-card'),
          i = qa('.print-card').indexOf(card),
          j = [...card.querySelectorAll('.filament-row')].indexOf(b.closest('.filament-row'));
        collect();
        const p = S.product.prints[i];
        p.filaments.splice(j, 1);
        const f = filamentTotals(p.filaments);
        p.grams = f.grams;
        p.filament_cost = Math.round(f.cost);
        S.dirty = true;
        render();
      })
  );
}
async function optimizePhoto(file) {
  if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name))
    throw Error('Selecciona una imagen.');
  if (file.size > 20 * 1024 * 1024) throw Error('La foto supera 20 MB. Usa una imagen más pequeña.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const x = new Image();
      x.onload = () => resolve(x);
      x.onerror = () => reject(Error('No se pudo abrir la foto. Usa JPEG, PNG o WebP.'));
      x.src = url;
    });
    const canvas = document.createElement('canvas'),
      scale = Math.min(1, 800 / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (validPhoto(data)) return data;
    }
    throw Error('No se pudo optimizar la foto. Prueba una imagen más simple.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
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
// V1.4: counted inventory, durable material recipes and atomic order stock.
const INVENTORY_UNITS = {
  un: 'unidades',
  hoja: 'hojas',
  m: 'metros',
  g: 'gramos',
  kg: 'kilogramos',
  l: 'litros'
};
const stockNumber = v => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(n(v));
const preciseCost = v =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 3 }).format(
    n(v)
  );
const availableStock = r => n(r.stock_qty) - n(r.reserved_qty);
function inventoryItems() {
  return S.resources.filter(r => r.kind !== 'printer');
}
function inventoryLow() {
  return inventoryItems().filter(r => r.active && r.counted && availableStock(r) <= n(r.min_stock));
}
function mountInventoryAlert() {
  q('#inventoryAlert')?.remove();
  if (S.mode !== 'production') return;
  const low = inventoryLow(),
    uncounted = inventoryItems().filter(r => r.active && !r.counted);
  if (!low.length && !uncounted.length) return;
  const el = document.createElement('button');
  el.id = 'inventoryAlert';
  el.className = 'notice inventory-alert';
  el.textContent =
    (low.length
      ? low.length + (low.length === 1 ? ' material con stock bajo. ' : ' materiales con stock bajo. ')
      : '') +
    (uncounted.length
      ? uncounted.length + (uncounted.length === 1 ? ' pendiente' : ' pendientes') + ' de conteo inicial. '
      : '') +
    'Revisar inventario →';
  el.onclick = () => goMode('inventory');
  q('main')?.prepend(el);
}
function showInventoryForm(r = { kind: 'supply', active: true, unit: 'un' }) {
  if (!canEdit()) return;
  const dialog = showDialog(
    'inventoryFormDialog',
    '<div class="section-title"><h2>' +
      (r.id ? 'Editar material' : 'Nuevo material') +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="inventoryForm" class="grid"><div class="field"><label for="invKind">Tipo</label><select id="invKind" ' +
      (r.id ? 'disabled' : '') +
      '><option value="supply">Material / insumo</option><option value="filament">Filamento</option></select></div>' +
      fieldHtml('Nombre', 'invName', r.name, 'text', 'required maxlength="160"') +
      fieldHtml('Marca / material / referencia', 'invMaterial', r.material) +
      '<div class="grid grid-2"><div class="field"><label for="invUnit">Unidad de control</label><select id="invUnit" ' +
      (r.counted ? 'disabled' : '') +
      '>' +
      Object.entries(INVENTORY_UNITS)
        .map(([k, v]) => '<option value="' + k + '">' + v + '</option>')
        .join('') +
      '</select></div>' +
      fieldHtml('Color', 'invColor', r.color || '#303030', 'color') +
      fieldHtml(
        r.kind === 'filament' ? 'Precio por kg CLP' : 'Costo por unidad de control CLP',
        'invCost',
        r.kind === 'filament' ? Math.round(n(r.price_per_kg) * 100) / 100 : (r.unit_cost ?? 0),
        'number',
        'min="0" max="1000000000" step="0.001" required'
      ) +
      fieldHtml(
        'Stock mínimo de alerta',
        'invMin',
        r.min_stock ?? 0,
        'number',
        'min="0" max="1000000000" step="0.001" required'
      ) +
      '</div><p class="small muted">' +
      (r.counted
        ? 'Las compras promedian el costo automáticamente; aquí puedes corregirlo. Los productos toman el nuevo precio al usar «Actualizar precios». Para corregir una existencia utiliza Movimiento.'
        : 'Después de guardar podrás registrar la cantidad inicial contada y su costo.') +
      '</p><label class="small"><input id="invActive" type="checkbox" ' +
      (r.active ? 'checked' : '') +
      '> Disponible para nuevos productos y pedidos</label><div id="invFeedback" role="status" class="small"></div><button class="btn btn-primary" type="submit">Guardar material</button></form>'
  );
  q('#invKind').value = r.kind;
  q('#invUnit').value = r.unit || 'un';
  const updateKind = () => {
    q('label[for=invCost]').textContent =
      q('#invKind').value === 'filament' ? 'Precio por kg CLP' : 'Costo por unidad de control CLP';
    if (q('#invKind').value === 'filament') {
      q('#invUnit').value = 'g';
      q('#invUnit').disabled = true;
    } else q('#invUnit').disabled = !!r.counted;
  };
  updateKind();
  q('#invKind').onchange = updateKind;
  q('#inventoryForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    b.disabled = true;
    try {
      const kind = q('#invKind').value,
        cost = n(q('#invCost').value),
        v = {
          name: q('#invName').value.trim(),
          material: q('#invMaterial').value.trim(),
          unit: kind === 'filament' ? 'g' : q('#invUnit').value,
          color: q('#invColor').value,
          min_stock: n(q('#invMin').value),
          active: q('#invActive').checked,
          unit_cost: kind === 'filament' ? cost / 1000 : cost,
          price_per_kg: kind === 'filament' ? cost : 0
        };
      const query = r.id
        ? supabase.from('workspace_resources').update(v).eq('id', r.id).eq('workspace_id', S.workspace.id)
        : supabase.from('workspace_resources').insert({ ...v, kind, workspace_id: S.workspace.id });
      const { data, error } = await query.select().single();
      if (error) throw error;
      await loadResources();
      dialog.close();
      inventoryView();
      if (!r.id) showStockMovement(S.resources.find(x => x.id === data.id));
    } catch (error) {
      q('#invFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  enhanceFields();
}
function showStockMovement(r) {
  if (!canEdit()) return;
  const key = crypto.randomUUID();
  const dialog = showDialog(
    'stockDialog',
    '<div class="section-title"><h2>' +
      esc(r.name) +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><p class="small muted">Físico ' +
      stockNumber(r.stock_qty) +
      ' · Reservado ' +
      stockNumber(r.reserved_qty) +
      ' ' +
      esc(r.unit) +
      '</p><form id="stockForm" class="grid"><div class="field"><label for="stockKind">Movimiento</label><select id="stockKind">' +
      (!r.counted
        ? '<option value="opening">Conteo inicial</option>'
        : '<option value="purchase">Compra / entrada</option><option value="loss">Pérdida / merma</option><option value="adjustment">Reconteo físico</option>') +
      '</select></div><div class="grid grid-2">' +
      fieldHtml(
        'Cantidad en ' + r.unit,
        'stockQuantity',
        '',
        'number',
        'min="0" max="1000000000" step="0.001" required'
      ) +
      fieldHtml(
        'Costo total de la entrada CLP',
        'stockPrice',
        '',
        'number',
        'min="0" max="1000000000000" step="0.01" required'
      ) +
      '</div><div id="stockPreview" class="notice small" role="status"></div><div class="field"><label for="stockNote">Motivo / proveedor / referencia</label><textarea id="stockNote" required maxlength="1000"></textarea></div><div id="stockFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Registrar movimiento</button></form>'
  );
  const preview = () => {
    const kind = q('#stockKind').value,
      qty = n(q('#stockQuantity').value),
      costed = ['opening', 'purchase'].includes(kind);
    q('#stockPrice').closest('.field').hidden = !costed;
    q('#stockPrice').required = costed;
    q('#stockPreview').textContent =
      kind === 'adjustment'
        ? 'Ingresa el stock físico contado. Se registrará la diferencia: ' +
          stockNumber(qty - n(r.stock_qty)) +
          ' ' +
          r.unit +
          '.'
        : kind === 'loss'
          ? 'Se descontarán ' + stockNumber(qty) + ' ' + r.unit + ' del stock disponible.'
          : 'Cantidad en ' +
            r.unit +
            '; costo unitario: ' +
            preciseCost(qty > 0 ? n(q('#stockPrice').value) / qty : n(r.unit_cost)) +
            ' / ' +
            r.unit +
            '.';
  };
  q('#stockKind').onchange = preview;
  q('#stockQuantity').oninput = preview;
  q('#stockPrice').oninput = preview;
  preview();
  q('#stockForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      const kind = q('#stockKind').value,
        qty = n(q('#stockQuantity').value),
        quantity = kind === 'adjustment' ? qty - n(r.stock_qty) : kind === 'loss' ? -qty : qty;
      if (kind !== 'opening' && quantity === 0) throw Error('La cantidad no produce un movimiento.');
      const cost =
        ['opening', 'purchase'].includes(kind) && qty > 0 ? n(q('#stockPrice').value) / qty : n(r.unit_cost);
      const { error } = await supabase.from('inventory_movements').insert({
        workspace_id: S.workspace.id,
        resource_id: r.id,
        kind,
        quantity,
        unit_cost: cost,
        note: q('#stockNote').value.trim(),
        request_key: key
      });
      if (error && error.code !== '23505') throw error;
      await loadResources();
      dialog.close();
      inventoryView();
    } catch (error) {
      q('#stockFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  enhanceFields();
}
async function showInventoryLedger(r) {
  const dialog = showDialog(
    'ledgerDialog',
    '<div class="section-title"><h2>Historial · ' +
      esc(r.name) +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><div id="ledgerBody" role="status">Cargando movimientos…</div>'
  );
  try {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('workspace_id', S.workspace.id)
      .eq('resource_id', r.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    if (!dialog.isConnected) return;
    const kinds = {
      opening: 'Conteo inicial',
      purchase: 'Compra',
      adjustment: 'Reconteo',
      loss: 'Merma',
      consumption: 'Producción'
    };
    q('#ledgerBody').innerHTML =
      (data || [])
        .map(
          m =>
            '<div class="resource-row"><div><b>' +
            kinds[m.kind] +
            ' · ' +
            stockNumber(m.quantity) +
            ' ' +
            esc(r.unit) +
            '</b><div class="small muted">' +
            esc(new Date(m.created_at).toLocaleString('es-CL')) +
            ' · ' +
            preciseCost(m.unit_cost) +
            ' / ' +
            esc(r.unit) +
            '</div><p class="small">' +
            esc(m.note) +
            '</p></div></div>'
        )
        .join('') || 'Sin movimientos. El stock aún no ha sido contado.';
  } catch (error) {
    if (dialog.isConnected) q('#ledgerBody').textContent = error.message;
  }
}
function collectMaterials() {
  if (!S.product || !q('#materialRecipe')) return;
  S.product.materials = qa('.recipe-row').map(row => ({
    resource_id: row.dataset.resourceId,
    name: row.dataset.name,
    unit: row.dataset.unit,
    unit_cost: n(row.dataset.unitCost),
    quantity: Math.max(0, n(row.querySelector('.recipeQty').value))
  }));
}
function recipeRequirements(p = S.product, quantity = p.quantity) {
  const map = new Map(),
    ratio = n(quantity) / Math.max(1, n(p.quantity));
  const add = (id, qty) => {
    if (id && qty > 0) map.set(id, (map.get(id) || 0) + qty * ratio);
  };
  for (const m of p.materials || []) add(m.resource_id, n(m.quantity));
  for (const print of p.prints || [])
    for (const f of print.filaments || []) add(f.resource_id, n(f.grams) + n(f.purge_grams));
  return [...map].map(([id, qty]) => ({ id, quantity: qty, resource: S.resources.find(r => r.id === id) }));
}
function stockRequirementsMarkup(requirements) {
  return (
    requirements
      .map(x => {
        const r = x.resource,
          bad = !r || !r.active || !r.counted || availableStock(r) < x.quantity;
        return (
          '<div class="resource-row small ' +
          (bad ? 'loss-text' : '') +
          '"><span>' +
          esc(r?.name || 'Material no disponible') +
          '</span><b>' +
          stockNumber(x.quantity) +
          ' ' +
          esc(r?.unit || '') +
          ' / ' +
          (!r?.counted ? 'sin contar' : stockNumber(availableStock(r)) + ' disponibles') +
          '</b></div>'
        );
      })
      .join('') ||
    '<p class="small muted">Sin materiales vinculados al inventario. Los costos manuales no reservan existencias.</p>'
  );
}
function mountNewOrderInventory() {
  const box = document.createElement('section');
  box.className = 'notice';
  box.innerHTML =
    '<b>Reserva de materiales</b><div id="newOrderStock"></div><p class="small muted">Se reservarán al confirmar el pedido. Si falta stock o el conteo inicial, el pedido no se creará.</p>';
  q('#orderFeedback').before(box);
  updateNewOrderStock();
}
function updateNewOrderStock() {
  if (q('#newOrderStock'))
    q('#newOrderStock').innerHTML = stockRequirementsMarkup(
      recipeRequirements(S.product, Math.max(1, n(q('#orderQty').value)))
    );
}
function setupInventoryProduct() {
  const box = document.createElement('section');
  box.id = 'materialRecipe';
  box.className = 'card recipe-card';
  box.innerHTML =
    '<div class="section-title"><h2>Materiales del lote</h2><button type="button" id="addRecipe" class="btn btn-secondary">' +
    icon('plus') +
    'Material</button></div><p class="small muted">Cantidades para ' +
    (Math.max(1, n(S.product.quantity)) === 1 ? '1 unidad' : 'las ' + n(S.product.quantity) + ' unidades') +
    ' del lote. Se suman a los costos directos; los filamentos se vinculan en Impresiones.</p><div class="grid">' +
    (S.product.materials || [])
      .map(
        (m, i) =>
          '<div class="recipe-row" data-resource-id="' +
          esc(m.resource_id) +
          '" data-name="' +
          esc(m.name) +
          '" data-unit="' +
          esc(m.unit) +
          '" data-unit-cost="' +
          n(m.unit_cost) +
          '"><div><b>' +
          esc(m.name) +
          '</b><div class="small muted">' +
          preciseCost(m.unit_cost) +
          ' / ' +
          esc(m.unit) +
          '</div></div><div class="field"><label>Cantidad (' +
          esc(m.unit) +
          ')</label><input class="recipeQty" type="number" min="0" step="0.001" value="' +
          n(m.quantity) +
          '"></div><b class="recipeSubtotal">' +
          clp(n(m.quantity) * n(m.unit_cost)) +
          '</b><button class="btn icon-btn" data-remove-material="' +
          i +
          '" type="button" aria-label="Quitar material" title="Quitar material">' +
          icon('trash-2') +
          '</button></div>'
      )
      .join('') +
    '</div><button id="refreshMaterialPrices" type="button" class="btn btn-secondary">Actualizar precios desde inventario</button><details><summary>Disponibilidad para este lote</summary><div id="recipeStock"></div></details>';
  q('[data-panel="costs"]').prepend(box);
  updateMaterialStatus();
  qa('.filament-row').forEach(row => {
    if (row.dataset.resourceId) {
      row.querySelector('.fn').readOnly = true;
      row.querySelector('.fc').disabled = true;
    }
  });
}
function updateMaterialStatus() {
  if (!q('#materialRecipe')) return;
  qa('.recipe-row').forEach(
    row =>
      (row.querySelector('.recipeSubtotal').textContent = clp(
        n(row.querySelector('.recipeQty').value) * n(row.dataset.unitCost)
      ))
  );
  q('#recipeStock').innerHTML = stockRequirementsMarkup(recipeRequirements());
}
function bindInventoryProduct() {
  if (!canEdit()) return;
  q('#addRecipe').onclick = () => {
    collect();
    const choices = activeResources('supply');
    if (!choices.length) {
      showDialog(
        'recipeDialog',
        '<h2>Agrega materiales al inventario</h2><p>Registra tus marcos, papel y otros insumos en Inventario. Tu producto se conserva como borrador.</p><button class="btn btn-primary" data-close>Volver</button>'
      );
      return;
    }
    const dialog = showDialog(
      'recipeDialog',
      '<div class="section-title"><h2>Material del inventario</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="recipeForm" class="grid"><div class="field"><label for="recipeSelect">Material</label><select id="recipeSelect">' +
        choices
          .map(
            r =>
              '<option value="' +
              r.id +
              '">' +
              esc(r.name) +
              ' · ' +
              preciseCost(r.unit_cost) +
              ' / ' +
              r.unit +
              '</option>'
          )
          .join('') +
        '</select></div>' +
        fieldHtml('Cantidad para el lote', 'recipeAmount', 1, 'number', 'min="0.001" step="0.001" required') +
        '<button class="btn btn-primary" type="submit">Agregar material</button></form>'
    );
    q('#recipeForm').onsubmit = e => {
      e.preventDefault();
      const r = choices.find(x => x.id === q('#recipeSelect').value);
      S.product.materials ??= [];
      S.product.materials.push({
        resource_id: r.id,
        name: r.name,
        unit: r.unit,
        unit_cost: n(r.unit_cost),
        quantity: n(q('#recipeAmount').value)
      });
      S.dirty = true;
      dialog.close();
      render();
    };
  };
  qa('[data-remove-material]').forEach(
    b =>
      (b.onclick = () => {
        collect();
        S.product.materials.splice(n(b.dataset.removeMaterial), 1);
        S.dirty = true;
        render();
      })
  );
  q('#refreshMaterialPrices').onclick = async () => {
    const b = q('#refreshMaterialPrices');
    b.disabled = true;
    try {
      collect();
      await loadResources();
      for (const m of S.product.materials || []) {
        const r = S.resources.find(x => x.id === m.resource_id);
        if (r) {
          m.unit_cost = n(r.unit_cost);
          m.name = r.name;
          m.unit = r.unit;
        }
      }
      for (const p of S.product.prints)
        for (const f of p.filaments || []) {
          const r = S.resources.find(x => x.id === f.resource_id);
          if (r) f.price_per_kg = n(r.price_per_kg);
        }
      for (const p of S.product.prints)
        if (p.filaments?.length) p.filament_cost = Math.round(filamentTotals(p.filaments).cost);
      S.dirty = true;
      render();
    } catch (error) {
      S.err = error.message;
      render();
    } finally {
      b.disabled = false;
    }
  };
}
async function mountOrderInventory(order) {
  const dialog = q('#orderDialog');
  if (!dialog) return;
  const box = document.createElement('section');
  box.className = 'order-inventory';
  box.innerHTML = '<h3>Materiales y stock</h3><div role="status">Cargando reserva…</div>';
  q('#orderForm').before(box);
  try {
    const { data: lines, error } = await supabase
      .from('inventory_order_lines')
      .select('*')
      .eq('workspace_id', S.workspace.id)
      .eq('order_id', order.id)
      .order('name');
    if (error) throw error;
    if (!dialog.isConnected) return;
    const states = {
      none: 'Sin reserva de inventario',
      reserved: 'Reservado · pendiente de consumo',
      consumed: 'Consumo registrado',
      released: 'Reserva liberada'
    };
    box.innerHTML =
      '<h3>Materiales y stock</h3><p class="small"><b>' +
      states[order.inventory_state || 'none'] +
      '</b></p>' +
      (lines || [])
        .map(
          l =>
            '<div class="resource-row small"><span>' +
            esc(l.name) +
            '</span><b>' +
            stockNumber(l.consumed_qty ?? l.quantity) +
            ' ' +
            esc(l.unit) +
            '</b></div>'
        )
        .join('') +
      (order.inventory_state === 'reserved' && canEdit()
        ? '<button id="consumeOrder" class="btn btn-secondary" type="button">Confirmar consumo real</button><p class="small muted">Puedes ajustar las cantidades incluyendo mermas. Marcar Listo o Entregado consume la reserva automáticamente si aún no se confirmó.</p>'
        : order.inventory_state === 'none'
          ? '<p class="small muted">Pedido anterior o producto sin materiales vinculados. No descuenta stock automáticamente.</p>'
          : '');
    box.querySelector('#consumeOrder')?.addEventListener('click', () => showOrderConsumption(order, lines));
  } catch (error) {
    if (dialog.isConnected) box.textContent = 'No se pudo cargar el inventario: ' + error.message;
  }
}
function showOrderConsumption(order, lines) {
  const dialog = showDialog(
    'consumeDialog',
    '<div class="section-title"><h2>Consumo · Pedido #' +
      order.order_no +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="consumeForm" class="grid"><p class="small muted">Ingresa las cantidades realmente utilizadas, incluyendo pérdidas. El stock se descontará una sola vez. Los demás costos del pedido se conservan.</p>' +
      lines
        .map((l, i) =>
          fieldHtml(
            l.name + ' (' + l.unit + ')',
            'consumeQty' + i,
            l.quantity,
            'number',
            'min="0" max="1000000000" step="any" required'
          )
        )
        .join('') +
      '<div id="consumeFeedback" role="status" class="small"></div><button class="btn btn-primary" type="submit">Registrar consumo</button></form>'
  );
  q('#consumeForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      const actual = Object.fromEntries(lines.map((l, i) => [l.resource_id, n(q('#consumeQty' + i).value)]));
      const { error } = await supabase.rpc('inventory_consume_order', {
        p_order: order.id,
        p_actual: actual
      });
      if (error) throw error;
      await loadOrders();
      await loadResources();
      dialog.close();
      q('#orderDialog')?.close();
      render();
      showOrder(S.orders.find(o => o.id === order.id));
    } catch (error) {
      q('#consumeFeedback').textContent = error.message;
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
// Password policy. The free Supabase plan cannot reject leaked passwords on the server, so new
// passwords are checked here against Have I Been Pwned using k-anonymity: only the first five
// characters of the SHA-1 hash leave the device.
const PASSWORD_MIN = 10,
  PASSWORD_HINT =
    'Mínimo ' +
    PASSWORD_MIN +
    ' caracteres, con letras y números. Se revisa que no aparezca en filtraciones conocidas.';
function passwordProblem(pw) {
  if (pw.length < PASSWORD_MIN) return 'La contraseña debe tener al menos ' + PASSWORD_MIN + ' caracteres.';
  if (!/[a-zA-ZÀ-ÿ]/.test(pw) || !/\d/.test(pw)) return 'La contraseña debe combinar letras y números.';
  return '';
}
async function pwnedCount(pw) {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw)))]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase(),
    prefix = hash.slice(0, 5),
    suffix = hash.slice(5);
  const res = await fetch('https://api.pwnedpasswords.com/range/' + prefix);
  if (!res.ok) throw Error('HIBP ' + res.status);
  for (const line of (await res.text()).split('\n')) {
    const [s, c] = line.trim().split(':');
    if (s === suffix) return parseInt(c, 10) || 0;
  }
  return 0;
}
// The leak check fails open: if the service is unreachable, the length and character rules still apply.
async function checkNewPassword(pw) {
  const problem = passwordProblem(pw);
  if (problem) return problem;
  try {
    if ((await pwnedCount(pw)) > 0)
      return 'Esta contraseña aparece en filtraciones de datos conocidas. Elige otra distinta.';
  } catch (e) {
    console.warn('No se pudo revisar la contraseña en filtraciones', e);
  }
  return '';
}
function showPasswordDialog() {
  const dialog = showDialog(
    'passwordDialog',
    '<div class="section-title"><h2>Cambiar contraseña</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="passwordForm" class="grid"><p class="small muted">' +
      esc(PASSWORD_HINT) +
      '</p>' +
      fieldHtml(
        'Nueva contraseña',
        'newPassword',
        '',
        'password',
        'required autocomplete="new-password" minlength="' + PASSWORD_MIN + '"'
      ) +
      fieldHtml(
        'Repite la contraseña',
        'repeatPassword',
        '',
        'password',
        'required autocomplete="new-password"'
      ) +
      '<div id="passwordFeedback" role="status" class="small"></div><button class="btn btn-primary" type="submit">Guardar contraseña</button></form>'
  );
  enhanceFields();
  q('#passwordForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]'),
      feedback = q('#passwordFeedback'),
      pw = q('#newPassword').value;
    if (b.disabled) return;
    if (pw !== q('#repeatPassword').value) {
      feedback.textContent = 'Las contraseñas no coinciden.';
      return;
    }
    b.disabled = true;
    feedback.textContent = 'Revisando…';
    try {
      const problem = await checkNewPassword(pw);
      if (problem) throw Error(problem);
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      dialog.close();
      S.msg = 'Contraseña actualizada.';
      render();
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}

// Lucide icons (ISC license), inlined so the app needs no icon CDN.
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
// V1.8: saved quotes, customers and remembered screen.
// ---------------------------------------------------------------------------
const quoteFolioNo = no => 'COT-' + String(no).padStart(4, '0');
const QUOTE_STATUS = { open: 'Enviada', expired: 'Vencida', accepted: 'Aceptada', rejected: 'Rechazada' };
const QUOTE_CHIP = { open: 'c-printing', expired: 'c-late', accepted: 'c-ready', rejected: '' };
async function loadQuotes() {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('created_at', { ascending: false });
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
async function ensureCustomer(name) {
  name = String(name || '').trim();
  if (!name || !canEdit()) return null;
  const found = S.customers.find(c => sameName(c.name, name));
  if (found) return found.id;
  const { data, error } = await supabase
    .from('customers')
    .insert({ workspace_id: S.workspace.id, name: name.slice(0, 120) })
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
    cost = n(qt.unit_cost) * n(qt.quantity);
  return { total, net, profit: net - cost, margin: net > 0 && cost > 0 ? (net - cost) / net : null };
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
        '</button>'
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
      (n(qt.unit_cost) > 0 ? clp(s.profit) + (s.margin == null ? '' : ' · ' + pct(s.margin)) : '—') +
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
      depositField() +
      (product && stock.available >= qt.quantity
        ? '<label class="check-row"><input type="checkbox" id="qoFromStock"> <span><b>Entregar desde stock</b><span class="small muted">' +
          stock.available +
          ' unidades disponibles. No reserva materiales.</span></span></label>'
        : product
          ? ''
          : '<p class="notice small">El producto ya no existe: el pedido se crea sin reservar materiales.</p>') +
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
function showCustomer(c) {
  const h = c.id ? customerHistory(c) : { quotes: [], orders: [], sold: 0 },
    edit = canEdit(),
    wa = whatsappLink(c.phone);
  const dialog = showDialog(
    'customerDialog',
    '<div class="section-title"><h2>' +
      (c.id ? esc(c.name) : 'Nuevo cliente') +
      '</h2><button class="btn btn-ghost" data-close>Cerrar</button></div>' +
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
        : '')
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
// Remembers the open screen so a reload (or reopening the app) returns to it.
const VIEW_MODES = [
  'home',
  'dashboard',
  'quotes',
  'production',
  'customers',
  'reports',
  'inventory',
  'resources',
  'product'
];
const viewKey = () => 'kultiapp_view_' + (S.session?.user?.id || '');
function saveView() {
  if (!S.workspace || !VIEW_MODES.includes(S.mode)) return;
  try {
    localStorage.setItem(
      viewKey(),
      JSON.stringify({
        mode: S.mode,
        product: S.mode === 'product' ? S.product?.id || null : null,
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
    if (v.mode === 'quotes' || v.mode === 'customers') await Promise.all([loadQuotes(), loadCustomers()]);
    S.mode = v.mode;
    return true;
  } catch (e) {
    console.warn('No se pudo restaurar la vista', e);
    return false;
  }
}
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
// ---------------------------------------------------------------------------
// V2.0: deposits and balances per order, and WhatsApp messages.
// ---------------------------------------------------------------------------
const PAY_METHODS = { transfer: 'Transferencia', cash: 'Efectivo', card: 'Tarjeta', other: 'Otro' };
async function loadPayments() {
  const { data, error } = await supabase
    .from('order_payments')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('paid_on', { ascending: true });
  if (error) throw error;
  S.payments = data || [];
}
function orderPayments(o) {
  return (S.payments || []).filter(p => p.order_id === o.id);
}
// Stock fabrication and canceled orders owe nothing.
function orderBalance(o) {
  const total = o.kind === 'stock' ? 0 : Math.round(orderNumbers(o).sales),
    paid = orderPayments(o).reduce((s, p) => s + n(p.amount), 0),
    due = o.kind === 'stock' || o.status === 'canceled' ? 0 : Math.max(0, total - paid);
  return {
    total,
    paid,
    due,
    state: total <= 0 ? 'none' : paid <= 0 ? 'unpaid' : due > 0 ? 'partial' : 'paid'
  };
}
const PAY_CHIP = {
  unpaid: ['c-late', 'Sin pago'],
  partial: ['c-printing', 'Abonado'],
  paid: ['c-ready', 'Pagado']
};
function payChip(o) {
  const b = orderBalance(o);
  if (b.state === 'none' || o.status === 'canceled') return '';
  return '<span class="chip ' + PAY_CHIP[b.state][0] + '"><i></i>' + PAY_CHIP[b.state][1] + '</span>';
}
function receivables() {
  return S.orders.filter(o => orderBalance(o).due > 0);
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
function orderMessage(o, kind) {
  const b = orderBalance(o),
    hi = firstName(o.customer_name),
    who = 'Hola' + (hi ? ' ' + hi : ''),
    ref = 'PED-' + o.order_no + ' (' + o.title + ')';
  if (kind === 'ready')
    return (
      who +
      ', tu pedido ' +
      ref +
      ' ya está listo.' +
      (b.due > 0 ? ' Saldo pendiente: ' + clp(b.due) + '.' : '') +
      ' ¿Coordinamos la entrega?'
    );
  if (kind === 'paid') {
    const last = orderPayments(o).at(-1);
    return (
      who +
      ', recibimos tu pago' +
      (last ? ' de ' + clp(last.amount) : '') +
      ' del pedido ' +
      ref +
      '. ' +
      (b.due > 0 ? 'Saldo pendiente: ' + clp(b.due) + '.' : 'Tu pedido quedó pagado.') +
      ' ¡Gracias!'
    );
  }
  return (
    who +
    ', te recuerdo el saldo de tu pedido ' +
    ref +
    ': ' +
    clp(b.due) +
    ' (total ' +
    clp(b.total) +
    ', abonado ' +
    clp(b.paid) +
    '). ¡Gracias!'
  );
}
async function addPayment(order, amount, method = 'transfer', paidOn = null, note = '') {
  const { error } = await supabase.from('order_payments').insert({
    workspace_id: S.workspace.id,
    order_id: order.id,
    amount: Math.round(n(amount)),
    method,
    note: note.slice(0, 300),
    ...(paidOn ? { paid_on: paidOn } : {})
  });
  if (error) throw error;
  await loadPayments();
}
function paymentsMarkup(order) {
  const b = orderBalance(order),
    list = orderPayments(order),
    ratio = b.total > 0 ? Math.min(1, b.paid / b.total) : 0;
  return (
    '<div class="pay-head"><h3>Pagos</h3>' +
    payChip(order) +
    '</div><div class="pay-sum"><div><span>Total</span><b>' +
    clp(b.total) +
    '</b></div><div><span>Pagado</span><b class="up">' +
    clp(b.paid) +
    '</b></div><div><span>Saldo</span><b class="' +
    (b.due > 0 ? 'warn' : '') +
    '">' +
    clp(b.due) +
    '</b></div></div><div class="pay-bar"><i style="width:' +
    Math.round(ratio * 100) +
    '%"></i></div>' +
    (list.length
      ? '<div class="pay-list">' +
        list
          .map(
            p =>
              '<div class="pay-row"><span><b>' +
              new Date(p.paid_on + 'T12:00').toLocaleDateString('es-CL') +
              '</b> · ' +
              PAY_METHODS[p.method] +
              (p.note ? ' · ' + esc(p.note) : '') +
              '</span><b class="num">' +
              clp(p.amount) +
              '</b>' +
              (canEdit()
                ? '<button type="button" class="btn icon-btn" data-del-payment="' +
                  p.id +
                  '" aria-label="Eliminar pago" title="Eliminar pago">' +
                  icon('trash-2') +
                  '</button>'
                : '') +
              '</div>'
          )
          .join('') +
        '</div>'
      : '<p class="small muted">Sin pagos registrados.</p>') +
    (canEdit() && b.due > 0 && order.status !== 'canceled'
      ? '<details class="pay-add"' +
        (list.length ? '' : ' open') +
        '><summary class="btn btn-secondary btn-sm">' +
        icon('plus') +
        'Registrar pago</summary><form id="payForm" class="pay-form"><div class="grid grid-2">' +
        fieldHtml('Monto recibido', 'payAmount', b.due, 'number', 'min="1" step="1" required') +
        '<div class="field"><label for="payMethod">Medio</label><select id="payMethod">' +
        Object.entries(PAY_METHODS)
          .map(([k, v]) => '<option value="' + k + '">' + v + '</option>')
          .join('') +
        '</select></div>' +
        fieldHtml('Fecha', 'payDate', new Date().toLocaleDateString('sv-SE'), 'date', 'required') +
        fieldHtml('Nota', 'payNote', '', 'text', 'maxlength="300" placeholder="Ej. abono 50%"') +
        '</div><div class="row pay-quick">' +
        (b.paid <= 0
          ? '<button type="button" class="btn btn-ghost btn-sm" data-pay-fill="half">50%</button>'
          : '') +
        '<button type="button" class="btn btn-ghost btn-sm" data-pay-fill="due">Saldo completo</button><button class="btn btn-secondary" type="submit">' +
        icon('wallet') +
        'Guardar pago</button></div><div id="payFeedback" class="small" role="status"></div></form></details>'
      : '') +
    (order.kind !== 'stock'
      ? '<div class="wa-actions"><span class="small muted">Avisar por WhatsApp:</span>' +
        (['ready', 'delivered'].includes(order.status) || order.status === 'assembly'
          ? '<button type="button" class="btn btn-ghost btn-sm" data-wa="ready">' +
            icon('message-circle') +
            'Pedido listo</button>'
          : '') +
        (b.due > 0
          ? '<button type="button" class="btn btn-ghost btn-sm" data-wa="due">' +
            icon('message-circle') +
            'Recordar saldo</button>'
          : '') +
        (b.paid > 0
          ? '<button type="button" class="btn btn-ghost btn-sm" data-wa="paid">' +
            icon('message-circle') +
            'Confirmar pago</button>'
          : '') +
        '</div>'
      : '')
  );
}
function mountOrderPayments(order, dialog) {
  if (order.kind === 'stock') return;
  let box = dialog.querySelector('#orderPayments');
  if (!box) {
    box = document.createElement('section');
    box.id = 'orderPayments';
    box.className = 'pay-card';
    (dialog.querySelector('.facts') || dialog.querySelector('.order-head')).after(box);
  }
  box.innerHTML = paymentsMarkup(order);
  const b = orderBalance(order);
  box
    .querySelectorAll('[data-pay-fill]')
    .forEach(
      btn =>
        (btn.onclick = () =>
          (q('#payAmount').value = btn.dataset.payFill === 'half' ? Math.round(b.total / 2) : b.due))
    );
  box
    .querySelectorAll('[data-wa]')
    .forEach(
      btn =>
        (btn.onclick = () =>
          openWhatsApp(
            customerFor(order.customer_id, order.customer_name)?.phone,
            orderMessage(order, btn.dataset.wa)
          ))
    );
  box.querySelectorAll('[data-del-payment]').forEach(
    btn =>
      (btn.onclick = async () => {
        btn.disabled = true;
        const { error } = await supabase.from('order_payments').delete().eq('id', btn.dataset.delPayment);
        if (error) {
          btn.disabled = false;
          return toast(error.message, 'error');
        }
        S.payments = S.payments.filter(p => p.id !== btn.dataset.delPayment);
        mountOrderPayments(order, dialog);
      })
  );
  const form = box.querySelector('#payForm');
  if (form)
    form.onsubmit = async e => {
      e.preventDefault();
      const btn = e.submitter || form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await addPayment(
          order,
          q('#payAmount').value,
          q('#payMethod').value,
          q('#payDate').value,
          q('#payNote').value.trim()
        );
        toast('Pago registrado.');
        mountOrderPayments(order, dialog);
      } catch (error) {
        q('#payFeedback').textContent = error.message;
        btn.disabled = false;
      }
    };
  enhanceFields();
}
// Optional deposit field for new customer orders.
function depositField() {
  return fieldHtml(
    'Abono recibido (opcional)',
    'orderDeposit',
    '',
    'number',
    'min="0" step="1" placeholder="0"'
  );
}
async function saveDeposit(order) {
  const amount = Math.round(n(q('#orderDeposit')?.value));
  if (amount > 0) await addPayment(order, amount, 'transfer', null, 'Abono inicial');
}
// ---------------------------------------------------------------------------
// V2.1: monthly report, Excel export and data backup.
// ---------------------------------------------------------------------------
// Minimal .xlsx writer (uncompressed zip): sheets = [{ name, rows: [[cell…]…], widths? }].
// Numbers stay numeric in Excel; everything else is written as text.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder(),
    parts = [],
    central = [];
  let offset = 0;
  const u16 = v => [v & 0xff, (v >>> 8) & 0xff],
    u32 = v => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const [name, text] of files) {
    const data = enc.encode(text),
      nameBytes = enc.encode(name),
      crc = crc32(data),
      head = [
        ...u16(20),
        ...u16(0x0800),
        ...u16(0),
        ...u16(0),
        ...u16(0x21),
        ...u32(crc),
        ...u32(data.length),
        ...u32(data.length),
        ...u16(nameBytes.length),
        ...u16(0)
      ];
    parts.push(new Uint8Array([...u32(0x04034b50), ...head]), nameBytes, data);
    central.push(
      new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...head,
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset)
      ]),
      nameBytes
    );
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  return new Blob(
    [
      ...parts,
      ...central,
      new Uint8Array([
        ...u32(0x06054b50),
        ...u16(0),
        ...u16(0),
        ...u16(files.length),
        ...u16(files.length),
        ...u32(size),
        ...u32(offset),
        ...u16(0)
      ])
    ],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  );
}
const xmlEsc = s =>
  String(s ?? '')
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function colName(i) {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
function xlsxBlob(sheets) {
  const sheetXml = sh =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<cols>' +
    (sh.rows[0] || [])
      .map((_, i) => {
        const w = Math.min(
          60,
          Math.max(10, ...sh.rows.slice(0, 200).map(r => String(r[i] ?? '').length + 2))
        );
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      })
      .join('') +
    '</cols><sheetData>' +
    sh.rows
      .map(
        (row, r) =>
          '<row r="' +
          (r + 1) +
          '">' +
          row
            .map((v, c) => {
              const ref = colName(c) + (r + 1),
                style = r === 0 ? ' s="1"' : typeof v === 'number' ? ' s="2"' : '';
              if (v == null || v === '') return '';
              return typeof v === 'number' && Number.isFinite(v)
                ? '<c r="' + ref + '"' + style + '><v>' + Math.round(v * 100) / 100 + '</v></c>'
                : '<c r="' +
                    ref +
                    '" t="inlineStr"' +
                    style +
                    '><is><t xml:space="preserve">' +
                    xmlEsc(v) +
                    '</t></is></c>';
            })
            .join('') +
          '</row>'
      )
      .join('') +
    '</sheetData></worksheet>';
  const names = sheets.map((s, i) =>
    xmlEsc(
      String(s.name)
        .replace(/[\\/?*[\]:]/g, ' ')
        .slice(0, 31) || 'Hoja ' + (i + 1)
    )
  );
  return zipStore([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              '<Override PartName="/xl/worksheets/sheet' +
              (i + 1) +
              '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          )
          .join('') +
        '</Types>'
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names
          .map((nm, i) => '<sheet name="' + nm + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>')
          .join('') +
        '</sheets></workbook>'
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              '<Relationship Id="rId' +
              (i + 1) +
              '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
              (i + 1) +
              '.xml"/>'
          )
          .join('') +
        '<Relationship Id="rId' +
        (sheets.length + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
    ],
    [
      'xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    ],
    ...sheets.map((sh, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(sh)])
  ]);
}
// ---- Monthly report -------------------------------------------------------
const inMonth = (iso, y, m) => {
  if (!iso) return false;
  const d = new Date(String(iso).length === 10 ? iso + 'T12:00' : iso);
  return d.getFullYear() === y && d.getMonth() === m;
};
function monthReport(y, m) {
  const sales = S.orders.filter(
      o => o.kind !== 'stock' && o.status !== 'canceled' && inMonth(o.created_at, y, m)
    ),
    made = S.orders.filter(o => o.kind === 'stock' && o.status !== 'canceled' && inMonth(o.created_at, y, m)),
    payments = (S.payments || []).filter(p => inMonth(p.paid_on, y, m)),
    quotes = S.quotes.filter(qt => inMonth(qt.created_at, y, m));
  let total = 0,
    net = 0,
    profit = 0,
    estCost = 0,
    realCost = 0,
    realCount = 0;
  const byProduct = new Map(),
    byCustomer = new Map();
  for (const o of sales) {
    const t = orderNumbers(o),
      p = t.actualProfit ?? t.estimatedProfit,
      b = orderBalance(o);
    total += t.sales;
    net += t.net;
    profit += p;
    if (t.actualCost != null) {
      estCost += n(o.estimated_cost);
      realCost += t.actualCost;
      realCount++;
    }
    const pk = o.product_id || 'title:' + o.title,
      pr = byProduct.get(pk) || { name: o.title, units: 0, sales: 0, net: 0, profit: 0, orders: 0 };
    Object.assign(pr, {
      units: pr.units + n(o.quantity),
      sales: pr.sales + t.sales,
      net: pr.net + t.net,
      profit: pr.profit + p,
      orders: pr.orders + 1
    });
    byProduct.set(pk, pr);
    const name = o.customer_name || 'Sin cliente',
      ck = o.customer_id || 'name:' + name.toLocaleLowerCase('es'),
      cu = byCustomer.get(ck) || { name, orders: 0, sales: 0, paid: 0, due: 0 };
    Object.assign(cu, {
      orders: cu.orders + 1,
      sales: cu.sales + t.sales,
      paid: cu.paid + b.paid,
      due: cu.due + b.due
    });
    byCustomer.set(ck, cu);
  }
  const decided = quotes.filter(qt => qt.status !== 'sent').length,
    accepted = quotes.filter(qt => qt.status === 'accepted').length;
  return {
    sales,
    made,
    payments,
    quotes,
    total,
    net,
    profit,
    margin: net > 0 ? profit / net : null,
    ticket: sales.length ? total / sales.length : 0,
    collected: payments.reduce((s, p) => s + n(p.amount), 0),
    madeUnits: made.reduce((s, o) => s + n(o.quantity), 0),
    madeCost: made.reduce((s, o) => s + n(o.estimated_cost), 0),
    estCost,
    realCost,
    realCount,
    closeRate: decided ? accepted / decided : null,
    accepted,
    products: [...byProduct.values()].sort((a, b) => b.sales - a.sales),
    customers: [...byCustomer.values()].sort((a, b) => b.sales - a.sales)
  };
}
function reportMonth() {
  const now = new Date(),
    [y, m] = S.reportMonth || [now.getFullYear(), now.getMonth()];
  return { y, m, label: MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1) + ' ' + y };
}
function reportsView() {
  const { y, m, label } = reportMonth(),
    r = monthReport(y, m),
    pm = m === 0 ? [y - 1, 11] : [y, m - 1],
    prev = monthReport(...pm),
    delta = prev.total > 0 ? (r.total - prev.total) / prev.total : null,
    now = new Date(),
    isCurrent = y === now.getFullYear() && m === now.getMonth(),
    dueNow = receivables().reduce((s, o) => s + orderBalance(o).due, 0);
  // Last six months, oldest first, for the bar chart.
  const series = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(y, m - 5 + i, 1),
        t = monthReport(d.getFullYear(), d.getMonth());
      return { label: MONTHS[d.getMonth()].slice(0, 3), sales: t.total, profit: t.profit };
    }),
    max = Math.max(1, ...series.map(s => s.sales));
  const tile = (label, value, foot = '') =>
    '<div class="kpi"><div class="kpi-h"><span>' +
    label +
    '</span></div><div class="kpi-v num">' +
    value +
    '</div><div class="kpi-f">' +
    foot +
    '</div></div>';
  const table = (head, rows, empty) =>
    rows.length
      ? '<table class="data-table report-table"><thead><tr>' +
        head.map((h, i) => '<th' + (i ? ' class="r"' : '') + '>' + h + '</th>').join('') +
        '</tr></thead><tbody>' +
        rows
          .map(
            row =>
              '<tr>' +
              row.map((c, i) => '<td' + (i ? ' class="r num"' : '') + '>' + c + '</td>').join('') +
              '</tr>'
          )
          .join('') +
        '</tbody></table>'
      : '<p class="small muted report-empty">' + empty + '</p>';
  root.innerHTML =
    header(
      'Reportes',
      '<button class="btn btn-secondary" id="exportReport" type="button">' +
        icon('download') +
        '<span>Excel</span></button>'
    ) +
    '<main class="shell">' +
    '<div class="month-nav"><button type="button" class="btn icon-btn" id="prevMonth" aria-label="Mes anterior">' +
    icon('arrow-left') +
    '</button><b>' +
    label +
    '</b><button type="button" class="btn icon-btn flip" id="nextMonth" aria-label="Mes siguiente"' +
    (isCurrent ? ' disabled' : '') +
    '>' +
    icon('arrow-left') +
    '</button></div><div class="kpis report-kpis">' +
    tile(
      'Ventas',
      clp(r.total),
      delta == null
        ? '<span class="muted">' +
            r.sales.length +
            (r.sales.length === 1 ? ' pedido' : ' pedidos') +
            '</span>'
        : '<span class="' +
            (delta >= 0 ? 'up' : 'down') +
            '">' +
            (delta >= 0 ? '+' : '−') +
            Math.abs(Math.round(delta * 100)) +
            '% vs ' +
            MONTHS[pm[1]] +
            '</span>'
    ) +
    tile(
      'Utilidad',
      clp(r.profit),
      '<span class="muted">' + (r.margin == null ? 'Sin ventas' : 'Margen ' + pct(r.margin)) + '</span>'
    ) +
    tile(
      'Cobrado en el mes',
      clp(r.collected),
      '<span class="muted">' + r.payments.length + (r.payments.length === 1 ? ' pago' : ' pagos') + '</span>'
    ) +
    tile(
      'Ticket promedio',
      clp(r.ticket),
      '<span class="muted">' + r.sales.length + (r.sales.length === 1 ? ' pedido' : ' pedidos') + '</span>'
    ) +
    tile(
      'Cotizaciones',
      String(r.quotes.length),
      '<span class="muted">' +
        (r.closeRate == null ? 'Sin respuestas aún' : pct(r.closeRate) + ' aceptadas') +
        '</span>'
    ) +
    tile('Por cobrar hoy', clp(dueNow), '<span class="muted">' + receivables().length + ' con saldo</span>') +
    '</div><section class="panel report-panel"><div class="panel-h"><h2>Últimos 6 meses</h2><span class="legend"><i class="l-sales"></i>Ventas <i class="l-profit"></i>Utilidad</span></div><div class="bars">' +
    series
      .map(
        s =>
          '<div class="bar-col" title="' +
          esc(s.label + ': ventas ' + clp(s.sales) + ', utilidad ' + clp(s.profit)) +
          '"><div class="bar-pair"><i class="b-sales" style="height:' +
          Math.round((s.sales / max) * 100) +
          '%"></i><i class="b-profit" style="height:' +
          Math.max(0, Math.round((s.profit / max) * 100)) +
          '%"></i></div><span>' +
          s.label +
          '</span><b class="num">' +
          clpShort(s.sales) +
          '</b></div>'
      )
      .join('') +
    '</div></section><div class="home-cols"><section class="panel report-panel"><div class="panel-h"><h2>Por producto</h2></div>' +
    table(
      ['Producto', 'Un.', 'Ventas', 'Utilidad', 'Margen'],
      r.products.map(p => [
        esc(p.name),
        p.units,
        clp(p.sales),
        '<span class="' + (p.profit < 0 ? 'down' : '') + '">' + clp(p.profit) + '</span>',
        p.net > 0 ? pct(p.profit / p.net) : '—'
      ]),
      'Sin ventas este mes.'
    ) +
    '</section><section class="panel report-panel"><div class="panel-h"><h2>Por cliente</h2></div>' +
    table(
      ['Cliente', 'Pedidos', 'Ventas', 'Saldo'],
      r.customers.map(c => [
        esc(c.name),
        c.orders,
        clp(c.sales),
        '<span class="' + (c.due > 0 ? 'warn' : '') + '">' + clp(c.due) + '</span>'
      ]),
      'Sin ventas este mes.'
    ) +
    '</section></div><div class="home-cols"><section class="panel report-panel"><div class="panel-h"><h2>Costo estimado vs real</h2></div>' +
    (r.realCount
      ? '<dl class="facts"><div><dt>Pedidos con costo real</dt><dd>' +
        r.realCount +
        '</dd></div><div><dt>Estimado</dt><dd>' +
        clp(r.estCost) +
        '</dd></div><div><dt>Real</dt><dd class="' +
        (r.realCost > r.estCost ? 'down' : 'up') +
        '">' +
        clp(r.realCost) +
        (r.estCost > 0
          ? ' (' +
            (r.realCost >= r.estCost ? '+' : '−') +
            Math.abs(Math.round(((r.realCost - r.estCost) / r.estCost) * 100)) +
            '%)'
          : '') +
        '</dd></div></dl>'
      : '<p class="small muted report-empty">Registra los costos reales en cada pedido para comparar con lo estimado.</p>') +
    '</section><section class="panel report-panel"><div class="panel-h"><h2>Fabricación para stock</h2></div>' +
    (r.made.length
      ? '<dl class="facts"><div><dt>Órdenes</dt><dd>' +
        r.made.length +
        '</dd></div><div><dt>Unidades</dt><dd>' +
        r.madeUnits +
        '</dd></div><div><dt>Costo estimado</dt><dd>' +
        clp(r.madeCost) +
        '</dd></div></dl>'
      : '<p class="small muted report-empty">Sin fabricación para stock este mes.</p>') +
    '</section></div><p class="footnote small muted">Ventas de pedidos de cliente creados en el mes (sin cancelados). La utilidad usa el costo real cuando está registrado y si no el estimado.</p></main>';
  common();
  q('#prevMonth').onclick = () => {
    S.reportMonth = m === 0 ? [y - 1, 11] : [y, m - 1];
    reportsView();
  };
  q('#nextMonth').onclick = () => {
    if (isCurrent) return;
    S.reportMonth = m === 11 ? [y + 1, 0] : [y, m + 1];
    reportsView();
  };
  q('#exportReport').onclick = () => exportReport(y, m);
}
function exportReport(y, m) {
  const r = monthReport(y, m),
    { label } = reportMonth(),
    date = iso => (iso ? String(iso).slice(0, 10) : '');
  const sheets = [
    {
      name: 'Resumen',
      rows: [
        ['Indicador', 'Valor'],
        ['Mes', label],
        ['Ventas (con IVA)', Math.round(r.total)],
        ['Ventas netas', Math.round(r.net)],
        ['Utilidad', Math.round(r.profit)],
        ['Margen', r.margin == null ? '' : pct(r.margin)],
        ['Pedidos', r.sales.length],
        ['Ticket promedio', Math.round(r.ticket)],
        ['Cobrado en el mes', Math.round(r.collected)],
        ['Cotizaciones', r.quotes.length],
        ['Cotizaciones aceptadas', r.accepted],
        ['Unidades fabricadas para stock', r.madeUnits]
      ]
    },
    {
      name: 'Pedidos',
      rows: [
        [
          'Pedido',
          'Fecha',
          'Cliente',
          'Producto',
          'Cantidad',
          'Precio unitario',
          'Total',
          'Costo estimado',
          'Costo real',
          'Utilidad',
          'Pagado',
          'Saldo',
          'Estado',
          'Entrega'
        ],
        ...r.sales.map(o => {
          const t = orderNumbers(o),
            b = orderBalance(o);
          return [
            'PED-' + o.order_no,
            date(o.created_at),
            o.customer_name || '',
            o.title,
            n(o.quantity),
            n(o.unit_price),
            t.sales,
            n(o.estimated_cost),
            t.actualCost ?? '',
            t.actualProfit ?? t.estimatedProfit,
            b.paid,
            b.due,
            ORDER_STATUSES[o.status] || o.status,
            date(o.due_date)
          ];
        })
      ]
    },
    {
      name: 'Por producto',
      rows: [
        ['Producto', 'Pedidos', 'Unidades', 'Ventas', 'Utilidad', 'Margen'],
        ...r.products.map(p => [
          p.name,
          p.orders,
          p.units,
          p.sales,
          p.profit,
          p.net > 0 ? pct(p.profit / p.net) : ''
        ])
      ]
    },
    {
      name: 'Por cliente',
      rows: [
        ['Cliente', 'Pedidos', 'Ventas', 'Pagado', 'Saldo'],
        ...r.customers.map(c => [c.name, c.orders, c.sales, c.paid, c.due])
      ]
    },
    {
      name: 'Pagos',
      rows: [
        ['Fecha', 'Pedido', 'Cliente', 'Monto', 'Medio', 'Nota'],
        ...r.payments.map(p => {
          const o = S.orders.find(x => x.id === p.order_id);
          return [
            date(p.paid_on),
            o ? 'PED-' + o.order_no : '',
            o?.customer_name || '',
            n(p.amount),
            PAY_METHODS[p.method] || p.method,
            p.note || ''
          ];
        })
      ]
    },
    {
      name: 'Cotizaciones',
      rows: [
        ['Folio', 'Fecha', 'Cliente', 'Producto', 'Cantidad', 'Total', 'Estado'],
        ...r.quotes.map(qt => [
          quoteFolioNo(qt.quote_no),
          date(qt.created_at),
          qt.client_name,
          qt.title,
          qt.quantity,
          quoteSums(qt).total,
          QUOTE_STATUS[quoteState(qt)]
        ])
      ]
    }
  ];
  downloadBlob(xlsxBlob(sheets), 'KultiApp-reporte-' + y + '-' + String(m + 1).padStart(2, '0') + '.xlsx');
  toast('Reporte descargado.');
}
// ---- Backup -----------------------------------------------------------------
const BACKUP_TABLES = [
  ['workspace_settings', 'Ajustes'],
  ['products', 'Productos'],
  ['print_jobs', 'Impresiones'],
  ['cost_items', 'Costos'],
  ['workspace_resources', 'Inventario'],
  ['inventory_movements', 'Movimientos inventario'],
  ['production_orders', 'Pedidos'],
  ['inventory_order_lines', 'Materiales pedidos'],
  ['order_payments', 'Pagos'],
  ['product_stock_movements', 'Movimientos stock'],
  ['customers', 'Clientes'],
  ['quotes', 'Cotizaciones']
];
async function collectBackup() {
  const data = {},
    ws = S.workspace.id;
  for (const [table] of BACKUP_TABLES) {
    // Prints and cost items hang from products, not from the workspace.
    const ids = (data.products || []).map(p => p.id),
      query =
        table === 'print_jobs' || table === 'cost_items'
          ? ids.length
            ? supabase.from(table).select('*').in('product_id', ids)
            : null
          : supabase.from(table).select('*').eq('workspace_id', ws);
    if (!query) {
      data[table] = [];
      continue;
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(table + ': ' + error.message);
    data[table] = rows || [];
  }
  return {
    app: 'KultiApp',
    version: 1,
    exported_at: new Date().toISOString(),
    workspace: { id: ws, name: S.workspace.name },
    tables: data
  };
}
const backupKey = () => 'kultiapp_backup_' + (S.workspace?.id || '');
function lastBackup() {
  try {
    return localStorage.getItem(backupKey());
  } catch {
    return null;
  }
}
function showBackup() {
  const last = lastBackup();
  const dialog = showDialog(
    'backupDialog',
    '<div class="section-title"><h2>Respaldo de datos</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><p class="small muted">Descarga una copia completa de productos, costos, inventario, pedidos, pagos, clientes y cotizaciones. Guárdala en tu computador, Drive o correo.</p><p class="notice small">' +
      (last
        ? 'Último respaldo desde este equipo: <b>' +
          new Date(last).toLocaleDateString('es-CL') +
          '</b> (' +
          relativeDate(last) +
          ').'
        : 'Aún no has descargado un respaldo desde este equipo.') +
      '</p><div class="backup-actions"><button type="button" class="btn btn-primary" data-backup="xlsx">' +
      icon('download') +
      'Excel (para revisar)</button><button type="button" class="btn btn-secondary" data-backup="json">' +
      icon('download') +
      'JSON (copia exacta)</button></div><p class="small muted">Las fotos de los productos se mantienen en el almacenamiento de la app; el respaldo guarda sus referencias.</p><div id="backupFeedback" class="small" role="status"></div>'
  );
  dialog.querySelectorAll('[data-backup]').forEach(
    b =>
      (b.onclick = async () => {
        dialog.querySelectorAll('[data-backup]').forEach(x => (x.disabled = true));
        q('#backupFeedback').textContent = 'Preparando respaldo…';
        try {
          const backup = await collectBackup(),
            stamp = new Date().toLocaleDateString('sv-SE'),
            base = 'KultiApp-respaldo-' + stamp;
          if (b.dataset.backup === 'json')
            downloadBlob(
              new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' }),
              base + '.json'
            );
          else
            downloadBlob(
              xlsxBlob(
                BACKUP_TABLES.map(([table, name]) => {
                  const rows = backup.tables[table],
                    cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
                  return {
                    name,
                    rows: [
                      cols.length ? cols : ['(sin datos)'],
                      ...rows.map(r =>
                        cols.map(c =>
                          r[c] != null && typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c]
                        )
                      )
                    ]
                  };
                })
              ),
              base + '.xlsx'
            );
          try {
            localStorage.setItem(backupKey(), backup.exported_at);
          } catch {}
          const count = Object.values(backup.tables).reduce((s, rows) => s + rows.length, 0);
          q('#backupFeedback').textContent = 'Respaldo descargado: ' + count + ' registros.';
        } catch (error) {
          q('#backupFeedback').textContent = 'No se pudo crear el respaldo: ' + error.message;
        } finally {
          dialog.querySelectorAll('[data-backup]').forEach(x => (x.disabled = false));
        }
      })
  );
  return dialog;
}
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
const ICONS = {
  house:
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />',
  package:
    '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /><path d="M12 22V12" /><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7" /><path d="m7.5 4.27 9 5.15" />',
  'file-text':
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />',
  'clipboard-list':
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />',
  boxes:
    '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" /><path d="m7 16.5-4.74-2.85" /><path d="m7 16.5 5-3" /><path d="M7 16.5v5.17" /><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" /><path d="m17 16.5-5-3" /><path d="m17 16.5 4.74-2.85" /><path d="M17 16.5v5.17" /><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" /><path d="M12 8 7.26 5.15" /><path d="m12 8 4.74-2.85" /><path d="M12 13.5V8" />',
  printer:
    '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" />',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />',
  search: '<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />',
  plus: '<path d="M5 12h14" /><path d="M12 5v14" />',
  'ellipsis-vertical':
    '<circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />',
  ellipsis: '<circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />',
  'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" />',
  'triangle-alert':
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" />',
  'chevron-right': '<path d="m9 18 6-6-6-6" />',
  'chevron-down': '<path d="m6 9 6 6 6-6" />',
  'arrow-left': '<path d="m12 19-7-7 7-7" /><path d="M19 12H5" />',
  x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
  'log-out':
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />',
  'key-round':
    '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" /><circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />',
  'user-plus':
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" />',
  menu: '<line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />',
  'refresh-cw':
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
  check: '<path d="M20 6 9 17l-5-5" />',
  'trash-2':
    '<path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />',
  archive:
    '<rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />',
  'archive-restore':
    '<rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h2" /><path d="M20 8v11a2 2 0 0 1-2 2h-2" /><path d="m9 15 3-3 3 3" /><path d="M12 12v9" />',
  'share-2':
    '<circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />',
  calendar:
    '<path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />',
  'circle-check': '<circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />',
  info: '<circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />',
  pencil:
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />',
  history:
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" />',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />',
  wallet:
    '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />',
  layers:
    '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />',
  'list-filter': '<path d="M3 6h18" /><path d="M7 12h10" /><path d="M10 18h4" />',
  calculator:
    '<rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" />',
  clock: '<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />',
  'chart-column':
    '<path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />',
  database:
    '<ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />',
  'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />',
  'circle-alert':
    '<circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />'
};

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
  { mode: 'reports', label: 'Reportes', icon: 'chart-column' },
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
  inventory: 'Inventario',
  resources: 'Impresoras'
};
function navActive(mode) {
  return S.mode === mode || (mode === 'dashboard' && S.mode === 'product');
}
function navCount(mode) {
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
    '</h1><div class="page-actions">' +
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
    '" alt="Kultiverso Pop"><button type="button" class="side-search" data-open-search>' +
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
    NAV_ITEMS.filter(item => !['resources', 'quotes', 'customers', 'reports'].includes(item.mode))
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
      'Reportes</button><button type="button" class="menu-item" data-more="resources">' +
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
      '<button type="button" class="menu-item" data-more="backup">' +
      icon('database') +
      'Respaldo de datos</button><button type="button" class="menu-item" data-more="password">' +
      icon('key-round') +
      'Cambiar contraseña</button><button type="button" class="menu-item danger" data-more="logout">' +
      icon('log-out') +
      'Cerrar sesión</button></div><p class="powered">Kultiverso Pop · Powered by <b>ELARA</b></p>'
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
    backup: () => showBackup(),
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

// ---------------------------------------------------------------------------
// Inicio: month indicators, upcoming deliveries and low stock.
// ---------------------------------------------------------------------------
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
];
const ORDER_CHIP = {
  pending: 'c-pend',
  printing: 'c-print',
  assembly: 'c-asm',
  ready: 'c-ready',
  delivered: 'c-done',
  canceled: 'c-cancel'
};
function orderIsOpen(o) {
  return !['delivered', 'canceled'].includes(o.status);
}
function orderIsLate(o) {
  return orderIsOpen(o) && o.due_date && o.due_date < localToday();
}
function orderChip(o) {
  const late = orderIsLate(o);
  return (
    '<span class="chip ' +
    (late ? 'c-late' : ORDER_CHIP[o.status] || '') +
    '"><i></i>' +
    (late ? 'Atrasado' : ORDER_STATUSES[o.status] || o.status) +
    '</span>'
  );
}
function shortDate(iso) {
  if (!iso) return 'Sin fecha';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return d + ' ' + MONTHS[m - 1].slice(0, 3) + (y !== new Date().getFullYear() ? ' ' + y : '');
}
// Compact CLP for small tiles on phones: $1,28 M, $468 mil.
function clpShort(v) {
  const x = Math.round(n(v));
  if (Math.abs(x) >= 1e6) return '$' + (x / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 2 }) + ' M';
  if (Math.abs(x) >= 1e4) return '$' + Math.round(x / 1e3).toLocaleString('es-CL') + ' mil';
  return clp(x);
}
// Sales and estimated profit for orders created in a given month (canceled excluded).
function monthTotals(year, month) {
  const list = S.orders.filter(o => {
    if (o.status === 'canceled' || o.kind === 'stock' || !o.created_at) return false;
    const d = new Date(o.created_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  let sales = 0,
    profit = 0,
    net = 0;
  for (const o of list) {
    const t = orderNumbers(o);
    sales += t.sales;
    net += t.net;
    profit += t.actualProfit ?? t.estimatedProfit;
  }
  return { count: list.length, sales, profit, margin: net > 0 ? profit / net : null };
}
function stockLevel(r) {
  const min = n(r.min_stock),
    avail = availableStock(r);
  return { avail, min, ratio: min > 0 ? Math.max(0, Math.min(1, avail / (min * 2))) : 1 };
}
function homeView() {
  const now = new Date(),
    cur = monthTotals(now.getFullYear(), now.getMonth()),
    prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1),
    prev = monthTotals(prevDate.getFullYear(), prevDate.getMonth()),
    open = S.orders.filter(orderIsOpen),
    late = open.filter(orderIsLate),
    low = inventoryLow(),
    uncounted = inventoryItems().filter(r => r.active && !r.counted),
    upcoming = [...open]
      .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
      .slice(0, 6),
    stockList = inventoryItems()
      .filter(r => r.active && r.counted && n(r.min_stock) > 0)
      .sort((a, b) => stockLevel(a).ratio - stockLevel(b).ratio)
      .slice(0, 5),
    delta = prev.sales > 0 ? (cur.sales - prev.sales) / prev.sales : null,
    weekday = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }),
    dueOrders = receivables(),
    dueTotal = dueOrders.reduce((s, o) => s + orderBalance(o).due, 0);
  const kpi = (label, ic, value, foot, extra = '') =>
    '<div class="kpi' +
    extra +
    '"><div class="kpi-h"><span>' +
    label +
    '</span>' +
    icon(ic) +
    '</div><div class="kpi-v num">' +
    value +
    '</div><div class="kpi-f">' +
    foot +
    '</div></div>';
  const deltaFoot =
    delta == null
      ? '<span class="muted">' + cur.count + (cur.count === 1 ? ' pedido' : ' pedidos') + ' este mes</span>'
      : '<span class="' +
        (delta >= 0 ? 'up' : 'down') +
        '">' +
        icon(delta >= 0 ? 'trending-up' : 'trending-down') +
        Math.abs(Math.round(delta * 100)) +
        '% vs ' +
        MONTHS[prevDate.getMonth()] +
        '</span>';
  const deliveries = upcoming.length
    ? '<table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Estado</th><th class="r">Total</th></tr></thead><tbody>' +
      upcoming
        .map(
          o =>
            '<tr data-home-order="' +
            o.id +
            '"><td><b>' +
            esc(o.title) +
            '</b><div class="sub">PED-' +
            o.order_no +
            ' · ' +
            o.quantity +
            ' un.</div></td><td>' +
            esc(o.kind === 'stock' ? 'Para stock' : o.customer_name || '—') +
            '</td><td class="num">' +
            shortDate(o.due_date) +
            '</td><td>' +
            orderChip(o) +
            '</td><td class="r num">' +
            (o.kind === 'stock' ? '—' : clp(orderNumbers(o).sales)) +
            '</td></tr>'
        )
        .join('') +
      '</tbody></table><div class="list-rows">' +
      upcoming
        .map(
          o =>
            '<button type="button" class="list-row" data-home-order="' +
            o.id +
            '"><span class="lr-main"><b>' +
            esc(o.title) +
            '</b><span>' +
            esc(orderCustomer(o)) +
            ' · ' +
            shortDate(o.due_date) +
            '</span></span><span class="lr-end"><b class="num">' +
            (o.kind === 'stock' ? o.quantity + ' un.' : clp(orderNumbers(o).sales)) +
            '</b>' +
            orderChip(o) +
            '</span></button>'
        )
        .join('') +
      '</div>'
    : '<div class="panel-empty">' +
      icon('clipboard-list') +
      '<b>No hay pedidos en curso</b><span>Crea uno desde el resumen de un producto.</span></div>';
  const stock = stockList.length
    ? stockList
        .map(r => {
          const s = stockLevel(r),
            tone = s.avail <= s.min * 0.5 ? 'down' : s.avail <= s.min ? 'warn' : 'up';
          return (
            '<button type="button" class="stock-row" data-home-stock="' +
            r.id +
            '"><span class="stock-top"><span>' +
            esc(r.name) +
            '</span><span class="num ' +
            tone +
            '">' +
            stockNumber(s.avail) +
            ' / ' +
            stockNumber(s.min) +
            ' ' +
            esc(r.unit) +
            '</span></span><span class="bar"><b class="' +
            tone +
            '" style="width:' +
            Math.max(4, Math.round(s.ratio * 100)) +
            '%"></b></span></button>'
          );
        })
        .join('')
    : '<div class="panel-empty">' +
      icon('boxes') +
      '<b>Sin alertas de stock</b><span>' +
      (uncounted.length
        ? uncounted.length +
          (uncounted.length === 1 ? ' material pendiente' : ' materiales pendientes') +
          ' de conteo inicial.'
        : 'Define un stock mínimo en tus materiales para ver alertas aquí.') +
      '</span></div>';
  root.innerHTML =
    header(
      'Inicio',
      canEdit()
        ? '<button class="btn btn-primary" id="homeNew" type="button">' +
            icon('plus') +
            '<span>Nuevo producto</span></button>'
        : ''
    ) +
    '<main class="shell home">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<p class="home-date">' +
    weekday.charAt(0).toUpperCase() +
    weekday.slice(1) +
    ' · Resumen de ' +
    MONTHS[now.getMonth()] +
    '</p><div class="kpis">' +
    kpi(
      'Ventas de ' + MONTHS[now.getMonth()],
      'wallet',
      '<span class="full">' +
        clp(cur.sales) +
        '</span><span class="short">' +
        clpShort(cur.sales) +
        '</span>',
      deltaFoot
    ) +
    kpi(
      'Utilidad estimada',
      'trending-up',
      '<span class="full">' +
        clp(cur.profit) +
        '</span><span class="short">' +
        clpShort(cur.profit) +
        '</span>',
      '<span class="muted">' +
        (cur.margin == null ? 'Sin ventas este mes' : 'Margen ' + pct(cur.margin)) +
        '</span>'
    ) +
    kpi(
      'Pedidos en curso',
      'clipboard-list',
      String(open.length),
      late.length
        ? '<span class="down">' +
            icon('triangle-alert') +
            late.length +
            (late.length === 1 ? ' atrasado' : ' atrasados') +
            '</span>'
        : '<span class="muted">Todos al día</span>'
    ) +
    kpi(
      'Inventario',
      'boxes',
      String(low.length),
      low.length
        ? '<span class="warn">' +
            icon('triangle-alert') +
            (low.length === 1 ? 'material bajo mínimo' : 'materiales bajo mínimo') +
            '</span>'
        : '<span class="muted">Stock en orden</span>'
    ) +
    kpi(
      'Por cobrar',
      'wallet',
      '<span class="full">' + clp(dueTotal) + '</span><span class="short">' + clpShort(dueTotal) + '</span>',
      dueOrders.length
        ? '<button type="button" class="link-btn" id="homeDue">' +
            dueOrders.length +
            (dueOrders.length === 1 ? ' pedido con saldo' : ' pedidos con saldo') +
            '</button>'
        : '<span class="muted">Todo cobrado</span>'
    ) +
    '</div><div class="home-cols"><section class="panel"><div class="panel-h"><h2>Próximas entregas</h2><button type="button" class="link-btn" data-go="production">Ver pedidos</button></div>' +
    deliveries +
    '</section><section class="panel"><div class="panel-h"><h2>Stock bajo</h2><button type="button" class="link-btn" data-go="inventory">Inventario</button></div>' +
    stock +
    '</section></div></main>';
  common();
  q('#homeNew')?.addEventListener('click', newProduct);
  q('#homeDue')?.addEventListener('click', () => {
    S.orderFilter = 'unpaid';
    goMode('production');
  });
  qa('[data-go]').forEach(b => (b.onclick = () => goMode(b.dataset.go)));
  qa('[data-home-order]').forEach(
    el => (el.onclick = () => showOrder(S.orders.find(o => o.id === el.dataset.homeOrder)))
  );
  qa('[data-home-stock]').forEach(el => (el.onclick = () => goMode('inventory')));
}

// ---------------------------------------------------------------------------
// Pedidos, Inventario e Impresoras (V1.6 stage 3).
// ---------------------------------------------------------------------------
// Filter chips with counts, shared by Pedidos and Inventario.
function filterPills(items, active, attr) {
  return (
    '<div class="pills" role="tablist">' +
    items
      .map(
        ([key, label, count]) =>
          '<button type="button" class="pill' +
          (key === active ? ' on' : '') +
          '" ' +
          attr +
          '="' +
          key +
          '" role="tab" aria-selected="' +
          (key === active) +
          '">' +
          label +
          (count != null ? '<span>' + count + '</span>' : '') +
          '</button>'
      )
      .join('') +
    '</div>'
  );
}
function searchBox(id, placeholder, value) {
  return (
    '<label class="search-box">' +
    icon('search') +
    '<input id="' +
    id +
    '" type="search" placeholder="' +
    esc(placeholder) +
    '" aria-label="' +
    esc(placeholder) +
    '" value="' +
    esc(value || '') +
    '"></label>'
  );
}
// Re-render on typing without losing the caret.
function bindSearch(id, apply, view) {
  q('#' + id).oninput = e => {
    const pos = e.target.selectionStart;
    apply(e.target.value);
    view();
    q('#' + id).focus();
    q('#' + id).setSelectionRange(pos, pos);
  };
}
function orderMatches(o, filter) {
  if (filter === 'all') return true;
  if (filter === 'open') return orderIsOpen(o);
  if (filter === 'late') return orderIsLate(o);
  if (filter === 'stock') return o.kind === 'stock';
  if (filter === 'unpaid') return orderBalance(o).due > 0;
  return o.status === filter;
}
function orderCustomer(o) {
  if (o.kind === 'stock') return 'Para stock';
  return (o.customer_name || 'Sin cliente') + (o.from_stock ? ' · desde stock' : '');
}
function orderProfitCell(o) {
  if (o.kind === 'stock') return '<span class="muted">—</span>';
  const t = orderNumbers(o),
    real = t.actualProfit != null,
    v = real ? t.actualProfit : t.estimatedProfit;
  return (
    '<span class="' +
    (v < 0 ? 'down' : '') +
    '">' +
    clp(v) +
    '</span><div class="sub">' +
    (real ? 'real' : 'estimada') +
    '</div>'
  );
}
function productionView() {
  const term = (S.orderSearch || '').toLocaleLowerCase('es'),
    filter = S.orderFilter || 'open',
    count = f => S.orders.filter(o => orderMatches(o, f)).length,
    list = S.orders
      .filter(o => orderMatches(o, filter))
      .filter(o =>
        (o.title + ' ' + (o.customer_name || '') + ' PED-' + o.order_no)
          .toLocaleLowerCase('es')
          .includes(term)
      )
      .sort((a, b) =>
        orderIsOpen(a) && orderIsOpen(b)
          ? String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))
          : String(b.created_at || '').localeCompare(String(a.created_at || ''))
      );
  const pills = [
    ['open', 'En curso', count('open')],
    ['late', 'Atrasados', count('late')],
    ['unpaid', 'Por cobrar', count('unpaid')],
    ['stock', 'Fabricación', count('stock')],
    ...Object.entries(ORDER_STATUSES).map(([k, label]) => [k, label, count(k)]),
    ['all', 'Todos', S.orders.length]
  ].filter(([k, , c]) => c > 0 || ['open', 'all', filter].includes(k));
  const due = o =>
    '<span class="' + (orderIsLate(o) ? 'down' : '') + '">' + shortDate(o.due_date) + '</span>';
  root.innerHTML =
    header(
      'Pedidos',
      '<button class="btn icon-btn" id="reloadOrders" type="button" aria-label="Actualizar" title="Actualizar">' +
        icon('refresh-cw') +
        '</button>'
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="toolbar">' +
    searchBox('orderSearch', 'Buscar pedido, cliente o PED-…', S.orderSearch) +
    '</div>' +
    filterPills(pills, filter, 'data-order-filter') +
    '<section class="panel">' +
    (list.length
      ? '<table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Estado</th><th class="r">Venta</th><th class="r">Utilidad</th></tr></thead><tbody>' +
        list
          .map(
            o =>
              '<tr data-order="' +
              o.id +
              '"><td><b>' +
              esc(o.title) +
              '</b><div class="sub">PED-' +
              o.order_no +
              ' · ' +
              o.quantity +
              ' un.</div></td><td>' +
              (o.kind === 'stock'
                ? '<span class="chip c-stock">Para stock</span>'
                : esc(o.customer_name || '—') + (o.from_stock ? '<div class="sub">desde stock</div>' : '')) +
              '</td><td class="num">' +
              due(o) +
              '</td><td>' +
              orderChip(o) +
              '</td><td class="r num">' +
              (o.kind === 'stock'
                ? '<span class="muted">—</span>'
                : clp(orderNumbers(o).sales) +
                  (orderBalance(o).due > 0
                    ? '<div class="sub warn">Saldo ' + clp(orderBalance(o).due) + '</div>'
                    : orderBalance(o).state === 'paid'
                      ? '<div class="sub up">Pagado</div>'
                      : '')) +
              '</td><td class="r num">' +
              orderProfitCell(o) +
              '</td></tr>'
          )
          .join('') +
        '</tbody></table><div class="list-rows">' +
        list
          .map(
            o =>
              '<button type="button" class="list-row" data-order="' +
              o.id +
              '"><span class="lr-main"><b>' +
              esc(o.title) +
              '</b><span>PED-' +
              o.order_no +
              ' · ' +
              esc(orderCustomer(o)) +
              ' · ' +
              due(o) +
              '</span></span><span class="lr-end"><b class="num">' +
              (o.kind === 'stock' ? o.quantity + ' un.' : clp(orderNumbers(o).sales)) +
              '</b>' +
              (orderBalance(o).due > 0
                ? '<span class="sub warn">Saldo ' + clp(orderBalance(o).due) + '</span>'
                : orderChip(o)) +
              '</span></button>'
          )
          .join('') +
        '</div>'
      : '<div class="panel-empty">' +
        icon(term ? 'search' : 'clipboard-list') +
        '<b>' +
        (term ? 'Sin resultados' : S.orders.length ? 'No hay pedidos en esta vista' : 'Aún no hay pedidos') +
        '</b><span>' +
        (S.orders.length ? 'Prueba con otro filtro.' : 'Crea uno desde el resumen de un producto.') +
        '</span></div>') +
    '</section></main>';
  common();
  bindSearch('orderSearch', v => (S.orderSearch = v), productionView);
  qa('[data-order-filter]').forEach(
    b =>
      (b.onclick = () => {
        S.orderFilter = b.dataset.orderFilter;
        productionView();
      })
  );
  q('#reloadOrders').onclick = () => goMode('production');
  qa('[data-order]').forEach(
    b => (b.onclick = () => showOrder(S.orders.find(o => o.id === b.dataset.order)))
  );
}
function inventoryState(r) {
  if (!r.active) return ['Inactivo', 'c-cancel'];
  if (!r.counted) return ['Sin conteo', 'c-pend'];
  if (availableStock(r) <= n(r.min_stock)) return ['Stock bajo', 'c-late'];
  return ['Disponible', 'c-ready'];
}
function inventoryMatches(r, filter) {
  if (filter === 'low') return r.active && r.counted && availableStock(r) <= n(r.min_stock);
  if (filter === 'uncounted') return r.active && !r.counted;
  if (filter === 'filament') return r.kind === 'filament';
  if (filter === 'supply') return r.kind === 'supply';
  return true;
}
function inventoryActions(r) {
  return (
    (canEdit()
      ? '<button class="btn btn-secondary btn-sm" type="button" data-stock="' +
        r.id +
        '">' +
        (r.counted ? 'Movimiento' : 'Contar stock') +
        '</button>'
      : '') +
    '<details class="row-menu"><summary class="btn icon-btn" aria-label="Acciones de ' +
    esc(r.name) +
    '">' +
    icon('ellipsis-vertical') +
    '</summary><div class="menu-pop">' +
    (canEdit()
      ? '<button type="button" class="btn" data-inventory-edit="' +
        r.id +
        '">' +
        icon('pencil') +
        'Editar</button>'
      : '') +
    '<button type="button" class="btn" data-ledger="' +
    r.id +
    '">' +
    icon('history') +
    'Historial</button></div></details>'
  );
}
function inventoryView() {
  if (S.inventoryOnlyLow) S.inventoryFilter = 'low';
  const items = inventoryItems(),
    filter = S.inventoryFilter || 'all',
    term = (S.inventorySearch || '').toLocaleLowerCase('es'),
    list = items
      .filter(r => inventoryMatches(r, filter))
      .filter(r => (r.name + ' ' + (r.material || '')).toLocaleLowerCase('es').includes(term))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es')),
    value = items.filter(r => r.counted).reduce((sum, r) => sum + n(r.stock_qty) * n(r.unit_cost), 0),
    count = f => items.filter(r => inventoryMatches(r, f)).length;
  const qty = (v, r) => stockNumber(v) + ' <span class="unit">' + esc(r.unit) + '</span>';
  root.innerHTML =
    header(
      'Inventario',
      canEdit()
        ? '<button id="addInventory" class="btn btn-primary">' +
            icon('plus') +
            '<span>Material</span></button>'
        : ''
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="summary-strip"><div><span>Valor del stock</span><b class="num">' +
    clp(value) +
    '</b></div><div><span>Bajo mínimo</span><b class="num ' +
    (count('low') ? 'down' : '') +
    '">' +
    count('low') +
    '</b></div><div><span>Sin conteo</span><b class="num ' +
    (count('uncounted') ? 'warn' : '') +
    '">' +
    count('uncounted') +
    '</b></div><div><span>Materiales</span><b class="num">' +
    items.length +
    '</b></div></div><div class="toolbar">' +
    searchBox('inventorySearch', 'Buscar material', S.inventorySearch) +
    '<button id="reloadInventory" class="btn icon-btn" type="button" aria-label="Actualizar" title="Actualizar">' +
    icon('refresh-cw') +
    '</button></div>' +
    filterPills(
      [
        ['all', 'Todos', items.length],
        ['low', 'Bajo mínimo', count('low')],
        ['uncounted', 'Sin conteo', count('uncounted')],
        ['filament', 'Filamentos', count('filament')],
        ['supply', 'Insumos', count('supply')]
      ],
      filter,
      'data-inventory-filter'
    ) +
    '<section class="panel">' +
    (list.length
      ? '<div class="inv-head"><span>Material</span><span>Disponible</span><span>Reservado</span><span>Mínimo</span><span>Costo</span><span>Estado</span><span></span></div>' +
        list
          .map(r => {
            const [label, cls] = inventoryState(r);
            return (
              '<div class="inv-row' +
              (!r.active ? ' archived' : '') +
              '"><div class="prod-cell inv-name"><span class="swatch" style="background:' +
              (/^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#303a4d') +
              '"></span><div><b>' +
              esc(r.name) +
              '</b><span>' +
              (r.kind === 'filament' ? 'Filamento' : 'Insumo') +
              (r.material ? ' · ' + esc(r.material) : '') +
              '</span></div></div><div class="inv-num inv-avail" data-label="Disponible"><b>' +
              qty(availableStock(r), r) +
              '</b></div><div class="inv-num inv-reserved" data-label="Reservado">' +
              qty(r.reserved_qty, r) +
              '</div><div class="inv-num inv-min" data-label="Mínimo">' +
              qty(r.min_stock, r) +
              '</div><div class="inv-num inv-cost" data-label="Costo">' +
              preciseCost(r.unit_cost) +
              ' <span class="unit">/ ' +
              esc(r.unit) +
              '</span></div><div class="inv-state"><span class="chip ' +
              cls +
              '">' +
              label +
              '</span></div><div class="row-actions">' +
              inventoryActions(r) +
              '</div></div>'
            );
          })
          .join('')
      : '<div class="panel-empty">' +
        icon('boxes') +
        '<b>' +
        (items.length ? 'Sin materiales para este filtro' : 'Aún no hay materiales') +
        '</b><span>' +
        (items.length ? 'Prueba con otro filtro.' : 'Agrega filamentos, marcos, papel y otros insumos.') +
        '</span></div>') +
    '</section><p class="small muted footnote">Disponible = físico − reservado. Costo promedio ponderado; filamentos en gramos.</p></main>';
  common();
  bindSearch('inventorySearch', v => (S.inventorySearch = v), inventoryView);
  qa('[data-inventory-filter]').forEach(
    b =>
      (b.onclick = () => {
        S.inventoryOnlyLow = false;
        S.inventoryFilter = b.dataset.inventoryFilter;
        inventoryView();
      })
  );
  q('#reloadInventory').onclick = () => goMode('inventory');
  q('#addInventory')?.addEventListener('click', () => showInventoryForm());
  qa('[data-stock]').forEach(
    b => (b.onclick = () => showStockMovement(S.resources.find(r => r.id === b.dataset.stock)))
  );
  qa('[data-inventory-edit]').forEach(
    b => (b.onclick = () => showInventoryForm(S.resources.find(r => r.id === b.dataset.inventoryEdit)))
  );
  qa('[data-ledger]').forEach(
    b => (b.onclick = () => showInventoryLedger(S.resources.find(r => r.id === b.dataset.ledger)))
  );
}
function resourcesView() {
  const printers = S.resources.filter(r => r.kind === 'printer');
  root.innerHTML =
    header(
      'Impresoras',
      canEdit()
        ? '<button class="btn btn-primary" data-add-resource="printer">' +
            icon('plus') +
            '<span>Impresora</span></button>'
        : ''
    ) +
    '<main class="shell narrow">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<section class="panel">' +
    (printers.length
      ? printers
          .map(
            r =>
              '<div class="list-row static' +
              (!r.active ? ' archived' : '') +
              '"><span class="thumb-empty">' +
              icon('printer') +
              '</span><span class="lr-main"><b>' +
              esc(r.name) +
              '</b><span>' +
              n(r.power_kw).toLocaleString('es-CL') +
              ' kW de consumo máximo</span></span><span class="chip ' +
              (r.active ? 'c-ready' : 'c-cancel') +
              '">' +
              (r.active ? 'Disponible' : 'Inactiva') +
              '</span>' +
              (canEdit()
                ? '<button class="btn icon-btn" type="button" data-edit-resource="' +
                  r.id +
                  '" aria-label="Editar ' +
                  esc(r.name) +
                  '" title="Editar">' +
                  icon('pencil') +
                  '</button>'
                : '') +
              '</div>'
          )
          .join('')
      : '<div class="panel-empty">' +
        icon('printer') +
        '<b>Aún no hay impresoras</b><span>Regístralas con su potencia para calcular la electricidad.</span></div>') +
    '</section><p class="small muted footnote">La potencia se copia a cada impresión al elegir la impresora; cambiarla aquí no modifica productos anteriores.</p></main>';
  common();
  qa('[data-add-resource]').forEach(
    b => (b.onclick = () => showResourceForm({ kind: b.dataset.addResource, active: true }))
  );
  qa('[data-edit-resource]').forEach(
    b => (b.onclick = () => showResourceForm(S.resources.find(r => r.id === b.dataset.editResource)))
  );
}

// Start the app once every module-level constant above is initialized.
init();
