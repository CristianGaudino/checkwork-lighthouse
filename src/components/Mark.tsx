/** The Checkwork check mark. Pass a unique `id` when several sit on one page (gradient ids must differ). */
export function Mark({ id = 'mk', className }: { id?: string; className?: string }) {
    return (
        <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={`g-${id}`} x1="24" y1="54" x2="58" y2="10" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#6366F1" />
                    <stop offset="1" stopColor="#A78BFA" />
                </linearGradient>
            </defs>
            <path d="M4.00 31.28 L18.75 45.73 L25.32 38.09 L10.88 23.94 Z" fill="#6366F1" />
            <path d="M20.21 47.17 L27.41 54.23 L60.00 16.36 L52.39 9.77 Z" fill={`url(#g-${id})`} />
        </svg>
    );
}
