import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const client = createClient(
  'https://fczmkdkhyalksmczeyda.supabase.co',
  'sb_publishable_M0tikDD2Y9L3B83lJpTcsA_IWuEz5JR',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);
const token = location.hash.slice(1),
  box = document.querySelector('#tracking');
const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const clp = v => '$' + Math.round(Number(v) || 0).toLocaleString('es-CL');
const date = iso =>
  new Date(String(iso).length === 10 ? iso + 'T12:00' : iso).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long'
  });
// The customer sees the production steps; "armado" counts as still being made.
const STEPS = [
  ['pending', 'Recibido', 'Tu pedido está en la fila de producción.'],
  ['printing', 'En impresión', 'Estamos imprimiendo tu pedido.'],
  ['assembly', 'Terminaciones', 'Lo estamos armando y dando los últimos detalles.'],
  ['ready', 'Listo', 'Tu pedido está listo para entrega o retiro.'],
  ['delivered', 'Entregado', '¡Gracias por tu compra!']
];
async function photos(folder) {
  try {
    const { data, error } = await client.storage.from('product-photos').list(folder, { limit: 12 });
    if (error || !data?.length) return [];
    const paths = data.filter(f => f.name && !f.name.startsWith('.')).map(f => folder + '/' + f.name);
    if (!paths.length) return [];
    const { data: signed } = await client.storage.from('product-photos').createSignedUrls(paths, 3600);
    return (signed || []).map(s => s.signedUrl).filter(Boolean);
  } catch {
    return [];
  }
}
async function load() {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Enlace no disponible');
  const { data: o, error } = await client.rpc('order_tracking', { p_token: token });
  if (error) throw error;
  const at = STEPS.findIndex(s => s[0] === o.status),
    canceled = o.status === 'canceled',
    pics = await photos(o.photos_folder),
    wa = o.whatsapp
      ? 'https://wa.me/' +
        o.whatsapp +
        '?text=' +
        encodeURIComponent('Hola, te escribo por mi pedido PED-' + o.order_no + ' (' + o.title + ').')
      : '';
  document.title = 'Pedido PED-' + o.order_no + ' · ' + (o.business || 'Kultiverso Pop');
  box.innerHTML =
    '<p class="small muted">Pedido PED-' +
    esc(o.order_no) +
    ' · ' +
    esc(o.business) +
    '</p><h1>' +
    esc(o.title) +
    '</h1><p class="muted">' +
    esc(o.quantity) +
    (o.quantity === 1 ? ' unidad' : ' unidades') +
    ' · pedido el ' +
    date(o.created_at) +
    '</p>' +
    (canceled
      ? '<div class="notice">Este pedido fue cancelado. Si tienes dudas, escríbenos.</div>'
      : '<ol class="track-steps">' +
        STEPS.map(
          ([, label, help], i) =>
            '<li class="' +
            (i < at ? 'done' : i === at ? 'now' : '') +
            '"><b>' +
            label +
            '</b>' +
            (i === at ? '<span>' + help + '</span>' : '') +
            '</li>'
        ).join('') +
        '</ol>' +
        (o.due_date && at < 3
          ? '<p class="track-due">Entrega estimada: <b>' + date(o.due_date) + '</b></p>'
          : '')) +
    (o.total > 0
      ? '<dl class="track-money"><div><dt>Total</dt><dd>' +
        clp(o.total) +
        '</dd></div><div><dt>Pagado</dt><dd>' +
        clp(o.paid) +
        '</dd></div><div><dt>Saldo</dt><dd class="' +
        (o.balance > 0 ? 'warn' : 'up') +
        '">' +
        (o.balance > 0 ? clp(o.balance) : 'Pagado') +
        '</dd></div></dl>'
      : '') +
    (pics.length
      ? '<h2 class="track-h">Fotos de tu pedido</h2><div class="order-photos">' +
        pics
          .map(
            u =>
              '<figure><a href="' +
              esc(u) +
              '" target="_blank" rel="noopener"><img src="' +
              esc(u) +
              '" alt="Foto del pedido" loading="lazy"></a></figure>'
          )
          .join('') +
        '</div>'
      : '') +
    (wa
      ? '<a class="btn btn-primary track-wa" href="' +
        esc(wa) +
        '" target="_blank" rel="noopener">Escribir por WhatsApp</a>'
      : '') +
    (o.contact ? '<p class="small muted">' + esc(o.contact) + '</p>' : '') +
    '<p class="small muted">Actualizado el ' +
    date(o.updated_at) +
    '. Abre este mismo enlace cuando quieras para ver el avance.</p>';
}
load().catch(() => {
  box.innerHTML =
    '<h1>Enlace no disponible</h1><p class="muted">Este enlace de seguimiento no existe o fue desactivado. Pide uno nuevo a Kultiverso Pop.</p>';
});
