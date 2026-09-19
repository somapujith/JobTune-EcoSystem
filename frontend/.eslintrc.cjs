module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    // The codebase doesn't use PropTypes.
    'react/prop-types': 'off',
    // Cosmetic in JSX text; not worth failing lint over.
    'react/no-unescaped-entities': 'off',
    // Swallowing storage/parse errors with an empty catch is an established pattern here.
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Report, don't fail: legacy code has many unused imports/vars.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_|^[A-Z]' }],
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
};
