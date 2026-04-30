import type { InlineConfig } from "vitest";
import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";

interface VitestUserConfig extends UserConfig {
  test?: InlineConfig;
}

const config = {
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/task-api": {
        target: "http://localhost:8080",
        changeOrigin: true
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts"
  }
} satisfies VitestUserConfig;

export default defineConfig(config);
