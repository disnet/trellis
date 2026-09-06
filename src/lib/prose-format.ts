/** A small, render-safe format: paragraphs, headings, and thought references.
 * Everything else remains literal text and is escaped by Svelte. */
export type ProseBlock = { kind: 'h1' | 'h2' | 'p'; text: string };

export function proseBlocks(body: string): ProseBlock[] {
	const blocks: ProseBlock[] = [];
	let paragraph: string[] = [];
	const flush = () => {
		if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join('\n') });
		paragraph = [];
	};
	for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
		const heading = /^(#{1,2})\s+(.+)$/.exec(line);
		if (heading) {
			flush();
			blocks.push({ kind: heading[1].length === 1 ? 'h1' : 'h2', text: heading[2] });
		} else if (!line.trim()) {
			flush();
		} else {
			paragraph.push(line);
		}
	}
	flush();
	return blocks;
}

export function proseParts(text: string): string[] {
	return text.split(/(\[\[[^\[\]\r\n]+\]\]|\[[^\[\]\r\n]+\]\(<[^<>\s]+>\))/g);
}

/** Descriptions are literal display text, never HTML or navigation URLs. */
export function parseProseReference(token: string): { thoughtId: string; label?: string } | null {
	const markdown = /^\[([^\[\]\r\n]+)\]\(<([A-Za-z0-9][A-Za-z0-9._:/-]{0,127})>\)$/.exec(token);
	if (markdown) return markdown[1].trim() ? { thoughtId: markdown[2], label: markdown[1].trim() } : null;
	if (!token.startsWith('[[') || !token.endsWith(']]')) return null;
	const parts = token.slice(2, -2).split('|');
	if (parts.length > 2) return null;
	const thoughtId = parts[parts.length - 1];
	if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(thoughtId)) return null;
	if (parts.length === 1) return { thoughtId };
	const label = parts[0].trim();
	if (!label || /[\[\]\r\n]/.test(label)) return null;
	return { thoughtId, label };
}
