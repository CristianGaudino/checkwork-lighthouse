import { NextResponse, type NextRequest } from 'next/server';
import { adminEmail } from '@/lib/access';

/**
 * Whether a request came from somewhere other than this site's own pages, by what the browser says about it: any
 * other page could otherwise post to localhost and drive a session. Writes must also say JSON, which a plain form from
 * another site can't send without asking first (and nothing here says yes). Returns the status to refuse with, or null.
 */
export function fromElsewhere(method: string, header: (name: string) => string | null, origin: string): 403 | 415 | null {
    // Only this PC by its own name: `next dev` listens on the network too, and a site that points its name at this PC
    // (DNS rebinding) would otherwise count as same-origin
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(header('host') ?? '')) return 403;
    const site = header('sec-fetch-site');
    if (site && site !== 'same-origin') return 403;
    if (method === 'GET') return null;
    if (header('origin') !== origin) return 403;
    return header('content-type')?.startsWith('application/json') ? null : 415;
}

/** The Claude routes run Claude on this PC: only under `npm run dev`, and only for this site's own pages. */
export async function refuse(req: NextRequest): Promise<NextResponse | null> {
    if (process.env.NODE_ENV !== 'development' || !(await adminEmail())) return new NextResponse(null, { status: 404 });
    const status = fromElsewhere(req.method, name => req.headers.get(name), req.nextUrl.origin);
    return status ? new NextResponse(null, { status }) : null;
}
