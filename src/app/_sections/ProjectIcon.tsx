import { initials, subLetter } from '@/lib/icons';
import { PROJECTS, type Project } from '../../../lighthouse.config';

const SAFE = /^[a-z0-9_-]+$/i;

/**
 * Each favicon once per page, as a class: a list of twenty tasks then carries eight icons, not twenty. The layout
 * renders it; the URIs are data: images of a checked type (src/lib/icons.ts), so they can't break out of the rule.
 */
export const IconStyles = ({ icons, sites }: { icons: Record<string, string>; sites: Project[] }) => {
    const css = Object.entries(icons).filter(([repo]) => SAFE.test(repo)).map(([repo, uri]) => {
        // A subdomain's site wears its main site's mark, so it carries its letter as a badge
        const badge = subLetter(sites.find(p => p.repo === repo)?.site ?? '');
        return `.picon-${repo}{background-image:url("${uri}");background-color:transparent;color:transparent;box-shadow:none}${badge && /^[A-Z0-9]$/.test(badge) ? `.picon-${repo}::after{content:"${badge}"}` : ''}`;
    }).join('');
    return css ? <style>{css}</style> : null;
};

/**
 * A project's icon, by its name or repo: its favicon where the layout found one, otherwise a tile with its initials.
 * Decorative: the name always sits next to it.
 */
export function ProjectIcon({ project, className = 'size-5 text-[9px]' }: { project: string; className?: string }) {
    // A repo without a config line goes by its own name (src/lib/repos.ts)
    const p = PROJECTS.find(x => x.name === project || x.repo === project) ?? { name: project, repo: project };
    return (
        <span aria-hidden className={`picon relative inline-grid shrink-0 place-items-center rounded-md bg-surface bg-contain bg-center bg-no-repeat font-semibold leading-none text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] ${SAFE.test(p.repo) ? `picon-${p.repo}` : ''} ${className}`}>
            {initials(p.name)}
        </span>
    );
}
