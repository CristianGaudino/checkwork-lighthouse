/** Shared bits for the page's sections. */

export const link = 'underline-offset-4 hover:text-fg hover:underline';
// Every link leaves for another site (GitHub, UptimeRobot, the projects), so it opens in a new tab and Lighthouse stays put
export const ext = { target: '_blank', rel: 'noreferrer' } as const;

export const Problem = ({ children }: { children: React.ReactNode }) => (
    <p role="status" className="mt-4 max-w-2xl rounded-xl border border-warn/40 px-4 py-3 text-sm text-warn">{children}</p>
);

/** Setup still to do (a key not set yet): quiet, so it never reads like something broke. */
export const Setup = ({ children }: { children: React.ReactNode }) => <p className="mt-2 max-w-2xl text-sm text-fg-muted">{children}</p>;

/** A section heading the jump links can land on. */
export const Heading = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <h2 id={id} className="mt-14 scroll-mt-6 text-xl font-semibold">{children}</h2>
);

/** A table cell: 8px rows on the 4px grid, flush with the page edge at either end. */
export const cell = 'px-3 py-2 first:pl-0 last:pr-0';
