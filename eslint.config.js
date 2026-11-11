// eslint.config.js — ESLint v9 flat config.
// `npm run lint` had no config file at all before this (eslint v9 dropped
// support for .eslintrc.*), so `npm run lint` simply crashed instead of linting
// anything — this is what actually makes it work, and what the new CI workflow
// (.github/workflows/ci.yml) depends on to run cleanly.

const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "logs/**", "backups/**", "uploads/**"],
  },
  {
    rules: {
      // This codebase leans heavily on `any` at the Prisma-bridge boundary
      // (config/prisma.ts) by design — the bridge intentionally trades static typing
      // for a Prisma-compatible call shape over Mongoose. Downgraded to a warning
      // rather than disabled outright, so genuinely careless `any` usage still shows up.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
