'use strict';
// Supabase client factory comes from js/supabase-client.js (an ES module loaded first).
const createClient = window.createSupabaseClient;
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
  expenses: [],
  priceLists: [],
  transfers: [],
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
const PRODUCT_LIST_COLUMNS =
  'id,workspace_id,name,description,quantity,iva_enabled,iva_rate,target_margin,round_to,status,sale_price,photo_path,stock_qty,stock_reserved,catalog_visible,catalog_price,created_at,updated_at';
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
  logError('handled', m);
  render();
}
// Error log: what any team member hits is stored (max 20 different errors per session) for review.
// Shown in every screen header and stored with errors; keep it in step with CACHE in sw.js.
const APP_VERSION = 'v4.2';
const loggedErrors = new Set();
function logError(kind, message, stack = '') {
  try {
    message = String(message || '')
      .trim()
      .slice(0, 1000);
    if (!message || !S.session || !S.workspace || loggedErrors.size >= 20 || loggedErrors.has(message))
      return;
    loggedErrors.add(message);
    const pending = supabase.from?.('app_errors')?.insert?.({
      workspace_id: S.workspace.id,
      kind,
      message,
      stack: String(stack || '').slice(0, 4000),
      screen: String(S.mode || '').slice(0, 40),
      app_version: APP_VERSION,
      user_agent: navigator.userAgent.slice(0, 300)
    });
    pending?.then?.(
      () => {},
      () => {}
    );
  } catch {}
}
window.addEventListener('error', e => logError('error', e.message, e.error?.stack));
window.addEventListener('unhandledrejection', e =>
  logError('rejection', e.reason?.message || String(e.reason), e.reason?.stack)
);
function authView() {
  root.innerHTML =
    '<div class="shell"><div class="auth card"><img class="auth-logo" src="' +
    LOGO_SRC +
    '" alt="Kultiverso Pop"><h1>KultiApp <span class="app-version">' +
    APP_VERSION +
    '</span></h1><p class="muted">Costos y producción 3D</p><p class="small muted">Kultiverso Pop · Powered by ELARA</p>' +
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
