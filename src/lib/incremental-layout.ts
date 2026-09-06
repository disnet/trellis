export interface LayoutRect { id: string; x: number; y: number; width: number; height: number }
export interface LayoutLink { from: string; to: string }
const GAP = 32;

/** Insert near related cards, testing four directions. Only a collision chain moves;
 * unaffected cards retain exact coordinates. Each trial preserves the existing
 * ordering along its movement axis and never changes the perpendicular axis.
 *
 * `pinnedIds` name additions the person placed by hand: those keep the exact
 * coordinates they arrive with, and the map opens around them instead.
 */
export function expandLayout(existing: LayoutRect[], additions: LayoutRect[], links: LayoutLink[], fallbackIds: string[] = [], pinnedIds: string[] = []) {
	let placed = existing.map(n => ({ ...n }));
	const pending = additions.map(n => ({ ...n }));
	const pinned = new Set(pinnedIds);
	while (pending.length) {
		const ids = new Set(placed.map(n => n.id));
		const related = (id: string) => links.flatMap(l => l.from === id ? [l.to] : l.to === id ? [l.from] : []);
		const next = pending.findIndex(n => related(n.id).some(id => ids.has(id)));
		const node = pending.splice(Math.max(0, next), 1)[0];
		const keep = pinned.has(node.id);
		let anchors = placed.filter(n => related(node.id).includes(n.id));
		if (!anchors.length) anchors = placed.filter(n => fallbackIds.includes(n.id));
		// A hand-placed card needs no anchor: its own coordinates are the intent.
		if (!keep && !anchors.length) { placed.push({ ...node, ...openPosition(placed, node, node) }); continue; }
		let best: LayoutRect[] | undefined, bestScore = Infinity;
		for (const axis of ['x', 'y'] as const) for (const sign of [1, -1]) {
			const horizontal = axis === 'x';
			const project = (n: LayoutRect) => ({ id: n.id,
				u: sign * (horizontal ? n.x + n.width / 2 : n.y + n.height / 2),
				v: horizontal ? n.y + n.height / 2 : n.x + n.width / 2,
				w: horizontal ? n.width : n.height, h: horizontal ? n.height : n.width });
			const trial = placed.map(project);
			const origins = new Map(trial.map(n => [n.id, n.u]));
			const projectedAnchors = anchors.map(project);
			const fresh = project(node);
			if (!keep) {
				fresh.u = Math.max(...projectedAnchors.map(n => n.u + n.w / 2)) + GAP + fresh.w / 2;
				fresh.v = projectedAnchors.reduce((sum, n) => sum + n.v, 0) / projectedAnchors.length;
			}
			trial.push(fresh);
			const queue = [fresh];
			let steps = 0;
			while (queue.length && steps++ < trial.length * trial.length * 4) {
				const a = queue.shift()!;
				for (const b of trial) {
					if (a === b || Math.abs(a.v - b.v) >= (a.h + b.h) / 2 + GAP - .01 ||
						Math.abs(a.u - b.u) >= (a.w + b.w) / 2 + GAP - .01) continue;
					// The new card opens the gap; existing cards keep their prior order.
					let before = a, after = b;
					if (b === fresh || (a !== fresh && (origins.get(a.id)! > origins.get(b.id)! ||
						(origins.get(a.id) === origins.get(b.id) && a.id > b.id)))) { before = b; after = a; }
					after.u = before.u + (before.w + after.w) / 2 + GAP;
					if (!queue.includes(after)) queue.push(after);
				}
			}
			if (queue.length) continue;
			const result = trial.map((n, i) => ({ ...(i < placed.length ? placed[i] : node),
				x: horizontal ? sign * n.u - n.w / 2 : n.v - n.h / 2,
				y: horizontal ? n.v - n.h / 2 : sign * n.u - n.w / 2 }));
			let score = 0;
			for (let i = 0; i < placed.length; i++) {
				const distance = Math.hypot(result[i].x - placed[i].x, result[i].y - placed[i].y);
				score += distance * distance + (distance > .01 ? 2000 : 0);
			}
			const newRect = result.at(-1)!;
			for (const anchor of anchors) {
				const updated = result.find(n => n.id === anchor.id)!;
				score += .1 * ((newRect.x - updated.x) ** 2 + (newRect.y - updated.y) ** 2);
			}
			if (score < bestScore) { best = result; bestScore = score; }
		}
		// Defensive fallback for pathological pre-existing overlaps: always terminate.
		placed = best ?? [...placed, keep ? { ...node } : { ...node, ...openPosition(placed, node, node) }];
	}
	return new Map(placed.map(n => [n.id, { x: n.x, y: n.y }]));
}

/** Collision-free staging, including variable sizes and every pending batch. */
export function openPosition(taken: LayoutRect[], size: { width: number; height: number }, near: { x: number; y: number }) {
	const overlaps = (x: number, y: number) => taken.some(n => x < n.x + n.width + GAP && x + size.width + GAP > n.x && y < n.y + n.height + GAP && y + size.height + GAP > n.y);
	for (let ring = 0; ring < 12; ring++) {
		for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
			const x = near.x + dx * (size.width + GAP), y = near.y + dy * (size.height + GAP);
			if (!overlaps(x, y)) return { x, y };
		}
	}
	return { x: Math.max(near.x, ...taken.map(n => n.x + n.width + GAP)), y: near.y };
}
