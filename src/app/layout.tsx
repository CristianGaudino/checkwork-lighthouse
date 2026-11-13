import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import '@/styles/globals.css';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
    title: { template: '%s · Lighthouse', default: 'Lighthouse' },
    description: 'Every Checkwork site, repo and release in one place.',
    robots: { index: false, follow: false },
    icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0B0F1F' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html lang="en-IE" className={`${sora.variable} ${inter.variable}`}>
            <body className="bg-canvas font-sans text-fg antialiased">
                <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-fg focus:px-4 focus:py-2 focus:text-canvas">Skip to content</a>
                <main id="main" className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">{children}</main>
            </body>
        </html>
    );
}
