/**
 * Pipeline — translates Pi tool_call / turn_start / agent_settled events into
 * slice operations. Barrel module; rules live in the guards slice, compaction
 * mechanics in the compaction slice.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SelfCompactState } from "../../shared/state.js";
import { checkHardCutoff } from "../guards/index.js";
import { executeCompaction, updateStatus } from "../compaction/engine.js";

export function registerPipeline(
	pi: ExtensionAPI,
	state: SelfCompactState,
): void {
	// Hard-cutoff enforcement: block non-exempt tools above forcePercent.
	state.track(
		pi.on("tool_call", async (event, ctx) => {
			const usage = ctx.getContextUsage();
			const check = checkHardCutoff(event.toolName, usage?.percent ?? null, state.config);
			if (check.blocked) return { block: true, reason: check.reason };
		}),
	);

	// Statusline refresh each turn.
	state.track(
		pi.on("turn_start", async (_event, ctx: ExtensionContext) => {
			updateStatus(state, ctx);
		}),
	);

	// Run the queued compaction once the agent settles.
	state.track(
		pi.on("agent_settled", async (_event, ctx) => {
			if (!state.pending || state.isRunning) return;
			const req = state.pending;
			state.pending = undefined;
			await executeCompaction(pi, state, ctx, req);
		}),
	);
}
