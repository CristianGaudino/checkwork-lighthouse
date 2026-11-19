// A Claude Code hook, on Notification (matcher "permission_prompt") and PostToolUse: notes that a session waits for your OK, so Lighthouse
// can say so at once instead of guessing from the transcript after five minutes. Writes one small file per session in
// ~/.claude/lighthouse, and nothing else. Set up in ~/.claude/settings.json, see the README.
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
try {
    const e = JSON.parse(raw);
    // Only a session id names the file, never a path from the input
    if (typeof e.session_id === 'string' && /^[\w-]{1,100}$/.test(e.session_id)) {
        const dir = join(homedir(), '.claude', 'lighthouse');
        await mkdir(dir, { recursive: true });
        // Any other event (PostToolUse, once you've said yes and the tool ran) replaces the note, so it stops counting
        const note = { type: e.hook_event_name === 'Notification' ? e.notification_type : e.hook_event_name, message: String(e.message ?? '').slice(0, 300), at: new Date().toISOString() };
        await writeFile(join(dir, `${e.session_id}.json`), JSON.stringify(note));
    }
} catch {
    // A hook that fails must never get in Claude Code's way
}
