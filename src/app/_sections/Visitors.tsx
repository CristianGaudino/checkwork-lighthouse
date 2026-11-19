import type { Users } from '@/lib/clerk';
import { type Ranked, type SiteTraffic, type Visitors as VisitorData } from '@/lib/cloudflare';
import { vsLastWeek } from '@/lib/today';
import { cell, num, panel, Problem, Section, Setup } from './ui';

/** Label, number, and an optional quiet line under it (the change on last week). */
const Figures = ({ items }: { items: [string, number, string?][] }) => (
    <dl className={`mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-sm tabular-nums ${items.length === 4 ? 'sm:grid-cols-4' : ''}`}>
        {items.map(([label, value, change]) => (
            <div key={label} className="bg-canvas px-4 py-3">
                <dt className="text-xs text-fg-muted">{label}</dt>
                <dd className="mt-1 text-lg">{num.format(value)}</dd>
                {change && <dd className="text-xs text-fg-muted">{change}</dd>}
            </div>
        ))}
    </dl>
);

const List = ({ title, rows }: { title: string; rows: Ranked }) => rows.length > 0 && (
    <div>
        <h3 className="text-xs text-fg-muted">{title}</h3>
        <ul className={`${panel} mt-1 text-sm tabular-nums`}>
            {rows.map(r => (
                <li key={r.name} className="flex justify-between gap-4 px-4 py-2">
                    <span className="truncate">{r.name}</span><span className="text-fg-muted">{num.format(r.views)}</span>
                </li>
            ))}
        </ul>
    </div>
);

/** One site's week: visits and page views against last week, then where they came from as short ranked lists. */
export function SiteVisitors({ traffic, visitors, problem }: { traffic: SiteTraffic | undefined; visitors: VisitorData | undefined; problem?: string }) {
    if (!traffic && !problem) return null;
    return (
        <Section title="Visitors" aside="7 days">
            {problem && <Problem>{problem}</Problem>}
            {traffic && (
                <>
                    <Figures items={[
                        ['Visits', traffic.visits, visitors && vsLastWeek(traffic.visits, visitors.prevVisits)],
                        ['Page views', traffic.views, visitors && vsLastWeek(traffic.views, visitors.prevViews)],
                    ]} />
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <List title="Pages" rows={traffic.topPaths.map(p => ({ name: p.path, views: p.views }))} />
                        {visitors && <List title="Referrers" rows={visitors.referrers} />}
                        {visitors && <List title="Countries" rows={visitors.countries} />}
                        {visitors && <List title="Devices" rows={visitors.devices} />}
                    </div>
                </>
            )}
        </Section>
    );
}

/** A Clerk app's users: everyone, and who signed up or came back lately. Nothing for a site without Clerk. */
export function SiteUsers({ users, problem, setup }: { users?: Users; problem?: string; setup?: string }) {
    if (!users && !problem && !setup) return null;
    return (
        <Section title="Users" aside={users && `${num.format(users.total)} in all`}>
            {setup && <Setup>{setup}</Setup>}
            {problem && <Problem>{problem}</Problem>}
            {users && <Figures items={[
                ['New, 7 days', users.new7, vsLastWeek(users.new7, users.newPrev7)],
                ['New, 30 days', users.new30],
                ['Active, 7 days', users.active7],
                ['Active, 30 days', users.active30],
            ]} />}
        </Section>
    );
}

type Row = { name: string; traffic?: SiteTraffic; visitors?: VisitorData; users?: Users };

// The table's short form: "+12", "-3" or "Same"
const change = (now: number, before: number | undefined) => (before === undefined ? '–' : now === before ? 'Same' : vsLastWeek(now, before).replace(' vs last week', ''));

/** Every site side by side: visits on last week, the top referrer, and users where Clerk is set up. */
export function VisitorsSummary({ rows, problem }: { rows: Row[]; problem?: string }) {
    const anyUsers = rows.some(r => r.users);
    // Nothing to compare until analytics or a Clerk key answers; the Traffic section says what to set
    if (!problem && !anyUsers && !rows.some(r => r.traffic)) return null;
    return (
        <Section id="visitors" title="Visitors" aside="7 days, against the 7 before">
            {problem && <Problem>{problem}</Problem>}
            <div className="relative mt-3 overflow-x-auto rounded-2xl border border-line">
                <table className="w-full whitespace-nowrap text-left text-sm tabular-nums">
                    <thead className="text-xs text-fg-muted">
                        <tr className="border-b border-line">
                            {['Site', 'Visits', 'Change', 'Top referrer', ...(anyUsers ? ['Users', 'New', 'Active'] : [])].map(h => <th key={h} scope="col" className={`${cell} font-normal`}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {rows.filter(r => r.traffic || r.users).map(r => (
                            <tr key={r.name}>
                                <th scope="row" className={`${cell} font-medium`}>{r.name}</th>
                                <td className={cell}>{r.traffic ? num.format(r.traffic.visits) : '–'}</td>
                                <td className={`${cell} text-fg-muted`}>{r.traffic ? change(r.traffic.visits, r.visitors?.prevVisits) : '–'}</td>
                                <td className={`${cell} max-w-56 truncate text-fg-muted`}>{r.visitors?.referrers[0]?.name ?? '–'}</td>
                                {anyUsers && <>
                                    <td className={cell}>{r.users ? num.format(r.users.total) : '–'}</td>
                                    <td className={`${cell} text-fg-muted`}>{r.users ? `${num.format(r.users.new7)} (${change(r.users.new7, r.users.newPrev7)})` : '–'}</td>
                                    <td className={`${cell} text-fg-muted`}>{r.users ? num.format(r.users.active7) : '–'}</td>
                                </>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Section>
    );
}
