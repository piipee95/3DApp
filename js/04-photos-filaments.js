'use strict';
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
