import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// Lets `next dev` read the Worker's bindings and .dev.vars
initOpenNextCloudflareForDev();

/** First-party only: every outside call (GitHub, UptimeRobot) is made by the Worker, never the browser. */
const directives: Record<string, string> = {
    "default-src": "'self'",
    // Next's inline bootstrap scripts need 'unsafe-inline'; React's dev build uses eval
    "script-src": `'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": "'self' data:",
    "font-src": "'self'",
    "connect-src": "'self'",
    "form-action": "'self'",
    "base-uri": "'self'",
    "object-src": "'none'",
    "frame-ancestors": "'none'",
};
const csp = Object.entries(directives).map(([k, v]) => `${k} ${v.replace(/\s+/g, " ").trim()}`).join("; ");

const SECURITY_HEADERS = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: csp },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    // Private tool: never indexed
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
    // No cacheComponents / partialPrefetching: OpenNext on Cloudflare Workers can't run them yet (opennextjs-cloudflare#1450)
    poweredByHeader: false,
    images: { unoptimized: true },
    outputFileTracingExcludes: {
        "/*": ["node_modules/sharp/**", "node_modules/@img/**", "node_modules/next/dist/compiled/@vercel/og/**"],
    },
    // www is the one address; the bare domain redirects to it
    async redirects() {
        return [{ source: "/:path*", has: [{ type: "host" as const, value: "lighthouse.checkwork.ie" }], destination: "https://www.lighthouse.checkwork.ie/:path*", permanent: true }];
    },
    async headers() {
        return [{ source: "/:path*", headers: SECURITY_HEADERS }];
    },
    turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
};

export default nextConfig;
