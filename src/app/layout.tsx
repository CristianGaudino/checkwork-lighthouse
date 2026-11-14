import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import { adminEmail } from '@/lib/access';
import { readSessions } from '@/lib/claude';
import { jumps } from '@/lib/palette';
import { beats } from '@/lib/pulse';
import { loadIcons, loadNeon, loadToday } from './_data';
import { Live } from './_sections/Live';
import { Nav } from './_sections/Nav';
import { Palette } from './_sections/Palette';
import { IconStyles } from './_sections/ProjectIcon';
import '@/styles/globals.css';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const NAME = 'Checkwork Lighthouse';

export const metadata: Metadata = {
    title: { template: `%s · ${NAME}`, default: NAME },
    description: 'Every Checkwork site, repo and release in one place.',
    applicationName: NAME,
    robots: { index: false, follow: false },
    icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
    // Opens full screen from an iPhone's home screen, like an app
    appleWebApp: { capable: true, title: 'Lighthouse', statusBarStyle: 'black-translucent' },
};

// viewport-fit=cover lets the tab bar reach the screen's bottom edge, with env(safe-area-inset-bottom) keeping its buttons clear
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0B0F1F', viewportFit: 'cover' };

/** What every page carries: the icons, the live pulse and the palette. Only for the signed-in owner. */
async function ownerParts(local: boolean) {
    // The layout can't answer 404 (the page does that), so it loads nothing for anyone else: a refused page shows no data
    if (!(await adminEmail())) return null;
    const [t, sessions, icons, neon] = await Promise.all([loadToday(), readSessions(), loadIcons(), loadNeon()]);
    const root = local ? (await import('node:path')).dirname(process.cwd()) : undefined;
    return { icons, beats: beats(t.tasks, sessions), jumps: jumps(t.sites, { account: process.env.CLOUDFLARE_ACCOUNT_ID, neon: neon.projects, root }) };
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
    // The This PC page only exists under `npm run dev`, where Lighthouse can read this PC (src/lib/local.ts)
    const local = process.env.NODE_ENV === 'development';
    const owner = await ownerParts(local);
    return (
        <html lang="en-IE" className={`${sora.variable} ${inter.variable}`}>
            <body className="bg-canvas font-sans text-fg antialiased">
                {/* The manifest makes Lighthouse installable. use-credentials sends the Access cookie with it; without that,
                    browsers fetch it cookie-less, Access answers with its login page, and install quietly fails. React puts this in <head>. */}
                <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
                <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-fg focus:px-4 focus:py-2 focus:text-canvas">Skip to content</a>
                {owner && <><IconStyles icons={owner.icons} /><Live beats={owner.beats} /><Palette jumps={owner.jumps} local={local} /></>}
                <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
                    <Nav local={local} />
                    {/* Full width by choice (the owner's call), with page-edge padding only; pb-28 keeps the end of a page above the phone's tab bar */}
                    <main id="main" className="min-w-0 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">{children}</main>
                </div>
            </body>
        </html>
    );
}
