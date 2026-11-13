import { expect, test } from '@playwright/test';

// The whole site is private. The page itself is checked by hand under `next dev` (the only place the Access check is skipped).
test('every page is closed without an Access login', async ({ page, request }) => {
    const headers = { 'cf-access-jwt-assertion': 'a.b.c' }; // a made-up token must not get in either
    if (process.env.E2E_BASE_URL) {
        // Deployed: Cloudflare Access answers first and sends visitors to its login page
        const res = await request.get('/', { maxRedirects: 0, headers });
        expect(res.status()).toBe(302);
        expect(res.headers().location).toContain('cloudflareaccess.com');
    } else {
        // Local Worker: no Access in front, so the page itself must refuse
        expect((await page.goto('/'))?.status()).toBe(404);
        expect((await request.get('/', { headers })).status()).toBe(404);
        await expect(page.getByText('Checkwork demo')).toHaveCount(0);
    }
});
