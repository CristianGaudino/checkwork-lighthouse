import Anthropic from '@anthropic-ai/sdk';

/**
 * One Claude call for the morning brief and the incident helper. Only ever runs when the owner presses a button:
 * nothing calls this on a schedule, so there is no spend without a press.
 */
export const MODEL = 'claude-opus-5-5';

const SYSTEM = `You write for the owner and main developer of Checkwork, a small Irish web studio with a handful of live sites.
Write plain text for a phone screen: short lines, each starting with "- ", grouped under a few plain one-line headings.
No markdown symbols other than the "- " bullets. No greeting, no sign-off, no em dashes. Name the project in each line.
Use only the facts given. If something isn't in the facts, don't guess it; say what to check instead.`;

export type AskResult = { text?: string; error?: string };

export async function askClaude(prompt: string, apiKey: string): Promise<AskResult> {
    const client = new Anthropic({ apiKey });
    try {
        const res = await client.beta.messages.create({
            model: MODEL,
            max_tokens: 16000,
            output_config: { effort: 'medium' },
            // On a safety decline the API re-runs the request on a fallback model it picks, inside this same call
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system: SYSTEM,
            messages: [{ role: 'user', content: prompt }],
        });
        if (res.stop_reason === 'refusal') return { error: 'Claude declined to answer this one.' };
        const text = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
        return text ? { text } : { error: 'Claude returned nothing. Try again.' };
    } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) return { error: 'The Anthropic key was refused. Check ANTHROPIC_API_KEY.' };
        if (error instanceof Anthropic.RateLimitError) return { error: 'Rate limited by the Anthropic API. Try again in a minute.' };
        if (error instanceof Anthropic.APIError) { console.error('Claude API error', error.status, error.message); return { error: `The Claude API failed (${error.status ?? 'no status'}). Try again.` }; }
        console.error('Could not reach Claude', error);
        return { error: 'Could not reach the Claude API. Try again.' };
    }
}
