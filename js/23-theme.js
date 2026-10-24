'use strict';
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
