import { adminEmail } from '@/lib/access';
import { readSessions } from '@/lib/claude';
import { listRepos } from '@/lib/local';
import { ClaudeShell } from '../_sections/ClaudeShell';

/**
 * The session list, kept while you move between sessions. Loads nothing for anyone but the owner, and nothing off this
 * PC: a layout can't answer 404, so it hands over to the page, which does.
 */
export default async function ClaudeLayout({ children }: LayoutProps<'/claude'>) {
    if (!(await adminEmail())) return children;
    const [sessions, repos] = await Promise.all([readSessions(), listRepos()]);
    if (!sessions || !repos) return children;
    return <ClaudeShell sessions={sessions} repos={repos}>{children}</ClaudeShell>;
}
