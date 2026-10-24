// Lint catches real mistakes (typos, unreachable code, duplicate keys) in our files and in edits made with other tools.
// js/ files are classic scripts sharing one global scope, so cross-file names are not flagged as undefined there.
import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['node_modules/**', 'assets/**'] },
  js.configs.recommended,
  {
    rules: {
      // Empty catch blocks are deliberate (storage that may be blocked, best-effort cleanup).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Control-character ranges are deliberate in the XML and file-name sanitizers.
      'no-control-regex': 'off'
    }
  },
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off'
    }
  },
  {
    files: ['js/supabase-client.js', 'subir.js', 'seguimiento.js', 'catalogo.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } }
  },
  { files: ['sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  {
    files: ['tests/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': 'off' }
  }
];
