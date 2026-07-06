import { defineConfig, devices } from "@playwright/test";

// Le process de test Playwright est séparé de celui du serveur Next.js (qui charge
// .env.local tout seul) : on le charge explicitement ici pour que les tests qui
// parlent directement à Supabase (vérification/nettoyage côté service_role) fonctionnent.
try {
  process.loadEnvFile(".env.local");
} catch {
  // absent en CI tant qu'aucun pipeline n'est configuré : pas bloquant ici
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
