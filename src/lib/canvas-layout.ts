/** Pack connected components separately; breadth-first order keep neighbors close.
	* Dimensions come from rendered cards, so reading mode and long titles are safe. */
export function layoutCanvas(
	nodes: { id: string; width: number; height: number }[],
	links: { from: string; to: string }[],
	availableWidth = 1000
): Map<string, { x: number; y: number }> {
	const positions = new Map<string, { x: number; y: number }>();
	const byId = new Map(nodes.map(n => [n.id, n]));
	const adjacent = new Map(nodes.map(n => [n.id, new Set<string>()]));
	for (const { from, to } of links) {
		if (from === to || !byId.has(from) || !byId.has(to)) continue;
		adjacent.get(from)!.add(to); adjacent.get(to)!.add(from);
	}
	const roots = nodes.map(n => n.id).sort((a, b) => adjacent.get(b)!.size - adjacent.get(a)!.size);
	const seen = new Set<string>();
	const width = Math.max(320, availableWidth - 96);
	let groupX = 48, groupY = 48, shelfHeight = 0;
	for (const root of roots) {
		if (seen.has(root)) continue;
		const queue = [root]; seen.add(root);
		for (let i = 0; i < queue.length; i++) {
			for (const next of adjacent.get(queue[i])!) {
				if (!seen.has(next)) { seen.add(next); queue.push(next); }
			}
		}
		const maxWidth = Math.max(...queue.map(id => byId.get(id)!.width));
		const columns = Math.max(1, Math.min(Math.ceil(Math.sqrt(queue.length)), Math.floor((width + 64) / (maxWidth + 64))));
		const groupWidth = columns * (maxWidth + 64) - 64;
		if (groupX > 48 && groupX + groupWidth > width + 48) {
			groupX = 48; groupY += shelfHeight + 96; shelfHeight = 0;
		}
		let x = groupX, y = groupY, rowHeight = 0;
		for (const id of queue) {
			const node = byId.get(id)!;
			if (x > groupX && x + node.width > groupX + groupWidth) { x = groupX; y += rowHeight + 48; rowHeight = 0; }
			positions.set(id, { x, y });
			x += node.width + 64; rowHeight = Math.max(rowHeight, node.height);
		}
		shelfHeight = Math.max(shelfHeight, y + rowHeight - groupY);
		groupX += groupWidth + 96;
	}
	return positions;
}
