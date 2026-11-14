'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mark } from '@/components/Mark';
import { refresh } from '../ask';
import { openPalette } from './Palette';

// 18px line icons on one 1.5 stroke, drawn here rather than adding an icon library for a handful
const ICONS = {
    // A lamp and its beam
    overview: <><circle cx="12" cy="12" r="2.5" /><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" /></>,
    work: <><path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M4 13h4.5l1 2h5l1-2H20" /></>,
    projects: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
    usage: <path d="M5 19V11M10 19V5M15 19v-6M20 19V9" />,
    // A pulse line
    activity: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
    // A receipt
    costs: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
    pc: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M9 20h6M12 16v4" /></>,
};

// `tab`: also in the phone's tab bar, which has room for four; the rest are a search away there
const PAGES = [
    { href: '/', label: 'Overview', icon: 'overview', tab: true },
    { href: '/work', label: 'Work', icon: 'work', tab: true },
    { href: '/activity', label: 'Activity', icon: 'activity', tab: true },
    { href: '/projects', label: 'Projects', icon: 'projects', tab: true },
    { href: '/costs', label: 'Costs', icon: 'costs' },
    { href: '/usage', label: 'Usage', icon: 'usage' },
    { href: '/pc', label: 'This PC', icon: 'pc', local: true },
] as const;

const Icon = ({ name }: { name: keyof typeof ICONS }) => (
    <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[name]}</svg>
);

const RefreshButton = ({ className, form = '' }: { className: string; form?: string }) => (
    // Answers are remembered for a minute or more (src/lib/memo.ts); this fetches everything now
    <form action={refresh} className={form}><button type="submit" className={className}>Refresh</button></form>
);

// Two copies of the brand (sidebar, phone bar), so each Mark needs its own gradient id: one inside a hidden sidebar blanks the other
const Brand = ({ id }: { id: string }) => (
    <Link href="/" className="flex items-center gap-2 font-display text-[15px] font-semibold">
        <Mark id={id} className="size-6" />
        Lighthouse
    </Link>
);

/** The sidebar on a wide screen, and on a phone a slim top bar plus a tab bar at the bottom, where a thumb reaches. */
export function Nav({ local }: { local: boolean }) {
    const path = usePathname();
    const pages = PAGES.filter(p => !('local' in p) || local);
    const current = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
    return (
        <>
            <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line px-3 py-5 lg:flex">
                <div className="px-3"><Brand id="side" /></div>
                <button type="button" onClick={openPalette} className="mt-6 flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:text-fg">
                    <Icon name="search" />
                    <span className="flex-1 text-left">Go to</span>
                    <kbd className="rounded-md px-1.5 py-0.5 font-sans text-[11px] leading-none shadow-[inset_0_0_0_1px_var(--line)]">Ctrl K</kbd>
                </button>
                <nav aria-label="Pages" className="mt-4">
                    <ul className="grid gap-1">
                        {pages.map(p => (
                            <li key={p.href}>
                                <Link
                                    href={p.href}
                                    aria-current={current(p.href) ? 'page' : undefined}
                                    className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-fg-muted transition-colors hover:text-fg aria-[current=page]:bg-surface aria-[current=page]:text-fg aria-[current=page]:shadow-[inset_0_0_0_1px_var(--line)]"
                                >
                                    <Icon name={p.icon} />
                                    {p.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
                <RefreshButton form="mt-auto" className="h-9 w-full rounded-lg px-3 text-left text-sm text-fg-muted transition-colors hover:text-fg" />
            </aside>

            <header className="flex h-14 items-center justify-between border-b border-line px-4 sm:px-6 lg:hidden">
                <Brand id="top" />
                <div className="flex items-center gap-2">
                    <button type="button" onClick={openPalette} aria-label="Go to" className="grid size-11 place-items-center text-fg-muted active:text-fg"><Icon name="search" /></button>
                    <RefreshButton className="h-11 px-1 text-sm text-fg-muted active:text-fg" />
                </div>
            </header>
            {/* Translucent, so the page scrolls on underneath it; pb keeps it clear of the iPhone's home bar */}
            <nav aria-label="Pages" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-canvas/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
                <ul className="flex">
                    {pages.filter(p => 'tab' in p).map(p => (
                        <li key={p.href} className="flex-1">
                            <Link
                                href={p.href}
                                aria-current={current(p.href) ? 'page' : undefined}
                                className="flex h-14 flex-col items-center justify-center gap-1 text-[11px] text-fg-muted transition-transform active:scale-95 aria-[current=page]:text-fg"
                            >
                                <Icon name={p.icon} />
                                {p.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
        </>
    );
}
