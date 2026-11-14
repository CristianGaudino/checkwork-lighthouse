import { requireAdmin } from '@/lib/access';
import { domainOf } from '@/lib/domains';
import { INCLUDED } from '@/lib/minutes';
import { loadCosts, loadNeon, loadToday } from '../_data';
import { ProjectIcon } from '../_sections/ProjectIcon';
import { ext, link, num, PageTitle, panel, Problem, Section } from '../_sections/ui';

export const metadata = { title: 'Costs' };

const usd = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'USD' });
const date = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

type Row = { label: string; value: string; note?: string; href: string };

/** What the sites cost to run: money where the service says it, use where it only says that, and when each domain renews. */
export default async function Costs() {
    await requireAdmin();
    const [t, costs, neon] = await Promise.all([loadToday(), loadCosts(), loadNeon()]);
    const m = t.usage.minutes;
    const hours = neon.projects?.reduce((sum, p) => sum + (p.computeHours ?? 0), 0);
    const cloudflare = costs.plans?.filter(p => p.currency === 'USD').reduce((sum, p) => sum + p.perMonth, 0);
    const known = (costs.claude ?? 0) + (cloudflare ?? 0);
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;

    const rows: Row[] = [
        {
            label: 'Claude API', value: costs.claude === undefined ? '–' : `${usd.format(costs.claude)} this month`,
            note: costs.claudeNote ?? 'Lags a few hours behind', href: 'https://platform.claude.com/settings/billing',
        },
        {
            label: 'Cloudflare', note: costs.plansNote, href: account ? `https://dash.cloudflare.com/${account}/billing` : 'https://dash.cloudflare.com',
            value: !costs.plans ? '–' : costs.plans.length ? costs.plans.map(p => `${p.name}, ${usd.format(p.perMonth)} a month`).join('; ') : 'Free plan',
        },
        {
            label: 'GitHub Actions', href: 'https://github.com/settings/billing/summary', note: t.usage.problem,
            value: m ? `${num.format(m.used)} of ${num.format(INCLUDED)} free minutes, about ${num.format(m.projected)} by the month’s end` : '–',
        },
        {
            label: 'Neon', href: 'https://console.neon.tech/app/billing', note: neon.problem ?? neon.setup,
            value: hours === undefined ? '–' : `${num.format(hours)} compute hours this billing period`,
        },
    ];
    const domains = [...new Map(t.sites.map(s => [domainOf(s.p.site), { repo: s.p.repo, expires: s.expires }])).entries()];

    return (
        <>
            <PageTitle sub="Claude API and Cloudflare in money. GitHub and Neon in use, which is free up to their limits">
                {known ? `About ${usd.format(known)} this month` : 'Costs'}
            </PageTitle>
            {(m?.projected ?? 0) > INCLUDED && <Problem>Actions will pass its {num.format(INCLUDED)} free minutes this month at this rate. Deploy from this PC to save some.</Problem>}
            <div className="mt-10">
                <Section title="Services">
                    <ul className={`${panel} text-sm`}>
                        {rows.map(r => (
                            <li key={r.label} className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[10rem_1fr_auto] sm:items-baseline">
                                <span className="font-medium">{r.label}</span>
                                <span className="tabular-nums">
                                    {r.value}
                                    {r.note && <span className="block text-fg-muted">{r.note}</span>}
                                </span>
                                <a {...ext} className={`${link} text-fg-muted`} href={r.href}>Billing</a>
                            </li>
                        ))}
                    </ul>
                </Section>
                <Section title="Domains" aside="Renew before these dates">
                    <ul className={`${panel} text-sm`}>
                        {domains.map(([d, { repo, expires }]) => (
                            <li key={d} className="flex items-center justify-between gap-4 px-4 py-3">
                                <span className="flex items-center gap-3"><ProjectIcon project={repo} />{d}</span>
                                <span className="tabular-nums text-fg-muted">{expires ? date.format(new Date(expires)) : 'Not published, check the registrar'}</span>
                            </li>
                        ))}
                    </ul>
                </Section>
            </div>
        </>
    );
}
