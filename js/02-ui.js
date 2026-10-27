'use strict';
// Interfaz común: íconos, diálogos, avisos, campos, buscadores, menús flotantes, carga y tema.
let fieldSequence = 0;
function enhanceFields() {
  qa('.field').forEach(field => {
    const input = field.querySelector('input,textarea,select'),
      label = field.querySelector('label');
    if (input && label) {
      if (!input.id) {
        let id;
        do {
          id = 'field-' + ++fieldSequence;
        } while (document.getElementById(id));
        input.id = id;
      }
      // Preserve explicit associations, including fields containing a separate switch.
      if (!label.htmlFor) label.htmlFor = input.id;
    }
  });
  q('#email')?.setAttribute('autocomplete', 'email');
  q('#password')?.setAttribute('autocomplete', 'current-password');
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
  dialog.onclose = () => {
    dialog.remove();
    // Closing returns focus to the row that opened it; on phones that draws a focus line across the list.
    setTimeout(() => {
      const el = document.activeElement;
      if (el?.matches?.('.list-row, [data-open], tr')) el.blur();
    });
  };
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
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
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
  minus: '<path d="M5 12h14" />',
  scale:
    '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><path d="M7 21h10" /><path d="M12 3v18" /><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />',
  'undo-2': '<path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />',
  'clipboard-check':
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" />',
  palette:
    '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />',
  heart:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />',
  'badge-check':
    '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" />',
  'shopping-cart':
    '<circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />',
  camera:
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" />',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />',
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
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />',
  store:
    '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" /><path d="M2 7h20" /><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />',
  'layout-grid':
    '<rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />',
  list: '<path d="M3 12h.01" /><path d="M3 18h.01" /><path d="M3 6h.01" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M8 6h13" />',
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />',
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
async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Enlace copiado.');
  } catch {
    toast('No se pudo copiar; mantén presionado el enlace para copiarlo.', 'error');
  }
}
// ---------------------------------------------------------------------------
// V3.3: light/dark theme. «Automático» follows the device; the choice is kept per device.
// index.html applies the saved theme before the first paint to avoid a flash.
// ---------------------------------------------------------------------------
const THEME_KEY = 'kultiapp_theme',
  THEMES = { auto: 'Automático', dark: 'Oscuro', light: 'Claro' };
function savedTheme() {
  try {
    return THEMES[localStorage.getItem(THEME_KEY)] ? localStorage.getItem(THEME_KEY) : 'auto';
  } catch {
    return 'auto';
  }
}
function applyTheme(theme = savedTheme()) {
  const html = document.documentElement;
  if (theme === 'auto') html.removeAttribute('data-theme');
  else html.dataset.theme = theme;
  const light =
    theme === 'light' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', light ? '#F4F5F9' : '#0B0B10');
  qa('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme)));
}
function setTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  applyTheme(theme);
}
function themeSwitch() {
  const current = savedTheme();
  return (
    '<div class="theme-switch" role="group" aria-label="Tema de la app">' +
    Object.entries(THEMES)
      .map(
        ([k, label]) =>
          '<button type="button" data-theme-set="' +
          k +
          '" aria-pressed="' +
          (k === current) +
          '">' +
          label +
          '</button>'
      )
      .join('') +
    '</div>'
  );
}
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-theme-set]');
  if (b) setTheme(b.dataset.themeSet);
});
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => applyTheme());
// 5.0: a «ficha» shown as a page section instead of a dialog. Code written for dialogs may call
// close() on it: on a page there is nothing to close, the page stays.
function pageSheet(id, body) {
  const host = document.createElement('section');
  host.id = id;
  host.className = 'panel page-sheet';
  host.innerHTML = body;
  host.close = () => {};
  (q('main') || root).append(host);
  return host;
}
