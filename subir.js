import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const client = createClient(
  'https://fczmkdkhyalksmczeyda.supabase.co',
  'sb_publishable_M0tikDD2Y9L3B83lJpTcsA_IWuEz5JR',
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);
const token = location.hash.slice(1),
  box = document.querySelector('#customerUpload');
const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
async function rpc(action, input = {}) {
  const { data, error } = await client.rpc('customer_upload', {
    p_action: action,
    p_token: token,
    p_input: input
  });
  if (error) throw error;
  return data;
}
function mimeOf(file) {
  if (
    [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/avif',
      'image/tiff',
      'image/bmp',
      'image/gif'
    ].includes(file.type)
  )
    return file.type;
  const ext = file.name.split('.').pop().toLowerCase();
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heif',
      avif: 'image/avif',
      tif: 'image/tiff',
      tiff: 'image/tiff',
      bmp: 'image/bmp',
      gif: 'image/gif'
    }[ext] || null
  );
}
function received() {
  box.innerHTML =
    '<div class="upload-done">✓</div><h1>¡Fotos recibidas!</h1><p>Ya puedes cerrar esta ventana. Kultiverso Pop podrá descargar los originales para trabajar tu pedido.</p>';
}
async function start() {
  try {
    const info = await rpc('info');
    if (info.received) return received();
    box.innerHTML =
      '<h1>Envía tus fotos</h1><p>' +
      esc(info.label) +
      '</p><p class="small muted">Un solo envío. El enlace vence a las 48 horas de su creación y se cierra al enviar.</p><p class="muted">Adjunta las fotos que quieres que trabajemos. Solo el equipo de Kultiverso Pop podrá verlas.</p><form id="uploadForm" class="grid"><div class="field"><label for="clientName">Tu nombre</label><input id="clientName" autocomplete="name" required maxlength="120"></div><div class="field"><label>Tus fotos</label><label class="drop-zone" for="clientPhotos"><input id="clientPhotos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/tiff,image/bmp,image/gif,.heic,.heif,.tif,.tiff,.bmp,.avif,.gif" multiple required><b>Elegir fotos</b><span>Toca para seleccionar desde tu galería o archivos</span></label><ul id="pickedFiles" class="picked-files"></ul><span class="small muted">JPG/JPEG, PNG, HEIC/HEIF (iPhone), WebP, AVIF, TIFF, BMP y GIF. Hasta 5 fotos, máximo 50 MB cada una. Sin compresión ni reducción de resolución. Envía el original desde Fotos o Archivos; evita imágenes reenviadas o capturas si tienes el original.</span></div><div class="field"><label for="clientNote">Indicaciones (opcional)</label><textarea id="clientNote" maxlength="1500" placeholder="Ej. Quiero usar la foto horizontal."></textarea></div><div class="upload-progress" hidden><i id="uploadBar"></i></div><div id="uploadFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Enviar fotos</button></form>';
    let jobs = [];
    const picker = document.querySelector('#clientPhotos'),
      mb = n => (n / 1048576).toFixed(n < 1048576 ? 2 : 1) + ' MB';
    picker.addEventListener('change', () => {
      const files = [...picker.files];
      document.querySelector('#pickedFiles').innerHTML =
        files
          .map(
            f =>
              '<li><span>' +
              esc(f.name) +
              '</span><b class="' +
              (f.size > 52428800 || !mimeOf(f) ? 'bad' : '') +
              '">' +
              mb(f.size) +
              '</b></li>'
          )
          .join('') + (files.length > 5 ? '<li class="bad">Máximo 5 fotos por envío.</li>' : '');
      document.querySelector('.drop-zone b').textContent = files.length
        ? files.length + (files.length === 1 ? ' foto elegida' : ' fotos elegidas')
        : 'Elegir fotos';
    });
    document.querySelector('#uploadForm').onsubmit = async e => {
      e.preventDefault();
      const button = e.target.querySelector('button'),
        feedback = document.querySelector('#uploadFeedback');
      button.disabled = true;
      try {
        const files = [...document.querySelector('#clientPhotos').files];
        if (!files.length || files.length > 5) throw Error('Selecciona entre 1 y 5 fotos.');
        if (files.some(f => !mimeOf(f) || f.size < 1 || f.size > 52428800))
          throw Error(
            'Usa JPG, PNG, HEIC/HEIF, WebP, AVIF, TIFF, BMP o GIF, con un máximo de 50 MB por foto.'
          );
        if (files.some((f, i) => jobs[i]?.file !== f) || files.length !== jobs.length)
          jobs = files.map(file => ({ file, slot: null, received: false }));
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          if (job.received) continue;
          feedback.textContent =
            'Enviando foto ' + (i + 1) + ' de ' + jobs.length + '… Mantén esta ventana abierta.';
          const bar = document.querySelector('#uploadBar');
          if (bar) {
            bar.parentNode.hidden = false;
            bar.style.width = Math.round((i / jobs.length) * 100) + '%';
          }
          const mime = mimeOf(job.file);
          job.slot ??= await rpc('begin', {
            name: job.file.name,
            mime,
            size: job.file.size,
            customer_name: document.querySelector('#clientName').value.trim(),
            note: document.querySelector('#clientNote').value.trim()
          });
          const { error } = await client.storage
            .from('customer-originals')
            .upload(job.slot.path, job.file, { contentType: mime, upsert: false });
          if (error) {
            try {
              await rpc('finalize', { id: job.slot.id });
              job.received = true;
              continue;
            } catch {
              throw error;
            }
          }
          await rpc('finalize', { id: job.slot.id });
          job.received = true;
        }
        await rpc('complete');
        received();
      } catch (error) {
        feedback.textContent =
          error.message || 'No se pudo enviar. Revisa tu conexión y vuelve a intentarlo.';
        button.disabled = false;
        button.textContent = 'Reintentar envío';
      }
    };
  } catch (error) {
    box.innerHTML =
      '<h1>Enlace no disponible</h1><p>' +
      esc(error.message || 'No pudimos revisar el enlace. Revisa tu conexión e intenta abrirlo nuevamente.') +
      '</p><p>Pide un enlace nuevo a Kultiverso Pop si ya venció.</p>';
  }
}
start();
