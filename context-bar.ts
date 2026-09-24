/**
 * 20-cell visual context bar renderer.
 *
 * Cell i represents a 5% slice of the context window.
 * '#' denotes used tokens.
 * '-' denotes free tokens.
 * '~' soft notice marker
 * '!' warning marker
 * '|' force cutoff marker
 */
export function renderContextBar(
	percent: number,
	softPct: number,
	warnPct: number,
	forcePct: number,
): string {
	const totalCells = 20;
	const usedCells = Math.min(totalCells, Math.max(0, Math.round((percent / 100) * totalCells)));

	const softIdx = Math.min(totalCells - 1, Math.floor((softPct / 100) * totalCells));
	const warnIdx = Math.min(totalCells - 1, Math.floor((warnPct / 100) * totalCells));
	const forceIdx = Math.min(totalCells - 1, Math.floor((forcePct / 100) * totalCells));

	const cells: string[] = [];
	for (let i = 0; i < totalCells; i++) {
		if (i === forceIdx) {
			cells.push("|");
		} else if (i === warnIdx) {
			cells.push("!");
		} else if (i === softIdx) {
			cells.push("~");
		} else if (i < usedCells) {
			cells.push("#");
		} else {
			cells.push("-");
		}
	}

	return `[${cells.join("")}] ${Math.round(percent)}%`;
}
