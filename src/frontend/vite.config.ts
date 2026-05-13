import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single canonical source: repo-root VERSION file.
const appVersion = readFileSync(
  resolve(__dirname, "../../VERSION"),
  "utf-8",
).trim();

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/docs": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/redoc": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/openapi.json": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "tests/e2e/**",
    ],
  },
});
