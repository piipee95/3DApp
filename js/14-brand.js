'use strict';
// Kit de marca: the official graphic resources of the team (logos, cards, social, labels, app/web).
// Originals live untouched in the private bucket «brand-assets»; metadata in brand_assets.
// Members view and download; owners and editors upload, edit, archive and delete.
const BRAND_BUCKET = 'brand-assets',
  BRAND_MAX_BYTES = 52428800,
  // Supabase free plan: 1 GB of storage for the whole project (every bucket together).
  PLAN_STORAGE_BYTES = 1073741824,
  BRAND_URL_TTL = 3600;
const BRAND_CATEGORIES = {
  logos: 'Logotipos e isotipos',
  business_cards: 'Tarjetas de presentación',
  thanks: 'Tarjetas y cartas de agradecimiento',
  social: 'Redes sociales',
  labels: 'Etiquetas y stickers',
  app_web: 'Recursos de la app y del sitio web',
  other: 'Otros recursos'
};
const BRAND_BACKGROUNDS = { light: 'Fondo claro', dark: 'Fondo oscuro', transparent: 'Transparente' };
const BRAND_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/zip': 'zip'
};
const BRAND_EXTENSIONS = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  zip: 'application/zip'
};
const BRAND_ACCEPT = '.png,.jpg,.jpeg,.webp,.svg,.pdf,.zip';
// What a complete kit has. Missing items are listed with a button to upload them.
const BRAND_EXPECTED = [
  ['logos', 'Logo para fondo claro', a => a.background === 'light', { background: 'light' }],
  ['logos', 'Logo para fondo oscuro', a => a.background === 'dark', { background: 'dark' }],
  ['logos', 'Logo transparente', a => a.background === 'transparent', { background: 'transparent' }],
  ['business_cards', 'Tarjeta de presentación', () => true, {}],
  ['thanks', 'Tarjeta o carta de agradecimiento', () => true, {}],
  ['social', 'Foto de perfil de WhatsApp', a => /whatsapp/.test(fold(a.name)), { name: 'Perfil WhatsApp' }],
  [
    'social',
    'Foto de perfil de Instagram',
    a => /instagram/.test(fold(a.name)),
    { name: 'Perfil Instagram' }
  ],
  ['social', 'Portada', a => /portada/.test(fold(a.name)), { name: 'Portada' }],
  ['social', 'Plantilla de publicación', a => /publicacion|post/.test(fold(a.name)), { name: 'Publicación' }],
  ['labels', 'Etiqueta o sticker', () => true, {}],
  ['app_web', 'Íconos de la app', () => true, {}]
];
// Files already in the app: imported byte for byte, never redrawn. The official logo and icons are
// marked official; the WhatsApp pieces (the official logo placed, unchanged, on the icons' dark
// background in WhatsApp's formats) wait for the team's approval.
const BRAND_APP_FILES = [
  ['assets/kultiverso-pop-logo.webp', 'logos', 'Logo Kultiverso Pop', 'transparent', true],
  ['favicon.svg', 'app_web', 'Ícono de la app (SVG)', null, true],
  ['assets/icon-512.png', 'app_web', 'Ícono de la app 512 px', null, true],
  ['assets/icon-192.png', 'app_web', 'Ícono de la app 192 px', null, true],
  ['assets/icon-maskable-512.png', 'app_web', 'Ícono adaptable (maskable) 512 px', null, true],
  ['assets/apple-touch-icon.png', 'app_web', 'Ícono para iPhone 180 px', null, true],
  [
    'assets/brand/whatsapp-perfil-640.png',
    'social',
    'Perfil WhatsApp (logo)',
    null,
    false,
    'Foto de perfil de WhatsApp y WhatsApp Business: 640×640 px, el logo completo cabe en el recorte circular.'
  ],
  [
    'assets/brand/whatsapp-portada-1920x1080.png',
    'social',
    'Portada WhatsApp',
    null,
    false,
    'Portada de WhatsApp Business o imagen horizontal para compartir (1920×1080 px).'
  ],
  [
    'assets/brand/whatsapp-estado-1080x1920.png',
    'social',
    'Estado WhatsApp',
    null,
    false,
    'Estados de WhatsApp e historias (vertical 1080×1920 px).'
  ]
];

const brandExt = a => BRAND_TYPES[a.mime_type] || '';
const brandIsImage = a => /^image\//.test(a.mime_type);
function brandBytes(v) {
  const x = n(v);
  if (x >= 1073741824) return (x / 1073741824).toLocaleString('es-CL', { maximumFractionDigits: 2 }) + ' GB';
  if (x >= 1048576) return (x / 1048576).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' MB';
  return Math.max(1, Math.round(x / 1024)).toLocaleString('es-CL') + ' KB';
}
// The type is taken from the browser, or from the extension when the browser leaves it empty
// (SVG and ZIP on some systems).
function brandMime(file) {
  if (BRAND_TYPES[file.type]) return file.type;
  if (/zip/.test(file.type)) return 'application/zip';
  return BRAND_EXTENSIONS[(String(file.name).split('.').pop() || '').toLowerCase()] || '';
}
const brandBaseName = file =>
  String(file.name)
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 160);

