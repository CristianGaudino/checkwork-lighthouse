import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No incremental cache bucket yet: every page is static. Add R2 (as in vintage) when something revalidates.
export default defineCloudflareConfig();
