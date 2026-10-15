import eslintReact from "@eslint-react/eslint-plugin";
import css from "@eslint/css";
import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import type { Linter } from "eslint";
import tailwindcss from "eslint-plugin-tailwindcss";
import { defineConfig, globalIgnores, includeIgnoreFile } from "eslint/config";
import globals from "globals";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const gitignore = fileURLToPath(new URL(".gitignore", import.meta.url));

export default defineConfig([
  includeIgnoreFile(gitignore, { gitignoreResolution: true }),
  // Tailwind v4 uses build-time CSS directives that the generic CSS parser cannot parse.
  globalIgnores(["package-lock.json", "src/styles/tailwind.css"]),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    extends: [tseslint.configs.recommended],
  },

  {
    files: ["**/*.tsx"],
    extends: [eslintReact.configs["recommended-typescript"]],
  },
  {
    files: ["**/*.jsx"],
    extends: [eslintReact.configs.recommended],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ["**/*.{jsx,tsx}"],
    // This plugin's TypeScript types still target the pre-ESLint-10 rule context.
    // Its runtime rules work with ESLint 10, so adapt the plugin type at this boundary.
    plugins: {
      tailwindcss: tailwindcss as unknown as NonNullable<Linter.Config["plugins"]>[string],
    },
    settings: {
      tailwindcss: { cssConfigPath: "./src/styles/tailwind.css" },
    },
    rules: {
      "tailwindcss/no-contradicting-classname": "error",
      "tailwindcss/enforces-canonical-classname": "warn",
      "tailwindcss/no-unnecessary-arbitrary-value": "warn",
      "tailwindcss/enforces-shorthand": "warn",
      "tailwindcss/classnames-order": "warn",
    },
  },
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.jsonc"],
    plugins: { json },
    language: "json/jsonc",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.json5"],
    plugins: { json },
    language: "json/json5",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.md"],
    plugins: { markdown },
    language: "markdown/gfm",
    extends: ["markdown/recommended"],
  },
  {
    files: ["**/*.css"],
    plugins: { css },
    language: "css/css",
    extends: ["css/recommended"],
  },
  // Disable ESLint formatting rules that conflict with Prettier.
  prettier,
]);
