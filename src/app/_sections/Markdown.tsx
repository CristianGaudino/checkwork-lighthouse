import { Fragment } from 'react';

/**
 * Just enough Markdown for Claude's replies: code blocks, inline code, bold, headings, lists and links, as React
 * nodes, never as HTML from the text. Anything else shows as written.
 */

function inline(text: string, key: string) {
    // `code`, **bold**, [label](https://…): links only to http(s), opened in a new tab
    const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g);
    return parts.map((p, i) => {
        const k = `${key}-${i}`;
        if (/^`[^`]+`$/.test(p)) return <code key={k} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.9em]">{p.slice(1, -1)}</code>;
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={k} className="font-semibold">{p.slice(2, -2)}</strong>;
        const link = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
        if (link) return <a key={k} href={link[2]} target="_blank" rel="noreferrer" className="underline underline-offset-4">{link[1]}</a>;
        return <Fragment key={k}>{p}</Fragment>;
    });
}

const ITEM = /^\s*([-*]|\d+\.)\s+/;

/** A run of text between code blocks: headings, list items grouped into lists, and paragraphs split by blank lines. */
function prose(text: string, key: string) {
    type Group = { kind: 'p' | 'ul' | 'ol' | 'h'; lines: string[] };
    const groups: Group[] = [];
    for (const line of text.split('\n')) {
        const last = groups.at(-1);
        if (!line.trim()) { groups.push({ kind: 'p', lines: [] }); continue; }
        if (/^#{1,4}\s/.test(line)) { groups.push({ kind: 'h', lines: [line.replace(/^#{1,4}\s+/, '')] }); continue; }
        const item = line.match(ITEM);
        const kind = item ? (/\d/.test(item[1]) ? 'ol' : 'ul') : 'p';
        if (last && last.kind === kind && (kind !== 'p' || last.lines.length)) last.lines.push(line);
        else groups.push({ kind, lines: [line] });
    }
    return groups.filter(g => g.lines.length).map((g, i) => {
        const k = `${key}-${i}`;
        if (g.kind === 'h') return <p key={k} className="font-semibold">{inline(g.lines[0], k)}</p>;
        if (g.kind === 'p') return <p key={k} className="whitespace-pre-wrap">{inline(g.lines.join('\n'), k)}</p>;
        const List = g.kind;
        return <List key={k} className={`grid gap-1 pl-5 ${g.kind === 'ol' ? 'list-decimal' : 'list-disc'}`}>{g.lines.map((l, j) => <li key={j}>{inline(l.replace(ITEM, ''), `${k}-${j}`)}</li>)}</List>;
    });
}

export function Markdown({ text }: { text: string }) {
    const blocks = text.split(/^```[^\n]*\n?/m);
    return (
        // wrap-anywhere: a long path or address breaks rather than pushing the page sideways
        <div className="grid min-w-0 gap-3 leading-relaxed wrap-anywhere">
            {blocks.map((block, i) => (i % 2
                // Odd pieces sit between ``` fences
                ? <pre key={i} className="overflow-x-auto rounded-xl bg-surface px-4 py-3 font-mono text-[13px] leading-snug wrap-normal">{block.replace(/\n$/, '')}</pre>
                : <Fragment key={i}>{prose(block, String(i))}</Fragment>))}
        </div>
    );
}
