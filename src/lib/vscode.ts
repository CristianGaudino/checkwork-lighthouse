/**
 * VS Code links from the Claude Code extension's URI handler: resume a session, or start one with a prompt. With both,
 * the session opens with the prompt typed in; if it is already open in VS Code, it only comes to the front and the
 * extension says the prompt was not applied.
 */
export const resumeHref = (id: string, prompt?: string) => `vscode://anthropic.claude-code/open?${new URLSearchParams(prompt ? { session: id, prompt } : { session: id })}`;
export const askHref = (prompt: string) => `vscode://anthropic.claude-code/open?${new URLSearchParams({ prompt })}`;
