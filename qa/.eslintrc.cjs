/**
 * ESLint config for QA tests + helper scripts.
 * Kept minimal — main app has its own stricter config under each sub-package.
 */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  ignorePatterns: [
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    "tests/multilingual/**", // Python — leave to the .py linters
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "no-console": "off",
  },
};
