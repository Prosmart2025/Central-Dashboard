import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:3000",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1366, height: 900 } } },
    { name: "android-tablet", use: { browserName: "chromium", viewport: { width: 800, height: 1280 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
});
