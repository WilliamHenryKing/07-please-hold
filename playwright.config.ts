import { defineConfig } from "@playwright/test";

// One headless end-to-end run against the production build. Software WebGL is enough.
export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.pw\.ts/,
  timeout: 300_000,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4617",
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "bun run build && bunx vite preview --port 4617 --strictPort",
    url: "http://127.0.0.1:4617",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
