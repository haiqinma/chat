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
  ...nextConfig,
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
