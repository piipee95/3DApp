'use strict';
// Núcleo: conexión a Supabase, estado (S), utilidades de formato y registro de errores.
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
function fail(m) {
  S.err = m;
  logError('handled', m);
  render();
}
// Error log: what any team member hits is stored (max 20 different errors per session) for review.
// Shown in every screen header and stored with errors; keep it in step with CACHE in sw.js.
const APP_VERSION = 'v5.3.1';
// 5.0: what KultiApp is, shown under the name (login, title, installed app). Change it here and in
// index.html <title>/description and manifest.webmanifest.
const APP_TAGLINE = 'El taller bajo control';
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
// V1.5: one quotation model drives the dialog, the print/PDF view and the shared PNG.
const LOGO_SRC = 'assets/kultiverso-pop-logo.webp';
const longDate = d => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
const stockNumber = v => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(n(v));
const preciseCost = v =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 3 }).format(
    n(v)
  );
// ---------------------------------------------------------------------------
// V1.9: global search (Ctrl/⌘ K) and installable app.
// ---------------------------------------------------------------------------
const fold = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es');
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
function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d + days).toLocaleDateString('sv-SE');
}
