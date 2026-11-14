import { notFound } from 'next/navigation';
import { headers } from 'next/headers';

type Jwk = JsonWebKey & { kid?: string };
type Claims = { iss?: string; aud?: string | string[]; exp?: number; email?: string };

const decode = (part: string) => Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const json = (part: string) => JSON.parse(new TextDecoder().decode(decode(part)));

/** Says why a token was refused (never the token itself) so a lock-out can be diagnosed from the Worker logs. */
const refuse = (reason: string): null => (console.warn(`Access token refused: ${reason}`), null);

/**
 * Checks a Cloudflare Access token: RS256 signature against the team's keys, issuer, audience and expiry.
 * Returns the signed-in email, or null. Never trusts the header's contents without the signature.
 */
export async function verifyAccessJwt(token: string, keys: Jwk[], expected: { iss: string; aud: string }, now = Date.now() / 1000): Promise<string | null> {
    try {
        const [h, p, s] = token.split('.');
        if (!h || !p || !s) return refuse('not a JWT');
        const header = json(h);
        if (header.alg !== 'RS256') return refuse(`algorithm ${header.alg}`);
        const jwk = keys.find(k => k.kid === header.kid);
        if (!jwk) return refuse('no matching signing key');
        const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(s), new TextEncoder().encode(`${h}.${p}`)))) return refuse('bad signature');
        const claims: Claims = json(p);
        const auds = [claims.aud ?? []].flat();
        if (claims.iss !== expected.iss) return refuse(`issuer ${claims.iss}`);
        if (!auds.includes(expected.aud)) return refuse('audience does not match ACCESS_AUD');
        if (!claims.exp || claims.exp <= now) return refuse('expired');
        return claims.email ?? refuse('no email in token');
    } catch (error) {
        return refuse(`unreadable: ${error}`);
    }
}

// shortcut: one in-memory copy of the team's keys per Worker instance for an hour, so a key rotation can lock the admin out for up to an hour. Fine for one owner.
let cached: { team: string; keys: Jwk[]; at: number } | undefined;
async function teamKeys(team: string): Promise<Jwk[]> {
    if (cached?.team === team && Date.now() - cached.at < 3_600_000) return cached.keys;
    const res = await fetch(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Access keys: ${res.status}`);
    const keys = ((await res.json()) as { keys: Jwk[] }).keys;
    cached = { team, keys, at: Date.now() };
    return keys;
}

/** The signed-in owner's email, or null. For the layout, which can't answer 404 itself: it loads the owner's data only when this says yes. */
export async function adminEmail(): Promise<string | null> {
    if (process.env.NODE_ENV === 'development') return 'dev@localhost';
    const team = process.env.ACCESS_TEAM_DOMAIN;
    const aud = process.env.ACCESS_AUD;
    const token = (await headers()).get('cf-access-jwt-assertion');
    if (!team || !aud) console.warn('Admin closed: ACCESS_TEAM_DOMAIN or ACCESS_AUD is not set');
    else if (!token) console.warn('Admin closed: no Cf-Access-Jwt-Assertion header on the request');
    else {
        try {
            return await verifyAccessJwt(token, await teamKeys(team), { iss: `https://${team}`, aud }) || null;
        } catch (error) {
            console.error('Could not check Access token', error);
        }
    }
    return null;
}

/**
 * Call first in every admin page and action. A signed-in owner gets their email; anyone else gets a 404, so the page looks like it
 * is not there. Closed when ACCESS_TEAM_DOMAIN or ACCESS_AUD is not set. Only `next dev` skips the check (NODE_ENV is never 'development' in a build).
 */
export async function requireAdmin(): Promise<string> {
    return (await adminEmail()) ?? notFound();
}
