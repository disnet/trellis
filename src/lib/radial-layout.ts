import type { Relation, Thought } from './types';

/** Unique, deterministic one-hop neighbors. Direction and parallel relations are retained. */
export function radialNeighbors(centerId: string, thoughts: Record<string, Thought>, relations: Relation[]) {
	const grouped = new Map<string, Relation[]>();
	for (const relation of relations) {
		const id = relation.fromThoughtId === centerId ? relation.toThoughtId
			: relation.toThoughtId === centerId ? relation.fromThoughtId : null;
		if (!id || id === centerId || !thoughts[id]) continue;
		grouped.set(id, [...(grouped.get(id) ?? []), relation]);
	}
	return [...grouped].sort(([a], [b]) => thoughts[a].createdAt - thoughts[b].createdAt || a.localeCompare(b))
		.map(([id, relations]) => ({ thought: thoughts[id], relations }));
}

/** Six fixed slots keep existing neighbors still as a page fills. Coordinates are card centers. */
export function radialSlot(index: number) {
	const angle = -Math.PI / 2 + index * Math.PI / 3;
	return { x: 540 + 380 * Math.cos(angle), y: 420 + 270 * Math.sin(angle) };
}
