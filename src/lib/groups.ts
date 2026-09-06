// Opening a thought's group from the canvas.
//
// A thought can sit in several groups at once, so "the group" is not always a
// single answer. Double-clicking walks the ones holding it in tab order and
// then steps back out to the whole graph, so repeated double-clicks are a tour
// of a thought's memberships that always returns to where it started.

export interface CyclableGroup {
	id: string;
	name: string;
	members: string[];
}

/** The group a double-click on `thoughtId` should open, given the groups of the
 *  graph (in tab order) and the active one. `null` means the whole graph. */
export function nextGroupOf<T extends CyclableGroup>(
	groups: T[],
	thoughtId: string,
	activeGroupId: string | null
): T | null {
	const holding = groups.filter((group) => group.members.includes(thoughtId));
	const at = holding.findIndex((group) => group.id === activeGroupId);
	// Arriving from outside (or from the base canvas) opens the first group;
	// the last one in the cycle hands back to the whole graph.
	return at === -1 ? (holding[0] ?? null) : (holding[at + 1] ?? null);
}
