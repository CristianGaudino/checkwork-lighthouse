import { afterEach, expect, it, vi } from 'vitest';
import { clerkSecretName, fetchUsers, usesClerk } from './clerk';
import { vsLastWeek } from './today';

// _data.ts is server code: these let it load in a test
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('names the secret from the repo, so a project needs no config field', () => {
    expect(clerkSecretName('vintage')).toBe('CLERK_SECRET_KEY_VINTAGE');
    expect(clerkSecretName('how-much')).toBe('CLERK_SECRET_KEY_HOW_MUCH');
    expect(clerkSecretName('MotorBid')).toBe('CLERK_SECRET_KEY_MOTORBID');
});

it('counts a repo as using Clerk when its .env.example names the secret key', () => {
    expect(usesClerk(['DATABASE_URL', 'CLERK_SECRET_KEY'])).toBe(true);
    expect(usesClerk(['DATABASE_URL'])).toBe(false);
    expect(usesClerk(undefined)).toBe(false);
});

it('asks Clerk for six counts by time in milliseconds, keeping only the numbers', async () => {
    const now = Date.parse('2026-11-19T00:00:00Z'), day = 86_400_000;
    const urls: URL[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk_test');
        const u = new URL(url);
        urls.push(u);
        const n = u.searchParams.has('created_at_before') ? 4 : u.searchParams.has('created_at_after') ? 3 : u.searchParams.has('last_active_at_after') ? 20 : 100;
        // Extra fields (a real list would carry emails) are dropped by the schema
        return Response.json({ object: 'total_count', total_count: n, email: 'x@y.z' });
    }));
    expect(await fetchUsers('sk_test', now)).toEqual({ total: 100, new7: 3, new30: 3, newPrev7: 4, active7: 20, active30: 20 });
    expect(urls.every(u => u.origin + u.pathname === 'https://api.clerk.com/v1/users/count')).toBe(true);
    expect(urls.map(u => Object.fromEntries(u.searchParams))).toEqual([
        {},
        { created_at_after: String(now - 7 * day) },
        { created_at_after: String(now - 30 * day) },
        { created_at_after: String(now - 14 * day), created_at_before: String(now - 7 * day) },
        { last_active_at_after: String(now - 7 * day) },
        { last_active_at_after: String(now - 30 * day) },
    ]);
});

it('throws on a refused key, so the page can say which secret', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(fetchUsers('bad')).rejects.toThrow('Clerk: 401');
});

it('says the change on last week', () => {
    expect(vsLastWeek(30, 18)).toBe('+12 vs last week');
    expect(vsLastWeek(2, 5)).toBe('-3 vs last week');
    expect(vsLastWeek(1500, 0)).toBe('+1,500 vs last week');
    expect(vsLastWeek(4, 4)).toBe('Same as last week');
});

it('gives a quiet setup note for a Clerk repo without its secret, and nothing for any other repo', async () => {
    vi.stubEnv('CLERK_SECRET_KEY_HOW_MUCH', '');
    const { loadUsers } = await import('@/app/_data');
    expect(await loadUsers('how-much', true)).toEqual({ setup: 'Set CLERK_SECRET_KEY_HOW_MUCH (the Clerk app\'s secret key) to see sign-ups and active users.' });
    expect(await loadUsers('portfolio', false)).toEqual({});
});
