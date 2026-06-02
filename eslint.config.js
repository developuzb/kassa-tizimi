// ESLint flat config (ESLint v9+)
const js = require('@eslint/js');

// Brauzer muhitidagi global obyektlar
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  fetch: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  alert: 'readonly',
  Blob: 'readonly',
  URL: 'readonly',
  FileReader: 'readonly',
  crypto: 'readonly',
  TextEncoder: 'readonly',
  Chart: 'readonly',
  module: 'writable',
};

// Ilovaning o'z global modullari (IIFE orqali e'lon qilingan)
const appGlobals = {
  esc: 'writable',
  Security: 'writable',
  Storage: 'writable',
  Sheets: 'writable',
  Kassa: 'writable',
  Inventar: 'writable',
  Mijozlar: 'writable',
  Xodimlar: 'writable',
  Hisobotlar: 'writable',
  Admin: 'writable',
  App: 'writable',
  Toast: 'writable',
  Modal: 'writable',
};

module.exports = [
  { ignores: ['js/vendor/**', 'node_modules/**', 'dist/**', 'build/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserGlobals, ...appGlobals },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' },
    },
  },
];
