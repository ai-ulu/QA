module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  rules: {
    'no-console': 'warn',
    'no-debugger': 'error',
    'prefer-const': 'error',
    'no-var': 'error'
  },
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '.next/',
    '*.config.js'
  ]
};