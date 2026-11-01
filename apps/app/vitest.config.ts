import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    // e2e/ holds Playwright specs (pnpm test:e2e), not vitest tests.
    exclude: [...configDefaults.exclude, "e2e/**", "test-results/**", ".next/**"],
    server: { deps: { inline: [/@copilotkit\/react-core/] } },
  },
});
