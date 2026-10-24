import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const client = createClient(
  'https://fczmkdkhyalksmczeyda.supabase.co',
  'sb_publishable_M0tikDD2Y9L3B83lJpTcsA_IWuEz5JR',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);
const slug = (new URLSearchParams(location.search).get('c') || location.hash.slice(1)).toLowerCase(),
  box = document.querySelector('#catalog'),
  intro = document.querySelector('#catalogIntro');
const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const clp = v => '$' + Math.round(Number(v) || 0).toLocaleString('es-CL');
async function photoUrls(paths) {
  if (!paths.length) return new Map();
  try {
    const { data } = await client.storage.from('product-photos').createSignedUrls(paths, 3600);
    return new Map((data || []).filter(s => s.signedUrl).map((s, i) => [s.path || paths[i], s.signedUrl]));
  } catch {
    return new Map();
  }
}
async function load() {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) throw new Error('Catálogo no disponible');
  const { data: c, error } = await client.rpc('public_catalog', { p_slug: slug });
  if (error) throw error;
  const urls = await photoUrls(c.items.map(i => i.photo_path).filter(Boolean)),
    want = i =>
      'https://wa.me/' +
      c.whatsapp +
      '?text=' +
      encodeURIComponent(
        'Hola, me interesa «' +
          i.name +
          '»' +
          (i.price != null ? ' (' + clp(i.price) + ')' : '') +
          ' del catálogo.'
      );
  document.title = 'Catálogo · ' + (c.business || 'Kultiverso Pop');
  intro.innerHTML =
    '<h1>' + esc(c.business) + '</h1>' + (c.intro ? '<p class="muted">' + esc(c.intro) + '</p>' : '');
  box.innerHTML = c.items.length
    ? c.items
        .map(
          i =>
            '<article class="catalog-card">' +
            (urls.get(i.photo_path)
              ? '<img src="' + esc(urls.get(i.photo_path)) + '" alt="' + esc(i.name) + '" loading="lazy">'
              : '<div class="catalog-noimg">3D</div>') +
            '<div class="catalog-body"><h2>' +
            esc(i.name) +
            '</h2>' +
            (i.description ? '<p class="muted">' + esc(i.description) + '</p>' : '') +
            '<div class="catalog-meta"><b' +
            (i.price != null ? '>' : ' class="ask">') +
            (i.price != null ? clp(i.price) : 'Precio a consultar') +
            '</b><span class="chip ' +
            (i.in_stock ? 'c-ready">Disponible' : 'c-printing">Por encargo') +
            '</span></div>' +
            (c.whatsapp
              ? '<a class="btn btn-primary" href="' +
                esc(want(i)) +
                '" target="_blank" rel="noopener">Lo quiero</a>'
              : '') +
            '</div></article>'
        )
        .join('')
    : '<p class="muted">Pronto publicaremos productos aquí.</p>';
}
load().catch(() => {
  box.innerHTML = '<p class="muted">Este catálogo no existe o no está publicado.</p>';
});
