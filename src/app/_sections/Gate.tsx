import { Suspense } from 'react';
import { requireAdmin } from '@/lib/access';
import { Bone } from './ui';

/**
 * Every page's frame: the login check first, then a page-shaped placeholder while the page's data comes in (GitHub,
 * Cloudflare and the rest can take a few seconds when nothing is remembered yet), so a click shows something at once.
 * Not a loading.tsx: that would start the answer before the check, and a refused page would say 200 instead of 404.
 */
export async function Gate({ children }: { children: React.ReactNode }) {
    await requireAdmin();
    return <Suspense fallback={<PageBones />}>{children}</Suspense>;
}

/** The shape of a page: its title line, then panels of rows. */
export function PageBones() {
    return (
        <div role="status" aria-label="Loading">
            <Bone className="h-9 w-64 max-w-full sm:h-10" />
            <Bone className="mt-3 h-4 w-40" />
            {[5, 3].map((rows, s) => (
                <div key={s} className="mt-12">
                    <Bone className="h-5 w-28" />
                    <div className="mt-3 divide-y divide-line rounded-2xl border border-line">
                        {Array.from({ length: rows }, (_, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3">
                                <Bone className="size-5 rounded-full" />
                                <Bone className={`h-4 ${['w-1/3', 'w-1/2', 'w-2/5'][i % 3]}`} />
                                <Bone className="ml-auto h-4 w-16" />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