// ---- Data ----
async function loadBrandAssets() {
  const { data, error } = await supabase
    .from('brand_assets')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  S.brandAssets = data || [];
  await loadBrandUrls(S.brandAssets.filter(brandIsImage));
}
// Signed links for previews (images, also SVG inside <img>, where its scripts never run).
async function loadBrandUrls(list) {
  S.brandUrls ??= new Map();
  const paths = list.map(a => a.object_path).filter(p => !(S.brandUrls.get(p)?.exp > Date.now() + 60000));
  if (!paths.length) return;
  try {
    const { data, error } = await supabase.storage.from(BRAND_BUCKET).createSignedUrls(paths, BRAND_URL_TTL);
    if (error) throw error;
    const exp = Date.now() + BRAND_URL_TTL * 1000 - 60000;
    for (const x of data || []) if (x.signedUrl) S.brandUrls.set(x.path, { url: x.signedUrl, exp });
  } catch (e) {
    console.warn('No se pudieron cargar las vistas previas del kit', e);
  }
}
const brandUrl = a => S.brandUrls?.get(a.object_path)?.url || '';
async function loadBrandUsage() {
  try {
    const { data, error } = await supabase.rpc('brand_storage_usage', { p_workspace: S.workspace.id });
    if (error) throw error;
    S.brandUsage = data;
  } catch (e) {
    console.warn('No se pudo leer el uso de almacenamiento', e);
  }
}
const brandGroup = a => (S.brandAssets || []).filter(x => x.group_id === a.group_id);
// The gallery shows one card per design: its current version (or the newest one).
function brandDesigns(archived = false) {
  const groups = new Map();
  for (const a of S.brandAssets || []) {
    if (!!a.archived_at !== archived) continue;
    const g = groups.get(a.group_id);
    if (!g || (a.is_current && !g.is_current)) groups.set(a.group_id, a);
  }
  return [...groups.values()];
}
function brandMissing() {
  const live = brandDesigns(false);
  return BRAND_EXPECTED.filter(([cat, , match]) => !live.some(a => a.category === cat && match(a)));
}
const brandPref = () => {
  try {
    return localStorage.getItem('kultiapp_brand_filter') || 'all';
  } catch {
    return 'all';
  }
};

