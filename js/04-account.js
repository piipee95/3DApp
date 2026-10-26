'use strict';
// Cuenta: nombre e iniciales, Mi perfil, contraseña e invitaciones de socios.
function authView() {
  root.innerHTML =
    '<div class="shell"><div class="auth card"><img class="auth-logo" src="' +
    LOGO_SRC +
    '" alt="Kultiverso Pop"><h1>KultiApp <span class="app-version">' +
    APP_VERSION +
    '</span></h1><p class="muted">Costos y producción 3D</p><p class="small muted">Kultiverso Pop · Powered by ELARA</p>' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    (S.msg ? '<div class="success">' + esc(S.msg) + '</div>' : '') +
    '<div class="login-tabs"><button class="btn tab active" data-mode="login">Ingresar</button><button class="btn tab" data-mode="signup">Crear cuenta</button></div><form id="authForm" class="grid"><div class="field"><label>Email</label><input id="email" type="email" required></div><div class="field"><label>Contraseña</label><input id="password" type="password" minlength="6" required><span id="passwordHint" class="small muted" hidden>' +
    PASSWORD_HINT +
    '</span></div><button class="btn btn-primary" type="submit">Ingresar</button></form></div></div>';
  let mode = 'login';
  qa('[data-mode]').forEach(
    b =>
      (b.onclick = () => {
        mode = b.dataset.mode;
        qa('[data-mode]').forEach(x => x.classList.toggle('active', x === b));
        q('#authForm button[type=submit]').textContent = mode === 'login' ? 'Ingresar' : 'Crear cuenta';
        q('#password').minLength = mode === 'login' ? 6 : PASSWORD_MIN;
        q('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
        q('#passwordHint').hidden = mode === 'login';
      })
  );
  q('#authForm').onsubmit = async e => {
    e.preventDefault();
    const email = q('#email').value.trim(),
      password = q('#password').value;
    if (mode === 'login') {
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) fail(error.message);
    } else {
      const problem = await checkNewPassword(password);
      if (problem) return fail(problem);
      let { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: location.origin + location.pathname }
      });
      if (error) fail(error.message);
      else {
        S.msg = 'Cuenta creada. Revisa tu correo si se solicita verificación.';
        render();
      }
    }
  };
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
// Password policy. The free Supabase plan cannot reject leaked passwords on the server, so new
// passwords are checked here against Have I Been Pwned using k-anonymity: only the first five
// characters of the SHA-1 hash leave the device.
const PASSWORD_MIN = 10,
  PASSWORD_HINT =
    'Mínimo ' +
    PASSWORD_MIN +
    ' caracteres, con letras y números. Se revisa que no aparezca en filtraciones conocidas.';
function passwordProblem(pw) {
  if (pw.length < PASSWORD_MIN) return 'La contraseña debe tener al menos ' + PASSWORD_MIN + ' caracteres.';
  if (!/[a-zA-ZÀ-ÿ]/.test(pw) || !/\d/.test(pw)) return 'La contraseña debe combinar letras y números.';
  return '';
}
async function pwnedCount(pw) {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(pw)))]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase(),
    prefix = hash.slice(0, 5),
    suffix = hash.slice(5);
  const res = await fetch('https://api.pwnedpasswords.com/range/' + prefix);
  if (!res.ok) throw Error('HIBP ' + res.status);
  for (const line of (await res.text()).split('\n')) {
    const [s, c] = line.trim().split(':');
    if (s === suffix) return parseInt(c, 10) || 0;
  }
  return 0;
}
// The leak check fails open: if the service is unreachable, the length and character rules still apply.
async function checkNewPassword(pw) {
  const problem = passwordProblem(pw);
  if (problem) return problem;
  try {
    if ((await pwnedCount(pw)) > 0)
      return 'Esta contraseña aparece en filtraciones de datos conocidas. Elige otra distinta.';
  } catch (e) {
    console.warn('No se pudo revisar la contraseña en filtraciones', e);
  }
  return '';
}
// V4.3: the name chosen in «Mi perfil» (Supabase user metadata); the email until there is one.
const displayName = () => String(S.session?.user?.user_metadata?.name || '').trim();
function userInitials() {
  const email = S.session?.user?.email || '';
  const name = (displayName() || email.split('@')[0]).replace(/[^a-zA-ZÀ-ÿ]+/g, ' ').trim();
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] || 'K') + (parts[1]?.[0] || '')).toUpperCase();
}
// V4.2: personal greeting, the day in one sentence and big shortcuts to the daily actions.
function userFirstName() {
  const meta = S.session?.user?.user_metadata || {},
    raw = meta.first_name || meta.name || String(S.session?.user?.email || '').split('@')[0];
  const first = String(raw).split(/[\s._-]+/)[0] || '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';
}
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
