import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the static export (`npm run build` with STATIC_EXPORT=1 and the data
 * written by `python -m app.cli export-static`). Run: npm run test:e2e
 */
const BASE = process.env.BASE_PATH ?? "";
const PORT = Number(process.env.PORT ?? 4310);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}${BASE}/`, trace: "off", screenshot: "only-on-failure", timezoneId: "America/New_York" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "node scripts/serve-static.mjs", port: PORT, reuseExistingServer: !process.env.CI, env: { BASE_PATH: BASE, PORT: String(PORT) } },
});
