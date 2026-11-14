import { expect, test } from '@playwright/test';

// Every page checks the login itself (requireAdmin), so each one is tried
const PAGES = ['/', '/work', '/activity', '/projects', '/projects/vintage', '/costs', '/usage', '/pc'];

// The whole site is private. The page itself is checked by hand under `next dev` (the only place the Access check is skipped).
test('every page is closed without an Access login', async ({ page, request }) => {
    const headers = { 'cf-access-jwt-assertion': 'a.b.c' }; // a made-up token must not get in either
    if (process.env.E2E_BASE_URL) {
        // Deployed: Cloudflare Access answers first and sends visitors to its login page
        for (const path of PAGES) {
            const res = await request.get(path, { maxRedirects: 0, headers });
            expect(res.status(), path).toBe(302);
            expect(res.headers().location, path).toContain('cloudflareaccess.com');
        }
    } else {
        // Local Worker: no Access in front, so the page itself must refuse
        for (const path of PAGES) {
            expect((await page.goto(path))?.status(), path).toBe(404);
            expect((await request.get(path, { headers })).status(), path).toBe(404);
            await expect(page.getByText('Checkwork demo')).toHaveCount(0);
        }
    }
});
