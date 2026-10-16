import { defineConfig, devices } from '@playwright/test';

// ビルド済みのアプリを vite preview で配信して確かめる（Service Worker も本番と同じ形で動く）
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'phone-se',
      use: { ...devices['iPhone SE'], browserName: 'chromium', viewport: { width: 320, height: 568 } },
    },
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 667 } } },
  ],
});
