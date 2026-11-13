import { expect, it } from 'vitest';
import { verifyAccessJwt } from './access';

const b64 = (b: ArrayBuffer | string) => Buffer.from(typeof b === 'string' ? b : new Uint8Array(b)).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
const expected = { iss: 'https://team.cloudflareaccess.com', aud: 'aud1' };
const NOW = 1_000_000;

async function token(claims: object, header: object = { alg: 'RS256', kid: 'k1' }) {
    const body = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claims))}`;
    return `${body}.${b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(body)))}`;
}
const good = { iss: expected.iss, aud: ['aud1'], exp: NOW + 60, email: 'me@example.ie' };
const check = (t: string) => verifyAccessJwt(t, [jwk], expected, NOW);

it('accepts a valid token and returns the email', async () => {
    expect(await check(await token(good))).toBe('me@example.ie');
});

it('rejects a wrong audience, issuer, expired token, unknown key, wrong alg and a tampered or malformed token', async () => {
    expect(await check(await token({ ...good, aud: ['other'] }))).toBeNull();
    expect(await check(await token({ ...good, iss: 'https://evil.example' }))).toBeNull();
    expect(await check(await token({ ...good, exp: NOW - 1 }))).toBeNull();
    expect(await check(await token(good, { alg: 'RS256', kid: 'nope' }))).toBeNull();
    expect(await check(await token(good, { alg: 'none', kid: 'k1' }))).toBeNull();
    const [h, , s] = (await token(good)).split('.');
    expect(await check(`${h}.${b64(JSON.stringify({ ...good, email: 'evil@example.ie' }))}.${s}`)).toBeNull();
    expect(await check('not-a-token')).toBeNull();
});
