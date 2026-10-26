'use strict';
// ---------------------------------------------------------------------------
// V4.4: «Mi perfil» page: photo, name, username and WhatsApp, login email, password,
// appearance and session. Personal data lives in the Supabase user metadata; the photo in
// the workspace photo bucket (its path in the metadata).
// ---------------------------------------------------------------------------
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
const userMeta = () => S.session?.user?.user_metadata || {};
const userName = () => String(userMeta().username || '').trim();
function avatarSrc() {
  const p = userMeta().avatar_path,
    u = p && S.photoUrls.get(p);
  return u && u.exp > Date.now() ? u.url : null;
}
// The signed-in user's avatar: photo when there is one, initials otherwise.
function userAvatar(cls = 'avatar') {
  const src = avatarSrc();
  return (
    '<span class="' +
    cls +
    (src ? ' has-photo' : '') +
    '" data-me-avatar>' +
    (src ? '<img src="' + esc(src) + '" alt="">' : esc(userInitials())) +
    '</span>'
  );
}
async function loadAvatarUrl() {
  const p = userMeta().avatar_path;
  if (!p || avatarSrc()) return;
  await loadPhotoUrls([{ photo_path: p }]);
  if (avatarSrc()) qa('[data-me-avatar]').forEach(el => (el.outerHTML = userAvatar(el.className)));
}
async function saveUserMeta(patch) {
  const { data, error } = await supabase.auth.updateUser({ data: patch });
  if (error) throw error;
  const user = S.session.user;
  S.session.user = data?.user || { ...user, user_metadata: { ...(user.user_metadata || {}), ...patch } };
}
const showProfile = () => goMode('profile');
const profileDate = iso =>
  iso ? new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