// ---- Gallery ----
function brandThumb(a, cls = 'brand-thumb') {
  const url = brandIsImage(a) && brandUrl(a);
  if (url)
    return (
      '<span class="' +
      cls +
      (a.background === 'dark' ? ' on-light' : a.background === 'light' ? ' on-dark' : ' checker') +
      '"><img src="' +
      esc(url) +
      '" alt="" loading="lazy"></span>'
    );
  return (
    '<span class="' +
    cls +
    ' file"><span class="brand-file">' +
    icon(a.mime_type === 'application/zip' ? 'archive' : 'file-text') +
    '<b>' +
    brandExt(a).toUpperCase() +
    '</b></span></span>'
  );
}
function brandMeta(a) {
  return (
    brandExt(a).toUpperCase() +
    ' · ' +
    brandBytes(a.byte_size) +
    (a.width && a.height ? ' · ' + a.width + '×' + a.height + ' px' : '')
  );
}
function brandView() {
  S.brandFilter ??= brandPref();
  const filter = S.brandFilter,
    term = S.brandSearch || '',
    edit = canEdit(),
    live = brandDesigns(false),
    archived = brandDesigns(true),
    base = filter === 'archived' ? archived : live,
    list = base
      .filter(a =>
        filter === 'all' || filter === 'archived'
          ? true
          : filter === 'favorite'
            ? a.favorite
            : filter === 'official'
              ? a.official
              : a.category === filter
      )
      .filter(a =>
        searchMatches(
          [a.name, a.description, a.usage, a.copy_text, a.original_name, BRAND_CATEGORIES[a.category]].join(
            ' '
          ),
          term
        )
      )
      .sort(
        (a, b) => Number(b.favorite) - Number(a.favorite) || Number(b.official) - Number(a.official) || 0
      ),
    missing = brandMissing(),
    usage = S.brandUsage;
  const pills = [
    ['all', 'Todos', live.length],
    ...Object.entries(BRAND_CATEGORIES).map(([k, label]) => [
      k,
      label,
      live.filter(a => a.category === k).length
    ]),
    ['favorite', 'Favoritos', live.filter(a => a.favorite).length],
    ['official', 'Oficiales', live.filter(a => a.official).length],
    ['archived', 'Archivados', archived.length]
  ].filter(([k, , c]) => c > 0 || ['all', filter].includes(k) || BRAND_CATEGORIES[k]);
  root.innerHTML =
    header(
      'Kit de marca',
      edit
        ? '<button class="btn btn-primary" id="brandUpload" type="button">' +
            icon('upload') +
            '<span>Subir recursos</span></button>'
        : ''
    ) +
    '<main class="shell brand-page">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<section class="panel brand-limits"><div><b>Almacenamiento</b><span class="small muted">' +
    (usage
      ? 'Kit de marca: ' +
        brandBytes(usage.kit || 0) +
        ' · Todo KultiApp: ' +
        brandBytes(usage.project || 0) +
        ' de ' +
        brandBytes(PLAN_STORAGE_BYTES) +
        ' del plan gratuito de Supabase (compartido con fotos y archivos de clientes)'
      : 'El plan gratuito de Supabase incluye ' +
        brandBytes(PLAN_STORAGE_BYTES) +
        ' para todos los archivos de KultiApp') +
    '</span>' +
    (usage
      ? '<span class="level brand-level' +
        (usage.project / PLAN_STORAGE_BYTES > 0.8 ? ' low' : ' ok') +
        '"><i style="width:' +
        Math.min(100, Math.max(1, Math.round((n(usage.project) / PLAN_STORAGE_BYTES) * 100))) +
        '%"></i></span>'
      : '') +
    '</div><span class="small muted">Hasta ' +
    brandBytes(BRAND_MAX_BYTES) +
    ' por archivo · PNG, JPG, WebP, SVG, PDF y ZIP · se guardan originales, sin compresión ni cambios de tamaño</span></section>' +
    (missing.length && filter !== 'archived'
      ? '<details class="panel brand-missing"' +
        (live.length < 4 ? ' open' : '') +
        '><summary class="panel-h"><h2>' +
        icon('circle-alert') +
        'Faltan en el kit</h2><span class="small muted">' +
        missing.length +
        (missing.length === 1 ? ' recurso' : ' recursos') +
        icon('chevron-down') +
        '</span></summary><div class="brand-missing-list">' +
        missing
          .map(
            ([cat, label], i) =>
              '<div class="brand-missing-row"><span><b>' +
              esc(label) +
              '</b><span class="small muted">' +
              esc(BRAND_CATEGORIES[cat]) +
              '</span></span>' +
              (edit
                ? '<button type="button" class="btn btn-ghost btn-sm" data-brand-missing="' +
                  i +
                  '">' +
                  icon('upload') +
                  'Subir</button>'
                : '') +
              '</div>'
          )
          .join('') +
        '</div>' +
        (edit && brandAppPending().length
          ? '<div class="brand-import"><span class="small muted">KultiApp ya tiene ' +
            brandAppPending().length +
            ' archivos de la marca: logo, íconos y piezas para WhatsApp (foto de perfil, portada y estado). Agrégalos al kit tal cual.</span><button type="button" class="btn btn-secondary btn-sm" id="brandImport">' +
            icon('download') +
            'Agregar archivos de la app</button></div>'
          : '') +
        '</details>'
      : '') +
    (edit
      ? '<label class="brand-drop" id="brandDrop" for="brandFiles">' +
        icon('upload') +
        '<span><b>Arrastra archivos aquí o toca para elegir</b><span class="small muted">PNG, JPG, WebP, SVG, PDF o ZIP · hasta ' +
        brandBytes(BRAND_MAX_BYTES) +
        ' cada uno</span></span><input type="file" id="brandFiles" accept="' +
        BRAND_ACCEPT +
        '" multiple hidden></label>'
      : '') +
    '<div class="toolbar">' +
    searchBox('brandSearch', 'Buscar recurso, texto o uso', term) +
    '</div>' +
    filterPills(pills, filter, 'data-brand-filter') +
    (list.length
      ? '<section class="brand-grid">' +
        list
          .map(a => {
            const versions = brandGroup(a).length;
            return (
              '<button type="button" class="brand-card" data-brand="' +
              a.id +
              '">' +
              brandThumb(a) +
              '<span class="brand-badges">' +
              (a.official ? '<span class="chip c-ready">' + icon('badge-check') + 'Oficial</span>' : '') +
              (a.favorite ? '<span class="chip c-late">' + icon('heart') + 'Favorito</span>' : '') +
              '</span><span class="brand-info"><b>' +
              esc(a.name) +
              '</b><span class="small muted">' +
              esc(BRAND_CATEGORIES[a.category]) +
              (a.background ? ' · ' + BRAND_BACKGROUNDS[a.background] : '') +
              '</span><span class="small muted">' +
              brandMeta(a) +
              (versions > 1 ? ' · ' + versions + ' versiones' : '') +
              '</span></span></button>'
            );
          })
          .join('') +
        '</section>'
      : '<section class="panel"><div class="panel-empty">' +
        icon(term ? 'search' : 'palette') +
        '<b>' +
        (term
          ? 'Sin resultados'
          : filter === 'archived'
            ? 'No hay recursos archivados'
            : 'Aún no hay recursos aquí') +
        '</b><span>' +
        (term
          ? 'Prueba con otra palabra o filtro.'
          : edit
            ? 'Sube logos, tarjetas, piezas para redes y etiquetas: se guardan los archivos originales.'
            : 'Cuando el equipo suba recursos aparecerán aquí.') +
        '</span></div></section>') +
    '</main>';
  common();
  bindSearch('brandSearch', v => (S.brandSearch = v), brandView);
  qa('[data-brand-filter]').forEach(
    b =>
      (b.onclick = () => {
        S.brandFilter = b.dataset.brandFilter;
        try {
          localStorage.setItem('kultiapp_brand_filter', S.brandFilter);
        } catch {}
        brandView();
      })
  );
  qa('[data-brand]').forEach(
    b => (b.onclick = () => showBrandAsset((S.brandAssets || []).find(a => a.id === b.dataset.brand)))
  );
  qa('[data-brand-missing]').forEach(
    b =>
      (b.onclick = () => {
        const [cat, label, , preset] = missing[n(b.dataset.brandMissing)];
        pickBrandFiles({ category: cat, name: preset.name || label, background: preset.background || null });
      })
  );
  q('#brandImport')?.addEventListener('click', importBrandAppFiles);
  q('#brandUpload')?.addEventListener('click', () =>
    pickBrandFiles({ category: BRAND_CATEGORIES[filter] ? filter : 'other' })
  );
  const input = q('#brandFiles'),
    drop = q('#brandDrop');
  if (input)
    input.onchange = () => {
      if (input.files.length)
        showBrandUpload([...input.files], { category: BRAND_CATEGORIES[filter] ? filter : 'other' });
      input.value = '';
    };
  if (drop) {
    drop.addEventListener('dragover', e => {
      e.preventDefault();
      drop.classList.add('drag-over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag-over');
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) showBrandUpload(files, { category: BRAND_CATEGORIES[filter] ? filter : 'other' });
    });
  }
}
// Opens the file chooser with the upload preset (category, name, background or variant).
function pickBrandFiles(preset = {}) {
  if (!canEdit()) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = BRAND_ACCEPT;
  input.multiple = !preset.groupOf;
  input.onchange = () => input.files.length && showBrandUpload([...input.files], preset);
  input.click();
}

