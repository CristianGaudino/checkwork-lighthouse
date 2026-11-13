import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100); // set E2E_PORT if 3100 is taken

// Runs against the real Worker build (OpenNext + wrangler dev), not `next dev`, which skips the Access check.
// E2E_BASE_URL tests the deployed site instead.
export default defineConfig({
    testDir: 'e2e',
    retries: 0,
    reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
    use: { baseURL: process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
    projects: [
        { name: 'phone', use: devices['Pixel 7'] },
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    ],
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : { command: `npx opennextjs-cloudflare build && npx wrangler dev --port ${PORT} --ip 127.0.0.1`, url: `http://127.0.0.1:${PORT}/favicon.svg` /* every page is a 404 without Access */, reuseExistingServer: false, timeout: 300_000, env: { APP_ENV: 'production' } },
});
