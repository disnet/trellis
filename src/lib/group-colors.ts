// Identity colors for groups (working sets), assigned by creation order so a
// group keeps its color for as long as it exists. A categorical palette with
// wide hue separation — the semantic ink tokens are too muted to tell apart in
// a 2–3px ring. Pure blue is reserved for selection.
const GROUP_COLORS = [
	'#4a8f42', // green
	'#7a5bd6', // purple
	'#e07b28', // orange
	'#1d9e8f', // teal
	'#c9418f', // magenta
	'#c29a10', // gold
	'#d8442e', // red
	'#8a6444' // brown
];

export function groupColor(index: number): string {
	return GROUP_COLORS[index % GROUP_COLORS.length];
}