function profileSection(title, ico, body) {
  return (
    '<section class="panel profile-section"><div class="panel-h"><h2>' +
    icon(ico) +
    title +
    '</h2></div><div class="profile-body">' +
    body +
    '</div></section>'
  );
}
function profileView() {
  const user = S.session?.user || {},
    m = userMeta(),
    edit = canEdit();
  root.innerHTML =
    header('Mi perfil') +
    '<main class="shell profile-page">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<section class="panel profile-card">' +
    userAvatar('avatar avatar-xl') +
    '<div class="profile-id"><h2>' +
    esc(displayName() || 'Sin nombre') +
    '</h2><span class="muted">' +
    (userName() ? '@' + esc(userName()) + ' · ' : '') +
    esc(user.email || '') +
    '</span><span class="badge">' +
    roleName() +
    ' · ' +
    esc(S.workspace?.name || 'Kultiverso Pop') +
    '</span></div>' +
    (edit
      ? '<div class="profile-photo-actions"><label class="btn btn-secondary btn-sm" for="avatarFile">' +
        icon('camera') +
        (m.avatar_path ? 'Cambiar foto' : 'Subir foto') +
        '</label><input type="file" id="avatarFile" accept="image/*" hidden>' +
        (m.avatar_path
          ? '<button type="button" class="btn btn-ghost btn-sm" id="avatarRemove">Quitar foto</button>'
          : '') +
        '</div>'
      : '') +
    '</section><div class="profile-grid">' +
    profileSection(
      'Datos personales',
      'user',
      '<form id="profileForm" class="grid">' +
        fieldHtml(
          'Nombre',
          'profileName',
          displayName(),
          'text',
          'required maxlength="60" autocomplete="name" placeholder="Ej. Felipe Pino"'
        ) +
        fieldHtml(
          'Nombre de usuario',
          'profileUsername',
          userName(),
          'text',
          'maxlength="30" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ej. felipe.pino"'
        ) +
        fieldHtml(
          'Tu WhatsApp',
          'profilePhone',
          m.phone || '',
          'tel',
          'maxlength="30" inputmode="tel" autocomplete="tel" placeholder="+56 9 1234 5678"'
        ) +
        '<p class="small muted">Tu nombre aparece en el menú, en el saludo de Inicio y en tus iniciales. El nombre de usuario lleva minúsculas, números, punto o guion bajo.</p><div id="profileFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Guardar datos</button></form>'
    ) +
    profileSection(
      'Email de acceso',
      'mail',
      '<form id="emailForm" class="grid">' +
        fieldHtml('Email', 'profileEmail', user.email || '', 'email', 'required autocomplete="email"') +
        (user.new_email
          ? '<p class="notice small">Cambio pendiente a <b>' +
            esc(user.new_email) +
            '</b>: confirma con el enlace que te enviamos.</p>'
          : '') +
        '<p class="small muted">Al cambiarlo te enviaremos un enlace para confirmarlo. Hasta entonces sigues entrando con el email actual.</p><div id="emailFeedback" class="small" role="status"></div><button class="btn btn-secondary" type="submit">Cambiar email</button></form>'
    ) +
    profileSection(
      'Contraseña',
      'key-round',
      '<form id="profilePasswordForm" class="grid"><p class="small muted">' +
        esc(PASSWORD_HINT) +
        '</p>' +
        fieldHtml(
          'Nueva contraseña',
          'profileNewPassword',
          '',
          'password',
          'required autocomplete="new-password" minlength="' + PASSWORD_MIN + '"'
        ) +
        fieldHtml(
          'Repite la contraseña',
          'profileRepeatPassword',
          '',
          'password',
          'required autocomplete="new-password"'
        ) +
        '<div id="profilePasswordFeedback" class="small" role="status"></div><button class="btn btn-secondary" type="submit">Guardar contraseña</button></form>'
    ) +
    profileSection(
      'Apariencia y sesión',
      'settings',
      '<div class="field"><label>Tema</label>' +
        themeSwitch() +
        '</div><dl class="profile-facts"><div><dt>Último ingreso</dt><dd>' +
        profileDate(user.last_sign_in_at) +
        '</dd></div><div><dt>Cuenta creada</dt><dd>' +
        profileDate(user.created_at) +
        '</dd></div><div><dt>Versión</dt><dd>' +
        APP_VERSION +
        '</dd></div></dl><div class="wrap-row">' +
        (canInstall()
          ? '<button type="button" class="btn btn-secondary btn-sm" id="profileInstall">' +
            icon('download') +
            'Instalar app</button>'
          : '') +
        '<button type="button" class="btn btn-secondary btn-sm" id="profileBackup">' +
        icon('database') +
        'Respaldo de datos</button><button type="button" class="btn btn-ghost btn-sm danger" id="profileLogout">' +
        icon('log-out') +
        'Cerrar sesión</button></div>'
    ) +
    '</div></main>';
  common();
  loadAvatarUrl();
  bindProfile();
}
const profileBusy = async (form, feedback, job) => {
  const b = form.querySelector('button[type=submit]');
  if (b.disabled) return;
  b.disabled = true;
  try {
    await job();
  } catch (error) {
    q(feedback).textContent = error.message;
  } finally {
    b.disabled = false;
  }
};
function bindProfile() {
  q('#profileForm').onsubmit = e => {
    e.preventDefault();
    profileBusy(e.target, '#profileFeedback', async () => {
      const name = q('#profileName').value.trim().slice(0, 60),
        username = q('#profileUsername').value.trim().replace(/^@/, '').toLowerCase(),
        phone = q('#profilePhone').value.trim();
      if (username && !USERNAME_RE.test(username))
        throw Error(
          'El nombre de usuario debe tener de 3 a 30 letras minúsculas, números, punto o guion bajo.'
        );
      if (phone && !whatsappLink(phone)) throw Error('Revisa tu WhatsApp: incluye código de país.');
      await saveUserMeta({ name, username, phone });
      toast('Perfil guardado.');
      render();
    });
  };
  q('#emailForm').onsubmit = e => {
    e.preventDefault();
    profileBusy(e.target, '#emailFeedback', async () => {
      const email = q('#profileEmail').value.trim().toLowerCase();
      if (email === String(S.session.user.email || '').toLowerCase())
        throw Error('Ese ya es tu email de acceso.');
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      S.session.user = { ...S.session.user, new_email: email };
      toast('Te enviamos un enlace a ' + email + ' para confirmar el cambio.');
      render();
    });
  };
  q('#profilePasswordForm').onsubmit = e => {
    e.preventDefault();
    const pw = q('#profileNewPassword').value,
      feedback = q('#profilePasswordFeedback');
    if (pw !== q('#profileRepeatPassword').value)
      return (feedback.textContent = 'Las contraseñas no coinciden.');
    profileBusy(e.target, '#profilePasswordFeedback', async () => {
      feedback.textContent = 'Revisando…';
      const problem = await checkNewPassword(pw);
      if (problem) throw Error(problem);
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      e.target.reset();
      feedback.textContent = '';
      toast('Contraseña actualizada.');
    });
  };
  q('#avatarFile')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await optimizePhoto(file),
        path = await uploadPhoto(data),
        old = userMeta().avatar_path;
      await saveUserMeta({ avatar_path: path });
      S.photoUrls.set(path, { url: data, exp: Date.now() + PHOTO_URL_TTL * 1000 });
      if (old) removePhotoObject(old);
      toast('Foto de perfil actualizada.');
      render();
    } catch (error) {
      toast(error.message, 'error');
    }
  });
  q('#avatarRemove')?.addEventListener('click', async () => {
    const old = userMeta().avatar_path;
    try {
      await saveUserMeta({ avatar_path: null });
      if (old) removePhotoObject(old);
      toast('Foto quitada.');
      render();
    } catch (error) {
      toast(error.message, 'error');
    }
  });
  q('#profileInstall')?.addEventListener('click', installApp);
  q('#profileBackup').onclick = showBackup;
  q('#profileLogout').onclick = () => supabase.auth.signOut();
}
