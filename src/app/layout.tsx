import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import Link from 'next/link';
import { Mark } from '@/components/Mark';
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

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0B0F1F' };

// Full width by choice (the owner's call): the page fills the screen at every size, with page-edge padding only
const edge = 'px-4 sm:px-6 lg:px-10';

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html lang="en-IE" className={`${sora.variable} ${inter.variable}`}>
            <body className="bg-canvas font-sans text-fg antialiased">
                {/* The manifest makes Lighthouse installable. use-credentials sends the Access cookie with it; without that,
                    browsers fetch it cookie-less, Access answers with its login page, and install quietly fails. React puts this in <head>. */}
                <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
                <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-fg focus:px-4 focus:py-2 focus:text-canvas">Skip to content</a>
                <header className={`flex h-16 items-center border-b border-line ${edge}`}>
                    <Link href="/" className="flex items-center gap-2 font-display text-base font-semibold">
                        <Mark className="size-6" />
                        {NAME}
                    </Link>
                </header>
                <main id="main" className={`pb-16 pt-8 sm:pt-12 ${edge}`}>{children}</main>
            </body>
        </html>
    );
}
