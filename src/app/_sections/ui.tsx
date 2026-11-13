import type { Light } from '@/lib/today';

/** Shared bits for the pages. */

export const link = 'underline-offset-4 hover:text-fg hover:underline';
// Links that leave for another site (GitHub, UptimeRobot, the projects) open in a new tab, so Lighthouse stays put
export const ext = { target: '_blank', rel: 'noreferrer' } as const;

export const Problem = ({ children }: { children: React.ReactNode }) => (
    <p role="status" className="mt-4 max-w-2xl rounded-xl border border-warn/40 px-4 py-3 text-sm text-warn">{children}</p>
);

/** Setup still to do (a key not set yet): quiet, so it never reads like something broke. */
export const Setup = ({ children }: { children: React.ReactNode }) => <p className="mt-2 max-w-2xl text-sm text-fg-muted">{children}</p>;

/** The page's one big line, saying how things stand, with an optional quiet line under it. */
export const PageTitle = ({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) => (
    <div>
        <h1 className="text-3xl font-semibold sm:text-4xl">{children}</h1>
        {sub && <p className="mt-2 text-sm text-fg-muted">{sub}</p>}
    </div>
);

/** A titled block of a page. `aside` sits at the right of the title: a count, or a link to the full list. */
export const Section = ({ id, title, aside, children }: { id?: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) => (
    <section id={id} className="mt-12 scroll-mt-6 first:mt-0">
        <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            {aside && <div className="text-sm text-fg-muted tabular-nums">{aside}</div>}
        </div>
        {children}
    </section>
);

/** A list in one quiet panel, rows split by hairlines. */
export const panel = 'mt-3 divide-y divide-line rounded-2xl border border-line';

/** A table cell: 8px rows on the 4px grid. */
export const cell = 'px-3 py-2 first:pl-4 last:pr-4';

const LIGHT: Record<Light, string> = { bad: 'bg-bad', warn: 'bg-warn', ok: 'bg-ok' };
const SAID: Record<Light, string> = { bad: 'Needs you now', warn: 'Needs you', ok: 'All good' };

/** The status light, the one signal used everywhere: green fine, amber something to do, red now. Grey when not known. */
export const Dot = ({ light, className = '' }: { light: Light | null; className?: string }) => (
    <span role="img" aria-label={light ? SAID[light] : 'Not known'} className={`inline-block size-2 shrink-0 rounded-full ${light ? LIGHT[light] : 'bg-fg-muted/50'} ${className}`} />
);

export const num = new Intl.NumberFormat('en-IE');
export const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
