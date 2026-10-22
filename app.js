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
  S.mode = 'dashboard';
  restoreActiveDraft();
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
  'id,workspace_id,name,description,quantity,iva_enabled,iva_rate,target_margin,round_to,status,sale_price,photo_path,created_at,updated_at';
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
function dashboard() {
  const active = S.products.filter(p => p.status !== 'archived'),
    arch = S.products.filter(p => p.status === 'archived'),
    list = S.showArchived ? arch : active,
    avg = active.length ? active.reduce((s, p) => s + n(p.target_margin), 0) / active.length : 0,
    total = active.reduce((s, p) => s + n(S.summaries.get(p.id)?.total_cost), 0);
  const filtered = list.filter(p =>
    (p.name + ' ' + (p.description || '')).toLocaleLowerCase('es').includes(S.search.toLocaleLowerCase('es'))
  );
  const cards = filtered
    .filter(p => matchesProfit(p))
    .sort(compareProducts)
    .map(p => {
      const { unit, price, margin } = productNumbers(p);
      return (
        '<div class="product-card ' +
        (p.status === 'archived' ? 'archived' : '') +
        '">' +
        productPhoto(p, 'product-thumb') +
        '<div class="row" style="justify-content:space-between"><div><div class="status">' +
        (p.status === 'archived' ? 'Archivado' : 'Activo') +
        '</div><h3>' +
        esc(p.name) +
        '</h3></div><span class="badge' +
        (margin < 0 ? ' badge-loss' : '') +
        '">' +
        (margin == null ? (unit === 0 ? 'Sin costo' : 'Sin venta') : pct(margin)) +
        '</span></div><p class="muted">' +
        esc(p.description || 'Sin descripción') +
        '</p><div class="product-stats"><div><span>Costo unitario</span><b>' +
        clp(unit) +
        '</b></div><div><span>Precio final</span><b>' +
        clp(price) +
        '</b></div></div><div class="row">' +
        ('<button class="btn btn-primary" data-open="' + p.id + '">Abrir</button>') +
        (canEdit() && p.status !== 'archived'
          ? '<button class="btn btn-secondary" data-dup="' +
            p.id +
            '">Duplicar</button><button class="btn btn-ghost" data-arc="' +
            p.id +
            '">Archivar</button>'
          : '') +
        (canEdit() && p.status === 'archived'
          ? '<button class="btn btn-secondary" data-rest="' + p.id + '">Restaurar</button>'
          : '') +
        '</div></div>'
      );
    })
    .join('');
  root.innerHTML =
    header(
      'Productos',
      canEdit()
        ? '<button class="btn btn-primary" id="new">' + icon('plus') + '<span>Nuevo producto</span></button>'
        : ''
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="view-tabs"><button class="btn ' +
    (!S.showArchived ? 'btn-primary' : 'btn-secondary') +
    '" id="showActive">Activos (' +
    active.length +
    ')</button><button class="btn ' +
    (S.showArchived ? 'btn-primary' : 'btn-secondary') +
    '" id="showArchived">Archivados (' +
    arch.length +
    ')</button></div><div class="field search-field"><label for="searchProducts">Buscar productos</label><input id="searchProducts" type="search" placeholder="Nombre o descripción…" value="' +
    esc(S.search) +
    '"></div><div class="product-list">' +
    (cards ||
      '<div class="card empty-state"><b>' +
        (S.search
          ? 'Sin resultados para tu búsqueda.'
          : S.showArchived
            ? 'No hay productos archivados.'
            : 'Aún no hay productos.') +
        '</b><p class="muted">' +
        (S.showArchived
          ? 'Los productos archivados aparecerán aquí.'
          : 'Crea el primero para comenzar el costeo.') +
        '</p></div>') +
    '</div></main>';
  common();
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
  qa('[data-open]').forEach(b => (b.onclick = () => openProduct(b.dataset.open)));
  qa('[data-dup]').forEach(b => (b.onclick = () => duplicateProduct(b.dataset.dup)));
  qa('[data-arc]').forEach(b => (b.onclick = () => archiveProduct(b.dataset.arc)));
  qa('[data-rest]').forEach(b => (b.onclick = () => restoreProduct(b.dataset.rest)));
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
          '</h3><div class="row"><button type="button" class="btn btn-secondary dupP">Duplicar</button><button class="btn btn-danger rmP">Quitar</button></div></div><div class="grid grid-4"><div class="field"><label>Etiqueta</label><input class="pl" value="' +
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
          '<div class="row" style="margin-top:12px"><button type="button" class="btn btn-secondary calcP">Calcular filamento + electricidad</button><span class="small muted">Usa la tarifa general y la potencia registrada de la impresora.</span></div></div>'
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
          '"></div><button class="btn btn-danger rmC">Quitar</button></div></div>'
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
    '</textarea></div></section><section class="card" style="margin-top:16px"><div class="section-title"><h2>Impresiones 3D</h2><button class="btn btn-primary" id="addP">+ Agregar impresión</button></div><div id="prints" class="grid">' +
    pRows(p.prints) +
    '</div></section><section class="grid grid-2" style="margin-top:16px"><div class="card"><div class="section-title"><h2>Costos directos</h2><button class="btn btn-secondary" id="addD">+ Agregar</button></div><div class="grid">' +
    cRows(p.directCosts, 'direct') +
    '</div></div><div class="card"><div class="section-title"><h2>Costos adicionales</h2><button class="btn btn-secondary" id="addA">+ Agregar</button></div><div class="grid">' +
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
  q('#del').onclick = deleteProduct;
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
async function deleteProduct() {
  if (!S.product.id) return;
  const ok = await confirmDialog({
    title: 'Eliminar producto',
    body: '«' + S.product.name + '» se eliminará para todo el equipo. Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar',
    danger: true
  });
  if (!ok) return;
  let { error } = await supabase.from('products').delete().eq('id', S.product.id);
  if (error) return fail(error.message);
  removeDraft(S.product.id);
  cleanupPhoto(S.product.saved_photo_path);
  await loadProducts();
  S.mode = 'dashboard';
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
  mountInventoryAlert();
  enhanceFields();
  flashMessages();
  if (S.mode === 'dashboard') {
    showDraftResume();
    mountProductFilters();
  }
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
  if (S.mode === 'inventory') return inventoryView();
  if (S.mode === 'resources') return resourcesView();
  if (S.mode === 'production') return productionView();
  if (S.mode === 'product') return product();
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
    '>+ Color</button></div><p class="small muted">Ingresa el consumo total de cada color indicado por el slicer.</p>' +
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
          '</div><button class="btn btn-ghost rmF" type="button" aria-label="Quitar color">×</button></div>'
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
    productPhoto(S.product) +
    '<div class="field"><label for="photoFile">Foto del producto</label><input id="photoFile" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"><span class="small muted">Se optimiza y se sincroniza al guardar.</span></div><button class="btn btn-ghost" type="button" id="removePhoto" ' +
    (!photoSrc(S.product) && !S.product.photo_path ? 'disabled' : '') +
    '>Quitar foto</button>';
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
    '<button type="button" class="btn btn-primary" id="quote">Compartir cotización</button><span class="small muted">Vista para el cliente, sin costos internos.</span>';
  q('[data-panel="summary"]').prepend(quote);
  const explanation = document.createElement('p');
  explanation.className = 'small muted';
  explanation.textContent =
    'Neto final, IVA y utilidad corresponden al precio sugerido después del redondeo.';
  q('[data-panel="summary"] h2').after(explanation);
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
    el.textContent = 'Guardando en la nube…';
    return;
  }
  if (!S.dirty && S.product?.id) {
    el.textContent = '✓ Guardado en la nube · disponible para tu equipo';
    el.className = 'small sync-cloud';
    return;
  }
  el.className = 'small sync-local';
  if (!el.textContent.startsWith('No se pudo'))
    el.textContent = '● Borrador en este dispositivo · pendiente de guardar en la nube';
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
}
async function goMode(mode) {
  persistDraft();
  S.msg = '';
  S.err = '';
  S.mode = mode;
  try {
    if (mode === 'production') {
      await loadOrders();
      await loadResources();
    }
    if (mode === 'resources' || mode === 'inventory' || mode === 'product') await loadResources();
    if (mode === 'dashboard') await loadProducts();
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
function mountProductFilters() {
  const box = document.createElement('div');
  box.className = 'product-filters row';
  box.innerHTML =
    '<div class="field"><label for="productSort">Ordenar</label><select id="productSort"><option value="recent">Última modificación</option><option value="name">Nombre A–Z</option><option value="price">Precio mayor a menor</option><option value="cost">Costo mayor a menor</option><option value="margin">Margen mayor a menor</option></select></div><div class="field"><label for="profitFilter">Rentabilidad</label><select id="profitFilter"><option value="all">Todos</option><option value="positive">Sin pérdida</option><option value="loss">Con pérdida</option><option value="uncosted">Sin costos registrados</option></select></div>';
  q('.search-field')?.after(box);
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
    });
  });
  const order = document.createElement('button');
  order.id = 'createOrder';
  order.className = 'btn btn-secondary';
  order.textContent = 'Crear pedido de producción';
  order.disabled = !canEdit();
  q('.quote-actions').append(order);
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
  closeOnBackdrop(dialog);
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
function resourcesView() {
  root.innerHTML =
    header('Impresoras') +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    ['printer']
      .map(
        kind =>
          '<section class="card resource-section"><div class="section-title"><h2>' +
          (kind === 'filament' ? 'Filamentos' : 'Impresoras') +
          '</h2>' +
          (canEdit()
            ? '<button class="btn btn-primary" data-add-resource="' + kind + '">+ Agregar</button>'
            : '') +
          '</div><div class="resource-list">' +
          (S.resources
            .filter(r => r.kind === kind)
            .map(
              r =>
                '<div class="resource-row ' +
                (!r.active ? 'inactive' : '') +
                '"><div><b>' +
                esc(r.name) +
                '</b><div class="small muted">' +
                (kind === 'filament'
                  ? esc(r.material) + ' · ' + clp(r.price_per_kg) + '/kg'
                  : n(r.power_kw) + ' kW') +
                ' · ' +
                (r.active ? 'Disponible' : 'Inactivo') +
                '</div></div>' +
                (canEdit()
                  ? '<button class="btn btn-secondary" data-edit-resource="' + r.id + '">Editar</button>'
                  : '') +
                '</div>'
            )
            .join('') ||
            '<p class="muted">Aún no hay ' +
              (kind === 'filament' ? 'filamentos' : 'impresoras') +
              ' registrados.</p>') +
          '</div></section>'
      )
      .join('') +
    '<p class="small muted">Los precios y potencias se copian a la impresión al seleccionarlos. Cambiar el catálogo no modifica productos anteriores.</p></main>';
  common();
  qa('[data-add-resource]').forEach(
    b => (b.onclick = () => showResourceForm({ kind: b.dataset.addResource, active: true }))
  );
  qa('[data-edit-resource]').forEach(
    b => (b.onclick = () => showResourceForm(S.resources.find(r => r.id === b.dataset.editResource)))
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
function productionView() {
  const open = S.orders.filter(o => !['delivered', 'canceled'].includes(o.status)),
    late = open.filter(o => o.due_date && o.due_date < localToday()),
    list = S.orders.filter(
      o =>
        S.orderFilter === 'all' ||
        (S.orderFilter === 'open' && !['delivered', 'canceled'].includes(o.status)) ||
        o.status === S.orderFilter
    );
  root.innerHTML =
    header(
      'Pedidos',
      '<button class="btn icon-btn" id="reloadOrders" type="button" aria-label="Actualizar" title="Actualizar">' +
        icon('refresh-cw') +
        '</button>'
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="production-kpis grid grid-2"><div class="metric"><div class="label">Pedidos en curso</div><div class="value">' +
    open.length +
    '</div></div><div class="metric"><div class="label">Atrasados</div><div class="value ' +
    (late.length ? 'loss-text' : '') +
    '">' +
    late.length +
    '</div></div></div><div class="field order-filter"><label for="orderFilter">Mostrar pedidos</label><select id="orderFilter"><option value="open">En curso</option><option value="all">Todos</option>' +
    Object.entries(ORDER_STATUSES)
      .map(([key, label]) => '<option value="' + key + '">' + label + '</option>')
      .join('') +
    '</select></div><div class="product-list">' +
    (list
      .map(o => {
        const t = orderNumbers(o);
        return (
          '<article class="product-card"><div class="row" style="justify-content:space-between"><span class="badge">Pedido #' +
          o.order_no +
          '</span><span class="status">' +
          ORDER_STATUSES[o.status] +
          '</span></div><h3>' +
          esc(o.title) +
          '</h3><p class="muted">' +
          esc(o.customer_name || 'Sin cliente registrado') +
          ' · ' +
          o.quantity +
          ' un.</p><div class="small ' +
          (o.due_date && o.due_date < localToday() && !['delivered', 'canceled'].includes(o.status)
            ? 'loss-text'
            : 'muted') +
          '">Entrega: ' +
          (o.due_date ? esc(o.due_date.split('-').reverse().join('/')) : 'Por definir') +
          '</div><div class="product-stats"><div><span>Venta total</span><b>' +
          clp(t.sales) +
          '</b></div><div><span>Costo estimado</span><b>' +
          clp(o.estimated_cost) +
          '</b></div></div><div class="small ' +
          (t.actualProfit != null && t.actualProfit < 0 ? 'loss-text' : 'muted') +
          '">' +
          (t.actualProfit == null ? 'Costo real pendiente' : 'Utilidad real: ' + clp(t.actualProfit)) +
          '</div><button class="btn btn-secondary" data-order="' +
          o.id +
          '">Abrir pedido</button></article>'
        );
      })
      .join('') ||
      '<div class="card empty-state"><b>No hay pedidos en esta vista.</b><p class="muted">Abre un producto → Resumen → Crear pedido de producción.</p></div>') +
    '</div></main>';
  common();
  q('#orderFilter').value = S.orderFilter;
  q('#orderFilter').onchange = e => {
    S.orderFilter = e.target.value;
    productionView();
  };
  q('#reloadOrders').onclick = () => goMode('production');
  qa('[data-order]').forEach(
    b => (b.onclick = () => showOrder(S.orders.find(o => o.id === b.dataset.order)))
  );
}
function showNewOrder() {
  if (!canEdit() || !S.product?.id) return;
  const p = S.product,
    t = totals(),
    grams = p.prints.reduce((s, x) => s + n(x.grams), 0),
    minutes = p.prints.reduce((s, x) => s + n(x.hours) * 60 + n(x.minutes), 0);
  const dialog = showDialog(
    'newOrderDialog',
    '<div class="section-title"><h2>Nuevo pedido</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="newOrderForm" class="grid"><b>' +
      esc(p.name) +
      '</b>' +
      fieldHtml('Cliente / referencia', 'orderCustomer') +
      '<div class="grid grid-2">' +
      fieldHtml('Cantidad', 'orderQty', t.qty, 'number', 'min="1" step="1" required') +
      fieldHtml('Precio final por unidad', 'orderPrice', t.rounded, 'number', 'min="0" step="1" required') +
      fieldHtml('Fecha de entrega', 'orderDue', '', 'date') +
      '</div><details class="print-advanced"><summary>Revisar estimación del lote</summary><p class="small muted">Se ajusta proporcionalmente al cambiar la cantidad. Verifica tiempos y costos si imprimes varias piezas en una misma cama.</p><div class="grid grid-2">' +
      fieldHtml(
        'Costo estimado del lote',
        'orderEstimate',
        t.total,
        'number',
        'min="0" step="0.01" required'
      ) +
      fieldHtml('Gramos estimados', 'orderGrams', grams, 'number', 'min="0" step="0.01"') +
      fieldHtml('Horas estimadas', 'orderHours', minutes / 60, 'number', 'min="0" step="0.01"') +
      '</div></details><div class="field"><label for="orderNotes">Notas de producción</label><textarea id="orderNotes"></textarea></div><p class="small muted">Se guardará una copia del precio y la estimación. Cambiar el producto después no altera este pedido.</p><div class="small" id="orderFeedback" role="status"></div><button class="btn btn-primary" type="submit">Confirmar pedido</button></form>'
  );
  q('#orderQty').oninput = () => {
    const ratio = Math.max(1, n(q('#orderQty').value)) / t.qty;
    q('#orderEstimate').value = Math.round(t.total * ratio);
    q('#orderGrams').value = Math.round(grams * ratio * 100) / 100;
    q('#orderHours').value = Math.round((minutes / 60) * ratio * 100) / 100;
    updateNewOrderStock();
  };
  mountNewOrderInventory();
  q('#newOrderForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    try {
      const { error } = await supabase
        .from('production_orders')
        .insert({
          workspace_id: S.workspace.id,
          product_id: p.id,
          title: p.name,
          customer_name: q('#orderCustomer').value.trim(),
          quantity: Math.max(1, Math.floor(n(q('#orderQty').value))),
          unit_price: n(q('#orderPrice').value),
          iva_enabled: p.iva_enabled,
          iva_rate: p.iva_rate,
          estimated_cost: n(q('#orderEstimate').value),
          estimated_grams: n(q('#orderGrams').value),
          estimated_minutes: n(q('#orderHours').value) * 60,
          due_date: q('#orderDue').value || null,
          notes: q('#orderNotes').value.trim()
        })
        .select()
        .single();
      if (error) throw error;
      dialog.close();
      await loadResources();
      S.orderFilter = 'open';
      await goMode('production');
    } catch (error) {
      q('#orderFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
function showOrder(order) {
  const t = orderNumbers(order);
  const dialog = showDialog(
    'orderDialog',
    '<div class="section-title"><h2>Pedido #' +
      order.order_no +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><h3>' +
      esc(order.title) +
      '</h3><button class="btn btn-secondary" id="orderQuote">Cotización del pedido</button><p class="muted">' +
      esc(order.customer_name || 'Sin cliente') +
      ' · ' +
      order.quantity +
      ' un. · Venta ' +
      clp(t.sales) +
      '</p><div class="notice small">Costo estimado: ' +
      clp(order.estimated_cost) +
      ' · ' +
      n(order.estimated_grams) +
      ' g · ' +
      (n(order.estimated_minutes) / 60).toFixed(2) +
      ' h<br>Utilidad estimada: ' +
      clp(t.estimatedProfit) +
      '</div><form id="orderForm" class="grid"><div class="field"><label for="orderStatus">Estado</label><select id="orderStatus">' +
      Object.entries(ORDER_STATUSES)
        .map(([key, label]) => '<option value="' + key + '">' + label + '</option>')
        .join('') +
      '</select></div>' +
      fieldHtml('Entrega', 'actualDue', order.due_date, 'date') +
      '<p class="small muted">Registra totales reales del lote. El costo base incluye filamento, energía, mano de obra y otros costos; las fallas se suman aparte. Vacío significa pendiente, 0 es un valor registrado.</p><div class="grid grid-2">' +
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
      productionView();
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
    ivaRate: n(p.iva_rate)
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
  const d = fromOrder ? { ...quoteDefaults(), ...override } : quoteData();
  q('#quoteDialog')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'quoteDialog';
  dialog.className = 'quote-dialog';
  dialog.innerHTML =
    '<div class="quote-toolbar"><h2>Cotización</h2><button class="btn btn-secondary" id="printQuote">' +
    icon('printer') +
    '<span>Imprimir / PDF</span></button><button class="btn btn-primary" id="shareQuote">' +
    icon('share-2') +
    '<span>Compartir</span></button><button class="btn icon-btn dialog-close" id="closeQuote" aria-label="Cerrar">' +
    icon('x') +
    '</button></div><details class="quote-options"><summary>Datos de la cotización · cliente, plazo y condiciones</summary><div class="grid grid-2">' +
    fieldHtml('Cliente', 'quoteClient', d.client, 'text', 'maxlength="120" placeholder="Nombre o empresa"') +
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
    '</article><p id="quoteFeedback" role="status" class="small muted"></p>';
  document.body.append(dialog);
  closeOnBackdrop(dialog);
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
  q('#closeQuote').onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
  q('#printQuote').onclick = () => {
    update();
    remember();
    window.print();
  };
  q('#shareQuote').onclick = async () => {
    const b = q('#shareQuote');
    b.disabled = true;
    update();
    remember();
    const name = 'Cotizacion-' + d.folio + '.png';
    try {
      const blob = await quoteImage(d),
        file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: 'Cotización ' + d.folio + ' · ' + d.name });
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
  if (!['dashboard', 'production'].includes(S.mode)) return;
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
function inventoryView() {
  const items = inventoryItems(),
    list = items.filter(
      r =>
        (r.name + ' ' + r.material)
          .toLocaleLowerCase('es')
          .includes((S.inventorySearch || '').toLocaleLowerCase('es')) &&
        (!S.inventoryOnlyLow || (r.active && r.counted && availableStock(r) <= n(r.min_stock)))
    );
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
    '<div class="grid grid-2 inventory-kpis"><div class="metric"><div class="label">Valor del stock físico</div><div class="value">' +
    clp(items.filter(r => r.counted).reduce((sum, r) => sum + n(r.stock_qty) * n(r.unit_cost), 0)) +
    '</div></div><div class="metric"><div class="label">Bajo mínimo / sin contar</div><div class="value">' +
    inventoryLow().length +
    ' / ' +
    items.filter(r => !r.counted && r.active).length +
    '</div></div></div><div class="inventory-controls"><div class="field"><label for="inventorySearch">Buscar material</label><input type="search" id="inventorySearch" placeholder="Filamento, marco, papel…" value="' +
    esc(S.inventorySearch || '') +
    '"></div><label class="small"><input id="inventoryOnlyLow" type="checkbox" ' +
    (S.inventoryOnlyLow ? 'checked' : '') +
    '> Solo bajo stock</label><button id="reloadInventory" class="btn btn-secondary">Actualizar</button></div><div class="product-list">' +
    (list
      .map(
        r =>
          '<article class="product-card inventory-card ' +
          (!r.active ? 'inactive' : '') +
          '"><div class="row" style="justify-content:space-between"><span class="badge">' +
          (r.kind === 'filament' ? 'Filamento' : 'Material / insumo') +
          '</span><span class="status ' +
          (r.counted && availableStock(r) <= n(r.min_stock) ? 'loss-text' : '') +
          '">' +
          (!r.active
            ? 'Inactivo'
            : !r.counted
              ? 'Sin conteo'
              : availableStock(r) <= n(r.min_stock)
                ? 'Stock bajo'
                : 'Disponible') +
          '</span></div><h3>' +
          esc(r.name) +
          '</h3><p class="small muted">' +
          esc(r.material || '') +
          ' · ' +
          preciseCost(r.unit_cost) +
          ' / ' +
          esc(r.unit) +
          '</p><div class="inventory-balances"><div><span>Físico</span><b>' +
          stockNumber(r.stock_qty) +
          ' ' +
          esc(r.unit) +
          '</b></div><div><span>Reservado</span><b>' +
          stockNumber(r.reserved_qty) +
          ' ' +
          esc(r.unit) +
          '</b></div><div><span>Disponible</span><b>' +
          stockNumber(availableStock(r)) +
          ' ' +
          esc(r.unit) +
          '</b></div></div><p class="small muted">Alerta en ' +
          stockNumber(r.min_stock) +
          ' ' +
          esc(r.unit) +
          '</p><div class="row">' +
          (canEdit()
            ? '<button class="btn btn-primary" data-stock="' +
              r.id +
              '">' +
              (r.counted ? 'Movimiento' : 'Contar stock') +
              '</button><button class="btn btn-secondary" data-inventory-edit="' +
              r.id +
              '">Editar</button>'
            : '') +
          '<button class="btn btn-ghost" data-ledger="' +
          r.id +
          '">Historial</button></div></article>'
      )
      .join('') ||
      '<div class="card empty-state">' +
        (items.length
          ? 'Sin materiales para este filtro.'
          : 'Agrega filamentos, marcos, papel y otros insumos para comenzar.') +
        '</div>') +
    '</div><p class="small muted">El disponible descuenta las reservas. Los precios usan costo promedio ponderado; ingresa siempre el mismo criterio de IVA. Filamentos se controlan en gramos, incluso si compras bobinas por kilogramo.</p></main>';
  common();
  q('#inventorySearch').oninput = e => {
    const pos = e.target.selectionStart;
    S.inventorySearch = e.target.value;
    inventoryView();
    q('#inventorySearch').focus();
    q('#inventorySearch').setSelectionRange(pos, pos);
  };
  q('#inventoryOnlyLow').onchange = e => {
    S.inventoryOnlyLow = e.target.checked;
    inventoryView();
  };
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
        'Costo por unidad de control CLP',
        'invCost',
        r.unit_cost ?? 0,
        'number',
        'min="0" max="1000000000" step="0.001" required ' + (r.counted ? 'readonly' : '')
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
        ? 'El costo se actualiza con compras. Para corregir una existencia utiliza Movimiento.'
        : 'Después de guardar podrás registrar la cantidad inicial contada y su costo.') +
      '</p><label class="small"><input id="invActive" type="checkbox" ' +
      (r.active ? 'checked' : '') +
      '> Disponible para nuevos productos y pedidos</label><div id="invFeedback" role="status" class="small"></div><button class="btn btn-primary" type="submit">Guardar material</button></form>'
  );
  q('#invKind').value = r.kind;
  q('#invUnit').value = r.unit || 'un';
  const updateKind = () => {
    if (q('#invKind').value === 'filament') {
      q('#invUnit').value = 'g';
      q('#invUnit').disabled = true;
    } else q('#invUnit').disabled = !!r.counted;
  };
  updateKind();
  q('#invKind').onchange = updateKind;
  q('#inventoryForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter;
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
          ...(!r.counted ? { unit_cost: cost, price_per_kg: kind === 'filament' ? cost * 1000 : 0 } : {})
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
    '<div class="section-title"><h2>Materiales del lote</h2><button type="button" id="addRecipe" class="btn btn-secondary">+ Material</button></div><p class="small muted">Cantidades para las ' +
    Math.max(1, n(S.product.quantity)) +
    ' unidades del producto. Se suman a costos directos: reemplaza el costo manual equivalente para evitar duplicarlo. Los filamentos se vinculan desde Impresiones.</p><div class="grid">' +
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
          '</b><button class="btn btn-ghost" data-remove-material="' +
          i +
          '" type="button" aria-label="Quitar material">×</button></div>'
      )
      .join('') +
    '</div><button id="refreshMaterialPrices" type="button" class="btn btn-secondary">Actualizar precios desde inventario</button><details><summary>Disponibilidad para este lote</summary><div id="recipeStock"></div></details><p class="small muted">Guardar un producto no descuenta stock. Los pedidos reservan; confirmar el consumo o marcar Listo descuenta una sola vez.</p>';
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
      productionView();
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
  { mode: 'dashboard', label: 'Productos', icon: 'package' },
  { mode: 'production', label: 'Pedidos', icon: 'clipboard-list' },
  { mode: 'inventory', label: 'Inventario', icon: 'boxes' },
  { mode: 'resources', label: 'Impresoras', icon: 'printer' }
];
const PAGE_TITLES = {
  dashboard: 'Productos',
  production: 'Pedidos',
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
    actions +
    '</div></header>'
  );
}
function accountMenuItems() {
  return (
    (isOwner()
      ? '<button type="button" class="menu-item" id="invite">' + icon('user-plus') + 'Invitar socio</button>'
      : '') +
    '<button type="button" class="menu-item" id="changePassword">' +
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
    '" alt="Kultiverso Pop"><nav class="side-nav app-nav" aria-label="Navegación principal">' +
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
    NAV_ITEMS.map(
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
    ).join('') +
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
}
// Close the account menu when clicking anywhere else.
document.addEventListener('click', e => {
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
      '</span></div></div><div class="menu-list">' +
      (isOwner()
        ? '<button type="button" class="menu-item" data-more="invite">' +
          icon('user-plus') +
          'Invitar socio</button>'
        : '') +
      '<button type="button" class="menu-item" data-more="password">' +
      icon('key-round') +
      'Cambiar contraseña</button><button type="button" class="menu-item danger" data-more="logout">' +
      icon('log-out') +
      'Cerrar sesión</button></div><p class="powered">Kultiverso Pop · Powered by <b>ELARA</b></p>'
  );
  dialog.classList.add('sheet');
  const actions = {
    invite: () => invite(),
    password: () => showPasswordDialog(),
    logout: () => supabase.auth.signOut()
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
    let answer = false;
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
    dialog.addEventListener('close', () => resolve(answer));
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.querySelector('[data-confirm]').onclick = () => {
      answer = true;
      dialog.close();
    };
  });
}

// Start the app once every module-level constant above is initialized.
init();
