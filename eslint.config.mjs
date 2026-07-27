import { fixupConfigRules } from "@eslint/compat";
import * as espree from "espree";
import nextConfig from "eslint-config-next/core-web-vitals";
import unusedImports from "eslint-plugin-unused-imports";

const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "output/**",
      "src-tauri/target/**",
      "src-tauri/gen/schemas/**",
      "public/serviceWorker.js",
    ],
  },
  ...fixupConfigRules(nextConfig),
  {
    files: [
      "*.{js,mjs,cjs}",
      "scripts/**/*.{js,mjs,cjs}",
      "public/**/*.{js,mjs,cjs}",
    ],
    languageOptions: {
      parser: espree,
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "unused-imports/no-unused-imports": "warn",
    },
  },
];

export default config;
