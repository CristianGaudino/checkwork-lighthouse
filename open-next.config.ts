import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No incremental cache: the one page renders fresh on every request. Add R2 (as in vintage) when something revalidates.
export default defineCloudflareConfig();