// ---- Upload ----
function brandFileProblem(file) {
  if (!brandMime(file)) return 'Formato no admitido: usa PNG, JPG, WebP, SVG, PDF o ZIP.';
  if (!file.size) return 'El archivo está vacío.';
  if (file.size > BRAND_MAX_BYTES)
    return 'Supera ' + brandBytes(BRAND_MAX_BYTES) + ', el máximo por archivo.';
  return '';
}
async function brandImageSize(file, mime) {
  if (!/^image\//.test(mime) || typeof URL.createObjectURL !== 'function') return {};
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    return img.naturalWidth > 0 && img.naturalHeight > 0
      ? { width: img.naturalWidth, height: img.naturalHeight }
      : {};
  } catch {
    return {};
  } finally {
    URL.revokeObjectURL(url);
  }
}
// Uploads one original unchanged and records it. On a failed record the object is removed again.
async function uploadBrandFile(file, meta) {
  const mime = brandMime(file),
    path = S.workspace.id + '/brand/' + crypto.randomUUID() + '.' + BRAND_TYPES[mime];
  const size = await brandImageSize(file, mime),
    previous =
      meta.group_id && meta.is_current
        ? (S.brandAssets || []).find(x => x.group_id === meta.group_id && x.is_current)
        : null;
  const { error } = await supabase.storage
    .from(BRAND_BUCKET)
    .upload(path, file, { contentType: mime, cacheControl: '3600', upsert: false });
  if (error) throw error;
  try {
    if (meta.group_id && meta.is_current) await setBrandCurrentOff(meta.group_id);
    const { data, error: ie } = await supabase
      .from('brand_assets')
      .insert({
        workspace_id: S.workspace.id,
        category: meta.category,
        name: meta.name,
        background: meta.category === 'logos' ? meta.background || null : null,
        object_path: path,
        original_name: String(file.name).slice(0, 255),
        mime_type: mime,
        byte_size: file.size,
        official: !!meta.official,
        usage: meta.usage || '',
        is_current: meta.is_current !== false,
        variant_label: meta.variant_label || '',
        ...(meta.group_id ? { group_id: meta.group_id } : {}),
        ...size
      })
      .select()
      .single();
    if (ie) throw ie;
    return data;
  } catch (error) {
    await supabase.storage.from(BRAND_BUCKET).remove([path]);
    if (previous) await setBrandCurrent(previous).catch(() => {});
    throw error;
  }
}
function showBrandUpload(files, preset = {}) {
  if (!canEdit() || !files.length) return;
  const rows = files.map(f => ({ file: f, problem: brandFileProblem(f) })),
    ok = rows.filter(r => !r.problem),
    total = ok.reduce((s, r) => s + r.file.size, 0),
    free = PLAN_STORAGE_BYTES - n(S.brandUsage?.project),
    variant = preset.groupOf;
  const categorySelect = (id, value) =>
    '<select id="' +
    id +
    '">' +
    Object.entries(BRAND_CATEGORIES)
      .map(([k, v]) => '<option value="' + k + '"' + (k === value ? ' selected' : '') + '>' + v + '</option>')
      .join('') +
    '</select>';
  const dialog = showDialog(
    'brandUploadDialog',
    '<div class="section-title"><h2>' +
      (variant
        ? 'Nueva versión · ' + esc(variant.name)
        : files.length === 1
          ? 'Subir recurso'
          : 'Subir ' + files.length + ' recursos') +
      '</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><form id="brandUploadForm" class="grid">' +
      rows
        .map(
          (r, i) =>
            '<div class="brand-up-row' +
            (r.problem ? ' bad' : '') +
            '"><div class="brand-up-head"><b>' +
            esc(r.file.name) +
            '</b><span class="small muted">' +
            esc(
              (
                BRAND_TYPES[brandMime(r.file)] ||
                String(r.file.name).split('.').pop() ||
                'archivo'
              ).toUpperCase()
            ) +
            ' · ' +
            brandBytes(r.file.size) +
            '</span></div>' +
            (r.problem
              ? '<p class="small down">' + esc(r.problem) + '</p>'
              : variant
                ? fieldHtml(
                    'Nombre de la versión',
                    'buLabel' + i,
                    '',
                    'text',
                    'maxlength="80" placeholder="Ej. versión con fondo negro"'
                  )
                : '<div class="grid grid-2">' +
                  fieldHtml(
                    'Nombre',
                    'buName' + i,
                    files.length === 1 && preset.name ? preset.name : brandBaseName(r.file),
                    'text',
                    'required maxlength="160"'
                  ) +
                  '<div class="field"><label for="buCat' +
                  i +
                  '">Categoría</label>' +
                  categorySelect('buCat' + i, preset.category || 'other') +
                  '</div></div><div class="field brand-bg-field"><label for="buBg' +
                  i +
                  '">Fondo (logotipos)</label><select id="buBg' +
                  i +
                  '"><option value="">Sin indicar</option>' +
                  Object.entries(BRAND_BACKGROUNDS)
                    .map(
                      ([k, v]) =>
                        '<option value="' +
                        k +
                        '"' +
                        (k === preset.background ? ' selected' : '') +
                        '>' +
                        v +
                        '</option>'
                    )
                    .join('') +
                  '</select></div>') +
            '</div>'
        )
        .join('') +
      (variant
        ? '<label class="check-row"><input type="checkbox" id="buCurrent" checked> <span><b>Usar como versión vigente</b><span class="small muted">La versión actual queda guardada como anterior.</span></span></label>'
        : '<label class="check-row"><input type="checkbox" id="buOfficial"> <span><b>Marcar como oficial</b><span class="small muted">Diseño aprobado de Kultiverso Pop.</span></span></label>') +
      '<p class="small muted">Se sube el archivo original: sin compresión, conversión ni cambios de tamaño. ' +
      brandBytes(total) +
      ' en total' +
      (S.brandUsage ? '; quedan ' + brandBytes(Math.max(0, free)) + ' en el plan gratuito.' : '.') +
      '</p><div id="brandUploadFeedback" class="small" role="status"></div><div class="dialog-actions"><button class="btn btn-primary" type="submit"' +
      (ok.length && (!S.brandUsage || total <= free) ? '' : ' disabled') +
      '>' +
      icon('upload') +
      (ok.length === 1 ? 'Subir archivo' : 'Subir ' + ok.length + ' archivos') +
      '</button></div></form>'
  );
  const syncBg = () =>
    rows.forEach((r, i) => {
      const bg = q('#buBg' + i);
      if (bg) bg.closest('.field').hidden = q('#buCat' + i).value !== 'logos';
    });
  rows.forEach((r, i) => q('#buCat' + i)?.addEventListener('change', syncBg));
  syncBg();
  if (S.brandUsage && total > free)
    q('#brandUploadFeedback').textContent =
      'No queda espacio suficiente en el plan gratuito para estos archivos.';
  q('#brandUploadForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    const feedback = q('#brandUploadFeedback'),
      failed = [];
    let done = 0;
    for (const [i, r] of rows.entries()) {
      if (r.problem) continue;
      feedback.textContent = 'Subiendo ' + (done + failed.length + 1) + ' de ' + ok.length + '…';
      try {
        await uploadBrandFile(
          r.file,
          variant
            ? {
                category: variant.category,
                name: variant.name,
                background: variant.background,
                official: variant.official,
                group_id: variant.group_id,
                variant_label: q('#buLabel' + i).value.trim(),
                is_current: q('#buCurrent').checked
              }
            : {
                category: q('#buCat' + i).value,
                name: q('#buName' + i).value.trim() || brandBaseName(r.file),
                background: q('#buBg' + i).value || null,
                official: q('#buOfficial').checked
              }
        );
        done++;
      } catch (error) {
        failed.push(r.file.name + ': ' + error.message);
      }
    }
    await Promise.all([loadBrandAssets().catch(() => {}), loadBrandUsage()]);
    if (done) toast(done === 1 ? 'Recurso subido.' : done + ' recursos subidos.');
    if (failed.length) {
      feedback.textContent = 'No se pudo subir: ' + failed.join(' · ');
      b.disabled = false;
    } else dialog.close();
    if (S.mode === 'brand') render();
  };
  enhanceFields();
  return dialog;
}
const brandAppPending = () =>
  BRAND_APP_FILES.filter(
    ([path]) => !(S.brandAssets || []).some(a => a.original_name === path.split('/').pop())
  );
