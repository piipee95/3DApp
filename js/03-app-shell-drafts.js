'use strict';
function common() {
  mountShell();
  markViewEnter();
  mountInventoryAlert();
  enhanceFields();
  flashMessages();
  if (S.mode === 'dashboard' || S.mode === 'home') showDraftResume();
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
  saveView();
  if (S.mode === 'files') return customerFilesView();
  if (S.mode === 'quotes') return quotesView();
  if (S.mode === 'customers') return customersView();
  if (S.mode === 'reports') return reportsView();
  if (S.mode === 'finance') return financeView();
  if (S.mode === 'inventory') return inventoryView();
  if (S.mode === 'resources') return resourcesView();
  if (S.mode === 'production') return productionView();
  if (S.mode === 'product') return product();
  if (S.mode === 'home') return homeView();
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
