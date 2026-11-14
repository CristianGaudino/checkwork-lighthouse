import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { MODEL } from '@/lib/ask';
import { loadToday } from './_data';
import { morningBrief } from './ask';
import { Ask } from './_sections/Ask';
import { Sites } from './_sections/Sites';
import { Tasks } from './_sections/Tasks';
import { Minutes } from './_sections/Usage';
import { link, n, PageTitle, Problem, Section } from './_sections/ui';

export const metadata = { title: 'Overview' };

// The Overview shows the top of the list; the rest, with their buttons, are on Work
const TOP = 5;

export default async function Overview() {
    await requireAdmin();
    const t = await loadToday();
    const monitored = t.sites.filter(s => s.p.uptime);
    const up = monitored.filter(s => s.p.uptime?.state === 'up').length;
    const behind = t.sites.filter(s => s.live?.state === 'behind').length;
    const heading = t.tasks.length ? `${n(t.tasks.length, 'thing needs', 'things need')} you` : t.problem ? 'Lighthouse' : 'Nothing needs you';
    const sub = [
        monitored.length > 0 && `${up} of ${monitored.length} sites up`,
        behind > 0 && `${behind} not running main`,
    ].filter(Boolean).join(', ');

    return (
        <>
            <PageTitle sub={sub || undefined}>{heading}</PageTitle>
            {[t.problem, t.uptime.problem, t.usage.problem, t.deploys.problem].filter(Boolean).map(text => <Problem key={text}>{text}</Problem>)}

            <div className="mt-10">
                {t.tasks.length > 0 && (
                    <Section title="Next up" aside={<Link className={link} href="/work">{t.tasks.length > TOP ? `All ${t.tasks.length}` : 'Act on these'}</Link>}>
                        <Tasks compact tasks={t.tasks.slice(0, TOP)} />
                    </Section>
                )}

                <Section title="Sites" aside={<Link className={link} href="/usage">Usage</Link>}>
                    <Sites rows={t.sites} analytics={t.analytics.data} known={!t.problem} />
                    {[t.deploys.setup, t.security.setup].filter(Boolean).map(text => <p key={text} className="mt-2 text-sm text-fg-muted">{text}</p>)}
                </Section>

                {t.usage.minutes && <Minutes compact m={t.usage.minutes} />}

                <Section title="Morning brief">
                    <Ask action={morningBrief} label="Write my brief" note={`One ${MODEL} call, a few cents`} />
                </Section>
            </div>
        </>
    );
}
