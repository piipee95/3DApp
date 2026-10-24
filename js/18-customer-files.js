'use strict';
// V2.3: customer uploads keep the original private file, separate from catalogue photos.
async function loadCustomerFileRequests() {
  const { data, error } = await supabase
    .from('customer_file_requests')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  S.fileRequests = data || [];
}
function fileRequestState(r) {
  if (r.deleting_at) return 'Eliminación pendiente';
  if (r.archived_at) return 'Archivado';
  return r.submitted_at
    ? 'Recibido'
    : r.revoked
      ? 'Desactivado'
      : new Date(r.expires_at) <= new Date()
        ? 'Vencido'
        : 'Esperando fotos';
}
const FILE_STATE = {
  'Esperando fotos': ['waiting', 'c-printing'],
  Recibido: ['received', 'c-ready'],
  Vencido: ['closed', ''],
  Desactivado: ['closed', ''],
  Archivado: ['archived', ''],
  'Eliminación pendiente': ['closed', 'c-late']
};
function customerFileLink(r) {
  return location.origin + '/subir.html#' + r.access_token;
}
function timeLeft(iso) {
  const ms = new Date(iso) - Date.now(),
    h = Math.floor(ms / 36e5);
  if (ms <= 0) return 'vencido';
  return h >= 1 ? 'quedan ' + h + ' h' : 'quedan ' + Math.max(1, Math.round(ms / 6e4)) + ' min';
}
function customerFilesView() {
  const archived = S.fileRequestsTab === 'archived',
    requests = S.fileRequests || [],
    all = requests.filter(r => !!r.archived_at === archived),
    filter = archived ? 'all' : S.fileFilter || 'all',
    group = r => FILE_STATE[fileRequestState(r)][0],
    count = k => all.filter(r => k === 'all' || group(r) === k).length,
    list = all.filter(r => filter === 'all' || group(r) === filter),
    fresh = requests.filter(r => r.submitted_at && !r.reviewed_at && !r.archived_at && !r.deleting_at).length,
    archivedCount = requests.filter(r => r.archived_at).length;
  const pills = [
    ['all', 'Todos', all.length],
    ['waiting', 'Esperando', count('waiting')],
    ['received', 'Recibidos', count('received')],
    ['closed', 'Cerrados', count('closed')]
  ].filter(([k, , c]) => c > 0 || ['all', filter].includes(k));
  const row = r => {
    const state = fileRequestState(r),
      open = state === 'Esperando fotos',
      deleting = !!r.deleting_at,
      isNew = r.submitted_at && !r.reviewed_at && !r.archived_at && !deleting,
      order = r.order_id && S.orders.find(o => o.id === r.order_id);
    return (
      '<div class="list-row file-row' +
      (isNew ? ' is-new' : '') +
      '"><span class="file-ic">' +
      icon(r.submitted_at ? 'image' : open ? 'clock' : 'x') +
      '</span><span class="lr-main"><b>' +
      esc(r.label) +
      '</b><span>' +
      (order ? 'PED-' + order.order_no + ' · ' : '') +
      (deleting
        ? 'El borrado no terminó: reinténtalo'
        : r.submitted_at
          ? 'Recibido ' + relativeDate(r.submitted_at)
          : open
            ? 'Creado ' + relativeDate(r.created_at) + ' · ' + timeLeft(r.expires_at)
            : state + ' · ' + new Date(r.expires_at).toLocaleDateString('es-CL')) +
      '</span></span><span class="chip ' +
      FILE_STATE[state][1] +
      '"><i></i>' +
      (isNew ? 'Nuevo' : state) +
      '</span><span class="row-actions">' +
      (r.submitted_at && !deleting
        ? '<button class="btn btn-sm ' +
          (isNew ? 'btn-primary' : 'btn-secondary') +
          '" data-received-files="' +
          r.id +
          '">' +
          icon('download') +
          'Ver archivos</button>'
        : '') +
      (open
        ? '<button class="btn btn-sm btn-secondary" data-copy-files="' +
          r.id +
          '">' +
          icon('share-2') +
          'Enlace</button>'
        : '') +
      (open && canEdit()
        ? '<button class="btn icon-btn" data-revoke-files="' +
          r.id +
          '" aria-label="Desactivar enlace" title="Desactivar enlace">' +
          icon('x') +
          '</button>'
        : '') +
      (canEdit() && deleting
        ? '<button class="btn btn-sm btn-danger" data-manage-files="' +
          r.id +
          '" data-files-action="delete">' +
          icon('refresh-cw') +
          'Reintentar eliminación</button>'
        : '') +
      (canEdit() && !deleting
        ? '<details class="row-menu"><summary class="btn icon-btn" aria-label="Más acciones">' +
          icon('ellipsis-vertical') +
          '</summary><div class="menu-pop"><button type="button" class="btn" data-manage-files="' +
          r.id +
          '" data-files-action="' +
          (r.archived_at ? 'restore' : 'archive') +
          '">' +
          icon(r.archived_at ? 'archive-restore' : 'archive') +
          (r.archived_at ? 'Restaurar' : 'Archivar') +
          '</button><button type="button" class="btn btn-danger" data-manage-files="' +
          r.id +
          '" data-files-action="delete">' +
          icon('trash-2') +
          'Eliminar con sus fotos</button></div></details>'
        : '') +
      '</span></div>'
    );
  };
  root.innerHTML =
    header(
      'Archivos del cliente',
      canEdit()
        ? '<button class="btn btn-primary" id="newFileRequest" type="button">' +
            icon('plus') +
            '<span>Pedir fotos</span></button>'
        : ''
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<p class="page-lead muted">Pide a tus clientes las fotos originales con un enlace seguro: sin cuenta, válido 48 horas y de un solo envío. Solo tu equipo puede verlas.' +
    (fresh
      ? ' <b class="warn">' + fresh + (fresh === 1 ? ' envío nuevo' : ' envíos nuevos') + ' por revisar.</b>'
      : '') +
    '</p><div class="toolbar"><div class="view-tabs" role="group" aria-label="Estado de solicitudes"><button class="btn ' +
    (!archived ? 'btn-primary' : 'btn-secondary') +
    '" data-files-tab="active" aria-pressed="' +
    !archived +
    '">Activos <span class="seg-count">' +
    (requests.length - archivedCount) +
    '</span></button><button class="btn ' +
    (archived ? 'btn-primary' : 'btn-secondary') +
    '" data-files-tab="archived" aria-pressed="' +
    archived +
    '">Archivados <span class="seg-count">' +
    archivedCount +
    '</span></button></div></div>' +
    (archived ? '' : filterPills(pills, filter, 'data-file-filter')) +
    '<section class="panel">' +
    (list.length
      ? '<div class="file-list">' + list.map(row).join('') + '</div>'
      : '<div class="panel-empty">' +
        icon('image') +
        '<b>' +
        (archived
          ? 'No hay solicitudes archivadas'
          : all.length
            ? 'Nada en esta vista'
            : 'Aún no hay solicitudes activas') +
        '</b><span>' +
        (archived
          ? 'Las archivadas conservan sus fotos y pueden restaurarse.'
          : all.length
            ? ''
            : 'Crea un enlace y compártelo con tu cliente por WhatsApp. También desde un pedido: «Pedir fotos».') +
        '</span></div>') +
    '</section><p class="footnote small muted">Hasta 5 fotos de 50 MB por enlace, sin compresión. Se muestran las últimas 100 solicitudes.</p></main>';
  common();
  q('#newFileRequest')?.addEventListener('click', () => showNewFileRequest());
  qa('[data-files-tab]').forEach(
    b =>
      (b.onclick = () => {
        S.fileRequestsTab = b.dataset.filesTab;
        customerFilesView();
      })
  );
  qa('[data-manage-files]').forEach(
    b =>
      (b.onclick = () =>
        manageCustomerFileRequest(
          requests.find(r => r.id === b.dataset.manageFiles),
          b.dataset.filesAction,
          b
        ))
  );
  qa('[data-file-filter]').forEach(
    b =>
      (b.onclick = () => {
        S.fileFilter = b.dataset.fileFilter;
        customerFilesView();
      })
  );
  qa('[data-received-files]').forEach(
    b =>
      (b.onclick = async () => {
        await showReceivedCustomerFiles(S.fileRequests.find(r => r.id === b.dataset.receivedFiles));
        customerFilesView();
      })
  );
  qa('[data-copy-files]').forEach(
    b => (b.onclick = () => showFileRequestLink(S.fileRequests.find(r => r.id === b.dataset.copyFiles)))
  );
  qa('[data-revoke-files]').forEach(
    b =>
      (b.onclick = async () => {
        if (
          !(await confirmDialog({
            title: '¿Desactivar el enlace?',
            body: 'El cliente ya no podrá cargar nuevas fotos. Los archivos recibidos se conservan.',
            confirmLabel: 'Desactivar'
          }))
        )
          return;
        try {
          const { error } = await supabase
            .from('customer_file_requests')
            .update({ revoked: true })
            .eq('id', b.dataset.revokeFiles)
            .eq('workspace_id', S.workspace.id);
          if (error) throw error;
          await goMode('files');
        } catch (error) {
          toast(error.message, 'error');
        }
      })
  );
}
function showNewFileRequest(order = null) {
  if (!canEdit()) return;
  const dialog = showDialog(
    'newFileRequestDialog',
    '<div class="section-title"><h2>Recibir fotos del cliente</h2><button class="btn btn-ghost" data-close>Volver</button></div><form id="fileRequestForm" class="grid">' +
      fieldHtml(
        'Nombre de la solicitud',
        'fileRequestLabel',
        order ? 'Pedido ' + order.order_no + ' · ' + order.title : 'Trabajo personalizado',
        'text',
        'required maxlength="160"'
      ) +
      '<p class="notice small">Válido por 48 horas. Se cierra automáticamente al completar el envío.</p>' +
      '<p class="small muted">El cliente solo verá el formulario de fotos y este nombre. No necesita cuenta ni correo.</p><p id="fileRequestFeedback" role="status" class="small"></p><button type="submit" class="btn btn-primary">Crear enlace</button></form>'
  );
  q('#fileRequestForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button');
    b.disabled = true;
    try {
      const { data, error } = await supabase
        .from('customer_file_requests')
        .insert({
          workspace_id: S.workspace.id,
          order_id: order?.id || null,
          label: q('#fileRequestLabel').value.trim()
        })
        .select()
        .single();
      if (error) throw error;
      dialog.close();
      showFileRequestLink(data);
    } catch (error) {
      q('#fileRequestFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
}
function fileRequestMessage(r, customer, url) {
  const hi = firstName(customer?.name);
  return (
    'Hola' +
    (hi ? ' ' + hi : '') +
    ', para trabajar tu pedido en Kultiverso Pop sube aquí las fotos originales (desde Fotos o Archivos, sin capturas). El enlace es válido por 48 horas: ' +
    url
  );
}
function showFileRequestLink(r) {
  const order = r.order_id && S.orders.find(o => o.id === r.order_id),
    customer = order ? customerFor(order.customer_id, order.customer_name) : null,
    url = customerFileLink(r),
    dialog = showDialog(
      'fileRequestLinkDialog',
      '<div class="section-title"><h2>Enlace para el cliente</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><p>' +
        esc(r.label) +
        '</p><div class="field"><label for="customerFileLink">Comparte este enlace</label><input id="customerFileLink" readonly value="' +
        esc(url) +
        '"></div><div class="row"><button class="btn btn-primary" id="copyCustomerFileLink">' +
        icon('copy') +
        'Copiar enlace</button><a class="btn btn-secondary" href="' +
        esc(
          (whatsappLink(customer?.phone) || 'https://wa.me/') +
            '?text=' +
            encodeURIComponent(fileRequestMessage(r, customer, url))
        ) +
        '" target="_blank" rel="noopener noreferrer">' +
        icon('message-circle') +
        (customer?.phone ? 'Enviar a ' + esc(firstName(customer.name)) : 'Compartir por WhatsApp') +
        '</a></div><p class="small muted">El enlace vence el ' +
        esc(new Date(r.expires_at).toLocaleDateString('es-CL')) +
        '.</p>'
    );
  q('#copyCustomerFileLink').onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado.');
    } catch {
      q('#customerFileLink').select();
    }
  };
  return dialog;
}
async function showReceivedCustomerFiles(r) {
  const dialog = showDialog(
    'receivedFilesDialog',
    '<div class="section-title"><h2>' +
      esc(r.label) +
      '</h2><button class="btn btn-ghost" data-close>Volver</button></div><div id="receivedFilesBody" role="status">Cargando archivos…</div>'
  );
  try {
    const { data, error } = await supabase
      .from('customer_files')
      .select('*')
      .eq('workspace_id', S.workspace.id)
      .eq('request_id', r.id)
      .order('created_at');
    if (error) throw error;
    if (!dialog.isConnected) return;
    const files = (data || []).filter(f => f.received_at);
    q('#receivedFilesBody').innerHTML = files.length
      ? files
          .map(
            f =>
              '<article class="customer-file-row"><h3>' +
              esc(f.original_name) +
              '</h3><p class="small muted">' +
              esc(f.customer_name) +
              ' · ' +
              (f.byte_size / 1048576).toFixed(2) +
              ' MB · ' +
              esc(new Date(f.received_at).toLocaleString('es-CL')) +
              '</p>' +
              (f.note ? '<p class="customer-file-note">' + esc(f.note) + '</p>' : '') +
              '<div class="row"><button class="btn btn-primary" data-download-original="' +
              f.id +
              '">Descargar original</button>' +
              (['image/jpeg', 'image/png', 'image/webp'].includes(f.mime_type)
                ? '<button class="btn btn-secondary" data-preview-original="' +
                  f.id +
                  '">Vista previa</button>'
                : '') +
              '</div></article>'
          )
          .join('')
      : 'Todavía no hay fotos recibidas.';
    dialog.querySelectorAll('[data-download-original]').forEach(
      b =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            const f = files.find(x => x.id === b.dataset.downloadOriginal);
            const { data: blob, error } = await supabase.storage
              .from('customer-originals')
              .download(f.object_path);
            if (error) throw error;
            downloadBlob(blob, f.original_name.replace(/[\\/\x00-\x1f]/g, '_'));
          } catch (error) {
            toast(error.message, 'error');
          } finally {
            b.disabled = false;
          }
        })
    );
    dialog.querySelectorAll('[data-preview-original]').forEach(
      b =>
        (b.onclick = async () => {
          try {
            const f = files.find(x => x.id === b.dataset.previewOriginal),
              { data, error } = await supabase.storage
                .from('customer-originals')
                .createSignedUrl(f.object_path, 300);
            if (error) throw error;
            const preview = showDialog(
              'originalPreviewDialog',
              '<div class="section-title"><h2>' +
                esc(f.original_name) +
                '</h2><button class="btn btn-ghost" data-close>Volver</button></div><img class="customer-file-preview" src="' +
                esc(data.signedUrl) +
                '" alt="' +
                esc(f.original_name) +
                '">'
            );
            return preview;
          } catch (error) {
            toast(error.message, 'error');
          }
        })
    );
    if (r.submitted_at && canEdit()) {
      const { error } = await supabase
        .from('customer_file_requests')
        .update({ reviewed_at: new Date().toISOString() })
        .eq('id', r.id)
        .eq('workspace_id', S.workspace.id);
      if (!error) r.reviewed_at = new Date().toISOString();
    }
  } catch (error) {
    if (dialog.isConnected) q('#receivedFilesBody').textContent = error.message;
  }
}

