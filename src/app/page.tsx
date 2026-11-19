import Link from 'next/link';
import { Gate } from './_sections/Gate';
import { requireAdmin } from '@/lib/access';
import { MODEL } from '@/lib/ask';
import { needsYou, readSessions } from '@/lib/claude';
import { loadActivity, loadToday } from './_data';
import { morningBrief } from './ask';
import { Ask } from './_sections/Ask';
import { ClaudeSessions } from './_sections/Claude';
import { Feed } from './_sections/Feed';
import { NotifySettings } from './_sections/Live';
import { Sites } from './_sections/Sites';
import { Tasks } from './_sections/Tasks';
import { Minutes } from './_sections/Usage';
import { link, n, PageTitle, Problem, Section } from './_sections/ui';

export const metadata = { title: 'Overview' };

// The Overview shows the top of the list; the rest, with their buttons, are on Work
const TOP = 5;
const RECENT = 6;

export default function Page() {
    return <Gate><Overview /></Gate>;
}

async function Overview() {
    await requireAdmin();
    const [t, activity, sessions] = await Promise.all([loadToday(), loadActivity(), readSessions()]);
    // Idle and muted projects stay out of the counts, as their tasks do
    const active = t.sites.filter(s => s.status === 'active');
    const monitored = active.filter(s => s.p.uptime);
    const up = monitored.filter(s => s.p.uptime?.state === 'up').length;
    const behind = active.filter(s => s.live?.state === 'behind').length;
    // The same words as Work ("6 to do"), with Claude sessions said apart; the tab title counts both (src/lib/pulse.ts)
    const claude = sessions?.filter(s => needsYou(s)) ?? [];
    const waiting = claude.length > 0 && `${n(claude.length, 'Claude session')} waiting`;
    const heading = t.tasks.length ? `${t.tasks.length} to do` : waiting || (t.problem ? 'Lighthouse' : 'Nothing needs you');
    const sub = [
        t.tasks.length > 0 && waiting,
        t.snoozed > 0 && `${t.snoozed} snoozed`,
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

                {/* Local only: Claude Code sessions live on this PC */}
                {sessions && <ClaudeSessions title="Claude" sessions={claude} more="/claude" />}

                <Section title="Sites" aside={<Link className={link} href="/usage">Usage</Link>}>
                    <Sites rows={t.sites} analytics={t.analytics.data} known={!t.problem} />
                    {[t.deploys.setup, t.security.setup].filter(Boolean).map(text => <p key={text} className="mt-2 text-sm text-fg-muted">{text}</p>)}
                </Section>

                {activity.events && (
                    <Section title="Recent" aside={<Link className={link} href="/activity">All activity</Link>}>
                        <Feed compact events={activity.events.slice(0, RECENT)} />
                    </Section>
                )}

                {t.usage.minutes && <Minutes compact m={t.usage.minutes} />}

                <Section title="Morning brief">
                    <Ask action={morningBrief} label="Write my brief" note={`One ${MODEL} call, a few cents`} />
                </Section>

                <Section title="Notifications">
                    <NotifySettings />
                </Section>
            </div>
        </>
    );
}
