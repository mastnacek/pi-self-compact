/**
 * Compaction engine — executes a queued compaction via ctx.compact() and
 * delivers the note_to_self handoff back to the agent as the next prompt.
 * Pure mechanics; queueing policy lives in the tools/commands slices.
 */

import type { ExtensionContext, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SelfCompactState, PendingCompaction } from "../../shared/state.js";
import { renderContextBar } from "./context-bar.js";

function deliverHandoff(pi: ExtensionAPI, text: string): void {
	setTimeout(() => {
		try {
			pi.sendUserMessage(text);
		} catch {
			// Session closed
		}
	}, 10);
}

export async function executeCompaction(
	pi: ExtensionAPI,
	state: SelfCompactState,
	ctx: ExtensionContext,
	req: PendingCompaction,
): Promise<void> {
	state.isRunning = true;
	state.ifLive(() => {
		if (ctx.hasUI) ctx.ui.setStatus("self-compact", "compacting...");
	});

	try {
		await new Promise<void>((resolve) => {
			const customInstructions =
				req.instructions ||
				state.config.defaultCompactionPrompt ||
				"Summarize earlier conversation thoroughly, preserving file names, architectural decisions, and current goals.";

			ctx.compact({
				customInstructions,
				onComplete: (result) => {
					const after =
						result.estimatedTokensAfter !== undefined
							? `~${result.estimatedTokensAfter.toLocaleString()}`
							: "unknown";
					state.ifLive(() => {
						if (ctx.hasUI) {
							ctx.ui.notify(
								`Compacted context: ${result.tokensBefore.toLocaleString()} -> ${after} tokens.`,
								"info",
							);
						}
					});

					if (req.noteToSelf || req.resume) {
						const handoffBody = [
							`[self-compact · Handoff Note]`,
							`Context has been compacted into a summary. Memory of raw execution history is cleared.`,
							req.noteToSelf ? `\n### Note to Self:\n${req.noteToSelf}` : "",
							req.resume ? `\n### Resume Action:\n${req.resume}` : "",
							`\nProceed with the next steps outlined in your note without re-doing completed work.`,
						]
							.filter(Boolean)
							.join("\n");

						deliverHandoff(pi, handoffBody);
					}
					resolve();
				},
				onError: (error) => {
					state.ifLive(() => {
						if (ctx.hasUI) ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
					});
					resolve();
				},
			});
		});
	} finally {
		state.isRunning = false;
		updateStatus(state, ctx);
	}
}

/** Refresh the context-bar statusline for the current usage. */
export function updateStatus(state: SelfCompactState, ctx: ExtensionContext): void {
	state.ifLive(() => {
		if (!ctx.hasUI) return;
		const usage = ctx.getContextUsage();
		if (!usage || usage.percent === null) {
			ctx.ui.setStatus("self-compact", undefined);
			return;
		}
		const bar = renderContextBar(
			usage.percent,
			state.config.softPercent * 100,
			state.config.warnPercent * 100,
			state.config.forcePercent * 100,
		);
		ctx.ui.setStatus("self-compact", bar);
	});
}
