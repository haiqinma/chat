import nextConfig from "eslint-config-next/core-web-vitals";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  {
    ignores: [
      "public/serviceWorker.js",
      "app/mcp/mcp_config.json",
      "app/mcp/mcp_config.default.json",
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