// Adds the official logo and icons that ship with KultiApp, byte for byte.
async function importBrandAppFiles() {
  if (!canEdit()) return;
  const b = q('#brandImport');
  if (b) b.disabled = true;
  let done = 0;
  const failed = [];
  for (const [path, category, name, background, official, usage] of brandAppPending()) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw Error('no disponible (' + res.status + ')');
      const blob = await res.blob(),
        file = new File([blob], path.split('/').pop(), { type: BRAND_EXTENSIONS[path.split('.').pop()] });
      await uploadBrandFile(file, { category, name, background, official, usage });
      done++;
    } catch (error) {
      failed.push(name + ': ' + error.message);
    }
  }
  await Promise.all([loadBrandAssets().catch(() => {}), loadBrandUsage()]);
  if (done) toast(done + (done === 1 ? ' archivo oficial agregado.' : ' archivos oficiales agregados.'));
  if (failed.length) toast('No se pudo agregar ' + failed.join(' · '), 'error');
  if (S.mode === 'brand') render();
}

// ---- Asset sheet: preview, download, copy, edit, versions ----
async function brandSignedUrl(a, download = false) {
  const { data, error } = await supabase.storage
    .from(BRAND_BUCKET)
    .createSignedUrl(a.object_path, 600, download ? { download: a.original_name } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
async function downloadBrandAsset(a) {
  try {
    const url = await brandSignedUrl(a, true),
      link = document.createElement('a');
    link.href = url;
    link.download = a.original_name;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  } catch (error) {
    toast(error.message, 'error');
  }
}
async function copyBrandText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Texto copiado.');
  } catch {
    toast('No se pudo copiar en este navegador.', 'error');
  }
}
function showBrandAsset(a) {
  if (!a) return;
  const edit = canEdit(),
    group = brandGroup(a).sort(
      (x, y) =>
        Number(y.is_current) - Number(x.is_current) ||
        String(y.created_at).localeCompare(String(x.created_at))
    ),
    image = brandIsImage(a),
    pdf = a.mime_type === 'application/pdf';
  const dialog = showDialog(
    'brandDialog',
    '<div class="section-title"><h2>' +
      esc(a.name) +
      '</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><div class="brand-preview' +
      (a.background === 'dark' ? ' on-light' : a.background === 'light' ? ' on-dark' : ' checker') +
      '" id="brandPreview">' +
      (image && brandUrl(a)
        ? '<img src="' + esc(brandUrl(a)) + '" alt="' + esc(a.name) + '">'
        : pdf
          ? '<span class="small muted">Cargando vista previa…</span>'
          : brandThumb(a, 'brand-thumb big')) +
      '</div><div class="brand-badges">' +
      (a.official ? '<span class="chip c-ready">' + icon('badge-check') + 'Oficial</span>' : '') +
      (a.favorite ? '<span class="chip c-late">' + icon('heart') + 'Favorito</span>' : '') +
      (group.length > 1
        ? '<span class="chip">' + (a.is_current ? 'Versión vigente' : 'Versión anterior') + '</span>'
        : '') +
      (a.archived_at ? '<span class="chip c-cancel">Archivado</span>' : '') +
      '</div><dl class="facts"><div><dt>Categoría</dt><dd>' +
      esc(BRAND_CATEGORIES[a.category]) +
      '</dd></div><div><dt>Formato</dt><dd>' +
      brandExt(a).toUpperCase() +
      ' · ' +
      brandBytes(a.byte_size) +
      '</dd></div><div><dt>Dimensiones</dt><dd>' +
      (a.width && a.height ? a.width + ' × ' + a.height + ' px' : '—') +
      '</dd></div><div><dt>Archivo</dt><dd class="brand-filename">' +
      esc(a.original_name) +
      '</dd></div>' +
      (a.background ? '<div><dt>Fondo</dt><dd>' + BRAND_BACKGROUNDS[a.background] + '</dd></div>' : '') +
      '<div><dt>Subido</dt><dd>' +
      esc(new Date(a.created_at).toLocaleDateString('es-CL')) +
      '</dd></div></dl>' +
      (a.usage ? '<p class="small"><b>Uso recomendado:</b> ' + esc(a.usage) + '</p>' : '') +
      (a.description ? '<p class="small muted">' + esc(a.description) + '</p>' : '') +
      (a.copy_text
        ? '<div class="brand-copy"><div class="pay-head"><h3>Texto asociado</h3><button type="button" class="btn btn-ghost btn-sm" id="brandCopy">' +
          icon('copy') +
          'Copiar</button></div><p class="notify-preview">' +
          esc(a.copy_text) +
          '</p></div>'
        : '') +
      '<div class="wrap-row brand-main-actions"><button type="button" class="btn btn-primary" id="brandDownload">' +
      icon('download') +
      'Descargar original</button>' +
      (pdf
        ? '<button type="button" class="btn btn-secondary" id="brandOpen">' +
          icon('link') +
          'Abrir PDF</button>'
        : '') +
      (edit
        ? '<button type="button" class="btn btn-secondary" id="brandOfficial" aria-pressed="' +
          a.official +
          '">' +
          icon('badge-check') +
          (a.official ? 'Quitar oficial' : 'Marcar oficial') +
          '</button><button type="button" class="btn btn-secondary" id="brandFavorite" aria-pressed="' +
          a.favorite +
          '">' +
          icon('heart') +
          (a.favorite ? 'Quitar favorito' : 'Favorito') +
          '</button><button type="button" class="btn btn-secondary" id="brandEdit">' +
          icon('pencil') +
          'Editar</button>'
        : '') +
      '</div><section class="brand-versions"><div class="pay-head"><h3>Versiones</h3>' +
      (edit && !a.archived_at
        ? '<button type="button" class="btn btn-ghost btn-sm" id="brandNewVersion">' +
          icon('upload') +
          'Subir nueva versión</button>'
        : '') +
      '</div>' +
      group
        .map(
          v =>
            '<div class="brand-version' +
            (v.id === a.id ? ' on' : '') +
            '"><button type="button" class="brand-version-open" data-brand-version="' +
            v.id +
            '"><b>' +
            esc(v.variant_label || (v.is_current ? 'Vigente' : 'Versión')) +
            '</b><span class="small muted">' +
            esc(new Date(v.created_at).toLocaleDateString('es-CL')) +
            ' · ' +
            brandMeta(v) +
            '</span></button>' +
            (v.is_current
              ? '<span class="chip c-ready">Vigente</span>'
              : edit
                ? '<button type="button" class="btn btn-ghost btn-sm" data-brand-current="' +
                  v.id +
                  '">Usar como vigente</button>'
                : '') +
            '</div>'
        )
        .join('') +
      '</section>' +
      (edit
        ? '<div class="dialog-actions"><button type="button" class="btn btn-ghost danger-text" id="brandDelete">' +
          icon('trash-2') +
          (group.length > 1 ? 'Eliminar esta versión' : 'Eliminar') +
          '</button><button type="button" class="btn btn-ghost" id="brandArchive">' +
          icon(a.archived_at ? 'archive-restore' : 'archive') +
          (a.archived_at ? 'Restaurar' : 'Archivar') +
          '</button></div>'
        : '')
  );
  // PDFs: the browser's own viewer in an <object>, with a link when it cannot show it.
  if (pdf)
    brandSignedUrl(a)
      .then(url => {
        const box = q('#brandPreview');
        if (!box || !dialog.open) return;
        box.innerHTML =
          '<object data="' +
          esc(url) +
          '" type="application/pdf" aria-label="' +
          esc(a.name) +
          '"><p class="small muted">Este navegador no muestra PDF aquí: usa «Abrir PDF» o «Descargar original».</p></object>';
      })
      .catch(() => {});
  q('#brandDownload').onclick = () => downloadBrandAsset(a);
  q('#brandOpen')?.addEventListener('click', async () => {
    const win = window.open('', '_blank', 'noopener');
    try {
      const url = await brandSignedUrl(a);
      if (win) win.location.href = url;
      else window.open(url, '_blank', 'noopener');
    } catch (error) {
      win?.close();
      toast(error.message, 'error');
    }
  });
  q('#brandCopy')?.addEventListener('click', () => copyBrandText(a.copy_text));
  dialog.querySelectorAll('[data-brand-version]').forEach(
    b =>
      (b.onclick = () => {
        if (b.dataset.brandVersion === a.id) return;
        dialog.close();
        const v = S.brandAssets.find(x => x.id === b.dataset.brandVersion);
        loadBrandUrls([v]).then(() => showBrandAsset(v));
      })
  );
  if (!edit) return dialog;
  const reopen = id => {
    dialog.close();
    if (S.mode === 'brand') render();
    const fresh = S.brandAssets.find(x => x.id === id);
    if (fresh) showBrandAsset(fresh);
  };
  q('#brandOfficial').onclick = async () => {
    if (await updateBrandGroup(a, { official: !a.official })) reopen(a.id);
  };
  q('#brandFavorite').onclick = async () => {
    if (await updateBrandGroup(a, { favorite: !a.favorite })) reopen(a.id);
  };
  q('#brandEdit').onclick = () => {
    dialog.close();
    showBrandEdit(a);
  };
  q('#brandNewVersion')?.addEventListener('click', () => {
    dialog.close();
    pickBrandFiles({ groupOf: a });
  });
  dialog.querySelectorAll('[data-brand-current]').forEach(
    b =>
      (b.onclick = async () => {
        try {
          await setBrandCurrent(S.brandAssets.find(x => x.id === b.dataset.brandCurrent));
          toast('Versión vigente actualizada.');
          reopen(b.dataset.brandCurrent);
        } catch (error) {
          toast(error.message, 'error');
        }
      })
  );
  q('#brandArchive').onclick = async () => {
    if (await updateBrandGroup(a, { archived_at: a.archived_at ? null : new Date().toISOString() })) {
      toast(a.archived_at ? '«' + a.name + '» restaurado.' : '«' + a.name + '» archivado.');
      dialog.close();
      render();
    }
  };
  q('#brandDelete').onclick = async () => {
    dialog.close();
    await deleteBrandAsset(a);
  };
  return dialog;
}
// Flags and archive apply to the whole design (every version).
async function updateBrandGroup(a, patch) {
  try {
    const { error } = await supabase
      .from('brand_assets')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('workspace_id', S.workspace.id)
      .eq('group_id', a.group_id);
    if (error) throw error;
    for (const x of brandGroup(a)) Object.assign(x, patch);
    return true;
  } catch (error) {
    toast(error.message, 'error');
    return false;
  }
}
async function setBrandCurrentOff(groupId) {
  const { error } = await supabase
    .from('brand_assets')
    .update({ is_current: false, updated_at: new Date().toISOString() })
    .eq('workspace_id', S.workspace.id)
    .eq('group_id', groupId)
    .eq('is_current', true);
  if (error) throw error;
  for (const x of S.brandAssets || []) if (x.group_id === groupId) x.is_current = false;
}
// One current version per design: the old one is switched off first (unique index).
async function setBrandCurrent(v) {
  await setBrandCurrentOff(v.group_id);
  const { error } = await supabase
    .from('brand_assets')
    .update({ is_current: true, updated_at: new Date().toISOString() })
    .eq('id', v.id);
  if (error) throw error;
  v.is_current = true;
}
function showBrandEdit(a) {
  if (!canEdit()) return;
  const dialog = showDialog(
    'brandEditDialog',
    '<div class="section-title"><h2>Editar recurso</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><form id="brandEditForm" class="grid">' +
      fieldHtml('Nombre', 'beName', a.name, 'text', 'required maxlength="160"') +
      '<div class="grid grid-2"><div class="field"><label for="beCat">Categoría</label><select id="beCat">' +
      Object.entries(BRAND_CATEGORIES)
        .map(
          ([k, v]) =>
            '<option value="' + k + '"' + (k === a.category ? ' selected' : '') + '>' + v + '</option>'
        )
        .join('') +
      '</select></div><div class="field" id="beBgField"><label for="beBg">Fondo</label><select id="beBg"><option value="">Sin indicar</option>' +
      Object.entries(BRAND_BACKGROUNDS)
        .map(
          ([k, v]) =>
            '<option value="' + k + '"' + (k === a.background ? ' selected' : '') + '>' + v + '</option>'
        )
        .join('') +
      '</select></div></div>' +
      fieldHtml(
        'Uso recomendado',
        'beUsage',
        a.usage,
        'text',
        'maxlength="500" placeholder="Ej. fondo de stories, cajas de envío"'
      ) +
      '<div class="field"><label for="beDesc">Descripción</label><textarea id="beDesc" maxlength="1000" rows="2">' +
      esc(a.description) +
      '</textarea></div><div class="field"><label for="beCopy">Texto asociado (para copiar)</label><textarea id="beCopy" maxlength="4000" rows="3" placeholder="Ej. bio de Instagram, mensaje de la tarjeta, slogan">' +
      esc(a.copy_text) +
      '</textarea></div>' +
      (brandGroup(a).length > 1
        ? fieldHtml('Nombre de esta versión', 'beLabel', a.variant_label, 'text', 'maxlength="80"')
        : '') +
      '<p class="small muted">Nombre, categoría y fondo se aplican a todas las versiones del diseño.</p><div id="brandEditFeedback" class="small" role="status"></div><div class="dialog-actions"><button class="btn btn-primary" type="submit">Guardar</button></div></form>'
  );
  const syncBg = () => (q('#beBgField').hidden = q('#beCat').value !== 'logos');
  q('#beCat').onchange = syncBg;
  syncBg();
  q('#brandEditForm').onsubmit = async e => {
    e.preventDefault();
    const category = q('#beCat').value,
      shared = {
        name: q('#beName').value.trim(),
        category,
        background: category === 'logos' ? q('#beBg').value || null : null
      };
    if (!shared.name) return (q('#brandEditFeedback').textContent = 'Escribe un nombre.');
    try {
      if (!(await updateBrandGroup(a, shared))) return;
      const own = {
        usage: q('#beUsage').value.trim(),
        description: q('#beDesc').value.trim(),
        copy_text: q('#beCopy').value.trim(),
        ...(q('#beLabel') ? { variant_label: q('#beLabel').value.trim() } : {}),
        updated_at: new Date().toISOString()
      };
      const { error } = await supabase.from('brand_assets').update(own).eq('id', a.id);
      if (error) throw error;
      Object.assign(a, own);
      dialog.close();
      toast('Recurso guardado.');
      render();
      showBrandAsset(a);
    } catch (error) {
      q('#brandEditFeedback').textContent = error.message;
    }
  };
  enhanceFields();
  return dialog;
}
// Removes the file first (so nothing is left behind), then its record. If it was the current
// version, the newest remaining one takes its place.
async function deleteBrandAsset(a) {
  if (!canEdit()) return;
  const others = brandGroup(a).filter(x => x.id !== a.id);
  const ok = await confirmDialog({
    title: others.length ? 'Eliminar esta versión' : 'Eliminar «' + a.name + '»',
    body:
      'El archivo original se borra para todo el equipo y no se puede recuperar.' +
      (others.length ? ' Las otras ' + others.length + ' versiones se conservan.' : '') +
      (a.official ? ' Es un recurso oficial.' : ''),
    confirmLabel: 'Eliminar',
    danger: true
  });
  if (!ok) return;
  try {
    const { error: se } = await supabase.storage.from(BRAND_BUCKET).remove([a.object_path]);
    if (se) throw se;
    const { error } = await supabase.from('brand_assets').delete().eq('id', a.id);
    if (error) throw error;
    S.brandAssets = S.brandAssets.filter(x => x.id !== a.id);
    if (a.is_current && others.length)
      await setBrandCurrent(
        others.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0]
      );
    await loadBrandUsage();
    toast(others.length ? 'Versión eliminada.' : '«' + a.name + '» eliminado.');
    render();
  } catch (error) {
    toast(error.message, 'error');
  }
}
