import { requireAdmin } from '@/lib/access';
import { Gate } from '../_sections/Gate';
import { loadActivity } from '../_data';
import { Feed } from '../_sections/Feed';
import { PageTitle, Problem } from '../_sections/ui';

export const metadata = { title: 'Activity' };

/** What happened across every project in the last week, newest first. */
export default function Page() {
    return <Gate><Activity /></Gate>;
}

async function Activity() {
    await requireAdmin();
    const a = await loadActivity();
    return (
        <>
            <PageTitle sub="The last week, every project">Activity</PageTitle>
            {a.problem && <Problem>{a.problem}</Problem>}
            <div className="mt-8">{a.events && <Feed events={a.events} />}</div>
        </>
    );
}
