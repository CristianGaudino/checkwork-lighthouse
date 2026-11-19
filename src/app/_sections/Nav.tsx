'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { useFormStatus } from 'react-dom';
import { Mark } from '@/components/Mark';
import { isFolded, SIDEBAR_EVENT, toggleSidebar } from '@/lib/sidebar';
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
    // A speech bubble
    claude: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
    pc: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M9 20h6M12 16v4" /></>,
    // A panel with its edge, and which way it goes
    fold: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M9 4v16M15.5 10l-2 2 2 2" /></>,
    unfold: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M9 4v16M13.5 10l2 2-2 2" /></>,
};

// `tab`: also in the phone's tab bar, which has room for four; the rest are a search away there
// Most used first: on this PC, Claude sits under Work
const PAGES = [
    { href: '/', label: 'Overview', icon: 'overview', tab: true },
    { href: '/work', label: 'Work', icon: 'work', tab: true },
    { href: '/claude', label: 'Claude', icon: 'claude', local: true },
    { href: '/activity', label: 'Activity', icon: 'activity', tab: true },
    { href: '/projects', label: 'Projects', icon: 'projects', tab: true },
    { href: '/usage', label: 'Usage', icon: 'usage' },
    { href: '/costs', label: 'Costs', icon: 'costs' },
    { href: '/pc', label: 'This PC', icon: 'pc', local: true },
] as const;

/** How many things on a page need you: Work's to-dos and waiting sessions, and the sessions alone on Claude. */
export type Counts = Partial<Record<(typeof PAGES)[number]['href'], number>>;

const Icon = ({ name, className = '' }: { name: keyof typeof ICONS; className?: string }) => (
    <svg viewBox="0 0 24 24" className={`size-[18px] shrink-0 ${className}`}fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[name]}</svg>
);

type RefreshProps = { className: string; label?: string; title?: string };

const RefreshButton = ({ form = '', ...props }: RefreshProps & { form?: string }) => (
    // Answers are remembered for a minute or more (src/lib/memo.ts); this fetches everything now, which takes a few seconds
    <form action={refresh} className={form}><Refreshing {...props} /></form>
);

function Refreshing({ className, label, title }: RefreshProps) {
    const { pending } = useFormStatus();
    return (
        <button type="submit" disabled={pending} title={title} className={`flex items-center gap-2 ${className}`}>
            <svg viewBox="0 0 24 24" className={`size-4 shrink-0 ${pending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" /></svg>
            <span className={label}>{pending ? 'Refreshing' : 'Refresh'}</span>
        </button>
    );
}

// Two copies of the brand (sidebar, phone bar), so each Mark needs its own gradient id: one inside a hidden sidebar blanks the other
const Brand = ({ id, label }: { id: string; label?: string }) => (
    <Link href="/" className="flex items-center gap-2 font-display text-[15px] font-semibold">
        <Mark id={id} className="size-6 shrink-0" />
        <span className={label}>Lighthouse</span>
    </Link>
);

/** "Powered by Checkwork" with its logo, as in How Many?. Hidden when folded, as there: the rail already starts with a check mark. */
const PoweredBy = () => (
    <a href="https://www.checkwork.ie" target="_blank" rel="noopener" className="mt-3 flex min-h-9 items-center gap-2 px-3 text-xs text-fg-muted transition-colors hover:text-fg folded:hidden">
        Powered by
        {/* eslint-disable-next-line @next/next/no-img-element -- a small SVG served as is: nothing for next/image to do */}
        <img src="/brand/checkwork-logo-on-dark.svg" width={345} height={60} alt="Checkwork" className="h-4 w-auto" />
        <span className="sr-only">(opens in a new tab)</span>
    </a>
);

const onFold = (change: () => void) => {
    window.addEventListener(SIDEBAR_EVENT, change);
    return () => window.removeEventListener(SIDEBAR_EVENT, change);
};

/** The sidebar on a wide screen, and on a phone a slim top bar plus a tab bar at the bottom, where a thumb reaches. */
export function Nav({ local, counts = {} }: { local: boolean; counts?: Counts }) {
    const path = usePathname();
    const pages = PAGES.filter(p => !('local' in p) || local);
    const current = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
    // The look is CSS (`folded:`, set before paint); this is only for tooltips and the button's state. False on the server.
    const folded = useSyncExternalStore(onFold, isFolded, () => false);
    const tip = (label: string) => (folded ? label : undefined);
    return (
        <>
            <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-line px-3 py-5 lg:flex">
                <div className="px-3 folded:px-2"><Brand id="side" label="folded:sr-only" /></div>
                <button type="button" onClick={openPalette} title={tip('Go to (Ctrl K)')} className="mt-6 flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:text-fg folded:justify-center folded:px-0">
                    <Icon name="search" />
                    <span className="flex-1 text-left folded:sr-only">Go to</span>
                    <kbd className="rounded-md px-1.5 py-0.5 font-sans text-[11px] leading-none shadow-[inset_0_0_0_1px_var(--line)] folded:hidden">Ctrl K</kbd>
                </button>
                <nav aria-label="Pages" className="mt-4">
                    <ul className="grid gap-1">
                        {pages.map(p => (
                            <li key={p.href}>
                                <Link
                                    href={p.href}
                                    aria-current={current(p.href) ? 'page' : undefined}
                                    title={tip(p.label)}
                                    className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-fg-muted transition-colors hover:text-fg aria-[current=page]:bg-surface aria-[current=page]:text-fg aria-[current=page]:shadow-[inset_0_0_0_1px_var(--line)] folded:justify-center folded:px-0"
                                >
                                    <span className="relative">
                                        <Icon name={p.icon} />
                                        {/* Folded, a dot on the icon says the same as the number */}
                                        {Boolean(counts[p.href]) && <span aria-hidden className="absolute -right-1 -top-1 hidden size-2 rounded-full bg-warn folded:block" />}
                                    </span>
                                    <span className="flex-1 folded:sr-only">{p.label}</span>
                                    {Boolean(counts[p.href]) && <span className="text-xs tabular-nums text-fg-muted folded:sr-only"><span className="sr-only">, </span>{counts[p.href]}<span className="sr-only"> need you</span></span>}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
                {/* Fold and open sit at the foot beside Refresh, as in How Many? */}
                <div className="mt-auto flex items-center gap-1 folded:flex-col">
                    <RefreshButton form="flex-1 folded:flex-none" label="folded:sr-only" title={tip('Refresh')} className="h-9 w-full rounded-lg px-3 text-left text-sm text-fg-muted transition-colors hover:text-fg folded:size-9 folded:justify-center folded:px-0" />
                    <button type="button" onClick={toggleSidebar} aria-expanded={!folded} aria-label={folded ? 'Expand sidebar' : 'Collapse sidebar'} title={folded ? 'Expand sidebar' : 'Collapse sidebar'} className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:text-fg">
                        <Icon name="fold" className="folded:hidden" />
                        <Icon name="unfold" className="hidden folded:block" />
                    </button>
                </div>
                <PoweredBy />
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
                                <span className="relative">
                                    <Icon name={p.icon} />
                                    {Boolean(counts[p.href]) && <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-warn px-1 text-center text-[10px] font-medium leading-4 text-canvas tabular-nums"><span className="sr-only">, </span>{counts[p.href]}<span className="sr-only"> need you</span></span>}
                                </span>
                                {p.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
        </>
    );
}