async function manageCustomerFileRequest(r, action, button) {
  if (!canEdit() || !r || !['archive', 'restore', 'delete'].includes(action) || S.fileRequestBusy) return;
  const workspaceId = S.workspace.id;
  if (action !== 'restore') {
    const accepted = await confirmDialog(
      action === 'archive'
        ? {
            title: '¿Archivar la solicitud?',
            body: 'Las fotos se conservan y podrás restaurar la solicitud. El enlace quedará desactivado.',
            confirmLabel: 'Archivar'
          }
        : {
            title: '¿Eliminar la solicitud y sus fotos?',
            body:
              'Se borrarán permanentemente todos los originales de «' +
              r.label +
              '» y su enlace. Esta acción no se puede deshacer.',
            confirmLabel: 'Eliminar definitivamente',
            danger: true
          }
    );
    if (!accepted) return;
  }
  if (S.fileRequestBusy || S.workspace?.id !== workspaceId || !canEdit()) return;
  S.fileRequestBusy = true;
  if (button) button.disabled = true;
  const call = async p_action => {
    const { data, error } = await supabase.rpc('manage_customer_file_request', { p_id: r.id, p_action });
    if (error) throw error;
    return data;
  };
  try {
    if (action === 'delete') {
      const result = await call('delete_start');
      r.deleting_at = r.deleting_at || new Date().toISOString();
      r.revoked = true;
      if (result.paths.length) {
        const { error } = await supabase.storage.from('customer-originals').remove(result.paths);
        if (error) throw error;
      }
      await call('delete_finish');
      S.fileRequests = (S.fileRequests || []).filter(item => item.id !== r.id);
    } else {
      await call(action);
      r.archived_at = action === 'archive' ? new Date().toISOString() : null;
      if (action === 'archive') r.revoked = true;
    }
    toast(
      action === 'delete'
        ? 'Solicitud y originales eliminados.'
        : action === 'archive'
          ? 'Solicitud archivada. Fotos conservadas.'
          : 'Solicitud restaurada. El enlace sigue desactivado.'
    );
  } catch (error) {
    toast(
      (r.deleting_at ? 'No se completó la eliminación. Puedes reintentar. ' : '') + error.message,
      'error'
    );
  } finally {
    S.fileRequestBusy = false;
    if (button) button.disabled = false;
    if (S.mode === 'files' && S.workspace?.id === workspaceId) customerFilesView();
  }
}
