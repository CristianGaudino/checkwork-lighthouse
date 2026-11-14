import type { Project } from '../../lighthouse.config';

/**
 * Each project's icon is its site's own favicon, fetched by the server and put in the page as a data URI, so the
 * browser never leaves 'self' (the CSP allows data: images). A site without one gets a letter tile instead.
 */

// Only these types reach the page, so a data URI can never carry anything but an image
const TYPES = new Set(['image/svg+xml', 'image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/webp', 'image/gif', 'image/jpeg']);
const MAX_BYTES = 48 * 1024; // one icon, not a photo: bigger ones fall back to the tile
const TIMEOUT = 3000; // the layout waits on these after every Refresh, so a site that is down must not hold it long

/** The icon addresses a page names, best first (SVG, then the largest), then /favicon.ico. */
export function iconHrefs(html: string, base: string): string[] {
    const found = [...html.matchAll(/<link\b[^>]*>/gi)].flatMap(([tag]) => {
        const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(v => v !== undefined) ?? '';
        if (!/(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(attr('rel')) || !attr('href')) return [];
        try {
            const href = new URL(attr('href'), base).href;
            const svg = /svg/i.test(attr('type')) || /\.svg(\?|$)/i.test(href);
            return [{ href, rank: svg ? 1e6 : Number(attr('sizes').match(/\d+/)?.[0] ?? 16) }];
        } catch { return []; }
    });
    const hrefs = found.sort((a, b) => b.rank - a.rank).map(f => f.href);
    return [...new Set([...hrefs, new URL('/favicon.ico', base).href])];
}

// shortcut: the last two labels, as domainOf in domains.ts (not imported: this file also runs in the browser)
const domain = (host: string) => host.toLowerCase().split('.').slice(-2).join('.');
/** On the site's own domain: a login page in front of the site (Cloudflare Access) answers from elsewhere, with its own icon. */
const own = (url: string, site: string) => { try { return domain(new URL(url).hostname) === domain(site); } catch { return false; } };

/** The first candidate that is a small image on the site's own domain, as a data URI, or null. */
async function firstIcon(hrefs: string[], site: string): Promise<string | null> {
    for (const href of hrefs.filter(h => own(h, site))) {
        const res = await fetch(href, { signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
        const type = res?.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
        if (!res?.ok || !own(res.url || href, site) || !TYPES.has(type) || Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) continue;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_BYTES) continue;
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        return `data:${type};base64,${btoa(bin)}`;
    }
    return null;
}

/** A site's favicon as a data URI, or null (no answer, a login page, no icon). Never throws. */
export async function fetchIcon(site: string): Promise<string | null> {
    const base = `https://${site}/`;
    const res = await fetch(base, { signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
    // No answer at all: the site is down, and its /favicon.ico would only wait out the timeout again
    if (!res) return null;
    const mine = res.ok && own(res.url || base, site);
    const html = mine && res.headers.get('content-type')?.includes('html') ? await res.text().catch(() => '') : '';
    return firstIcon(iconHrefs(html, mine ? res.url || base : base), site).catch(() => null);
}

/**
 * Icons by repo. A favicon two projects share (a demo of the main site) stays with the first of them, and the others
 * get their letter tile, so every row still tells apart at a glance.
 */
export function iconsByRepo(projects: Project[], icons: (string | null)[]): Record<string, string> {
    const out: Record<string, string> = {}, used = new Set<string>();
    projects.forEach((p, i) => {
        const icon = icons[i];
        if (icon && !used.has(icon)) { out[p.repo] = icon; used.add(icon); }
    });
    return out;
}

/**
 * The badge for a site on a subdomain ("www.demo.checkwork.ie" is D), so it tells apart from the main site whose mark it
 * shares; null for a site on its domain itself.
 */
export function subLetter(site: string): string | null {
    const host = site.toLowerCase().replace(/^www\./, '');
    return host === domain(host) ? null : host[0].toUpperCase();
}

/** "How Many?" is HM, "Checkwork demo" CD, "Portfolio" P: up to two initials. */
export const initials = (name: string) => name.split(/\s+/).map(w => w.match(/[a-z0-9]/i)?.[0] ?? '').join('').slice(0, 2).toUpperCase();
